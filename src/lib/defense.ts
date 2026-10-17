import { BASKET, HALF, W } from './court'
import { add, clamp, dist, lerp, mul, sub, unit, type Vec } from './geo'
import type { DefenseType } from './types'

// Dove dovrebbe stare ogni difensore, dati attacco e palla.
// Sono i principi che si insegnano in palestra: palla-uomo-canestro,
// anticipo sul lato forte, aiuto sul lato debole, scivolamenti di zona.

const H = BASKET

export type Scene = {
  off: Vec[]
  ball: Vec
  /** Chi ha la palla, -1 se è in aria. */
  holder: number
}

const inCourt = (p: Vec): Vec => ({ x: clamp(p.x, 0.3, W - 0.3), y: clamp(p.y, 0.3, HALF - 0.3) })

/** Posizione sull'uomo con la palla: un metro davanti, verso il canestro. */
export function onBall(ball: Vec): Vec {
  return inCourt(add(ball, mul(unit(sub(H, ball)), Math.min(1.0, dist(ball, H) * 0.5))))
}

/** Difesa a uomo: posto del difensore che marca l'attaccante m. */
export function manSpot(m: Vec, s: Scene, hasBall: boolean): Vec {
  if (hasBall) return onBall(m)
  const b = s.ball
  const toBall = unit(sub(b, m))
  const toRim = unit(sub(H, m))
  const sameSide = Math.abs(b.x - W / 2) < 2 || Math.sign(b.x - W / 2) === Math.sign(m.x - W / 2)
  const near = dist(m, b) < 7
  if (dist(m, H) < 3.2 && sameSide) {
    // Post sul lato della palla: anticipo di tre quarti.
    return inCourt(add(m, add(mul(toBall, 0.6), mul(toRim, 0.2))))
  }
  if (near && sameSide) {
    // Un passaggio di distanza: sulla linea di passaggio, un passo verso il canestro.
    // Se l'uomo è vicinissimo alla palla si resta più attaccati a lui.
    const k = Math.min(1, dist(m, b) / 3)
    return inCourt(add(m, add(mul(toBall, 0.9 * k), mul(toRim, 0.45))))
  }
  // Lato debole: nel triangolo palla-uomo-canestro, pronto ad aiutare,
  // ma mai a più di tre metri dal proprio uomo.
  const off = add(mul(sub(b, m), 0.33), mul(sub(H, m), 0.38))
  const l = Math.hypot(off.x, off.y)
  return inCourt(add(m, l > 3 ? mul(off, 3 / l) : off))
}

/** Penetrazione: la palla è vicina al canestro e il suo difensore è stato battuto. */
export function driveHelpSpot(s: Scene, ballDefender: Vec | null): Vec | null {
  if (s.holder < 0) return null
  const b = s.ball
  if (b.y < 0 || dist(b, H) > 5.5) return null
  if (ballDefender && dist(ballDefender, H) < dist(b, H) + 0.1) return null
  return inCourt(add(b, mul(unit(sub(H, b)), 1.0)))
}

// --- Zone ---
// Posizioni di riferimento per palla in punta, ala, angolo, post alto e post basso
// (lato sinistro). Il lato destro si ottiene per simmetria; in mezzo si interpola.

type Spot = { ball: Vec; at: Vec[] }

const p = (x: number, y: number): Vec => ({ x, y })

// 2-3: 0 e 1 guardie (sinistra, destra), 2 e 3 ali basse (sinistra, destra), 4 centro.
const Z23: Spot[] = [
  { ball: p(7.5, 8.2), at: [p(5.9, 6.6), p(9.1, 6.6), p(3.9, 2.7), p(11.1, 2.7), p(7.5, 2.4)] },
  { ball: p(2.8, 6.4), at: [p(3.8, 5.5), p(7.2, 5.9), p(2.4, 3.1), p(8.9, 2.3), p(5.6, 2.4)] },
  { ball: p(0.9, 1.3), at: [p(3.4, 4.9), p(7.0, 4.7), p(1.8, 2.0), p(8.3, 2.2), p(4.6, 1.8)] },
  { ball: p(7.5, 5.8), at: [p(6.2, 6.5), p(8.8, 6.5), p(5.0, 2.5), p(10.0, 2.5), p(7.5, 4.4)] },
  { ball: p(5.0, 2.0), at: [p(4.5, 5.0), p(7.5, 4.9), p(4.1, 2.8), p(8.6, 2.2), p(5.8, 2.2)] },
]

