import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Pagination from '../components/Pagination'
import PriceHistoryModal from '../components/PriceHistoryModal'

const LEVELS = ['Foundation', 'Intermediate', 'Final']

const empty = {
  name: '', description: '', price: '', originalPrice: '', imageUrl: '',
  productUrl: '', websiteUrl: '',
  shopifyProductId: '', shopifyPrice: '', comboPrice: '',
  category: '', subCategory: '', level: '',
  weight: '', shipToHome: false, isCourse: false,
  courses: '', features: '',
  stock: '',
  showInComboStore: false,
  isBundle: false,
  bundleItems: [],
  priceNote: '',
}

export default function Products() {
  const [products, setProducts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [filter, setFilter]         = useState('all')
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)
  const [limit, setLimit]           = useState(20)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [counts, setCounts]         = useState({ catalog: 0, custom: 0, bundle: 0 })

  const [copied, setCopied] = useState('')
  const [priceHistoryModal, setPriceHistoryModal] = useState(null)

  async function copyLink(text, key = 'link') {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for non-HTTPS / older browsers
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopied(key)
    setTimeout(() => setCopied(''), 1500)
  }

  // Bundle item picker state
  const [bundleProductsList, setBundleProductsList] = useState([])
  const [bundleSearch, setBundleSearch]             = useState('')
  const [showBundleCustomForm, setShowBundleCustomForm] = useState(false)
  const [bundleCustomName, setBundleCustomName]     = useState('')
  const [bundleCustomPrice, setBundleCustomPrice]   = useState('')

  async function load(p = page, l = limit, f = filter, s = search) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: p, limit: l, filter: f })
      if (s.trim()) params.set('search', s.trim())
      const { data } = await api.get(`/admin/products?${params}`)
      setProducts(data.products || [])
      setPagination(data.pagination || { total: 0, totalPages: 1 })
      setCounts(data.counts || { catalog: 0, custom: 0 })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Debounced search: reset to page 1 and reload when the term settles
  const firstSearch = useRef(true)
  useEffect(() => {
    if (firstSearch.current) { firstSearch.current = false; return }
    const t = setTimeout(() => {
      setPage(1)
      load(1, limit, filter, search)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  async function ensureBundleProductsLoaded() {
    if (bundleProductsList.length > 0) return
    try {
      const { data } = await api.get('/admin/products?limit=1000')
      setBundleProductsList((data.products || []).filter(p => !p.isBundle))
    } catch {}
  }

  function openCreate() {
    setError('')
    setBundleSearch('')
    setShowBundleCustomForm(false)
    setBundleCustomName('')
    setBundleCustomPrice('')
    setModal({ mode: 'create', data: { ...empty } })
  }

  function openEdit(product) {
    setError('')
    setBundleSearch('')
    setShowBundleCustomForm(false)
    setBundleCustomName('')
    setBundleCustomPrice('')
    setModal({
      mode: 'edit',
      id: product._id,
      data: {
        name: product.name || '',
        description: product.description || '',
        price: product.price ?? '',
        originalPrice: product.originalPrice ?? '',
        imageUrl: product.imageUrl || '',
        productUrl: product.productUrl || '',
        websiteUrl: product.websiteUrl || '',
        shopifyProductId: product.shopifyProductId || '',
        shopifyPrice: product.shopifyPrice ?? '',
        comboPrice: product.comboPrice ?? '',
        category: product.category || '',
        subCategory: product.subCategory || '',
        level: product.level || '',
        weight: product.weight ?? '',
        shipToHome: product.shipToHome ?? false,
        isCourse: product.isCourse ?? false,
        courses: (product.grants?.courses || []).join(', '),
        features: (product.grants?.features || []).join(', '),
        stock: product.stock ?? '',
        showInComboStore: product.showInComboStore ?? false,
        isBundle: product.isBundle ?? false,
        bundleItems: (product.bundleItems || []).map(bi => ({
          product_id: bi.product_id?.toString() || null,
          name:       bi.name || '',
          price:      bi.price || 0,
          isCustom:   bi.isCustom || false,
        })),
        priceNote: '',
      },
    })
    if (product.isBundle) ensureBundleProductsLoaded()
  }

  function setField(key, value) {
    setModal((prev) => ({ ...prev, data: { ...prev.data, [key]: value } }))
  }

  function addBundleItemFromProduct(prod) {
    if (modal.data.bundleItems.some(bi => bi.product_id === prod._id)) return
    setField('bundleItems', [...modal.data.bundleItems, {
      product_id: prod._id,
      name:       prod.name,
      price:      prod.price || 0,
      isCustom:   prod.isCustom || false,
    }])
    setBundleSearch('')
  }

  function addBundleCustomItem() {
    if (!bundleCustomName.trim()) return
    setField('bundleItems', [...modal.data.bundleItems, {
      product_id: null,
      name:       bundleCustomName.trim(),
      price:      Number(bundleCustomPrice) || 0,
      isCustom:   true,
    }])
    setBundleCustomName('')
    setBundleCustomPrice('')
    setShowBundleCustomForm(false)
  }

  function removeBundleItem(idx) {
    setField('bundleItems', modal.data.bundleItems.filter((_, i) => i !== idx))
  }

  function setBundleItemPrice(idx, price) {
    const next = [...modal.data.bundleItems]
    next[idx] = { ...next[idx], price: Number(price) || 0 }
    setField('bundleItems', next)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    const d = modal.data
    if (d.shipToHome && (!d.weight || Number(d.weight) <= 0)) {
      setError('Weight (grams) is required for ShipToHome products')
      return
    }
    if (d.isBundle && d.bundleItems.length === 0) {
      setError('A bundle must have at least one item')
      return
    }
    if (d.isCourse && !d.websiteUrl?.trim()) {
      setError('Website Link is required when "Is Course" is enabled')
      return
    }
    if (d.showInComboStore && !d.productUrl?.trim()) {
      setError('Combo Store Link is required when "Show in Combo Store" is enabled')
      return
    }
    setSaving(true)
    const payload = {
      name: d.name,
      description: d.description || undefined,
      price: d.price !== '' ? Number(d.price) : undefined,
      originalPrice: d.originalPrice !== '' ? Number(d.originalPrice) : undefined,
      shopifyPrice: d.shopifyPrice !== '' ? Number(d.shopifyPrice) : null,
      comboPrice: d.comboPrice !== '' ? Number(d.comboPrice) : null,
      imageUrl: d.imageUrl || undefined,
      productUrl: d.productUrl?.trim() || null,
      websiteUrl: d.websiteUrl?.trim() || null,
      shopifyProductId: d.shopifyProductId || undefined,
      category: d.category || undefined,
      subCategory: d.subCategory || undefined,
      level: d.level || undefined,
      weight: d.weight !== '' ? Number(d.weight) : undefined,
      shipToHome: d.shipToHome,
      isCourse: d.isCourse,
      grants: {
        courses: d.courses ? d.courses.split(',').map((s) => s.trim()).filter(Boolean) : [],
        features: d.features ? d.features.split(',').map((s) => s.trim()).filter(Boolean) : [],
      },
      stock: d.stock !== '' ? Number(d.stock) : null,
      showInComboStore: d.showInComboStore,
      isBundle: d.isBundle,
      bundleItems: d.isBundle ? d.bundleItems : [],
      priceNote: d.priceNote?.trim() || undefined,
    }
    try {
      if (modal.mode === 'create') {
        await api.post('/admin/products', payload)
      } else {
        await api.put(`/admin/products/${modal.id}`, payload)
      }
      setModal(null)
      await load(page, limit, filter, search)
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/admin/products/${id}`)
      setDeleteConfirm(null)
      await load(page, limit, filter, search)
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed')
    }
  }

  function handleFilterChange(f) {
    setFilter(f)
    setPage(1)
    load(1, limit, f, search)
  }

  function handlePageChange(p) {
    setPage(p)
    load(p, limit, filter, search)
  }

  function handleLimitChange(l) {
    setLimit(l)
    setPage(1)
    load(1, l, filter, search)
  }

  const catalogCount = counts.catalog
  const customCount  = counts.custom
  const bundleCount  = counts.bundle || 0
  const hiddenCount  = counts.hidden || 0
  const displayed    = products

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{products.length} products</p>
          {customCount > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              {customCount} custom
            </span>
          )}
          {bundleCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {bundleCount} bundle{bundleCount !== 1 ? 's' : ''}
            </span>
          )}
          {hiddenCount > 0 && (
            <span className="text-xs bg-gray-300 text-gray-700 px-2 py-0.5 rounded-full font-medium">
              {hiddenCount} hidden
            </span>
          )}
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
        >
          + New Product
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, category, or Shopify ID…"
          className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            title="Clear"
          >
            &times;
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[['all', 'All Products'], ['catalog', 'Catalog'], ['custom', 'Custom Products'], ['bundle', 'Bundles'], ['hidden', 'Hidden']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => handleFilterChange(val)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === val
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {val === 'custom' && customCount > 0 && (
              <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{customCount}</span>
            )}
            {val === 'catalog' && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{catalogCount}</span>
            )}
            {val === 'bundle' && bundleCount > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{bundleCount}</span>
            )}
            {val === 'hidden' && hiddenCount > 0 && (
              <span className="ml-1.5 text-xs bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded-full font-medium">{hiddenCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Price', 'Stock', 'Category', 'Level', 'Course', 'ShipToHome', 'Weight', 'Store', 'Shopify ID', 'Actions'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(10)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                    {filter === 'custom' ? 'No custom products yet. Create them via Payment Links.' : 'No products yet'}
                  </td>
                </tr>
              ) : (
                displayed.map((p) => (
                  <tr key={p._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{p.name}</span>
                        {p.isBundle && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                            Bundle · {p.bundleItems?.length || 0} items
                          </span>
                        )}
                        {p.isCustom && !p.isBundle && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Custom</span>
                        )}
                      </div>
                      <div className="text-gray-400 text-xs truncate max-w-xs">
                        {p.isBundle && p.bundleItems?.length > 0
                          ? p.bundleItems.map(bi => bi.name).join(', ')
                          : p.description}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="text-xs space-y-0.5">
                        <div><span className="text-gray-400">Web:</span> {p.price != null ? `₹${p.price.toLocaleString('en-IN')}` : '—'}</div>
                        <div><span className="text-gray-400">Shopify:</span> {p.shopifyPrice != null ? `₹${p.shopifyPrice.toLocaleString('en-IN')}` : '—'}</div>
                        <div><span className="text-gray-400">Combo:</span> {p.comboPrice != null ? `₹${p.comboPrice.toLocaleString('en-IN')}` : '—'}</div>
                        {p.originalPrice && (
                          <div className="text-gray-300 line-through">₹{p.originalPrice.toLocaleString('en-IN')}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.stock == null ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${p.stock === 0 ? 'text-red-600' : p.stock <= 5 ? 'text-orange-600' : 'text-gray-800'}`}>
                          {p.stock}
                          {p.stock === 0 && <span className="ml-1 text-xs font-medium bg-red-100 text-red-600 px-1 rounded">OUT</span>}
                          {p.stock > 0 && p.stock <= 5 && <span className="ml-1 text-xs font-medium bg-orange-100 text-orange-600 px-1 rounded">LOW</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {[p.category, p.subCategory].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.level || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${p.isCourse ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {p.isCourse ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${p.shipToHome ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-400'}`}>
                        {p.shipToHome ? 'STH' : 'Digital'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.weight ? `${p.weight}g` : '—'}</td>
                    <td className="px-4 py-3">
                      {p.showInComboStore
                        ? <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Combo Store</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[120px]">{p.shopifyProductId || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {p.showInComboStore && p.productUrl && (
                          <button
                            onClick={() => copyLink(p.productUrl, `row-combo-${p._id}`)}
                            title={p.productUrl}
                            className="px-2 py-1 bg-purple-50 text-purple-600 text-xs rounded hover:bg-purple-100"
                          >
                            {copied === `row-combo-${p._id}` ? 'Copied!' : 'Combo'}
                          </button>
                        )}
                        {p.isCourse && p.websiteUrl && (
                          <button
                            onClick={() => copyLink(p.websiteUrl, `row-web-${p._id}`)}
                            title={p.websiteUrl}
                            className="px-2 py-1 bg-sky-50 text-sky-600 text-xs rounded hover:bg-sky-100"
                          >
                            {copied === `row-web-${p._id}` ? 'Copied!' : 'Website'}
                          </button>
                        )}
                        <button
                          onClick={() => setPriceHistoryModal({ id: p._id, name: p.name })}
                          title="View price change history"
                          className="px-2 py-1 bg-green-50 text-green-600 text-xs rounded hover:bg-green-100 font-medium"
                        >
                          💰 History
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await api.put(`/admin/products/${p._id}`, { isHidden: !p.isHidden })
                              await load(page, limit, filter, search)
                            } catch (err) {
                              alert(err.response?.data?.error || 'Failed to update product')
                            }
                          }}
                          className={`px-2 py-1 text-xs rounded ${
                            p.isHidden
                              ? 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'
                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                          title={p.isHidden ? 'Unhide product' : 'Hide product'}
                        >
                          {p.isHidden ? '👁️ Show' : '👁️‍🗨️ Hide'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(p)}
                          className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
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

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                {modal.mode === 'create' ? 'New Product' : 'Edit Product'}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                  <input required value={modal.data.name} onChange={(e) => setField('name', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                  <textarea rows={2} value={modal.data.description} onChange={(e) => setField('description', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Website Price (₹)</label>
                  <input type="number" min="0" value={modal.data.price} onChange={(e) => setField('price', e.target.value)}
                    placeholder="React site — book only"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Original Price (₹)</label>
                  <input type="number" min="0" value={modal.data.originalPrice} onChange={(e) => setField('originalPrice', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Shopify Price (₹)</label>
                  <input type="number" min="0" value={modal.data.shopifyPrice} onChange={(e) => setField('shopifyPrice', e.target.value)}
                    placeholder="Price on Shopify store"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Combo Price (₹)</label>
                  <input type="number" min="0" value={modal.data.comboPrice} onChange={(e) => setField('comboPrice', e.target.value)}
                    placeholder="React site — course + book bundle"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Price Change Note (optional)
                    <span className="text-xs text-gray-400 font-normal ml-2">📝 Why did you change the price?</span>
                  </label>
                  <input type="text" value={modal.data.priceNote} onChange={(e) => setField('priceNote', e.target.value)}
                    placeholder="e.g., Summer sale, demand increase, cost adjustment..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <p className="text-xs text-gray-400 mt-1">This note will be saved in the price history for audit trail.</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Image URL</label>
                  <input value={modal.data.imageUrl} onChange={(e) => setField('imageUrl', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                {/* Direct purchase links — auto-generated based on product ID */}
                <div className="col-span-2 border border-gray-200 rounded-lg p-4 bg-gradient-to-br from-blue-50 to-green-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">🔗 Direct Purchase Links</p>
                    {modal.mode === 'edit' && modal.id && (!modal.data.productUrl?.trim() || !modal.data.websiteUrl?.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setField('productUrl', `https://store.focasedu.com/product/${modal.id}`)
                          setField('websiteUrl', `https://focasedu.com/course/${modal.id}?pay=1`)
                        }}
                        className="px-3 py-1 text-xs rounded-lg border border-green-300 bg-green-100 text-green-700 hover:bg-green-200 font-medium"
                      >
                        ✨ Auto-fill
                      </button>
                    )}
                  </div>
                  {modal.data.isCourse && (
                    <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                      ✓ Website Link required (Is Course)
                    </p>
                  )}
                  {modal.data.showInComboStore && (
                    <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1">
                      ✓ Combo Store Link required (Show in Combo Store)
                    </p>
                  )}

                  {/* Product ID — copy to build the links above */}
                  {modal.mode === 'edit' && modal.id && (
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <span className="text-xs font-medium text-gray-500 shrink-0">Product ID</span>
                      <code className="flex-1 text-xs font-mono text-gray-800 truncate">{modal.id}</code>
                      <button
                        type="button"
                        onClick={() => copyLink(modal.id, 'productId')}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium shrink-0"
                      >
                        {copied === 'productId' ? 'Copied!' : 'Copy ID'}
                      </button>
                    </div>
                  )}

                  {/* Product URL 1 — Combo store */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      <span className="inline-block text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded mr-1.5 align-middle">COMBO</span>
                      Combo Store Link
                      {modal.data.showInComboStore && <span className="ml-1 text-red-500">*</span>}
                      <span className="ml-1.5 text-xs text-gray-400 font-normal">(auto-filled: store.focasedu.com/product/&lt;id&gt;)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={modal.data.productUrl}
                        onChange={(e) => setField('productUrl', e.target.value)}
                        placeholder="https://store.focasedu.com/product/<id>"
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                          modal.data.showInComboStore && !modal.data.productUrl?.trim()
                            ? 'border-red-400 focus:ring-red-400'
                            : 'border-gray-300 focus:ring-blue-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => copyLink(modal.data.productUrl, 'combo')}
                        disabled={!modal.data.productUrl?.trim()}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium shrink-0"
                      >
                        {copied === 'combo' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    {modal.data.showInComboStore && !modal.data.productUrl?.trim() && (
                      <p className="text-xs text-red-500 mt-1">Combo Store Link is required</p>
                    )}
                  </div>

                  {/* Product URL 2 — Website */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      <span className="inline-block text-[10px] font-semibold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded mr-1.5 align-middle">WEBSITE</span>
                      Website Link
                      {modal.data.isCourse && <span className="ml-1 text-red-500">*</span>}
                      <span className="ml-1.5 text-xs text-gray-400 font-normal">(auto-filled: focasedu.com/course/&lt;id&gt;?pay=1)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={modal.data.websiteUrl}
                        onChange={(e) => setField('websiteUrl', e.target.value)}
                        placeholder="https://focasedu.com/course/<id>?pay=1"
                        className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                          modal.data.isCourse && !modal.data.websiteUrl?.trim()
                            ? 'border-red-400 focus:ring-red-400'
                            : 'border-gray-300 focus:ring-blue-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => copyLink(modal.data.websiteUrl, 'website')}
                        disabled={!modal.data.websiteUrl?.trim()}
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium shrink-0"
                      >
                        {copied === 'website' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    {modal.data.isCourse && !modal.data.websiteUrl?.trim() && (
                      <p className="text-xs text-red-500 mt-1">Website Link is required</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                  <input value={modal.data.category} onChange={(e) => setField('category', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Sub Category</label>
                  <input value={modal.data.subCategory} onChange={(e) => setField('subCategory', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Level</label>
                  <select value={modal.data.level} onChange={(e) => setField('level', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">None</option>
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Shopify Product ID</label>
                  <input value={modal.data.shopifyProductId} onChange={(e) => setField('shopifyProductId', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Weight (grams)
                    {modal.data.shipToHome && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  <input
                    type="number" min="0" value={modal.data.weight}
                    onChange={(e) => setField('weight', e.target.value)}
                    required={modal.data.shipToHome}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                      modal.data.shipToHome && (!modal.data.weight || Number(modal.data.weight) <= 0)
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-gray-300 focus:ring-blue-500'
                    }`}
                  />
                  {modal.data.shipToHome && (!modal.data.weight || Number(modal.data.weight) <= 0) && (
                    <p className="text-xs text-red-500 mt-1">Weight is required for ShipToHome products</p>
                  )}
                </div>
                <div className="flex items-center gap-2 self-end pb-2">
                  <input type="checkbox" id="isCourse" checked={modal.data.isCourse}
                    onChange={(e) => setField('isCourse', e.target.checked)} className="rounded" />
                  <label htmlFor="isCourse" className="text-sm text-gray-700">Is Course (digital learning)</label>
                </div>
                <div className="flex items-center gap-2 self-end pb-2">
                  <input type="checkbox" id="shipToHome" checked={modal.data.shipToHome}
                    onChange={(e) => setField('shipToHome', e.target.checked)} className="rounded" />
                  <label htmlFor="shipToHome" className="text-sm text-gray-700">ShipToHome (physical delivery)</label>
                </div>
                <div className="col-span-2 flex items-center gap-2 pb-2">
                  <input type="checkbox" id="showInComboStore" checked={modal.data.showInComboStore}
                    onChange={(e) => setField('showInComboStore', e.target.checked)} className="rounded accent-blue-600" />
                  <label htmlFor="showInComboStore" className="text-sm text-gray-700">
                    Show in Combo Store
                    <span className="ml-1.5 text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full">
                      React client
                    </span>
                  </label>
                </div>

                {/* Is Bundle toggle */}
                <div className="col-span-2 flex items-center gap-2 pb-1">
                  <input type="checkbox" id="isBundle" checked={modal.data.isBundle}
                    onChange={(e) => {
                      setField('isBundle', e.target.checked)
                      if (e.target.checked) ensureBundleProductsLoaded()
                    }}
                    className="rounded accent-amber-600" />
                  <label htmlFor="isBundle" className="text-sm text-gray-700">
                    Is Bundle
                    <span className="ml-1.5 text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                      Groups multiple products
                    </span>
                  </label>
                </div>

                {/* Bundle items editor */}
                {modal.data.isBundle && (
                  <div className="col-span-2 border border-amber-200 rounded-lg p-4 bg-amber-50/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                        Bundle Items ({modal.data.bundleItems.length})
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowBundleCustomForm(v => !v)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 text-amber-600 hover:bg-amber-100 font-medium"
                      >
                        {showBundleCustomForm ? 'Cancel' : '+ Custom Item'}
                      </button>
                    </div>

                    {/* Inline custom item form */}
                    {showBundleCustomForm && (
                      <div className="flex gap-2 items-center">
                        <input
                          value={bundleCustomName}
                          onChange={(e) => setBundleCustomName(e.target.value)}
                          placeholder="Item name"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        <input
                          type="number" min="0"
                          value={bundleCustomPrice}
                          onChange={(e) => setBundleCustomPrice(e.target.value)}
                          placeholder="₹ Price"
                          className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        <button
                          type="button"
                          onClick={addBundleCustomItem}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                        >
                          Add
                        </button>
                      </div>
                    )}

                    {/* Search existing products */}
                    <div>
                      <input
                        type="text"
                        value={bundleSearch}
                        onChange={(e) => setBundleSearch(e.target.value)}
                        placeholder="Search existing products to add…"
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      {bundleSearch && (
                        <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-36 overflow-y-auto bg-white shadow-sm">
                          {bundleProductsList
                            .filter(p => p.name.toLowerCase().includes(bundleSearch.toLowerCase()))
                            .slice(0, 10)
                            .map(prod => {
                              const isAdded = modal.data.bundleItems.some(bi => bi.product_id === prod._id)
                              return (
                                <button
                                  key={prod._id}
                                  type="button"
                                  disabled={isAdded}
                                  onClick={() => addBundleItemFromProduct(prod)}
                                  className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm border-b border-gray-50 last:border-0 transition-colors ${
                                    isAdded ? 'text-gray-300 cursor-not-allowed bg-gray-50' : 'hover:bg-amber-50'
                                  }`}
                                >
                                  <span className="flex items-center gap-2">
                                    {prod.name}
                                    {prod.isCustom && <span className="text-xs bg-purple-100 text-purple-600 px-1 rounded">Custom</span>}
                                  </span>
                                  <span className="text-gray-400 text-xs">{prod.price ? `₹${prod.price.toLocaleString()}` : '—'}</span>
                                </button>
                              )
                            })}
                          {bundleProductsList.filter(p => p.name.toLowerCase().includes(bundleSearch.toLowerCase())).length === 0 && (
                            <p className="px-3 py-2 text-sm text-gray-400">No products found</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Selected bundle items */}
                    {modal.data.bundleItems.length > 0 ? (
                      <div className="space-y-1.5">
                        {modal.data.bundleItems.map((bi, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <span className="flex-1 text-sm text-gray-800 truncate">{bi.name}</span>
                            {!bi.product_id && (
                              <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded shrink-0">Custom</span>
                            )}
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs text-gray-400">₹</span>
                              <input
                                type="number" min="0"
                                value={bi.price}
                                onChange={(e) => setBundleItemPrice(idx, e.target.value)}
                                className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-400"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeBundleItem(idx)}
                              className="text-red-400 hover:text-red-600 text-base leading-none shrink-0"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs text-amber-700 px-1 pt-1">
                          <span>{modal.data.bundleItems.length} item{modal.data.bundleItems.length !== 1 ? 's' : ''}</span>
                          <span className="font-medium">
                            Sum: ₹{modal.data.bundleItems.reduce((s, bi) => s + (bi.price || 0), 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 text-center py-2 italic">Search and add products above</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Stock Quantity</label>
                  <input type="number" min="0" value={modal.data.stock} onChange={(e) => setField('stock', e.target.value)}
                    placeholder="Leave blank to disable tracking"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">Set a number to enable inventory tracking for this product</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Grant Courses (comma-separated)</label>
                  <input value={modal.data.courses} onChange={(e) => setField('courses', e.target.value)}
                    placeholder="e.g. ca-inter-g1, ca-inter-g2"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Grant Features (comma-separated)</label>
                  <input value={modal.data.features} onChange={(e) => setField('features', e.target.value)}
                    placeholder="e.g. videos, tests, downloads"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                  {saving ? 'Saving...' : modal.mode === 'create' ? 'Create Product' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Delete Product?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm._id)}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-medium">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price History Modal */}
      {priceHistoryModal && (
        <PriceHistoryModal
          productId={priceHistoryModal.id}
          productName={priceHistoryModal.name}
          onClose={() => setPriceHistoryModal(null)}
        />
      )}
    </div>
  )
}
