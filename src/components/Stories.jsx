import { useState, useEffect, useRef } from 'react'
import { listStories, createStory, updateStory, deleteStory } from '../lib/api'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export default function Stories() {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)

  const load = () => {
    listStories()
      .then(setStories)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleNew = async () => {
    try {
      const story = await createStory('', '')
      setStories(prev => [story, ...prev])
      setOpenId(story.id)
    } catch (e) {
      console.error(e)
    }
  }

  const handleClose = (updated) => {
    setOpenId(null)
    if (updated) {
      setStories(prev => {
        const next = prev.map(s => s.id === updated.id ? { ...s, ...updated } : s)
        next.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        return next
      })
    }
  }

  const handleDeleted = (id) => {
    setStories(prev => prev.filter(s => s.id !== id))
    setOpenId(null)
  }

  if (loading) {
    return <div className="content"><div className="empty-state"><p>Loading...</p></div></div>
  }

  const openStory = stories.find(s => s.id === openId)

  return (
    <>
      <div className="content stories-content">
        {stories.length === 0 ? (
          <div className="empty-state">
            <h2>No stories yet</h2>
            <p>Tap the + button to write a new story.</p>
          </div>
        ) : (
          <div className="stories-list">
            {stories.map(s => (
              <button key={s.id} className="story-card" onClick={() => setOpenId(s.id)}>
                <div className="story-card-title">{s.title || 'Untitled'}</div>
                {s.content && (
                  <div className="story-card-preview">{s.content.split('\n')[0]}</div>
                )}
                <div className="story-card-date">{formatDate(s.updated_at)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="fab" onClick={handleNew} aria-label="Add story">+</button>

      {openStory && (
        <StoryEditor
          story={openStory}
          onClose={handleClose}
          onDeleted={handleDeleted}
        />
      )}
    </>
  )
}

function StoryEditor({ story, onClose, onDeleted }) {
  const [title, setTitle] = useState(story.title || '')
  const [content, setContent] = useState(story.content || '')
  const [saving, setSaving] = useState(false)
  const lastSavedRef = useRef({ title: story.title || '', content: story.content || '' })
  const debounceRef = useRef(null)

  const flushSave = async () => {
    const last = lastSavedRef.current
    if (last.title === title && last.content === content) return
    setSaving(true)
    try {
      await updateStory(story.id, { title, content })
      lastSavedRef.current = { title, content }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(flushSave, 600)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [title, content])

  const handleClose = async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    await flushSave()
    onClose({ ...story, title, content, updated_at: new Date().toISOString() })
  }

  const handleDelete = async () => {
    if (!confirm('Delete this story?')) return
    try {
      await deleteStory(story.id)
      onDeleted(story.id)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="modal-overlay active">
      <div className="modal-header">
        <button className="back-btn" onClick={handleClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <div className="modal-header-title">{saving ? 'Saving…' : 'Story'}</div>
      </div>
      <div className="modal-body story-editor">
        <input
          className="story-title-input"
          type="text"
          placeholder="Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          spellCheck={false}
          autoFocus={!story.title && !story.content}
        />
        <textarea
          className="story-content-input"
          placeholder="Write your story..."
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        <button className="story-delete-btn" onClick={handleDelete}>Delete story</button>
      </div>
    </div>
  )
}
