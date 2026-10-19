import { BASKET, outOfBounds } from './court'
import { boxOut, driveHelpSpot, isZone, manSpot, onePassAway, weakSide, zoneSpots, type Scene } from './defense'
import { Line, add, clamp, dist, lerp, mul, profile, segDist, smooth, sub, unit, type Vec } from './geo'
import type { Action, Coverage, DefenseType, MoveKind, Phase, PlayData, Read } from './types'

// Simulazione deterministica: dato lo stato a inizio fase e le azioni disegnate,
// calcola i tempi dell'attacco, il volo della palla e la reazione della difesa,
// fotogramma per fotogramma. Stessi dati, stesso risultato: si può andare avanti e indietro.

export const DT = 1 / 30
const LAG = 0.2 // tempo di reazione dei difensori
const SPEED: Record<MoveKind, number> = { move: 4.2, dribble: 3.4, screen: 3.6 }
const ACC = 6
const DEF_MAX = 4.6
const DEF_ACC = 10
const DEF_HAND = 4.0
const PASS_V = 8.5
const BODY = 0.7
const USES_SCREEN = 1.5
const SHOT_GATHER = 0.5 // dalla ricezione (o dall'arresto) al tiro

export type State = { off: Vec[]; def: Vec[]; holder: number; assign: number[]; presser: number }
export type Frame = { off: Vec[]; def: Vec[]; ball: Vec; bz: number; holder: number }

type MoveAction = Extract<Action, { type: MoveKind }>
type PassAction = Extract<Action, { type: 'pass' }>

export type Motion = { action: MoveAction; i: number; kind: MoveKind; line: Line; prof: ReturnType<typeof profile>; t0: number }
export type PassTiming = {
  action: PassAction
  a: number
  b: number
  rel: number
  catch: number
  p0: Vec
  p1: Vec
  /** Consegnato: quando il passatore è pronto e dove il ricevitore gli passa accanto. */
  hand?: { ready: number; s: number }
}
export type ShotTiming = { i: number; rel: number; land: number; p0: Vec }
export type ScreenTiming = { action: MoveAction; j: number; spot: Vec; tSet: number; users: { u: number; tPass: number }[]; coverage: Coverage }

export type Plan = {
  moves: (Motion | null)[]
  passes: PassTiming[]
  shot: ShotTiming | null
  screens: ScreenTiming[]
  dur: number
  offAt: (i: number, t: number) => Vec
  ballAt: (t: number) => { p: Vec; z: number; holder: number }
}

export type PhaseRun = { phase: Phase; read: number; plan: Plan; frames: Frame[]; start: State; end: State }

const motionEnd = (m: Motion | null) => (m ? m.t0 + m.prof.dur : 0)

/**
 * Se chi si muove lungo `line` usa il blocco, restituisce il punto (lunghezza d'arco)
 * in cui supera il bloccante: dove attraversa l'asse del bloccante (la direzione da cui
 * è arrivato), altrimenti dove gli passa più vicino a metà percorso. Chi parte accanto
 * al punto del blocco (il blocco viene a lui) lo usa dall'inizio.
 */
function screenUse(line: Line, screen: Motion): number | null {
  const spot = screen.line.end
  const c = line.closest(spot)
  if (c.d > USES_SCREEN) return null
  const ax = screen.line.length > 0.5 ? screen.line.endDir() : unit(sub(spot, BASKET))
  const side = (p: Vec) => ax.x * (p.y - spot.y) - ax.y * (p.x - spot.x)
  for (let i = 1; i < line.pts.length; i++) {
    const a = line.pts[i - 1]
    const b = line.pts[i]
    const sa = side(a)
    const sb = side(b)
    if (sa === 0 || Math.sign(sa) === Math.sign(sb)) continue
    const k = sa / (sa - sb)
    if (dist(lerp(a, b, k), spot) > 2.2) continue
    return line.cum[i - 1] + (line.cum[i] - line.cum[i - 1]) * k
  }
  if (c.s > 0.3 && c.s < line.length - 0.3) return c.s
  return dist(line.start, spot) < 1.2 ? 0 : null
}

