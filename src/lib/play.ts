import { defaultStart } from './court'
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
