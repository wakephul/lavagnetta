// Indirizzi con il cancelletto: funzionano su GitHub Pages senza configurare nulla.

const current = () => location.hash.replace(/^#/, '') || '/'

export const route = $state({ path: current() })

addEventListener('hashchange', () => {
  route.path = current()
  window.scrollTo(0, 0)
})

export const go = (path: string) => {
  location.hash = path
}

/** Confronta il percorso con uno schema tipo "/schema/:id" e restituisce i parametri. */
export function match(pattern: string, path = route.path): Record<string, string> | null {
  const a = pattern.split('/')
  const b = path.split('/')
  if (a.length !== b.length) return null
  const out: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) out[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return out
}