export function plan(st: State, phase: Phase, read: Read | undefined, defaultCoverage: Coverage): Plan {
  const passActs = phase.actions.filter((a): a is PassAction => a.type === 'pass')
  const shotAct = phase.actions.find((a) => a.type === 'shot')
  const passers = new Set(passActs.map((a) => a.from - 1))

  // Chi rimette da fuori campo non entra finché non ha passato la palla.
  const inbounder = st.holder >= 0 && outOfBounds(st.off[st.holder]) ? st.holder : -1

  const moves: (Motion | null)[] = [null, null, null, null, null]
  for (const a of phase.actions) {
    if (a.type !== 'move' && a.type !== 'dribble' && a.type !== 'screen') continue
    const i = a.slot - 1
    if (i === inbounder && !passers.has(i)) continue
    // Chi ha la palla e si muove senza passarla sta palleggiando.
    const kind: MoveKind = a.type === 'move' && i === st.holder && !passers.has(i) ? 'dribble' : a.type
    const line = new Line(smooth([st.off[i], ...a.path]))
    moves[i] = { action: a, i, kind, line, prof: profile(line.length, SPEED[kind], ACC), t0: 0 }
  }

  const offAt = (i: number, t: number): Vec => {
    const m = moves[i]
    return m ? m.line.at(m.prof.at(t - m.t0)) : st.off[i]
  }

  let passes: PassTiming[] = []
  let screens: ScreenTiming[] = []

  // I tempi dipendono gli uni dagli altri (chi taglia aspetta il blocco, chi passa
  // aspetta che il compagno arrivi): pochi giri bastano a stabilizzarli.
  for (let iter = 0; iter < 5; iter++) {
    passes = []
    let h = st.holder
    let have = 0
    for (const a of passActs) {
      const A = a.from - 1
      const B = a.to - 1
      if (A !== h || A === B) continue
      const mA = moves[A]
      const ready = mA && mA.kind === 'dribble' ? Math.max(have, motionEnd(mA)) : have
      const mB = moves[B]

      if (a.hand && mB) {
        // Consegnato: la palla passa di mano quando il compagno arriva accanto al passatore.
        const c = mB.line.closest(offAt(A, ready))
        if (c.d < 1.6) {
          const tx = Math.max(ready, mB.t0 + mB.prof.timeAt(c.s))
          passes.push({ action: a, a: A, b: B, rel: tx, catch: tx + 0.1, p0: offAt(A, tx), p1: offAt(B, tx + 0.1), hand: { ready, s: c.s } })
          h = B
          have = tx + 0.1
          continue
        }
      }

      // Si aspetta il ricevitore solo se si muove per smarcarsi. Se si muove dopo
      // aver ricevuto (palleggio, o un altro passaggio prima di tagliare) riceve da fermo.
      // Su un taglio la palla lo anticipa: la riceve in corsa, a un metro dall'arrivo.
      const passesLater = passActs.slice(passActs.indexOf(a) + 1).some((p) => p.from - 1 === B)
      let arrive = 0
      if (mB && mB.kind !== 'dribble' && !passesLater) {
        const L = mB.line.length
        arrive = mB.kind === 'move' ? mB.t0 + mB.prof.timeAt(L - Math.min(1, 0.3 * L)) : motionEnd(mB)
      }
      let rel = ready
      let cat = ready
      for (let k = 0; k < 3; k++) {
        const flight = dist(offAt(A, rel), offAt(B, cat)) / PASS_V
        rel = Math.max(ready, arrive - flight)
        cat = rel + flight
      }
      passes.push({ action: a, a: A, b: B, rel, catch: cat, p0: offAt(A, rel), p1: offAt(B, cat) })
      h = B
      have = cat
    }

    screens = []
    for (const m of moves) {
      if (!m || m.kind !== 'screen') continue
      const spot = m.line.end
      const users: { u: number; tPass: number }[] = []
      for (const n of moves) {
        // Chi va a bloccare a sua volta non sta usando questo blocco.
        if (!n || n.i === m.i || n.kind === 'screen') continue
        const s = screenUse(n.line, m)
        if (s !== null) users.push({ u: n.i, tPass: n.t0 + n.prof.timeAt(s) })
      }
      screens.push({
        action: m.action,
        j: m.i,
        spot,
        tSet: motionEnd(m),
        users,
        coverage: read?.coverage[m.action.id] ?? defaultCoverage,
      })
    }

    for (const m of moves) {
      if (!m) continue
      let t0 = 0
      const myPass = passes.find((p) => p.a === m.i)
      if (myPass && m.kind !== 'dribble') t0 = myPass.rel + 0.15
      const got = passes.find((p) => p.b === m.i)
      if (got && !got.hand && m.kind === 'dribble') t0 = Math.max(t0, got.catch + 0.1)
      // Nel consegnato chi riceve arriva accanto al passatore quando questo è pronto.
      if (got?.hand) t0 = Math.max(t0, got.hand.ready + 0.05 - m.prof.timeAt(got.hand.s))
      for (const s of screens) {
        if (s.j === m.i || m.kind === 'screen') continue
        const at = screenUse(m.line, moves[s.j]!)
        if (at !== null) t0 = Math.max(t0, s.tSet - m.prof.timeAt(at) + 0.15)
      }
      // ponytail: tetto di sicurezza per catene di attese senza senso (A aspetta B che aspetta A);
      // uno schema vero non ha partenze dopo 20 s nella stessa fase.
      m.t0 = Math.min(t0, 20)
    }
  }

  let lastHolder = st.holder
  let lastCatch = 0
  for (const p of passes) {
    lastHolder = p.b
    lastCatch = p.catch
  }

  let shot: ShotTiming | null = null
  if (shotAct && shotAct.type === 'shot' && shotAct.slot - 1 === lastHolder) {
    const i = lastHolder
    const got = passes.length && passes[passes.length - 1].b === i ? lastCatch : 0
    const rel = Math.max(got, motionEnd(moves[i])) + SHOT_GATHER
    shot = { i, rel, land: rel + 1.0, p0: offAt(i, rel) }
  }

  let dur = Math.max(lastCatch, shot ? shot.land + 0.3 : 0, ...moves.map(motionEnd))
  dur = Math.max(1.2, dur + 0.6)

  const ballAt = (t: number) => {
    if (st.holder < 0) return { p: BASKET, z: 0.15, holder: -1 }
    let holder = st.holder
    for (const p of passes) {
      if (t < p.rel) break
      if (t < p.catch) {
        const u = (t - p.rel) / (p.catch - p.rel)
        const arc = 0.2 + 0.035 * dist(p.p0, p.p1)
        return { p: lerp(p.p0, p.p1, u), z: 1.15 + 4 * arc * u * (1 - u), holder: -1 }
      }
      holder = p.b
    }
    if (shot && t >= shot.rel) {
      const u = Math.min(1, (t - shot.rel) / (shot.land - shot.rel))
      if (t <= shot.land) return { p: lerp(shot.p0, BASKET, u), z: 2.2 + 0.85 * u + 4 * 1.3 * u * (1 - u), holder: -1 }
      return { p: BASKET, z: Math.max(0.15, 3.05 - 9 * (t - shot.land) ** 2), holder: -1 }
    }
    const m = moves[holder]
    // Chi riceve un consegnato prosegue palleggiando.
    const fromHand = passes.some((p) => p.hand && p.b === holder && t >= p.catch)
    const dribbling = m && (m.kind === 'dribble' || fromHand) && t >= m.t0 && t <= motionEnd(m)
    const z = dribbling ? 0.12 + 0.85 * Math.abs(Math.cos((Math.PI * (t - m!.t0)) / 0.5)) : 1.0
    return { p: offAt(holder, t), z, holder }
  }

  return { moves, passes, shot, screens, dur, offAt, ballAt }
}

