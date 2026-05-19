import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`
const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

function SummaryCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function periodLabel(period, groupBy) {
  if (!period) return '—'
  const { year, month, day } = period
  if (groupBy === 'year')  return `${year}`
  if (groupBy === 'month') return new Date(year, month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Sales() {
  const [summary, setSummary]   = useState(null)
  const [timeline, setTimeline] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [loading, setLoading]   = useState(true)

  const [filters, setFilters] = useState({
    dateFrom: monthStart(),
    dateTo:   today(),
    source:   '',
    groupBy:  'day',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo)   params.set('dateTo',   filters.dateTo)
      if (filters.source)   params.set('source',   filters.source)

      const timelineParams = new URLSearchParams(params)
      timelineParams.set('groupBy', filters.groupBy)

      const topParams = new URLSearchParams(params)
      topParams.set('limit', '10')

      const [sumRes, tlRes, topRes] = await Promise.all([
        api.get(`/admin/sales/summary?${params}`),
        api.get(`/admin/sales/timeline?${timelineParams}`),
        api.get(`/admin/sales/top-products?${topParams}`),
      ])

      setSummary(sumRes.data)
      setTimeline(tlRes.data.timeline || [])
      setTopProducts(topRes.data.products || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  function setFilter(key, val) {
    setFilters((f) => ({ ...f, [key]: val }))
  }

  const maxRevenue = Math.max(...timeline.map((r) => r.totalRevenue), 1)

  return (
    <div className="space-y-6">

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={filters.dateFrom}
            onChange={(e) => setFilter('dateFrom', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={filters.dateTo}
            onChange={(e) => setFilter('dateTo', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
          <select value={filters.source} onChange={(e) => setFilter('source', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Sources</option>
            <option value="website">Website</option>
            <option value="shopify">Shopify</option>
            <option value="combo">Combo</option>
            <option value="custom">Custom (Razorpay)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Group By</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            {['day', 'month', 'year'].map((g) => (
              <button key={g} onClick={() => setFilter('groupBy', g)}
                className={`px-3 py-1.5 capitalize transition-colors ${filters.groupBy === g ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <button onClick={load}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">
          Apply
        </button>
        <button onClick={() => setFilters({ dateFrom: monthStart(), dateTo: today(), source: '', groupBy: 'day' })}
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
          Reset
        </button>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard label="Total Revenue" value={fmt(summary?.totalRevenue)} color="text-emerald-600"
            sub={filters.dateFrom && filters.dateTo ? `${filters.dateFrom} → ${filters.dateTo}` : 'All time'} />
          <SummaryCard label="Total Orders"  value={(summary?.totalOrders || 0).toLocaleString()} color="text-blue-600" />
          <SummaryCard label="Items Sold"    value={(summary?.totalItems  || 0).toLocaleString()} color="text-purple-600" />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Timeline Table */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Sales Timeline</h3>
            <span className="text-xs text-gray-400 capitalize">{filters.groupBy}ly</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Period</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Revenue</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Orders</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Items</th>
                  <th className="px-4 py-3 w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(5)].map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : timeline.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-gray-400">No sales in this period</td>
                  </tr>
                ) : (
                  [...timeline].reverse().map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-800">
                        {periodLabel(row.period, filters.groupBy)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">{fmt(row.totalRevenue)}</td>
                      <td className="px-4 py-3 text-gray-600">{row.totalOrders}</td>
                      <td className="px-4 py-3 text-gray-600">{row.totalItems}</td>
                      <td className="px-4 py-3">
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-emerald-500 h-1.5 rounded-full"
                            style={{ width: `${Math.round((row.totalRevenue / maxRevenue) * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Top Products</h3>
            <p className="text-xs text-gray-400 mt-0.5">by revenue</p>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="px-5 py-3 animate-pulse flex gap-3">
                  <div className="h-8 w-8 bg-gray-100 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              ))
            ) : topProducts.length === 0 ? (
              <p className="px-5 py-8 text-center text-gray-400 text-sm">No data</p>
            ) : (
              topProducts.map((p, i) => (
                <div key={p._id} className="px-5 py-3 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.unitsSold} sold {p.currentStock != null ? `· ${p.currentStock} in stock` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-emerald-700">{fmt(p.totalRevenue)}</p>
                    {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
