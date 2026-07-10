import { Accordion, AccordionItem, Link } from '@heroui/react'

import { GlobeIcon } from '@/components/icons'
import type { Source } from '@/types'

/**
 * Collapsible "N sources" pill shown beneath an assistant message, matching the
 * reference design. Purely presentational — sources come from the message.
 */
export function Sources({ sources }: { sources: Source[] }) {
  if (!sources.length) return null

  return (
    <Accordion
      isCompact
      className="px-0"
      itemClasses={{
        base: 'px-0',
        trigger: 'py-1.5 px-3 rounded-full bg-content2 hover:bg-content3 transition-colors w-fit data-[open=true]:rounded-b-none',
        title: 'text-xs font-medium text-default-500',
        content: 'pt-2',
      }}
    >
      <AccordionItem
        key="sources"
        aria-label="Fuentes"
        title={`${sources.length} fuente${sources.length > 1 ? 's' : ''}`}
        indicator={<span className="text-default-500" />}
      >
        <ul className="flex flex-col gap-2">
          {sources.map((source, index) => (
            <li
              key={source.id}
              className="flex gap-3 rounded-xl bg-content2 p-3 ring-1 ring-white/5"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-content3 text-default-500">
                <GlobeIcon width={14} height={14} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-default-400">{index + 1}</span>
                  {source.url ? (
                    <Link
                      href={source.url}
                      isExternal
                      size="sm"
                      className="truncate text-sm font-medium text-foreground"
                    >
                      {source.title}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium">{source.title}</span>
                  )}
                </div>
                {source.snippet && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-default-500">
                    {source.snippet}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </AccordionItem>
    </Accordion>
  )
}
