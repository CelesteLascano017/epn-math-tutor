import type { ChatService } from '@/api/ChatService'
import type {
  Conversation,
  ConversationSummary,
  Message,
  MessageRole,
  MessageStatus,
  Model,
  Source,
  SendMessageRequest,
  StreamChunk,
  User,
} from '@/types'

// ---------------------------------------------------------------------------
// Internal types matching the TutorMath backend JSON shapes
// ---------------------------------------------------------------------------

interface ContentBlock {
  type: 'explanation' | 'definition' | 'formal_solution'
  content: string
}

interface BackendConversationSummary {
  id: string
  title: string
  created_at: number   // Unix seconds (float)
  updated_at: number
  model_id?: string
}

interface BackendMessage {
  id: string
  role: string
  content: string      // user: plain text | assistant: JSON blocks string
  created_at: number
}

interface BackendConversation extends BackendConversationSummary {
  messages: BackendMessage[]
}

interface BackendChatResponse {
  delta: string
  blocks: ContentBlock[]
  sources?: Source[]
  done: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Unix seconds (backend) → milliseconds (frontend Date). */
const toMs = (secs: number) => Math.round(secs * 1000)

/**
 * Convert structured blocks to a plain markdown string.
 * Used as the message.content fallback (copy-to-clipboard, history context).
 */
function blocksToMarkdown(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'definition':
          return `**DEFINICIÓN:** ${b.content}`
        case 'formal_solution':
          return `**Demostración:**\n\n${b.content}`
        default:
          return b.content
      }
    })
    .join('\n\n')
}

/** Parse assistant message content from DB (JSON blocks string) into blocks. */
function parseAssistantContent(content: string): ContentBlock[] | null {
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed) && parsed.length > 0 && 'type' in parsed[0]) {
      return parsed as ContentBlock[]
    }
  } catch {
    // Not JSON — plain text fallback
  }
  return null
}

/** Map a backend message object to a frontend Message. */
function mapMessage(m: BackendMessage): Message {
  const blocks = m.role === 'assistant' ? parseAssistantContent(m.content) : null
  return {
    id: m.id,
    role: m.role as MessageRole,
    content: blocks ? blocksToMarkdown(blocks) : m.content,
    createdAt: toMs(m.created_at),
    status: 'complete' as MessageStatus,
    metadata: blocks ? { blocks } : undefined,
  }
}

async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
  } catch {
    // Fall through to the generic transport error.
  }
  return null
}

// ---------------------------------------------------------------------------
// TutorMathChatService — implements ChatService for our FastAPI backend
// ---------------------------------------------------------------------------

export class TutorMathChatService implements ChatService {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`)
    if (!res.ok) throw new Error(`GET ${path} failed (${res.status} ${res.statusText})`)
    return res.json() as Promise<T>
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} failed (${res.status} ${res.statusText})`)
    return res.json() as Promise<T>
  }

  private async patchReq(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`PATCH ${path} failed (${res.status})`)
  }

  private async deleteReq(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`DELETE ${path} failed (${res.status})`)
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async getCurrentUser(): Promise<User> {
    const u = await this.get<{ id: string; name: string; email: string; avatarUrl?: string }>('/me')
    return { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl }
  }

  async getModels(): Promise<Model[]> {
    const response = await this.get<{ active: string; models: Array<{ id: string; name: string; description?: string }> }>('/models')
    return response.models
      .map((m) => ({ id: m.id, name: m.name, description: m.description }))
      .sort((a, b) => {
        if (a.id === 'ollama') return -1
        if (b.id === 'ollama') return 1
        if (a.id === response.active) return -1
        if (b.id === response.active) return 1
        return 0
      })
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const convos = await this.get<BackendConversationSummary[]>('/conversations')
    return convos.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: toMs(c.created_at),
      updatedAt: toMs(c.updated_at),
      modelId: c.model_id,
    }))
  }

  async getConversation(id: string): Promise<Conversation> {
    const c = await this.get<BackendConversation>(`/conversations/${id}`)
    return {
      id: c.id,
      title: c.title,
      createdAt: toMs(c.created_at),
      updatedAt: toMs(c.updated_at),
      messages: c.messages.map(mapMessage),
    }
  }

  // ── Core send (non-streaming, yields one full chunk) ──────────────────────

  async *sendMessage(request: SendMessageRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const { signal, conversationId, messages } = request

    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        conversation_id: conversationId,
        model: request.modelId,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments?.map((a) => ({
            id: a.id,
            name: a.name,
            mimeType: a.mimeType,
            url: a.url,
          })) ?? [],
        })),
      }),
    })

    if (!res.ok) {
      throw new Error(`Chat request failed (${res.status} ${res.statusText})`)
    }

    const data = (await res.json()) as BackendChatResponse

    // Yield the full response — delta as text, blocks as metadata for rich rendering
    yield {
      delta: data.delta,
      sources: data.sources ?? [],
      metadata: { blocks: data.blocks },
      done: true,
    }
  }

  async uploadAttachment(file: File, signal?: AbortSignal): Promise<{ id: string; url: string }> {
    const form = new FormData()
    form.append('file', file)

    const res = await fetch(`${this.baseUrl}/rag/documents`, {
      method: 'POST',
      body: form,
      signal,
    })

    if (!res.ok) {
      const message = await readErrorMessage(res)
      throw new Error(message ?? `Upload failed (${res.status} ${res.statusText})`)
    }

    const data = (await res.json()) as { id: string; url: string }
    return { id: data.id, url: `${this.baseUrl}${data.url}` }
  }

  // ── Optional persistence ──────────────────────────────────────────────────

  async createConversation(title?: string): Promise<Conversation> {
    const c = await this.post<BackendConversation>('/conversations', { title: title ?? null })
    return {
      id: c.id,
      title: c.title,
      createdAt: toMs(c.created_at),
      updatedAt: toMs(c.updated_at),
      messages: [],
    }
  }

  async renameConversation(id: string, title: string): Promise<void> {
    await this.patchReq(`/conversations/${id}`, { title })
  }

  async deleteConversation(id: string): Promise<void> {
    await this.deleteReq(`/conversations/${id}`)
  }
}
