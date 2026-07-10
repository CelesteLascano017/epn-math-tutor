import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  ScrollShadow,
  Skeleton,
  Tooltip,
} from '@heroui/react'

import {
  ChatBubbleIcon,
  LibraryIcon,
  MoonIcon,
  MoreIcon,
  NewChatIcon,
  PencilIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon,
} from '@/components/icons'
import { LibraryModal } from '@/components/LibraryModal'
import { SettingsModal } from '@/components/SettingsModal'
import { getInitials } from '@/lib/format'
import { useTheme } from '@/providers/ThemeProvider'
import { useChat } from '@/store/ChatProvider'
import { useDisclosure } from '@heroui/react'

/**
 * Left navigation: user profile, primary nav, and the "Recent" conversation
 * list. Mirrors the reference design. Conversation selection/deletion flow
 * through the chat store.
 */
export function Sidebar() {
  const {
    user,
    conversations,
    activeConversationId,
    isBootstrapping,
    selectConversation,
    startNewConversation,
    deleteConversation,
    renameConversation,
  } = useChat()
  const { theme, toggleTheme } = useTheme()
  const { isOpen, onOpen, onOpenChange } = useDisclosure()
  const {
    isOpen: isLibraryOpen,
    onOpen: onLibraryOpen,
    onOpenChange: onLibraryOpenChange,
  } = useDisclosure()

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col bg-content1/60 backdrop-blur-xl">
      {/* Profile */}
      <div className="flex items-center gap-3 px-4 py-4">
        {isBootstrapping ? (
          <>
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-2.5 w-32 rounded" />
            </div>
          </>
        ) : (
          <>
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-indigo-500 text-xs font-semibold text-white ring-1 ring-white/10">
                {user ? getInitials(user.name) : ''}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {user?.name}
              </p>
              <p className="truncate text-xs text-default-400">{user?.email}</p>
            </div>
          </>
        )}
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5 px-3">
        <NavItem
          icon={<NewChatIcon width={18} height={18} />}
          label="New Chat"
          onClick={startNewConversation}
        />
        <NavItem
          icon={<LibraryIcon width={18} height={18} />}
          label="Library"
          onClick={onLibraryOpen}
        />
        <NavItem 
          icon={<SettingsIcon width={18} height={18} />} 
          label="Ajustes" 
          onClick={onOpen} 
        />
      </nav>

      <div className="mx-4 my-3 h-px bg-white/5" />

      {/* Recent conversations */}
      <p className="px-5 pb-2 text-xs font-medium text-default-400">Recent</p>
      <ScrollShadow className="min-h-0 flex-1 px-3" hideScrollBar>
        <ul className="flex flex-col gap-0.5 pb-2">
          {isBootstrapping
            ? Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="px-2 py-2">
                  <Skeleton className="h-3.5 w-full rounded" />
                </li>
              ))
            : conversations.map((convo) => (
                <ConversationItem
                  key={convo.id}
                  id={convo.id}
                  title={convo.title}
                  active={convo.id === activeConversationId}
                  onSelect={() => selectConversation(convo.id)}
                  onDelete={() => deleteConversation(convo.id)}
                  onRename={() => {
                    const next = window.prompt('Rename conversation', convo.title)
                    if (next && next.trim()) renameConversation(convo.id, next.trim())
                  }}
                />
              ))}
          {!isBootstrapping && conversations.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-default-400">
              No conversations yet.
            </li>
          )}
        </ul>
      </ScrollShadow>

      {/* Footer: theme toggle */}
      <div className="border-t border-white/5 p-3">
        <Tooltip content={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} placement="right" size="sm">
          <Button
            variant="light"
            radius="lg"
            className="w-full justify-start text-default-500"
            startContent={
              theme === 'dark' ? (
                <SunIcon width={18} height={18} />
              ) : (
                <MoonIcon width={18} height={18} />
              )
            }
            onPress={toggleTheme}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </Button>
        </Tooltip>
      </div>

      <SettingsModal isOpen={isOpen} onOpenChange={onOpenChange} />
      <LibraryModal isOpen={isLibraryOpen} onOpenChange={onLibraryOpenChange} />
    </aside>
  )
}

function NavItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-default-600 transition-colors hover:bg-content2 hover:text-foreground"
    >
      <span className="text-default-500">{icon}</span>
      {label}
    </button>
  )
}

function ConversationItem({
  title,
  active,
  onSelect,
  onDelete,
  onRename,
}: {
  id: string
  title: string
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: () => void
}) {
  return (
    <li
      className={`group flex items-center gap-2 rounded-xl px-2.5 py-2 transition-colors ${
        active ? 'bg-content2 text-foreground' : 'text-default-600 hover:bg-content2/60'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <ChatBubbleIcon width={16} height={16} className="shrink-0 text-default-400" />
        <span className="truncate text-sm">{title}</span>
      </button>

      <Dropdown placement="bottom-end">
        <DropdownTrigger>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            radius="full"
            aria-label="Conversation options"
            className="h-6 w-6 min-w-6 shrink-0 text-default-400 opacity-0 group-hover:opacity-100 data-[open=true]:opacity-100"
          >
            <MoreIcon width={16} height={16} />
          </Button>
        </DropdownTrigger>
        <DropdownMenu aria-label="Conversation actions">
          <DropdownItem
            key="rename"
            startContent={<PencilIcon width={16} height={16} />}
            onPress={onRename}
          >
            Rename
          </DropdownItem>
          <DropdownItem
            key="delete"
            className="text-danger"
            color="danger"
            startContent={<TrashIcon width={16} height={16} />}
            onPress={onDelete}
          >
            Delete
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </li>
  )
}
