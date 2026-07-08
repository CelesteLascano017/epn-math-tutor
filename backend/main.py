from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.conversations import router as conversations_router
from backend.api.me import router as me_router
from backend.api.models_route import router as models_router
from backend.api.routes import router as chat_router
from backend.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the SQLite database on startup."""
    init_db()
    yield


app = FastAPI(
    title="TutorMath API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite default port
        "http://localhost:5174",   # Vite alternate port
        "http://localhost:5175",
        "http://localhost:5500",   # Legacy frontend
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(chat_router)          # GET /, POST /ask, POST /chat
app.include_router(conversations_router) # GET/POST /conversations, GET/PATCH/DELETE /conversations/{id}
app.include_router(me_router)            # GET /me
app.include_router(models_router)        # GET /models
