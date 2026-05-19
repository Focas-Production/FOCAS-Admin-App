import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`

function StatCard({ label, value, sub, to, color }) {
  const card = (
    <div className={`bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
  return to ? <Link to={to}>{card}</Link> : card
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

        const [purchasesRes, usersRes, productsRes, shipmentsRes, summaryRes, stockRes, webRes, shopRes, customRes, comboRes, paymentRes] = await Promise.all([
          api.get('/admin/purchases?page=1&limit=1'),
          api.get('/admin/users?page=1&limit=1'),
          api.get('/admin/products?page=1&limit=1'),
          api.get('/delivery/shipments?page=1&limit=1'),
          api.get(`/admin/sales/summary?dateFrom=${monthStart}&dateTo=${today}`),
          api.get('/admin/inventory/stock'),
          api.get('/admin/purchases?source=website&page=1&limit=1'),
          api.get('/admin/purchases?source=shopify&page=1&limit=1'),
          api.get('/admin/purchases?source=custom&page=1&limit=1'),
          api.get('/admin/purchases?source=combo&page=1&limit=1'),
          api.get('/payment?page=1&limit=1'),
        ])

        const allPurchases = purchasesRes.data.pagination?.total || 0
        const stockOverview = stockRes.data.overview || []

        setStats({
          total:        allPurchases,
          website:      webRes.data.pagination?.total      || 0,
          shopify:      shopRes.data.pagination?.total     || 0,
          custom:       customRes.data.pagination?.total   || 0,
          combo:        comboRes.data.pagination?.total    || 0,
          paymentLinks: paymentRes.data.pagination?.total  || 0,
          shipments:    shipmentsRes.data.pagination?.total || 0,
          users:        usersRes.data.pagination?.total    || 0,
          products:     productsRes.data.pagination?.total || 0,
          revenue:      summaryRes.data.totalRevenue || 0,
          orders:       summaryRes.data.totalOrders  || 0,
          lowStock:     stockOverview.filter((p) => p.lowStock),
          outOfStock:   stockOverview.filter((p) => p.currentStock === 0),
        })
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 animate-pulse h-24" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Revenue This Month" value={fmt(stats?.revenue)} color="text-emerald-600"
          sub={`${stats?.orders || 0} orders`} to="/sales" />
        <StatCard label="Total Orders" value={stats?.total} to="/orders" color="text-blue-600" />
        <StatCard label="Total Users" value={stats?.users} to="/users" color="text-indigo-600" />
        <StatCard label="Products" value={stats?.products} to="/products" color="text-orange-600" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Website Orders"      value={stats?.website}      to="/orders"   color="text-blue-500" />
        <StatCard label="Shopify Orders"      value={stats?.shopify}      to="/orders"   color="text-purple-600" />
        <StatCard label="Custom Orders"       value={stats?.custom}       to="/orders"   color="text-emerald-600" />
        <StatCard label="Combo Orders"        value={stats?.combo}        to="/orders"   color="text-orange-500" />
        <StatCard label="Razorpay Links"      value={stats?.paymentLinks} to="/payments" color="text-indigo-600" />
        <StatCard label="ShipToHome Orders"   value={stats?.shipments}    to="/orders"   color="text-sky-600"
          sub="With delivery tracking" />
      </div>

      {/* Low Stock Alerts */}
      {!loading && (stats?.outOfStock?.length > 0 || stats?.lowStock?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {stats.outOfStock.length > 0 && (
            <Link to="/inventory" className="bg-red-50 border border-red-200 rounded-xl p-4 hover:bg-red-100 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-red-600 font-bold">⚠</span>
                <p className="text-sm font-semibold text-red-700">Out of Stock ({stats.outOfStock.length})</p>
                <span className="ml-auto text-red-500 text-sm">→</span>
              </div>
              <div className="space-y-1">
                {stats.outOfStock.slice(0, 3).map((p) => (
                  <p key={p._id} className="text-xs text-red-600 truncate">{p.name}</p>
                ))}
                {stats.outOfStock.length > 3 && (
                  <p className="text-xs text-red-400">+{stats.outOfStock.length - 3} more</p>
                )}
              </div>
            </Link>
          )}
          {stats.lowStock.filter((p) => p.currentStock > 0).length > 0 && (
            <Link to="/inventory" className="bg-orange-50 border border-orange-200 rounded-xl p-4 hover:bg-orange-100 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-orange-500 font-bold">!</span>
                <p className="text-sm font-semibold text-orange-700">
                  Low Stock ({stats.lowStock.filter((p) => p.currentStock > 0).length})
                </p>
                <span className="ml-auto text-orange-500 text-sm">→</span>
              </div>
              <div className="space-y-1">
                {stats.lowStock.filter((p) => p.currentStock > 0).slice(0, 3).map((p) => (
                  <p key={p._id} className="text-xs text-orange-600 truncate">{p.name} — {p.currentStock} left</p>
                ))}
                {stats.lowStock.filter((p) => p.currentStock > 0).length > 3 && (
                  <p className="text-xs text-orange-400">+{stats.lowStock.filter((p) => p.currentStock > 0).length - 3} more</p>
                )}
              </div>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <Link to="/sales" className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors">
              <span className="text-sm font-medium text-emerald-800">Sales Analytics</span>
              <span className="text-emerald-600 text-sm">→</span>
            </Link>
            <Link to="/accounts" className="flex items-center justify-between p-3 rounded-lg bg-teal-50 hover:bg-teal-100 transition-colors">
              <span className="text-sm font-medium text-teal-800">Accounts & Ledger</span>
              <span className="text-teal-600 text-sm">→</span>
            </Link>
            <Link to="/payments" className="flex items-center justify-between p-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors">
              <span className="text-sm font-medium text-indigo-800">Razorpay Payment Links</span>
              <span className="text-indigo-600 text-sm">→</span>
            </Link>
            <Link to="/inventory" className="flex items-center justify-between p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors">
              <span className="text-sm font-medium text-blue-800">Inventory & Stock</span>
              <span className="text-blue-600 text-sm">→</span>
            </Link>
            <Link to="/orders" className="flex items-center justify-between p-3 rounded-lg bg-sky-50 hover:bg-sky-100 transition-colors">
              <span className="text-sm font-medium text-sky-800">All Orders — Sync & Delivery</span>
              <span className="text-sky-600 text-sm">→</span>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-3">Order Breakdown</h3>
          <div className="space-y-3">
            {[
              { label: 'Website',        value: stats?.website,      color: 'bg-blue-500' },
              { label: 'Shopify',        value: stats?.shopify,      color: 'bg-purple-500' },
              { label: 'Custom',         value: stats?.custom,       color: 'bg-emerald-500' },
              { label: 'Combo',          value: stats?.combo,        color: 'bg-orange-500' },
              { label: 'Razorpay Links', value: stats?.paymentLinks, color: 'bg-indigo-500' },
            ].map((row) => ({...row, total: (stats?.total || 0) + (stats?.paymentLinks || 0)})).map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{row.label}</span>
                  <span className="font-medium">{row.value}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`${row.color} h-2 rounded-full`}
                    style={{ width: row.total ? `${Math.round((row.value / row.total) * 100)}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
