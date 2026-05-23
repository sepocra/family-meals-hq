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
