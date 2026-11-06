import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The APK is a thin shell around the hosted site: `server.url` means a fix we
 * deploy reaches every installed phone immediately, with no new APK to forward.
 * Set APP_URL when building (the GitHub Actions workflow does).
 */
const appUrl = process.env.APP_URL?.replace(/\/$/, '')

const config: CapacitorConfig = {
  appId: 'in.society.viom',
  appName: 'Venkatesh Viom',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
    ...(appUrl ? { url: appUrl, cleartext: false } : {}),
    // Shown instead of Chrome's error page when the phone is offline.
    errorPath: 'offline.html',
  },
}

export default config
