// Vettori e linee sul campo. Tutte le misure sono in metri.

export type Vec = { x: number; y: number }

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
export const len = (a: Vec) => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x })
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function unit(a: Vec): Vec {
  const l = len(a)
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

/** Distanza di p dal segmento ab. */
export function segDist(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a)
  const l2 = ab.x * ab.x + ab.y * ab.y
  if (l2 < 1e-12) return dist(p, a)
  const t = clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2, 0, 1)
  return dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t })
}

/** Ramer-Douglas-Peucker: toglie i punti superflui di un tratto disegnato a mano. */
export function simplify(pts: Vec[], eps: number): Vec[] {
  if (pts.length < 3) return pts.slice()
  let worst = 0
  let at = 0
  const a = pts[0]
  const b = pts[pts.length - 1]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], a, b)
    if (d > worst) {
      worst = d
      at = i
    }
  }
  if (worst <= eps) return [a, b]
  const left = simplify(pts.slice(0, at + 1), eps)
  return left.slice(0, -1).concat(simplify(pts.slice(at), eps))
}

/** Catmull-Rom centripeta: curva morbida che passa per tutti i punti, senza riccioli. */
export function smooth(pts: Vec[], steps = 14): Vec[] {
  if (pts.length < 3) return pts.slice()
  const p = [mirror(pts[1], pts[0]), ...pts, mirror(pts[pts.length - 2], pts[pts.length - 1])]
  const out: Vec[] = [pts[0]]
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]]
    const t1 = Math.sqrt(Math.max(dist(p0, p1), 1e-4))
    const t2 = t1 + Math.sqrt(Math.max(dist(p1, p2), 1e-4))
    const t3 = t2 + Math.sqrt(Math.max(dist(p2, p3), 1e-4))
    for (let s = 1; s <= steps; s++) {
      const t = t1 + ((t2 - t1) * s) / steps
      const a1 = lerp(p0, p1, t / t1)
      const a2 = lerp(p1, p2, (t - t1) / (t2 - t1))
      const a3 = lerp(p2, p3, (t - t2) / (t3 - t2))
      const b1 = lerp(a1, a2, t / t2)
      const b2 = lerp(a2, a3, (t - t1) / (t3 - t1))
      out.push(lerp(b1, b2, (t - t1) / (t2 - t1)))
    }
  }
  return out
}

const mirror = (p: Vec, about: Vec): Vec => ({ x: 2 * about.x - p.x, y: 2 * about.y - p.y })

/** Spezzata parametrizzata per lunghezza d'arco. */
export class Line {
  readonly pts: Vec[]
  readonly cum: number[]
  readonly length: number

  constructor(pts: Vec[]) {
    this.pts = pts.length ? pts : [{ x: 0, y: 0 }]
    this.cum = [0]
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + dist(this.pts[i - 1], this.pts[i]))
    this.length = this.cum[this.cum.length - 1]
  }

  get start() {
    return this.pts[0]
  }

  get end() {
    return this.pts[this.pts.length - 1]
  }

  at(s: number): Vec {
    if (s <= 0) return this.pts[0]
    if (s >= this.length) return this.end
    let lo = 0
    let hi = this.cum.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.cum[mid] <= s) lo = mid
      else hi = mid
    }
    const seg = this.cum[hi] - this.cum[lo]
    return lerp(this.pts[lo], this.pts[hi], seg > 0 ? (s - this.cum[lo]) / seg : 0)
  }

  /** Direzione del tratto alla fine (per frecce e barre del blocco). */
  endDir(back = 0.4): Vec {
    return unit(sub(this.end, this.at(this.length - back)))
  }

  /** Punto della linea più vicino a p. */
  closest(p: Vec): { s: number; d: number } {
    let best = { s: 0, d: dist(p, this.pts[0]) }
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1]
      const ab = sub(this.pts[i], a)
      const l2 = ab.x * ab.x + ab.y * ab.y
      const t = l2 > 0 ? clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2, 0, 1) : 0
      const q = { x: a.x + ab.x * t, y: a.y + ab.y * t }
      const d = dist(p, q)
      if (d < best.d) best = { s: this.cum[i - 1] + (this.cum[i] - this.cum[i - 1]) * t, d }
    }
    return best
  }
}

/**
 * Moto con accelerazione e frenata costanti (profilo trapezoidale).
 * Restituisce la durata e lo spazio percorso al tempo t.
 */
export function profile(length: number, vmax: number, acc: number) {
  const ta = vmax / acc
  const da = 0.5 * acc * ta * ta
  let dur: number
  let s: (t: number) => number
  if (length >= 2 * da) {
    const tc = (length - 2 * da) / vmax
    dur = 2 * ta + tc
    s = (t) => (t <= ta ? 0.5 * acc * t * t : t <= ta + tc ? da + vmax * (t - ta) : length - 0.5 * acc * (dur - t) ** 2)
  } else {
    const tp = Math.sqrt(length / acc)
    dur = 2 * tp
    s = (t) => (t <= tp ? 0.5 * acc * t * t : length - 0.5 * acc * (dur - t) ** 2)
  }
  const at = (t: number) => (t <= 0 ? 0 : t >= dur ? length : s(t))
  /** Tempo in cui si è percorso lo spazio x. */
  const timeAt = (x: number) => {
    let lo = 0
    let hi = dur
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (at(mid) < x) lo = mid
      else hi = mid
    }
    return hi
  }
  return { dur, at, timeAt }
}
