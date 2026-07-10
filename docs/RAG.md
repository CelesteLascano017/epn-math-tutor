# TutorMath RAG

TutorMath usa RAG desde el backend de FastAPI. Ollama sigue sirviendo el modelo
generador (`qwen25-epn-tutor`) por `/api/chat`, y un modelo especializado de
embeddings por `/api/embed`.

## Requisito en Ollama

En el servidor Ollama instala un modelo de embeddings local:

```powershell
ollama pull nomic-embed-text
```

El backend usa por defecto:

- Generacion: `http://26.85.13.151:11434/api/chat`
- Modelo generador: `qwen25-epn-tutor`
- Embeddings: `http://26.85.13.151:11434/api/embed`
- Modelo de embeddings: `nomic-embed-text`

Puedes cambiar esos valores con:

```http
PUT /settings/urls
```

Y ajustar recuperacion con:

```http
PUT /settings/rag
```

## Flujo

1. El frontend sube archivos a `POST /rag/documents`.
2. El backend extrae texto de PDF, TXT, Markdown, CSV o TSV.
3. El texto se divide en chunks solapados.
4. Cada chunk se embebe localmente con Ollama `/api/embed`.
5. Los documentos y chunks se guardan en SQLite.
6. Al enviar un archivo en un chat, se crea una asociacion explicita entre el
   documento y esa conversacion.
7. En cada `POST /chat`, el backend busca solamente entre los documentos
   asociados a la conversacion activa. Nunca usa toda la biblioteca como
   fallback.
8. La recuperacion combina similitud semantica y coincidencia de terminos para
   identificar mejor referencias como `ejercicio dos` y `Ejercicio 2`.
9. Las preguntas de seguimiento pueden incorporar el ultimo turno del
   estudiante, pero solo cuando contienen una referencia como `este enunciado`.
10. El contexto recuperado se inyecta como fuente principal del prompt y la
    respuesta agrupa `sources` por documento, no por chunk.

Los documentos subidos antes de esta asociacion permanecen en la biblioteca.
Para utilizarlos en una conversacion existente hay que adjuntarlos una vez en
ese chat; desde entonces sus preguntas de seguimiento quedan vinculadas.

## Dependencias Python

Instala dependencias desde la raiz del proyecto:

```powershell
venv\Scripts\python.exe -m pip install -r requirements.txt
```
