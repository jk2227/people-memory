import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './components/LoginPage'
import PeopleList from './components/PeopleList'
import PersonDetail from './components/PersonDetail'
import AddPersonModal from './components/AddPersonModal'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedPersonId, setSelectedPersonId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

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

  return (
    <div className="app">
      {selectedPersonId ? (
        <PersonDetail
          personId={selectedPersonId}
          onBack={() => {
            setSelectedPersonId(null)
            refresh()
          }}
        />
      ) : (
        <>
          <PeopleList
            refreshKey={refreshKey}
            onSelect={setSelectedPersonId}
            onSignOut={handleSignOut}
            userName={session.user.user_metadata?.full_name || session.user.email}
          />
          <button className="fab" onClick={() => setShowAddModal(true)} aria-label="Add person">
            +
          </button>
        </>
      )}

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
