import { useEffect, useRef, useState } from 'react'
import * as QRCode from 'qrcode'
import './App.css'

function App() {
  const [qrInput, setQrInput] = useState('')
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
    </main>
  )
}

export default App
