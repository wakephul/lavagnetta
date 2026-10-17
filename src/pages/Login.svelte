<script lang="ts">
  import { login } from '../lib/store.svelte'

  let { onDone, title = 'lavagnetta', hint = '' }: { onDone?: () => void; title?: string; hint?: string } = $props()

  let password = $state('')
  let error = $state('')
  let busy = $state(false)

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!password || busy) return
    busy = true
    error = await login(password)
    busy = false
    if (!error) {
      password = ''
      onDone?.()
    }
  }
</script>

<main class="login">
  <form onsubmit={submit}>
    <h1>{title}</h1>
    <label class="field">
      Password
      <!-- svelte-ignore a11y_autofocus -->
      <input type="password" bind:value={password} autocomplete="current-password" autofocus />
    </label>
    {#if hint}<p class="muted small">{hint}</p>{/if}
    {#if error}<p class="error small" role="alert">{error}</p>{/if}
    <button class="btn primary" disabled={busy || !password}>{busy ? 'Controllo…' : 'Entra'}</button>
  </form>
</main>

<style>
  .login {
    display: grid;
    place-items: center;
    min-height: 100dvh;
    padding: 16px;
  }
  form {
    display: grid;
    gap: 14px;
    width: min(340px, 100%);
  }
  h1 {
    font-size: 1.6rem;
    margin-bottom: 6px;
  }
  p {
    margin: 0;
  }
</style>