// 3-2: 0 punta, 1 e 2 ali alte (sinistra, destra), 3 e 4 bassi (sinistra, destra).
const Z32: Spot[] = [
  { ball: p(7.5, 8.2), at: [p(7.5, 7.0), p(4.1, 5.9), p(10.9, 5.9), p(5.6, 2.3), p(9.4, 2.3)] },
  { ball: p(2.8, 6.4), at: [p(6.5, 6.1), p(3.7, 5.5), p(9.0, 5.1), p(2.9, 2.8), p(6.6, 2.1)] },
  { ball: p(0.9, 1.3), at: [p(6.4, 5.1), p(3.3, 4.6), p(8.8, 3.3), p(1.8, 2.0), p(5.0, 1.8)] },
  { ball: p(7.5, 5.8), at: [p(7.5, 6.9), p(6.0, 5.3), p(9.0, 5.3), p(6.2, 2.5), p(8.8, 2.5)] },
  { ball: p(5.0, 2.0), at: [p(6.6, 5.2), p(4.4, 4.8), p(9.0, 3.7), p(4.4, 2.0), p(5.9, 2.0)] },
]

const flip = (v: Vec): Vec => ({ x: W - v.x, y: v.y })

function mirrored(spots: Spot[], swap: number[]): Spot[] {
  const out = spots.slice()
  for (const s of spots) {
    if (Math.abs(s.ball.x - W / 2) < 0.01) continue
    out.push({ ball: flip(s.ball), at: swap.map((j) => flip(s.at[j])) })
  }
  return out
}

const ZONES: Record<'zone23' | 'zone32', Spot[]> = {
  zone23: mirrored(Z23, [1, 0, 3, 2, 4]),
  zone32: mirrored(Z32, [0, 2, 1, 4, 3]),
}

/** Posizioni della zona per una palla in un punto qualsiasi (media pesata sulle distanze). */
export function zoneShell(type: 'zone23' | 'zone32', ball: Vec): Vec[] {
  const spots = ZONES[type]
  const b = { x: clamp(ball.x, 0, W), y: clamp(ball.y, 0.3, HALF) }
  const acc = [0, 1, 2, 3, 4].map(() => ({ x: 0, y: 0 }))
  let total = 0
  for (const s of spots) {
    const d = dist(b, s.ball)
    if (d < 0.05) return s.at.map((v) => ({ ...v }))
    const w = 1 / d ** 3
    total += w
    s.at.forEach((v, i) => {
      acc[i].x += v.x * w
      acc[i].y += v.y * w
    })
  }
  return acc.map((v) => ({ x: v.x / total, y: v.y / total }))
}

/**
 * Zona completa: guscio, pressione sulla palla e piccoli aggiustamenti
 * verso gli attaccanti che entrano nella propria area.
 * `presser` è il difensore che era sulla palla al passo prima (per non saltellare).
 */
export function zoneSpots(type: 'zone23' | 'zone32', s: Scene, presser: number): { at: Vec[]; presser: number } {
  const shell = zoneShell(type, s.ball)
  let who = -1
  const ballIn = s.ball.y >= 0 && s.ball.x >= 0 && s.ball.x <= W
  if (s.holder >= 0 && ballIn) {
    const press = onBall(s.ball)
    let best = 0
    for (let i = 1; i < 5; i++) if (dist(shell[i], press) < dist(shell[best], press)) best = i
    who = presser >= 0 && dist(shell[presser], press) < dist(shell[best], press) + 0.8 ? presser : best
    shell[who] = press
  }
  const at = shell.map((spot, i) => {
    if (i === who) return spot
    let near: Vec | null = null
    for (let a = 0; a < s.off.length; a++) {
      if (a === s.holder) continue
      if (dist(s.off[a], spot) < 2.2 && (!near || dist(s.off[a], spot) < dist(near, spot))) near = s.off[a]
    }
    if (!near) return spot
    const front = add(near, mul(unit(sub(H, near)), 0.8))
    return inCourt(lerp(spot, front, 0.35))
  })
  return { at, presser: who }
}

export const isZone = (d: DefenseType): d is 'zone23' | 'zone32' => d !== 'man'
