<script lang="ts">
  import { api } from '../lib/api'
  import { inkOn } from '../lib/color'
  import type { PlayData } from '../lib/types'
  import Viewer from './Viewer.svelte'

  let { share }: { share: string } = $props()

  let result = $state<{ name: string; data: PlayData; color: string } | null>(null)
  let error = $state('')

  $effect(() => {
    result = null
    error = ''
    api
      .sharedPlay(share)
      .then((r) => {
        if (!r) error = 'Questo link non è valido, oppure l’allenatore ne ha creato uno nuovo.'
        else {
          result = { name: r.name, data: r.data, color: r.team.color }
          document.title = `${r.name} · ${r.team.name}`
        }
      })
      .catch((e) => (error = e instanceof Error ? e.message : String(e)))
  })
</script>

{#if result}
  <div style="--accent: {result.color}; --accent-ink: {inkOn(result.color)}">
    <Viewer name={result.name} data={result.data} color={result.color} shared />
  </div>
{:else if error}
  <main class="page"><p class="error" style="margin-top: 40px">{error}</p></main>
{:else}
  <main class="page"><p class="muted" style="margin-top: 40px">Carico lo schema…</p></main>
{/if}
