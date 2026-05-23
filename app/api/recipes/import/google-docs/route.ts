import { NextResponse } from 'next/server'
import {
  extractGoogleDocId,
  googleDocExportHtmlUrl,
  googleDocExportTxtUrl,
  googleDocSourceUrl,
  parseRecipesFromGoogleDoc,
} from '../../../../../lib/google-docs-import'

const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = 500_000

function isGoogleSignInPage(content: string): boolean {
  return (
    content.includes('accounts.google.com') &&
    (content.includes('Sign in') || content.includes('sign in'))
  )
}

export async function POST(request: Request) {
  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const docId = extractGoogleDocId(body.url ?? '')
  if (!docId) {
    return NextResponse.json(
      {
        error:
          'Paste a valid Google Docs link (Share → Anyone with the link can view) or the document ID.',
      },
      { status: 400 }
    )
  }

  const sourceUrl = googleDocSourceUrl(docId)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const [htmlRes, txtRes] = await Promise.all([
      fetch(googleDocExportHtmlUrl(docId), {
        signal: controller.signal,
        headers: { 'User-Agent': 'FamilyMealsHQ/1.0 (google docs import)' },
        redirect: 'follow',
      }),
      fetch(googleDocExportTxtUrl(docId), {
        signal: controller.signal,
        headers: { 'User-Agent': 'FamilyMealsHQ/1.0 (google docs import)' },
        redirect: 'follow',
      }),
    ])

    if (!htmlRes.ok && !txtRes.ok) {
      return NextResponse.json(
        {
          error: `Could not export document. Set sharing to "Anyone with the link" as Viewer.`,
        },
        { status: 502 }
      )
    }

    const html = htmlRes.ok ? await htmlRes.text() : ''
    const text = txtRes.ok ? await txtRes.text() : ''

    if (html.length + text.length > MAX_BYTES * 2) {
      return NextResponse.json({ error: 'Document is too large to import.' }, { status: 422 })
    }

    if (isGoogleSignInPage(html) || isGoogleSignInPage(text)) {
      return NextResponse.json(
        {
          error:
            'Document is not publicly accessible. In Google Docs: Share → General access → Anyone with the link → Viewer.',
        },
        { status: 403 }
      )
    }

    const recipes = parseRecipesFromGoogleDoc(html, text, sourceUrl)
    if (recipes.length === 0) {
      return NextResponse.json(
        {
          error:
            'No recipes found. Use Heading 1 for each recipe title, and Heading 2 for Ingredients and Method sections.',
        },
        { status: 422 }
      )
    }

    return NextResponse.json({ recipes, recipe: recipes[0] })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out fetching the document.' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Failed to fetch Google Doc.' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