const crosses = (from: Vec, to: Vec, body: Vec) => dist(from, to) > 0.3 && segDist(body, from, to) < 0.7

function separate(def: Vec[], others: Vec[], fixed: boolean[]) {
  for (let pass = 0; pass < 3; pass++) {
    for (let d = 0; d < def.length; d++) {
      if (fixed[d]) continue
      const bodies = def.filter((_, e) => e !== d).concat(others)
      for (const b of bodies) {
        const gap = dist(def[d], b)
        if (gap >= BODY) continue
        const dir = gap > 1e-6 ? unit(sub(def[d], b)) : unit(sub(BASKET, b))
        def[d] = add(b, mul(dir, BODY))
      }
    }
  }
}

function defenseTargets(type: DefenseType, scene: Scene, assign: number[], presser: number) {
  if (isZone(type)) return zoneSpots(type, scene, presser)
  return { at: assign.map((m) => manSpot(scene.off[m], scene, m === scene.holder)), presser: -1 }
}

export function initState(data: PlayData, defense: DefenseType = data.defense): State {
  const off = data.start.offense.map((p) => ({ ...p }))
  const holder = data.start.ball - 1
  const assign = [0, 1, 2, 3, 4]
  const { at, presser } = defenseTargets(defense, { off, ball: off[holder], holder }, assign, -1)
  separate(at, off, [false, false, false, false, false])
  return { off, def: at, holder, assign, presser }
}

