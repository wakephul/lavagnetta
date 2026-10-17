<script lang="ts">
  import Board from '../components/Board.svelte'
  import Icon from '../components/Icon.svelte'
  import { marks } from '../lib/draw'
  import { depth, newPlayData, variants } from '../lib/play'
  import { go } from '../lib/router.svelte'
  import { initState, plan, stateFrame } from '../lib/sim'
  import { app, canEdit, logout, savePlay, teamColor } from '../lib/store.svelte'
  import { DEFENSE_NAMES, SITUATION_NAMES, type DefenseType, type PlayData, type Situation } from '../lib/types'

  const plays = $derived(app.data?.plays ?? [])

  function thumb(data: PlayData) {
    const st = initState(data)
    const root = data.root
    return { frame: stateFrame(st), marks: root ? marks(plan(st, root, root.reads[0], data.coverage), root.actions) : [] }
  }

  function summary(data: PlayData) {
    const phases = depth(data.root)
    const v = variants(data.root)
    const parts = [SITUATION_NAMES[data.situation], DEFENSE_NAMES[data.defense]]
    parts.push(phases === 0 ? 'nessuna fase' : phases === 1 ? '1 fase' : `${phases} fasi`)
    if (v > 1) parts.push(`${v} varianti`)
    return parts.join(' · ')
  }

  let dialog: HTMLDialogElement
  let name = $state('')
  let situation = $state<Situation>('half')
  let defense = $state<DefenseType>('man')
  let busy = $state(false)
  let error = $state('')

  async function create(e: SubmitEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    busy = true
    error = ''
    try {
      const p = await savePlay({ id: null, name: name.trim(), updated_at: null, data: newPlayData(situation, defense) })
      dialog.close()
      go(`/schema/${p.id}/modifica`)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      busy = false
    }
  }

  function openNew() {
    name = ''
    error = ''
    dialog.showModal()
  }
</script>

<div class="page">
  <header class="bar">
    <h1>{app.data?.team.name ?? ''}</h1>
    <a class="btn quiet" href="#/squadra"><Icon name="team" /> Squadra</a>
    {#if canEdit()}
      <a class="btn quiet icon" href="#/impostazioni" aria-label="Impostazioni" title="Impostazioni"><Icon name="gear" /></a>
    {:else}
      <button class="btn quiet" onclick={logout}>Esci</button>
    {/if}
  </header>

  {#if plays.length}
    <ul class="list plays">
      {#each plays as p (p.id)}
        {@const t = thumb(p.data)}
        <li>
          <a href="#/schema/{p.id}">
            <div class="thumb">
              <Board situation={p.data.situation} color={teamColor()} frame={t.frame} marks={t.marks} showDefense={false} label="Partenza di {p.name}" />
            </div>
            <div class="info">
              <h2>{p.name}</h2>
              <p class="muted small">{summary(p.data)}</p>
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {:else if app.data}
    <p class="muted empty">{canEdit() ? 'Ancora nessuno schema.' : "L'allenatore non ha ancora caricato schemi."}</p>
  {/if}

  {#if canEdit()}
    <button class="btn primary new" onclick={openNew}><Icon name="plus" /> Nuovo schema</button>
  {:else if app.data}
    <p class="small muted coach"><a href="#/allenatore">Sei un allenatore?</a></p>
  {/if}
</div>

<dialog bind:this={dialog}>
  <form onsubmit={create}>
    <h2>Nuovo schema</h2>
    <label class="field">
      Nome
      <input type="text" bind:value={name} maxlength="80" placeholder="Es. Corna, Uscita dai blocchi" />
    </label>
    <div class="field">
      Situazione
      <div class="seg">
        {#each Object.entries(SITUATION_NAMES) as [k, label]}
          <button type="button" aria-pressed={situation === k} onclick={() => (situation = k as Situation)}>{label}</button>
        {/each}
      </div>
    </div>
    <div class="field">
      Contro
      <div class="seg">
        {#each Object.entries(DEFENSE_NAMES) as [k, label]}
          <button type="button" aria-pressed={defense === k} onclick={() => (defense = k as DefenseType)}>{label}</button>
        {/each}
      </div>
    </div>
    {#if error}<p class="error small">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="btn quiet" onclick={() => dialog.close()}>Annulla</button>
      <button class="btn primary" disabled={!name.trim() || busy}>Crea</button>
    </div>
  </form>
</dialog>

<style>
  .plays {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .plays a {
    display: block;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    overflow: hidden;
    text-decoration: none;
  }
  .plays a:hover {
    border-color: #cbc4b8;
  }
  .thumb {
    pointer-events: none;
    border-bottom: 1px solid var(--border);
  }
  .info {
    padding: 10px 12px 12px;
  }
  .info p {
    margin: 2px 0 0;
  }
  @media (max-width: 520px) {
    .plays {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .plays a {
      display: grid;
      grid-template-columns: 112px 1fr;
      align-items: center;
    }
    .thumb {
      border-bottom: 0;
      border-right: 1px solid var(--border);
    }
  }
  .empty {
    margin: 32px 0;
  }
  .new {
    margin-top: 18px;
  }
  .coach {
    margin-top: 28px;
  }
  .seg {
    width: fit-content;
    max-width: 100%;
    flex-wrap: wrap;
  }
  .field .seg {
    color: var(--ink);
  }
</style>
