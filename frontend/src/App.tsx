import { useEffect, useState } from 'react'

import { ChatInput } from '@/components/ChatInput'
import { MessageList } from '@/components/MessageList'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { useChat } from '@/store/ChatProvider'

/**
 * Top-level layout: a collapsible sidebar next to the chat column
 * (TopBar → messages → composer). The sidebar is a persistent column on
 * desktop and an overlay drawer on mobile.
 */
export default function App() {
  const { error } = useChat()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Collapse the sidebar by default on small screens.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const apply = () => setSidebarOpen(!mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar — column on desktop, drawer on mobile */}
      <div
        className={`z-30 h-full transition-[width,transform] duration-300 ease-in-out
          max-md:absolute max-md:top-0 max-md:left-0
          ${sidebarOpen ? 'w-[280px] translate-x-0' : 'w-0 -translate-x-full md:w-0'}
          overflow-hidden`}
      >
        <Sidebar />
      </div>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="absolute inset-0 z-20 bg-black/50 md:hidden"
        />
      )}

      {/* Main chat column */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <TopBar onToggleSidebar={() => setSidebarOpen((v) => !v)} />

        {error && (
          <div className="border-b border-danger/20 bg-danger/10 px-4 py-2 text-center text-sm text-danger">
            {error}
          </div>
        )}

        <main className="min-h-0 flex-1">
          <MessageList />
        </main>

        <ChatInput />
      </div>
    </div>
  )
}
