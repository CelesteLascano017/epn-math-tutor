import type { ChatService } from '@/api/ChatService'
import { endpoints } from '@/api/endpoints'
import { env } from '@/config/env'
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
 *  HttpChatService — a ready-to-edit HTTP adapter (⭐ THE INTEGRATION FILE ⭐)
 * ============================================================================
 *
 *  This is where a backend engineer does 90% of the wiring. It already:
 *    - reads config from `.env` (base URL, token, streaming on/off),
 *    - builds requests, attaches auth, parses JSON,
 *    - decodes a streaming chat response (SSE-style `data:` lines OR raw
 *      chunked text) into {@link StreamChunk}s.
 *
 *  To connect YOUR backend you typically only:
 *    1. Set VITE_CHAT_BACKEND=http and VITE_API_BASE_URL in `.env`.
 *    2. Adjust the paths in `endpoints.ts`.
 *    3. Map your response shapes to the domain types inside the `m*` helpers
 *       below (search for "MAP:"). If your JSON already matches `src/types`,
 *       there is nothing to change.
 *
 *  Nothing about a specific provider is assumed. Everything is a placeholder
 *  you are meant to edit.
 */
export class HttpChatService implements ChatService {
  private readonly baseUrl = env.apiBaseUrl.replace(/\/$/, '')

  // ----- request helpers ----------------------------------------------------

  private headers(extra?: HeadersInit): HeadersInit {
    return {
      'Content-Type': 'application/json',
      // MAP: replace with your own auth scheme if not a bearer token.
      ...(env.apiToken ? { Authorization: `Bearer ${env.apiToken}` } : {}),
      ...extra,
    }
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init?.headers),
    })
    if (!res.ok) {
      throw new Error(`Request failed (${res.status} ${res.statusText}) for ${path}`)
    }
    return (await res.json()) as T
  }

  // ----- reads --------------------------------------------------------------

  async getCurrentUser(): Promise<User> {
    // MAP: shape your `/me` payload into `User` here if field names differ.
    return this.json<User>(endpoints.currentUser())
  }

  async getModels(): Promise<Model[]> {
    return this.json<Model[]>(endpoints.models())
  }

  async listConversations(): Promise<ConversationSummary[]> {
    return this.json<ConversationSummary[]>(endpoints.conversations())
  }

  async getConversation(id: string): Promise<Conversation> {
    return this.json<Conversation>(endpoints.conversation(id))
  }

  // ----- the core streaming call --------------------------------------------

  async *sendMessage(
    request: SendMessageRequest,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const { signal, ...payload } = request

    const res = await fetch(`${this.baseUrl}${endpoints.chat()}`, {
      method: 'POST',
      headers: this.headers(),
      signal,
      // MAP: shape the request body your backend expects. Many backends want
      // just `{ model, messages: [{ role, content }] }` — trim as needed.
      body: JSON.stringify({
        conversationId: payload.conversationId,
        model: payload.modelId,
        stream: env.enableStreaming,
        messages: payload.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!res.ok || !res.body) {
      throw new Error(`Chat request failed (${res.status} ${res.statusText})`)
    }

    // ---- Non-streaming path: one JSON object with the whole reply. ---------
    if (!env.enableStreaming) {
      const data = (await res.json()) as {
        content?: string
        message?: { content?: string }
        sources?: StreamChunk['sources']
      }
      // MAP: pull the assistant text out of your response shape.
      const content = data.content ?? data.message?.content ?? ''
      yield { delta: content, sources: data.sources, done: true }
      return
    }

    // ---- Streaming path: read the body and decode chunks. ------------------
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // We support two common wire formats:
        //   (a) SSE-style: lines beginning with "data: <json|text>"
        //   (b) raw text:  the chunk *is* the delta (no framing)
        // Adjust this loop to match your server's framing.
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // keep the last, possibly-partial line

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) continue

          if (line.startsWith('data:')) {
            const data = line.slice(5).trim()
            if (data === '[DONE]') {
              yield { done: true }
              return
            }
            yield parseSsePayload(data)
          } else {
            // Raw text framing — treat the whole line as a token delta.
            yield { delta: rawLine }
          }
        }
      }

      // Flush any trailing buffered text.
      if (buffer.trim()) yield { delta: buffer }
      yield { done: true }
    } finally {
      reader.releaseLock()
    }
  }

  // ----- optional persistence -----------------------------------------------

  async createConversation(title?: string): Promise<Conversation> {
    return this.json<Conversation>(endpoints.createConversation(), {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  }

  async renameConversation(id: string, title: string): Promise<void> {
    await this.json<unknown>(endpoints.renameConversation(id), {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    })
  }

  async deleteConversation(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${endpoints.deleteConversation(id)}`, {
      method: 'DELETE',
      headers: this.headers(),
    })
    if (!res.ok) throw new Error(`Delete failed (${res.status})`)
  }

  async uploadAttachment(
    file: File,
    signal?: AbortSignal,
  ): Promise<{ id: string; url: string }> {
    const form = new FormData()
    form.append('file', file)
    // Note: don't set Content-Type manually for FormData — the browser adds the
    // multipart boundary. We only forward auth here.
    const res = await fetch(`${this.baseUrl}${endpoints.upload()}`, {
      method: 'POST',
      headers: env.apiToken ? { Authorization: `Bearer ${env.apiToken}` } : undefined,
      body: form,
      signal,
    })
    if (!res.ok) throw new Error(`Upload failed (${res.status})`)
    // MAP: shape your upload response into `{ id, url }`.
    return (await res.json()) as { id: string; url: string }
  }
}

/**
 * Parse one SSE `data:` payload into a StreamChunk. Handles both JSON payloads
 * (e.g. `{"delta":"hi"}` or OpenAI-like `{"choices":[{"delta":{"content":"hi"}}]}`)
 * and plain text. Edit to match your server.
 */
function parseSsePayload(data: string): StreamChunk {
  try {
    const json = JSON.parse(data) as Record<string, unknown>
    // Common shapes — extend as needed:
    const delta =
      (json.delta as string | undefined) ??
      (json.content as string | undefined) ??
      // OpenAI-compatible:
      ((json.choices as any[] | undefined)?.[0]?.delta?.content as string | undefined)
    return {
      delta,
      sources: json.sources as StreamChunk['sources'],
      done: json.done as boolean | undefined,
    }
  } catch {
    // Not JSON — treat the payload as a raw text delta.
    return { delta: data }
  }
}