export function simulate(st: State, read: Read | undefined, pl: Plan, defense: DefenseType, useManual: boolean) {
  const def = st.def.map((p) => ({ ...p }))
  const vel = def.map(() => ({ x: 0, y: 0 }))
  const assign = st.assign.slice()
  let presser = st.presser
  let helper = -1
  const zone = isZone(defense)

  const manual = def.map((p, d) => {
    const path = useManual ? read?.defense[String(d)] : undefined
    if (!path?.length) return null
    const line = new Line(smooth([p, ...path]))
    return { line, prof: profile(line.length, DEF_HAND, 8) }
  })
  const fixed = manual.map((m) => m !== null)

  const swaps = zone
    ? []
    : pl.screens.filter((s) => s.coverage === 'cambio').flatMap((s) => s.users.map((us) => ({ t: us.tPass, u: us.u, j: s.j, done: false })))

  const frames: Frame[] = []
  const n = Math.ceil(pl.dur / DT)
  for (let k = 0; k <= n; k++) {
    const t = k * DT
    const off = [0, 1, 2, 3, 4].map((i) => pl.offAt(i, t))

    for (const sw of swaps) {
      if (sw.done || t < sw.t) continue
      sw.done = true
      const dU = assign.indexOf(sw.u)
      const dS = assign.indexOf(sw.j)
      if (dU >= 0 && dS >= 0 && !fixed[dU] && !fixed[dS]) [assign[dU], assign[dS]] = [assign[dS], assign[dU]]
    }

    if (k > 0) {
      const tl = Math.max(0, t - LAG)
      const offL = [0, 1, 2, 3, 4].map((i) => pl.offAt(i, tl))
      const bl = pl.ballAt(tl)
      const scene: Scene = { off: offL, ball: bl.p, holder: bl.holder }
      const tg = defenseTargets(defense, scene, assign, presser)
      const targets = tg.at
      presser = tg.presser
      const slow = [1, 1, 1, 1, 1]

      if (!zone) {
        const ballDef = bl.holder >= 0 ? assign.indexOf(bl.holder) : -1
        const hm = bl.holder >= 0 ? pl.moves[bl.holder] : null
        const driving = !!hm && hm.kind === 'dribble' && tl > hm.t0 && tl < motionEnd(hm)

        // Pericolo vicino al canestro: chi penetra palleggiando, oppure chi taglia
        // (o rolla) verso il ferro avendo battuto il suo difensore.
        let threat: { at: Vec; who: number; ball: boolean } | null = null
        const drive = driveHelpSpot(scene, ballDef >= 0 ? def[ballDef] : null, driving)
        if (drive) threat = { at: drive, who: bl.holder, ball: true }
        else {
          for (let a = 0; a < 5; a++) {
            if (a === bl.holder) continue
            const da = assign.indexOf(a)
            const ra = dist(offL[a], BASKET)
            if (ra > 3.2 || da < 0 || dist(def[da], BASKET) < ra + 0.4) continue
            if (!threat || ra < dist(threat.at, BASKET))
              threat = { at: add(offL[a], mul(unit(sub(BASKET, offL[a])), 0.9)), who: a, ball: false }
          }
        }

        if (threat) {
          // Aiuta chi è sul lato debole ed è più vicino al canestro; si cambia aiuto
          // solo se un altro è più vicino di almeno un metro, per non saltellare.
          const free = (d: number) => !fixed[d] && d !== ballDef && assign[d] !== threat!.who
          const weak = (d: number) => free(d) && weakSide(offL[assign[d]], bl.p)
          let best = -1
          for (let d = 0; d < 5; d++) if (weak(d) && (best < 0 || dist(def[d], BASKET) < dist(def[best], BASKET))) best = d
          // Senza lato debole (palla al centro) aiuta il più vicino tra chi non è a un passaggio.
          if (best < 0)
            for (let d = 0; d < 5; d++)
              if (free(d) && !onePassAway(offL[assign[d]], bl.p) && (best < 0 || dist(def[d], threat.at) < dist(def[best], threat.at))) best = d
          if (helper < 0 || !free(helper) || (best >= 0 && dist(def[best], BASKET) < dist(def[helper], BASKET) - 1)) helper = best
          if (helper >= 0) targets[helper] = threat.at
          // Sulla penetrazione chi è a un passaggio finge l'aiuto senza lasciare il suo uomo.
          if (threat.ball)
            for (let d = 0; d < 5; d++)
              if (d !== helper && free(d) && onePassAway(offL[assign[d]], bl.p)) targets[d] = lerp(targets[d], threat.at, 0.35)
        } else helper = -1

        for (const s of pl.screens) {
          for (const us of s.users) {
            if (t < s.tSet - 0.4 || t > us.tPass + 1.2) continue
            const scr = off[s.j]
            const dU = assign.indexOf(us.u)
            const dS = assign.indexOf(s.j)
            const onBall = us.u === bl.holder
            const near = t <= us.tPass + 0.7
            if (s.coverage === 'sotto') {
              if (dU >= 0 && near) {
                if (onBall || t < us.tPass) {
                  if (crosses(def[dU], targets[dU], scr)) targets[dU] = add(scr, mul(unit(sub(BASKET, scr)), 1.6))
                } else {
                  // Lontano dalla palla chi passa sotto anticipa il tagliante sul punto d'arrivo.
                  const there = pl.offAt(us.u, us.tPass + 0.8)
                  targets[dU] = add(there, mul(unit(sub(BASKET, there)), 1.0))
                }
              }
              if (dS >= 0 && near) targets[dS] = add(targets[dS], mul(unit(sub(BASKET, scr)), 0.9))
            } else if (s.coverage === 'sopra') {
              if (dU >= 0 && near) {
                if (onBall) {
                  if (crosses(def[dU], targets[dU], scr)) targets[dU] = add(scr, mul(unit(sub(off[us.u], scr)), 0.75))
                } else targets[dU] = pl.offAt(us.u, Math.max(0, tl - 0.3)) // insegue il tagliante, un passo dietro
                if (t >= us.tPass && t < us.tPass + 0.4 && dist(def[dU], scr) < 1.1) slow[dU] = 0.6
              }
              // Sul blocco sulla palla il difensore del bloccante esce sulla strada
              // del palleggiatore per contenerlo, e resta finché il compagno non è rientrato.
              if (dS >= 0 && onBall && dU >= 0 && dist(def[dU], BASKET) > dist(bl.p, BASKET) - 0.3) {
                const ahead = pl.offAt(us.u, us.tPass + 0.6)
                targets[dS] = add(scr, add(mul(unit(sub(ahead, scr)), 1.0), mul(unit(sub(BASKET, scr)), 0.2)))
              }
            }
          }
        }
      }

      // Dopo il tiro tutti tagliafuori: a uomo sul proprio, a zona sull'attaccante più vicino.
      if (pl.shot && t >= pl.shot.rel + 0.2) {
        for (let d = 0; d < 5; d++) {
          if (fixed[d]) continue
          let a = assign[d]
          if (zone) a = offL.reduce((best, q, i) => (dist(q, def[d]) < dist(offL[best], def[d]) ? i : best), 0)
          targets[d] = boxOut(offL[a])
        }
      }

      for (let d = 0; d < 5; d++) {
        const m = manual[d]
        if (m) {
          def[d] = m.line.at(m.prof.at(t))
          continue
        }
        const to = sub(targets[d], def[d])
        const want = mul(unit(to), Math.min(DEF_MAX * slow[d], len2(to) / 0.3))
        let dv = sub(want, vel[d])
        const dvl = Math.hypot(dv.x, dv.y)
        if (dvl > DEF_ACC * DT) dv = mul(dv, (DEF_ACC * DT) / dvl)
        vel[d] = add(vel[d], dv)
        def[d] = add(def[d], mul(vel[d], DT))
      }
      separate(def, off, fixed)
      // Spinti dai compagni restano comunque in campo (un piede fuori al massimo).
      for (let d = 0; d < 5; d++) if (!fixed[d]) def[d] = { x: clamp(def[d].x, -0.2, 15.2), y: clamp(def[d].y, 0, 17) }
    }

    const b = pl.ballAt(t)
    frames.push({ off, def: def.map((p) => ({ ...p })), ball: b.p, bz: b.z, holder: b.holder })
  }

  const last = frames[frames.length - 1]
  const end: State = { off: last.off, def: last.def, holder: pl.shot ? -1 : last.holder, assign, presser }
  return { frames, end }
}

