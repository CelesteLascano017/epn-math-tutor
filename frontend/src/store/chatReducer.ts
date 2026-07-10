import type {
  Attachment,
  Conversation,
  ConversationSummary,
  Message,
  Model,
  User,
} from '@/types'

/**
 * Reducer + state shape for the chat store. Kept transport-agnostic: the
 * provider (`ChatProvider`) performs side effects via the `ChatService` and
 * dispatches these plain actions to update the UI.
 */

export interface ChatState {
  user: User | null
  models: Model[]
  selectedModelId: string | null

  conversations: ConversationSummary[]
  activeConversationId: string | null
  /** Messages for the active conversation only. */
  messages: Message[]

  /** True from send until the assistant message completes. */
  isGenerating: boolean
  /** Initial data load flag (user, models, conversations). */
  isBootstrapping: boolean
  error: string | null
}

export const initialChatState: ChatState = {
  user: null,
  models: [],
  selectedModelId: null,
  conversations: [],
  activeConversationId: null,
  messages: [],
  isGenerating: false,
  isBootstrapping: true,
  error: null,
}

export type ChatAction =
  | { type: 'BOOTSTRAP_START' }
  | {
      type: 'BOOTSTRAP_SUCCESS'
      user: User
      models: Model[]
      conversations: ConversationSummary[]
    }
  | { type: 'BOOTSTRAP_ERROR'; error: string }
  | { type: 'SELECT_MODEL'; modelId: string }
  | { type: 'SET_CONVERSATIONS'; conversations: ConversationSummary[] }
  | { type: 'SELECT_CONVERSATION'; conversationId: string | null; conversation?: Conversation }
  | { type: 'ADD_MESSAGE'; message: Message }
  | { type: 'UPDATE_MESSAGE'; id: string; patch: Partial<Message> }
  | { type: 'APPEND_DELTA'; id: string; delta: string }
  | { type: 'SET_GENERATING'; value: boolean }
  | { type: 'UPSERT_CONVERSATION_SUMMARY'; summary: ConversationSummary }
  | { type: 'REMOVE_CONVERSATION'; conversationId: string }
  | { type: 'RENAME_CONVERSATION'; conversationId: string; title: string }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET_MESSAGES' }

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'BOOTSTRAP_START':
      return { ...state, isBootstrapping: true, error: null }

    case 'BOOTSTRAP_SUCCESS':
      return {
        ...state,
        isBootstrapping: false,
        user: action.user,
        models: action.models,
        selectedModelId:
          state.selectedModelId ??
          action.models.find((model) => model.id === 'ollama')?.id ??
          action.models[0]?.id ??
          null,
        conversations: action.conversations,
      }

    case 'BOOTSTRAP_ERROR':
      return { ...state, isBootstrapping: false, error: action.error }

    case 'SELECT_MODEL':
      return { ...state, selectedModelId: action.modelId }

    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations }

    case 'SELECT_CONVERSATION':
      return {
        ...state,
        activeConversationId: action.conversationId,
        messages: action.conversation?.messages ?? [],
        selectedModelId:
          action.conversation?.modelId ?? state.selectedModelId,
        error: null,
      }

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] }

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m,
        ),
      }

    case 'APPEND_DELTA':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id
            ? { ...m, content: m.content + action.delta, status: 'streaming' }
            : m,
        ),
      }

    case 'SET_GENERATING':
      return { ...state, isGenerating: action.value }

    case 'UPSERT_CONVERSATION_SUMMARY': {
      const exists = state.conversations.some((c) => c.id === action.summary.id)
      const conversations = exists
        ? state.conversations.map((c) =>
            c.id === action.summary.id ? action.summary : c,
          )
        : [action.summary, ...state.conversations]
      return {
        ...state,
        conversations: conversations.sort((a, b) => b.updatedAt - a.updatedAt),
      }
    }

    case 'REMOVE_CONVERSATION': {
      const conversations = state.conversations.filter(
        (c) => c.id !== action.conversationId,
      )
      const wasActive = state.activeConversationId === action.conversationId
      return {
        ...state,
        conversations,
        activeConversationId: wasActive ? null : state.activeConversationId,
        messages: wasActive ? [] : state.messages,
      }
    }

    case 'RENAME_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId ? { ...c, title: action.title } : c,
        ),
      }

    case 'SET_ERROR':
      return { ...state, error: action.error }

    case 'RESET_MESSAGES':
      return { ...state, messages: [] }

    default:
      return state
  }
}

/** Small helper used by the provider to create a fresh attachment id. */
export function makeAttachmentPreview(file: File): Attachment {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type,
    size: file.size,
    url: URL.createObjectURL(file),
    uploading: true,
  }
}
