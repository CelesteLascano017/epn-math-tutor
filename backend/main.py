from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI() # Crea la apliación web

class QuestionRequest(BaseModel):
    question: str

@app.get("/") # Crea una ruta
def home():
    return {"mensaje": "Tutor Matemático funcionando"}

@app.post("/ask") # Crea una ruta para recibir preguntas
def ask_question(request: QuestionRequest):
    return {"respuesta": f"Recibí tu pregunta: {request.question}"}