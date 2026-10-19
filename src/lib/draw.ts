import { BASKET } from './court'
import { Line, add, dist, mul, perp, sub, unit, type Vec } from './geo'
import type { Plan } from './sim'
import type { Action, MoveKind } from './types'

// Geometria dei segni sulla lavagna: frecce, palleggio a zig-zag, barra del blocco.

const f = (n: number) => Math.round(n * 1000) / 1000

export const polyD = (pts: Vec[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join('')

export function arrowHead(tip: Vec, dir: Vec, size = 0.42): string {
  const back = sub(tip, mul(dir, size))
  const side = mul(perp(dir), size * 0.5)
  const a = add(back, side)
  const b = sub(back, side)
  return `M${f(tip.x)} ${f(tip.y)}L${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}Z`
}

/** Taglia la linea all'inizio e alla fine, per non coprire le pedine. */
export function trim(line: Line, from: number, to: number): Vec[] {
  const s0 = Math.min(from, line.length / 3)
  const s1 = Math.max(line.length - to, s0)
  const out = [line.at(s0)]
  for (let i = 0; i < line.pts.length; i++) if (line.cum[i] > s0 && line.cum[i] < s1) out.push(line.pts[i])
  out.push(line.at(s1))
  return out
}

export function zigzag(line: Line, amp = 0.17, wave = 0.6, straightEnd = 0.7): Vec[] {
  const out: Vec[] = []
  const end = Math.max(0, line.length - straightEnd)
  const step = wave / 6
  for (let s = 0; s <= end; s += step) {
    const p = line.at(s)
    const ahead = line.at(Math.min(line.length, s + 0.05))
    const n = perp(unit(sub(ahead, p)))
    out.push(add(p, mul(n, amp * Math.sin((2 * Math.PI * s) / wave))))
  }
  out.push(line.end)
  return out
}

export type Mark = {
  id: string
  kind: MoveKind | 'pass' | 'handoff' | 'shot'
  /** Chi la esegue (indice 0-4). */
  who: number
  d: string
  head?: string
  /** Barre perpendicolari: una per il blocco, due per il consegnato. */
  bars?: [Vec, Vec][]
  /** Il tiro segna anche il ferro, così si vede pure sugli appoggi. */
  ring?: Vec
  /** Linea di riferimento, per toccarla e selezionarla. */
  line: Line
}

/** Tutti i segni di una fase, calcolati sulle posizioni reali della simulazione. */
export function marks(plan: Plan, actions: Action[]): Mark[] {
  const out: Mark[] = []
  for (const m of plan.moves) {
    if (!m || m.line.length < 0.05) continue
    const dir = m.line.endDir()
    const base = { id: m.action.id, kind: m.kind, who: m.i, line: m.line }
    if (m.kind === 'screen') {
      const e = m.line.end
      const side = mul(perp(dir), 0.5)
      out.push({ ...base, d: polyD(m.line.pts), bars: [[add(e, side), sub(e, side)]] })
    } else if (m.kind === 'dribble') {
      out.push({ ...base, d: polyD(zigzag(m.line)), head: arrowHead(m.line.end, dir) })
    } else {
      out.push({ ...base, d: polyD(m.line.pts), head: arrowHead(m.line.end, dir) })
    }
  }
  for (const p of plan.passes) {
    if (p.hand) {
      // Consegnato: due barrette dove la palla passa di mano, di traverso alla corsa di chi riceve.
      const mb = plan.moves[p.b]!
      const at = mb.line.at(p.hand.s)
      const dir = unit(sub(mb.line.at(p.hand.s + 0.3), mb.line.at(p.hand.s - 0.3)))
      const side = mul(perp(dir), 0.38)
      const bars = [-0.12, 0.12].map((k): [Vec, Vec] => {
        const c = add(at, mul(dir, k))
        return [add(c, side), sub(c, side)]
      })
      out.push({ id: p.action.id, kind: 'handoff', who: p.a, d: '', bars, line: new Line([at, at]) })
      continue
    }
    const line = new Line([p.p0, p.p1])
    const pts = trim(line, 0.5, 0.6)
    out.push({ id: p.action.id, kind: 'pass', who: p.a, d: polyD(pts), head: arrowHead(pts[1], unit(sub(p.p1, p.p0))), line })
  }
  if (plan.shot) {
    const s = plan.shot
    const id = actions.find((a) => a.type === 'shot')?.id ?? 'shot'
    const line = new Line([s.p0, BASKET])
    const pts = trim(line, 0.5, 0.45)
    out.push({ id, kind: 'shot', who: s.i, d: line.length > 1.2 ? polyD(pts) : '', ring: BASKET, line })
  }
  return out
}

/** Il segno più vicino a un punto, entro una certa distanza. */
export function markAt(list: Mark[], p: Vec, within = 0.6): Mark | null {
  let best: Mark | null = null
  let bd = within
  for (const m of list) {
    const d = m.line.closest(p).d
    if (d < bd) {
      bd = d
      best = m
    }
  }
  return best
}

export const near = (a: Vec, b: Vec, r: number) => dist(a, b) <= r
