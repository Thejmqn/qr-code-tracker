# QR Code Generator

Enter text or a URL to generate a QR code in your browser.

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

Install `api/requirements.txt`, then put a server-side Supabase secret API key
(or legacy service-role key) in `api/password.txt`. A PostgreSQL database
password will not work with the Supabase client. Keep this file private; it is
ignored by Git. The API uses `https://mezwlasdlrdholtlegdw.supabase.co` by
default; set `SUPABASE_URL` to override it.

Run the API locally with `uvicorn api.main:app --reload`, or deploy its Mangum
handler with `password.txt` alongside `main.py`.
