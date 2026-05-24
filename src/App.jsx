import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './components/LoginPage'
import PeopleList from './components/PeopleList'
import PersonDetail from './components/PersonDetail'
import AddPersonModal from './components/AddPersonModal'
import ClothesTracker from './components/ClothesTracker'
import Stories from './components/Stories'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedPersonId, setSelectedPersonId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState('people')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const refresh = () => setRefreshKey(k => k + 1)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setSelectedPersonId(null)
  }

  if (loading) {
    return <div className="loading-screen">Loading...</div>
  }

  if (!session) {
    return <LoginPage />
  }

  // If viewing a person detail, show that full-screen (no tabs)
  if (selectedPersonId) {
    return (
      <div className="app">
        <PersonDetail
          personId={selectedPersonId}
          onBack={() => {
            setSelectedPersonId(null)
            refresh()
          }}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app-header">
        <div className="header-top">
          <div className="app-title">
            {activeTab === 'people' ? 'People Memory' : activeTab === 'clothes' ? 'Clothes Tracker' : 'Stories'}
          </div>
          <button className="sign-out-btn" onClick={handleSignOut} title={session.user.user_metadata?.full_name || session.user.email}>
            <span className="user-name">{(session.user.user_metadata?.full_name || session.user.email)?.split(' ')[0]}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
        <div className="tab-bar">
          <button
            className={`tab-btn ${activeTab === 'people' ? 'active' : ''}`}
            onClick={() => setActiveTab('people')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            People
          </button>
          <button
            className={`tab-btn ${activeTab === 'clothes' ? 'active' : ''}`}
            onClick={() => setActiveTab('clothes')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M20.38 3.46L16 2 12 5 8 2 3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47c.06.37.36.67.74.67H8v10c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V9.83h4.4c.38 0 .68-.3.74-.67l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
            </svg>
            Clothes
          </button>
          <button
            className={`tab-btn ${activeTab === 'stories' ? 'active' : ''}`}
            onClick={() => setActiveTab('stories')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z"/>
              <path d="M8 8h8M8 12h8M8 16h5"/>
            </svg>
            Stories
          </button>
        </div>
      </div>

      {activeTab === 'people' && (
        <>
          <PeopleList
            refreshKey={refreshKey}
            onSelect={setSelectedPersonId}
            onSignOut={handleSignOut}
            userName={session.user.user_metadata?.full_name || session.user.email}
            hideHeader={true}
          />
          <button className="fab" onClick={() => setShowAddModal(true)} aria-label="Add person">
            +
          </button>
        </>
      )}
      {activeTab === 'clothes' && <ClothesTracker />}
      {activeTab === 'stories' && <Stories />}

      {showAddModal && (
        <AddPersonModal
          onClose={() => setShowAddModal(false)}
          onCreated={(person) => {
            setShowAddModal(false)
            setSelectedPersonId(person.id)
            refresh()
          }}
        />
      )}
    </div>
  )
}
