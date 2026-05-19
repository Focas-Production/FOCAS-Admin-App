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
      {receivables.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Outstanding Receivables</h3>
            <p className="text-xs text-gray-400 mt-0.5">Customers with pending EMI payments</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Customer', 'Phone', 'Product', 'Total', 'EMI', 'Outstanding'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {receivables.map((r) => (
                  <tr key={r.paymentId} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                    <td className="px-5 py-3 text-gray-500">{r.phone}</td>
                    <td className="px-5 py-3 text-gray-600 max-w-xs truncate">{r.product}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{fmt(r.full_amount)}</td>
                    <td className="px-5 py-3 text-gray-500">{r.emi_paid}/{r.emi_total}</td>
                    <td className="px-5 py-3 font-bold text-orange-600">{fmt(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
