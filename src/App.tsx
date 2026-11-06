import { Route, Routes } from 'react-router-dom'
import { CenteredCard, Layout } from './components/Layout'
import { Alert, FullPageSpinner } from './components/ui'
import { useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import { Download } from './routes/Download'
import { Login } from './routes/Login'
import { MyRequests } from './routes/MyRequests'
import { NewRequest } from './routes/NewRequest'
import { Notices } from './routes/Notices'
import { NotificationsScreen } from './routes/NotificationsScreen'
import { ProfileScreen } from './routes/ProfileScreen'
import { AwaitingApproval, Register } from './routes/Register'
import { TicketDetail } from './routes/TicketDetail'
import { AdminFlats } from './routes/admin/AdminFlats'
import { AdminLayout } from './routes/admin/AdminLayout'
import { AdminMembers } from './routes/admin/AdminMembers'
import { AdminNotices } from './routes/admin/AdminNotices'
import { AdminTicketDetail } from './routes/admin/AdminTicketDetail'
import { AdminTickets } from './routes/admin/AdminTickets'

function SetupNeeded() {
  return (
    <CenteredCard title="Not configured yet">
      <Alert>
        The Supabase keys are missing. Copy <code>.env.example</code> to <code>.env</code> and
        fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
      </Alert>
    </CenteredCard>
  )
}

function NotFound() {
  return (
    <div className="py-10 text-center">
      <p className="font-semibold">Page not found</p>
      <a href="/" className="btn-ghost mt-2">
        Go to the app
      </a>
    </div>
  )
}

/** Everything behind sign-in, approval and role. */
function SignedInApp() {
  const { loading, session, profile, isCommittee, isAdmin } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!session) return <Login />
  if (!profile) return <Register />
  if (profile.status !== 'approved') return <AwaitingApproval />

  return (
    <Routes>
      <Route element={<Layout />} path="/">
        <Route index element={<MyRequests />} />
        <Route path="new" element={<NewRequest />} />
        <Route path="t/:id" element={<TicketDetail />} />
        <Route path="notices" element={<Notices />} />
        <Route path="notifications" element={<NotificationsScreen />} />
        <Route path="profile" element={<ProfileScreen />} />
        {isCommittee && (
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminTickets />} />
            <Route path="t/:id" element={<AdminTicketDetail />} />
            {isAdmin && <Route path="members" element={<AdminMembers />} />}
            <Route path="notices" element={<AdminNotices />} />
            <Route path="flats" element={<AdminFlats />} />
          </Route>
        )}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />

  return (
    <Routes>
      <Route path="/get" element={<Download />} />
      <Route path="*" element={<SignedInApp />} />
    </Routes>
  )
}
