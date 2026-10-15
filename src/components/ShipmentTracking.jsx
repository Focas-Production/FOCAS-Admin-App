import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'

// Admin view of one Delhivery shipment.
//
// Delhivery records 25–60 scans per parcel ("Added to Bag", "Vehicle Departed"…).
// This turns them into what an admin actually needs to know:
//   1. where the parcel is / how it ended (status header)
//   2. key dates — booked, picked up, promised, delivered/returned
//   3. anything that went wrong (non-routine scans: on hold, missing in audit…)
//   4. the journey, one row per place, split into delivery trip and return trip;
//      every row opens to its raw scans, so nothing is hidden.
//
// On open it pulls the courier's full record via /delivery/timeline/:awb (the
// server caches it, so this doesn't hit Delhivery on every open).

const TERMINAL_STATUSES = ['Delivered', 'RTO Delivered', 'Returned', 'DTO', 'Cancelled', 'Lost', 'LOST']
const DELHIVERY_URL = (awb) => `https://one.delhivery.com/v2/shipments/forward/${encodeURIComponent(awb)}`

// Scans that are plain logistics. Anything else Delhivery writes ("On hold.
// Destination unable to receive", "Package Missing in Audit", "Consignee
// refused"…) is an exception worth surfacing.
const ROUTINE = /^(manifest uploaded|pickup scheduled|shipment picked up|shipment rec(ie|ei)ved at origin cent(er|re)|added to bag|bag added to trip|bag removed|vehicle departed|trip arrived|bag received at facility|shipment received at facility|weight captured|center changed by system|status changed|out for delivery|dispatched for rto|return accepted|delivered.*)$/i
const isNotable = (s) => !!s.instructions && !ROUTINE.test(s.instructions.trim())

// Delhivery facility codes at the end of a location name.
const FACILITY = { D: 'Delivery centre', DC: 'Delivery centre', GW: 'Gateway hub', H: 'Hub', HB: 'Hub', C: 'Collection centre', CC: 'Collection centre', PC: 'Processing centre' }

// "Chennai_Mylapore_D (Tamil Nadu)" → { name: "Chennai Mylapore", state: "Tamil Nadu", facility: "Delivery centre", code: "D" }
function readLocation(raw) {
  if (!raw) return { name: '', state: '', facility: '', code: '' }
  const m = String(raw).match(/^(.*?)\s*\(([^)]*)\)\s*$/)
  const base  = (m ? m[1] : raw).trim()
  const parts = base.split('_').filter(Boolean)
  const tail  = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : ''
  const code  = FACILITY[tail] ? tail : ''
  return { name: (code ? parts.slice(0, -1) : parts).join(' '), state: m ? m[2].trim() : '', facility: FACILITY[code] || '', code }
}

// ─── Formatting ──────────────────────────────────────────────────────────────

// Rows saved by the old webhook code had no IST offset, so their clock time is
// unreliable — show only the date for them. Synced rows carry statusType.
const hasReliableTime = (h) => h.statusType !== undefined

const fmtDay   = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
const fmtTime  = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
const fmtStamp = (d, timed = true) => (timed ? `${fmtDay(d)}, ${fmtTime(d)}` : fmtDay(d))
const DAY = 24 * 60 * 60 * 1000

function fmtSpan(ms) {
  const h = Math.round(ms / (60 * 60 * 1000))
  if (h < 1)  return 'under an hour'
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'}`
  const d = Math.round(ms / DAY)
  return `${d} day${d === 1 ? '' : 's'}`
}

function fmtAgo(d) {
  const ms = Date.now() - new Date(d).getTime()
  if (ms < 60 * 1000) return 'just now'
  if (ms < 60 * 60 * 1000) return `${Math.round(ms / 60000)} min ago`
  if (ms < DAY) return `${Math.round(ms / 3600000)} hr ago`
  return fmtSpan(ms) + ' ago'
}

// ─── Model ───────────────────────────────────────────────────────────────────

// One row per stop: consecutive scans on the same trip, at the same place, of
// the same kind. Milestones (booked / out for delivery / delivered) get their
// own row even at the same place, so they read as events.
function kindOf(s, afterDispatch) {
  if (s.status === 'Manifested') return 'booked'
  if (s.status === 'Not Picked') return 'notpicked'   // Delhivery never received it from us
  if (s.status === 'Dispatched') return 'out'
  if (s.status === 'Delivered' || s.status === 'RTO Delivered' || s.status === 'Returned') return 'done'
  if (s.status === 'RTO' && s.statusType === 'DL') return 'done'
  if (s.status === 'Pending' && afterDispatch) return 'failed'
  return 'move'
}

