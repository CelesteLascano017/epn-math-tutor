# Backend Integration Guide

This UI is **100% backend-agnostic**. It does not assume any endpoints, request/response shapes, auth scheme, or AI provider. Everything the UI needs is expressed through a single TypeScript interface: **`ChatService`**.

You have two ways to connect a backend:

- **Path A — Edit the HTTP adapter** (fastest for a REST/SSE API). Adjust paths + payload mapping in two files.
- **Path B — Implement `ChatService` from scratch** (for gRPC, WebSockets, GraphQL, a provider SDK, or anything unusual).

Either way, **you never modify a React component.** The entire component tree depends only on `ChatService` and the domain types.

---

## 0. Mental model

```
Components ──► useChat() ──► ChatProvider ──► chatService: ChatService
                                                   ▲
                    createChatService() picks ──────┘
                    the implementation from VITE_CHAT_BACKEND
```

- `src/types/index.ts` — the **data shapes** (`Message`, `Conversation`, `Model`, `User`, `Source`, `Attachment`, `StreamChunk`).
- `src/api/ChatService.ts` — the **methods** your backend must provide.
- `src/api/index.ts` — the **factory** that selects the implementation.

Your job: make an object that satisfies `ChatService` and return the domain shapes. That's the whole contract.

---

## 1. The `ChatService` interface

```ts
interface ChatService {
  // Reads
  getCurrentUser(): Promise<User>
  getModels(): Promise<Model[]>
  listConversations(): Promise<ConversationSummary[]>
  getConversation(id: string): Promise<Conversation>

  // The core call — an async generator so streaming & non-streaming both fit
  sendMessage(request: SendMessageRequest): AsyncGenerator<StreamChunk, void, unknown>

  // Optional persistence (omit any you don't support)
  createConversation?(title?: string): Promise<Conversation>
  renameConversation?(id: string, title: string): Promise<void>
  deleteConversation?(id: string): Promise<void>
  uploadAttachment?(file: File, signal?: AbortSignal): Promise<{ id: string; url: string }>
}
```

### What each method is for

| Method | Called when | If you don't have it |
| --- | --- | --- |
| `getCurrentUser` | On load → sidebar profile | Return a static `User` (name/email can be placeholders). |
| `getModels` | On load → composer dropdown | Return a single-item array with your one model. |
| `listConversations` | On load → sidebar "Recent" | Return `[]`; history then lives only in the browser session. |
| `getConversation` | Clicking a conversation | Return the conversation with its `messages`. |
| `sendMessage` | User sends a message | **Required.** Yields the assistant reply. See below. |
| `createConversation?` | First message of a new chat | Omit → the UI generates a local id and keeps history client-side. |
| `renameConversation?` | Rename in the sidebar menu | Omit → rename updates UI only. |
| `deleteConversation?` | Delete in the sidebar menu | Omit → delete removes it from the UI only. |
| `uploadAttachment?` | Selecting files in the composer | Omit → files are attached using a local object URL (no upload). |

> **Minimum viable backend:** implement only `getCurrentUser`, `getModels`, and `sendMessage`. Return `[]` from `listConversations` and everything else works with client-side state.

---

## 2. `sendMessage` — the streaming contract

`sendMessage` is an **async generator**. It receives the full request and **yields `StreamChunk` objects** as the reply is produced:

```ts
interface SendMessageRequest {
  conversationId: string
  messages: Message[]   // full ordered history (send only the tail if you prefer)
  modelId: string
  signal?: AbortSignal  // pass this to fetch so "Stop" can cancel
}

interface StreamChunk {
  delta?: string        // text to append to the assistant message
  sources?: Source[]    // citations (usually on the final chunk)
  done?: boolean        // true on the last chunk
}
```

### Streaming backend

Yield one chunk per token/segment as it arrives:

```ts
async *sendMessage(req) {
  const res = await fetch(url, { method: 'POST', signal: req.signal, body: /* … */ })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    yield { delta: decoder.decode(value, { stream: true }) }
  }
  yield { done: true }
}
```

### Non-streaming backend

Just yield once with the whole answer:

```ts
async *sendMessage(req) {
  const data = await (await fetch(url, { /* … */ })).json()
  yield { delta: data.answer, sources: data.sources, done: true }
}
```

The UI renders both identically — for non-streaming it simply appears all at once.

### Cancellation

The composer's **Stop** button calls `AbortController.abort()`. Forward `request.signal` into your `fetch` (or reject your promise) and throw an `AbortError`. The provider already treats `AbortError` as "user stopped" and keeps whatever streamed so far.

---

## 3. Path A — Edit the HTTP adapter (recommended for REST APIs)

Files involved: [`src/api/httpChatService.ts`](../src/api/httpChatService.ts) and [`src/api/endpoints.ts`](../src/api/endpoints.ts).

**Step 1 — env.** Copy `.env.example` → `.env`:

