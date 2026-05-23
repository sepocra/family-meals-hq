'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { createClient } from '../../lib/supabase/client'

const inputClass =
  'border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-400 dark:focus:border-gray-500 w-full'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/recipes'
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
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Family Meals HQ
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Sign in for your own recipe bank, inventory, and meal plan.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Email</label>
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
          <label className="text-xs text-gray-500 dark:text-gray-400">Password</label>
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
          className="bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50"
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
        className="mt-6 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2"
      >
        {mode === 'signin'
          ? 'Need an account? Create one'
          : 'Already have an account? Sign in'}
      </button>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="px-6 py-16 text-sm text-gray-500">Loading…</main>}>
      <LoginForm />
    </Suspense>
  )
}
