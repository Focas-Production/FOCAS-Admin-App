import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../services/api'
import StatusBadge from '../components/StatusBadge'
import Pagination from '../components/Pagination'

const SOURCE_TABS = [
  { key: '', label: 'All' },
  { key: 'website', label: 'Website' },
  { key: 'shopify', label: 'Shopify' },
  { key: 'combo', label: 'Combo' },
  { key: 'custom', label: 'Custom' },
  { key: 'shipto', label: 'Delivery' },
]

const emptyFilters = { orderId: '', phone: '', dateFrom: '', dateTo: '', fulfillmentStatus: '', awbStatus: '' }

function fmt(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtAmount(items) {
  const total = (items || []).reduce((s, i) => s + (i.amount || 0), 0)
  return total > 0 ? `₹${total.toLocaleString('en-IN')}` : '—'
}

function displayPincode(address = {}) {
  return address.pincode || address.zip || address.postalCode || address.postal_code || ''
}

// ─── Order Detail Drawer ─────────────────────────────────────────────────────

function OrderDrawer({ orderId, onClose }) {
  const [order, setOrder]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  const [showRefund, setShowRefund]     = useState(false)
  const [refundAmt, setRefundAmt]       = useState('')
  const [refundNotes, setRefundNotes]   = useState('')
  const [refundImage, setRefundImage]   = useState('')
  const [refundSaving, setRefundSaving] = useState(false)
  const [refundError, setRefundError]   = useState('')

  useEffect(() => {
    if (!orderId) return
    setLoading(true)
    api.get(`/admin/purchases/${orderId}`)
      .then(({ data }) => {
        setOrder(data.purchase)
        setNotes(data.purchase.notes || '')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [orderId])

  async function saveNotes() {
    setSaving(true)
    try {
      await api.patch(`/admin/purchases/${orderId}/notes`, { notes })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function submitRefund() {
    setRefundError('')
    if (!refundAmt || Number(refundAmt) <= 0) { setRefundError('Amount is required'); return }
    if (!refundNotes.trim())  { setRefundError('Notes is required'); return }
    if (!refundImage.trim())  { setRefundError('Proof image URL is required'); return }
    setRefundSaving(true)
    try {
      await api.post(`/admin/purchases/${orderId}/refund`, {
        amount:   Number(refundAmt),
        notes:    refundNotes.trim(),
        imageUrl: refundImage.trim(),
      })
      // Refresh to show new refund record
      const { data } = await api.get(`/admin/purchases/${orderId}`)
      setOrder(data.purchase)
      setShowRefund(false)
      setRefundAmt(''); setRefundNotes(''); setRefundImage('')
    } catch (err) {
      setRefundError(err.response?.data?.error || 'Failed to submit refund')
    } finally {
      setRefundSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col h-screen">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-900 text-base">Order Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading...</div>
        ) : !order ? (
          <div className="flex-1 flex items-center justify-center text-red-400 text-sm">Failed to load order</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Order ID + Source */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">{order.orderId || order._id}</span>
              <StatusBadge value={order.source} />
              <StatusBadge value={order.status} />
              <StatusBadge value={order.fulfillmentStatus} />
            </div>

            {/* Customer */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Customer</h3>
              <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1 text-sm">
                <p className="font-medium text-gray-800">{order.customerName || order.userId?.name || '—'}</p>
                <p className="text-gray-500">{order.customerPhone || order.userId?.phoneNumber || '—'}</p>
                {order.userId?.email && <p className="text-gray-500">{order.userId.email}</p>}
              </div>
            </section>

            {/* Delivery Address */}
            {order.address?.line1 && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Delivery Address</h3>
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 space-y-0.5">
                  <p>{order.address.line1}</p>
                  {order.address.line2 && <p>{order.address.line2}</p>}
                  <p>{[order.address.city, order.address.state, displayPincode(order.address)].filter(Boolean).join(', ')}</p>
                  {order.address.country && <p>{order.address.country}</p>}
                </div>
              </section>
            )}

            {/* Items */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Items ({order.items?.length || 0})</h3>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                {(order.items || []).map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    {item.productId?.imageUrl && (
                      <img src={item.productId.imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.name || item.productId?.name || '—'}</p>
                      {(item.category || item.subCategory || item.level) && (
                        <p className="text-xs text-gray-400">
                          {[item.category, item.subCategory, item.level].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                      {item.amount ? `₹${item.amount.toLocaleString('en-IN')}` : '—'}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2 bg-gray-50">
                  <span className="text-xs font-semibold text-gray-500">Total</span>
                  <span className="text-sm font-bold text-gray-800">{fmtAmount(order.items)}</span>
                </div>
              </div>
            </section>

            {/* Shipment */}
            {order.shipment?.awb && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Shipment</h3>
                <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">AWB</span>
                    <span className="font-mono text-gray-800">{order.shipment.awb}</span>
                  </div>
                  {order.shipment.trackingStatus && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Status</span>
                      <StatusBadge value={order.shipment.trackingStatus} />
                    </div>
                  )}
                  {order.shipment.trackingLocation && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Location</span>
                      <span className="text-gray-700">{order.shipment.trackingLocation}</span>
                    </div>
                  )}
                  {order.shipment.lastStatusAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Last update</span>
                      <span className="text-gray-700">{fmt(order.shipment.lastStatusAt)}</span>
                    </div>
                  )}
                  {/* Status history */}
                  {order.shipment.statusHistory?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                      {[...order.shipment.statusHistory].reverse().map((h, i) => (
                        <div key={i} className="flex gap-2 text-xs text-gray-500">
                          <span className="whitespace-nowrap text-gray-400">{fmt(h.timestamp)}</span>
                          <span className="font-medium text-gray-700">{h.status}</span>
                          {h.location && <span>· {h.location}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Dates */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Timeline</h3>
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Ordered</span>
                  <span className="text-gray-700">{fmt(order.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Updated</span>
                  <span className="text-gray-700">{fmt(order.updatedAt)}</span>
                </div>
              </div>
            </section>

            {/* Notes + Initiate Refund */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Admin Notes</h3>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add internal notes about this order..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={saveNotes}
                  disabled={saving}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Notes'}
                </button>
                {!showRefund && (
                  <button
                    onClick={() => setShowRefund(true)}
                    className="px-4 py-1.5 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
                  >
                    Initiate Refund
                  </button>
                )}
              </div>

              {showRefund && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50/40 px-4 py-4 space-y-3">
                  <h3 className="text-sm font-semibold text-red-700">Initiate Refund</h3>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Amount (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number" min="1"
                      value={refundAmt}
                      onChange={(e) => setRefundAmt(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Notes <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={refundNotes}
                      onChange={(e) => setRefundNotes(e.target.value)}
                      placeholder="Reason for refund…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Proof Image URL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={refundImage}
                      onChange={(e) => setRefundImage(e.target.value)}
                      placeholder="https://…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>

                  {refundError && <p className="text-xs text-red-600">{refundError}</p>}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => { setShowRefund(false); setRefundAmt(''); setRefundNotes(''); setRefundImage(''); setRefundError('') }}
                      className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitRefund}
                      disabled={refundSaving}
                      className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      {refundSaving ? 'Submitting…' : 'Submit Refund'}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Past refunds */}
            {order.refunds?.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Refund History</h3>
                <div className="space-y-2">
                  {order.refunds.map((r, i) => (
                    <div key={i} className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-red-700">−₹{r.amount?.toLocaleString('en-IN')}</span>
                        <span className="text-xs text-gray-400">
                          {r.initiatedAt ? new Date(r.initiatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                        </span>
                      </div>
                      {r.notes && <p className="text-gray-600 text-xs">{r.notes}</p>}
                      {r.imageUrl && (
                        <a href={r.imageUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline break-all">
                          View Proof
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Notes inline cell ───────────────────────────────────────────────────────

function NotesCell({ orderId, initial }) {
  const [notes, setNotes] = useState(initial || '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/admin/purchases/${orderId}/notes`, { notes })
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="border border-blue-400 rounded px-2 py-0.5 text-xs w-36 focus:outline-none"
        />
        <button onClick={save} disabled={saving} className="text-blue-600 text-xs font-medium">
          {saving ? '…' : '✓'}
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-400 text-xs">✕</button>
      </div>
    )
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Click to edit"
      className="cursor-pointer text-xs text-gray-600 hover:text-blue-600 max-w-[140px] truncate"
    >
      {notes || <span className="text-gray-300 italic">Add note</span>}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AllOrders() {
  const [orders, setOrders] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState(emptyFilters)
  const [sourceTab, setSourceTab] = useState('')
  const [limit, setLimit] = useState(20)
  const [selectedId, setSelectedId] = useState(null)
  const [actionLoading, setActionLoading] = useState({})
  const [rateModal, setRateModal] = useState(null)
  const [exporting, setExporting] = useState(false)
  const debounceRef = useRef(null)

  const load = useCallback(async (page = 1, f = filters, src = sourceTab, lim = limit) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: lim })
      // 'shipto' is a frontend alias — map to hasPhysicalItem filter
      if (src && src !== 'shipto') params.set('source', src)
      if (src === 'shipto')        params.set('hasPhysicalItem', 'true')
      if (f.orderId)             params.set('orderId', f.orderId)
      if (f.phone)               params.set('phone', f.phone)
      if (f.dateFrom)            params.set('dateFrom', f.dateFrom)
      if (f.dateTo)              params.set('dateTo', f.dateTo)
      if (f.fulfillmentStatus)   params.set('fulfillmentStatus', f.fulfillmentStatus)
      if (f.awbStatus)           params.set('awbStatus', f.awbStatus)
      const { data } = await api.get(`/admin/purchases?${params}`)
      setOrders(data.purchases || [])
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
  }, [filters, sourceTab, limit])

  useEffect(() => { load(1) }, [load])

  function handleFilterChange(key, value) {
    const f = { ...filters, [key]: value }
    setFilters(f)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(1, f, sourceTab, limit), 400)
  }

  function handleTabChange(src) {
    setSourceTab(src)
    // Clear delivery-only filters when leaving the Delivery tab
    const f = src !== 'shipto'
      ? { ...filters, awbStatus: '', fulfillmentStatus: '' }
      : filters
    setFilters(f)
    load(1, f, src, limit)
  }

  function handleClear() {
    setFilters(emptyFilters)
    load(1, emptyFilters, sourceTab, limit)
  }

  async function handleSync(id) {
    setActionLoading((p) => ({ ...p, [id]: 'sync' }))
    try {
      await api.post(`/delivery/sync/${id}`)
      await load(pagination.page, filters, sourceTab, limit)
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

  async function handleDownloadLabel(awb, id) {
    if (!awb) return
    setActionLoading((p) => ({ ...p, [id]: 'label' }))
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
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `label-${awb}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Failed to download label')
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[id]; return n })
    }
  }

  const hasFilter = filters.orderId || filters.phone || filters.dateFrom || filters.dateTo || filters.fulfillmentStatus || filters.awbStatus

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams({ page: 1, limit: 10000 })
      if (sourceTab && sourceTab !== 'shipto') params.set('source', sourceTab)
      if (sourceTab === 'shipto')              params.set('hasPhysicalItem', 'true')
      if (filters.orderId)           params.set('orderId', filters.orderId)
      if (filters.phone)             params.set('phone', filters.phone)
      if (filters.dateFrom)          params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo)            params.set('dateTo', filters.dateTo)
      if (filters.fulfillmentStatus) params.set('fulfillmentStatus', filters.fulfillmentStatus)
      if (filters.awbStatus)         params.set('awbStatus', filters.awbStatus)

      const { data } = await api.get(`/admin/purchases?${params}`)
      const rows = data.purchases || []
      if (!rows.length) { alert('No data to export'); return }

      const hasDelivery = rows.some((o) => o.hasPhysicalItem || o.shipment?.awb)

      const headers = [
        'Date', 'Order ID',
        'Customer Name', 'Customer Phone', 'Customer Email',
        'Source', 'Items', 'Total Amount',
        'Payment Status', 'Fulfillment Status', 'Admin Notes',
      ]
      if (hasDelivery) {
        headers.push('AWB', 'Tracking Status', 'Tracking Location',
          'Address Line 1', 'Address Line 2', 'City', 'State', 'Pincode')
      }

      const esc = (v) => {
        const s = String(v ?? '')
        return (s.includes(',') || s.includes('"') || s.includes('\n'))
          ? `"${s.replace(/"/g, '""')}"` : s
      }

      const csvRows = rows.map((o) => {
        const items = (o.items || [])
          .map((i) => `${i.name || i.productId?.name || 'Unknown'} (Rs.${i.amount || 0})`)
          .join(' | ')
        const total = (o.items || []).reduce((s, i) => s + (i.amount || 0), 0)
        const row = [
          new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          o.orderId || o._id,
          o.customerName || o.userId?.name || '',
          o.customerPhone || o.userId?.phoneNumber || '',
          o.userId?.email || '',
          o.source || '',
          items,
          total,
          o.status || '',
          o.fulfillmentStatus || '',
          o.notes || '',
        ]
        if (hasDelivery) {
          row.push(
            o.shipment?.awb || '',
            o.shipment?.trackingStatus || '',
            o.shipment?.trackingLocation || '',
            o.address?.line1 || '',
            o.address?.line2 || '',
            o.address?.city || '',
            o.address?.state || '',
            o.address?.pincode || o.address?.zip || o.address?.postalCode || '',
          )
        }
        return row
      })

      const csv = [headers, ...csvRows].map((r) => r.map(esc).join(',')).join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const tab  = sourceTab ? `${sourceTab}-` : ''
      const date = new Date().toISOString().slice(0, 10)
      a.download = `orders-${tab}${date}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export failed: ' + (err.message || 'Unknown error'))
    } finally {
      setExporting(false)
    }
  }

  const COLS = ['Order ID', 'Customer', 'Source', 'Items', 'Amount', 'Payment', 'Fulfillment', 'Delivery Status', 'AWB', 'Notes', 'Date', 'Actions']

  return (
    <div className="space-y-4">
      {/* Title + filter row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">{pagination.total} total orders</p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Global search — resets to page 1, queries all records */}
          <input
            type="text"
            placeholder="Order ID"
            value={filters.orderId}
            onChange={(e) => handleFilterChange('orderId', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Phone number"
            value={filters.phone}
            onChange={(e) => handleFilterChange('phone', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            title="From date"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-xs">to</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            title="To date"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Delivery status filters — only on Delivery tab */}
          {sourceTab === 'shipto' && (
            <>
              <select
                value={filters.awbStatus}
                onChange={(e) => handleFilterChange('awbStatus', e.target.value)}
                title="Delivery Sync"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Delivery</option>
                <option value="unsynced">Not Synced</option>
                <option value="synced">Synced (Has AWB)</option>
              </select>

              <select
                value={filters.fulfillmentStatus}
                onChange={(e) => handleFilterChange('fulfillmentStatus', e.target.value)}
                title="Fulfillment Status"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Fulfillment</option>
                <option value="unfulfilled">Unfulfilled</option>
                <option value="partial">Partial</option>
                <option value="fulfilled">Fulfilled</option>
                <option value="restocked">Restocked</option>
              </select>
            </>
          )}

          {hasFilter && (
            <button onClick={handleClear} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Clear
            </button>
          )}
          {(hasFilter || sourceTab) && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {exporting ? 'Exporting…' : '↓ Export CSV'}
            </button>
          )}
        </div>
      </div>

      {/* Source tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              sourceTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {COLS.map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(COLS.length)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length} className="px-4 py-8 text-center text-gray-400">No orders found</td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr
                    key={o._id}
                    onClick={() => setSelectedId(o._id)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-[140px] truncate">{o.orderId || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-xs">{o.customerName || o.userId?.name || '—'}</div>
                      <div className="text-gray-400 text-xs">{o.customerPhone || o.userId?.phoneNumber || ''}</div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={o.source} /></td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{(o.items || []).length} item(s)</td>
                    <td className="px-4 py-3 text-gray-700 font-medium text-xs">{fmtAmount(o.items)}</td>
                    <td className="px-4 py-3"><StatusBadge value={o.status} /></td>
                    <td className="px-4 py-3"><StatusBadge value={o.fulfillmentStatus} /></td>
                    <td className="px-4 py-3">
                      <StatusBadge value={o.shipment?.trackingStatus || null} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{o.shipment?.awb || '—'}</td>
                    <td className="px-4 py-3">
                      <NotesCell orderId={o._id} initial={o.notes} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmt(o.createdAt)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {(o.hasPhysicalItem || (o.items || []).some(i => i.productId?.shipToHome)) && (
                        <div className="flex items-center gap-1.5">
                          {o.shipment?.awb ? (
                            <button
                              onClick={() => handleDownloadLabel(o.shipment.awb, o._id)}
                              disabled={!!actionLoading[o._id]}
                              className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 disabled:opacity-50 whitespace-nowrap"
                            >
                              {actionLoading[o._id] === 'label' ? '...' : 'Label'}
                            </button>
                          ) : (o.source !== 'custom' || o.show_sync) ? (() => {
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
                          })() : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={limit}
          onPageChange={(p) => load(p, filters, sourceTab, limit)}
          onLimitChange={(lim) => { setLimit(lim); load(1, filters, sourceTab, lim) }}
        />
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

      {/* Order detail drawer */}
      {selectedId && <OrderDrawer orderId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  )
}
