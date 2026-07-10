/// <reference types="vite/client" />

/**
 * Typed environment variables. Extend this interface when you add new
 * `VITE_*` variables so `import.meta.env.X` is type-checked everywhere.
 */
interface ImportMetaEnv {
  readonly VITE_CHAT_BACKEND?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_TOKEN?: string
  readonly VITE_ENABLE_STREAMING?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
