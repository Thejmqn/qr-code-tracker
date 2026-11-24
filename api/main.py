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


class FingerprintPayload(BaseModel):
    location: str
    fingerprint: str


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


@app.get("/visits/{tracker_uuid}")
def get_tracker_visits(tracker_uuid: UUID):
    tracker_response = (
        supabase.table("Tracker")
        .select("id,name")
        .eq("link", f"/view/{tracker_uuid}")
        .limit(1)
        .execute()
    )
    if not tracker_response.data:
        raise HTTPException(status_code=404, detail="Tracker not found")

    tracker = tracker_response.data[0]
    locations = []
    offset = 0
    while True:
        response = (
            supabase.table("Location")
            .select("id,name,link")
            .eq("tracker_id", tracker["id"])
            .order("id")
            .range(offset, offset + 999)
            .execute()
        )
        rows = response.data or []
        locations.extend(rows)
        if len(rows) < 1000:
            break
        offset += 1000

    visits_by_link = {location["link"]: [] for location in locations if location["link"]}
    links = list(visits_by_link)
    for index in range(0, len(links), 100):
        batch = links[index:index + 100]
        offset = 0
        while True:
            response = (
                supabase.table("Fingerprint")
                .select("id,location,fingerprint,created_at")
                .in_("location", batch)
                .order("id")
                .range(offset, offset + 999)
                .execute()
            )
            rows = response.data or []
            for row in rows:
                visits_by_link[row["location"]].append({
                    "id": row["id"],
                    "fingerprint": row["fingerprint"],
                    "created_at": row["created_at"],
                })
            if len(rows) < 1000:
                break
            offset += 1000

    return {
        "tracker_name": tracker["name"],
        "locations": [
            {
                "id": location["id"],
                "name": location["name"],
                "visits": visits_by_link.get(location["link"], []),
            }
            for location in locations
        ],
    }


@app.post("/fingerprint", status_code=201)
def create_fingerprint(payload: FingerprintPayload):
    location_response = (
        supabase.table("Location")
        .select("name")
        .eq("link", payload.location)
        .limit(1)
        .execute()
    )
    if not location_response.data:
        raise HTTPException(status_code=404, detail="Location not found")

    fingerprint_response = supabase.table("Fingerprint").insert({
        "location": payload.location,
        "fingerprint": payload.fingerprint,
    }).execute()
    if not fingerprint_response.data:
        raise HTTPException(status_code=502, detail="Fingerprint insert failed")

    return {"location_name": location_response.data[0]["name"] or "Unnamed location"}


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
