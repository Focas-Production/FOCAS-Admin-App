const colorMap = {
  // Payment status
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  refunded: 'bg-red-100 text-red-800',
  // Fulfillment
  fulfilled: 'bg-green-100 text-green-800',
  unfulfilled: 'bg-orange-100 text-orange-800',
  partial: 'bg-yellow-100 text-yellow-800',
  restocked: 'bg-gray-100 text-gray-700',
  // Source
  website: 'bg-blue-100 text-blue-800',
  shopify: 'bg-purple-100 text-purple-800',
  combo: 'bg-teal-100 text-teal-800',
  // Tracking
  Delivered: 'bg-green-100 text-green-800',
  Manifested: 'bg-blue-100 text-blue-800',
  'In Transit': 'bg-sky-100 text-sky-800',
  'Out for Delivery': 'bg-indigo-100 text-indigo-800',
  RTO: 'bg-red-100 text-red-800',
  'RTO Delivered': 'bg-red-100 text-red-800',
  Returned: 'bg-red-100 text-red-800',
  Cancelled: 'bg-red-100 text-red-800',
}

export default function StatusBadge({ value }) {
  if (!value) return <span className="text-gray-400 text-xs">—</span>
  const cls = colorMap[value] || 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {value}
    </span>
  )
}
