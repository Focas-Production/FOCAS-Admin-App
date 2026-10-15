import { useState } from 'react'
import api from '../services/api'

// "Send a new parcel" for an order whose parcel failed (returned / returning /
// lost / failed delivery / not picked up). Two ways:
//   • Book with Delhivery now — same as Sync, with the address/phone editable
//   • Already booked in Delhivery One — paste the AWB, we verify it with Delhivery
// The failed parcel stays on the order as "Previous parcel" and keeps tracking.
// If the old parcel is still active at Delhivery (failed attempt / not picked
// up), the admin must confirm it was cancelled — or the student gets two.
// Stock is not changed here (Inventory page).

const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
const label = 'block text-xs font-medium text-gray-600 mb-1'

function pincodeOf(a = {}) {
  return a.pincode || a.zip || a.postalCode || a.postal_code || ''
}

export default function ReshipModal({ order, oldStillActive = false, onClose, onDone }) {
  const a = order.address || {}
  const [mode, setMode]       = useState('create')
  const [address, setAddress] = useState({
    line1: a.line1 || '', line2: a.line2 || '', city: a.city || '', state: a.state || '', pincode: pincodeOf(a),
  })
  const [phone, setPhone]     = useState(order.shipment?.deliveryPhone || order.customerPhone || order.userId?.phoneNumber || '')
  const [awb, setAwb]         = useState('')
  const [note, setNote]       = useState('')
  const [askCancel, setAskCancel]       = useState(oldStillActive)   // server can also ask for it
  const [oldCancelled, setOldCancelled] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const setA = (k) => (e) => setAddress((p) => ({ ...p, [k]: e.target.value }))

  function validate() {
    if (!note.trim()) return 'Add a short note on why it is being reshipped'
    if (askCancel && !oldCancelled) return 'Cancel the old parcel in Delhivery One first, then tick the box'
    if (mode === 'existing') {
      if (!/^\d{8,20}$/.test(awb.trim())) return 'Enter the AWB number from Delhivery (digits only)'
      return ''
    }
    if (!address.line1.trim() || !address.city.trim() || !address.state.trim()) return 'Address line 1, city and state are required'
    if (!/^\d{6}$/.test(address.pincode.trim())) return 'Pincode must be 6 digits'
    if (!/^(\+?91|0)?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ''))) return 'Delivery phone must be a 10-digit mobile number'
    return ''
  }

  async function submit() {
    const v = validate()
    if (v) { setError(v); return }
    setSaving(true); setError('')
    try {
      const common = { note: note.trim(), oldCancelled: askCancel && oldCancelled }
      const body = mode === 'existing'
        ? { mode, awb: awb.trim(), ...common }
        : { mode, address, phone, ...common }
      const { data } = await api.post(`/delivery/reship/${order._id}`, body)
      onDone(data)
    } catch (err) {
      const d = err.response?.data || {}
      setError(d.error || 'Reship failed — try again')
      if (d.needsCancel) setAskCancel(true)
      // Delhivery booked it but saving failed: switch to "already booked" with
      // that AWB filled in, so the admin links it instead of booking twice.
      if (d.awb && mode === 'create') { setMode('existing'); setAwb(String(d.awb)) }
    } finally {
      setSaving(false)
    }
  }

  const ModeCard = ({ value, title, sub }) => (
    <button type="button" onClick={() => { setMode(value); setError('') }}
      className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        mode === value ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 hover:bg-gray-50'}`}>
      <p className={`text-sm font-medium ${mode === value ? 'text-indigo-900' : 'text-gray-800'}`}>{title}</p>
      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Send a new parcel</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {order.customerName || order.userId?.name} · previous AWB <span className="font-mono">{order.shipment?.awb}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="text-xl leading-none text-gray-400 hover:text-gray-700">&times;</button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex gap-2">
            <ModeCard value="create"   title="Book with Delhivery" sub="Create the shipment from here" />
            <ModeCard value="existing" title="Already booked"      sub="I made it in Delhivery One" />
          </div>

          {mode === 'create' ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Deliver to</p>
                <div className="space-y-2">
                  <div><label className={label}>Address line 1</label><input className={input} value={address.line1} onChange={setA('line1')} /></div>
                  <div><label className={label}>Address line 2</label><input className={input} value={address.line2} onChange={setA('line2')} /></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><label className={label}>City</label><input className={input} value={address.city} onChange={setA('city')} /></div>
                    <div><label className={label}>State</label><input className={input} value={address.state} onChange={setA('state')} /></div>
                    <div><label className={label}>Pincode</label><input className={input} inputMode="numeric" maxLength={6} value={address.pincode} onChange={setA('pincode')} /></div>
                  </div>
                  <div>
                    <label className={label}>Delivery phone</label>
                    <input className={input} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <p className="text-[11px] text-gray-400 mt-1">Used for this parcel only — the student’s account number doesn’t change. A changed address is saved on the order.</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className={label}>New AWB number</label>
              <input className={`${input} font-mono`} inputMode="numeric" placeholder="e.g. 48214610015201" value={awb} onChange={(e) => setAwb(e.target.value.trim())} />
              <p className="text-[11px] text-gray-400 mt-1">We check it with Delhivery before saving.</p>
            </div>
          )}

          <div>
            <label className={label}>Reason <span className="text-rose-500">*</span></label>
            <textarea className={input} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Student was unreachable; confirmed the address on call 15 Oct" />
          </div>

          {askCancel && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={oldCancelled} onChange={(e) => setOldCancelled(e.target.checked)} />
              <span className="text-xs text-amber-900">
                I have cancelled the old parcel (AWB <span className="font-mono">{order.shipment?.awb}</span>) in Delhivery One
                <span className="block text-amber-800/80 mt-0.5">It is still active with Delhivery — if it isn’t cancelled, the student may get two parcels.</span>
              </span>
            </label>
          )}

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={submit} disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {saving ? (mode === 'create' ? 'Booking…' : 'Checking…') : (mode === 'create' ? 'Book new parcel' : 'Link this AWB')}
          </button>
        </div>
      </div>
    </div>
  )
}
