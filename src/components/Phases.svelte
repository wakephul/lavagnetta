<script lang="ts">
  import type { Phase } from '../lib/types'

  type Props = {
    phases: Phase[]
    /** Fase selezionata: -1 è la partenza. */
    current: number
    choices: number[]
    withStart?: boolean
    canAdd?: boolean
    asking?: boolean
    readName?: (phase: Phase, r: number) => string
    onphase: (k: number) => void
    onread: (k: number, r: number) => void
    onadd?: () => void
    onaddread?: () => void
    oneditread?: (r: number) => void
  }

  let {
    phases,
    current,
    choices,
    withStart = false,
    canAdd = false,
    asking = false,
    readName = (p, r) => p.reads[r].label || `Lettura ${r + 1}`,
    onphase,
    onread,
    onadd,
    onaddread,
    oneditread,
  }: Props = $props()

  const cur = $derived(current >= 0 ? phases[current] : null)
  const chosen = $derived(current >= 0 ? Math.min(choices[current] ?? 0, (cur?.reads.length ?? 1) - 1) : 0)
</script>

<div class="phases">
  <div class="strip" role="tablist" aria-label="Fasi">
    {#if withStart}
      <button role="tab" class="start" aria-selected={current === -1} onclick={() => onphase(-1)}>Partenza</button>
    {/if}
    {#each phases as p, k (p.id)}
      <button role="tab" aria-selected={current === k} onclick={() => onphase(k)} aria-label={p.reads.length > 1 ? `Fase ${k + 1}, ${p.reads.length} letture` : `Fase ${k + 1}`}>
        {k + 1}
        {#if p.reads.length > 1}
          <svg class="fork" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 13V8M6 8L2 3M6 8l4-5M2 3V1M10 3V1" /></svg>
        {/if}
      </button>
    {/each}
    {#if canAdd}
      <button class="add" onclick={onadd} aria-label="Aggiungi fase" title="Aggiungi fase">+</button>
    {/if}
  </div>

  {#if cur && (cur.reads.length > 1 || onaddread)}
    <div class="reads" class:asking>
      {#if cur.reads.length > 1}
        <span class="q">{asking ? 'Cosa fa la difesa?' : 'Lettura'}</span>
      {/if}
      {#each cur.reads.length > 1 ? cur.reads : [] as _, r}
        <button
          class="chip"
          aria-pressed={chosen === r}
          onclick={() => (chosen === r && oneditread ? oneditread(r) : onread(current, r))}
          title={oneditread && chosen === r ? 'Modifica questa lettura' : undefined}
        >
          {readName(cur, r)}
        </button>
      {/each}
      {#if onaddread}
        <button class="chip add-read" onclick={onaddread}>+ Lettura</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .phases {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  .strip {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 2px;
    scrollbar-width: none;
  }
  .strip button {
    position: relative;
    flex: none;
    min-width: 40px;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--surface);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .strip button[aria-selected='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }
  /* Fase con più letture: un piccolo bivio accanto al numero. */
  .fork {
    width: 10px;
    height: 12px;
    margin-left: 4px;
    vertical-align: -1px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.75;
  }
  .strip .add {
    color: var(--muted);
    font-size: 1.15rem;
    font-weight: 500;
  }
  .reads {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .q {
    font-size: 0.86rem;
    color: var(--muted);
    margin-right: 2px;
  }
  .asking .q {
    color: var(--ink);
    font-weight: 600;
  }
  .chip {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 17px;
    background: var(--surface);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .asking .chip {
    border-color: var(--accent);
  }
  .add-read {
    color: var(--muted);
    border-style: dashed;
  }
</style>
