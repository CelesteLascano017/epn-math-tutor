from fastapi import FastAPI

app = FastAPI() # Crea la apliación web

@app.get("/") # Crea una ruta
def home():
    return {"mensaje": "Tutor Matemático funcionando"}

