export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = `${import.meta.env.BASE_URL}sw.js`
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(async () => {
          if ('caches' in window) {
            const keys = await caches.keys()
            await Promise.all(keys.map((key) => caches.delete(key)))
          }
        })
        .then(() => navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' }))
        .then((registration) => registration.update())
        .catch(() => {
          // placeholder: explicit no-op for scaffold phase
        })
    })
  }
}
