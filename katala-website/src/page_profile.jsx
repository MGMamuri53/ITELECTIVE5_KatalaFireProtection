import { Footer, Nav, PageIntro } from './components'
import { getStoredSession } from './services/katalaApi'

export default function Profile() {
  const session = getStoredSession()
  const user = session?.user

  if (!session?.token) {
    sessionStorage.setItem('katala-return-after-auth', 'profile')
    location.hash = 'signin'
    return null
  }

  return (
    <>
      <Nav active="profile" />
      <main>
        <PageIntro eyebrow="ACCOUNT" title="Profile">
          View the account details currently linked to your Katala customer access.
        </PageIntro>

        <section className="section">
          <div className="shell narrow">
            <div className="profile-panel">
              <div>
                <span>Name</span>
                <strong>{user?.name || 'Customer'}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{user?.email || 'Not available'}</strong>
              </div>
              <div>
                <span>Company</span>
                <strong>{user?.companyName || 'Not provided'}</strong>
              </div>
              <div>
                <span>Contact number</span>
                <strong>{user?.contactNumber || 'Not provided'}</strong>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
