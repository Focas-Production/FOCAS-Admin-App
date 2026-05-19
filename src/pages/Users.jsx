import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../services/api'
import Pagination from '../components/Pagination'

function fmt(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Users() {
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [expanded, setExpanded]     = useState(null)
  const [page, setPage]             = useState(1)
  const [limit, setLimit]           = useState(20)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const debounceRef = useRef(null)

  const load = useCallback(async (p = page, l = limit, s = search) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: p, limit: l })
      if (s) params.set('search', s)
      const { data } = await api.get(`/admin/users?${params}`)
      setUsers(data.users || [])
      setPagination(data.pagination || { total: 0, totalPages: 1 })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, limit, search])

  useEffect(() => { load() }, [load])

  function handleSearch(val) {
    setSearch(val)
    setPage(1)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(1, limit, val), 400)
  }

  function handlePageChange(p) {
    setPage(p)
    load(p, limit, search)
  }

  function handleLimitChange(l) {
    setLimit(l)
    setPage(1)
    load(1, l, search)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{pagination.total} total users</p>
        <input
          type="text"
          placeholder="Search name, phone, email..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Phone', 'Email', 'Admin', 'Website Access', 'Shopify Access', 'Joined', ''].map((h) => (
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
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No users found</td>
                </tr>
              ) : (
                users.map((u) => (
                  <>
                    <tr key={u._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{u.name || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{u.phoneNumber || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 truncate max-w-[180px]">{u.email || '—'}</td>
                      <td className="px-4 py-3">
                        {u.isAdmin && (
                          <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5 rounded">Admin</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {(u.access?.website?.courses?.length || 0) > 0
                          ? `${u.access.website.courses.length} course(s)`
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {(u.access?.shopify?.courses?.length || 0) > 0
                          ? `${u.access.shopify.courses.length} course(s)`
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmt(u.createdAt)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpanded(expanded === u._id ? null : u._id)}
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >
                          {expanded === u._id ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expanded === u._id && (
                      <tr key={`${u._id}-expand`} className="bg-gray-50">
                        <td colSpan={8} className="px-6 py-3 text-xs">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="font-semibold text-gray-700 mb-1">Website Access</p>
                              <div className="text-gray-500">
                                <p>Courses: {(u.access?.website?.courses || []).join(', ') || 'none'}</p>
                                <p>Features: {(u.access?.website?.features || []).join(', ') || 'none'}</p>
                              </div>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-700 mb-1">Shopify Access</p>
                              <div className="text-gray-500">
                                <p>Courses: {(u.access?.shopify?.courses || []).join(', ') || 'none'}</p>
                                <p>Features: {(u.access?.shopify?.features || []).join(', ') || 'none'}</p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={limit}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
        />
      </div>
    </div>
  )
}
