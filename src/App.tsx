import { useEffect, useRef, useState } from 'react'
import * as L from 'leaflet'
import * as QRCode from 'qrcode'
import { validate as isUuid, v4 as uuidv4 } from 'uuid'
import './App.css'
import 'leaflet/dist/leaflet.css'

type Location = {
  id: number
  name: string
  lat: number
  lng: number
}

type LinkIndex = {
  trackers: string[]
  locations: string[]
}

type CreatedTracker = {
  tracker: { id: number; name: string | null; link: string; created_at: string }
  locations: Array<{
    id: number
    tracker_id: number
    name: string | null
    latitude: number | null
    longitude: number | null
    link: string | null
    created_at: string
  }>
}

const qrAPI: string = (import.meta.env.QR_BACKEND_API ?? '').trim().replace(/\/+$/, '')

function HomePage() {
  const [qrInput, setQrInput] = useState('')
  const [error, setError] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [apiInput, setApiInput] = useState('')
  const [apiStatus, setApiStatus] = useState('')
  const [apiPending, setApiPending] = useState(false)
  const [createdTracker, setCreatedTracker] = useState<CreatedTracker | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nextLocationId = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let active = true

    if (!qrInput) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    QRCode.toCanvas(canvas, qrInput, { width: 256, margin: 2 })
      .then(() => {
        if (active) setError('')
      })
      .catch(() => {
        if (active) setError('Could not generate a QR code for this text.')
      })

    return () => {
      active = false
    }
  }, [qrInput])

  useEffect(() => {
    const map = L.map('map').setView([38.0337, -78.5091], 15)
    let activePopupActions: {
      save: () => void
      close: () => void
      remove: () => void
    } | null = null

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activePopupActions) return

      const action = event.key === 'Enter' ? activePopupActions.save
        : event.key === 'Escape' ? activePopupActions.close
          : event.key === 'Delete' ? activePopupActions.remove
            : null

      if (action) {
        event.preventDefault()
        event.stopPropagation()
        action()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    map.on('click', (event) => {
      const locationId = nextLocationId.current++
      const location: Location = {
        id: locationId,
        name: '',
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      }

      const popup = document.createElement('div')
      popup.className = 'location-popup'

      const label = document.createElement('label')
      const input = document.createElement('input')
      input.id = `location-name-${locationId}`
      input.type = 'text'
      label.htmlFor = input.id
      label.textContent = 'Enter name for this location: '
      const buttons = document.createElement('div')
      buttons.className = 'location-popup-actions'
      const saveButton = document.createElement('button')
      saveButton.type = 'button'
      saveButton.className = 'save-location'
      saveButton.textContent = 'Save'
      const deleteButton = document.createElement('button')
      deleteButton.type = 'button'
      deleteButton.className = 'delete-location'
      deleteButton.textContent = 'Delete'
      buttons.append(saveButton, deleteButton)
      popup.append(label, input, buttons)

      let saved = false
      let savedName = ''
      const marker = L.marker(event.latlng).addTo(map).bindPopup(popup)

      const saveLocation = () => {
        const wasSaved = saved
        const updatedLocation = { ...location, name: input.value }
        setLocations((currentLocations) => wasSaved
          ? currentLocations.map((currentLocation) =>
            currentLocation.id === locationId ? updatedLocation : currentLocation,
          )
          : [...currentLocations, updatedLocation],
        )
        saved = true
        savedName = input.value
        marker.closePopup()
      }

      const deleteLocation = () => {
        marker.closePopup()
        marker.remove()
        setLocations((currentLocations) => currentLocations.filter((currentLocation) =>
          currentLocation.id !== locationId,
        ))
      }

      const actions = {
        save: saveLocation,
        close: () => marker.closePopup(),
        remove: deleteLocation,
      }

      saveButton.addEventListener('click', saveLocation)
      deleteButton.addEventListener('click', deleteLocation)
      marker.on('popupopen', () => {
        input.value = savedName
        activePopupActions = actions
        input.focus()
      })
      marker.on('popupclose', () => {
        if (activePopupActions === actions) activePopupActions = null
        if (!saved) marker.remove()
        else input.value = savedName
      })

      marker.openPopup()
    })

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      map.remove()
    }
  }, [])

  const submitTracker = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreatedTracker(null)
    const name = apiInput.trim()
    if (!name) {
      setApiStatus('Enter a name to test the API.')
      return
    }
    if (!qrAPI) {
      setApiStatus('QR_BACKEND_API is not configured.')
      return
    }

    setApiPending(true)
    setApiStatus('')
    try {
      const trackerUuid = uuidv4()
      const response = await fetch(`${qrAPI}/tracker/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracker_uuid: trackerUuid,
          locations: locations.map(({ name, lat, lng }) => ({
            name,
            lat,
            lng,
            uuid: uuidv4(),
          })),
        }),
      })
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
      const result = await response.json() as CreatedTracker
      if (typeof result.tracker?.id !== 'number' || !Array.isArray(result.locations)) {
        throw new Error('The API returned an invalid Tracker response.')
      }
      setCreatedTracker(result)
      setApiStatus('Tracker created successfully.')
    } catch (error) {
      setApiStatus(error instanceof Error ? error.message : 'Could not reach the API.')
    } finally {
      setApiPending(false)
    }
  }

  const downloadTracker = () => {
    if (!createdTracker) return
    const data = new Blob([JSON.stringify(createdTracker, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = `tracker-${createdTracker.tracker.id}.json`
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <main className="app">
      <h1>QR Code Generator</h1>
      <p>Enter text or a URL to create a QR code.</p>

      <label htmlFor="qr-input">Text or URL</label>
      <input
        id="qr-input"
        type="text"
        value={qrInput}
        onChange={(event) => {
          setQrInput(event.target.value)
          setError('')
        }}
        placeholder="https://example.com"
      />

      <div className="qr-preview">
        <canvas ref={canvasRef} width="256" height="256" aria-label="Generated QR code" role="img" />
        {!qrInput && <span>QR code preview</span>}
      </div>
      {error && <p role="alert" className="error">{error}</p>}

      <section className="map-section" aria-labelledby="map-heading">
        <h2 id="map-heading">Pin locations</h2>
        <p>Click anywhere on the map to place a pin.</p>
        <div id="map" className="map" aria-label="OpenStreetMap map" />

        <h3>Locations</h3>
        <pre className="locations" aria-live="polite">
          {JSON.stringify(locations.map(({ name, lat, lng }) => ({ name, lat, lng })), null, 2)}
        </pre>

        <form className="api-test" onSubmit={submitTracker}>
          <label htmlFor="api-test-input">Test API</label>
          <input
            id="api-test-input"
            type="text"
            value={apiInput}
            onChange={(event) => setApiInput(event.target.value)}
          />
          <button type="submit" disabled={apiPending}>
            {apiPending ? 'Submitting…' : 'Submit'}
          </button>
          {apiStatus && <p role="status" aria-live="polite">{apiStatus}</p>}
          {createdTracker && (
            <div className="api-result">
              <p>Tracker Link: {createdTracker.tracker.link}</p>
              <button type="button" onClick={downloadTracker}>Download JSON</button>
            </div>
          )}
        </form>
      </section>
    </main>
  )
}

function App() {
  const [links, setLinks] = useState<LinkIndex | null>(null)
  const [linksError, setLinksError] = useState(qrAPI ? '' : 'QR_BACKEND_API is not configured.')

  useEffect(() => {
    if (!qrAPI) return

    const controller = new AbortController()
    fetch(`${qrAPI}/links`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load links (${response.status})`)
        return response.json() as Promise<LinkIndex>
      })
      .then(setLinks)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLinksError(error instanceof Error ? error.message : 'Could not load links.')
        }
      })

    return () => controller.abort()
  }, [])

  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return <HomePage />

  if (linksError) return <main className="app"><p role="alert">{linksError}</p></main>
  if (!links) return <main className="app"><p>Loading page…</p></main>

  const trackerMatch = /^\/view\/([0-9a-f-]{36})$/i.exec(path)
  if (trackerMatch && isUuid(trackerMatch[1]) && links.trackers.includes(path)) {
    return <main className="app"><h1>Tracker</h1><p>UUID: {trackerMatch[1]}</p></main>
  }

  const locationMatch = /^\/track\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i.exec(path)
  if (locationMatch && isUuid(locationMatch[1]) && isUuid(locationMatch[2])
    && links.locations.includes(path)) {
    return (
      <main className="app">
        <h1>Location</h1>
        <p>Tracker UUID: {locationMatch[1]}</p>
        <p>Location UUID: {locationMatch[2]}</p>
      </main>
    )
  }

  return <main className="app"><h1>Page not found</h1></main>
}

export default App
