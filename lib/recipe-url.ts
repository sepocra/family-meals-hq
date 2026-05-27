/** Display label for a recipe source link (hostname + path, truncated). */
export function shortenRecipeUrl(url: string, maxLength = 48): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/$/, '')
    const label = path && path !== '/' ? `${host}${path}` : host
    if (label.length <= maxLength) return label
    return `${label.slice(0, maxLength - 1)}…`
  } catch {
    if (url.length <= maxLength) return url
    return `${url.slice(0, maxLength - 1)}…`
  }
}

export function isGoogleDocSourceUrl(raw: string | null | undefined): boolean {
  const trimmed = raw?.trim()
  if (!trimmed) return false

  try {
    const url = new URL(trimmed)
    return (
      url.hostname.includes('docs.google.com') &&
      url.pathname.includes('/document/')
    )
  } catch {
    return false
  }
}

/** Drop legacy Google Doc import links; keep normal recipe site URLs. */
export function sanitizeRecipeSourceUrl(
  raw: string | null | undefined
): string | null {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed || isGoogleDocSourceUrl(trimmed)) return null
  return trimmed
}
