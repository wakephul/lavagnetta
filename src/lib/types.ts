import type { Vec } from './geo'

/** Numero del giocatore nello schema, da 1 a 5. */
export type Slot = 1 | 2 | 3 | 4 | 5
export const SLOTS: Slot[] = [1, 2, 3, 4, 5]

export type Situation = 'half' | 'blob' | 'slob'
export type DefenseType = 'man' | 'zone23' | 'zone32'
export type Coverage = 'sopra' | 'sotto' | 'cambio'

export type MoveKind = 'move' | 'dribble' | 'screen'

/** I punti del percorso escludono la partenza: si parte sempre da dove il giocatore si trova. */
export type Action =
  | { id: string; type: MoveKind; slot: Slot; path: Vec[] }
  | { id: string; type: 'pass'; from: Slot; to: Slot }
  | { id: string; type: 'shot'; slot: Slot }

/**
 * Una lettura è una possibile reazione della difesa a una fase.
 * Le azioni dell'attacco sono le stesse, cambiano la difesa e il seguito.
 */
export type Read = {
  id: string
  label: string
  /** Come la difesa affronta ogni blocco di questa fase (chiave: id del blocco). */
  coverage: Record<string, Coverage>
  /** Movimenti disegnati a mano per singoli difensori (chiave: 0-4). */
  defense: Record<string, Vec[]>
  next: Phase | null
}

export type Phase = { id: string; actions: Action[]; reads: Read[] }

export type PlayData = {
  v: 1
  situation: Situation
  defense: DefenseType
  /** Come la difesa affronta i blocchi se una lettura non dice altro. */
  coverage: Coverage
  start: { offense: Vec[]; ball: Slot }
  notes: string
  root: Phase | null
}

export type Play = { id: string; name: string; updated_at: string; share_token?: string; data: PlayData }

export type Player = {
  id: string
  name: string
  number: number | null
  role: Slot | null
  height: number | null
}

export const ROLE_NAMES: Record<Slot, string> = {
  1: 'Playmaker',
  2: 'Guardia',
  3: 'Ala piccola',
  4: 'Ala grande',
  5: 'Centro',
}

export const SITUATION_NAMES: Record<Situation, string> = {
  half: 'Metà campo',
  blob: 'Rimessa da fondo',
  slob: 'Rimessa laterale',
}

export const DEFENSE_NAMES: Record<DefenseType, string> = {
  man: 'Uomo',
  zone23: 'Zona 2-3',
  zone32: 'Zona 3-2',
}

export const COVERAGE_NAMES: Record<Coverage, string> = {
  sopra: 'passa sopra',
  sotto: 'passa sotto',
  cambio: 'cambia',
}

export const uid = () => Math.random().toString(36).slice(2, 10)
