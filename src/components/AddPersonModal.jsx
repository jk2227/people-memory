import { useState, useEffect, useRef } from 'react'
import { createPerson } from '../lib/api'

export default function AddPersonModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 100)
  }, [])

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      const person = await createPerson(trimmed, relationship.trim())
      onCreated(person)
    } catch (err) {
      console.error(err)
      setSaving(false)
    }
  }

  return (
    <div className="add-modal active">
      <div className="add-modal-bg" onClick={onClose} />
      <div className="add-modal-content">
        <h2>Add Someone New</h2>
        <div className="form-group">
          <label>Name</label>
          <input
            ref={nameRef}
            type="text"
            placeholder="e.g. Ji Hun"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoComplete="off"
          />
        </div>
        <div className="form-group">
          <label>Who are they? (optional)</label>
          <input
            type="text"
            placeholder="e.g. Friend, Haircutter, Coworker"
            value={relationship}
            onChange={e => setRelationship(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoComplete="off"
          />
        </div>
        <div className="form-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
