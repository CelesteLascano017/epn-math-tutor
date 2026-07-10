import type {
  Conversation,
  ConversationSummary,
  Model,
  SendMessageRequest,
  StreamChunk,
  User,
} from '@/types'

/**
 * ============================================================================
 *  ChatService — the ONE interface a backend must satisfy.
 * ============================================================================
 *
 *  The entire UI depends only on this interface, never on `fetch`, a URL, or a
 *  provider SDK. To connect a real backend you implement these methods (see
 *  `httpChatService.ts` for a ready-to-edit HTTP example) and register it in
 *  `src/api/index.ts`.
 *
 *  Design rules:
 *   - Every method is async and may throw; the UI handles errors centrally.
 *   - `sendMessage` is an async generator so both streaming and non-streaming
 *     backends fit the same shape (a non-streaming backend just yields once).
 *   - Methods that persist data (create/rename/delete conversation) are marked
 *     OPTIONAL. If your backend is stateless, omit them — the UI keeps history
 *     locally in the browser and everything still works.
 */
export interface ChatService {
  // ----- Reads --------------------------------------------------------------

  /** The currently authenticated user (for the sidebar profile). */
  getCurrentUser(): Promise<User>

  /** Models available in the composer dropdown. */
  getModels(): Promise<Model[]>

  /** Sidebar "Recent" list. Return `[]` if you don't persist history. */
  listConversations(): Promise<ConversationSummary[]>

  /** Full conversation (with messages) by id. */
  getConversation(id: string): Promise<Conversation>

  // ----- The core call ------------------------------------------------------

  /**
   * Produce the assistant's reply for the given request.
   *
   * Yields {@link StreamChunk} objects as content arrives. Consumers append
   * `delta` text as it streams. Pass `request.signal` through to your transport
   * so the UI's "stop generating" button can abort the request.
   */
  sendMessage(request: SendMessageRequest): AsyncGenerator<StreamChunk, void, unknown>

  // ----- Optional persistence (safe to omit) --------------------------------

  createConversation?(title?: string): Promise<Conversation>
  renameConversation?(id: string, title: string): Promise<void>
  deleteConversation?(id: string): Promise<void>

  /**
   * Optional file upload used by the composer's attachment button.
   * Return the stored file's URL (or an id your backend understands).
   */
  uploadAttachment?(file: File, signal?: AbortSignal): Promise<{ id: string; url: string }>
}
