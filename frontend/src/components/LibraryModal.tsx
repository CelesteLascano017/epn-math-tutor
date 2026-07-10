import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@heroui/react'
import { useEffect, useState } from 'react'

import { deleteRagDocument, listRagDocuments, type RAGDocument } from '@/api/ragLibrary'
import { FileIcon, TrashIcon } from '@/components/icons'
import { formatRelativeTime } from '@/lib/format'

export function LibraryModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}) {
  const [documents, setDocuments] = useState<RAGDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()
    void loadDocuments(controller.signal)
    return () => controller.abort()
  }, [isOpen])

  const loadDocuments = async (signal?: AbortSignal) => {
    setIsLoading(true)
    setError(null)
    try {
      setDocuments(await listRagDocuments(signal))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('No se pudo cargar la biblioteca.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setError(null)
    try {
      await deleteRagDocument(id)
      setDocuments((current) => current.filter((doc) => doc.id !== id))
    } catch {
      setError('No se pudo eliminar el documento.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} backdrop="blur" size="2xl">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              Biblioteca
              <span className="text-xs font-normal text-default-400">
                Documentos guardados
              </span>
            </ModalHeader>
            <ModalBody>
              {error && <p className="text-sm text-danger">{error}</p>}

              {isLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Spinner color="primary" />
                </div>
              ) : documents.length === 0 ? (
                <div className="rounded-xl bg-content2 px-4 py-8 text-center ring-1 ring-white/5">
                  <p className="text-sm font-medium text-foreground">No hay documentos guardados.</p>
                  <p className="mt-1 text-xs text-default-400">
                    Los PDFs y apuntes que subas desde el chat aparecerán aquí.
                  </p>
                </div>
              ) : (
                <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
                  {documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-3 rounded-xl bg-content2 p-3 ring-1 ring-white/5"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-content3 text-default-500">
                        <FileIcon width={18} height={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{doc.filename}</p>
                        <p className="text-xs text-default-400">
                          {doc.chunks} chunks · {doc.mime_type || 'documento'} · {formatRelativeTime(doc.created_at * 1000)}
                        </p>
                      </div>
                      <Button
                        isIconOnly
                        size="sm"
                        radius="full"
                        variant="light"
                        color="danger"
                        aria-label={`Eliminar ${doc.filename}`}
                        isLoading={deletingId === doc.id}
                        onPress={() => handleDelete(doc.id)}
                      >
                        <TrashIcon width={16} height={16} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={() => void loadDocuments()}>
                Actualizar
              </Button>
              <Button color="primary" onPress={onClose}>
                Cerrar
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
