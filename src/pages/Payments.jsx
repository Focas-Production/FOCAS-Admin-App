import { useEffect, useState, useCallback, useRef } from 'react'
import api from '../services/api'
import Pagination from '../components/Pagination'

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  created:         'bg-gray-100 text-gray-700',
  partially_paid:  'bg-yellow-100 text-yellow-800',
  paid:            'bg-green-100 text-green-800',
  cancelled:       'bg-red-100 text-red-800',
  expired:         'bg-red-100 text-red-700',
}

function PaymentBadge({ value }) {
  if (!value) return <span className="text-gray-400 text-xs">—</span>
  const cls = STATUS_COLORS[value] || 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {value.replace(/_/g, ' ')}
    </span>
  )
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={copy}
      className="ml-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
      title="Copy link"
    >
      {copied ? '✓' : '⎘'}
    </button>
  )
}

function InstalmentRow({ ins, isEmi }) {
  const label = isEmi ? `EMI ${ins.emi_index}` : 'Full Payment'
  return (
    <div className="flex items-center gap-3 py-1.5 px-3 bg-gray-50 rounded border border-gray-100 text-sm">
      <span className="text-gray-500 w-20 shrink-0">{label}</span>
      <span className="font-medium w-20 shrink-0">₹{ins.amount.toLocaleString()}</span>
      <PaymentBadge value={ins.status} />
      {ins.short_url && (
        <span className="flex items-center gap-1 ml-auto text-xs text-blue-600 truncate max-w-xs">
          <a href={ins.short_url} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
            {ins.short_url}
          </a>
          <CopyBtn text={ins.short_url} />
        </span>
      )}
      {ins.paid_at && (
        <span className="text-xs text-gray-400 ml-2 shrink-0">
          {new Date(ins.paid_at).toLocaleDateString()}
        </span>
      )}
    </div>
  )
}

// ── EMI preview helper ────────────────────────────────────────────────────────
function calcEmiPreview(total, count) {
  const base = Math.floor(total / count)
  const rem  = total - base * count
  const arr  = Array(count).fill(base)
  arr[count - 1] += rem
  return arr
}

// ── Custom Product Form (inline) ──────────────────────────────────────────────
function CustomProductRow({ onAdd, requireWeight }) {
  const [name,   setName]   = useState('')
  const [price,  setPrice]  = useState('')
  const [weight, setWeight] = useState('')
  const [err,    setErr]    = useState('')

  function add() {
    if (!name.trim())        { setErr('Name required'); return }
    if (!price || price < 1) { setErr('Price required'); return }
    if (requireWeight && (!weight || Number(weight) <= 0)) { setErr('Weight (grams) required for Ship to Home'); return }
    onAdd({ name: name.trim(), price: Number(price), weight: weight ? Number(weight) : undefined, isCustom: true })
    setName(''); setPrice(''); setWeight(''); setErr('')
  }

  return (
    <div className="border border-dashed border-blue-300 rounded-lg p-3 bg-blue-50/40 space-y-2">
      <p className="text-xs font-semibold text-blue-700">New Custom Product</p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setErr('') }}
          placeholder="Product name"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          min="1"
          value={price}
          onChange={(e) => { setPrice(e.target.value); setErr('') }}
          placeholder="Price ₹"
          className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          min="1"
          value={weight}
          onChange={(e) => { setWeight(e.target.value); setErr('') }}
          placeholder="Weight (g)"
          className={`w-28 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${requireWeight ? 'border-orange-300' : 'border-gray-200'}`}
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Add
        </button>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}

