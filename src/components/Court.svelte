<script lang="ts">
  import { courtShapes } from '../lib/court'
  import type { Situation } from '../lib/types'

  let { situation, color }: { situation: Situation; color: string } = $props()

  const shapes = $derived(courtShapes(situation))
  const fills = { floor: 'var(--floor)', out: 'var(--floor-out)', paint: 'var(--paint)' }
  const strokes = { line: 'var(--line)', ink: 'var(--ink)', rim: 'var(--rim)' }
</script>

<g class="court" style="--paint: color-mix(in srgb, {color} 17%, var(--floor))">
  {#each shapes as s}
    <path
      d={s.d}
      fill={s.fill ? fills[s.fill] : 'none'}
      stroke={s.stroke ? strokes[s.stroke] : 'none'}
      stroke-width={s.width ?? 0.05}
      stroke-dasharray={s.dash?.join(' ')}
    />
  {/each}
</g>
