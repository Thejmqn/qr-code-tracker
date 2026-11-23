import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from mangum import Mangum
from supabase import create_client, Client

app = FastAPI()
handler = Mangum(app)

SUPABASE_URL = os.environ.get("QR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("QR_SUPABASE_PASSWORD")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.get("/")
def read_root():
    return {"status": "ok"}

@app.get("/items")
def get_items():
    response = supabase.table("Tracker").select("*").execute()
    return response.data


@app.post("/tracker/{name}", status_code=201)
def create_tracker(name: str):
    response = supabase.table("Tracker").insert({"name": name}).execute()
    if not response.data:
        raise HTTPException(status_code=400, detail="Insert failed")
    return response.data
