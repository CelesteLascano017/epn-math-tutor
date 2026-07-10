import { Button, Tooltip } from '@heroui/react'

import { SidebarIcon } from '@/components/icons'
import { formatRelativeTime } from '@/lib/format'
import { useChat } from '@/store/ChatProvider'

/** The header above the chat: sidebar toggle and current conversation status. */
export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { conversations, activeConversationId } = useChat()
  const active = conversations.find((c) => c.id === activeConversationId)

  return (
    <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
      <Tooltip content="Toggle sidebar" size="sm" placement="bottom">
        <Button
          isIconOnly
          size="sm"
          variant="light"
          radius="full"
          aria-label="Toggle sidebar"
          onPress={onToggleSidebar}
          className="text-default-500"
        >
          <SidebarIcon width={20} height={20} />
        </Button>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-foreground">
          {active?.title ?? 'New Chat'}
        </h2>
        <p className="truncate text-xs text-default-400">
          {active ? `Updated ${formatRelativeTime(active.updatedAt)}` : 'Start a conversation'}
        </p>
      </div>
    </header>
  )
}
