import { useState, useEffect } from 'react'
import { listClothes, createClothing, deleteClothing, addWear, removeWear, washClothing } from '../lib/api'

const CATEGORIES = ['Pants', 'T-shirts', 'Tops', 'Sweatshirts']

const WEAR_LABELS = {
  BW: 'Barely Worn',
  JL: 'Just Lounged',
  FD: 'Full Day',
}

const WEAR_COLORS = {
  BW: '#51cf9a',
  JL: '#FDB515',
  FD: '#ff6b6b',
}

export default function ClothesTracker() {
  const [clothes, setClothes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState(CATEGORIES[0])
  const [adding, setAdding] = useState(false)

  const load = () => {
    listClothes()
      .then(setClothes)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const byCategory = CATEGORIES.map(cat => ({
    name: cat,
    items: clothes.filter(c => c.category === cat),
  }))

  // Include any custom categories not in the default list
  const customCats = [...new Set(clothes.map(c => c.category))].filter(c => !CATEGORIES.includes(c))
  customCats.forEach(cat => {
    byCategory.push({ name: cat, items: clothes.filter(c => c.category === cat) })
  })

  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const item = await createClothing(newName.trim(), newCategory)
      setClothes(prev => [...prev, item])
      setNewName('')
      setShowAdd(false)
    } catch (e) {
      console.error(e)
    }
    setAdding(false)
  }

  const handleAddWear = async (itemId, wearType) => {
    try {
      const wear = await addWear(itemId, wearType)
      setClothes(prev => prev.map(c =>
        c.id === itemId ? { ...c, wears: [...c.wears, wear] } : c
      ))
    } catch (e) {
      console.error(e)
    }
  }

  const handleRemoveWear = async (itemId, wearId) => {
    try {
      await removeWear(itemId, wearId)
      setClothes(prev => prev.map(c =>
        c.id === itemId ? { ...c, wears: c.wears.filter(w => w.id !== wearId) } : c
      ))
    } catch (e) {
      console.error(e)
    }
  }

  const handleWash = async (itemId) => {
    try {
      await washClothing(itemId)
      setClothes(prev => prev.map(c =>
        c.id === itemId ? { ...c, wears: [] } : c
      ))
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async (itemId) => {
    try {
      await deleteClothing(itemId)
      setClothes(prev => prev.filter(c => c.id !== itemId))
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) {
    return <div className="content"><div className="empty-state"><p>Loading...</p></div></div>
  }

  return (
    <div className="content clothes-content">
      <div className="clothes-legend">
        <span className="legend-item"><span className="legend-dot" style={{ background: WEAR_COLORS.BW }} />BW = Barely Worn</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: WEAR_COLORS.JL }} />JL = Just Lounged</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: WEAR_COLORS.FD }} />FD = Full Day</span>
      </div>

      {byCategory.filter(cat => cat.items.length > 0).map(cat => (
        <div key={cat.name} className="clothes-category">
          <div className="clothes-category-header">{cat.name}</div>
          {cat.items.map(item => (
            <ClothingItem
              key={item.id}
              item={item}
              onAddWear={handleAddWear}
              onRemoveWear={handleRemoveWear}
              onWash={handleWash}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ))}

      {clothes.length === 0 && (
        <div className="empty-state">
          <h2>No clothes yet</h2>
          <p>Tap the + button to add clothing items<br />and track when they need washing.</p>
        </div>
      )}

      {showAdd ? (
        <div className="clothes-add-form">
          <input
            type="text"
            placeholder="Item name (e.g. Dark blue Lulu's)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="clothes-add-actions">
            <button className="btn-cancel" onClick={() => { setShowAdd(false); setNewName('') }}>Cancel</button>
            <button className="btn-save" onClick={handleAdd} disabled={!newName.trim() || adding}>Add</button>
          </div>
        </div>
      ) : (
        <button className="fab" onClick={() => setShowAdd(true)} aria-label="Add clothing">+</button>
      )}
    </div>
  )
}

function ClothingItem({ item, onAddWear, onRemoveWear, onWash, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const wears = item.wears || []
  const wearCount = wears.length
  const needsWash = wearCount >= 3 || wears.some(w => w.wear_type === 'FD')

  return (
    <div className={`clothing-item ${needsWash ? 'needs-wash' : ''}`}>
      <div className="clothing-item-main" onClick={() => setExpanded(!expanded)}>
        <div className="clothing-item-info">
          <span className="clothing-item-name">{item.name}</span>
          <div className="clothing-wear-tags">
            {wears.map(w => (
              <span
                key={w.id}
                className="wear-tag"
                style={{ background: WEAR_COLORS[w.wear_type] + '22', color: WEAR_COLORS[w.wear_type], borderColor: WEAR_COLORS[w.wear_type] + '44' }}
              >
                {w.wear_type}
              </span>
            ))}
          </div>
        </div>
        {needsWash && <span className="wash-indicator" title="Time to wash">!</span>}
        <svg className={`chevron ${expanded ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded && (
        <div className="clothing-item-actions">
          <div className="wear-buttons">
            <button className="wear-btn bw" onClick={() => onAddWear(item.id, 'BW')}>+ BW</button>
            <button className="wear-btn jl" onClick={() => onAddWear(item.id, 'JL')}>+ JL</button>
            <button className="wear-btn fd" onClick={() => onAddWear(item.id, 'FD')}>+ FD</button>
          </div>
          {wears.length > 0 && (
            <div className="wear-history">
              {wears.map(w => (
                <button key={w.id} className="wear-history-item" onClick={() => onRemoveWear(item.id, w.id)}>
                  <span style={{ color: WEAR_COLORS[w.wear_type] }}>{w.wear_type}</span>
                  <span className="wear-remove-x">&times;</span>
                </button>
              ))}
            </div>
          )}
          <div className="clothing-bottom-actions">
            {wears.length > 0 && (
              <button className="wash-btn" onClick={() => onWash(item.id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6l3 12h12l3-12"/><path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg>
                Washed
              </button>
            )}
            <button className="remove-clothing-btn" onClick={() => onDelete(item.id)}>Remove</button>
          </div>
        </div>
      )}
    </div>
  )
}
