import { useRef, useState, type ChangeEvent } from 'react'

interface ImportScreenProps {
  busy: boolean
  successMessage: string | null
  errorMessage: string | null
  onPickFile: (file: File) => Promise<void>
  onBack: () => void
}

export function ImportScreen({
  busy,
  successMessage,
  errorMessage,
  onPickFile,
  onBack,
}: ImportScreenProps) {
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const pickedFile = event.target.files?.[0]
    if (!pickedFile) {
      return
    }
    setFileName(pickedFile.name)
    await onPickFile(pickedFile)
  }

  return (
    <section className="screen">
      <header className="subheader">
        <button type="button" className="inline-button" onClick={onBack}>
          ← Back
        </button>
        <h2>Import from File</h2>
      </header>

      <p className="hint-text">
        Choose a JSON file exported as a <code>mobile-day-package</code> or <code>mobile-snapshot</code>.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden-input"
        onChange={handleFileChange}
      />

      <button
        type="button"
        disabled={busy}
        className="touch-button touch-button-primary"
        onClick={() => fileInputRef.current?.click()}
      >
        {busy ? 'Importing…' : 'Choose package file'}
      </button>

      {fileName ? <p className="hint-text">Selected file: {fileName}</p> : null}
      {successMessage ? <p className="notice success">{successMessage}</p> : null}
      {errorMessage ? <p className="notice error">{errorMessage}</p> : null}
    </section>
  )
}
