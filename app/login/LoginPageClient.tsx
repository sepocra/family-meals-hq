'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { btnPrimaryWide, fieldInput, linkAccent, pageTitleAccent, textMuted } from '../../lib/brand-classes'
import { createClient } from '../../lib/supabase/client'

const inputClass = fieldInput

export default function LoginPageClient({ next }: { next: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    if (mode === 'signup') {
      const { error: signUpError } = await supabase.auth.signUp({ email, password })
      setLoading(false)
      if (signUpError) {
        setError(signUpError.message)
        return
      }
      setMessage('Account created. You can sign in now.')
      setMode('signin')
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setLoading(false)
    if (signInError) {
      setError(signInError.message)
      return
    }
    router.push(next)
    router.refresh()
  }

  return (
    <main className="max-w-md mx-auto px-6 py-16">
      <h1 className={`text-2xl font-semibold text-primary mb-2 ${pageTitleAccent}`}>
        Family Meals HQ
      </h1>
      <p className={`text-sm ${textMuted} mb-8`}>
        Sign in for your own recipe bank, inventory, and meal plan.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className={`text-xs ${textMuted}`}>Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={`text-xs ${textMuted}`}>Password</label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
        <button
          type="submit"
          disabled={loading}
          className={`${btnPrimaryWide} disabled:opacity-50`}
        >
          {loading ? '…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError(null)
          setMessage(null)
        }}
        className={`mt-6 text-sm ${linkAccent}`}
      >
        {mode === 'signin'
          ? 'Need an account? Create one'
          : 'Already have an account? Sign in'}
      </button>
    </main>
  )
}