function stopLabel(st, prev) {
  const ret = st.trip === 'return'
  switch (st.kind) {
    case 'booked': return 'Booked with courier'
    case 'out':    return ret ? 'Out for return delivery' : 'Out for delivery'
    case 'failed': return 'Delivery attempt failed'
    case 'notpicked': return 'Not picked up'
    case 'done':   return ret ? 'Return accepted' : 'Delivered'
    default: {
      if (!ret && (!prev || prev.kind === 'booked')) return 'Picked up'
      if (ret && (!prev || prev.trip !== 'return')) return 'Return started'
      if (['D', 'DC'].includes(st.loc.code)) return 'At delivery centre'
      if (['C', 'CC'].includes(st.loc.code)) return 'At collection centre'
      return 'Passed through hub'
    }
  }
}

function buildModel(shipment) {
  const scans = (shipment.statusHistory || [])
    .filter((h) => h && h.timestamp && h.status)
    .map((h, i) => ({ ...h, at: new Date(h.timestamp), i }))
    .filter((h) => !Number.isNaN(h.at.getTime()))
    .sort((a, b) => a.at - b.at || a.i - b.i)

  let afterDispatch = false
  const stops = []
  for (const s of scans) {
    s.trip    = s.statusType === 'RT' || /^RTO/.test(s.status) ? 'return' : 'delivery'
    s.kind    = kindOf(s, afterDispatch)
    s.notable = isNotable(s)
    if (s.status === 'Dispatched') afterDispatch = true
    else if (s.kind !== 'failed') afterDispatch = false

    const prev = stops[stops.length - 1]
    if (prev && prev.trip === s.trip && prev.location === (s.location || '') && prev.kind === s.kind) {
      prev.scans.push(s)
      continue
    }
    stops.push({ trip: s.trip, kind: s.kind, location: s.location || '', scans: [s] })
  }

  stops.forEach((st) => {
    st.first = st.scans[0].at
    st.last  = st.scans[st.scans.length - 1].at
  })
  stops.forEach((st, i) => {
    st.timed   = st.scans.every(hasReliableTime)
    st.loc     = readLocation(st.location)
    st.notable = st.scans.filter((s) => s.notable)
    st.key     = `${st.trip}|${st.location}|${st.kind}|${st.first.getTime()}`
    // Time spent here = until the next stop's first scan.
    st.dwell   = stops[i + 1] ? stops[i + 1].first - st.first : null
    st.label   = stopLabel(st, stops[i - 1])
  })

  const delivery = stops.filter((s) => s.trip === 'delivery')
  const ret      = stops.filter((s) => s.trip === 'return')
  const current  = shipment.trackingStatus || scans[scans.length - 1]?.status || ''
  const lastScan = scans[scans.length - 1]

  let state = 'booked'
  if (current === 'Delivered') state = 'delivered'
  else if (['RTO Delivered', 'Returned', 'DTO'].includes(current) || (current === 'RTO' && lastScan?.statusType === 'DL')) state = 'returned'
  else if (ret.length || current === 'RTO') state = 'returning'
  else if (['Lost', 'LOST'].includes(current)) state = 'lost'
  else if (current === 'Not Picked') state = 'notpicked'
  else if (current === 'Cancelled') state = 'cancelled'
  else if (current === 'Dispatched') state = 'out'
  else if (['In Transit', 'Pending'].includes(current) || delivery.some((s) => s.kind === 'move')) state = 'transit'

  const comingBack = state === 'returned' || state === 'returning'
  const attempts = delivery.filter((s) => s.kind === 'out').length
  // Why it came back: the last unusual scan on the delivery trip.
  const returnReason = comingBack
    ? ([...delivery].reverse().flatMap((s) => [...s.notable].reverse())[0]?.instructions || '').replace(/^returned\.\s*/i, '')
    : ''

  // Same rule as the server's reship check: the parcel failed. A "Pending" only
  // counts right after a failed delivery attempt (otherwise it's just arrival).
  const lastStop  = stops[stops.length - 1]
  const failedAttempt = current === 'Pending' && lastStop?.kind === 'failed'
  const canReship = ['returned', 'returning', 'lost', 'cancelled', 'notpicked'].includes(state) || failedAttempt
  // Delhivery may still deliver / pick up the old parcel — must be cancelled first.
  const oldStillActive = !ret.length && (current === 'Not Picked' || failedAttempt)

  return {
    scans, stops, delivery, ret, current, state, attempts, returnReason, lastScan, canReship, oldStillActive,
    exceptions: scans.filter((s) => s.notable),
    bookedAt:   scans[0]?.at || null,
    pickedAt:   delivery.find((s) => s.kind === 'move')?.first || null,   // first real movement scan
    deliveredAt: state === 'delivered' ? (delivery.find((s) => s.kind === 'done')?.last || lastScan?.at || null) : null,
    returnStartedAt: ret[0]?.first || (shipment.courier?.rtoStartedAt ? new Date(shipment.courier.rtoStartedAt) : null),
    returnedAt: state === 'returned' ? (ret.find((s) => s.kind === 'done')?.last || lastScan?.at || null) : null,
  }
}

