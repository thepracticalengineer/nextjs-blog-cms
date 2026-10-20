/** Stable tombstone: never parse credentials, read private data, or mutate content. */
export function retiredApi() {
  return Response.json({
    success: false,
    code: 'API_RETIRED',
    error: 'The external Developer API and legacy AI Assistant have been retired. Use the dashboard to edit articles and Settings → AI Providers to manage your own LLM credentials.',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } })
}
