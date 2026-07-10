/**
 * ============================================================================
 *  Endpoint map — PLACEHOLDERS ONLY.
 * ============================================================================
 *
 *  ⚠️  These paths are NOT prescriptive. They exist so the HTTP adapter has
 *      something to call out of the box. Rename every one of them to match
 *      YOUR API. The adapter (`httpChatService.ts`) is the only file that reads
 *      this map, so changing paths here is safe and self-contained.
 *
 *  Each value is a function of its parameters to make dynamic paths explicit.
 */
export const endpoints = {
  /** GET — current user profile. */
  currentUser: () => `/me`,

  /** GET — list of selectable models. */
  models: () => `/models`,

  /** GET — sidebar conversation summaries. */
  conversations: () => `/conversations`,

  /** GET — a single conversation with its messages. */
  conversation: (id: string) => `/conversations/${id}`,

  /** POST — create a conversation. */
  createConversation: () => `/conversations`,

  /** PATCH — rename a conversation. */
  renameConversation: (id: string) => `/conversations/${id}`,

  /** DELETE — remove a conversation. */
  deleteConversation: (id: string) => `/conversations/${id}`,

  /**
   * POST — send the message history and receive the assistant reply.
   * When streaming is enabled the adapter expects a chunked / SSE body.
   */
  chat: () => `/chat`,

  /** POST (multipart) — upload a file attachment. */
  upload: () => `/uploads`,
} as const

export type Endpoints = typeof endpoints
