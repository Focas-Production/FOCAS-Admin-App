import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

const titles = {
  '/': 'Dashboard',
  '/orders': 'All Orders',
  '/orders/website': 'Website Orders',
  '/orders/shopify': 'Shopify Orders',
  '/orders/ship-to-home': 'ShipToHome Orders',
  '/orders/combo': 'Combo Orders',
  '/products': 'Products',
  '/users': 'Users',
  '/payments': 'Payment Links',
}

export default function Layout() {
  const { pathname } = useLocation()
  const title = titles[pathname] || 'Admin'

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <h2 className="text-gray-800 font-semibold text-lg">{title}</h2>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
