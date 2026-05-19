export default function SearchFilters({ filters, onChange, onClear }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value })
  }

  const hasAny = filters.orderId || filters.phone || filters.dateFrom || filters.dateTo

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder="Order ID"
        value={filters.orderId}
        onChange={(e) => set('orderId', e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        type="text"
        placeholder="Phone number"
        value={filters.phone}
        onChange={(e) => set('phone', e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <input
        type="date"
        value={filters.dateFrom}
        onChange={(e) => set('dateFrom', e.target.value)}
        title="From date"
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span className="text-gray-400 text-xs">to</span>
      <input
        type="date"
        value={filters.dateTo}
        onChange={(e) => set('dateTo', e.target.value)}
        title="To date"
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {hasAny && (
        <button
          onClick={onClear}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Clear
        </button>
      )}
    </div>
  )
}
