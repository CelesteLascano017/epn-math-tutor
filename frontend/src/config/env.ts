/**
 * ============================================================================
 *  Typed, centralized access to environment configuration.
 * ============================================================================
 *
 *  Vite exposes only `import.meta.env.VITE_*` variables to the browser. This
 *  module reads them once, applies sensible defaults, and gives the rest of the
 *  app a clean, typed `env` object. See `.env.example` for documentation.
 */

export type ChatBackend = 'mock' | 'http' | 'tutormath'

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value === 'true' || value === '1'
}

export const env = {
  /** Which ChatService implementation to use. */
  backend: (import.meta.env.VITE_CHAT_BACKEND as ChatBackend) || 'mock',

  /** Base URL for the HTTP adapter. */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',

  /** Optional bearer token for the HTTP adapter. */
  apiToken: import.meta.env.VITE_API_TOKEN || '',

  /** Whether the HTTP adapter should read a streaming response. */
  enableStreaming: bool(import.meta.env.VITE_ENABLE_STREAMING, true),
} as const
