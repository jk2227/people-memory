import { useState, useEffect } from 'react'
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
  // null = closed, 'new' = creating, otherwise a story id
  const [openId, setOpenId] = useState(null)

  const load = () => {
    listStories()
      .then(setStories)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSaved = (saved, isNew) => {
    setStories(prev => {
      const next = isNew
        ? [saved, ...prev]
        : prev.map(s => s.id === saved.id ? { ...s, ...saved } : s)
      next.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      return next
    })
    setOpenId(null)
  }

  const handleDeleted = (id) => {
    setStories(prev => prev.filter(s => s.id !== id))
    setOpenId(null)
  }

  if (loading) {
    return <div className="content"><div className="empty-state"><p>Loading...</p></div></div>
  }

  const editorStory = openId === 'new'
    ? { id: null, title: '', content: '' }
    : stories.find(s => s.id === openId)

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

      <button className="fab" onClick={() => setOpenId('new')} aria-label="Add story">+</button>

      {editorStory && (
        <StoryEditor
          story={editorStory}
          onClose={() => setOpenId(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </>
  )
}

function StoryEditor({ story, onClose, onSaved, onDeleted }) {
  const isNew = story.id === null
  const [title, setTitle] = useState(story.title || '')
  const [content, setContent] = useState(story.content || '')
  const [saving, setSaving] = useState(false)

  const dirty = title !== (story.title || '') || content !== (story.content || '')
  const canSave = dirty && (title.trim() || content.trim()) && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const saved = isNew
        ? await createStory(title, content)
        : { ...story, title, content, updated_at: new Date().toISOString() }
      if (!isNew) {
        await updateStory(story.id, { title, content })
      }
      onSaved(saved, isNew)
    } catch (e) {
      console.error(e)
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return
    onClose()
  }

  const handleDelete = async () => {
    if (isNew) { onClose(); return }
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
        <div className="modal-header-title">{isNew ? 'New Story' : 'Story'}</div>
        <button className="story-save-btn" onClick={handleSave} disabled={!canSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="modal-body story-editor">
        <input
          className="story-title-input"
          type="text"
          placeholder="Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          spellCheck={false}
          autoFocus={isNew}
        />
        <textarea
          className="story-content-input"
          placeholder="Write your story..."
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        {!isNew && (
          <button className="story-delete-btn" onClick={handleDelete}>Delete story</button>
        )}
      </div>
    </div>
  )
}
