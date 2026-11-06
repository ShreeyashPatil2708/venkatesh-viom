import { Link } from 'react-router-dom'
import { SOCIETY_NAME } from '../components/Layout'

/** Public page whose link goes out on WhatsApp. No sign-in needed. */
export function Download() {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl font-bold text-white">
          {SOCIETY_NAME.charAt(0).toUpperCase()}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{SOCIETY_NAME}</h1>
        <p className="mt-1.5 text-muted">
          Raise complaints, suggestions and enquiries with the managing committee.
        </p>
      </div>

      <div className="card mb-4 p-5">
        <h2 className="font-semibold">On Android</h2>
        <p className="mt-1 text-sm text-muted">
          Install the app to get it as an icon on your phone.
        </p>
        <a
          href="https://github.com/ShreeyashPatil2708/venkatesh-viom/releases/latest/download/venkatesh-viom.apk"
          className="btn-primary mt-3 w-full"
        >
          Download the app
        </a>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Tap the file once it finishes downloading.</li>
          <li>
            Android will ask to allow installs from this source — tap{' '}
            <span className="font-medium text-ink">Settings</span>, turn it on, then go back.
          </li>
          <li>
            If a warning appears, tap{' '}
            <span className="font-medium text-ink">Install anyway</span>. It shows for any app
            not from the Play Store.
          </li>
        </ol>
      </div>

      <div className="card mb-4 p-5">
        <h2 className="font-semibold">On iPhone</h2>
        <p className="mt-1 text-sm text-muted">
          Use the website — everything works the same. Add it to your bookmarks so it is easy
          to find.
        </p>
        <Link to="/" className="btn-secondary mt-3 w-full">
          Open the app here
        </Link>
      </div>

      <p className="text-center text-xs text-muted">
        Sign in with your email address. A committee member approves your flat once, then you
        are set.
      </p>
    </div>
  )
}
