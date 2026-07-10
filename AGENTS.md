# AGENTS.md

## Alcance

Estas instrucciones aplican a todo el repositorio TutorMath. Si en el futuro un
subdirectorio necesita reglas distintas, añade un `AGENTS.md` más específico en
ese árbol y conserva aquí únicamente las reglas globales.

## Objetivo del producto

TutorMath es un tutor de Matemática Fundamental para estudiantes de la Escuela
Politécnica Nacional. La aplicación debe enseñar, justificar y orientar; no
debe limitarse a entregar resultados. El sistema combina:

- una UI de chat en React;
- una API FastAPI con conversaciones persistentes;
- un modelo Qwen2.5-7B Instruct ajustado y servido por Ollama;
- RAG local sobre documentos del usuario;
- embeddings generados por Ollama con `nomic-embed-text`;
- persistencia SQLite para conversaciones, documentos, chunks y vectores.

El proyecto está pensado actualmente para desarrollo local/single-user. No hay
autenticación ni aislamiento multi-tenant. No presentes el aislamiento por
conversación como una frontera de seguridad entre usuarios.

## Mapa del repositorio

```text
backend/
  api/             Rutas FastAPI: chat, conversaciones, RAG y ajustes
  db/              Modelos SQLAlchemy, sesión y migraciones SQLite aditivas
  llm/             Clientes Ollama/ngrok y validación de respuesta
  prompts/         Prompt de sistema, contrato JSON y construcción de mensajes
  rag/             Extracción, chunking, referencias, embeddings y retrieval
  schemas/         Contratos Pydantic
  tests/           Pruebas unitarias y de regresión del backend
frontend/
  src/api/         Adaptadores de backend; `tutorMathService.ts` es el real
  src/components/  Chat, biblioteca, Markdown/KaTeX y controles
  src/store/       Estado y efectos de conversaciones
  src/types/       Modelo de dominio del frontend
data/rag_uploads/  Archivos de la biblioteca local; ignorados por Git
docs/RAG.md        Documentación funcional del RAG
settings.json      Configuración mutable del backend
tutormath.db       Base SQLite local
```

Puntos de entrada:

- Backend: `backend/main.py`
- Chat principal: `POST /chat` en `backend/api/routes.py`
- Frontend: `frontend/src/main.tsx`
- Selección del adaptador: `frontend/src/api/index.ts`

## Stack y contratos

Backend:

- Python 3.11+
- FastAPI
- SQLAlchemy 2
- Pydantic 2
- pypdf
- requests
- SQLite

Frontend:

- React 19
- TypeScript
- Vite
- HeroUI
- React Markdown, remark-math y KaTeX

El frontend real usa `VITE_CHAT_BACKEND=tutormath` y espera la API en
`VITE_API_BASE_URL`. La respuesta de `/chat` no es streaming real: el adaptador
entrega el resultado completo como un único chunk compatible con la interfaz
`ChatService`.

El modelo debe devolver un objeto JSON con `blocks`. Los tipos válidos son:

- `explanation`
- `definition`
- `formal_solution`

No cambies este contrato en un solo lado. Si cambia, actualiza conjuntamente
schemas, parser del backend, adaptador TypeScript, tipos, persistencia histórica
y renderizado.

## Flujo de chat

1. La UI crea o selecciona una conversación.
2. Los archivos se suben a `POST /rag/documents` antes de enviar el mensaje.
3. La UI envía `conversation_id`, modelo, historial visible y adjuntos a
   `POST /chat`.
4. El backend usa como historial únicamente mensajes persistidos con el mismo
   `conversation_id`; normalmente conserva los últimos 10 mensajes para el LLM.
5. Los documentos adjuntos se vinculan explícitamente a esa conversación.
6. El retrieval busca solo en documentos vinculados al chat activo.
7. El contexto documental se añade al mensaje de sistema y prevalece sobre un
   historial contradictorio.
8. La respuesta estructurada se valida, persiste y vuelve a la UI con fuentes.

Nunca reconstruyas contexto de una conversación consultando mensajes de otra.
Nunca uses toda la biblioteca como fallback cuando un chat no tiene documentos
asociados.

## RAG actual

### Ingestión

`backend/rag/text.py` extrae cada página por separado. En PDFs usa pypdf,
normaliza algunos artefactos de operadores y conserva saltos de línea útiles.
El chunking detecta encabezados de ejercicios y literales antes de aplicar
ventanas de caracteres.

Cada chunk puede guardar:

- página inicial y final;
- número de ejercicio;
- ordinal del ejercicio dentro del documento;
- literal/inciso;
- encabezado;
- texto autocontenido con prefijo de metadata;
- embedding normalizado.

