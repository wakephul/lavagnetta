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

describe('colori', async () => {
  const { inkOn } = await import('./color')
  it('scrive in bianco sui colori scuri e in nero su quelli chiari', () => {
    expect(inkOn('#1d5fbf')).toBe('#fff')
    expect(inkOn('#000000')).toBe('#fff')
    expect(inkOn('#ffd200')).toBe('#1f1d1a')
    expect(inkOn('#ffffff')).toBe('#1f1d1a')
  })
})

describe('ribaltare', async () => {
  const { mirrored } = await import('./play')
  it('ribaltato due volte torna uguale, e la difesa si specchia', () => {
    const data = play([[{ id: 'a', type: 'pass', from: 1, to: 2 }, { id: 'b', type: 'move', slot: 3, path: [{ x: 4, y: 2 }] }]])
    expect(mirrored(mirrored(data))).toEqual(data)
    // Partenza simmetrica: dall'altro lato il 3 fa il 2 e il 5 fa il 4, con i loro difensori.
    const roles = [0, 2, 1, 4, 3]
    const a = runPath(data, [])[0].end
    const b = runPath(mirrored(data), [])[0].end
    a.def.forEach((p, i) => expect(Math.abs(15 - p.x - b.def[roles[i]].x) + Math.abs(p.y - b.def[roles[i]].y)).toBeLessThan(0.05))
    a.off.forEach((p, i) => expect(Math.abs(15 - p.x - b.off[roles[i]].x)).toBeLessThan(0.01))
    expect(mirrored(data).root!.actions[0]).toMatchObject({ type: 'pass', from: 1, to: 3 })
  })
})

describe('come se lo aspetta un allenatore', () => {
  const pass = (from: number, to: number, hand = false): Action => ({ id: `p${from}${to}`, type: 'pass', from: from as 1, to: to as 1, hand })
  const mv = (id: string, type: 'move' | 'dribble' | 'screen', slot: number, ...pts: [number, number][]): Action => ({
    id,
    type,
    slot: slot as 1,
    path: pts.map(([x, y]) => ({ x, y })),
  })
  const end = (m: { t0: number; prof: { dur: number } } | null) => (m ? m.t0 + m.prof.dur : 0)

  it('sulla penetrazione aiuta il lato debole', () => {
    const runs = runPath(play([[pass(1, 2)], [mv('d', 'dribble', 2, [10.6, 3.6], [8.9, 2.2])]]), [])
    const helped = runs[1].frames.some((f) => dist(f.ball, BASKET) < 3 && [2, 3].some((d) => dist(f.def[d], f.ball) < 1.6))
    expect(helped).toBe(true)
  })

  it('chi sta al centro del campo viene negato, non lasciato', () => {
    const [run] = runPath(play([[pass(1, 2)]]), [])
    expect(dist(run.end.def[0], run.end.off[0])).toBeLessThan(1.7)
  })

  it('lontano dalla palla "sopra" e "sotto" sono due difese diverse', () => {
    const data = play([[mv('s', 'screen', 4, [4.2, 3.4]), mv('c', 'move', 3, [3.4, 3.0], [2.2, 5.9])]])
    data.start.offense[2] = { x: 4.6, y: 1.6 }
    const at = (cov: Coverage) => {
      const [run] = runPath({ ...data, coverage: cov }, [])
      const us = run.plan.screens[0].users.find((u) => u.u === 2)!
      return run.frames[Math.round((us.tPass + 0.8) / (1 / 30))].def[2]
    }
    expect(dist(at('sopra'), at('sotto'))).toBeGreaterThan(0.6)
  })

  it('chi va a bloccare non usa il blocco del compagno', () => {
    const [run] = runPath(play([[mv('a', 'screen', 4, [4.0, 4.0]), mv('b', 'screen', 5, [5.0, 3.2], [3.6, 2.4])]]), [])
    expect(run.plan.screens.flatMap((s) => s.users.map((u) => u.u))).not.toContain(4)
  })

  it('nel consegnato la palla passa di mano, senza volare', () => {
    const [run] = runPath(
      play([[mv('d', 'dribble', 1, [10.4, 7.8]), mv('c', 'move', 2, [11.2, 7.2], [9.6, 8.6]), pass(1, 2, true)]]),
      [],
    )
    const p = run.plan.passes[0]
    expect(p.hand).toBeDefined()
    expect(dist(p.p0, p.p1)).toBeLessThan(1.2)
    expect(p.rel).toBeGreaterThanOrEqual(end(run.plan.moves[0]) - 0.01)
    expect(run.plan.ballAt(p.catch + 0.3).z).not.toBe(1)
  })

  it('un consegnato a chi palleggia già non fa crescere i tempi a ogni giro', () => {
    const [run] = runPath(play([[mv('d', 'dribble', 1, [10.4, 7.8]), mv('c', 'dribble', 2, [11.2, 7.2], [9.6, 8.6]), pass(1, 2, true)]]), [])
    expect(run.plan.dur).toBeLessThan(8)
  })

  it('sul taglio la palla anticipa chi riceve, che la prende in corsa', () => {
    const [run] = runPath(play([[mv('b', 'move', 2, [11.5, 4.0], [9.0, 2.0]), pass(1, 2)]]), [])
    expect(run.plan.passes[0].catch).toBeLessThan(end(run.plan.moves[1]) - 0.1)
  })

  it('chi rimette non entra in campo prima di aver passato', () => {
    const data = play([[mv('m', 'move', 3, [4.6, 1.0])]])
    data.situation = 'blob'
    data.start = defaultStart('blob')
    const [run] = runPath(data, [])
    expect(run.plan.moves[2]).toBeNull()
    expect(run.end.off[2]).toEqual(data.start.offense[2])
  })

  it('sulla rimessa da fondo si negano i passaggi vicini', () => {
    const data = play([])
    data.start = defaultStart('blob')
    const st = initState(data)
    expect(dist(st.def[1], st.off[1])).toBeLessThan(1.6)
  })

  it('dopo il tiro si tagliafuori', () => {
    const [run] = runPath(play([[{ id: 't', type: 'shot', slot: 1 }]]), [])
    for (let d = 0; d < 5; d++) expect(dist(run.end.def[d], BASKET)).toBeLessThan(dist(run.end.off[run.end.assign[d]], BASKET))
  })
})
