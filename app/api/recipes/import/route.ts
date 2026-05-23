import { NextResponse } from 'next/server'
import { normalizeImportUrl, parseRecipeFromHtml } from '../../../../lib/recipe-import'

const FETCH_TIMEOUT_MS = 15_000
const MAX_HTML_BYTES = 2_000_000

export async function POST(request: Request) {
  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const url = normalizeImportUrl(body.url ?? '')
  if (!url) {
    return NextResponse.json({ error: 'Enter a valid http or https recipe URL.' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FamilyMealsHQ/1.0 (recipe import)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Could not fetch page (${response.status}).` },
        { status: 502 }
      )
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return NextResponse.json(
        { error: 'URL did not return an HTML page.' },
        { status: 422 }
      )
    }

    const html = await response.text()
    if (html.length > MAX_HTML_BYTES) {
      return NextResponse.json({ error: 'Page is too large to import.' }, { status: 422 })
    }

    const recipe = parseRecipeFromHtml(html, url)
    if (!recipe) {
      return NextResponse.json(
        {
          error:
            'No structured recipe found on this page. Try a site that publishes recipe schema (e.g. RecipeTin Eats).',
        },
        { status: 422 }
      )
    }

    return NextResponse.json({ recipe })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out fetching the URL.' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Failed to fetch recipe from URL.' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