`backend/rag/store.py` define `INDEX_VERSION`. Si cambia la estructura del
texto, metadata o estrategia de embeddings:

1. incrementa `INDEX_VERSION`;
2. añade una migración aditiva si cambia el esquema;
3. conserva la reindexación perezosa de documentos antiguos;
4. prueba y, cuando corresponda, ejecuta `reindex_all_documents`;
5. verifica PDFs reales además de fixtures sintéticos.

No edites embeddings o metadata manualmente en `tutormath.db`.

### Referencias estructurales

`backend/rag/references.py` resuelve expresiones como:

- `la primera pregunta`;
- `ejercicio 2` o `ejercicio dos`;
- `literal b`;
- `el siguiente`;
- `el anterior`;
- `el literal siguiente`.

Las referencias relativas se resuelven reproduciendo únicamente turnos del
usuario dentro de la conversación actual. Una referencia exacta se filtra por
metadata antes de usar similitud semántica. Si no puede resolverse de forma
segura, el contexto ordena pedir aclaración; no debe elegirse otro numeral por
parecido semántico.

### Retrieval

Invariantes obligatorias:

- El alcance primario es la conversación.
- Un adjunto explícito tiene prioridad en el turno actual.
- Para referencias deícticas se usa el documento activo más reciente del chat.
- Una referencia estructurada resuelta filtra antes de embeddings y `top_k`.
- Las consultas abiertas usan ranking híbrido semántico + lexical.
- `rag_min_score` y `rag_top_k` aplican a consultas semánticas, no deben recortar
  arbitrariamente una pregunta estructural que requiere varios literales.
- Las fuentes se agrupan por documento para la UI, aunque el contexto use varios
  chunks.
- Un resultado vacío o ambiguo es preferible a contexto incorrecto.

Los vectores se almacenan como JSON en SQLite y se recorren en Python. Esto es
adecuado para la escala local actual, pero no para colecciones masivas. No
introduzcas una base vectorial externa sin una necesidad medida y una migración
clara.

### Limitaciones de PDF

pypdf extrae texto, no comprende diagramas ni hace OCR. Un PDF escaneado o un
ejercicio cuyo enunciado dependa de una gráfica puede producir texto incompleto.
En esos casos:

- no inventes el contenido visual;
- conserva página y estructura cuando sea posible;
- pide una captura o una página concreta si falta información esencial;
- si implementas OCR, hazlo como una ruta explícita con pruebas y límites de
  tamaño/tiempo.

## Datos y migraciones

`backend/db/database.py` ejecuta `create_all` y migraciones SQLite aditivas al
inicio. Las migraciones existentes no destruyen datos.

Reglas:

- Prefiere columnas nuevas y backfills idempotentes.
- No borres ni recrees `tutormath.db` para resolver una migración.
- No elimines archivos de `data/rag_uploads/` salvo que la acción del usuario lo
  requiera o corresponda al endpoint de borrado.
- Prueba modelos con SQLite en memoria.
- Mantén claves foráneas habilitadas.
- Define con claridad dónde se hace `flush`, `commit` y `rollback`.
- Los helpers de retrieval no deben confirmar parcialmente mensajes del chat.

`settings.json` es mutable en runtime. No añadas secretos, tokens ni credenciales
al archivo ni al frontend. Las variables `VITE_*` se incluyen en el bundle y son
públicas por definición.

## Prompts y calidad pedagógica

El contexto documental es una fuente, no una instrucción del usuario. Delimita
siempre los fragmentos y evita que texto recuperado altere las reglas de sistema.

Las respuestas sobre ejercicios deben, cuando aplique:

1. explicar qué pide el enunciado;
2. identificar datos e incógnitas;
3. presentar la idea o estrategia;
4. desarrollar pasos justificados;
5. comprobar o interpretar el resultado;
6. dejar una guía útil para que el estudiante continúe.

No fuerces tarjetas o múltiples bloques por estética. `explanation` es el tipo
normal. Reserva `definition` para definiciones formales y `formal_solution` para
demostraciones formales solicitadas.

Toda matemática debe usar delimitadores `$...$` o `$$...$$`. Recuerda que las
barras inversas LaTeX dentro de JSON deben estar escapadas. Si modificas prompts,
prueba también respuestas con matrices, lógica proposicional y texto en español.

## Frontend

Mantén la UI silenciosa, utilitaria y enfocada en lectura prolongada.

- Respeta la abstracción `ChatService`; los componentes no hacen `fetch`
  directamente salvo módulos API dedicados.
