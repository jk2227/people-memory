import { useState, useEffect, useRef } from 'react'
import {
  getPerson, updatePerson, deletePerson,
  addFact, removeFact,
  addTold, removeTold,
  addInteraction, removeInteraction,
} from '../lib/api'

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  })
}

export default function PersonDetail({ personId, onBack }) {
  const [person, setPerson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [factInput, setFactInput] = useState('')
  const [toldInput, setToldInput] = useState('')
  const [logInput, setLogInput] = useState('')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10))
  const nameRef = useRef(null)
  const relRef = useRef(null)

  const load = () => {
    getPerson(personId)
      .then(setPerson)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [personId])

  if (loading) return <div className="loading-screen">Loading...</div>
  if (!person) return <div className="loading-screen">Person not found</div>

  const handleNameBlur = () => {
    const val = nameRef.current?.value.trim()
    if (val && val !== person.name) {
      updatePerson(personId, { name: val }).then(load)
    }
  }

  const handleRelBlur = () => {
    const val = relRef.current?.value.trim()
    if (val !== person.relationship) {
      updatePerson(personId, { relationship: val || '' }).then(load)
    }
  }

  const handleAddFact = () => {
    const text = factInput.trim()
    if (!text) return
    setFactInput('')
    addFact(personId, text).then(load)
  }

  const handleAddTold = () => {
    const text = toldInput.trim()
    if (!text) return
    setToldInput('')
    addTold(personId, text).then(load)
  }

  const handleAddLog = () => {
    const text = logInput.trim()
    if (!text) return
    setLogInput('')
    setLogDate(new Date().toISOString().slice(0, 10))
    addInteraction(personId, text, logDate).then(load)
  }

  const handleDelete = () => {
    if (window.confirm(`Remove ${person.name} from your People Memory?`)) {
      deletePerson(personId).then(onBack)
    }
  }

  return (
    <div className="modal-overlay active">
      <div className="modal-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <div className="modal-header-title">{person.name}</div>
      </div>
      <div className="modal-body">
        {/* Name & relationship */}
        <div className="section">
          <div className="detail-name">
            <input
              ref={nameRef}
              type="text"
              defaultValue={person.name}
              onBlur={handleNameBlur}
              spellCheck={false}
            />
          </div>
          <div className="detail-relationship">
            <input
              ref={relRef}
              type="text"
              defaultValue={person.relationship || ''}
              placeholder="Who are they? (e.g. Haircutter, Friend from college)"
              onBlur={handleRelBlur}
              spellCheck={false}
            />
          </div>
        </div>

        {/* Reminder banner */}
        {person.told.length > 0 && (
          <div className="reminder-banner">
            <strong>Reminder:</strong> They already know: {person.told.map(t => t.text).join(' / ')}
          </div>
        )}

        {/* Key Facts */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Key Facts</span>
          </div>
          <div className="facts-list">
            {person.facts.length === 0 && (
              <span className="muted-text">No facts yet</span>
            )}
            {person.facts.map(f => (
              <div key={f.id} className="fact-chip">
                <span>{f.text}</span>
                <button
                  className="remove-fact"
                  onClick={() => removeFact(personId, f.id).then(load)}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <div className="inline-add">
            <input
              type="text"
              placeholder="e.g. Went to Cornell, dating Kfong"
              value={factInput}
              onChange={e => setFactInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddFact()}
            />
            <button className="add-btn" onClick={handleAddFact}>Add</button>
          </div>
        </div>

        {/* Things they already know */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Things They Already Know</span>
          </div>
          <p className="section-hint">Track what you've told them so you don't repeat yourself</p>
          {person.told.length === 0 && (
            <span className="muted-text">Nothing tracked yet</span>
          )}
          {person.told.map(t => (
            <div key={t.id} className="told-item">
              <span className="told-icon">&#9888;</span>
              <span className="told-text">{t.text}</span>
              <button
                className="remove-told"
                onClick={() => removeTold(personId, t.id).then(load)}
              >
                &times;
              </button>
            </div>
          ))}
          <div className="inline-add">
            <input
              type="text"
              placeholder="e.g. Told them about my seizures"
              value={toldInput}
              onChange={e => setToldInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTold()}
            />
            <button className="add-btn" onClick={handleAddTold}>Add</button>
          </div>
        </div>

        {/* Interaction log */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Interaction Log</span>
          </div>
          {person.interactions.length === 0 && (
            <span className="muted-text">No interactions logged yet</span>
          )}
          {person.interactions.map(entry => (
            <div key={entry.id} className="log-entry">
              <div className="log-dot"></div>
              <div className="log-date">{formatDate(entry.occurred_at)}</div>
              <div className="log-text">{entry.text}</div>
              <button
                className="remove-log"
                onClick={() => removeInteraction(personId, entry.id).then(load)}
              >
                remove
              </button>
            </div>
          ))}
          <div className="inline-add log-add" style={{ marginTop: 12 }}>
            <input
              type="date"
              className="date-input"
              value={logDate}
              onChange={e => setLogDate(e.target.value)}
            />
            <input
              type="text"
              placeholder="e.g. Visited their new house, talked about..."
              value={logInput}
              onChange={e => setLogInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddLog()}
            />
            <button className="add-btn" onClick={handleAddLog}>Log</button>
          </div>
        </div>

        {/* Delete */}
        <div className="danger-zone">
          <button className="delete-btn" onClick={handleDelete}>
            Delete This Person
          </button>
        </div>
      </div>
    </div>
  )
}
