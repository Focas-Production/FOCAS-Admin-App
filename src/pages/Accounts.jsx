import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import api from '../services/api'
import Pagination from '../components/Pagination'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`

// Receivable dates come from the server as IST calendar days ('YYYY-MM-DD').
const fmtDay = (day) => day
  ? new Date(`${day}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  : '—'
const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)

const STATUS_OPTIONS = [
  { value: 'due',     label: 'Due',     hint: 'Waiting for payment',
    pill: 'bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100', dot: 'bg-amber-500' },
  { value: 'overdue', label: 'Overdue', hint: 'Payment is late — follow up',
    pill: 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100',         dot: 'bg-red-500'   },
]

// Due date relative to today (IST), in words: "in 30 days", "due today", "2 days late".
function dueInWords(dueDay) {
  if (!dueDay) return 'No due date yet'
  const diff = Math.round((Date.parse(dueDay) - Date.parse(todayIST())) / 86_400_000)
  if (diff > 1)   return `in ${diff} days`
  if (diff === 1) return 'due tomorrow'
  if (diff === 0) return 'due today'
  return diff === -1 ? '1 day late' : `${-diff} days late`
}

const EMPTY_FILTERS = { q: '', status: '', dateField: 'due_date', month: '', from: '', to: '' }
const filterInput = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// 'YYYY-MM' → 'Oct 2026'
const fmtMonth = (month) => new Date(`${month}-01T00:00:00+05:30`)
  .toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

// The whole receivables list is loaded at once, so filtering happens here.
// Month and date range apply to the chosen date (due date or date of sale);
// rows without that date drop out while a date filter is on.
function filterReceivables(rows, f) {
  const text   = f.q.trim().toLowerCase()
  const digits = f.q.replace(/\D/g, '')
  return rows.filter((r) => {
    if (text) {
      const byName  = (r.name || '').toLowerCase().includes(text)
      const byPhone = digits && (r.phone || '').replace(/\D/g, '').includes(digits)
      if (!byName && !byPhone) return false
    }
    if (f.status && r.status !== f.status) return false
    const day = r[f.dateField]
    if ((f.month || f.from || f.to) && !day) return false
    if (f.month && !day.startsWith(f.month)) return false
    if (f.from && day < f.from) return false
    if (f.to && day > f.to) return false
    return true
  })
}

const TYPE_LABELS = {
  sale:                { label: 'Sale',          color: 'bg-emerald-100 text-emerald-700' },
  receivable_created:  { label: 'Receivable',    color: 'bg-orange-100 text-orange-700'  },
  receivable_payment:  { label: 'EMI Collected', color: 'bg-blue-100 text-blue-700'      },
  refund:              { label: 'Refund',         color: 'bg-red-100 text-red-700'        },
}

function SummaryCard({ label, value, color, sub }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function Accounts() {
  const [summary, setSummary]         = useState(null)
  const [receivables, setReceivables] = useState([])
  const [upiId, setUpiId]             = useState(null)
  const [filters, setFilters]         = useState(EMPTY_FILTERS)
  const [entries, setEntries]         = useState([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [limit, setLimit]             = useState(30)
  const [typeFilter, setTypeFilter]   = useState('')
  const [loadingS, setLoadingS]       = useState(true)
  const [loadingR, setLoadingR]       = useState(true)
  const [loadingE, setLoadingE]       = useState(true)
  const [showAdd, setShowAdd]         = useState(false)
  const [editRow, setEditRow]         = useState(null) // manual receivable being edited
  const [showReminders, setShowReminders] = useState(false)
  const [reminderOn, setReminderOn]   = useState(null) // WhatsApp EMI reminders switch (null = not loaded)
  const [deletingId, setDeletingId]   = useState(null)

  const loadSummary = useCallback(async () => {
    setLoadingS(true)
    try {
      const res = await api.get('/accounts/summary')
      setSummary(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingS(false)
    }
  }, [])

  const loadReceivables = useCallback(async () => {
    try {
      const res = await api.get('/accounts/receivables')
      setReceivables(res.data.receivables || [])
      setUpiId(res.data.upi_id || null)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingR(false)
    }
  }, [])

  const loadEntries = useCallback(async () => {
    setLoadingE(true)
    try {
      const params = new URLSearchParams({ page, limit })
      if (typeFilter) params.set('type', typeFilter)
      const res = await api.get(`/accounts/entries?${params}`)
      setEntries(res.data.entries || [])
      setTotal(res.data.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingE(false)
    }
  }, [page, limit, typeFilter])

  // Add (no id) or edit (id) a manual receivable
  const saveManual = async (form, id) => {
    if (id) await api.put(`/accounts/manual-receivables/${id}`, form)
    else    await api.post('/accounts/manual-receivables', form)
    setShowAdd(false)
    setEditRow(null)
    loadSummary()
    loadReceivables()
  }

  const removeReceivable = async (id) => {
    if (!window.confirm('Remove this manual receivable? This does not affect Sales or Cash Collected.')) return
    setDeletingId(id)
    try {
      await api.delete(`/accounts/manual-receivables/${id}`)
      loadSummary()
      loadReceivables()
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingId(null)
    }
  }

  // Save a follow-up field (status / remarks / manual sale date), then refresh the
  // list. Throws on failure so the edited cell can keep what the admin typed.
  const updateReceivable = async (row, patch) => {
    const path = row.manual ? `manual/${row.manualId}` : `payment/${row.paymentId}`
    try {
      await api.patch(`/accounts/receivables/${path}`, patch)
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to save — please try again')
      if (err.response?.status === 409) loadReceivables()
      throw err
    }
    await loadReceivables()
  }

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadReceivables() }, [loadReceivables])
  useEffect(() => {
    api.get('/accounts/emi-reminders')
      .then((res) => setReminderOn(!!res.data.config?.enabled))
      .catch((err) => console.error(err))
  }, [])
  useEffect(() => { loadEntries() }, [loadEntries])

  const totalPages   = Math.ceil(total / limit)
  const overdueCount = receivables.filter((r) => r.status === 'overdue').length

  const shown          = filterReceivables(receivables, filters)
  const shownOwed      = shown.reduce((sum, r) => sum + (r.outstanding || 0), 0)
  const hasFilter      = filters.q || filters.status || filters.month || filters.from || filters.to
  // Month choices = months that actually have rows for the chosen date, with counts
  const monthCounts    = receivables.reduce((acc, r) => {
    const m = r[filters.dateField]?.slice(0, 7)
    if (m) acc[m] = (acc[m] || 0) + 1
    return acc
  }, {})
  const setFilter      = (key, value) => setFilters((f) => ({ ...f, [key]: value }))

  return (
    <div className="space-y-6">

      {/* Summary Cards */}
      {loadingS ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-5 h-24 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard label="Total Sales (Booked)"  value={fmt(summary?.total_sales)}       color="text-emerald-600" sub="Full value at first payment" />
          <SummaryCard label="Receivables (Pending)" value={fmt(summary?.total_receivables)} color="text-orange-500"  sub="Outstanding EMI balance" />
          <SummaryCard label="Total Refunds"         value={fmt(summary?.total_refunds)}     color="text-red-500"     sub="Admin-initiated refunds" />
          <SummaryCard label="Cash Collected"        value={fmt(summary?.total_collected)}   color="text-blue-600"    sub="Received minus refunds" />
        </div>
      )}

      {/* Receivables table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-800">Outstanding Receivables</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Customers with pending EMI payments · EMIs fall due every 30 days from the date of sale
              {overdueCount > 0 && <span className="text-red-500 font-medium"> · {overdueCount} overdue</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowReminders(true)} title="WhatsApp EMI due reminders to students"
              className="inline-flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors">
              WhatsApp reminders
              {reminderOn != null && (
                <span className={`rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${reminderOn ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {reminderOn ? 'On' : 'Off'}
                </span>
              )}
            </button>
            <button onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors">
              <span className="text-base leading-none">+</span> Add Receivable
            </button>
          </div>
        </div>
        {loadingR ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Loading…</p>
        ) : receivables.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No outstanding receivables. Use “Add Receivable” to record a manual / legacy balance.</p>
        ) : (
          <>
          {/* Filter bar */}
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <input type="search" placeholder="Search name or phone…" value={filters.q}
              onChange={(e) => setFilter('q', e.target.value)} className={`${filterInput} w-52`} />
            <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className={filterInput}>
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filters.dateField} title="Which date the month and date filters use"
              onChange={(e) => setFilters((f) => ({ ...f, dateField: e.target.value, month: '' }))} className={filterInput}>
              <option value="due_date">By Due Date</option>
              <option value="sale_date">By Date of Sale</option>
            </select>
            <select value={filters.month} title="Month"
              onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value, from: '', to: '' }))} className={filterInput}>
              <option value="">All Months</option>
              {Object.keys(monthCounts).sort().map((m) => (
                <option key={m} value={m}>{fmtMonth(m)} ({monthCounts[m]})</option>
              ))}
            </select>
            <input type="date" value={filters.from} max={filters.to || undefined} title="From date"
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, month: '' }))} className={filterInput} />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={filters.to} min={filters.from || undefined} title="To date"
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, month: '' }))} className={filterInput} />
            {hasFilter && (
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">
                Clear
              </button>
            )}
            <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">
              {hasFilter ? `${shown.length} of ${receivables.length}` : `${receivables.length} customers`}
              {' · '}<span className="font-semibold text-orange-600">{fmt(shownOwed)}</span> outstanding
            </span>
          </div>

          {shown.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No receivables match these filters.</p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  <th className="px-3 py-3">Date of Sale</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">EMI</th>
                  <th className="px-3 py-3">Due Date</th>
                  <th className="px-3 py-3">Outstanding</th>
                  <th className="px-3 py-3">Pay Link / UPI</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Remarks</th>
                  <th className="px-2 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shown.map((r) => (
                  <tr key={r.paymentId || r.manualId} className="hover:bg-gray-50">
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                      {/* Sale-backed rows use the real sale date; manual rows are typed in */}
                      {r.manual ? (
                        <InlineEdit type="date" value={r.sale_date || ''} max={todayIST()}
                          onSave={(v) => updateReceivable(r, { sale_date: v || null })}
                          display={r.sale_date ? fmtDay(r.sale_date) : <span className="text-amber-600 font-medium">Set date</span>} />
                      ) : fmtDay(r.sale_date)}
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-800">
                      {r.name}
                      {r.manual && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-200/70 px-1.5 py-0.5 rounded">Manual</span>}
                      {r.refunded && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-red-700 bg-red-100 px-1.5 py-0.5 rounded"
                          title="This order has a refund — no WhatsApp reminders are sent for it">Refunded</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-500">{r.phone || '—'}</td>
                    <td className="px-3 py-3 text-gray-600 min-w-[160px]">{r.product || '—'}</td>
                    <td className="px-3 py-3 font-semibold text-gray-800">{r.full_amount != null ? fmt(r.full_amount) : '—'}</td>
                    <td className="px-3 py-3 text-gray-500">{r.emi_paid != null && r.emi_total != null ? `${r.emi_paid}/${r.emi_total}` : '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={r.auto_status === 'overdue' ? 'text-red-600 font-medium' : 'text-gray-600'}>{fmtDay(r.due_date)}</span>
                      <ReminderNote row={r} />
                    </td>
                    <td className="px-3 py-3 font-bold text-orange-600">{fmt(r.outstanding)}</td>
                    <td className="px-3 py-3">
                      <PayCell row={r} upiId={upiId} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusSelect row={r} onSave={(patch) => updateReceivable(r, patch)} />
                    </td>
                    <td className="px-3 py-3">
                      {/* One line in the list; click to open the full note for reading / editing */}
                      <InlineEdit multiline value={r.remarks} maxLength={1000}
                        hint={r.remarks || 'Click to add a note'}
                        onSave={(v) => updateReceivable(r, { remarks: v })}
                        display={r.remarks
                          ? <span className="block w-56 truncate text-gray-600">{r.remarks}</span>
                          : <span className="text-gray-400">+ Add note</span>} />
                    </td>
                    <td className="px-2 py-3 text-center whitespace-nowrap">
                      {/* Only manual receivables can be edited / deleted; sale-backed rows are read-only */}
                      {r.manual && (
                        <>
                          <button onClick={() => setEditRow(r)}
                            className="text-gray-400 hover:text-blue-600 text-sm font-semibold px-1" title="Edit manual receivable">
                            ✎
                          </button>
                          <button onClick={() => removeReceivable(r.manualId)} disabled={deletingId === r.manualId}
                            className="text-gray-400 hover:text-red-500 disabled:opacity-40 text-sm font-semibold px-1" title="Delete manual receivable">
                            {deletingId === r.manualId ? '…' : '✕'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          </>
        )}
      </div>

      {showAdd && <AddReceivableModal onClose={() => setShowAdd(false)} onSave={saveManual} />}
      {editRow && <AddReceivableModal initial={editRow} onClose={() => setEditRow(null)} onSave={saveManual} />}
      {showReminders && (
        <EmiReminderModal
          onClose={() => setShowReminders(false)}
          onConfig={(cfg) => setReminderOn(cfg.enabled)}
          onSent={loadReceivables} />
      )}

      {/* Ledger entries */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-gray-800">Accounts Ledger</h3>
            <p className="text-xs text-gray-400 mt-0.5">{total} entries</p>
          </div>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Types</option>
            <option value="sale">Sale</option>
            <option value="receivable_created">Receivable Created</option>
            <option value="receivable_payment">EMI Collected</option>
            <option value="refund">Refund</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Date', 'Type', 'Customer', 'Product', 'EMI', 'Amount'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loadingE ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400">No entries found</td>
                </tr>
              ) : (
                entries.map((e) => {
                  const badge = TYPE_LABELS[e.type] || { label: e.type, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={e._id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-800">{e.paymentId?.name || '—'}</td>
                      <td className="px-5 py-3 text-gray-600 max-w-xs truncate">{e.paymentId?.product_name || '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{e.emi_index ?? '—'}</td>
                      <td className={`px-5 py-3 font-semibold ${e.type === 'receivable_created' ? 'text-orange-600' : e.type === 'sale' ? 'text-emerald-700' : 'text-blue-600'}`}>
                        {fmt(e.amount)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={(p) => setPage(p)}
          onLimitChange={(l) => { setLimit(l); setPage(1) }}
        />
      </div>

    </div>
  )
}

// ── Add / edit manual (legacy) receivable ───────────────────────────────────
// Only affects the Receivables (Pending) card + list — never Sales or Cash Collected.
// `initial` = the row being edited (edit keeps the row, so sent reminders are remembered).
function AddReceivableModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(() => initial ? {
    name:        initial.name || '',
    phone:       initial.phone || '',
    product:     initial.product || '',
    sale_date:   initial.sale_date || '',
    full_amount: initial.full_amount ?? '',
    emi_paid:    initial.emi_paid ?? '',
    emi_total:   initial.emi_total ?? '',
    outstanding: initial.outstanding ?? '',
    note:        initial.remarks || '',
  } : {
    name: '', phone: '', product: '', sale_date: '', full_amount: '', emi_paid: '', emi_total: '', outstanding: '', note: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim())               return setError('Customer name is required')
    if (!(Number(form.outstanding) > 0)) return setError('Outstanding must be greater than 0')
    setSaving(true); setError('')
    try {
      await onSave(form, initial?.manualId)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">{initial ? 'Edit Manual Receivable' : 'Add Manual Receivable'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-400 -mt-1">Records a legacy / carried-forward balance. Adds to “Receivables (Pending)” only — it does not change Total Sales or Cash Collected.</p>

          <Field label="Customer name *"><input value={form.name} onChange={set('name')} autoFocus className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="e.g. ASWIN R" /></Field>
          <Field label="Phone"><input value={form.phone} onChange={set('phone')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="optional" /></Field>
          <Field label="Product"><input value={form.product} onChange={set('product')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="optional — full product name" /></Field>
          <Field label="Date of sale (sets the due date — 30 days per EMI)"><input type="date" value={form.sale_date} onChange={set('sale_date')} max={todayIST()} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Total fee"><input type="number" value={form.full_amount} onChange={set('full_amount')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="optional" /></Field>
            <Field label="EMIs paid (count)"><input type="number" min={1} step={1} value={form.emi_paid} onChange={set('emi_paid')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="e.g. 1" /></Field>
            <Field label="EMIs total (count)"><input type="number" min={2} step={1} value={form.emi_total} onChange={set('emi_total')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="e.g. 2" /></Field>
          </div>
          <p className="text-[11px] text-gray-400 -mt-1">EMI counts, not amounts — e.g. 1 of 2 paid. Needed for the WhatsApp due reminder.</p>
          <Field label="Outstanding (owed) *"><input type="number" value={form.outstanding} onChange={set('outstanding')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="e.g. 24000" /></Field>
          <Field label="Remarks"><input value={form.note} onChange={set('note')} maxLength={1000} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="optional" /></Field>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Add Receivable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Status pill ──────────────────────────────────────────────────────────────
// Due/Overdue pill with a days-to-due line under it. Clicking opens a small menu;
// picking the option marked AUTO (what the due date says) clears the admin
// override, so the row goes back to automatic.
const MENU_W = 190
const MENU_H = 112

function StatusSelect({ row, onSave }) {
  const [open, setOpen]       = useState(false)
  const [pos, setPos]         = useState(null)
  const [pending, setPending] = useState(null) // value being saved, shown right away
  const triggerRef = useRef(null)
  const menuRef    = useRef(null)

  const shown   = pending ?? row.status
  const current = STATUS_OPTIONS.find((s) => s.value === shown) || STATUS_OPTIONS[0]
  const edited  = row.status_manual && row.status !== row.auto_status

  // The table scrolls sideways, which would clip a normal dropdown — so the menu
  // is fixed-positioned beside the pill, opening upward when there's no room below.
  // Returns false when the pill is off screen.
  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r || r.bottom < 0 || r.top > window.innerHeight) return false
    const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8))
    const up   = window.innerHeight - r.bottom < MENU_H + 12 && r.top > MENU_H + 12
    setPos(up ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 })
    return true
  }

  const toggle = () => {
    if (open) return setOpen(false)
    if (place()) setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    // Follow the pill on any scroll (page or table) / resize; close once it's off screen
    const follow = () => { if (!place()) setOpen(false) }
    // Start keyboard focus on the current option
    menuRef.current?.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true })
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [open])

  // Up/Down arrows move between the options
  const onMenuKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...menuRef.current.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')]
    const i     = items.indexOf(document.activeElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  const toggleReminders = async () => {
    setOpen(false)
    try {
      await onSave({ reminders_off: !row.reminders_off })
    } catch {
      // already alerted
    }
  }

  const choose = async (value) => {
    setOpen(false)
    if (value === shown) return
    setPending(value)
    try {
      await onSave({ status: value === row.auto_status ? null : value })
    } catch {
      // already alerted; the pill falls back to the saved value
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="whitespace-nowrap">
      <button ref={triggerRef} type="button" onClick={toggle} disabled={pending !== null}
        aria-haspopup="menu" aria-expanded={open} title="Change status"
        className={`inline-flex min-w-[78px] items-center gap-1 rounded py-0.5 pl-1.5 pr-1 text-[11px] font-semibold ring-1 ring-inset transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-wait disabled:opacity-60 ${current.pill}`}>
        <span className={`h-1.5 w-1.5 rounded-sm ${current.dot}`} />
        {current.label}
        <svg className={`ml-auto h-3 w-3 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      <p className="mt-1 text-[10px] text-gray-400">
        {dueInWords(row.due_date)}
        {edited && <span className="font-medium text-gray-500"> · set by admin</span>}
      </p>

      {open && createPortal(
        <div ref={menuRef} role="menu" onKeyDown={onMenuKey} style={{ position: 'fixed', width: MENU_W, ...pos }}
          className="z-50 rounded-md bg-white p-1 shadow-md ring-1 ring-black/10">
          {STATUS_OPTIONS.map((s) => {
            const selected = s.value === shown
            const isAuto   = s.value === row.auto_status
            return (
              <button key={s.value} type="button" role="menuitemradio" aria-checked={selected}
                onClick={() => choose(s.value)}
                title={isAuto
                  ? `${s.hint}. AUTO = what the due date${row.due_date ? ` (${fmtDay(row.due_date)})` : ''} says — pick it to undo a manual change`
                  : s.hint}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:bg-gray-100 ${selected ? 'bg-gray-50' : ''}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-sm ${s.dot}`} />
                {s.label}
                {isAuto && <span className="rounded-sm bg-gray-100 px-1 text-[9px] font-semibold tracking-wide text-gray-500">AUTO</span>}
                {selected && (
                  <svg className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )
          })}
          {/* Per-row WhatsApp reminder switch (paid another way, dropped out…) */}
          <div className="my-1 border-t border-gray-100" />
          <button type="button" role="menuitem" onClick={toggleReminders}
            title={row.reminders_off ? 'Start sending WhatsApp EMI due reminders to this student again' : 'Stop WhatsApp EMI due reminders for this student'}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:bg-gray-100">
            {row.reminders_off ? '🔔 Resume WhatsApp reminders' : '🔕 Stop WhatsApp reminders'}
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Where the customer pays the next EMI ────────────────────────────────────
// Razorpay rows: the next unpaid EMI link (never the UPI ID). Manual rows: the
// UPI ID from the server's PAYMENT_UPI_ID setting.
function PayCell({ row, upiId }) {
  const link = row.pay_link
  if (!row.manual && !link) {
    return (
      <span className="text-xs text-amber-600" title="No unpaid Razorpay link is open for this order — check it in Payment Links">
        No open link
      </span>
    )
  }
  if (link) {
    return (
      <div className="whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <a href={link.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">
            {link.url.replace(/^https?:\/\//, '')}
          </a>
          <CopyButton text={link.url} title="Copy payment link" />
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">EMI {link.emi_index} link · {fmt(link.amount)}</p>
      </div>
    )
  }
  if (upiId) {
    return (
      <div className="whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-700">{upiId}</span>
          <CopyButton text={upiId} title="Copy UPI ID" />
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">UPI</p>
      </div>
    )
  }
  return <span className="text-xs text-gray-400" title="Set PAYMENT_UPI_ID in the server .env to show a UPI ID here">UPI not set</span>
}

function CopyButton({ text, title }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy this:', text) // clipboard blocked (e.g. non-https) — let the admin copy by hand
    }
  }
  return (
    <button type="button" onClick={copy} title={title}
      className={`text-[11px] font-semibold rounded px-1.5 py-0.5 border transition-colors ${copied ? 'border-emerald-300 text-emerald-600' : 'border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300'}`}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Click-to-edit cell ───────────────────────────────────────────────────────
// Enter or clicking away saves, Esc cancels. On a failed save the draft stays.
// `multiline` edits in a textarea that wraps and grows with the text
// (Shift+Enter for a new line).
function InlineEdit({ value, display, onSave, type = 'text', multiline = false, hint = 'Click to edit', ...inputProps }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value)
  const [saving, setSaving]   = useState(false)
  const cancelled             = useRef(false)
  const fieldRef              = useRef(null)

  // Grow the textarea to fit its text so the whole note stays visible
  useLayoutEffect(() => {
    const el = fieldRef.current
    if (!multiline || !el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [multiline, editing, draft])

  const start = () => { setDraft(value); cancelled.current = false; setEditing(true) }

  const commit = async () => {
    if (cancelled.current || saving) return
    if (draft.trim() === value.trim()) return setEditing(false)
    setSaving(true)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch {
      // already alerted; keep the draft so nothing typed is lost
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button type="button" onClick={start} className="text-left rounded px-1.5 -mx-1.5 py-0.5 hover:bg-gray-100" title={hint}>
        {display}
      </button>
    )
  }

  const fieldProps = {
    ...inputProps,
    ref: fieldRef,
    value: draft,
    autoFocus: true,
    disabled: saving,
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => {
      if (e.key === 'Enter' && !(multiline && e.shiftKey) && !e.nativeEvent.isComposing) {
        e.preventDefault()
        e.currentTarget.blur()
      }
      if (e.key === 'Escape') { cancelled.current = true; setEditing(false) }
    },
  }
  const fieldClass = 'border border-orange-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50'

  if (multiline) {
    return (
      <textarea {...fieldProps} rows={1}
        // Caret at the end, so adding to an existing note is one click
        onFocus={(e) => { const n = e.target.value.length; e.target.setSelectionRange(n, n) }}
        className={`${fieldClass} block w-72 resize-none overflow-hidden leading-5`} />
    )
  }

  return <input {...fieldProps} type={type} className={`${fieldClass} ${type === 'date' ? 'w-36' : 'w-full min-w-[200px]'}`} />
}

// ── WhatsApp EMI due reminder: note under the due date ─────────────────────
function ReminderNote({ row }) {
  const reminder = row.reminder
  let note = null
  if (reminder?.status === 'sent') {
    const when = reminder.sent_at
      ? new Date(reminder.sent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
      : ''
    note = (
      <p className="mt-0.5 text-[10px] font-medium text-emerald-600"
        title={`WhatsApp due reminder sent with the ${reminder.channel === 'link' ? 'payment link' : 'UPI ID'}`}>
        ✓ Reminder sent {when}
      </p>
    )
  } else if (reminder?.status === 'failed') {
    note = (
      <p className="mt-0.5 text-[10px] font-medium text-red-500"
        title={`WATI rejected the reminder (${reminder.attempts} attempt${reminder.attempts === 1 ? '' : 's'}) — retried automatically up to 3 times`}>
        Reminder failed
      </p>
    )
  } else if (reminder?.status === 'unknown') {
    note = (
      <p className="mt-0.5 text-[10px] font-medium text-amber-600"
        title="WATI gave no clear answer — the message may have been delivered, so it is not re-sent automatically. Check the chat in WATI.">
        Reminder: check WATI
      </p>
    )
  } else if (reminder) {
    note = <p className="mt-0.5 text-[10px] text-gray-400">Reminder sending…</p>
  }
  return (
    <>
      {note}
      {row.reminders_off && <p className="mt-0.5 text-[10px] text-gray-400" title="WhatsApp EMI reminders are stopped for this row">🔕 Reminders stopped</p>}
    </>
  )
}

// ── WhatsApp EMI due reminder: settings, Preview, Send now ─────────────────
const RUN_STATUS = {
  'would-send':          ['Will be sent',      'bg-indigo-50 text-indigo-700'],
  'sent':                ['Sent',              'bg-emerald-50 text-emerald-700'],
  'already-sent':        ['Already sent',      'bg-gray-100 text-gray-600'],
  'failed':              ['Failed',            'bg-red-50 text-red-700'],
  'gave-up':             ['Failed 3 times',    'bg-red-50 text-red-700'],
  'in-progress':         ['Sending…',          'bg-gray-100 text-gray-600'],
  'skipped-no-phone':    ['No phone number',   'bg-amber-50 text-amber-700'],
  'skipped-no-upi-id':   ['UPI ID not set',    'bg-amber-50 text-amber-700'],
  'skipped-no-template': ['Template not set',  'bg-amber-50 text-amber-700'],
  // Razorpay link checked just before sending
  'skipped-link-paid':     ['Already paid on Razorpay — check order', 'bg-red-50 text-red-700'],
  'skipped-link-inactive': ['Link cancelled / expired',               'bg-amber-50 text-amber-700'],
  'link-check-failed':     ['Could not check link — will retry',      'bg-red-50 text-red-700'],
  // row-level safety checks
  'unknown':                ['Delivery unknown — check WATI',  'bg-amber-50 text-amber-700'],
  'skipped-reminders-off':  ['Reminders stopped',              'bg-gray-100 text-gray-600'],
  'skipped-refunded':       ['Refunded — not sent',            'bg-gray-100 text-gray-600'],
  'skipped-check-order':    ['Check this order — not sent',    'bg-amber-50 text-amber-700'],
  'skipped-no-open-link':   ['No open payment link',           'bg-amber-50 text-amber-700'],
  'skipped-check-emi-data': ['Fix EMI paid / total (✎)',       'bg-amber-50 text-amber-700'],
}

function EmiReminderModal({ onClose, onConfig, onSent }) {
  const [data, setData]       = useState(null)  // { config, readiness }
  const [enabled, setEnabled] = useState(false)
  const [days, setDays]       = useState(7)
  const [saving, setSaving]   = useState(false)
  const [busy, setBusy]       = useState(null)  // 'preview' | 'send'
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')

  const apply = (d) => {
    setData(d)
    setEnabled(d.config.enabled)
    setDays(d.config.daysBefore)
    onConfig(d.config)
  }

  useEffect(() => { // load once when the panel opens
    api.get('/accounts/emi-reminders')
      .then((res) => apply(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load reminder settings'))
  }, [])

  const dirty = data && (enabled !== data.config.enabled || Number(days) !== data.config.daysBefore)

  const save = async () => {
    setSaving(true); setError('')
    try {
      const res = await api.put('/accounts/emi-reminders', { enabled, daysBefore: Number(days) })
      apply(res.data)
      setResult(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const run = async (dryRun) => {
    if (!dryRun) {
      const n = result?.dryRun ? result.rows.filter((r) => r.status === 'would-send').length : null
      const ask = n != null
        ? `Send the WhatsApp reminder to ${n} student${n === 1 ? '' : 's'} now?`
        : 'Send WhatsApp reminders now to every student whose EMI is due soon?'
      if (!window.confirm(ask)) return
    }
    setBusy(dryRun ? 'preview' : 'send'); setError('')
    try {
      const res = await api.post('/accounts/emi-reminders/run', { dryRun })
      setResult(res.data)
      if (!dryRun) {
        onSent()
        const cfg = await api.get('/accounts/emi-reminders')
        apply(cfg.data)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run reminders')
    } finally {
      setBusy(null)
    }
  }

  const r = data?.readiness
  const checks = r ? [
    [!!r.linkTemplate, 'Razorpay link template', r.linkTemplate || 'set WATI_EMI_REMINDER_LINK_TEMPLATE'],
    [!!r.upiTemplate,  'UPI template',           r.upiTemplate  || 'set WATI_EMI_REMINDER_UPI_TEMPLATE'],
    [!!r.upiId,        'UPI ID',                 r.upiId        || 'set PAYMENT_UPI_ID'],
    [!!r.contact,      'Academic Team contact',  r.contact      || 'set EMI_REMINDER_CONTACT — until then the message says "this WhatsApp number"'],
    [r.jobEnabled,     'Sending on this server', r.jobEnabled ? 'EMI_REMINDER_JOB=1' : 'off here — Preview only (set EMI_REMINDER_JOB=1 on production)'],
  ] : []
  const last = data?.config.lastRunSummary
  const willSend = result?.rows.filter((x) => x.status === 'would-send').length ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800">WhatsApp EMI reminders</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              One message per EMI, {data?.config.daysBefore ?? 7} days before it's due, at {r?.sendHourIst ?? 10}:00 AM IST.
              Razorpay orders get their next EMI link · manual entries get the UPI ID.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        {!data ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">{error || 'Loading…'}</p>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Settings */}
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <button type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled((v) => !v)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm font-medium text-gray-700">Send automatically every day</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                Remind
                <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                days before the due date
              </label>
              <button onClick={save} disabled={!dirty || saving}
                className="ml-auto px-3.5 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>

            {/* What this server can send */}
            <div className="space-y-1.5 rounded-lg bg-gray-50 px-4 py-3">
              {checks.map(([ok, label, detail]) => (
                <div key={label} className="flex items-baseline gap-2 text-xs">
                  <span className={`w-3 font-bold ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>{ok ? '✓' : '!'}</span>
                  <span className="w-40 shrink-0 font-medium text-gray-700">{label}</span>
                  <span className={ok ? 'text-gray-600' : 'text-gray-400'}>{detail}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-500">
              Last run: {data.config.lastRunAt
                ? `${new Date(data.config.lastRunAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })} · ${last?.inWindow ?? 0} due soon · ${last?.sent ?? 0} sent · ${last?.failed ?? 0} failed · ${last?.skipped ?? 0} skipped`
                : 'never'}
            </p>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => run(true)} disabled={!!busy || dirty}
                className="px-3.5 py-1.5 text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-40">
                {busy === 'preview' ? 'Checking…' : 'Preview (sends nothing)'}
              </button>
              <button onClick={() => run(false)} disabled={!!busy || dirty}
                className="px-3.5 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40">
                {busy === 'send' ? 'Sending…' : 'Send now'}
              </button>
              {dirty && <span className="text-xs text-amber-600">Save your changes first</span>}
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            {/* Result */}
            {result && (
              result.skippedReason ? (
                <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Nothing sent — {result.skippedReason}</p>
              ) : (
                <div className="rounded-lg border border-gray-100">
                  <p className="px-4 py-2.5 text-xs text-gray-500 border-b border-gray-100">
                    <span className="font-semibold text-gray-700">{result.dryRun ? 'Preview' : 'Sent'}</span>
                    {' · '}{result.inWindow} EMI{result.inWindow === 1 ? '' : 's'} due in the next {result.daysBefore} days
                    {result.dryRun
                      ? ` · ${willSend} will be sent`
                      : ` · ${result.sent} sent · ${result.failed} failed${result.unknown ? ` · ${result.unknown} unknown (check WATI)` : ''}`}
                    {result.alreadySent > 0 && ` · ${result.alreadySent} already sent`}
                    {result.skipped > 0 && ` · ${result.skipped} skipped`}
                  </p>
                  {result.rows.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-400">No EMIs fall due in the next {result.daysBefore} days.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        <tr>
                          <th className="px-4 py-2">Student</th>
                          <th className="px-4 py-2">EMI</th>
                          <th className="px-4 py-2">Due</th>
                          <th className="px-4 py-2">Amount</th>
                          <th className="px-4 py-2">Via</th>
                          <th className="px-4 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {result.rows.map((x, i) => {
                          const [label, color] = RUN_STATUS[x.status] || [x.status, 'bg-gray-100 text-gray-600']
                          return (
                            <tr key={i}>
                              <td className="px-4 py-2">
                                <p className="font-medium text-gray-800">{x.name}</p>
                                <p className="text-[11px] text-gray-400">{x.phone || 'no phone'}</p>
                              </td>
                              <td className="px-4 py-2 text-gray-600">EMI {x.emi}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                                {fmtDay(x.due_date)}
                                <p className="text-[11px] text-gray-400">{dueInWords(x.due_date)}</p>
                              </td>
                              <td className="px-4 py-2 text-gray-700">{fmt(x.amount)}</td>
                              <td className="px-4 py-2 text-gray-600">
                                {x.channel === 'link' ? 'Payment link' : 'UPI ID'}
                                {/* exactly what goes in the message — the link as Razorpay serves it */}
                                {x.pay_to && (
                                  x.channel === 'link'
                                    ? <a href={x.pay_to} target="_blank" rel="noreferrer" className="block text-[11px] text-blue-600 hover:underline">{x.pay_to.replace(/^https?:\/\//, '')}</a>
                                    : <p className="text-[11px] text-gray-400">{x.pay_to}</p>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${color}`}>{label}</span>
                                {x.error && <p className="mt-0.5 text-[11px] text-gray-400">{x.error}</p>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
