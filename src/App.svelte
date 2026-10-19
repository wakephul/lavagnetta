<script lang="ts">
  import { inkOn } from './lib/color'
  import { match, route } from './lib/router.svelte'
  import { app, canEdit, load, teamColor } from './lib/store.svelte'
  import Editor from './pages/Editor.svelte'
  import Home from './pages/Home.svelte'
  import Login from './pages/Login.svelte'
  import Roster from './pages/Roster.svelte'
  import Settings from './pages/Settings.svelte'
  import Shared from './pages/Shared.svelte'
  import Viewer from './pages/Viewer.svelte'

  if (app.session) load()

  const shared = $derived(match('/s/:share'))
  const view = $derived(match('/schema/:id'))
  const edit = $derived(match('/schema/:id/modifica'))
  const play = $derived(app.data?.plays.find((p) => p.id === (view ?? edit)?.id) ?? null)

  $effect(() => {
    if (!shared) document.title = play ? `${play.name} · ${app.data?.team.name}` : (app.data?.team.name ?? 'lavagnetta')
  })
</script>

{#if shared}
  <Shared share={shared.share} />
{:else if !app.session}
  <Login />
{:else if !app.data}
  <main class="page">
    {#if app.error}
      <p class="error" style="margin-top: 40px">{app.error}</p>
      <button class="btn" onclick={load}>Riprova</button>
    {:else}
      <p class="muted" style="margin-top: 40px">Carico…</p>
    {/if}
  </main>
{:else}
  <div class="app" style="--accent: {teamColor()}; --accent-ink: {inkOn(teamColor())}">
    {#if route.path === '/allenatore'}
      {#if canEdit()}
        <Home />
      {:else}
        <Login title="Accesso allenatore" hint="Con la password dell'allenatore puoi creare e modificare gli schemi." onDone={() => (location.hash = '/')} />
      {/if}
    {:else if route.path === '/squadra'}
      <Roster />
    {:else if route.path === '/impostazioni' && canEdit()}
      <Settings />
    {:else if edit && play && canEdit()}
      {#key play.id}<Editor source={play} />{/key}
    {:else if (view || edit) && play}
      {#key play.id}<Viewer name={play.name} data={play.data} color={teamColor()} playId={play.id} share={play.share_token} />{/key}
    {:else if view || edit}
      <main class="page"><p class="muted" style="margin-top: 40px">Schema non trovato. <a href="#/">Torna agli schemi</a></p></main>
    {:else}
      <Home />
    {/if}
  </div>
{/if}