// ─── Visual pieces ───────────────────────────────────────────────────────────

const HERO = {
  delivered: { title: 'Delivered',           tone: 'emerald', icon: 'check' },
  returned:  { title: 'Returned to sender',  tone: 'rose',    icon: 'back' },
  returning: { title: 'Returning to sender', tone: 'amber',   icon: 'back' },
  lost:      { title: 'Lost in transit',     tone: 'rose',    icon: 'alert' },
  notpicked: { title: 'Not picked up',       tone: 'rose',    icon: 'x' },
  cancelled: { title: 'Cancelled',           tone: 'gray',    icon: 'x' },
  out:       { title: 'Out for delivery',    tone: 'indigo',  icon: 'truck' },
  transit:   { title: 'In transit',          tone: 'indigo',  icon: 'truck' },
  booked:    { title: 'Awaiting pickup',     tone: 'gray',    icon: 'box' },
}
const TONE = {
  emerald: { box: 'bg-emerald-50 ring-emerald-200', icon: 'bg-emerald-600', title: 'text-emerald-900', sub: 'text-emerald-800' },
  rose:    { box: 'bg-rose-50 ring-rose-200',       icon: 'bg-rose-600',    title: 'text-rose-900',    sub: 'text-rose-800' },
  amber:   { box: 'bg-amber-50 ring-amber-200',     icon: 'bg-amber-500',   title: 'text-amber-900',   sub: 'text-amber-800' },
  indigo:  { box: 'bg-indigo-50 ring-indigo-200',   icon: 'bg-indigo-600',  title: 'text-indigo-900',  sub: 'text-indigo-800' },
  gray:    { box: 'bg-gray-100 ring-gray-200',      icon: 'bg-gray-500',    title: 'text-gray-900',    sub: 'text-gray-600' },
}

const PATHS = {
  check: 'M5 12l5 5L20 7',
  x:     'M6 6l12 12M18 6L6 18',
  truck: 'M3 6h11v9H3zM14 9h4l3 3v3h-7zM7 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  back:  'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  box:   'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  copy:  'M9 9h11v11H9zM5 15H4V4h11v1',
  ext:   'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  chev:  'M9 6l6 6-6 6',
}
function Icon({ name, className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

function AwbBar({ awb }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(awb)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — the number is selectable anyway */ }
  }
  const btn = 'inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50'
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-gray-400">Delhivery AWB</p>
        <p className="font-mono text-sm text-gray-900 select-all">{awb}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={copy} title="Copy AWB" className={btn}>
          <Icon name={copied ? 'check' : 'copy'} className="w-3.5 h-3.5" />{copied ? 'Copied' : 'Copy'}
        </button>
        <a href={DELHIVERY_URL(awb)} target="_blank" rel="noopener noreferrer" className={btn}>
          Delhivery <Icon name="ext" className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  )
}

