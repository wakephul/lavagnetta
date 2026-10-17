import { api, ApiError, type Role, type TeamData } from './api'
import type { Play, PlayData } from './types'

// Stato dell'app. La sessione e il quintetto scelto restano sul dispositivo,
// tutto il resto arriva dal database.

const SESSION_KEY = 'lavagnetta.sessione'
const LINEUP_KEY = 'lavagnetta.quintetto'

type Session = { token: string; role: Role }
export type Lineup = { players: (string | null)[]; me: number | null }

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Navigazione privata o spazio pieno: si continua senza ricordare.
  }
}

export const app = $state({
  session: read<Session | null>(SESSION_KEY, null),
  data: null as TeamData | null,
  loading: false,
  error: '',
  lineup: read<Lineup>(LINEUP_KEY, { players: [null, null, null, null, null], me: null }),
})

export const canEdit = () => app.session?.role === 'edit' && app.data?.role === 'edit'
export const teamColor = () => app.data?.team.color ?? '#1d5fbf'

function onError(e: unknown): never {
  if (e instanceof ApiError && e.kind === 'session') {
    setSession(null)
    app.data = null
  }
  throw e
}

function setSession(s: Session | null) {
  app.session = s
  write(SESSION_KEY, s)
}

export async function load() {
  if (!app.session) return
  app.loading = true
  app.error = ''
  try {
    app.data = await api.teamData(app.session.token)
  } catch (e) {
    app.error = e instanceof Error ? e.message : String(e)
    if (e instanceof ApiError && e.kind === 'session') setSession(null)
  } finally {
    app.loading = false
  }
}

/** Restituisce un messaggio d'errore, oppure stringa vuota se è andata bene. */
export async function login(password: string): Promise<string> {
  try {
    const r = await api.login(password)
    if (r.error) return r.error
    // Se si entra come allenatore da una sessione di squadra, quella vecchia non serve più.
    if (app.session) api.logout(app.session.token).catch(() => {})
    setSession({ token: r.token, role: r.role })
    await load()
    return app.error
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export async function logout() {
  const s = app.session
  setSession(null)
  app.data = null
  if (s) await api.logout(s.token).catch(() => {})
}

export function setLineup(l: Lineup) {
  app.lineup = l
  write(LINEUP_KEY, l)
}

const token = () => {
  if (!app.session) throw new ApiError('Sessione scaduta, rientra con la password', 'session')
  return app.session.token
}

export async function savePlay(play: { id: string | null; name: string; updated_at: string | null; data: PlayData }) {
  try {
    const r = await api.savePlay(token(), play.id, play.name, play.data, play.updated_at)
    const saved: Play = { id: r.id, name: play.name, updated_at: r.updated_at, share_token: r.share_token, data: play.data }
    if (app.data) {
      const i = app.data.plays.findIndex((p) => p.id === r.id)
      if (i >= 0) app.data.plays[i] = saved
      else app.data.plays = [...app.data.plays, saved].sort((a, b) => a.name.localeCompare(b.name, 'it'))
    }
    return saved
  } catch (e) {
    return onError(e)
  }
}

export async function deletePlay(id: string) {
  try {
    await api.deletePlay(token(), id)
    if (app.data) app.data.plays = app.data.plays.filter((p) => p.id !== id)
  } catch (e) {
    onError(e)
  }
}

export async function newShareLink(id: string) {
  try {
    const s = await api.newShareLink(token(), id)
    const p = app.data?.plays.find((p) => p.id === id)
    if (p) p.share_token = s
    return s
  } catch (e) {
    return onError(e)
  }
}

export async function call<T>(f: (token: string) => Promise<T>): Promise<T> {
  try {
    return await f(token())
  } catch (e) {
    return onError(e)
  }
}

export const shareUrl = (share: string) => `${location.origin}${location.pathname}#/s/${share}`
