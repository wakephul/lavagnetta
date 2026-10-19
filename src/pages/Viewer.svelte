<script lang="ts">
  import { onMount } from 'svelte'
  import Board from '../components/Board.svelte'
  import Icon from '../components/Icon.svelte'
  import Phases from '../components/Phases.svelte'
  import Sign from '../components/Sign.svelte'
  import { marks, type Mark } from '../lib/draw'
  import { inkOn } from '../lib/color'
  import { BASKET } from '../lib/court'
  import { dist, type Vec } from '../lib/geo'
  import { mirrored, phasesAlong, swapsRoles } from '../lib/play'
  import { frameAt, initState, runPath, stateFrame, type PhaseRun } from '../lib/sim'
  import { app, canEdit, setLineup, shareUrl } from '../lib/store.svelte'
  import { DEFENSE_NAMES, ROLE_NAMES, SLOTS, type DefenseType, type PlayData } from '../lib/types'

  type Props = { name: string; data: PlayData; color: string; playId?: string | null; share?: string | null; shared?: boolean }
  let { name, data, color, playId = null, share = null, shared = false }: Props = $props()

  // svelte-ignore state_referenced_locally
  let defense = $state<DefenseType>(data.defense)
  let choices = $state<number[]>([])
  // Ribaltato: lo stesso schema giocato sull'altro lato del campo.
  let flip = $state(false)
  const shown = $derived(flip ? mirrored(data) : data)
  const runs = $derived(runPath(shown, choices, defense))
  const phases = $derived(phasesAlong(shown, choices))

  let k = $state(0)
  let t = $state(0)
  let playing = $state(false)
  let speed = $state(1)
  let asking = $state(false)
  let view3d = $state(false)

  const run = $derived<PhaseRun | null>(runs[k] ?? null)
  const frame = $derived(run ? frameAt(run, t) : stateFrame(initState(shown, defense)))
  const phaseMarks = $derived(run ? marks(run.plan, run.phase.actions) : [])
  const atEnd = $derived(!run || (k === runs.length - 1 && t >= run.plan.dur - 1e-3))

  // --- Quintetto e "chi sei" (salvati su questo dispositivo) ---
  const roster = $derived(shared ? [] : (app.data?.players ?? []))
  const lineup = $derived(app.lineup)
  const me = $derived(lineup.me)
  const names = $derived(lineup.players.map((id) => roster.find((p) => p.id === id)?.name ?? null))

  onMount(() => {
    // Primo uso: riempie il quintetto in base ai ruoli.
    if (roster.length && lineup.players.every((x) => x === null)) {
      const used = new Set<string>()
      const players = SLOTS.map((s) => {
        const p = roster.find((r) => r.role === s && !used.has(r.id))
        if (p) used.add(p.id)
        return p?.id ?? null
      })
      setLineup({ ...lineup, players })
    }
  })

  function setMe(i: number) {
    setLineup({ ...lineup, me: me === i ? null : i })
  }

  function setPlayer(i: number, id: string) {
    const players = lineup.players.map((x) => (x === id ? null : x))
    players[i] = id || null
    setLineup({ ...lineup, players })
  }

  // --- Riproduzione ---
  $effect(() => {
    if (!playing) return
    let last = performance.now()
    let id = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      advance(dt * speed)
      if (playing) id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  })

  function advance(dt: number) {
    if (!run) {
      playing = false
      return
    }
    t += dt
    if (t < run.plan.dur) return
    if (quiz) {
      t = run.plan.dur
      playing = false
      quizNextPhase()
      return
    }
    if (k + 1 < runs.length) {
      enter(k + 1)
    } else {
      t = run.plan.dur
      playing = false
    }
  }

  /** Fasi in cui la lettura è già stata scelta: lì non si richiede. */
  let picked = new Set<number>()

  /** Entra in una fase durante la riproduzione: se ha più letture si ferma e chiede. */
  function enter(i: number) {
    k = i
    t = 0
    if (runs[i]?.phase.reads.length > 1 && !picked.has(i)) {
      playing = false
      asking = true
    }
  }

  function toggle() {
    if (!runs.length) return
    if (asking) {
      asking = false
      playing = true
      return
    }
    if (playing) {
      playing = false
      return
    }
    if (atEnd) enter(0)
    else if (t === 0) enter(k)
    if (asking) return
    playing = true
  }

  function goPhase(i: number) {
    playing = false
    asking = false
    k = Math.max(0, Math.min(runs.length - 1, i))
    t = 0
  }

  function prev() {
    if (t > 0.6) goPhase(k)
    else goPhase(k - 1)
  }

  function pickRead(i: number, r: number) {
    const c = choices.slice()
    c[i] = r
    choices = c
    picked.add(i)
    k = i
    t = 0
    asking = false
    playing = true
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || quiz) return
    if (e.key === ' ') {
      e.preventDefault()
      toggle()
    } else if (e.key === 'ArrowRight') goPhase(k + 1)
    else if (e.key === 'ArrowLeft') prev()
  }

  // --- Mettiti alla prova ---
  type Question = { kind: 'move' | 'pass' | 'shot' | 'stay'; expected?: Vec; receiver?: number }
  type Quiz = {
    qs: Question[]
    qi: number
    step: 'ask' | 'reveal' | 'play' | 'done'
    tap: Vec | null
    ok: boolean
    right: number
    total: number
  }
  let quiz = $state<Quiz | null>(null)
  let quizNeedsMe = $state(false)

  function questions(r: PhaseRun, i: number): Question[] {
    const qs: (Question & { at: number })[] = []
    const m = r.plan.moves[i]
    if (m) qs.push({ kind: 'move', expected: m.line.end, at: m.t0 })
    const p = r.plan.passes.find((p) => p.a === i)
    if (p) qs.push({ kind: 'pass', receiver: p.b, at: p.rel })
    if (r.plan.shot?.i === i) qs.push({ kind: 'shot', at: r.plan.shot.rel })
    qs.sort((a, b) => a.at - b.at)
    return qs.length ? qs : [{ kind: 'stay' }]
  }

  function randomRead(i: number) {
    const ph = phasesAlong(shown, choices)[i]
    if (!ph || ph.reads.length < 2) return
    const c = choices.slice()
    c[i] = Math.floor(Math.random() * ph.reads.length)
    choices = c
  }

  function startQuiz() {
    if (me === null) {
      quizNeedsMe = true
      return
    }
    quizNeedsMe = false
    view3d = false
    playing = false
    asking = false
    choices = []
    randomRead(0)
    k = 0
    t = 0
    quiz = { qs: questions(runs[0], me), qi: 0, step: 'ask', tap: null, ok: false, right: 0, total: 0 }
  }

  function answer(kind: 'tap' | 'stay' | 'shot', p?: Vec) {
    if (!quiz || quiz.step !== 'ask' || !run || me === null) return
    const q = quiz.qs[quiz.qi]
    let ok = false
    if (kind === 'stay') ok = q.kind === 'stay'
    else if (kind === 'shot') ok = q.kind === 'shot'
    else if (p) {
      if (q.kind === 'shot') ok = dist(p, BASKET) < 1.2
      else if (q.kind === 'move') ok = dist(p, q.expected!) <= 1.8
      else if (q.kind === 'stay') ok = dist(p, run.start.off[me]) <= 1.2
      else {
        // Si può toccare il compagno dove si trova ora o dove riceverà.
        let best = -1
        let bd = 1.6
        for (let i = 0; i < 5; i++) {
          if (i === me) continue
          const d = Math.min(dist(p, run.start.off[i]), dist(p, run.plan.offAt(i, run.plan.dur)))
          if (d < bd) {
            bd = d
            best = i
          }
        }
        if (best < 0) return
        ok = best === q.receiver
      }
    }
    quiz = { ...quiz, step: 'reveal', tap: p ?? null, ok, right: quiz.right + (ok ? 1 : 0), total: quiz.total + 1 }
  }

  function quizContinue() {
    if (!quiz) return
    if (quiz.qi + 1 < quiz.qs.length) {
      quiz = { ...quiz, qi: quiz.qi + 1, step: 'ask', tap: null }
      return
    }
    quiz = { ...quiz, step: 'play', tap: null }
    t = 0
    playing = true
  }

  function quizNextPhase() {
    if (!quiz || me === null) return
    if (k + 1 >= runs.length) {
      quiz = { ...quiz, step: 'done' }
      return
    }
    randomRead(k + 1)
    k += 1
    t = 0
    quiz = { ...quiz, qs: questions(runs[k], me), qi: 0, step: 'ask', tap: null }
  }

  function stopQuiz() {
    quiz = null
    playing = false
    goPhase(0)
  }

  const question = $derived(quiz && quiz.step !== 'done' ? quiz.qs[quiz.qi] : null)
  // "Tiro" compare per chiunque possa avere la palla nella fase, così non suggerisce la risposta.
  const mayShoot = $derived(!!run && me !== null && (run.start.holder === me || run.plan.passes.some((p) => p.b === me)))
  const prompt = $derived.by(() => {
    if (!quiz || !question) return ''
    const n = `Fase ${k + 1}`
    if (quiz.step === 'ask') {
      if (question.kind === 'move') return `${n}: dove vai? Tocca il punto sul campo.`
      if (question.kind === 'pass') return `${n}: a chi passi? Tocca il compagno.`
      return `${n}: cosa fai?`
    }
    if (quiz.step === 'reveal') {
      if (quiz.ok) return 'Giusto.'
      if (question.kind === 'move') return 'No. Il cerchio indica dove dovevi andare.'
      if (question.kind === 'pass') return `No. Dovevi passare al ${(question.receiver ?? 0) + 1}.`
      if (question.kind === 'shot') return 'No. Qui tiri.'
      return 'No. In questa fase resti dove sei.'
    }
    return ''
  })

  // In domanda non si mostrano le frecce, altrimenti la risposta si vede.
  const shownMarks = $derived<Mark[]>(quiz?.step === 'ask' ? [] : phaseMarks)
  const fade = $derived(playing ? 0.45 : 1)

  const readLabel = $derived(run && run.phase.reads.length > 1 ? run.phase.reads[run.read].label || `Lettura ${run.read + 1}` : '')
  const caption = $derived.by(() => {
    if (!runs.length) return 'Lo schema non ha ancora fasi.'
    if (asking) return `Fase ${k + 1} di ${runs.length}: scegli cosa fa la difesa.`
    return `Fase ${k + 1} di ${runs.length}` + (readLabel ? ` · ${readLabel}` : '')
  })

  let copied = $state(false)
  async function shareLink() {
    const url = shared ? location.href : share ? shareUrl(share) : null
    if (!url) return
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      navigator.share({ title: name, url }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(url)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="viewer">
  <header class="bar">
    {#if !shared}<a class="btn quiet icon" href="#/" aria-label="Indietro"><Icon name="back" /></a>{/if}
    <h1>{name}</h1>
    <button class="btn quiet icon" onclick={() => (view3d = !view3d)} aria-label={view3d ? 'Vista dall’alto' : 'Vista 3D'} title={view3d ? 'Vista dall’alto' : 'Vista 3D'} disabled={!!quiz}>
      <Icon name={view3d ? 'flat' : 'cube'} />
    </button>
    {#if share || shared}
      <button class="btn quiet icon" onclick={shareLink} aria-label="Condividi" title={copied ? 'Link copiato' : 'Copia il link'}>
        <Icon name={copied ? 'check' : 'share'} />
      </button>
    {/if}
    {#if playId && canEdit()}
      <a class="btn quiet icon" href="#/schema/{playId}/modifica" aria-label="Modifica" title="Modifica"><Icon name="edit" /></a>
    {/if}
  </header>

  <div class="stage">
    {#if view3d}
      {#await import('../components/View3D.svelte') then m}
        <m.default situation={data.situation} {color} {frame} {names} {me} />
      {/await}
    {:else}
      <Board
        situation={data.situation}
        {color}
        {frame}
        marks={shownMarks}
        {fade}
        {names}
        {me}
        label="Schema {name}, fase {k + 1}"
        ondown={quiz?.step === 'ask' ? () => {} : undefined}
        onup={quiz?.step === 'ask' ? (p) => answer('tap', p) : undefined}
      >
        {#snippet overlay()}
          {#if quiz?.step === 'reveal' && question}
            {#if question.kind === 'move'}
              <circle cx={question.expected!.x} cy={question.expected!.y} r="1.8" fill={color} fill-opacity="0.12" stroke={color} stroke-width="0.06" stroke-dasharray="0.2 0.15" />
            {/if}
            {#if quiz.tap}
              <circle cx={quiz.tap.x} cy={quiz.tap.y} r="0.28" fill={quiz.ok ? 'var(--ok)' : 'var(--danger)'} stroke="#fff" stroke-width="0.06" />
            {/if}
          {/if}
        {/snippet}
      </Board>
    {/if}
  </div>

  <div class="controls">
    {#if quiz}
      <div class="quiz" aria-live="polite">
        {#if quiz.step === 'done'}
          <p><strong>Risposte giuste: {quiz.right} su {quiz.total}.</strong></p>
          <div class="row">
            <button class="btn primary" onclick={startQuiz}>Riprova</button>
            <button class="btn" onclick={stopQuiz}>Fine</button>
          </div>
        {:else}
          <p class:ok={quiz.step === 'reveal' && quiz.ok} class:no={quiz.step === 'reveal' && !quiz.ok}>
            {quiz.step === 'play' ? caption : prompt}
          </p>
          <div class="row">
            {#if quiz.step === 'ask'}
              <button class="btn" onclick={() => answer('stay')}>Resto qui</button>
              {#if mayShoot}<button class="btn" onclick={() => answer('shot')}>Tiro</button>{/if}
            {:else if quiz.step === 'reveal'}
              <button class="btn primary" onclick={quizContinue}>{quiz.qi + 1 < quiz.qs.length ? 'Avanti' : 'Guarda la fase'}</button>
            {/if}
            <button class="btn quiet" onclick={stopQuiz}>Esci dalla prova</button>
          </div>
        {/if}
      </div>
    {:else}
      <p class="caption">{caption}</p>
      <div class="transport">
        <button class="btn icon" onclick={prev} aria-label="Fase precedente" disabled={!runs.length}><Icon name="prev" /></button>
        <button class="btn icon primary play" onclick={toggle} aria-label={playing ? 'Pausa' : 'Riproduci'} disabled={!runs.length}>
          <Icon name={playing ? 'pause' : atEnd ? 'restart' : 'play'} />
        </button>
        <button class="btn icon" onclick={() => goPhase(k + 1)} aria-label="Fase successiva" disabled={k >= runs.length - 1}><Icon name="next" /></button>
        {#if run}
          <input
            class="scrub"
            type="range"
            min="0"
            max={run.plan.dur}
            step="0.01"
            bind:value={t}
            oninput={() => {
              playing = false
              asking = false
            }}
            aria-label="Posizione nella fase"
          />
        {/if}
        <div class="seg speed" role="group" aria-label="Velocità">
          <button aria-pressed={speed === 0.5} onclick={() => (speed = 0.5)}>½×</button>
          <button aria-pressed={speed === 1} onclick={() => (speed = 1)}>1×</button>
        </div>
      </div>
      {#if runs.length}
        <Phases {phases} current={k} {choices} {asking} onphase={goPhase} onread={pickRead} />
      {/if}
    {/if}
  </div>

  {#if !quiz}
    <section class="panel">
      <h2>Chi sei?</h2>
      <div class="me" role="group" aria-label="Chi sei">
        {#each SLOTS as s, i}
          <button class="chip" aria-pressed={me === i} onclick={() => setMe(i)}>
            <span class="dot" style="background:{color}; color:{inkOn(color)}">{s}</span>{names[i] ?? ROLE_NAMES[s]}
          </button>
        {/each}
      </div>
      {#if quizNeedsMe}<p class="small error">Prima scegli chi sei.</p>{/if}
      {#if runs.length}
        <button class="btn primary" onclick={startQuiz}>Mettiti alla prova</button>
      {/if}

      {#if roster.length}
        <details>
          <summary>Quintetto</summary>
          <div class="lineup">
            {#each SLOTS as s, i}
              <label>
                <span class="dot" style="background:{color}; color:{inkOn(color)}">{s}</span>
                <select value={lineup.players[i] ?? ''} onchange={(e) => setPlayer(i, e.currentTarget.value)}>
                  <option value="">{ROLE_NAMES[s]}</option>
                  {#each roster as p}<option value={p.id}>{p.number != null ? `${p.number} ` : ''}{p.name}</option>{/each}
                </select>
              </label>
            {/each}
          </div>
        </details>
      {/if}

      <div class="defense">
        <h2>Difesa</h2>
        <div class="seg" role="group" aria-label="Difesa">
          {#each Object.entries(DEFENSE_NAMES) as [d, label]}
            <button
              aria-pressed={defense === d}
              onclick={() => {
                defense = d as DefenseType
                goPhase(0)
              }}>{label}</button
            >
          {/each}
        </div>
        {#if defense !== data.defense}
          <p class="small muted">Lo schema è pensato contro {DEFENSE_NAMES[data.defense].toLowerCase()}: qui la difesa si muove da sola, senza le correzioni dell'allenatore.</p>
        {/if}
      </div>

      <div class="defense">
        <h2>Lato</h2>
        <div class="seg" role="group" aria-label="Lato">
          <button aria-pressed={!flip} onclick={() => ((flip = false), goPhase(0))}>Come disegnato</button>
          <button aria-pressed={flip} onclick={() => ((flip = true), goPhase(0))}>Dall'altro lato</button>
        </div>
        {#if flip && swapsRoles(data)}<p class="small muted">Dall'altro lato il 3 fa quello che fa il 2, il 5 quello del 4.</p>{/if}
      </div>

      <details class="legend">
        <summary>Legenda</summary>
        <ul>
          <li><Sign kind="move" /> Taglio</li>
          <li><Sign kind="dribble" /> Palleggio</li>
          <li><Sign kind="screen" /> Blocco</li>
          <li><Sign kind="pass" /> Passaggio</li>
          <li><Sign kind="handoff" /> Consegnato</li>
          <li><Sign kind="shot" /> Tiro</li>
          <li><Sign kind="defense" /> Difensore, con il movimento corretto dall'allenatore</li>
        </ul>
        <p class="small muted">I difensori sono le pedine scure: X1 marca il 1, X2 il 2 e così via, finché non c'è un cambio. La punta indica dove guardano.</p>
      </details>

      {#if data.notes}
        <div class="notes">
          <h2>Note</h2>
          <p>{data.notes}</p>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .viewer {
    max-width: 760px;
    margin: 0 auto;
    padding: 0 16px 40px;
  }
  .stage {
    margin: 0 -16px;
    background: var(--floor-out);
  }
  .controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    padding: 10px 0 4px;
  }
  .caption {
    margin: 0;
    font-size: 0.92rem;
    color: var(--muted);
    min-height: 1.4em;
  }
  .transport {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .play {
    width: 48px;
    min-height: 48px;
    border-radius: 24px;
  }
  .scrub {
    flex: 1 1 0;
    min-width: 0;
    accent-color: var(--accent);
  }
  .speed button {
    min-width: 40px;
    padding: 0 8px;
  }
  .quiz p {
    margin: 0 0 10px;
    font-size: 1.02rem;
  }
  .quiz .ok {
    color: var(--ok);
    font-weight: 600;
  }
  .quiz .no {
    color: var(--danger);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    margin-top: 14px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .panel > .btn {
    justify-self: start;
  }
  .me {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 12px 0 4px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--surface);
    cursor: pointer;
  }
  .chip[aria-pressed='true'] {
    border-color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--ink);
    font-weight: 600;
  }
  .dot {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 13px;
    color: #fff;
    font-size: 0.82rem;
    font-weight: 700;
    flex: none;
  }
  .legend ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px 14px;
    margin: 8px 0;
    padding: 0;
    list-style: none;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.92rem;
  }
  .legend p {
    margin: 0;
  }
  details summary {
    cursor: pointer;
    font-weight: 600;
    padding: 4px 0;
  }
  .lineup {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }
  .lineup label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .defense,
  .notes {
    display: grid;
    gap: 8px;
  }
  .defense p,
  .notes p {
    margin: 0;
  }
  .notes p {
    white-space: pre-line;
  }
  .seg {
    width: fit-content;
  }
  @media (min-width: 760px) {
    .stage {
      margin: 0;
      border-radius: 10px;
      overflow: hidden;
    }
  }
</style>
