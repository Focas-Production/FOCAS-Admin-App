import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../services/api'
import StatusBadge from '../components/StatusBadge'
import Pagination from '../components/Pagination'
import SearchFilters from '../components/SearchFilters'

const emptyFilters = { orderId: '', phone: '', dateFrom: '', dateTo: '' }

function fmt(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ShipToHomeOrders() {
  const [orders, setOrders] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [limit, setLimit] = useState(20)
  const [actionLoading, setActionLoading] = useState({})
  const [rateModal, setRateModal] = useState(null)
  const [trackingOrder, setTrackingOrder] = useState(null)
  const [trackLoading, setTrackLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [bulkLabelLoading, setBulkLabelLoading] = useState(false)
  const debounceRef = useRef(null)

  const load = useCallback(async (page = 1, status = statusFilter, f = filters, lim = limit) => {
    setLoading(true)
    setSelected(new Set())
    try {
      const params = new URLSearchParams({ page, limit: lim })
      if (status)     params.set('status', status)
      if (f.orderId)  params.set('orderId', f.orderId)
      if (f.phone)    params.set('phone', f.phone)
      if (f.dateFrom) params.set('dateFrom', f.dateFrom)
      if (f.dateTo)   params.set('dateTo', f.dateTo)
      const { data } = await api.get(`/delivery/shipments?${params}`)
      setOrders(data.orders || [])
      setPagination({
        page: data.pagination.page,
        totalPages: data.pagination.totalPages,
        total: data.pagination.total,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, filters, limit])

  useEffect(() => { load(1) }, [load])

  function handleStatusFilter(s) {
    setStatusFilter(s)
    load(1, s, filters, limit)
  }

  function handleFilterChange(f) {
    setFilters(f)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(1, statusFilter, f, limit), 400)
  }

  function handleClear() {
    setFilters(emptyFilters)
    load(1, statusFilter, emptyFilters, limit)
  }

  function handleLimitChange(lim) {
    setLimit(lim)
    load(1, statusFilter, filters, lim)
  }

  async function handleSync(id) {
    setActionLoading((p) => ({ ...p, [id]: 'sync' }))
    try {
      await api.post(`/delivery/sync/${id}`)
      await load(pagination.page, statusFilter, filters, limit)
    } catch (err) {
      alert(err.response?.data?.error || 'Sync failed')
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[id]; return n })
    }
  }

  async function handleGetRate(id) {
    setActionLoading((p) => ({ ...p, [id]: 'rate' }))
    try {
      const { data } = await api.get(`/delivery/rate/${id}`)
      setRateModal(data)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to get rate')
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[id]; return n })
    }
  }

  async function handleTrack(awb, orderId) {
    if (!awb) return
    setTrackLoading(true)
    try {
      const { data } = await api.get(`/delivery/track/${awb}`)
      setTrackingOrder({ ...data, orderId })
    } catch (err) {
      alert(err.response?.data?.error || 'Tracking failed')
    } finally {
      setTrackLoading(false)
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const synced = orders.filter((o) => !!o.shipment?.awb).map((o) => o._id)
    if (synced.length > 0 && synced.every((id) => selected.has(id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(synced))
    }
  }

  async function handleBulkLabel() {
    const awbs = [...selected]
      .map((id) => orders.find((x) => x._id === id)?.shipment?.awb)
      .filter(Boolean)
    if (awbs.length === 0) return
    setBulkLabelLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/delivery/bulk-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ awbs }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Bulk label failed')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `labels-bulk-${awbs.length}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Bulk label download failed')
    } finally {
      setBulkLabelLoading(false)
    }
  }

  async function handleDownloadLabel(awb) {
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(`/api/delivery/label/${awb}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to download label')
        return
      }
      // Backend redirects to S3 — fetch follows the redirect and gets the PDF blob
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `label-${awb}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Failed to download label')
    }
  }

  const statuses = ['', 'Manifested', 'In Transit', 'Out for Delivery', 'Delivered', 'RTO', 'Cancelled']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{pagination.total} orders with delivery</p>
        <div className="flex items-center gap-2 flex-wrap">
          {selected.size > 0 && (
            <button
              onClick={handleBulkLabel}
              disabled={bulkLabelLoading}
              className="px-4 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium"
            >
              {bulkLabelLoading ? 'Downloading...' : `Bulk Label (${selected.size})`}
            </button>
          )}
          <SearchFilters filters={filters} onChange={handleFilterChange} onClear={handleClear} />
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>{s || 'All statuses'}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    className="rounded"
                    onChange={toggleSelectAll}
                    checked={orders.filter((o) => !!o.shipment?.awb).length > 0 &&
                      orders.filter((o) => !!o.shipment?.awb).every((o) => selected.has(o._id))}
                    title="Select all synced orders"
                  />
                </th>
                {['Order ID', 'Customer', 'Source', 'AWB', 'Tracking Status', 'Location', 'Last Update', 'Fulfillment', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(11)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                    No shipment orders found
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o._id} className={`hover:bg-gray-50 ${selected.has(o._id) ? 'bg-emerald-50' : ''}`}>
                    <td className="px-4 py-3">
                      {o.shipment?.awb ? (
                        <input type="checkbox" className="rounded" checked={selected.has(o._id)} onChange={() => toggleSelect(o._id)} />
                      ) : (
                        <span className="block w-4 h-4" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[130px] truncate">{o.orderId || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-xs">{o.customerName || o.userId?.name || '—'}</div>
                      <div className="text-gray-400 text-xs">{o.customerPhone || o.userId?.phoneNumber || ''}</div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={o.source} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{o.shipment?.awb || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={o.shipment?.trackingStatus} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">
                      {o.shipment?.trackingLocation || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {fmt(o.shipment?.lastStatusAt)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={o.fulfillmentStatus} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmt(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {!o.shipment?.awb ? (() => {
                          const isOutOfStock = (o.items || []).some(
                            i => i.productId && i.productId.stock !== null && i.productId.stock !== undefined && i.productId.stock < 0
                          )
                          const hasWeight = (o.items || []).some(i => (i.productId?.weight || 0) > 0)
                          if (isOutOfStock) return (
                            <span
                              title="Product not available — stock is zero or negative. Restock before syncing."
                              className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-1 rounded font-medium whitespace-nowrap cursor-default"
                            >
                              N/A
                            </span>
                          )
                          if (!hasWeight) return (
                            <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded font-medium whitespace-nowrap">
                              No weight set
                            </span>
                          )
                          return (
                            <>
                              <button
                                onClick={() => handleSync(o._id)}
                                disabled={!!actionLoading[o._id]}
                                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                              >
                                {actionLoading[o._id] === 'sync' ? '...' : 'Sync'}
                              </button>
                              <button
                                onClick={() => handleGetRate(o._id)}
                                disabled={!!actionLoading[o._id]}
                                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 disabled:opacity-50 whitespace-nowrap"
                              >
                                {actionLoading[o._id] === 'rate' ? '...' : 'Get Rate'}
                              </button>
                            </>
                          )
                        })() : (
                          <>
                            <button
                              onClick={() => handleTrack(o.shipment.awb, o.orderId)}
                              disabled={trackLoading}
                              className="px-2 py-1 bg-sky-100 text-sky-700 text-xs rounded hover:bg-sky-200 whitespace-nowrap"
                            >
                              Track
                            </button>
                            <button
                              onClick={() => handleDownloadLabel(o.shipment.awb)}
                              className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 whitespace-nowrap"
                            >
                              Label
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={limit} onPageChange={(p) => load(p, statusFilter, filters, limit)} onLimitChange={handleLimitChange} />
      </div>

      {/* Rate Modal */}
      {rateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Delivery Rate</h3>
              <button onClick={() => setRateModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Order ID</span>
                <span className="font-mono text-gray-700">{rateModal.orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Weight</span>
                <span>{rateModal.cgm}g</span>
              </div>
              {rateModal.address && (
                <div className="mt-2 bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Delivery Address</p>
                  <p className="text-xs text-gray-700">{[rateModal.address.line1, rateModal.address.line2].filter(Boolean).join(', ')}</p>
                  <p className="text-xs text-gray-700">{[rateModal.address.city, rateModal.address.state, rateModal.address.pincode].filter(Boolean).join(', ')}</p>
                </div>
              )}
              {rateModal.rates && (
                <div className="mt-3 bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Rate Details</p>
                  {(() => {
                    const rateData = Array.isArray(rateModal.rates)
                      ? rateModal.rates
                      : Array.isArray(rateModal.rates?.data)
                      ? rateModal.rates.data
                      : null
                    if (rateData && rateData.length > 0) {
                      return (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b border-gray-200">
                              <th className="text-left pb-1">Service</th>
                              <th className="text-right pb-1">Charge (₹)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rateData.map((r, i) => (
                              <tr key={i} className="border-b border-gray-100">
                                <td className="py-1 text-gray-700">{r.service_type || r.md || r.name || '—'}</td>
                                <td className="py-1 text-right font-medium text-gray-900">
                                  {r.total_amount ?? r.charge ?? r.rate ?? '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    }
                    return <pre className="text-xs text-gray-700 overflow-auto max-h-40">{JSON.stringify(rateModal.rates, null, 2)}</pre>
                  })()}
                </div>
              )}
            </div>
            <button onClick={() => setRateModal(null)} className="mt-4 w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Tracking Modal */}
      {trackingOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Tracking — {trackingOrder.orderId}</h3>
              <button onClick={() => setTrackingOrder(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {trackingOrder.shipment ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Status</p>
                    <p className="font-medium mt-1">{trackingOrder.shipment.Status?.Status || '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Location</p>
                    <p className="font-medium mt-1">{trackingOrder.shipment.Status?.StatusLocation || '—'}</p>
                  </div>
                </div>
                {trackingOrder.shipment.Scans?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">History</p>
                    <div className="space-y-1">
                      {trackingOrder.shipment.Scans.slice().reverse().map((s, i) => (
                        <div key={i} className="flex items-start gap-3 text-xs p-2 rounded bg-gray-50">
                          <span className="text-gray-400 whitespace-nowrap">
                            {s.ScanDetail?.ScanDateTime ? new Date(s.ScanDetail.ScanDateTime).toLocaleString('en-IN') : ''}
                          </span>
                          <span className="font-medium text-gray-700">{s.ScanDetail?.Scan}</span>
                          <span className="text-gray-500">{s.ScanDetail?.ScannedLocation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No tracking data available</p>
            )}
            <button
              onClick={() => setTrackingOrder(null)}
              className="mt-4 w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
