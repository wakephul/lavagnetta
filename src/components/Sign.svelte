<script lang="ts" module>
  export type SignKind = 'move' | 'dribble' | 'screen' | 'pass' | 'handoff' | 'shot' | 'defense'
</script>

<script lang="ts">
  // I segni della lavagna in piccolo: per gli strumenti dell'editor e per la legenda.
  let { kind }: { kind: SignKind } = $props()
</script>

<svg viewBox="0 0 40 20" aria-hidden="true" class="sign">
  {#if kind === 'move'}
    <path d="M3 15C12 15 20 6 31 6" /><path d="M36 6l-6-3v6z" class="fill" />
  {:else if kind === 'dribble'}
    <path d="M3 13l3-4 3 4 3-4 3 4 3-4 3 4 3-4 3 4h3" /><path d="M37 13l-6-3v6z" class="fill" />
  {:else if kind === 'screen'}
    <path d="M3 12H31M31 4v16" class="thick" />
  {:else if kind === 'pass'}
    <path d="M3 10H30" stroke-dasharray="4 3" /><path d="M36 10l-6-3v6z" class="fill" />
  {:else if kind === 'handoff'}
    <path d="M3 10H24" /><path d="M27 3v14M32 3v14" class="thick" />
  {:else if kind === 'shot'}
    <path d="M3 15Q15 0 29 9" stroke-dasharray="1.5 3" /><circle cx="33" cy="11" r="3.5" />
  {:else}
    <path d="M16 10H31" class="muted" /><path d="M36 10l-6-3v6z" class="fill muted" /><circle cx="8" cy="10" r="6" class="fill" />
  {/if}
</svg>

<style>
  .sign {
    width: 40px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }
  .fill {
    fill: currentColor;
    stroke: none;
  }
  .thick {
    stroke-width: 2.6;
  }
  .muted {
    opacity: 0.6;
  }
</style>
