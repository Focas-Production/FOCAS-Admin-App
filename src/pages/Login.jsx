import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function Login() {
  const [step, setStep] = useState('identifier') // 'identifier' | 'otp'
  const [method, setMethod] = useState('phone') // 'phone' | 'email'
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const { login } = useAuth()
  const navigate = useNavigate()

  const identifierPayload = method === 'email'
    ? { email: email.trim().toLowerCase() }
    : { phoneNumber: phone.trim() }

  async function handleSendOtp(e) {
    e.preventDefault()
    setError('')
    if (method === 'phone' && !phone.trim()) { setError('Enter a phone number'); return }
    if (method === 'email' && !email.trim()) { setError('Enter an email address'); return }
    setLoading(true)
    try {
      await api.post('/auth/send-otp', identifierPayload)
      setInfo(method === 'email' ? 'OTP sent to your email' : 'OTP sent to your phone')
      setStep('otp')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    if (!otp.trim()) { setError('Enter the OTP'); return }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/verify-otp', { ...identifierPayload, otp: otp.trim() })
      const token = data.token

      // Verify admin status
      const meRes = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!meRes.data.isAdmin) {
        setError('This account does not have admin access')
        setLoading(false)
        return
      }

      login(token, meRes.data)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  function switchMethod(next) {
    setMethod(next)
    setError('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Focas Admin</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your admin account</p>
        </div>

        {step === 'identifier' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="flex rounded-lg bg-gray-100 p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => switchMethod('phone')}
                className={`flex-1 py-1.5 rounded-md transition-colors ${method === 'phone' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Phone
              </button>
              <button
                type="button"
                onClick={() => switchMethod('email')}
                className={`flex-1 py-1.5 rounded-md transition-colors ${method === 'email' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Email
              </button>
            </div>
            {method === 'phone' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            )}
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-sm text-gray-600">{info}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit OTP"
                maxLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center text-lg"
                autoFocus
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('identifier'); setOtp(''); setError('') }}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              {method === 'email' ? 'Change email address' : 'Change phone number'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
