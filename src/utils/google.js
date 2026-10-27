/**
 * Tombol "Masuk dengan Google" (Google Identity Services). Google mengembalikan ID token (credential) yang
 * diverifikasi di server. Client ID dari server (GOOGLE_CLIENT_ID); alamat aplikasi harus terdaftar sebagai
 * "Authorized JavaScript origins" di Google Cloud Console.
 */
let script = null

export function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  script ??= new Promise((resolve, reject) => {
    const element = document.createElement('script')
    element.src = 'https://accounts.google.com/gsi/client'
    element.async = true
    element.onload = () => resolve(window.google)
    element.onerror = () => {
      script = null
      element.remove()
      reject(new Error('Layanan Google tidak dapat dimuat. Periksa koneksi internet.'))
    }
    document.head.appendChild(element)
  })
  return script
}

/**
 * @param {HTMLElement} element wadah tombol
 * @param {string} clientId
 * @param {(credential: string) => void} onCredential
 * @param {{ text?: 'signin_with'|'continue_with'|'signup_with' }} options
 */
export async function renderGoogleButton(element, clientId, onCredential, { text = 'signin_with' } = {}) {
  const google = await loadGoogle()
  google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
    ux_mode: 'popup',
    auto_select: false,
    cancel_on_tap_outside: true,
  })
  google.accounts.id.renderButton(element, {
    theme: 'outline',
    size: 'large',
    text,
    shape: 'rectangular',
    logo_alignment: 'center',
    width: Math.min(400, element.clientWidth || 320),
    locale: 'id',
  })
}