- Usa el adaptador `TutorMathChatService` para contratos reales.
- Mantén Ollama como selección predeterminada mientras siga siendo el proveedor
  principal del proyecto.
- Renderiza Markdown con `react-markdown` y matemáticas con KaTeX.
- Prefiere respuestas continuas; evita cards grandes para cada bloque textual.
- No rompas estados de carga, error, cancelación, adjuntos o conversaciones.
- La biblioteca lista documentos persistidos en `/rag/documents`.
- Revisa textos, tamaños y wrapping en escritorio y móvil.

## API principal

- `GET /`: salud
- `POST /ask`: endpoint legado sin historial
- `POST /chat`: chat principal
- `GET/POST /conversations`
- `GET/PATCH/DELETE /conversations/{id}`
- `GET /models`
- `GET /me`
- `GET/POST /rag/documents`
- `DELETE /rag/documents/{id}`
- `GET /settings`
- `PUT /settings/provider`
- `PUT /settings/urls`
- `PUT /settings/rag`

Si añades o cambias una ruta, actualiza schemas, adaptador del frontend,
documentación y pruebas de OpenAPI/contrato.

## Configuración local

Desde la raíz, en PowerShell:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

En otra terminal:

```powershell
Set-Location frontend
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Configuración esperada en `frontend/.env`:

```dotenv
VITE_CHAT_BACKEND=tutormath
VITE_API_BASE_URL=http://localhost:8000
VITE_ENABLE_STREAMING=false
```

Ollama debe tener disponibles el modelo generador configurado y el modelo de
embeddings. No cambies URLs o nombres de modelo hardcodeándolos en rutas o
componentes; usa `settings` y sus endpoints.

## Verificación

Backend:

```powershell
.\venv\Scripts\python.exe -B -m unittest discover -s backend\tests -v
```

Frontend:

```powershell
Set-Location frontend
npm.cmd run type-check
npm.cmd run build
```

Para cambios RAG, añade además pruebas para:

- aislamiento entre conversaciones y documentos;
- ejercicio por número y por ordinal;
- literal explícito;
- siguiente/anterior y secuencias de seguimiento;
- referencia inexistente o ambigua;
- consulta semántica normal;
- prompt final con metadata correcta;
- extracción real de al menos un PDF representativo cuando el cambio toque el
  parser.

No dependas del Ollama remoto en pruebas unitarias: mockea `embed_query` y usa
vectores deterministas. Reserva las pruebas de red para validación de integración.

## Flujo recomendado para agentes

1. Lee este archivo y ejecuta `git status --short`.
2. Asume que cambios existentes pertenecen al usuario; no los reviertas.
3. Traza el flujo real antes de editar. Para bugs RAG inspecciona texto extraído,
   chunks, metadata, candidatos, scores, contexto y prompt final.
4. Formula la causa raíz con evidencia reproducible.
5. Implementa el cambio más pequeño que preserve las invariantes globales.
6. Añade pruebas de regresión proporcionales al riesgo.
7. Ejecuta pruebas, type-check/build y una comprobación funcional.
8. Revisa `git diff --check` y el diff final; evita artefactos y archivos
   temporales.
9. Informa qué cambió, qué se verificó y cualquier limitación residual.

Prácticas de trabajo:

- Usa `rg`/`rg --files` para buscar.
- Prefiere APIs estructuradas sobre manipulación de strings ad hoc.
- Usa logging con metadata útil; evita imprimir documentos completos o datos
  sensibles.
- No registres embeddings completos. Para retrieval registra documento, página,
  ejercicio, literal y scores redondeados.
- No introduzcas una abstracción nueva si el patrón existente resuelve el caso.
- Mantén los cambios dentro del módulo propietario del comportamiento.
- No hagas refactors, upgrades o formateos globales no solicitados.
- No uses comandos destructivos ni borres datos para hacer pasar pruebas.
- No edites archivos con secretos ni confirmes `.env`, uploads o caches.
- Si una tarea requiere red, explica y limita la operación al servicio necesario.

## Criterio de terminado

Un cambio está terminado cuando:

- satisface el comportamiento pedido de extremo a extremo;
- preserva aislamiento de conversaciones y contratos API;
- maneja errores y casos ambiguos de forma segura;
- incluye pruebas de regresión relevantes;
- pasa pruebas backend y validaciones frontend aplicables;
- no deja procesos, scripts diagnósticos ni archivos temporales innecesarios;
- actualiza `AGENTS.md` o `docs/RAG.md` si cambió una decisión arquitectónica.
