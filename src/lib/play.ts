import { defaultStart } from './court'
import type { Vec } from './geo'
import type { DefenseType, Phase, PlayData, Read, Situation } from './types'
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

/** Lo stesso schema giocato sull'altro lato del campo. */
export function mirrored(data: PlayData): PlayData {
  const swap = ZONE_SWAP[data.defense]
  const phase = (p: Phase | null): Phase | null =>
    p && {
      ...p,
      actions: p.actions.map((a) => ('path' in a ? { ...a, path: a.path.map(flipV) } : a)),
      reads: p.reads.map((r) => ({
        ...r,
        defense: Object.fromEntries(Object.entries(r.defense).map(([d, path]) => [String(swap ? swap[Number(d)] : d), path.map(flipV)])),
        next: phase(r.next),
      })),
    }
  return { ...data, start: { ...data.start, offense: data.start.offense.map(flipV) }, root: phase(data.root) }
}

/** Fuori dal rettangolo di gioco (chi rimette). */
export const outOfBounds = (v: Vec) => v.x < 0 || v.x > W || v.y < 0
