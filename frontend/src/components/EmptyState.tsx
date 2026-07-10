import { useChat } from '@/store/ChatProvider'

/**
 * Shown when a conversation has no messages yet (new chat). Presents a friendly
 * greeting and a few starter prompts that seed the composer via `sendMessage`.
 */
const STARTERS = [
  'Explain quantum computing in simple terms',
  'Draft a launch checklist for Q3',
  'Give me 3 quick dinner ideas',
  'Rewrite this paragraph to be more concise',
]

export function EmptyState() {
  const { user, sendMessage, isGenerating } = useChat()
  const firstName = user?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="flex h-full w-full items-center justify-center px-4">
      <div className="w-full max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
          <span className="text-2xl">✦</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Hi {firstName}, how can I help?
        </h1>
        <p className="mt-2 text-default-500">
          Ask anything, or start with one of these.
        </p>

        <div className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          {STARTERS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isGenerating}
              onClick={() => sendMessage(prompt)}
              className="rounded-2xl bg-content1 px-4 py-3 text-left text-sm text-default-600 ring-1 ring-white/5 transition-colors hover:bg-content2 hover:text-foreground disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
