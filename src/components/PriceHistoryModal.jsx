import { useState, useEffect } from 'react'
import api from '../services/api'

export default function PriceHistoryModal({ productId, productName, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [priceAtDate, setPriceAtDate] = useState(null)
  const [querying, setQuerying] = useState(false)

  useEffect(() => {
    loadPriceHistory()
  }, [productId])

  async function loadPriceHistory() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get(`/admin/products/${productId}/price-history`)
      setHistory(data.history || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load price history')
    } finally {
      setLoading(false)
    }
  }

  async function handleDateQuery() {
    if (!selectedDate) return
    setQuerying(true)
    setError('')
    try {
      const { data } = await api.get(
        `/admin/products/${productId}/price-at-date?date=${selectedDate}`
      )
      setPriceAtDate(data.price)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to query price at date')
    } finally {
      setQuerying(false)
    }
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatPrice = (price) => {
    return price ? `₹${price.toLocaleString()}` : '—'
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Right Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">💰 Price History</h2>
            <p className="text-xs text-gray-600 mt-0.5">{productName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {error && (
            <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="inline-block">
                  <div className="animate-spin w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full"></div>
                </div>
                <p className="mt-4 text-gray-600">Loading price history...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Query Section */}
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white">
                <h3 className="text-sm font-bold text-gray-900 mb-3">🔍 Query Price at Date</h3>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Select Date</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleDateQuery}
                    disabled={!selectedDate || querying}
                    className="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {querying ? '⏳' : '→'} Query
                  </button>
                </div>

                {priceAtDate && (
                  <div className="mt-3 p-3 bg-white border border-green-200 rounded-lg">
                    <p className="text-xs font-semibold text-green-700 mb-2">✓ Price found for {new Date(selectedDate).toLocaleDateString()}</p>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center">
                        <p className="text-xs text-gray-600 font-semibold mb-1">WEB</p>
                        <p className="text-sm font-bold text-green-600">{formatPrice(priceAtDate.price)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-600 font-semibold mb-1">SHOPIFY</p>
                        <p className="text-sm font-bold text-green-600">{formatPrice(priceAtDate.shopifyPrice)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-600 font-semibold mb-1">COMBO</p>
                        <p className="text-sm font-bold text-green-600">{formatPrice(priceAtDate.comboPrice)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-600 font-semibold mb-1">ORG</p>
                        <p className="text-sm font-bold text-green-600">{formatPrice(priceAtDate.originalPrice)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* History Section */}
              <div className="px-6 py-4">
                <h3 className="text-sm font-bold text-gray-900 mb-3">📊 Price Changes ({history.length})</h3>

                {history.length === 0 ? (
                  <div className="py-8 text-center bg-gray-50 rounded-lg text-sm text-gray-500">
                    No price changes recorded
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((entry, index) => (
                      <div key={index} className="relative pl-4">
                        {/* Timeline dot */}
                        <div className="absolute left-0 top-1.5 w-2.5 h-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full border-3 border-white"></div>

                        {/* Timeline line */}
                        {index < history.length - 1 && (
                          <div className="absolute left-1 top-4 w-0.5 h-10 bg-gradient-to-b from-blue-300 to-transparent"></div>
                        )}

                        {/* Content Card */}
                        <div className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-lg p-3 hover:shadow-md transition-all">
                          <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Entry #{history.length - index}</span>
                            <span className="text-xs text-gray-600">📅 {formatDate(entry.effectiveFrom)}</span>
                          </div>

                          <div className="grid grid-cols-4 gap-2 mb-2">
                            <div>
                              <p className="text-xs font-semibold text-gray-600 uppercase mb-0.5">Web</p>
                              <p className="text-xs font-bold text-green-600">{formatPrice(entry.price)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-600 uppercase mb-0.5">Shopify</p>
                              <p className="text-xs font-bold text-green-600">{formatPrice(entry.shopifyPrice)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-600 uppercase mb-0.5">Combo</p>
                              <p className="text-xs font-bold text-green-600">{formatPrice(entry.comboPrice)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-600 uppercase mb-0.5">Org</p>
                              <p className="text-xs font-bold text-green-600">{formatPrice(entry.originalPrice)}</p>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-gray-100 space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="font-semibold text-gray-700">Changed by:</span>
                              <span className="text-gray-600">{entry.changedBy}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold text-gray-700">At:</span>
                              <span className="text-gray-600">{formatDate(entry.changedAt)}</span>
                            </div>
                            {entry.note && (
                              <div className="flex justify-between items-start">
                                <span className="font-semibold text-gray-700">Note:</span>
                                <span className="text-green-600 italic text-right flex-1">{entry.note}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
