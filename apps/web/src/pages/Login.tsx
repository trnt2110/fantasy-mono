import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useLogin } from '../api/hooks'
import { useAuthStore } from '../store/auth.store'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const accessToken = useAuthStore(s => s.accessToken)
  const { mutate: login, isPending, error } = useLogin()

  useEffect(() => { if (accessToken) navigate('/') }, [accessToken, navigate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login({ email, password }, { onSuccess: () => navigate('/') })
  }

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-bangers text-4xl tracking-widest text-white">
            FANTASY<span className="text-game-neon">FOOTY</span>
          </span>
          <div className="text-slate-500 text-sm mt-1">Sign in to your account</div>
        </div>

        <form onSubmit={handleSubmit} className="game-card p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
                text-sm text-slate-100 placeholder-slate-600 focus:outline-none
                focus:border-game-neon transition-all font-nunito"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5 block">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
                text-sm text-slate-100 placeholder-slate-600 focus:outline-none
                focus:border-game-neon transition-all font-nunito"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-game-red text-sm text-center font-bold">
              Invalid email or password
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="btn-primary py-3 text-lg mt-1 disabled:opacity-50"
          >
            {isPending ? 'Signing in...' : '⚡ SIGN IN'}
          </button>

          <div className="text-center text-sm text-slate-500">
            No account?{' '}
            <Link to="/register" className="text-game-neon font-bold hover:underline">
              Register
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
