export type PageProps = {
  params: Promise<Record<string, string | string[]>>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Unwrap Next.js 16 async page props (required before rendering client pages). */
export async function awaitPageProps({
  params,
  searchParams,
}: PageProps): Promise<void> {
  await params
  await searchParams
}