// ── Create Payment Link Modal ─────────────────────────────────────────────────
function CreateModal({ onClose, onCreated }) {
  const [products,       setProducts]       = useState([])   // catalog products from API
  const [loadingProds,   setLoadingProds]   = useState(true)
  const [search,         setSearch]         = useState('')
  const [selectedItems,  setSelectedItems]  = useState([])   // { product_id?, name, price, isCustom? }
  const [showCustomForm, setShowCustomForm] = useState(false)

  const [name,           setName]           = useState('')
  const [phone,          setPhone]          = useState('')
  const [note,           setNote]           = useState('')
  const [emiCount,       setEmiCount]       = useState(null) // null | 2 | 3
  const [shipToHome,     setShipToHome]     = useState(false)
  const [syncAfter,      setSyncAfter]      = useState(1)
  const [grantCourses,   setGrantCourses]   = useState('')
  const [grantFeatures,  setGrantFeatures]  = useState('')
  const [addrLine1,      setAddrLine1]      = useState('')
  const [addrLine2,      setAddrLine2]      = useState('')
  const [addrCity,       setAddrCity]       = useState('')
  const [addrPincode,    setAddrPincode]    = useState('')
  const [addrState,      setAddrState]      = useState('')

  const [discountAmt,  setDiscountAmt]  = useState('')
  const [showDiscount, setShowDiscount] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [result,  setResult]  = useState(null)

  // Load all products
  useEffect(() => {
    api.get('/admin/products')
      .then(({ data }) => setProducts(data.products || []))
      .catch(() => {})
      .finally(() => setLoadingProds(false))
  }, [])

  const subtotal    = selectedItems.reduce((s, i) => s + i.price, 0)
  const discAmt     = Math.max(0, Math.round(Number(discountAmt) || 0))
  const totalAmount = subtotal - Math.min(discAmt, subtotal)
  const maxSync       = emiCount || 1

  // When emi_count changes, clamp syncAfter
  function changeEmi(val) {
    setEmiCount(val)
    const max = val || 1
    if (syncAfter > max) setSyncAfter(max)
  }

  // Toggle existing product selection
  function toggleProduct(prod) {
    setSelectedItems((prev) => {
      const exists = prev.find((i) => i.product_id === prod._id)
      const next = exists
        ? prev.filter((i) => i.product_id !== prod._id)
        : [...prev, { product_id: prod._id, name: prod.name, price: prod.price || 0, isCustom: false }]
      // Auto-enable shipToHome if any selected product requires it
      const anyShip = next.some((item) => {
        const p = products.find((p) => p._id === item.product_id)
        return p?.shipToHome
      })
      if (anyShip) setShipToHome(true)
      return next
    })
  }

  // Change price override for a selected item
  function setItemPrice(index, value) {
    setSelectedItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], price: Number(value) || 0 }
      return next
    })
  }

  // Change weight for a selected custom item
  function setItemWeight(index, value) {
    setSelectedItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], weight: Number(value) || 0 }
      return next
    })
  }

  function removeItem(index) {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Add a custom product (created during link generation)
  function addCustomItem(item) {
    setSelectedItems((prev) => [...prev, item])
    setShowCustomForm(false)
  }

  const filteredProducts = products.filter((p) =>
    !p.isCustom &&
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (selectedItems.length === 0) { setError('Select or add at least one product'); return }
    if (selectedItems.some((i) => i.price < 1)) { setError('All items must have a price > 0'); return }

    if (shipToHome) {
      const hasAnyWeight = selectedItems.some((item) => {
        if (item.isCustom) return (item.weight || 0) > 0
        const prod = products.find((p) => p._id === item.product_id)
        return (prod?.weight || 0) > 0
      })
      if (!hasAnyWeight) {
        setError('At least one product must have a weight set to create a Ship to Home link')
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        name:             name.trim(),
        phone:            phone.trim(),
        items:            selectedItems.map((i) => ({
          product_id: i.product_id || undefined,
          name:       i.name,
          price:      i.price,
          isCustom:   i.isCustom || false,
          weight:     i.weight || undefined,
        })),
        note:             note.trim() || undefined,
        emi_count:        emiCount   || undefined,
        discount_amount:  discAmt > 0 ? discAmt : undefined,
        shipToHome,
        address: shipToHome ? {
          line1:   addrLine1.trim(),
          line2:   addrLine2.trim() || undefined,
          city:    addrCity.trim(),
          pincode: addrPincode.trim(),
          state:   addrState.trim(),
        } : undefined,
        sync_show_after: syncAfter,
        grant_courses:   grantCourses.split(',').map((s) => s.trim()).filter(Boolean),
        grant_features:  grantFeatures.split(',').map((s) => s.trim()).filter(Boolean),
      }
      const { data } = await api.post('/payment/create', payload)
      setResult(data)
      onCreated()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create payment link')
    } finally {
      setSaving(false)
    }
  }

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-green-600 text-xl">✓</span>
            <h3 className="font-semibold text-gray-800 text-lg">Payment Link Created</h3>
          </div>

          <div className="mb-3 text-sm text-gray-600">
            <span className="font-medium">Products: </span>
            {result.products?.map((p) => p.name).join(', ')}
          </div>
          <div className="mb-4 text-sm text-gray-700 space-y-0.5">
            {result.discount_amount > 0 && (
              <>
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal</span>
                  <span>₹{result.original_amount?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span>−₹{result.discount_amount?.toLocaleString()}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-semibold text-gray-800">
              <span>Total</span>
              <span>₹{result.full_amount?.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-2 mb-5">
            {result.links.map((link) => (
              <div key={link.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    {result.emi ? `EMI ${link.emi_index} of ${result.emi_count}` : 'Full Payment'}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">₹{link.amount.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={link.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm hover:underline truncate flex-1"
                  >
                    {link.link}
                  </a>
                  <CopyBtn text={link.link} />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-gray-800 text-lg">Create Payment Link</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-5">

          {/* Customer details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone <span className="text-red-500">*</span></label>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* ── Product Selection ────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Products <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowCustomForm((v) => !v)}
                className="text-xs px-2.5 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors font-medium"
              >
                + Custom Product
              </button>
            </div>

            {/* Custom product form */}
            {showCustomForm && (
              <div className="mb-3">
                <CustomProductRow onAdd={addCustomItem} requireWeight={shipToHome} />
              </div>
            )}

            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search existing products…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Product list */}
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              {loadingProds ? (
                <p className="text-center text-gray-400 text-sm py-4">Loading products…</p>
              ) : filteredProducts.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-4">No products found</p>
              ) : (
                filteredProducts.map((prod) => {
                  const isSelected = selectedItems.some((i) => i.product_id === prod._id)
                  return (
                    <label
                      key={prod._id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleProduct(prod)}
                        className="w-4 h-4 rounded accent-blue-600 shrink-0"
                      />
                      <span className="flex-1 text-sm text-gray-800 font-medium">{prod.name}</span>
                      {prod.category && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{prod.category}</span>
                      )}
                      <span className="text-sm font-semibold text-gray-700 shrink-0">
                        {prod.price ? `₹${prod.price.toLocaleString()}` : '—'}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </div>

          {/* Selected items */}
          {selectedItems.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-200 bg-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Selected Items</span>
                <span className="text-xs text-gray-500">{selectedItems.length} item{selectedItems.length > 1 ? 's' : ''}</span>
              </div>
              {selectedItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-0">
                  <span className="flex-1 text-sm text-gray-800">{item.name}</span>
                  {item.isCustom && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium shrink-0">Custom</span>
                  )}
                  {item.isCustom && (
                    <div className="flex items-center gap-1 shrink-0" title="Weight in grams (required for Ship to Home)">
                      <input
                        type="number"
                        min="1"
                        value={item.weight || ''}
                        onChange={(e) => setItemWeight(idx, e.target.value)}
                        placeholder="g"
                        className={`w-16 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400 ${shipToHome && (!item.weight || item.weight <= 0) ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}
                      />
                      <span className="text-xs text-gray-400">g</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-gray-500">₹</span>
                    <input
                      type="number"
                      min="1"
                      value={item.price}
                      onChange={(e) => setItemPrice(idx, e.target.value)}
                      className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-red-400 hover:text-red-600 text-sm px-1 shrink-0"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Subtotal + optional discount */}
              <div className="border-t border-gray-200 bg-gray-100">
                {discAmt > 0 && (
                  <div className="px-3 py-1.5 flex items-center justify-between text-xs text-gray-500">
                    <span>Subtotal</span>
                    <span>₹{subtotal.toLocaleString()}</span>
                  </div>
                )}

                {/* Discount row — visible when showDiscount is toggled */}
                {showDiscount && (
                  <div className="px-3 py-2 flex items-center gap-2 border-t border-dashed border-gray-200">
                    <span className="text-xs text-emerald-700 font-medium flex-1">Discount</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">₹</span>
                      <input
                        type="number"
                        min="0"
                        max={subtotal}
                        value={discountAmt}
                        onChange={(e) => setDiscountAmt(e.target.value)}
                        placeholder="0"
                        className="w-24 border border-emerald-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                        autoFocus
                      />
                    </div>
                    {discAmt > 0 && (
                      <span className="text-xs font-semibold text-emerald-700 w-20 text-right">
                        −₹{discAmt.toLocaleString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Total row with discount toggle */}
                <div className="px-3 py-2 flex items-center justify-between border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">Total</span>
                    <button
                      type="button"
                      onClick={() => { setShowDiscount((v) => !v); if (showDiscount) setDiscountAmt('') }}
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                        showDiscount
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200'
                          : 'border-gray-300 text-gray-400 hover:border-emerald-400 hover:text-emerald-600'
                      }`}
                    >
                      {showDiscount ? (discAmt > 0 ? `−₹${discAmt.toLocaleString()}` : 'Discount') : '₹ Discount'}
                    </button>
                  </div>
                  <span className="text-sm font-bold text-gray-900">₹{totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Payment type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payment Type</label>
            <div className="flex gap-2">
              {[[null, 'Full Payment'], [2, '2 EMI'], [3, '3 EMI']].map(([val, label]) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => changeEmi(val)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    emiCount === val
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-blue-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* EMI split preview */}
          {totalAmount > 0 && emiCount && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm">
              <p className="text-blue-700 font-medium mb-1.5">EMI Split Preview</p>
              <div className="flex gap-3 flex-wrap">
                {calcEmiPreview(totalAmount, emiCount).map((amt, i) => (
                  <span key={i} className="text-blue-800">
                    EMI {i + 1}: <strong>₹{amt.toLocaleString()}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Ship to home */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={shipToHome}
              onChange={(e) => {
                if (e.target.checked) {
                  const missingWeight = selectedItems.filter((i) => i.isCustom && (!i.weight || i.weight <= 0))
                  if (missingWeight.length > 0) {
                    setError(`Please remove and re-add custom item(s) with weight: ${missingWeight.map((i) => `"${i.name}"`).join(', ')}`)
                    return
                  }
                }
                setError('')
                setShipToHome(e.target.checked)
              }}
              className="w-4 h-4 rounded border-gray-300 accent-blue-600"
            />
            <span className="text-sm text-gray-700">Ship to Home</span>
          </label>

          {/* Delivery Address — shown only when Ship to Home is checked */}
          {shipToHome && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-4 py-4 space-y-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Delivery Address</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Address Line 1 <span className="text-red-500">*</span>
                </label>
                <input
                  value={addrLine1}
                  onChange={(e) => setAddrLine1(e.target.value)}
                  placeholder="House no., Street, Area"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Address Line 2 <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  value={addrLine2}
                  onChange={(e) => setAddrLine2(e.target.value)}
                  placeholder="Landmark, Colony (optional)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)}
                    placeholder="City"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Pincode <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={addrPincode}
                    onChange={(e) => setAddrPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit pincode"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  State <span className="text-red-500">*</span>
                </label>
                <select
                  value={addrState}
                  onChange={(e) => setAddrState(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Select state</option>
                  {['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Sync show after */}
          {shipToHome && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Show Sync Button After</label>
              <div className="flex gap-2">
                {Array.from({ length: maxSync }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSyncAfter(n)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      syncAfter === n
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                    }`}
                  >
                    {n === 1 && !emiCount
                      ? 'After Full Payment'
                      : n === maxSync && emiCount
                      ? `After ${n}${n === 1 ? 'st' : n === 2 ? 'nd' : 'rd'} (Final)`
                      : `After ${n}${n === 1 ? 'st' : n === 2 ? 'nd' : 'rd'} Payment`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grants */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Access Grants (applied when fully paid)
            </p>
            <p className="text-xs text-gray-400">Grants from selected products are auto-applied. Add extras below.</p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Grant Courses
                <span className="text-gray-400 font-normal ml-1">(comma-separated IDs)</span>
              </label>
              <input
                value={grantCourses}
                onChange={(e) => setGrantCourses(e.target.value)}
                placeholder="e.g. ca-inter-g1, ca-final-g2"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Grant Features
                <span className="text-gray-400 font-normal ml-1">(comma-separated)</span>
              </label>
              <input
                value={grantFeatures}
                onChange={(e) => setGrantFeatures(e.target.value)}
                placeholder="e.g. videos, tests, downloads"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || selectedItems.length === 0}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : `Create Link${totalAmount > 0 ? ` · ₹${totalAmount.toLocaleString()}` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Payment row ───────────────────────────────────────────────────────────────
function PaymentRow({ payment }) {
  const [expanded, setExpanded] = useState(false)
  const isEmi     = payment.emi_total != null
  const progress  = isEmi
    ? `${payment.emi_paid}/${payment.emi_total} paid`
    : payment.status === 'paid' ? 'Paid' : 'Pending'

  return (
    <>
      <tr
        className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-4 py-3 text-gray-400 text-sm w-6">{expanded ? '▾' : '▸'}</td>
        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
          {new Date(payment.createdAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-gray-800">{payment.name || '—'}</p>
          <p className="text-xs text-gray-500">{payment.phone || '—'}</p>
        </td>
        <td className="px-4 py-3">
          <p className="text-sm text-gray-700">{payment.product_name}</p>
          {payment.note && <p className="text-xs text-gray-400 truncate max-w-[160px]">{payment.note}</p>}
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-gray-800">₹{payment.full_amount?.toLocaleString()}</td>
        <td className="px-4 py-3 text-xs text-gray-600">
          {isEmi ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium">
              {payment.emi_total} EMI
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-600">Full</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600">{progress}</td>
        <td className="px-4 py-3"><PaymentBadge value={payment.status} /></td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50/70">
          <td colSpan={8} className="px-8 py-3 space-y-3">

            {/* Products breakdown */}
            {payment.products?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</p>
                {payment.products.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-700 py-0.5">
                    <span className="flex-1">{p.name}</span>
                    <span className="font-medium">₹{p.price?.toLocaleString()}</span>
                  </div>
                ))}
                {payment.discount_amount > 0 && (
                  <div className="pt-1 border-t border-gray-200 space-y-0.5">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Subtotal</span>
                      <span>₹{payment.original_amount?.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
                      <span>Discount</span>
                      <span>−₹{payment.discount_amount?.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-semibold text-gray-800">
                      <span>Total paid</span>
                      <span>₹{payment.full_amount?.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Instalments */}
            <div className="space-y-1.5">
              {payment.instalments?.map((ins, i) => (
                <InstalmentRow key={i} ins={ins} isEmi={isEmi} />
              ))}
            </div>

            {/* Delivery Address */}
            {payment.shipToHome && payment.address?.line1 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Delivery Address</p>
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-gray-700 space-y-0.5">
                  <p>{payment.address.line1}</p>
                  {payment.address.line2 && <p>{payment.address.line2}</p>}
                  <p>{[payment.address.city, payment.address.state, payment.address.pincode].filter(Boolean).join(', ')}</p>
                  {payment.address.country && <p className="text-xs text-gray-400">{payment.address.country}</p>}
                </div>
              </div>
            )}

            {/* Grants */}
            {(payment.grant_courses?.length > 0 || payment.grant_features?.length > 0) && (
              <div className="flex flex-wrap gap-4 text-xs text-gray-600 border-t border-gray-100 pt-2">
                {payment.grant_courses?.length > 0 && (
                  <span>
                    <span className="font-semibold text-gray-500">Courses: </span>
                    {payment.grant_courses.join(', ')}
                  </span>
                )}
                {payment.grant_features?.length > 0 && (
                  <span>
                    <span className="font-semibold text-gray-500">Features: </span>
                    {payment.grant_features.join(', ')}
                  </span>
                )}
                <span className="text-gray-400 italic">
                  {payment.user_created ? '✓ Grants applied' : 'Pending full payment'}
                </span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Payments Page ────────────────────────────────────────────────────────
export default function Payments() {
  const [payments,    setPayments]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)
  const [exporting,   setExporting]   = useState(false)
  const [stats,       setStats]       = useState({ total: 0, paid: 0, partially_paid: 0, created: 0 })
  const [pagination,  setPagination]  = useState({ page: 1, totalPages: 1, total: 0 })
  const [limit,       setLimit]       = useState(20)

  const [filters, setFilters] = useState({ phone: '', status: '', dateFrom: '', dateTo: '' })
  const debounceRef = useRef(null)

  const load = useCallback(async (page = 1, f = filters, lim = limit) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: lim })
      if (f.phone)    params.set('phone',    f.phone)
      if (f.status)   params.set('status',   f.status)
      if (f.dateFrom) params.set('dateFrom', f.dateFrom)
      if (f.dateTo)   params.set('dateTo',   f.dateTo)

      const { data } = await api.get(`/payment?${params}`)
      setPayments(data.payments || [])
      setStats(data.stats || { total: 0, paid: 0, partially_paid: 0, created: 0 })
      setPagination({
        page:       data.pagination.page,
        totalPages: data.pagination.totalPages,
        total:      data.pagination.total,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filters, limit])

  useEffect(() => { load(1) }, [load])

  function handleFilterChange(key, value) {
    const f = { ...filters, [key]: value }
    setFilters(f)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(1, f), 400)
  }

  function handleClear() {
    const f = { phone: '', status: '', dateFrom: '', dateTo: '' }
    setFilters(f)
    load(1, f)
  }

  const hasFilter = filters.phone || filters.status || filters.dateFrom || filters.dateTo

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams({ page: 1, limit: 10000 })
      if (filters.phone)    params.set('phone',    filters.phone)
      if (filters.status)   params.set('status',   filters.status)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo)   params.set('dateTo',   filters.dateTo)

      const { data } = await api.get(`/payment?${params}`)
      const rows = data.payments || []
      if (!rows.length) { alert('No data to export'); return }

      const hasAddress = rows.some((p) => p.shipToHome && p.address?.line1)

      const headers = [
        'Date', 'Customer Name', 'Phone',
        'Products', 'Amount (Rs.)', 'Original Amount (Rs.)', 'Discount (Rs.)',
        'Payment Type', 'Progress', 'Status',
        'Razorpay Order ID',
        'Grant Courses', 'Grant Features',
        'Note', 'Paid At',
      ]
      if (hasAddress) {
        headers.push('Address Line 1', 'Address Line 2', 'City', 'State', 'Pincode')
      }

      const esc = (v) => {
        const s = String(v ?? '')
        return (s.includes(',') || s.includes('"') || s.includes('\n'))
          ? `"${s.replace(/"/g, '""')}"` : s
      }

      const fmtDate = (d) => d
        ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : ''

      const csvRows = rows.map((p) => {
        const type     = p.emi_total ? `${p.emi_total} EMI` : 'Full'
        const progress = p.emi_total
          ? `${p.emi_paid}/${p.emi_total} paid`
          : p.status === 'paid' ? 'Paid' : 'Pending'
        const row = [
          fmtDate(p.createdAt),
          p.name || '',
          p.phone || '',
          (p.products || []).map((pr) => `${pr.name} (Rs.${pr.price})`).join(' | '),
          p.full_amount || 0,
          p.original_amount || '',
          p.discount_amount || 0,
          type,
          progress,
          p.status || '',
          p.razorpay_order_id || '',
          (p.grant_courses || []).join(', '),
          (p.grant_features || []).join(', '),
          p.note || '',
          fmtDate(p.paid_at),
        ]
        if (hasAddress) {
          row.push(
            p.address?.line1 || '',
            p.address?.line2 || '',
            p.address?.city  || '',
            p.address?.state || '',
            p.address?.pincode || '',
          )
        }
        return row
      })

      const csv  = [headers, ...csvRows].map((r) => r.map(esc).join(',')).join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `payment-links-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export failed: ' + (err.message || 'Unknown error'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-800 font-semibold text-xl">Payment Links</h2>
          <p className="text-gray-500 text-sm mt-0.5">Create and manage Razorpay payment links</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Create Link
        </button>
      </div>

      {/* Stats cards — always global counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total',          value: stats.total,           color: 'text-gray-800' },
          { label: 'Paid',           value: stats.paid,            color: 'text-green-600' },
          { label: 'Partially Paid', value: stats.partially_paid,  color: 'text-yellow-600' },
          { label: 'Pending',        value: stats.created,         color: 'text-gray-500' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 px-5 py-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search phone…"
          value={filters.phone}
          onChange={(e) => handleFilterChange('phone', e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="created">Pending</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
        </select>
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
        {hasFilter && (
          <button onClick={handleClear} className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">
            Clear
          </button>
        )}
        {hasFilter && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {exporting ? 'Exporting…' : '↓ Export CSV'}
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">{pagination.total} result{pagination.total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading...</div>
        ) : payments.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400 text-sm">{hasFilter ? 'No results for current filters.' : 'No payment links yet.'}</p>
            {!hasFilter && (
              <button onClick={() => setShowCreate(true)} className="mt-3 text-blue-600 text-sm hover:underline">
                Create your first link →
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 w-6" />
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <PaymentRow key={p._id} payment={p} />
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={limit}
              onPageChange={(p) => load(p, filters, limit)}
              onLimitChange={(l) => { setLimit(l); load(1, filters, l) }}
            />
          </>
        )}
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => load(1)}
        />
      )}

    </div>
  )
}
