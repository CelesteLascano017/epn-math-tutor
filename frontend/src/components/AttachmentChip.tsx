import { Image } from '@heroui/react'

import { CloseIcon, FileIcon } from '@/components/icons'
import { formatBytes, isImage } from '@/lib/format'
import type { Attachment } from '@/types'

/**
 * A compact attachment chip. Used both inside sent messages (read-only) and in
 * the composer's staging area (with a remove button).
 */
export function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment
  onRemove?: (id: string) => void
}) {
  return (
    <div className="group relative flex items-center gap-2 rounded-xl bg-content2 py-1.5 pl-1.5 pr-3 ring-1 ring-white/10">
      {isImage(attachment.mimeType) ? (
        <Image
          src={attachment.url}
          alt={attachment.name}
          radius="lg"
          className="h-9 w-9 object-cover"
          removeWrapper
        />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-content3 text-default-500">
          <FileIcon width={16} height={16} />
        </span>
      )}
      <div className="min-w-0">
        <p className="max-w-[160px] truncate text-xs font-medium">{attachment.name}</p>
        <p className="text-[11px] text-default-400">
          {attachment.uploading ? 'Uploading…' : formatBytes(attachment.size)}
        </p>
      </div>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${attachment.name}`}
          onClick={() => onRemove(attachment.id)}
          className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-default-700 text-white shadow ring-1 ring-black/20 group-hover:flex hover:bg-default-600"
        >
          <CloseIcon width={12} height={12} />
        </button>
      )}
    </div>
  )
}
