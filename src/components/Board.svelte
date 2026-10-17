<script lang="ts">
  import type { Snippet } from 'svelte'
  import { BASKET, viewFor } from '../lib/court'
  import type { Mark } from '../lib/draw'
  import { dist, type Vec } from '../lib/geo'
  import type { Frame } from '../lib/sim'
  import type { Situation } from '../lib/types'
  import Court from './Court.svelte'

  type Props = {
    situation: Situation
    color: string
    frame: Frame
    marks?: Mark[]
    defLines?: { d: string; head: string }[]
    trails?: string[]
    names?: (string | null)[]
    me?: number | null
    showDefense?: boolean
    selected?: string | null
    picked?: { side: 'off' | 'def'; i: number } | null
    draft?: string | null
    fade?: number
    label?: string
    overlay?: Snippet
    ondown?: (p: Vec, e: PointerEvent) => void
    onmove?: (p: Vec, e: PointerEvent) => void
    onup?: (p: Vec, e: PointerEvent) => void
  }

  let {
    situation,
    color,
    frame,
    marks = [],
    defLines = [],
    trails = [],
    names = [],
    me = null,
    showDefense = true,
    selected = null,
    picked = null,
    draft = null,
    fade = 1,
    label = '',
    overlay,
    ondown,
    onmove,
    onup,
  }: Props = $props()

  const OFF_R = 0.45
  const DEF_R = 0.41

  let svg: SVGSVGElement
  const view = $derived(viewFor(situation))

  function toCourt(e: PointerEvent): Vec {
    const m = svg.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  function down(e: PointerEvent) {
    if (!ondown) return
    try {
      svg.setPointerCapture(e.pointerId)
    } catch {
      // Alcuni browser rifiutano la cattura per puntatori già rilasciati.
    }
    ondown(toCourt(e), e)
  }

  const ballDraw = $derived.by(() => {
    const k = frame.holder >= 0 ? 1 : Math.min(1, dist(frame.ball, BASKET) / 1.5)
    const z = frame.bz
    return {
      x: frame.ball.x + 0.42 * k,
      y: frame.ball.y + 0.36 * k,
      r: 0.19 * (1 + 0.1 * Math.max(0, z - 1)),
      shadow: z > 1.35 ? Math.min(0.5, (z - 1.2) * 0.25) : 0,
    }
  })

  const facing = (p: Vec) => (Math.atan2(frame.ball.y - p.y, frame.ball.x - p.x) * 180) / Math.PI
  const markColor = (who: number) => (me === null ? 'var(--ink)' : who === me ? color : 'var(--muted-ink)')
</script>

<svg
  bind:this={svg}
  viewBox="{view.x} {view.y} {view.w} {view.h}"
  class="board"
  class:interactive={!!ondown}
  role="img"
  aria-label={label}
  onpointerdown={down}
  onpointermove={(e) => onmove?.(toCourt(e), e)}
  onpointerup={(e) => onup?.(toCourt(e), e)}
  onpointercancel={(e) => onup?.(toCourt(e), e)}
>
  <Court {situation} {color} />

  {#each trails as d}
    <path {d} fill="none" stroke="var(--def)" stroke-opacity="0.35" stroke-width="0.05" stroke-dasharray="0.08 0.14" />
  {/each}

  <g class="marks" opacity={fade}>
    {#each marks as m (m.id)}
      {@const c = markColor(m.who)}
      {@const w = me !== null && m.who === me ? 0.11 : 0.075}
      <g class:sel={selected === m.id}>
        {#if selected === m.id}
          <path d={m.d} fill="none" stroke={color} stroke-opacity="0.28" stroke-width="0.42" stroke-linecap="round" stroke-linejoin="round" />
        {/if}
        <path
          d={m.d}
          fill="none"
          stroke={c}
          stroke-width={w}
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-dasharray={m.kind === 'pass' ? '0.28 0.2' : m.kind === 'shot' ? '0.05 0.16' : undefined}
        />
        {#if m.head}<path d={m.head} fill={c} />{/if}
        {#if m.ring}
          <circle cx={m.ring.x} cy={m.ring.y} r="0.42" fill="none" stroke={c} stroke-width={w} stroke-dasharray="0.05 0.13" stroke-linecap="round" />
        {/if}
        {#if m.bar}
          <line x1={m.bar[0].x} y1={m.bar[0].y} x2={m.bar[1].x} y2={m.bar[1].y} stroke={c} stroke-width={w * 1.9} stroke-linecap="round" />
        {/if}
      </g>
    {/each}
  </g>

  {#if showDefense}
    {#each defLines as l}
      <path d={l.d} fill="none" stroke="var(--def-line)" stroke-width="0.06" stroke-linecap="round" />
      <path d={l.head} fill="var(--def-line)" />
    {/each}
  {/if}

  {#if draft}
    <path d={draft} fill="none" stroke={color} stroke-width="0.09" stroke-linecap="round" stroke-linejoin="round" />
  {/if}

  {#if showDefense}
    {#each frame.def as p, i}
      <g transform="translate({p.x} {p.y})" class="token def">
        {#if picked?.side === 'def' && picked.i === i}
          <circle r={DEF_R + 0.2} fill="none" stroke={color} stroke-width="0.08" />
        {/if}
        <path d="M{DEF_R + 0.33} 0L{DEF_R + 0.1} -0.17L{DEF_R + 0.1} 0.17Z" fill="var(--def)" transform="rotate({facing(p)})" />
        <circle r={DEF_R} fill="var(--def)" />
        <text class="num" fill="#fff" font-size="0.46">{i + 1}</text>
      </g>
    {/each}
  {/if}

  {#if ballDraw.shadow}
    <ellipse cx={frame.ball.x + 0.3} cy={frame.ball.y + 0.5} rx="0.2" ry="0.1" fill="#000" opacity={ballDraw.shadow * 0.5} />
  {/if}

  {#each frame.off as p, i}
    <g transform="translate({p.x} {p.y})" class="token off">
      {#if me === i || (picked?.side === 'off' && picked.i === i)}
        <circle r={OFF_R + 0.18} fill="none" stroke={me === i ? color : 'var(--ink)'} stroke-width="0.09" />
      {/if}
      <circle r={OFF_R} fill={color} stroke="#fff" stroke-width="0.07" />
      <text class="num" fill="#fff" font-size="0.52">{i + 1}</text>
      {#if names[i]}
        <text class="name" y={OFF_R + 0.5} font-size="0.44">{names[i]}</text>
      {/if}
    </g>
  {/each}

  <g transform="translate({ballDraw.x} {ballDraw.y})" class="ball">
    <circle r={ballDraw.r} fill="var(--ball)" stroke="#6b3206" stroke-width="0.03" />
    <path d="M{-ballDraw.r} 0H{ballDraw.r}M0 {-ballDraw.r}V{ballDraw.r}" stroke="#6b3206" stroke-width="0.02" />
  </g>

  {@render overlay?.()}
</svg>

<style>
  .board {
    display: block;
    width: 100%;
    height: auto;
    max-height: calc(100dvh - 190px);
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }
  .interactive {
    touch-action: none;
  }
  .num {
    text-anchor: middle;
    dominant-baseline: central;
    font-weight: 700;
    pointer-events: none;
  }
  .name {
    text-anchor: middle;
    dominant-baseline: hanging;
    font-weight: 600;
    fill: var(--ink);
    paint-order: stroke;
    stroke: var(--floor);
    stroke-width: 0.14;
    stroke-linejoin: round;
    pointer-events: none;
  }
</style>