const len2 = (v: Vec) => Math.hypot(v.x, v.y)

/** Tutte le fasi lungo un ramo dell'albero; `choices[k]` è la lettura scelta alla fase k. */
export function runPath(data: PlayData, choices: number[], defense: DefenseType = data.defense): PhaseRun[] {
  let st = initState(data, defense)
  const useManual = defense === data.defense
  const runs: PhaseRun[] = []
  let ph = data.root
  for (let depth = 0; ph && depth < 40; depth++) {
    const r = clamp(choices[depth] ?? 0, 0, ph.reads.length - 1)
    const read = ph.reads[r]
    const pl = plan(st, ph, read, data.coverage)
    const { frames, end } = simulate(st, read, pl, defense, useManual)
    runs.push({ phase: ph, read: r, plan: pl, frames, start: st, end })
    st = end
    ph = read.next
  }
  return runs
}

/** Fotogramma al tempo t, interpolato fra i due calcolati. */
export function frameAt(run: PhaseRun, t: number): Frame {
  const f = run.frames
  const x = clamp(t / DT, 0, f.length - 1)
  const k = Math.floor(x)
  const a = f[k]
  const b = f[Math.min(k + 1, f.length - 1)]
  const u = x - k
  if (u < 1e-6) return a
  return {
    off: a.off.map((p, i) => lerp(p, b.off[i], u)),
    def: a.def.map((p, i) => lerp(p, b.def[i], u)),
    ball: lerp(a.ball, b.ball, u),
    bz: a.bz + (b.bz - a.bz) * u,
    holder: u < 0.5 ? a.holder : b.holder,
  }
}

/** Fotogramma fermo da uno stato (partenza o fine fase). */
export function stateFrame(st: State): Frame {
  const ball = st.holder >= 0 ? st.off[st.holder] : BASKET
  return { off: st.off, def: st.def, ball, bz: st.holder >= 0 ? 1 : 0.15, holder: st.holder }
}
