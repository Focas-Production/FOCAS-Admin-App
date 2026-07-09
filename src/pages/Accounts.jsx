import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import Pagination from '../components/Pagination'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`

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
  const [entries, setEntries]         = useState([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [limit, setLimit]             = useState(30)
  const [typeFilter, setTypeFilter]   = useState('')
  const [loadingS, setLoadingS]       = useState(true)
  const [loadingE, setLoadingE]       = useState(true)
  const [showAdd, setShowAdd]         = useState(false)
  const [deletingId, setDeletingId]   = useState(null)

  const loadSummary = useCallback(async () => {
    setLoadingS(true)
    try {
      const [sumRes, recRes] = await Promise.all([
        api.get('/accounts/summary'),
        api.get('/accounts/receivables'),
      ])
      setSummary(sumRes.data)
      setReceivables(recRes.data.receivables || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingS(false)
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

  const addReceivable = async (form) => {
    await api.post('/accounts/manual-receivables', form)
    setShowAdd(false)
    loadSummary()
  }

  const removeReceivable = async (id) => {
    if (!window.confirm('Remove this manual receivable? This does not affect Sales or Cash Collected.')) return
    setDeletingId(id)
    try {
      await api.delete(`/accounts/manual-receivables/${id}`)
      loadSummary()
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadEntries() }, [loadEntries])

  const totalPages = Math.ceil(total / limit)

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
            <p className="text-xs text-gray-400 mt-0.5">Customers with pending EMI payments</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors">
            <span className="text-base leading-none">+</span> Add Receivable
          </button>
        </div>
        {receivables.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No outstanding receivables. Use “Add Receivable” to record a manual / legacy balance.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3 w-1/3">Product</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">EMI</th>
                  <th className="px-5 py-3">Outstanding</th>
                  <th className="px-2 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {receivables.map((r) => (
                  <tr key={r.paymentId || r.manualId} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">
                      {r.name}
                      {r.manual && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-200/70 px-1.5 py-0.5 rounded">Manual</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{r.phone || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{r.product || '—'}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{r.full_amount != null ? fmt(r.full_amount) : '—'}</td>
                    <td className="px-5 py-3 text-gray-500">{r.emi_paid != null && r.emi_total != null ? `${r.emi_paid}/${r.emi_total}` : '—'}</td>
                    <td className="px-5 py-3 font-bold text-orange-600">{fmt(r.outstanding)}</td>
                    <td className="px-2 py-3 text-center w-8">
                      {/* Only manual receivables can be deleted; sale-backed rows are read-only */}
                      {r.manual && (
                        <button onClick={() => removeReceivable(r.manualId)} disabled={deletingId === r.manualId}
                          className="text-gray-400 hover:text-red-500 disabled:opacity-40 text-sm font-semibold" title="Delete manual receivable">
                          {deletingId === r.manualId ? '…' : '✕'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddReceivableModal onClose={() => setShowAdd(false)} onSave={addReceivable} />}

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

// ── Add manual / legacy receivable ──────────────────────────────────────────
// Only affects the Receivables (Pending) card + list — never Sales or Cash Collected.
function AddReceivableModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    name: '', phone: '', product: '', full_amount: '', emi_paid: '', emi_total: '', outstanding: '', note: '',
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
      await onSave(form)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Add Manual Receivable</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-400 -mt-1">Records a legacy / carried-forward balance. Adds to “Receivables (Pending)” only — it does not change Total Sales or Cash Collected.</p>

          <Field label="Customer name *"><input value={form.name} onChange={set('name')} autoFocus className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="e.g. ASWIN R" /></Field>
          <Field label="Phone"><input value={form.phone} onChange={set('phone')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="optional" /></Field>
          <Field label="Product"><input value={form.product} onChange={set('product')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="optional — full product name" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Total fee"><input type="number" value={form.full_amount} onChange={set('full_amount')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="optional" /></Field>
            <Field label="EMI paid"><input type="number" value={form.emi_paid} onChange={set('emi_paid')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="—" /></Field>
            <Field label="EMI total"><input type="number" value={form.emi_total} onChange={set('emi_total')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="—" /></Field>
          </div>
          <Field label="Outstanding (owed) *"><input type="number" value={form.outstanding} onChange={set('outstanding')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="e.g. 24000" /></Field>
          <Field label="Note"><input value={form.note} onChange={set('note')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="optional remark" /></Field>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : 'Add Receivable'}
            </button>
          </div>
        </form>
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
