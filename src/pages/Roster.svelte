<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { api } from '../lib/api'
  import { app, call, canEdit } from '../lib/store.svelte'
  import { ROLE_NAMES, SLOTS, type Player, type Slot } from '../lib/types'

  const players = $derived(app.data?.players ?? [])

  let dialog: HTMLDialogElement
  let editing = $state<{ id: string | null; name: string; number: string; role: string; height: string }>({
    id: null,
    name: '',
    number: '',
    role: '',
    height: '',
  })
  let error = $state('')
  let busy = $state(false)

  function open(p?: Player) {
    error = ''
    editing = {
      id: p?.id ?? null,
      name: p?.name ?? '',
      number: p?.number?.toString() ?? '',
      role: p?.role?.toString() ?? '',
      height: p?.height?.toString() ?? '',
    }
    dialog.showModal()
  }

  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  async function save(e: SubmitEvent) {
    e.preventDefault()
    if (!editing.name.trim() || busy || !app.data) return
    busy = true
    error = ''
    try {
      const saved = await call((t) =>
        api.savePlayer(t, {
          id: editing.id,
          name: editing.name.trim(),
          number: num(editing.number),
          role: num(editing.role) as Slot | null,
          height: num(editing.height),
        }),
      )
      const list = app.data.players.filter((p) => p.id !== saved.id)
      app.data.players = [...list, saved].sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name, 'it'))
      dialog.close()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      busy = false
    }
  }

  async function remove() {
    if (!editing.id || !app.data || !confirm(`Togliere ${editing.name} dalla squadra?`)) return
    const id = editing.id
    try {
      await call((t) => api.deletePlayer(t, id))
      app.data.players = app.data.players.filter((p) => p.id !== id)
      dialog.close()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }
</script>

<div class="page">
  <header class="bar">
    <a class="btn quiet icon" href="#/" aria-label="Indietro"><Icon name="back" /></a>
    <h1>Squadra</h1>
    {#if canEdit()}
      <button class="btn" onclick={() => open()}><Icon name="plus" /> Giocatore</button>
    {/if}
  </header>

  {#if players.length}
    <table>
      <thead>
        <tr><th class="n">N.</th><th>Nome</th><th>Ruolo</th><th class="h">Altezza</th></tr>
      </thead>
      <tbody>
        {#each players as p (p.id)}
          <tr class:clickable={canEdit()} onclick={() => canEdit() && open(p)}>
            <td class="n">{p.number ?? ''}</td>
            <td>{p.name}</td>
            <td class="muted">{p.role ? ROLE_NAMES[p.role] : ''}</td>
            <td class="h muted">{p.height ? `${p.height} cm` : ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="muted">Nessun giocatore inserito.</p>
  {/if}
</div>

<dialog bind:this={dialog}>
  <form onsubmit={save}>
    <h2>{editing.id ? 'Modifica giocatore' : 'Nuovo giocatore'}</h2>
    <label class="field">
      Nome
      <input type="text" bind:value={editing.name} maxlength="40" />
      <span class="small">Basta il nome o un soprannome.</span>
    </label>
    <div class="row">
      <label class="field">
        Numero
        <input type="number" inputmode="numeric" min="0" max="99" bind:value={editing.number} />
      </label>
      <label class="field">
        Altezza (cm)
        <input type="number" inputmode="numeric" min="100" max="230" bind:value={editing.height} />
      </label>
    </div>
    <label class="field">
      Ruolo
      <select bind:value={editing.role}>
        <option value="">—</option>
        {#each SLOTS as s}<option value={String(s)}>{s} · {ROLE_NAMES[s]}</option>{/each}
      </select>
    </label>
    {#if error}<p class="error small">{error}</p>{/if}
    <div class="actions">
      {#if editing.id}<button type="button" class="btn danger quiet" onclick={remove}>Togli</button>{/if}
      <button type="button" class="btn quiet" onclick={() => dialog.close()}>Annulla</button>
      <button class="btn primary" disabled={!editing.name.trim() || busy}>Salva</button>
    </div>
  </form>
</dialog>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  th,
  td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  th {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--muted);
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  .n {
    width: 3.5em;
    font-variant-numeric: tabular-nums;
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover {
    background: #faf8f4;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 480px) {
    .h {
      display: none;
    }
  }
</style>
