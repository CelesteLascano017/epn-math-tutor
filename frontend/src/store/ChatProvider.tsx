import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'

import { chatService } from '@/api'
import {
  chatReducer,
  initialChatState,
  type ChatState,
} from '@/store/chatReducer'
import type { Attachment, Message } from '@/types'

/**
 * ============================================================================
 *  ChatProvider — orchestrates the ChatService and exposes actions to the UI.
 * ============================================================================
 *
 *  Components never call the API directly. They call the actions returned by
 *  `useChat()`; this provider performs the side effects and keeps local state
 *  in sync. Because it depends only on the `ChatService` interface, swapping
 *  the backend requires no changes here.
 */

export interface ChatContextValue extends ChatState {
  selectModel: (modelId: string) => void
  selectConversation: (conversationId: string) => Promise<void>
  startNewConversation: () => void
  sendMessage: (text: string, attachments?: Attachment[]) => Promise<void>
  stopGenerating: () => void
  deleteConversation: (conversationId: string) => Promise<void>
  renameConversation: (conversationId: string, title: string) => Promise<void>
}

const ChatContext = createContext<ChatContextValue | null>(null)

const now = () => Date.now()
const uid = () => crypto.randomUUID()

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)

  // Holds the AbortController for the in-flight generation, if any.
  const abortRef = useRef<AbortController | null>(null)
  // Snapshot of messages for building the request without stale closures.
  const messagesRef = useRef<Message[]>(state.messages)
  messagesRef.current = state.messages

  // ----- bootstrap: load user, models, conversations -----------------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      dispatch({ type: 'BOOTSTRAP_START' })
      try {
        const [user, models, conversations] = await Promise.all([
          chatService.getCurrentUser(),
          chatService.getModels(),
          chatService.listConversations(),
        ])
        if (cancelled) return
        dispatch({ type: 'BOOTSTRAP_SUCCESS', user, models, conversations })
      } catch (err) {
        if (cancelled) return
        dispatch({ type: 'BOOTSTRAP_ERROR', error: errorMessage(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectModel = useCallback((modelId: string) => {
    dispatch({ type: 'SELECT_MODEL', modelId })
  }, [])

  const selectConversation = useCallback(async (conversationId: string) => {
    dispatch({ type: 'SET_ERROR', error: null })
    try {
      const conversation = await chatService.getConversation(conversationId)
      dispatch({ type: 'SELECT_CONVERSATION', conversationId, conversation })
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: errorMessage(err) })
    }
  }, [])

  const startNewConversation = useCallback(() => {
    // A conversation is created lazily on first send, so "New Chat" just clears
    // the active thread. This avoids empty conversations piling up.
    dispatch({ type: 'SELECT_CONVERSATION', conversationId: null })
  }, [])

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    dispatch({ type: 'SET_GENERATING', value: false })
  }, [])

  const sendMessage = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      const trimmed = text.trim()
      if (!trimmed && attachments.length === 0) return
      if (state.isGenerating) return

      // Ensure there is an active conversation (create one lazily).
      let conversationId = state.activeConversationId
      if (!conversationId) {
        const title = deriveTitle(trimmed)
        if (chatService.createConversation) {
          try {
            const convo = await chatService.createConversation(title)
            conversationId = convo.id
            dispatch({
              type: 'SELECT_CONVERSATION',
              conversationId,
              conversation: convo,
            })
          } catch {
            conversationId = `local_${uid()}`
          }
        } else {
          conversationId = `local_${uid()}`
        }
        dispatch({
          type: 'UPSERT_CONVERSATION_SUMMARY',
          summary: {
            id: conversationId,
            title,
            createdAt: now(),
            updatedAt: now(),
            modelId: state.selectedModelId ?? undefined,
          },
        })
        dispatch({ type: 'SELECT_CONVERSATION', conversationId })
      }

      // 1) Optimistically add the user's message.
      const userMessage: Message = {
        id: uid(),
        role: 'user',
        content: trimmed,
        createdAt: now(),
        status: 'complete',
        attachments,
      }
      dispatch({ type: 'ADD_MESSAGE', message: userMessage })

      // 2) Add a placeholder assistant message we'll stream into.
      const assistantId = uid()
      dispatch({
        type: 'ADD_MESSAGE',
        message: {
          id: assistantId,
          role: 'assistant',
          content: '',
          createdAt: now(),
          status: 'pending',
        },
      })

      // 3) Stream the reply.
      dispatch({ type: 'SET_GENERATING', value: true })
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const history = [...messagesRef.current, userMessage]
        const stream = chatService.sendMessage({
          conversationId,
          messages: history,
          modelId: state.selectedModelId ?? state.models[0]?.id ?? '',
          signal: controller.signal,
        })

        for await (const chunk of stream) {
          if (chunk.delta) {
            dispatch({ type: 'APPEND_DELTA', id: assistantId, delta: chunk.delta })
          }
          if (chunk.sources) {
            dispatch({
              type: 'UPDATE_MESSAGE',
              id: assistantId,
              patch: { sources: chunk.sources },
            })
          }
          if (chunk.metadata) {
            dispatch({
              type: 'UPDATE_MESSAGE',
              id: assistantId,
              patch: { metadata: chunk.metadata },
            })
          }
        }

        dispatch({
          type: 'UPDATE_MESSAGE',
          id: assistantId,
          patch: { status: 'complete' },
        })
      } catch (err) {
        if (isAbortError(err)) {
          // User stopped generation — keep whatever streamed so far.
          dispatch({
            type: 'UPDATE_MESSAGE',
            id: assistantId,
            patch: { status: 'complete' },
          })
        } else {
          dispatch({
            type: 'UPDATE_MESSAGE',
            id: assistantId,
            patch: {
              status: 'error',
              content: 'Sorry — something went wrong generating a response.',
            },
          })
          dispatch({ type: 'SET_ERROR', error: errorMessage(err) })
        }
      } finally {
        abortRef.current = null
        dispatch({ type: 'SET_GENERATING', value: false })
        // Bump the conversation to the top of the list.
        dispatch({
          type: 'UPSERT_CONVERSATION_SUMMARY',
          summary: {
            id: conversationId,
            title:
              state.conversations.find((c) => c.id === conversationId)?.title ??
              deriveTitle(trimmed),
            createdAt:
              state.conversations.find((c) => c.id === conversationId)?.createdAt ??
              now(),
            updatedAt: now(),
            modelId: state.selectedModelId ?? undefined,
          },
        })
      }
    },
    [
      state.isGenerating,
      state.activeConversationId,
      state.selectedModelId,
      state.models,
      state.conversations,
    ],
  )

  const deleteConversation = useCallback(async (conversationId: string) => {
    dispatch({ type: 'REMOVE_CONVERSATION', conversationId })
    try {
      await chatService.deleteConversation?.(conversationId)
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: errorMessage(err) })
    }
  }, [])

  const renameConversation = useCallback(
    async (conversationId: string, title: string) => {
      dispatch({ type: 'RENAME_CONVERSATION', conversationId, title })
      try {
        await chatService.renameConversation?.(conversationId, title)
      } catch (err) {
        dispatch({ type: 'SET_ERROR', error: errorMessage(err) })
      }
    },
    [],
  )

  const value = useMemo<ChatContextValue>(
    () => ({
      ...state,
      selectModel,
      selectConversation,
      startNewConversation,
      sendMessage,
      stopGenerating,
      deleteConversation,
      renameConversation,
    }),
    [
      state,
      selectModel,
      selectConversation,
      startNewConversation,
      sendMessage,
      stopGenerating,
      deleteConversation,
      renameConversation,
    ],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

/** Access the chat store. Must be used within a <ChatProvider>. */
export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within a ChatProvider')
  return ctx
}

// ----- helpers --------------------------------------------------------------

function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New Chat'
  return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
