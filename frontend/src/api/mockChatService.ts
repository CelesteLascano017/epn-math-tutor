import type { ChatService } from '@/api/ChatService'
import {
  mockConversations,
  mockModels,
  mockReplyText,
  mockUser,
} from '@/api/mockData'
import type {
  Conversation,
  ConversationSummary,
  Model,
  SendMessageRequest,
  Source,
  StreamChunk,
  User,
} from '@/types'

/**
 * ============================================================================
 *  MockChatService — a fully working, in-memory fake backend.
 * ============================================================================
 *
 *  It exists so the UI is usable with ZERO backend. It simulates network
 *  latency and streams a canned reply token-by-token, honoring the abort
 *  signal. Study it as a reference for what a real `ChatService` must do,
 *  then delete/ignore it once your HTTP adapter is wired up.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A private, mutable copy so create/rename/delete "persist" for the session.
let conversations: Conversation[] = structuredClone(mockConversations)

export class MockChatService implements ChatService {
  async getCurrentUser(): Promise<User> {
    await delay(120)
    return mockUser
  }

  async getModels(): Promise<Model[]> {
    await delay(120)
    return mockModels
  }

  async listConversations(): Promise<ConversationSummary[]> {
    await delay(150)
    return conversations
      .map(({ messages: _messages, ...summary }) => summary)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async getConversation(id: string): Promise<Conversation> {
    await delay(120)
    const found = conversations.find((c) => c.id === id)
    if (!found) throw new Error(`Conversation ${id} not found`)
    return structuredClone(found)
  }

  async *sendMessage(
    request: SendMessageRequest,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const { signal } = request

    // Simulate the backend "thinking" before the first token.
    await delay(500)
    throwIfAborted(signal)

    // Stream the canned reply word by word.
    const words = mockReplyText.split(' ')
    for (let i = 0; i < words.length; i++) {
      throwIfAborted(signal)
      await delay(35)
      yield { delta: (i === 0 ? '' : ' ') + words[i] }
    }

    // Emit some example sources at the end of the stream.
    const sources: Source[] = [
      { id: 's_a', title: 'ChatService interface', url: 'https://example.com/chatservice', snippet: 'Implement this to connect any backend.' },
      { id: 's_b', title: 'Streaming contract', url: 'https://example.com/streaming', snippet: 'Yield StreamChunk objects as tokens arrive.' },
    ]
    yield { sources, done: true }
  }

  // ----- Optional persistence (session-only for the mock) -------------------

  async createConversation(title = 'New Chat'): Promise<Conversation> {
    await delay(100)
    const convo: Conversation = {
      id: `c_${crypto.randomUUID()}`,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    }
    conversations = [convo, ...conversations]
    return structuredClone(convo)
  }

  async renameConversation(id: string, title: string): Promise<void> {
    await delay(80)
    const c = conversations.find((x) => x.id === id)
    if (c) {
      c.title = title
      c.updatedAt = Date.now()
    }
  }

  async deleteConversation(id: string): Promise<void> {
    await delay(80)
    conversations = conversations.filter((c) => c.id !== id)
  }

  async uploadAttachment(file: File): Promise<{ id: string; url: string }> {
    await delay(300)
    // The mock just hands back a local object URL for preview.
    return { id: crypto.randomUUID(), url: URL.createObjectURL(file) }
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}
