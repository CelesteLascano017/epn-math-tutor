/**
 * ============================================================================
 *  Domain model — the SINGLE SOURCE OF TRUTH shared by the UI and any backend.
 * ============================================================================
 *
 *  These types describe the shapes the UI renders. A backend integrator only
 *  needs to make the API adapter (see `src/api/`) return/accept these shapes.
 *  Nothing here is coupled to a specific transport, provider, or endpoint.
 *
 *  If your backend uses different field names, DO NOT change this file — map
 *  your payloads to/from these types inside the adapter. That keeps the whole
 *  component tree stable no matter what your API looks like.
 */

/** Who authored a message. `system` is optional metadata (rarely rendered). */
export type MessageRole = 'user' | 'assistant' | 'system'

/** Lifecycle of an assistant message while it is being produced. */
export type MessageStatus =
  | 'complete' // fully received
  | 'streaming' // tokens are still arriving
  | 'pending' // request sent, nothing received yet
  | 'error' // generation failed

/**
 * A retrieval/citation source attached to an assistant message
 * (the "3 sources" pill in the reference design).
 */
export interface Source {
  id: string
  /** Human-readable title shown in the sources list. */
  title: string
  /** Optional canonical URL of the source. */
  url?: string
  /** Optional short excerpt / snippet used by the model. */
  snippet?: string
  /** Optional favicon or thumbnail URL. */
  icon?: string
}

/** A file attached to a message (image, pdf, etc.). */
export interface Attachment {
  id: string
  name: string
  /** MIME type, e.g. "image/png", "application/pdf". */
  mimeType: string
  /** Size in bytes (optional — used only for display). */
  size?: number
  /**
   * Where the file content lives. This can be:
   *  - a remote URL returned by your upload endpoint, or
   *  - an object URL (`URL.createObjectURL`) for local preview before upload.
   */
  url: string
  /** True while the file is uploading to your backend. */
  uploading?: boolean
}

/** A single chat message. */
export interface Message {
  id: string
  role: MessageRole
  /** Plain text / markdown content. The renderer treats it as markdown-ish. */
  content: string
  /** Unix epoch milliseconds. */
  createdAt: number
  status?: MessageStatus
  attachments?: Attachment[]
  sources?: Source[]
  /** Free-form metadata your backend may want to round-trip (token counts…). */
  metadata?: Record<string, unknown>
}

/** A conversation / thread shown in the sidebar's "Recent" list. */
export interface Conversation {
  id: string
  title: string
  /** Unix epoch milliseconds of last activity — used for sorting. */
  updatedAt: number
  createdAt: number
  messages: Message[]
  /** Optional id of the model this conversation is pinned to. */
  modelId?: string
}

/** Lightweight sidebar representation (no messages) for large histories. */
export type ConversationSummary = Omit<Conversation, 'messages'>

/** A selectable model in the composer dropdown (e.g. "GPT-5.4"). */
export interface Model {
  id: string
  name: string
  /** Optional one-line description shown in the dropdown. */
  description?: string
  /** Optional badge, e.g. "Pro", "New". */
  badge?: string
  disabled?: boolean
}

/** The signed-in user shown at the top of the sidebar. */
export interface User {
  id: string
  name: string
  email: string
  /** Avatar image URL. Falls back to initials when absent. */
  avatarUrl?: string
}

/* --------------------------------------------------------------------------
 *  API-facing request/response contracts.
 *  The adapter implements these; the UI never talks to the network directly.
 * ------------------------------------------------------------------------ */

/** Payload the UI hands to the backend to get the next assistant message. */
export interface SendMessageRequest {
  conversationId: string
  /** The full ordered message history (adapter may send only the tail). */
  messages: Message[]
  modelId: string
  /** Abort signal so the UI can cancel an in-flight generation. */
  signal?: AbortSignal
}

/** One incremental chunk yielded while streaming an assistant reply. */
export interface StreamChunk {
  /** Text delta to append to the current assistant message. */
  delta?: string
  /** Sources may arrive at the end of a stream. */
  sources?: Source[]
  /** Set true on the final chunk. */
  done?: boolean
  /** Custom metadata yielded by the service (e.g. structured blocks from TutorMath). */
  metadata?: Record<string, unknown>
}
