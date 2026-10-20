<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { api, type Role } from '../lib/api'
  import { go } from '../lib/router.svelte'
  import { app, call, logout } from '../lib/store.svelte'

  let name = $state(app.data?.team.name ?? '')
  let color = $state(app.data?.team.color ?? '#1d5fbf')
  let color2 = $state(app.data?.team.color2 ?? '#e8601c')
  let teamMsg = $state('')

  async function saveTeam(e: SubmitEvent) {
    e.preventDefault()
    teamMsg = ''
    try {
      await call((t) => api.setTeam(t, name.trim(), color, color2))
      if (app.data) app.data.team = { name: name.trim(), color, color2 }
      teamMsg = 'Salvato.'
    } catch (err) {
      teamMsg = err instanceof Error ? err.message : String(err)
    }
  }

  const pw = $state<Record<Role, { value: string; msg: string }>>({ view: { value: '', msg: '' }, edit: { value: '', msg: '' } })

  async function savePassword(kind: Role, e: SubmitEvent) {
    e.preventDefault()
    const p = pw[kind]
    p.msg = ''
    try {
      await call((t) => api.setPassword(t, kind, p.value))
      p.value = ''
      p.msg = kind === 'view' ? 'Cambiata. Chi era entrato con la vecchia dovrà usare la nuova.' : 'Cambiata.'
    } catch (err) {
      p.msg = err instanceof Error ? err.message : String(err)
    }
  }

  async function exit() {
    await logout()
    go('/')
  }
</script>

<div class="page">
  <header class="bar">
    <a class="btn quiet icon" href="#/" aria-label="Indietro"><Icon name="back" /></a>
    <h1>Impostazioni</h1>
  </header>

  <section>
    <form onsubmit={saveTeam}>
      <h2>Squadra</h2>
      <label class="field">
        Nome
        <input type="text" bind:value={name} maxlength="60" />
      </label>
      <div class="colors">
        <label class="field color">
          Colore delle pedine
          <input type="color" bind:value={color} />
        </label>
        <label class="field color">
          Secondo colore
          <input type="color" bind:value={color2} />
          <span class="small">Area dipinta e "chi sei".</span>
        </label>
      </div>
      <div class="actions">
        {#if teamMsg}<span class="small muted">{teamMsg}</span>{/if}
        <button class="btn primary" disabled={!name.trim()}>Salva</button>
      </div>
    </form>
  </section>

  {#each [['view', 'Password della squadra', 'La usano i giocatori per vedere e provare gli schemi.'], ['edit', "Password dell'allenatore", 'Serve per creare e modificare schemi e giocatori.']] as [kind, title, help]}
    {@const k = kind as Role}
    <section>
      <form onsubmit={(e) => savePassword(k, e)}>
        <h2>{title}</h2>
        <p class="muted small">{help}</p>
        <label class="field">
          Nuova password
          <input type="password" bind:value={pw[k].value} autocomplete="new-password" minlength="8" />
        </label>
        <div class="actions">
          {#if pw[k].msg}<span class="small muted">{pw[k].msg}</span>{/if}
          <button class="btn" disabled={pw[k].value.length < 8}>Cambia</button>
        </div>
      </form>
    </section>
  {/each}

  <section>
    <button class="btn" onclick={exit}>Esci da questo dispositivo</button>
  </section>
</div>

<style>
  section {
    padding: 18px 0;
    border-top: 1px solid var(--border);
  }
  section:first-of-type {
    border-top: 0;
  }
  form {
    display: grid;
    gap: 12px;
    max-width: 420px;
  }
  p {
    margin: -6px 0 0;
  }
  .actions {
    align-items: center;
  }
  .colors {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }
  .color input {
    width: 64px;
    height: 40px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
</style>
