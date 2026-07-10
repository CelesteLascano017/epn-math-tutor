import { Button, Image, Tooltip } from '@heroui/react'
import { useState } from 'react'

import { AttachmentChip } from '@/components/AttachmentChip'
import { Markdown } from '@/components/Markdown'
import { Sources } from '@/components/Sources'
import { TutorBlocks } from '@/components/TutorBlocks'
import type { ContentBlock } from '@/components/TutorBlocks'
import { CopyIcon, CheckIcon, MoreIcon, RegenerateIcon } from '@/components/icons'
import { isImage } from '@/lib/format'
import type { Message } from '@/types'

/**
 * Renders a single message.
 *  - User messages: right-aligned rounded "pill" (like the reference).
 *  - Assistant messages: left-aligned prose with hover actions + sources.
 *  - Image attachments render large above the text.
 */
export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const imageAttachments = message.attachments?.filter((a) => isImage(a.mimeType)) ?? []
  const fileAttachments = message.attachments?.filter((a) => !isImage(a.mimeType)) ?? []

  return (
    <div className={`group flex w-full flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Large image previews (assistant or user) */}
      {imageAttachments.length > 0 && (
        <div className="mb-2 flex max-w-[85%] flex-wrap justify-end gap-2">
          {imageAttachments.map((att) => (
            <Image
              key={att.id}
              src={att.url}
              alt={att.name}
              radius="lg"
              className="max-h-80 w-full object-cover"
              classNames={{ wrapper: 'overflow-hidden rounded-2xl ring-1 ring-white/10' }}
            />
          ))}
        </div>
      )}

      {/* Non-image file chips */}
      {fileAttachments.length > 0 && (
        <div className={`mb-2 flex flex-wrap gap-2 ${isUser ? 'justify-end' : ''}`}>
          {fileAttachments.map((att) => (
            <AttachmentChip key={att.id} attachment={att} />
          ))}
        </div>
      )}

      {/* Message body */}
      {isUser ? (
        message.content && (
          <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-content2 px-4 py-2.5 text-[15px] text-foreground ring-1 ring-white/5">
            {message.content}
          </div>
        )
      ) : (
        <AssistantBody message={message} />
      )}
    </div>
  )
}

function AssistantBody({ message }: { message: Message }) {
  const isPending = message.status === 'pending' && !message.content
  const isError = message.status === 'error'

  return (
    <div className="w-full max-w-full">
      {isPending ? (
        <TypingIndicator />
      ) : (
        <div
          className={`text-[15px] ${
            isError ? 'text-danger' : 'text-foreground/90'
          }`}
        >
          {message.metadata?.blocks
            ? (
              <TutorBlocks
                blocks={message.metadata.blocks as ContentBlock[]}
              />
            )
            : <Markdown content={message.content} />}
        </div>
      )}

      {message.sources && message.sources.length > 0 && (
        <div className="mt-3">
          <Sources sources={message.sources} />
        </div>
      )}

      {/* Hover actions */}
      {message.status === 'complete' && message.content && (
        <MessageActions content={message.content} />
      )}
    </div>
  )
}

function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <Tooltip content={copied ? 'Copied' : 'Copy'} size="sm" placement="bottom">
        <Button
          isIconOnly
          size="sm"
          variant="light"
          radius="full"
          aria-label="Copy message"
          onPress={copy}
          className="text-default-500"
        >
          {copied ? <CheckIcon width={16} height={16} /> : <CopyIcon width={16} height={16} />}
        </Button>
      </Tooltip>
      {/* These are illustrative actions; wire them up to your backend as needed. */}
      <Tooltip content="Regenerate" size="sm" placement="bottom">
        <Button
          isIconOnly
          size="sm"
          variant="light"
          radius="full"
          aria-label="Regenerate response"
          className="text-default-500"
        >
          <RegenerateIcon width={16} height={16} />
        </Button>
      </Tooltip>
      <Tooltip content="More" size="sm" placement="bottom">
        <Button
          isIconOnly
          size="sm"
          variant="light"
          radius="full"
          aria-label="More actions"
          className="text-default-500"
        >
          <MoreIcon width={16} height={16} />
        </Button>
      </Tooltip>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-2" aria-label="Assistant is typing">
      <span className="typing-dot h-2 w-2 rounded-full bg-default-400" />
      <span className="typing-dot h-2 w-2 rounded-full bg-default-400" />
      <span className="typing-dot h-2 w-2 rounded-full bg-default-400" />
    </div>
  )
}
