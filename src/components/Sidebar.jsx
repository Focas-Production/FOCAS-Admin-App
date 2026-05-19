import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const nav = [
  { label: 'Dashboard', to: '/', icon: '▦' },
  { type: 'divider', label: 'Analytics' },
  { label: 'Sales', to: '/sales', icon: '◉' },
  { label: 'Inventory', to: '/inventory', icon: '▣' },
  { type: 'divider', label: 'Orders' },
  { label: 'All Orders', to: '/orders', icon: '≡' },
  { type: 'divider', label: 'Catalogue' },
  { label: 'Products', to: '/products', icon: '◻' },
  { label: 'Users', to: '/users', icon: '◎' },
  { type: 'divider', label: 'Payments' },
  { label: 'Payment Links', to: '/payments', icon: '₹' },
  { label: 'Accounts',      to: '/accounts', icon: '⚖' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="w-64 min-h-screen bg-gray-900 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-700">
        <h1 className="text-white font-bold text-lg tracking-tight">Focas Admin</h1>
        <p className="text-gray-400 text-xs mt-0.5 truncate">{user?.name || user?.phoneNumber || 'Admin'}</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map((item, i) => {
          if (item.type === 'divider') {
            return (
              <p key={i} className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-3 pt-5 pb-1">
                {item.label}
              </p>
            )
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <span>⎋</span> Logout
        </button>
      </div>
    </aside>
  )
}
