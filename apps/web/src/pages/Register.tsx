import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useRegister, useLogin } from '../api/hooks'

export function Register() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const { mutate: register, isPending, error } = useRegister()
  const { mutate: login } = useLogin()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    register(
      { email, username, password },
      {
        onSuccess: () => {
          login({ email, password }, { onSuccess: () => navigate('/') })
        },
      }
    )
  }

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-bangers text-4xl tracking-widest text-white">
            FANTASY<span className="text-game-neon">FOOTY</span>
          </span>
          <div className="text-slate-500 text-sm mt-1">Create your account</div>
        </div>

        <form onSubmit={handleSubmit} className="game-card p-6 flex flex-col gap-4">
          {[
            { label: 'Email', type: 'email', value: email, setValue: setEmail, placeholder: 'you@example.com' },
            { label: 'Username', type: 'text', value: username, setValue: setUsername, placeholder: 'Gaffer99' },
            { label: 'Password', type: 'password', value: password, setValue: setPassword, placeholder: '••••••••' },
          ].map(({ label, type, value, setValue, placeholder }) => (
            <div key={label}>
              <label className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5 block">
                {label}
              </label>
              <input
                type={type}
                value={value}
                onChange={e => setValue(e.target.value)}
                required
                placeholder={placeholder}
                className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
                  text-sm text-slate-100 placeholder-slate-600 focus:outline-none
                  focus:border-game-neon transition-all font-nunito"
              />
            </div>
          ))}

          {error && (
            <div className="text-game-red text-sm text-center font-bold">
              Registration failed. Email may already be in use.
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="btn-primary py-3 text-lg mt-1 disabled:opacity-50"
          >
            {isPending ? 'Creating account...' : '✨ CREATE ACCOUNT'}
          </button>

          <div className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="text-game-neon font-bold hover:underline">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
