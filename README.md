# Location Tracker

Create a Tracker with map locations and download their QR codes.

## Run locally

```sh
npm install
npm run dev
```

Run `npm run build` to create a production build.

Set `QR_BACKEND_API` to the API root URL before starting Vite or building the
frontend (for example, `http://localhost:8000` in PowerShell:
`$env:QR_BACKEND_API = 'http://localhost:8000'`). The value is embedded in the
browser bundle, so it must not contain secrets. Restart Vite after changing it.

## Tracker API

Install `api/requirements.txt`, then set `QR_SUPABASE_URL` to your Supabase
project URL and `QR_SUPABASE_PASSWORD` to a server-side Supabase secret API key
(or legacy service-role key). A PostgreSQL database password will not work
with the Supabase client. Keep the key private.

Run the API locally with `uvicorn api.main:app --reload`, or deploy its Mangum
handler with the same environment variables.

CORS allows the local Vite origins `http://localhost:5173` and
`http://127.0.0.1:5173` by default. For deployment, set `QR_CORS_ORIGINS` to
the frontend origin (or a comma-separated list of origins), for example
`https://example.com`. This replaces the local defaults. Do not include paths
in origins. If using an API gateway, it must also pass OPTIONS preflight
requests through to FastAPI or handle CORS itself.

FastAPI's CORS middleware responds to browser OPTIONS preflights, including
those for JSON POST requests.

`POST /tracker/{name}` accepts a JSON body with a frontend-generated
`tracker_uuid` and a `locations` array. Each location includes a separate
frontend-generated `uuid` plus `name`, `lat`, and `lng`. The API saves the
Tracker link as `/view/{tracker_uuid}` and each Location link as
`/track/{tracker_uuid}/{uuid}`, using the new Tracker's database ID for each
Location's `tracker_id`. The map's numeric location IDs are not sent.
These are separate API operations: if the Location insert fails, the Tracker
may already exist.

On success, the POST response contains the saved `tracker` row and `locations`
rows. The frontend generates a QR code for each Location's
`https://qr.servicerequest.org/track/{tracker_uuid}/{location_uuid}` URL and
offers a ZIP containing the saved JSON and one PNG per Location. PNG filenames
use Location names; unsafe filename characters are replaced and duplicates
receive numeric suffixes.

`GET /links` returns all stored Tracker and Location link paths. The frontend
loads this list on startup and renders `/view/{tracker_uuid}` and
`/track/{tracker_uuid}/{location_uuid}` pages for matching paths; these pages
currently show only their UUIDs. Configure your frontend host to serve
`index.html` for these paths so direct visits reach the app.
