/** Two-letter initials from display name or email local part. */
export function userInitials(
  email: string | undefined,
  displayName?: string | null
): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }

  const local = (email ?? '').split('@')[0] ?? ''
  const segments = local.split(/[._-]+/).filter((s) => s.length > 1)
  if (segments.length >= 2) {
    return (segments[0][0] + segments[1][0]).toUpperCase()
  }
  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase()
  }

  const fallback = local.replace(/[^a-zA-Z]/g, '')
  return (fallback.slice(0, 2) || '?').toUpperCase()
}
