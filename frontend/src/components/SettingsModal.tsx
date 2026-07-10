import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Radio,
  RadioGroup,
  Spinner,
} from '@heroui/react'
import { useEffect, useState } from 'react'

import { env } from '@/config/env'

export function SettingsModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}) {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [provider, setProvider] = useState<string>('ngrok')
  const [ngrokUrl, setNgrokUrl] = useState('')
  const [ollamaUrl, setOllamaUrl] = useState('')
  const [ollamaModel, setOllamaModel] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${env.apiBaseUrl}/settings`)
      if (!res.ok) throw new Error('Error al cargar la configuración')
      const data = await res.json()
      setProvider(data.active_provider)
      setNgrokUrl(data.ngrok_url)
      setOllamaUrl(data.ollama_url)
      setOllamaModel(data.ollama_model)
    } catch (err) {
      setError('No se pudo conectar con el backend.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (onClose: () => void) => {
    setIsSaving(true)
    setError(null)
    try {
      // 1. Save provider
      const resProv = await fetch(`${env.apiBaseUrl}/settings/provider`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      if (!resProv.ok) throw new Error('Error guardando proveedor')

      // 2. Save URLs and Model
      const resUrls = await fetch(`${env.apiBaseUrl}/settings/urls`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngrok_url: ngrokUrl,
          ollama_url: ollamaUrl,
          ollama_model: ollamaModel,
        }),
      })
      if (!resUrls.ok) throw new Error('Error guardando URLs')

      onClose()
    } catch (err) {
      setError('Ocurrió un error al guardar.')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} backdrop="blur">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">Ajustes del Motor LLM</ModalHeader>
            <ModalBody>
              {isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <Spinner size="lg" color="primary" />
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {error && <p className="text-sm text-danger">{error}</p>}
                  
                  <RadioGroup
                    label="Proveedor Activo"
                    value={provider}
                    onValueChange={setProvider}
                    description="Selecciona de dónde provienen las respuestas del tutor."
                  >
                    <Radio value="ngrok">Túnel Ngrok (Google Colab)</Radio>
                    <Radio value="ollama">Servidor Ollama (PC Local/Remota)</Radio>
                  </RadioGroup>

                  {provider === 'ngrok' ? (
                    <div className="flex flex-col gap-2">
                      <Input
                        label="Ngrok URL"
                        placeholder="https://túnel.ngrok-free.dev/api/generate"
                        value={ngrokUrl}
                        onValueChange={setNgrokUrl}
                        description="Debe incluir el endpoint (ej. /api/generate)"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <Input
                        label="Ollama URL"
                        placeholder="http://192.168.1.10:11434/api/chat"
                        value={ollamaUrl}
                        onValueChange={setOllamaUrl}
                        description="Endpoint /api/chat del servidor remoto"
                      />
                      <Input
                        label="Nombre del modelo (Ollama)"
                        placeholder="qwen25-epn-tutor"
                        value={ollamaModel}
                        onValueChange={setOllamaModel}
                        description="Nombre exacto del modelo local de Ollama"
                      />
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose} isDisabled={isSaving}>
                Cancelar
              </Button>
              <Button color="primary" onPress={() => handleSave(onClose)} isLoading={isSaving} isDisabled={isLoading}>
                Guardar
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