function Hero({ m, shipment }) {
  const h = HERO[m.state]
  const t = TONE[h.tone]
  const loc = readLocation(shipment.trackingLocation || m.lastScan?.location)
  const where = loc.name ? `${loc.name}${loc.facility ? ` ${loc.facility.toLowerCase()}` : ''}` : ''

  let sub = ''
  if (m.state === 'delivered' && m.deliveredAt)    sub = `${fmtStamp(m.deliveredAt)}${where ? ` · ${where}` : ''}`
  else if (m.state === 'returned' && m.returnedAt) sub = `Accepted back ${fmtStamp(m.returnedAt)}${where ? ` · ${where}` : ''}`
  else if (m.state === 'notpicked' && m.lastScan) sub = `Delhivery never received this parcel${m.lastScan.instructions ? ` — “${m.lastScan.instructions}”` : ''} · ${fmtDay(m.lastScan.at)}`
  else if (m.lastScan)                             sub = `Last update ${fmtAgo(m.lastScan.at)}${where ? ` · ${where}` : ''}`

  return (
    <div className={`rounded-xl ring-1 ${t.box} p-4`}>
      <div className="flex items-start gap-3">
        <span className={`flex-shrink-0 w-9 h-9 rounded-full ${t.icon} text-white flex items-center justify-center`}>
          <Icon name={h.icon} className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-base font-semibold leading-tight ${t.title}`}>{h.title}</p>
          {sub && <p className={`text-xs mt-1 ${t.sub}`}>{sub}</p>}
          {m.returnReason && (
            <p className={`text-xs mt-1 ${t.sub}`}><span className="font-semibold">Reason:</span> {m.returnReason}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Route({ shipment, m, destination }) {
  const origin = readLocation(shipment.courier?.origin || m.delivery[0]?.location).name
  const dest = destination?.city || shipment.courier?.destination
    || readLocation([...m.delivery].reverse().find((s) => ['D', 'DC'].includes(s.loc.code))?.location).name
  if (!origin && !dest) return null
  const pin = destination?.pincode || shipment.courier?.destinationPin
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-gray-400">From</p>
        <p className="truncate text-gray-800 font-medium">{origin || '—'}</p>
      </div>
      <span className="flex-1 border-t border-dashed border-gray-300" />
      <Icon name="truck" className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <span className="flex-1 border-t border-dashed border-gray-300" />
      <div className="min-w-0 text-right">
        <p className="text-[11px] uppercase tracking-wider text-gray-400">To</p>
        <p className="truncate text-gray-800 font-medium">{dest || '—'}{pin && <span className="text-gray-500 font-normal"> · {pin}</span>}</p>
      </div>
    </div>
  )
}

// Circles + connecting lines. `failedAt` marks a step that will never be reached.
function Stepper({ steps, reached, color, failedAt = -1, failedLabel = 'Not delivered' }) {
  return (
    <ol className="flex items-start">
      {steps.map((s, i) => {
        const done   = i <= reached
        const failed = i === failedAt
        return (
          <li key={s} className="flex-1 flex flex-col items-center relative">
            {i > 0 && <span className={`absolute top-2.5 right-1/2 w-full h-0.5 ${i <= reached ? color : 'bg-gray-200'}`} />}
            <span className={`relative w-5 h-5 rounded-full flex items-center justify-center text-white ${
              failed ? 'bg-rose-500' : done ? color : 'bg-white ring-2 ring-inset ring-gray-200'}`}>
              {failed ? <Icon name="x" className="w-3 h-3" /> : done ? <Icon name="check" className="w-3 h-3" /> : null}
            </span>
            <span className={`mt-1.5 text-[11px] text-center leading-tight px-0.5 ${
              failed ? 'text-rose-600 font-medium' : i === reached ? 'text-gray-900 font-semibold' : done ? 'text-gray-600' : 'text-gray-400'}`}>
              {failed ? failedLabel : s}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Progress({ m }) {
  let reached = 0
  if (m.pickedAt) reached = 1
  if (m.delivery.filter((s) => s.kind === 'move').length > 1) reached = 2
  if (m.delivery.some((s) => s.kind === 'out')) reached = 3
  if (m.state === 'delivered') reached = 4
  const failed = m.ret.length > 0 || ['returned', 'returning', 'lost', 'cancelled'].includes(m.state)
  const notPicked = m.state === 'notpicked'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div>
        {m.ret.length > 0 && <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">Delivery</p>}
        <Stepper steps={['Booked', 'Picked up', 'In transit', 'Out for delivery', 'Delivered']}
          reached={notPicked ? 0 : reached} color={m.state === 'delivered' ? 'bg-emerald-600' : 'bg-indigo-600'}
          failedAt={notPicked ? 1 : failed ? 4 : -1} failedLabel={notPicked ? 'Not picked up' : 'Not delivered'} />
      </div>
      {m.ret.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">Return</p>
          <Stepper steps={['Return started', 'In transit', 'Out for return', 'Back with us']}
            reached={m.state === 'returned' ? 3 : m.ret.some((s) => s.kind === 'out') ? 2 : m.ret.length > 1 ? 1 : 0}
            color="bg-amber-500" />
        </div>
      )}
    </div>
  )
}

function Fact({ label, value, note, noteTone = 'text-gray-500' }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 mt-0.5">{value || '—'}</dd>
      {note && <dd className={`text-[11px] mt-0.5 ${noteTone}`}>{note}</dd>}
    </div>
  )
}

function Facts({ m, shipment }) {
  const promised   = shipment.courier?.promisedDeliveryAt || shipment.expectedDeliveryAt
  const promisedAt = promised ? new Date(promised) : null
  // Promise dates mean "by the end of that day".
  const deadline = promisedAt ? new Date(promisedAt.getFullYear(), promisedAt.getMonth(), promisedAt.getDate(), 23, 59, 59) : null
  const comingBack = ['returned', 'returning'].includes(m.state)

  let promiseNote = null, promiseTone = 'text-gray-500'
  if (deadline) {
    if (m.deliveredAt) {
      const late = m.deliveredAt - deadline
      promiseNote = late > 0 ? `Late by ${fmtSpan(late)}` : 'On time'
      promiseTone = late > 0 ? 'text-rose-600' : 'text-emerald-600'
    } else if (comingBack) {
      promiseNote = 'Missed — sent back'
      promiseTone = 'text-rose-600'
    } else if (!['lost', 'cancelled', 'notpicked'].includes(m.state) && Date.now() > deadline) {
      promiseNote = `Overdue by ${fmtSpan(Date.now() - deadline)}`
      promiseTone = 'text-rose-600'
    }
  }

  const end = m.deliveredAt || m.returnedAt || null
  return (
    <dl className="grid grid-cols-3 gap-x-4 gap-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <Fact label="Booked"      value={m.bookedAt && fmtDay(m.bookedAt)} />
      <Fact label="Picked up"   value={m.pickedAt && fmtDay(m.pickedAt)} />
      <Fact label="Promised by" value={promisedAt && fmtDay(promisedAt)} note={promiseNote} noteTone={promiseTone} />
      <Fact label="Attempts"    value={String(m.attempts)}
        note={m.attempts === 0 && comingBack ? 'Never sent out for delivery' : null} noteTone="text-rose-600" />
      {m.returnStartedAt
        ? <Fact label="Return started" value={fmtDay(m.returnStartedAt)} />
        : <Fact label="Delivered" value={m.deliveredAt && fmtDay(m.deliveredAt)} />}
      <Fact label={end ? 'Total time' : 'Time so far'} value={m.bookedAt && fmtSpan((end || new Date()) - m.bookedAt)}
        note={m.returnedAt ? `Back with us ${fmtDay(m.returnedAt)}` : null} />
    </dl>
  )
}

function Exceptions({ m }) {
  const [open, setOpen] = useState(false)
  const [all, setAll]   = useState(false)
  if (!m.exceptions.length) return null
  const list  = [...m.exceptions].reverse()
  const shown = all ? list : list.slice(0, 4)
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50">
      {/* Closed by default — the header still says how many there are. */}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left group">
        <span className="flex items-center gap-2 min-w-0">
          <Icon name="chev" className={`w-4 h-4 text-amber-600 transition-transform ${open ? 'rotate-90' : ''}`} />
          <Icon name="alert" className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <span className="text-sm font-semibold text-amber-900">Exceptions</span>
          <span className="text-xs text-amber-700">({m.exceptions.length})</span>
        </span>
        <span className="text-xs font-medium text-amber-800 group-hover:text-amber-950 whitespace-nowrap">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
      <div className="px-4 pb-4">
      <ul className="space-y-1.5">
        {shown.map((s, i) => (
          <li key={`${s.at.getTime()}-${i}`} className="flex gap-3 text-xs">
            <span className="w-28 flex-shrink-0 whitespace-nowrap text-amber-700 tabular-nums">{fmtStamp(s.at, hasReliableTime(s))}</span>
            <span className="min-w-0 text-amber-950">
              {s.instructions}
              {s.location && <span className="text-amber-700"> · {readLocation(s.location).name}</span>}
            </span>
          </li>
        ))}
      </ul>
      {list.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-medium text-amber-800 hover:text-amber-950">
          {all ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
      </div>
      )}
    </div>
  )
}

function Stop({ st, isTop, isLast, open, onToggle, accent }) {
  const n = st.scans.length
  const milestone = st.kind !== 'move'
  const dot =
    st.kind === 'failed' || st.kind === 'notpicked' ? 'bg-rose-500'
    : st.kind === 'done' ? (st.trip === 'return' ? 'bg-amber-500' : 'bg-emerald-500')
    : isTop ? accent
    : milestone ? 'bg-gray-500' : 'bg-gray-300'
  const longStay = st.kind === 'move' && st.dwell != null && st.dwell >= 3 * DAY

  return (
    <li className="relative flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0 w-3">
        <span className={`rounded-full ${dot} ${isTop || milestone ? 'w-3 h-3 mt-2' : 'w-2 h-2 mt-2.5'} ${isTop ? 'ring-4 ring-gray-100' : ''}`} />
        {!isLast && <span className="flex-1 w-px bg-gray-200 mt-1" />}
      </div>
      <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-2'}`}>
        <button type="button" onClick={onToggle} aria-expanded={open}
          className="w-full text-left rounded-md -mx-1.5 px-1.5 py-1 hover:bg-gray-50 group">
          <div className="flex items-baseline justify-between gap-3">
            <p className={`text-sm ${st.kind === 'failed' || st.kind === 'notpicked' ? 'font-semibold text-rose-700' : milestone || isTop ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
              {st.label}
            </p>
            <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">{fmtStamp(st.last, st.timed)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 mt-0.5">
            <p className="text-xs text-gray-500 truncate" title={st.location}>
              {st.loc.name || '—'}{st.loc.facility && <span className="text-gray-400"> · {st.loc.facility}</span>}
            </p>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              {st.notable.length > 0 && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  {st.notable.length} exception{st.notable.length === 1 ? '' : 's'}
                </span>
              )}
              {longStay && (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">Held {fmtSpan(st.dwell)}</span>
              )}
              <span className="inline-flex items-center text-[11px] text-gray-400 group-hover:text-gray-600">
                {n} scan{n === 1 ? '' : 's'}
                <Icon name="chev" className={`w-3 h-3 ml-0.5 transition-transform ${open ? 'rotate-90' : ''}`} />
              </span>
            </span>
          </div>
        </button>

        {open && (
          <ul className="mt-1 mb-1 rounded-lg border border-gray-200 bg-gray-50 divide-y divide-gray-100 overflow-hidden">
            {[...st.scans].reverse().map((s, i) => (
              <li key={`${s.at.getTime()}-${i}`} className={`flex gap-3 px-3 py-1.5 text-xs ${s.notable ? 'bg-amber-50' : ''}`}>
                <span className="w-28 flex-shrink-0 whitespace-nowrap text-gray-400 tabular-nums">{fmtStamp(s.at, hasReliableTime(s))}</span>
                <span className={`min-w-0 ${s.notable ? 'font-medium text-amber-900' : 'text-gray-700'}`}>{s.instructions || s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

function Trip({ title, stops, accent, topKey, isOpen, onToggle }) {
  if (!stops.length) return null
  const rows  = [...stops].reverse()
  const scans = stops.reduce((s, st) => s + st.scans.length, 0)
  return (
    <section>
      <div className="flex items-baseline justify-between mb-1.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</h4>
        <span className="text-[11px] text-gray-400">{fmtDay(stops[0].first)} – {fmtDay(stops[stops.length - 1].last)} · {scans} scans</span>
      </div>
      <ol>
        {rows.map((st, i) => (
          <Stop key={st.key} st={st} accent={accent}
            isTop={st.key === topKey} isLast={i === rows.length - 1}
            open={isOpen(st.key)} onToggle={() => onToggle(st.key)} />
        ))}
      </ol>
    </section>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

// Props:
//   shipment      the shipment to show (live or an earlier, reshipped one)
//   renderActions (m, shipment) => node — e.g. the order page's "Send a new parcel" button
//   destination   { city, pincode } from the order's address — Delhivery's own
//                 "Destination" is often a centre name (e.g. "Ceylon Hostage Camp")
export default function ShipmentTracking({ shipment: initial, renderActions, destination }) {
  const awb = initial?.awb
  const [shipment, setShipment] = useState(initial)
  const [sync, setSync]         = useState('loading')   // loading | ok | stale | error
  const [openSet, setOpenSet]   = useState(() => new Set())
  const [allOpen, setAllOpen]   = useState(false)
  const [journeyOpen, setJourneyOpen] = useState(false)

  const load = useCallback(async (force) => {
    if (!awb) return
    setSync('loading')
    try {
      const { data } = await api.get(`/delivery/timeline/${encodeURIComponent(awb)}${force ? '?refresh=1' : ''}`)
      if (data.shipment) setShipment(data.shipment)
      setSync(data.notFound ? 'notfound' : data.stale ? 'stale' : 'ok')
    } catch {
      setSync('error')
    }
  }, [awb])

  useEffect(() => { load(false) }, [load])

  if (!shipment) return null
  const m = buildModel(shipment)
  const topKey = m.stops[m.stops.length - 1]?.key

  const isOpen = (k) => allOpen || openSet.has(k)
  const toggle = (k) => {
    if (allOpen) {
      // Leaving "expand all": keep every stop open except the one clicked.
      setAllOpen(false)
      setOpenSet(new Set(m.stops.map((s) => s.key).filter((x) => x !== k)))
      return
    }
    setOpenSet((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const finished = TERMINAL_STATUSES.includes(shipment.trackingStatus) || m.state === 'returned'
  const accent = m.state === 'delivered' ? 'bg-emerald-500' : m.ret.length ? 'bg-amber-500' : 'bg-indigo-500'

  return (
    <div className="space-y-3 text-sm">
      {awb && <AwbBar awb={awb} />}

      {m.scans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-xs text-gray-500">
          {sync === 'loading' ? 'Loading tracking from Delhivery…' : 'No tracking updates from the courier yet.'}
        </div>
      ) : (
        <>
          <Hero m={m} shipment={shipment} />
          <div className="px-1"><Route m={m} shipment={shipment} destination={destination} /></div>
          <Progress m={m} />
          {renderActions && renderActions(m, shipment)}
          <Facts m={m} shipment={shipment} />
          <Exceptions m={m} />

          {/* Journey — closed by default; the cards above already tell the story. */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <button type="button" onClick={() => setJourneyOpen((v) => !v)} aria-expanded={journeyOpen}
                className="flex items-center gap-2 min-w-0 text-left group">
                <Icon name="chev" className={`w-4 h-4 text-gray-400 group-hover:text-gray-700 transition-transform ${journeyOpen ? 'rotate-90' : ''}`} />
                <span className="text-sm font-semibold text-gray-900">Journey</span>
                <span className="text-xs text-gray-400 truncate">{m.stops.length} stops · {m.scans.length} scans</span>
              </button>
              {journeyOpen ? (
                <button type="button" onClick={() => { setAllOpen((v) => !v); setOpenSet(new Set()) }}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
                  {allOpen ? 'Collapse scans' : 'Expand all scans'}
                </button>
              ) : (
                <button type="button" onClick={() => setJourneyOpen(true)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
                  Show
                </button>
              )}
            </div>
            {journeyOpen && (
              <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100">
                <Trip title="Return trip" stops={m.ret} accent={accent} topKey={topKey} isOpen={isOpen} onToggle={toggle} />
                <Trip title={m.ret.length ? 'Delivery trip' : 'Delivery'} stops={m.delivery} accent={accent} topKey={topKey} isOpen={isOpen} onToggle={toggle} />
              </div>
            )}
          </div>
        </>
      )}

      {awb && (
        <div className="flex items-center justify-between px-1 text-[11px]">
          <span className={['stale', 'error', 'notfound'].includes(sync) ? 'text-amber-600' : 'text-gray-400'}>
            {sync === 'loading' && 'Checking Delhivery…'}
            {sync === 'ok' && (shipment.scansSyncedAt ? `Synced with Delhivery ${fmtStamp(shipment.scansSyncedAt)}` : 'Synced with Delhivery')}
            {sync === 'stale' && 'Couldn’t reach Delhivery — showing saved updates'}
            {sync === 'notfound' && 'Delhivery has no record of this AWB (cancelled or never handed over?)'}
            {sync === 'error' && 'Couldn’t load latest tracking — showing saved updates'}
          </span>
          {!finished && (
            <button type="button" disabled={sync === 'loading'} onClick={() => load(true)}
              className="font-medium text-indigo-600 hover:text-indigo-800 disabled:text-gray-300">
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  )
}