```env
VITE_CHAT_BACKEND=http
VITE_API_BASE_URL=https://your-api.example.com
VITE_API_TOKEN=            # optional bearer token
VITE_ENABLE_STREAMING=true # false if your /chat returns one JSON blob
```

**Step 2 — paths.** Open `endpoints.ts` and rename each path to match your API. These are placeholders, not requirements:

```ts
export const endpoints = {
  currentUser: () => `/me`,
  models:      () => `/models`,
  chat:        () => `/chat`,
  // …rename freely
}
```

**Step 3 — payload mapping.** In `httpChatService.ts`, search for `MAP:` comments. Adjust:

- the **request body** the adapter sends to `/chat` (many APIs want `{ model, messages: [{ role, content }] }`), and
- how the adapter **reads your response** (the `parseSsePayload` function already handles `{"delta":"…"}`, `{"content":"…"}`, and OpenAI-style `choices[0].delta.content`; extend it for your shape).

**Step 4 — auth.** The adapter sends `Authorization: Bearer <VITE_API_TOKEN>` when a token is set. Replace `headers()` with your own scheme (cookies, custom headers, refresh flow) if needed.

**Step 5 — run.** `npm run dev`. Watch the network tab; tweak until the shapes line up.

### CORS during development

If your API is on a different origin, either enable CORS on the server or add a dev proxy in `vite.config.ts`:

```ts
server: {
  proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
}
```

Then set `VITE_API_BASE_URL=/api`.

---

## 4. Path B — Implement `ChatService` from scratch

Create `src/api/myChatService.ts`:

```ts
import type { ChatService } from '@/api/ChatService'
import type { /* … */ } from '@/types'

export class MyChatService implements ChatService {
  async getCurrentUser() { /* … */ }
  async getModels() { /* … */ }
  async listConversations() { return [] }
  async getConversation(id: string) { /* … */ }

  async *sendMessage(req) {
    // talk to WebSocket / gRPC / SDK; yield { delta } chunks
  }
}
```

Register it in `src/api/index.ts`:

```ts
import { MyChatService } from '@/api/myChatService'

export function createChatService(): ChatService {
  switch (env.backend) {
    case 'http': return new HttpChatService()
    case 'mock': return new MockChatService()
    // add your own value to VITE_CHAT_BACKEND and a case here:
    // case 'mine': return new MyChatService()
    default:     return new MockChatService()
  }
}
```

Add the new value to the `ChatBackend` type in `src/config/env.ts`.

---

## 5. Data shape reference

Map your API payloads to these (rename fields inside your adapter — don't change `src/types`):

```ts
interface User        { id: string; name: string; email: string; avatarUrl?: string }
interface Model       { id: string; name: string; description?: string; badge?: string; disabled?: boolean }
interface Source      { id: string; title: string; url?: string; snippet?: string; icon?: string }
interface Attachment  { id: string; name: string; mimeType: string; size?: number; url: string; uploading?: boolean }
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string           // plain text / light markdown
  createdAt: number         // epoch ms
  status?: 'complete' | 'streaming' | 'pending' | 'error'
  attachments?: Attachment[]
  sources?: Source[]
  metadata?: Record<string, unknown>   // round-trip anything (token counts, ids…)
}
interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number         // epoch ms — used for sorting the sidebar
  messages: Message[]
  modelId?: string
}
```

---

## 6. Common questions

**Q: My backend streams SSE with `data:` lines.** The adapter already parses SSE — including a `data: [DONE]` terminator. Adjust `parseSsePayload` for your JSON field names.

**Q: My backend returns markdown/HTML.** Markdown (a common subset) renders out of the box. For full GFM or HTML, replace `src/components/Markdown.tsx` with `react-markdown` — no other change needed.

**Q: I need auth redirect / login.** Add it around `AppProviders` in `src/main.tsx`, or gate rendering inside `ChatProvider`'s bootstrap. The UI doesn't prescribe an auth flow.

**Q: Where do errors surface?** Any thrown error from a `ChatService` method is caught by `ChatProvider`, stored in `state.error`, and shown as a banner under the top bar. `sendMessage` failures also mark the assistant message as `status: 'error'`.

**Q: How do I send extra params (temperature, system prompt, tools)?** Add them to the request body in `httpChatService.ts`. If they're user-controllable, thread them through `SendMessageRequest` and the composer.

---

## 7. Checklist

- [ ] `cp .env.example .env` and set `VITE_CHAT_BACKEND`.
- [ ] `sendMessage` yields `{ delta }` chunks and forwards `signal`.
- [ ] `getCurrentUser` + `getModels` return real data (or safe placeholders).
- [ ] `listConversations` / `getConversation` wired (or returning `[]`).
- [ ] Auth headers set in the adapter.
- [ ] CORS handled (server config or Vite proxy).
- [ ] Errors from the backend produce a helpful message.
- [ ] `npm run build` passes.
```
