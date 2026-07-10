import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Textarea,
  Tooltip,
} from '@heroui/react'
import {
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'

import { chatService } from '@/api'
import { AttachmentChip } from '@/components/AttachmentChip'
import {
  ArrowUpIcon,
  ChevronDownIcon,
  PaperclipIcon,
  StopIcon,
} from '@/components/icons'
import { makeAttachmentPreview } from '@/store/chatReducer'
import { useChat } from '@/store/ChatProvider'
import type { Attachment } from '@/types'

/**
 * The composer at the bottom of the chat. Handles:
 *  - auto-growing multiline input (Enter to send, Shift+Enter for newline),
 *  - staging + uploading attachments (via ChatService.uploadAttachment),
 *  - model selection,
 *  - a "web search" toggle (UI only — forward it to your backend if you want),
 *  - send / stop-generating.
 */
export function ChatInput() {
  const {
    models,
    selectedModelId,
    selectModel,
    sendMessage,
    stopGenerating,
    isGenerating,
  } = useChat()

  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedModel =
    models.find((m) => m.id === selectedModelId) ?? models[0] ?? null

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isGenerating

  const handleSend = async () => {
    if (isGenerating) return
    if (!canSend) return
    const toSend = text
    const atts = attachments
    setText('')
    setAttachments([])
    await sendMessage(toSend, atts)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-selecting the same file
    if (!files.length) return

    // Show optimistic previews immediately.
    const previews = files.map(makeAttachmentPreview)
    setAttachments((prev) => [...prev, ...previews])

    // Upload each (if the backend supports it) and swap in the returned URL.
    await Promise.all(
      previews.map(async (preview, idx) => {
        try {
          if (chatService.uploadAttachment) {
            const { id, url } = await chatService.uploadAttachment(files[idx])
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === preview.id ? { ...a, id, url, uploading: false } : a,
              ),
            )
          } else {
            setAttachments((prev) =>
              prev.map((a) => (a.id === preview.id ? { ...a, uploading: false } : a)),
            )
          }
        } catch {
          // Drop the attachment on failure.
          setAttachments((prev) => prev.filter((a) => a.id !== preview.id))
        }
      }),
    )
  }

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id))

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className="rounded-3xl bg-content1 p-2.5 shadow-lg ring-1 ring-white/10 focus-within:ring-white/20">
        {/* Staged attachments */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 pb-2 pt-1">
            {attachments.map((att) => (
              <AttachmentChip key={att.id} attachment={att} onRemove={removeAttachment} />
            ))}
          </div>
        )}

        {/* Text input */}
        <Textarea
          value={text}
          onValueChange={setText}
          onKeyDown={handleKeyDown}
          minRows={1}
          maxRows={8}
          variant="flat"
          placeholder="What do you want to know?"
          classNames={{
            base: 'w-full',
            inputWrapper:
              'bg-transparent shadow-none group-data-[focus=true]:bg-transparent hover:!bg-transparent data-[hover=true]:bg-transparent px-2',
            input: 'text-[15px] placeholder:text-default-400',
          }}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <div className="flex items-center gap-1">
            {/* Attach */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleFiles}
              aria-hidden
            />
            <Tooltip content="Attach files" size="sm" placement="top">
              <Button
                isIconOnly
                size="sm"
                radius="full"
                variant="light"
                aria-label="Attach files"
                onPress={() => fileInputRef.current?.click()}
                className="text-default-500"
              >
                <PaperclipIcon width={18} height={18} />
              </Button>
            </Tooltip>

            {/* Model selector */}
            {selectedModel && (
              <Dropdown placement="top-start">
                <DropdownTrigger>
                  <Button
                    size="sm"
                    radius="full"
                    variant="light"
                    endContent={<ChevronDownIcon width={14} height={14} />}
                    className="text-default-600"
                  >
                    {selectedModel.name}
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="Select model"
                  selectionMode="single"
                  selectedKeys={selectedModelId ? [selectedModelId] : []}
                  onAction={(key) => selectModel(String(key))}
                  disabledKeys={models.filter((m) => m.disabled).map((m) => m.id)}
                >
                  {models.map((model) => (
                    <DropdownItem
                      key={model.id}
                      description={model.description}
                      endContent={
                        model.badge ? (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {model.badge}
                          </span>
                        ) : null
                      }
                    >
                      {model.name}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>
            )}
          </div>

          {/* Send / Stop */}
          {isGenerating ? (
            <Button
              isIconOnly
              size="sm"
              radius="full"
              color="default"
              aria-label="Stop generating"
              onPress={stopGenerating}
              className="bg-default-200 text-foreground"
            >
              <StopIcon width={18} height={18} />
            </Button>
          ) : (
            <Button
              isIconOnly
              size="sm"
              radius="full"
              color="primary"
              aria-label="Send message"
              isDisabled={!canSend}
              onPress={handleSend}
              className="disabled:opacity-40"
            >
              <ArrowUpIcon width={18} height={18} />
            </Button>
          )}
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-default-400">
        AI can make mistakes. Check important info.
      </p>
    </div>
  )
}
