import { ScrollShadow } from '@heroui/react'
import { useEffect, useRef } from 'react'

import { EmptyState } from '@/components/EmptyState'
import { MessageBubble } from '@/components/MessageBubble'
import { useChat } from '@/store/ChatProvider'

/**
 * Scrollable message region. Auto-scrolls to the newest content while the
 * assistant streams, but only if the user is already near the bottom (so we
 * don't yank them away while they read history).
 */
export function MessageList() {
  const { messages } = useChat()
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  // Track whether the user is near the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottom.current = distance < 120
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll on new/streamed content.
  const lastContent = messages[messages.length - 1]?.content
  useEffect(() => {
    if (stickToBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages.length, lastContent])

  if (messages.length === 0) {
    return <EmptyState />
  }

  return (
    <ScrollShadow ref={scrollRef} className="h-full w-full" hideScrollBar>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={bottomRef} className="h-px" />
      </div>
    </ScrollShadow>
  )
}
