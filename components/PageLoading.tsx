export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="animate-pulse flex flex-col gap-4">
        <div className="h-8 w-48 rounded-lg bg-surface" />
        <div className="h-4 w-full max-w-md rounded bg-surface" />
        <div className="h-4 w-2/3 rounded bg-surface" />
        <p className="text-sm text-muted pt-2">{label}</p>
      </div>
    </main>
  )
}
