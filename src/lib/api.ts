import type { Play, PlayData, Player } from './types'

const URL = import.meta.env.VITE_SUPABASE_URL as string
const KEY = import.meta.env.VITE_SUPABASE_KEY as string

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'session' | 'conflict' | 'network' | 'other',
  ) {
    super(message)
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { apikey: KEY, 'Content-Type': 'application/json' }
  // Le chiavi "legacy" sono JWT e vanno anche in Authorization; quelle nuove no.
  if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`
  let res: Response
  try {
    res = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) })
  } catch {
    throw new ApiError('Nessuna connessione. Controlla la rete e riprova.', 'network')
  }
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    const kind = body?.hint === 'session' ? 'session' : body?.hint === 'conflict' ? 'conflict' : 'other'
    throw new ApiError(body?.message ?? `Errore ${res.status}`, kind)
  }
  return body as T
}

export type Role = 'view' | 'edit'
export type TeamData = { role: Role; team: { name: string; color: string }; players: Player[]; plays: Play[] }

export const api = {
  login: (password: string) => rpc<{ token: string; role: Role; error?: string }>('login', { p_password: password }),
  logout: (token: string) => rpc<void>('logout', { p_token: token }),
  teamData: (token: string) => rpc<TeamData>('team_data', { p_token: token }),
  savePlay: (token: string, id: string | null, name: string, data: PlayData, expected: string | null) =>
    rpc<{ id: string; updated_at: string; share_token: string }>('save_play', {
      p_token: token,
      p_id: id,
      p_name: name,
      p_data: data,
      p_expected: expected,
    }),
  deletePlay: (token: string, id: string) => rpc<void>('delete_play', { p_token: token, p_id: id }),
  newShareLink: (token: string, id: string) => rpc<string>('new_share_link', { p_token: token, p_id: id }),
  sharedPlay: (share: string) =>
    rpc<{ name: string; data: PlayData; updated_at: string; team: { name: string; color: string } } | null>('shared_play', {
      p_share: share,
    }),
  savePlayer: (token: string, p: Omit<Player, 'id'> & { id: string | null }) =>
    rpc<Player>('save_player', {
      p_token: token,
      p_id: p.id,
      p_name: p.name,
      p_number: p.number,
      p_role: p.role,
      p_height: p.height,
    }),
  deletePlayer: (token: string, id: string) => rpc<void>('delete_player', { p_token: token, p_id: id }),
  setTeam: (token: string, name: string, color: string) => rpc<void>('set_team', { p_token: token, p_name: name, p_color: color }),
  setPassword: (token: string, kind: Role, password: string) =>
    rpc<void>('set_password', { p_token: token, p_kind: kind, p_password: password }),
}
