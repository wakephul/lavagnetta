import { defaultStart } from './court'
import type { Vec } from './geo'
import type { Action, DefenseType, Phase, PlayData, Read, Situation, Slot } from './types'
import { uid } from './types'

export function newPlayData(situation: Situation, defense: DefenseType): PlayData {
  return { v: 1, situation, defense, coverage: 'sopra', start: defaultStart(situation), notes: '', root: null }
}

export const newRead = (label = ''): Read => ({ id: uid(), label, coverage: {}, defense: {}, next: null })
export const newPhase = (): Phase => ({ id: uid(), actions: [], reads: [newRead()] })

/** Copia profonda di un ramo con identificativi nuovi (anche per blocchi e letture). */
export function cloneBranch(p: Phase | null): Phase | null {
  if (!p) return null
  const ids = new Map<string, string>()
  const actions = p.actions.map((a) => {
    const id = uid()
    ids.set(a.id, id)
    return { ...JSON.parse(JSON.stringify(a)), id }
  })
  return {
    id: uid(),
    actions,
    reads: p.reads.map((r) => ({
      id: uid(),
      label: r.label,
      coverage: Object.fromEntries(Object.entries(r.coverage).map(([k, v]) => [ids.get(k) ?? k, v])),
      defense: JSON.parse(JSON.stringify(r.defense)),
      next: cloneBranch(r.next),
    })),
  }
}

/** Le fasi lungo le scelte fatte, dalla prima. */
export function phasesAlong(data: PlayData, choices: number[]): Phase[] {
  const out: Phase[] = []
  let p = data.root
  while (p && out.length < 40) {
    out.push(p)
    const r = Math.min(choices[out.length - 1] ?? 0, p.reads.length - 1)
    p = p.reads[r].next
  }
  return out
}

/** Quante varianti diverse ha lo schema (i finali possibili). */
export function variants(p: Phase | null): number {
  if (!p) return 1
  return p.reads.reduce((n, r) => n + variants(r.next), 0)
}

export function depth(p: Phase | null): number {
  if (!p) return 0
  return 1 + Math.max(...p.reads.map((r) => depth(r.next)))
}

const W = 15
const flipV = (v: Vec): Vec => ({ x: Math.round((W - v.x) * 100) / 100, y: v.y })
// Nelle zone i difensori hanno un posto fisso: ribaltando, chi stava a sinistra va a destra.
const ZONE_SWAP: Record<string, number[]> = { zone23: [1, 0, 3, 2, 4], zone32: [0, 2, 1, 4, 3] }

/**
 * Se a inizio schema 2 e 3 stanno su lati opposti, e così 4 e 5, dall'altro lato
 * si scambiano anche i ruoli: il 3 fa quello che faceva il 2, il 5 quello del 4.
 */
export function swapsRoles(data: PlayData): boolean {
  const side = (s: number) => Math.sign(data.start.offense[s - 1].x - W / 2)
  return side(2) * side(3) < 0 && side(4) * side(5) < 0
}

/** Lo stesso schema giocato sull'altro lato del campo. */
export function mirrored(data: PlayData): PlayData {
  const roles = swapsRoles(data) ? [1, 3, 2, 5, 4] : [1, 2, 3, 4, 5]
  const slot = (s: Slot) => roles[s - 1] as Slot
  // A uomo il difensore segue il suo attaccante; a zona il suo posto in campo.
  const zone = ZONE_SWAP[data.defense]
  const defender = (d: number) => (zone ? zone[d] : roles[d] - 1)
  const action = (a: Action): Action => {
    if (a.type === 'pass') return { ...a, from: slot(a.from), to: slot(a.to) }
    if (a.type === 'shot') return { ...a, slot: slot(a.slot) }
    return { ...a, slot: slot(a.slot), path: a.path.map(flipV) }
  }
  const phase = (p: Phase | null): Phase | null =>
    p && {
      ...p,
      actions: p.actions.map(action),
      reads: p.reads.map((r) => ({
        ...r,
        defense: Object.fromEntries(Object.entries(r.defense).map(([d, path]) => [String(defender(Number(d))), path.map(flipV)])),
        next: phase(r.next),
      })),
    }
  const offense = data.start.offense.slice()
  data.start.offense.forEach((v, i) => (offense[roles[i] - 1] = flipV(v)))
  return { ...data, start: { offense, ball: slot(data.start.ball) }, root: phase(data.root) }
}

export { outOfBounds } from './court'
