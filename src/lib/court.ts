import type { Vec } from './geo'
import type { Situation } from './types'

// Misure FIBA in metri. x va da una linea laterale all'altra (0-15),
// y parte dalla linea di fondo (0) e arriva a metà campo (14).
export const W = 15
export const HALF = 14
export const BASKET: Vec = { x: 7.5, y: 1.575 }
export const RIM_R = 0.225
export const BOARD_Y = 1.2
export const LANE_HALF = 2.45
export const FT_Y = 5.8
export const FT_R = 1.8
export const THREE_R = 6.75
export const THREE_SIDE = 0.9
/** Dove l'arco da tre incontra i tratti dritti vicino al fondo. */
export const THREE_Y = BASKET.y + Math.sqrt(THREE_R ** 2 - (BASKET.x - THREE_SIDE) ** 2)
export const NO_CHARGE_R = 1.25

/** Fuori dal rettangolo di gioco (chi rimette). */
export const outOfBounds = (v: Vec) => v.x < 0 || v.x > W || v.y < 0

export type View = { x: number; y: number; w: number; h: number }

export function viewFor(s: Situation): View {
  return s === 'slob' ? { x: -1.6, y: -1.3, w: W + 3.2, h: 18.8 } : { x: -1.0, y: -1.3, w: W + 2, h: 15.8 }
}

/** Disposizioni di partenza proposte quando si crea uno schema. */
export function defaultStart(s: Situation): { offense: Vec[]; ball: 1 | 2 | 3 | 4 | 5 } {
  if (s === 'blob')
    return {
      offense: [
        { x: 9.6, y: 6.8 },
        { x: 9.9, y: 2.4 },
        { x: 4.6, y: -0.6 },
        { x: 5.1, y: 5.8 },
        { x: 5.1, y: 2.4 },
      ],
      ball: 3,
    }
  if (s === 'slob')
    return {
      offense: [
        { x: 7.5, y: 10.5 },
        { x: -0.6, y: 8.2 },
        { x: 3.2, y: 4.2 },
        { x: 9.9, y: 5.8 },
        { x: 5.1, y: 5.8 },
      ],
      ball: 2,
    }
  return {
    offense: [
      { x: 7.5, y: 8.4 },
      { x: 12.9, y: 5.9 },
      { x: 2.1, y: 5.9 },
      { x: 5.1, y: 5.8 },
      { x: 9.9, y: 2.3 },
    ],
    ball: 1,
  }
}

export type CourtShape = { d: string; fill?: 'floor' | 'paint' | 'out'; stroke?: 'line' | 'ink' | 'rim'; width?: number; dash?: number[] }

/** Le linee del campo come tracciati SVG: le usano sia la lavagna 2D sia il campo 3D. */
export function courtShapes(s: Situation): CourtShape[] {
  const v = viewFor(s)
  const deep = Math.min(v.y + v.h, 28)
  const lx = W / 2 - LANE_HALF
  const rx = W / 2 + LANE_HALF
  const b = BASKET
  const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}Z`
  const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
  return [
    { d: rect(v.x, v.y, v.w, v.h), fill: 'out' },
    { d: rect(0, 0, W, deep), fill: 'floor' },
    { d: rect(lx, 0, rx - lx, FT_Y), fill: 'paint' },
    { d: `M0 ${deep}V0H${W}V${deep}`, stroke: 'line' },
    { d: `M0 ${HALF}H${W}`, stroke: 'line' },
    { d: circle(W / 2, HALF, FT_R), stroke: 'line' },
    { d: rect(lx, 0, rx - lx, FT_Y), stroke: 'line' },
    { d: `M${W / 2 - FT_R} ${FT_Y}A${FT_R} ${FT_R} 0 0 0 ${W / 2 + FT_R} ${FT_Y}`, stroke: 'line' },
    { d: `M${W / 2 - FT_R} ${FT_Y}A${FT_R} ${FT_R} 0 0 1 ${W / 2 + FT_R} ${FT_Y}`, stroke: 'line', dash: [0.3, 0.25] },
    { d: `M${THREE_SIDE} 0V${THREE_Y}A${THREE_R} ${THREE_R} 0 0 0 ${W - THREE_SIDE} ${THREE_Y}V0`, stroke: 'line' },
    { d: `M${b.x - NO_CHARGE_R} ${BOARD_Y}V${b.y}A${NO_CHARGE_R} ${NO_CHARGE_R} 0 0 0 ${b.x + NO_CHARGE_R} ${b.y}V${BOARD_Y}`, stroke: 'line' },
    { d: `M${b.x - 0.9} ${BOARD_Y}H${b.x + 0.9}`, stroke: 'ink', width: 0.07 },
    { d: `M${b.x} ${BOARD_Y}V${b.y - RIM_R}`, stroke: 'rim' },
    { d: circle(b.x, b.y, RIM_R), stroke: 'rim', width: 0.06 },
  ]
}
