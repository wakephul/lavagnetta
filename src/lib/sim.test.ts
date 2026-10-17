import { describe, expect, it } from 'vitest'
import { BASKET, defaultStart } from './court'
import { zoneShell } from './defense'
import { dist } from './geo'
import { initState, runPath } from './sim'
import type { Action, Coverage, PlayData } from './types'

function play(actions: Action[][], coverage: Coverage = 'sopra', defense: PlayData['defense'] = 'man'): PlayData {
  let next = null
  for (let i = actions.length - 1; i >= 0; i--)
    next = { id: 'p' + i, actions: actions[i], reads: [{ id: 'r' + i, label: '', coverage: {}, defense: {}, next }] }
  return { v: 1, situation: 'half', defense, coverage, start: defaultStart('half'), notes: '', root: next }
}

describe('attacco', () => {
  it('la palla arriva al compagno e cambia chi la tiene', () => {
    const [run] = runPath(play([[{ id: 'a', type: 'pass', from: 1, to: 2 }]]), [])
    const p = run.plan.passes[0]
    expect(run.plan.ballAt(p.rel - 0.01).holder).toBe(0)
    expect(run.plan.ballAt(p.rel + 0.05).holder).toBe(-1)
    expect(dist(run.plan.ballAt(p.catch).p, run.end.off[1])).toBeLessThan(0.01)
    expect(run.end.holder).toBe(1)
  })

  it('chi passa e taglia parte dopo il passaggio', () => {
    const [run] = runPath(
      play([
        [
          { id: 'a', type: 'pass', from: 1, to: 2 },
          { id: 'b', type: 'move', slot: 1, path: [{ x: 7.5, y: 2.5 }] },
        ],
      ]),
      [],
    )
    expect(run.plan.moves[0]!.t0).toBeGreaterThan(run.plan.passes[0].rel)
  })

  it('chi riceve e poi palleggia riceve da fermo, senza ritardi', () => {
    const [run] = runPath(
      play([
        [
          { id: 'a', type: 'pass', from: 1, to: 2 },
          { id: 'b', type: 'dribble', slot: 2, path: [{ x: 8.2, y: 1.9 }] },
        ],
      ]),
      [],
    )
    const p = run.plan.passes[0]
    expect(p.rel).toBeLessThan(0.1)
    expect(dist(p.p1, run.start.off[1])).toBeLessThan(0.01)
    expect(run.plan.moves[1]!.t0).toBeGreaterThan(p.catch)
    expect(run.plan.dur).toBeLessThan(6)
  })

  it('chi usa il blocco aspetta che sia piazzato', () => {
    const [run] = runPath(
      play([
        [
          { id: 's', type: 'screen', slot: 4, path: [{ x: 3.6, y: 5.0 }] },
          { id: 'c', type: 'move', slot: 3, path: [{ x: 3.4, y: 6.4 }, { x: 5.5, y: 7.6 }] },
        ],
      ]),
      [],
    )
    const scr = run.plan.screens[0]
    expect(scr.users.map((u) => u.u)).toContain(2)
    expect(scr.users[0].tPass).toBeGreaterThanOrEqual(scr.tSet)
  })
})

describe('difesa', () => {
  it('a uomo, chi marca la palla sta tra palla e canestro', () => {
    const st = initState(play([]))
    const ball = st.off[st.holder]
    expect(dist(st.def[0], BASKET)).toBeLessThan(dist(ball, BASKET))
    expect(dist(st.def[0], ball)).toBeLessThan(1.3)
  })

  it('sul cambio i due difensori si scambiano gli uomini', () => {
    const blocco: Action[] = [
      { id: 's', type: 'screen', slot: 5, path: [{ x: 8.4, y: 7.6 }] },
      { id: 'd', type: 'dribble', slot: 1, path: [{ x: 9.6, y: 7.0 }, { x: 10.6, y: 4.6 }] },
    ]
    const [cambio] = runPath(play([blocco], 'cambio'), [])
    expect(cambio.end.assign[0]).toBe(4)
    expect(cambio.end.assign[4]).toBe(0)
    const [sopra] = runPath(play([blocco], 'sopra'), [])
    expect(sopra.end.assign).toEqual([0, 1, 2, 3, 4])
  })

  it('i difensori non si compenetrano con nessuno', () => {
    const runs = runPath(
      play([
        [
          { id: 's', type: 'screen', slot: 5, path: [{ x: 8.4, y: 7.6 }] },
          { id: 'd', type: 'dribble', slot: 1, path: [{ x: 8.7, y: 8.7 }, { x: 10.1, y: 7.2 }, { x: 10.4, y: 3.8 }] },
        ],
      ]),
      [],
    )
    for (const f of runs[0].frames)
      for (let d = 0; d < 5; d++) {
        for (const o of f.off) expect(dist(f.def[d], o)).toBeGreaterThan(0.68)
      }
  })

  it('la zona si sposta in modo simmetrico', () => {
    const left = zoneShell('zone23', { x: 3, y: 6.4 })
    const right = zoneShell('zone23', { x: 12, y: 6.4 })
    const swap = [1, 0, 3, 2, 4]
    left.forEach((p, i) => {
      expect(Math.abs(15 - p.x - right[swap[i]].x)).toBeLessThan(1e-6)
      expect(Math.abs(p.y - right[swap[i]].y)).toBeLessThan(1e-6)
    })
  })

  it('stessi dati, stessa simulazione', () => {
    const data = play([[{ id: 'a', type: 'pass', from: 1, to: 3 }]], 'sopra', 'zone32')
    expect(JSON.stringify(runPath(data, []))).toBe(JSON.stringify(runPath(data, [])))
  })
})
