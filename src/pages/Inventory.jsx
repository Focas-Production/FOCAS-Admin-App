import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'

// ─── Settings Modal ────────────────────────────────────────────────────────────

function SettingsModal({ onClose, onSaved }) {
  const [threshold, setThreshold] = useState('')
  const [phones, setPhones]       = useState(['', '', ''])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    api.get('/admin/settings').then(({ data }) => {
      setThreshold(String(data.lowStockThreshold ?? 5))
      const p = data.alertPhones || []
      setPhones([p[0] || '', p[1] || '', p[2] || ''])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    const val = Number(threshold)
    if (!Number.isFinite(val) || val < 0) {
      setError('Threshold must be a non-negative number')
      return
    }
    setSaving(true)
    try {
      await api.put('/admin/settings', {
        lowStockThreshold: val,
        alertPhones: phones.map((p) => p.trim()).filter(Boolean),
      })
      onSaved(val)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Inventory Alert Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
        ) : (
          <form onSubmit={handleSave} className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Low Stock Threshold
                <span className="text-gray-400 font-normal ml-1">(alert when stock ≤ this number)</span>
              </label>
              <input
                type="number" min="0" value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className={inputCls}
                placeholder="5"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Alert Phone Numbers
                <span className="text-gray-400 font-normal ml-1">(WhatsApp, with country code, up to 3)</span>
              </label>
              <div className="space-y-2">
                {phones.map((ph, i) => (
                  <input
                    key={i}
                    type="text"
                    value={ph}
                    onChange={(e) => setPhones((prev) => { const next = [...prev]; next[i] = e.target.value; return next })}
                    className={inputCls}
                    placeholder={`e.g. 919876543210 (phone ${i + 1})`}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

const LOG_TYPES = ['sale', 'restock', 'manual_adjustment', 'return', 'damaged']

const TYPE_STYLE = {
  sale:              'bg-red-50 text-red-700',
  restock:           'bg-green-50 text-green-700',
  manual_adjustment: 'bg-blue-50 text-blue-700',
  return:            'bg-yellow-50 text-yellow-700',
  damaged:           'bg-orange-50 text-orange-700',
}

const TYPE_LABEL = {
  sale:              'Sale',
  restock:           'Restock',
  manual_adjustment: 'Adjustment',
  return:            'Return',
  damaged:           'Damaged',
}

function TypeBadge({ type }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${TYPE_STYLE[type] || 'bg-gray-100 text-gray-600'}`}>
      {TYPE_LABEL[type] || type}
    </span>
  )
}

// ─── Stock Overview Tab ────────────────────────────────────────────────────────

function StockOverview({ onAdjust, threshold }) {
  const [overview, setOverview] = useState([])
  const [loading, setLoading]   = useState(true)

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/inventory/stock')
      setOverview(data.overview || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const lowStockCount = overview.filter((p) => p.lowStock).length

  return (
    <div className="space-y-4">
      {/* Low-stock banner */}
      {!loading && lowStockCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-red-600 font-bold text-lg">⚠</span>
          <div>
            <p className="text-sm font-semibold text-red-700">{lowStockCount} product{lowStockCount > 1 ? 's' : ''} low on stock (≤ {threshold} units)</p>
            <p className="text-xs text-red-500">Restock soon to avoid stockouts</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Product', 'Category', 'Current Stock', 'Sold', 'Restocked', 'Damaged', 'Returned', 'Last Movement', 'Action'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : overview.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                    No products with stock tracking.<br />
                    <span className="text-xs">Set a stock value on any product to start tracking.</span>
                  </td>
                </tr>
              ) : (
                overview.map((p) => (
                  <tr key={p._id} className={`hover:bg-gray-50 ${p.lowStock ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.name}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {[p.category, p.subCategory].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-bold ${p.currentStock === 0 ? 'text-red-600' : p.lowStock ? 'text-orange-600' : 'text-gray-900'}`}>
                          {p.currentStock}
                        </span>
                        {p.currentStock === 0 && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">OUT</span>
                        )}
                        {p.currentStock > 0 && p.lowStock && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">LOW</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-red-600 font-medium">{p.totalSold}</td>
                    <td className="px-4 py-3 text-green-600 font-medium">{p.totalRestocked}</td>
                    <td className="px-4 py-3 text-orange-600">{p.totalDamaged || 0}</td>
                    <td className="px-4 py-3 text-yellow-600">{p.totalReturned || 0}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {p.lastMovement ? new Date(p.lastMovement).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onAdjust(p)}
                        className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded hover:bg-blue-100 font-medium"
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Inventory Logs Tab ────────────────────────────────────────────────────────

function InventoryLogs() {
  const [logs, setLogs]         = useState([])
  const [pagination, setPag]    = useState({ total: 0, page: 1, limit: 20, totalPages: 1 })
  const [loading, setLoading]   = useState(true)
  const [filters, setFilters]   = useState({ type: '', dateFrom: '', dateTo: '' })

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: pagination.limit })
      if (filters.type)     params.set('type',     filters.type)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo)   params.set('dateTo',   filters.dateTo)

      const { data } = await api.get(`/admin/inventory/logs?${params}`)
      setLogs(data.logs || [])
      setPag(data.pagination)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filters, pagination.limit])

  useEffect(() => { load(1) }, [filters])

  return (
    <div className="space-y-4">
      {/* Log Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
          <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Types</option>
            {LOG_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => setFilters({ type: '', dateFrom: '', dateTo: '' })}
          className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
          Clear
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">{pagination.total} log entries</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Date', 'Product', 'Type', 'Change', 'Before', 'After', 'Order ID', 'Note'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">No inventory logs found</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      <div className="text-gray-400">
                        {new Date(log.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {log.productId?.name || '—'}
                    </td>
                    <td className="px-4 py-3"><TypeBadge type={log.type} /></td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${log.quantityChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {log.quantityChange > 0 ? '+' : ''}{log.quantityChange}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{log.stockBefore}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{log.stockAfter}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[120px]">
                      {log.orderId || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{log.note || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>{pagination.total} entries</span>
          <div className="flex gap-1 items-center">
            <button disabled={pagination.page === 1}
              onClick={() => load(pagination.page - 1)}
              className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50">←</button>
            <span className="px-3 py-1">Page {pagination.page} / {pagination.totalPages}</span>
            <button disabled={pagination.page === pagination.totalPages}
              onClick={() => load(pagination.page + 1)}
              className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50">→</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Manual Adjust Modal ───────────────────────────────────────────────────────

function AdjustModal({ product, allProducts, onClose, onDone }) {
  const [form, setForm]   = useState({
    productId: product?._id || '',
    quantity:  '',
    type:      'restock',
    note:      '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.quantity || Number(form.quantity) === 0) {
      setError('Quantity must be non-zero')
      return
    }
    setSaving(true)
    try {
      await api.post('/admin/inventory/adjust', {
        productId: form.productId,
        quantity:  Number(form.quantity),
        type:      form.type,
        note:      form.note || undefined,
      })
      onDone()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to adjust stock')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Adjust Stock</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Product</label>
            <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
              className={inputCls} required>
              <option value="">Select product…</option>
              {allProducts.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} {p.currentStock != null ? `(${p.currentStock} in stock)` : '(not tracked)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'restock',           label: 'Restock',    color: 'green' },
                { value: 'return',            label: 'Return',     color: 'yellow' },
                { value: 'damaged',           label: 'Damaged',    color: 'orange' },
                { value: 'manual_adjustment', label: 'Adjustment', color: 'blue' },
              ].map((opt) => (
                <label key={opt.value} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition-colors
                  ${form.type === opt.value ? `border-${opt.color}-400 bg-${opt.color}-50` : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="type" value={opt.value} checked={form.type === opt.value}
                    onChange={() => setForm((f) => ({ ...f, type: opt.value }))} className="sr-only" />
                  <TypeBadge type={opt.value} />
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Quantity
              {form.type === 'manual_adjustment' && <span className="text-gray-400 ml-1">(negative to reduce)</span>}
              {form.type === 'damaged' && <span className="text-gray-400 ml-1">(will be deducted)</span>}
            </label>
            <input type="number" value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              className={inputCls} required placeholder={form.type === 'manual_adjustment' ? 'e.g. -5 or 10' : 'e.g. 50'} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Note (optional)</label>
            <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className={inputCls} placeholder="e.g. Supplier delivery" />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
              {saving ? 'Saving…' : 'Apply Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Inventory Page ───────────────────────────────────────────────────────

export default function Inventory() {
  const [tab, setTab]                   = useState('stock') // 'stock' | 'logs'
  const [adjustTarget, setAdjustTarget] = useState(null)    // product to adjust, or true for new
  const [showSettings, setShowSettings] = useState(false)
  const [allProducts, setAllProducts]   = useState([])
  const [stockRefresh, setStockRefresh] = useState(0)
  const [threshold, setThreshold]       = useState(5)

  // Load threshold from settings on mount
  useEffect(() => {
    api.get('/admin/settings').then(({ data }) => {
      setThreshold(data.lowStockThreshold ?? 5)
    }).catch(console.error)
  }, [])

  // Load all products for the adjust modal dropdown
  useEffect(() => {
    api.get('/admin/inventory/stock').then(({ data }) => {
      setAllProducts(data.overview || [])
    }).catch(console.error)
  }, [stockRefresh])

  function handleAdjustDone() {
    setAdjustTarget(null)
    setStockRefresh((n) => n + 1)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden text-sm">
          <button onClick={() => setTab('stock')}
            className={`px-5 py-2.5 font-medium transition-colors ${tab === 'stock' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Stock Overview
          </button>
          <button onClick={() => setTab('logs')}
            className={`px-5 py-2.5 font-medium transition-colors ${tab === 'logs' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Inventory Logs
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-2 border border-gray-200 bg-white text-gray-600 text-sm rounded-lg hover:bg-gray-50 font-medium flex items-center gap-1.5"
            title="Alert Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            Alerts
          </button>
          <button
            onClick={() => setAdjustTarget(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
          >
            + Adjust Stock
          </button>
        </div>
      </div>

      {tab === 'stock'
        ? <StockOverview key={stockRefresh} onAdjust={(p) => setAdjustTarget(p)} threshold={threshold} />
        : <InventoryLogs />
      }

      {adjustTarget && (
        <AdjustModal
          product={adjustTarget === true ? null : adjustTarget}
          allProducts={allProducts}
          onClose={() => setAdjustTarget(null)}
          onDone={handleAdjustDone}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={(newThreshold) => setThreshold(newThreshold)}
        />
      )}
    </div>
  )
}
