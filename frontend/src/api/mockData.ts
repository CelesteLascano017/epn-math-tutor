import type { Conversation, Model, User } from '@/types'

/**
 * Seed data for the built-in mock backend. Purely cosmetic — it lets the UI
 * look "alive" on first load and mirrors the reference design. None of this
 * ships to a real backend; the HTTP adapter fetches its own data.
 */

export const mockUser: User = {
  id: 'u_1',
  name: 'Darnell Howe',
  email: 'darnell@email.com',
  avatarUrl: undefined, // renders initials by default
}

export const mockModels: Model[] = [
  { id: 'gpt-5.4', name: 'GPT-5.4', description: 'Most capable, best for complex tasks', badge: 'Pro' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', description: 'Faster and cheaper' },
  { id: 'claude-opus', name: 'Claude Opus', description: 'Great at long-form reasoning' },
  { id: 'gemini-ultra', name: 'Gemini Ultra', description: 'Strong multimodal understanding' },
]

const now = Date.now()
const minutes = (n: number) => now - n * 60_000

export const mockConversations: Conversation[] = [
  {
    id: 'c_1',
    title: 'Pro AI components showcase',
    createdAt: minutes(60),
    updatedAt: minutes(1),
    modelId: 'gpt-5.4',
    messages: [
      {
        id: 'm_1',
        role: 'user',
        content: 'Show sources and file attachments.',
        createdAt: minutes(6),
        status: 'complete',
      },
      {
        id: 'm_2',
        role: 'user',
        content: 'What can you tell me about this wireframe?',
        createdAt: minutes(5),
        status: 'complete',
        attachments: [
          {
            id: 'a_1',
            name: 'dashboard-wireframe.png',
            mimeType: 'image/png',
            url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&q=60',
          },
        ],
      },
      {
        id: 'm_3',
        role: 'assistant',
        content:
          'The wireframe follows a familiar dashboard shell with a persistent sidebar, top bar, and a scrollable content region for cards and charts.',
        createdAt: minutes(4),
        status: 'complete',
        sources: [
          { id: 's_1', title: 'Dashboard design patterns', url: 'https://example.com/patterns', snippet: 'A persistent sidebar keeps primary navigation one click away…' },
          { id: 's_2', title: 'Material layout guidance', url: 'https://example.com/layout', snippet: 'Top app bars host contextual actions for the current view…' },
          { id: 's_3', title: 'Scrollable content regions', url: 'https://example.com/scroll', snippet: 'Keep the shell fixed and scroll only the content pane…' },
        ],
      },
    ],
  },
  {
    id: 'c_2',
    title: 'Quick recipes for dinner',
    createdAt: minutes(180),
    updatedAt: minutes(45),
    messages: [
      { id: 'm_4', role: 'user', content: 'Give me 3 quick dinner ideas.', createdAt: minutes(46), status: 'complete' },
      { id: 'm_5', role: 'assistant', content: 'Sure! 1) Garlic butter pasta, 2) Sheet-pan fajitas, 3) Miso salmon with rice.', createdAt: minutes(45), status: 'complete' },
    ],
  },
  {
    id: 'c_3',
    title: 'Launch plan for Q3 rollout',
    createdAt: minutes(300),
    updatedAt: minutes(120),
    messages: [
      { id: 'm_6', role: 'user', content: 'Draft a Q3 launch checklist.', createdAt: minutes(121), status: 'complete' },
      { id: 'm_7', role: 'assistant', content: 'Here is a checklist covering positioning, assets, QA, and go-live comms…', createdAt: minutes(120), status: 'complete' },
    ],
  },
  {
    id: 'c_4',
    title: 'Rewrite homepage value prop',
    createdAt: minutes(600),
    updatedAt: minutes(300),
    messages: [
      { id: 'm_8', role: 'user', content: 'Make the hero copy punchier.', createdAt: minutes(301), status: 'complete' },
      { id: 'm_9', role: 'assistant', content: 'Try: "Ship delightful AI experiences in minutes, not months."', createdAt: minutes(300), status: 'complete' },
    ],
  },
  {
    id: 'c_5',
    title: 'Weekly team update summary',
    createdAt: minutes(1440),
    updatedAt: minutes(720),
    messages: [
      { id: 'm_10', role: 'user', content: 'Summarize this week for the team.', createdAt: minutes(721), status: 'complete' },
      { id: 'm_11', role: 'assistant', content: 'This week the team shipped the new composer, fixed 12 bugs, and started the design refresh.', createdAt: minutes(720), status: 'complete' },
    ],
  },
]

/** Canned assistant reply the mock streams back, token by token. */
export const mockReplyText =
  "Great question! Here's a thoughtful, streamed response from the built-in mock backend. " +
  'Replace this service with your real API by implementing the `ChatService` interface — ' +
  'the UI will behave identically. This paragraph exists purely to demonstrate token-by-token ' +
  'streaming, the typing indicator, auto-scroll, and markdown rendering such as **bold text**, ' +
  '`inline code`, and simple lists.'
