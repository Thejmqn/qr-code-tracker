import os
from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel
from supabase import Client, create_client

app = FastAPI()
cors_origins = os.environ.get(
    "QR_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip().rstrip("/")
        for origin in cors_origins.split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)
handler = Mangum(app)

SUPABASE_URL = os.environ.get("QR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("QR_SUPABASE_PASSWORD")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


class Location(BaseModel):
    name: str
    lat: float
    lng: float
    uuid: UUID


class TrackerPayload(BaseModel):
    tracker_uuid: UUID
    locations: list[Location]


@app.get("/")
def read_root():
    return {"status": "ok"}

@app.get("/items")
def get_items():
    response = supabase.table("Tracker").select("*").execute()
    return response.data


def get_all_links(table_name: str) -> list[str]:
    links = []
    page_size = 1000
    offset = 0
    while True:
        response = (
            supabase.table(table_name)
            .select("link")
            .order("id")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = response.data or []
        links.extend(row["link"] for row in rows if row["link"])
        if len(rows) < page_size:
            return links
        offset += page_size


@app.get("/links")
def list_links():
    return {
        "trackers": get_all_links("Tracker"),
        "locations": get_all_links("Location"),
    }


@app.post("/tracker/{name}", status_code=201)
def create_tracker(name: str, payload: TrackerPayload):
    response = supabase.table("Tracker").insert({
        "name": name,
        "link": f"/view/{payload.tracker_uuid}",
    }).execute()
    if not response.data:
        raise HTTPException(status_code=400, detail="Insert failed")

    saved_locations = []
    if payload.locations:
        tracker_id = response.data[0]["id"]
        location_rows = [
            {
                "tracker_id": tracker_id,
                "name": location.name,
                "latitude": location.lat,
                "longitude": location.lng,
                "link": f"/track/{payload.tracker_uuid}/{location.uuid}",
            }
            for location in payload.locations
        ]
        location_response = supabase.table("Location").insert(location_rows).execute()
        saved_locations = location_response.data or []
        if len(saved_locations) != len(location_rows):
            raise HTTPException(status_code=502, detail="Location insert did not return all rows")

    return {"tracker": response.data[0], "locations": saved_locations}
