import { useState, useEffect } from 'react'
import { listPeople } from '../lib/api'

const avatarColors = ['#6c8cff', '#51cf9a', '#ff6b6b', '#ffc46b', '#c084fc', '#f472b6', '#38bdf8', '#fb923c']

function getAvatarColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

function getInitials(name) {
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)

  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (weeks < 5) return `${weeks}w ago`
  if (months < 12) return `${months}mo ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function PeopleList({ refreshKey, onSelect, onSignOut, userName }) {
  const [people, setPeople] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listPeople()
      .then(setPeople)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [refreshKey])

  const q = search.toLowerCase().trim()
  const filtered = q
    ? people.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.relationship || '').toLowerCase().includes(q)
      )
    : people

  return (
    <div id="listView">
      <div className="app-header">
        <div className="header-top">
          <div className="app-title">People Memory</div>
          <button className="sign-out-btn" onClick={onSignOut} title={userName}>
            <span className="user-name">{userName?.split(' ')[0]}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
        <div className="search-wrap">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            id="search"
            placeholder="Search people..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="content">
        {loading ? (
          <div className="empty-state"><p>Loading...</p></div>
        ) : filtered.length === 0 && people.length === 0 ? (
          <div className="empty-state">
            <h2>No people yet</h2>
            <p>Tap the + button to add someone.<br/>Store facts, log hangouts,<br/>and track what you've told them.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>No results for "{search}"</p></div>
        ) : (
          filtered.map(p => (
            <div key={p.id} className="person-card" onClick={() => onSelect(p.id)}>
              <div className="avatar" style={{ background: getAvatarColor(p.name) }}>
                {getInitials(p.name)}
              </div>
              <div className="person-info">
                <div className="person-name">{p.name}</div>
                <div className="person-preview">
                  {p.latest_interaction?.text || p.relationship || 'No info yet'}
                </div>
              </div>
              {p.latest_interaction && (
                <div className="person-last-seen">{timeAgo(p.latest_interaction.occurred_at)}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
