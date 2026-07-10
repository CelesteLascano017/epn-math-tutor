import type { ChatService } from '@/api/ChatService'
import { HttpChatService } from '@/api/httpChatService'
import { MockChatService } from '@/api/mockChatService'
import { TutorMathChatService } from '@/api/tutorMathService'
import { env } from '@/config/env'

/**
 * ============================================================================
 *  Service factory — the ONE place the app decides which backend to talk to.
 * ============================================================================
 *
 *  Selection is driven by `VITE_CHAT_BACKEND` (see `.env`):
 *    - "tutormath" → TutorMathChatService  (our FastAPI backend)
 *    - "mock"      → MockChatService       (default, zero setup)
 *    - "http"      → HttpChatService       (generic HTTP adapter)
 */
export function createChatService(): ChatService {
  switch (env.backend) {
    case 'tutormath':
      return new TutorMathChatService(env.apiBaseUrl)
    case 'http':
      return new HttpChatService()
    case 'mock':
    default:
      return new MockChatService()
  }
}

/** A shared singleton instance used throughout the app. */
export const chatService: ChatService = createChatService()

export type { ChatService }
