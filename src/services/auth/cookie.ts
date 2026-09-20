/**
 * Whether the session cookie should carry the Secure flag.
 *
 * Keyed on the scheme the site is actually served over, not on NODE_ENV: a
 * production build reached over plain HTTP (an IP address before DNS and TLS
 * are in place) would set Secure, the browser would refuse to send the cookie
 * back, and sign-in would fail with no visible error.
 */
export function cookieIsSecure(publicBaseUrl: string): boolean {
  return publicBaseUrl.trim().toLowerCase().startsWith('https://')
}
