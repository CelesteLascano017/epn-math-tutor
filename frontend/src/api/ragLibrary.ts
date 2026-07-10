import { env } from '@/config/env'

export interface RAGDocument {
  id: string
  filename: string
  mime_type: string
  created_at: number
  chunks: number
}

export async function listRagDocuments(signal?: AbortSignal): Promise<RAGDocument[]> {
  const res = await fetch(`${env.apiBaseUrl}/rag/documents`, { signal })
  if (!res.ok) throw new Error(`Library request failed (${res.status})`)
  return res.json() as Promise<RAGDocument[]>
}

export async function deleteRagDocument(id: string): Promise<void> {
  const res = await fetch(`${env.apiBaseUrl}/rag/documents/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Delete failed (${res.status})`)
}
