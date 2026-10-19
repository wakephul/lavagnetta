<script lang="ts">
  import { onDestroy } from 'svelte'
  import Board from '../components/Board.svelte'
  import Icon from '../components/Icon.svelte'
  import Phases from '../components/Phases.svelte'
  import Sign, { type SignKind } from '../components/Sign.svelte'
  import { ApiError } from '../lib/api'
  import { defaultStart } from '../lib/court'
  import { arrowHead, markAt, marks, polyD } from '../lib/draw'
  import { Line, dist, lerp, simplify, smooth, type Vec } from '../lib/geo'
  import { cloneBranch, newPhase, newRead, outOfBounds, phasesAlong } from '../lib/play'
  import { go } from '../lib/router.svelte'
  import { frameAt, initState, runPath, stateFrame } from '../lib/sim'
  import { deletePlay, load, newShareLink, savePlay, shareUrl, teamColor } from '../lib/store.svelte'
  import {
    COVERAGE_NAMES,
    DEFENSE_NAMES,
    SITUATION_NAMES,
    type Action,
    type Coverage,
    type DefenseType,
    type MoveKind,
    type Play,
    type Situation,
    type Slot,
    uid,
  } from '../lib/types'

  let { source }: { source: Play } = $props()

  // svelte-ignore state_referenced_locally
  const play = $state<Play>(JSON.parse(JSON.stringify(source)))
  const data = $derived(play.data)
  const color = $derived(teamColor())

  let choices = $state<number[]>([])
  let current = $state(-1)
  type Tool = MoveKind | 'pass' | 'handoff' | 'shot' | 'defense' | 'arrange' | 'ball'
  let tool = $state<Tool>('arrange')
  let selected = $state<string | null>(null)
  let note = $state('')

  const runs = $derived(runPath(data, choices))
  const phases = $derived(phasesAlong(data, choices))
  const run = $derived(current >= 0 ? (runs[current] ?? null) : null)
  const phase = $derived(run?.phase ?? null)
  const read = $derived(run ? run.phase.reads[run.read] : null)
  const startFrame = $derived(run ? stateFrame(run.start) : stateFrame(initState(data)))

  // Anteprima animata della fase.
  let previewT = $state<number | null>(null)
  const frame = $derived(run && previewT !== null ? frameAt(run, previewT) : startFrame)

  const phaseMarks = $derived(run ? marks(run.plan, run.phase.actions) : [])
  const trails = $derived.by(() => {
    if (!run || !read) return []
    return [0, 1, 2, 3, 4]
      .filter((d) => !read.defense[String(d)]?.length)
      .map((d) => polyD(run.frames.filter((_, i) => i % 3 === 0).map((f) => f.def[d])))
  })
  const defLines = $derived.by(() => {
    if (!run || !read) return []
    return Object.entries(read.defense)
      .filter(([, path]) => path.length)
      .map(([d, path]) => {
        const line = new Line(smooth([run.start.def[Number(d)], ...path]))
        return { d: polyD(line.pts), head: arrowHead(line.end, line.endDir(), 0.32), key: d, line }
      })
  })

  /** Fine del movimento selezionato: si può trascinare per ritoccarla. */
  const handle = $derived.by(() => {
    if (!selected || !run || previewT !== null) return null
    if (selected.startsWith('def:')) return defLines.find((l) => `def:${l.key}` === selected)?.line.end ?? null
    const m = run.plan.moves.find((m) => m?.action.id === selected)
    return m ? m.line.end : null
  })

  /** Avvisi su cose che in partita non funzionerebbero. */
  const checks = $derived.by(() => {
    const list: string[] = []
    const risky = new Set<string>()
    if (!run) return { list, risky }
    const h = run.start.holder
    if (h >= 0 && outOfBounds(run.start.off[h]) && run.plan.moves[h] && !run.plan.passes.some((p) => p.a === h))
      list.push(`Il ${h + 1} rimette da fuori: deve passare la palla prima di entrare.`)
    const first = run.plan.passes[0]
    if (h >= 0 && outOfBounds(run.start.off[h]) && first && first.rel > 5)
      list.push(`La rimessa va fatta entro 5 secondi: qui la palla parte dopo ${first.rel.toFixed(1).replace('.', ',')} s.`)
    for (const a of run.phase.actions)
      if (a.type === 'pass' && a.hand && !run.plan.passes.find((p) => p.action.id === a.id)?.hand)
        list.push(`Consegnato: il ${a.to} deve passare accanto al ${a.from} per prendere la palla.`)
    for (const p of run.plan.passes) {
      if (p.hand) continue
      for (let u = 0.15; u <= 0.86; u += 0.05) {
        const f = frameAt(run, p.rel + u * (p.catch - p.rel))
        const ball = lerp(p.p0, p.p1, u)
        const d = f.def.findIndex((q) => dist(q, ball) < 0.6)
        if (d < 0) continue
        risky.add(p.action.id)
        list.push(`Passaggio dal ${p.a + 1} al ${p.b + 1} a rischio: il difensore X${d + 1} è sulla linea.`)
        break
      }
    }
    return { list, risky }
  })

  /** Chi ha la palla quando si disegna la prossima azione: dopo i passaggi già messi. */
  const holderNow = $derived.by(() => {
    if (!run) return data.start.ball - 1
    const ps = run.plan.passes
    return ps.length ? ps[ps.length - 1].b : run.start.holder
  })

  // --- Annulla / ripeti ---
  let undo: string[] = []
  let redo: string[] = []
  let canUndo = $state(false)
  let canRedo = $state(false)

  function snapshot(before = JSON.stringify(play.data)) {
    undo.push(before)
    if (undo.length > 80) undo.shift()
    redo = []
    canUndo = true
    canRedo = false
  }

  function restore(from: string[], to: string[]) {
    const s = from.pop()
    if (!s) return
    to.push(JSON.stringify(play.data))
    play.data = JSON.parse(s)
    canUndo = undo.length > 0
    canRedo = redo.length > 0
    selected = null
    if (current >= phasesAlong(play.data, choices).length) current = phasesAlong(play.data, choices).length - 1
    dirty()
  }

  /** Ogni modifica passa da qui: salva lo stato per annullare e programma il salvataggio. */
  function change(fn: () => void) {
    snapshot()
    fn()
    dirty()
  }

  // --- Salvataggio automatico ---
  let status = $state<'saved' | 'pending' | 'saving' | 'error' | 'conflict'>('saved')
  let statusMsg = $state('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<void> | null = null

  function dirty() {
    status = 'pending'
    writeDraft()
    clearTimeout(timer)
    timer = setTimeout(save, 900)
  }

  // Bozza sul dispositivo finché il salvataggio non va a buon fine: se la rete cade
  // o la sessione scade, le modifiche non si perdono.
  // svelte-ignore state_referenced_locally
  const DRAFT_KEY = `lavagnetta.bozza.${source.id}`
  function writeDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: play.name, data: play.data }))
    } catch {
      // Spazio esaurito o navigazione privata: resta solo il salvataggio online.
    }
  }
  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      // Niente da togliere.
    }
  }
  function readDraft(): { name: string; data: Play['data'] } | null {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
      if (!d) return null
      if (d.name === source.name && JSON.stringify(d.data) === JSON.stringify(source.data)) {
        clearDraft()
        return null
      }
      return d
    } catch {
      return null
    }
  }
  let pendingDraft = $state(readDraft())

  function restoreDraft() {
    const d = pendingDraft
    if (!d) return
    pendingDraft = null
    change(() => {
      play.name = d.name
      play.data = d.data
    })
    current = -1
    tool = 'arrange'
  }

  function discardDraft() {
    pendingDraft = null
    clearDraft()
  }

  async function save() {
    if (saving) await saving
    if (status !== 'pending') return
    status = 'saving'
    saving = (async () => {
      try {
        const snap = JSON.parse(JSON.stringify(play))
        const r = await savePlay({ id: play.id, name: play.name, updated_at: play.updated_at, data: snap.data })
        play.updated_at = r.updated_at
        play.share_token = r.share_token
        if (status === 'saving') {
          status = 'saved'
          clearDraft()
        }
      } catch (e) {
        status = e instanceof ApiError && e.kind === 'conflict' ? 'conflict' : 'error'
        statusMsg = e instanceof Error ? e.message : String(e)
      } finally {
        saving = null
      }
    })()
    await saving
  }

  async function reloadFromServer() {
    await load()
    go(`/schema/${play.id}`)
  }

  function beforeUnload(e: BeforeUnloadEvent) {
    if (status === 'pending' || status === 'saving' || status === 'error') e.preventDefault()
  }

  onDestroy(() => {
    clearTimeout(timer)
    clearTimeout(previewEnd)
    cancelAnimationFrame(raf)
    if (status === 'pending' || status === 'error') {
      status = 'pending'
      save()
    }
  })

  // --- Disegno sul campo ---
  type Draft = { kind: Tool; who: number; pts: Vec[]; side: 'off' | 'def' }
  let draft = $state<Draft | null>(null)
  let dragging: { i: number; moved: boolean; before: string } | null = null
  let endDrag: { moved: boolean; before: string } | null = null

  const hit = (list: Vec[], p: Vec, r = 0.8) => {
    let best = -1
    let bd = r
    list.forEach((q, i) => {
      const d = dist(p, q)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    return best
  }

  function flash(msg: string) {
    note = msg
  }

  function onDown(p: Vec) {
    note = ''
    previewT = null
    if (current < 0) {
      const i = hit(startFrame.off, p)
      if (i < 0) return
      if (tool === 'ball') {
        if (data.start.ball !== i + 1) change(() => (play.data.start.ball = (i + 1) as Slot))
        return
      }
      // Lo stato per annullare si salva solo se il giocatore si sposta davvero.
      dragging = { i, moved: false, before: JSON.stringify(play.data) }
      return
    }
    if (!phase) return

    if (handle && dist(p, handle) < 0.6) {
      endDrag = { moved: false, before: JSON.stringify(play.data) }
      return
    }

    if (tool === 'defense') {
      const d = hit(startFrame.def, p)
      if (d >= 0) {
        draft = { kind: 'defense', who: d, pts: [startFrame.def[d]], side: 'def' }
        return
      }
    } else {
      let i = hit(startFrame.off, p)
      let from = i >= 0 ? startFrame.off[i] : p
      // Per tiro, passaggio e consegnato si può partire anche da dove il giocatore arriva.
      if (i < 0 && run && (tool === 'shot' || tool === 'pass' || tool === 'handoff')) {
        const ends = [0, 1, 2, 3, 4].map((j) => run.plan.offAt(j, run.plan.dur))
        i = hit(ends, p)
        if (i >= 0) from = ends[i]
      }
      if (i >= 0) {
        if (tool === 'shot') {
          if (i !== holderNow) return flash('Tira chi ha la palla.')
          change(() => {
            phase.actions = phase.actions.filter((a) => a.type !== 'shot')
            phase.actions.push({ id: uid(), type: 'shot', slot: (i + 1) as Slot })
          })
          return
        }
        const passing = tool === 'pass' || tool === 'handoff'
        if (holderNow < 0 && (passing || tool === 'dribble')) return flash('Dopo il tiro nessuno ha la palla.')
        if (passing && i !== holderNow) return flash(`La palla ce l'ha il ${holderNow + 1}.`)
        if (tool === 'dribble' && i !== holderNow && i !== run!.start.holder) return flash('Palleggia solo chi ha la palla.')
        if (tool === 'dribble' && i === run!.start.holder && outOfBounds(run!.start.off[i])) return flash('Da fuori campo non si palleggia: prima il passaggio.')
        draft = { kind: tool, who: i, pts: [from], side: 'off' }
        return
      }
    }

    // Tocco su un segno già disegnato: selezione.
    const m = markAt(phaseMarks, p)
    if (m) {
      selected = m.id
      return
    }
    const dl = defLines.find((l) => l.line.closest(p).d < 0.5)
    selected = dl ? `def:${dl.key}` : null
  }

  function onMove(p: Vec) {
    if (endDrag && selected && read && phase) {
      if (!endDrag.moved) snapshot(endDrag.before)
      endDrag.moved = true
      const q = { x: round(p.x), y: round(p.y) }
      if (selected.startsWith('def:')) {
        const path = read.defense[selected.slice(4)]
        if (path?.length) path[path.length - 1] = q
      } else {
        const a = phase.actions.find((a) => a.id === selected)
        if (a && 'path' in a && a.path.length) a.path[a.path.length - 1] = q
      }
      return
    }
    if (dragging) {
      if (!dragging.moved) snapshot(dragging.before)
      dragging.moved = true
      play.data.start.offense[dragging.i] = { x: round(p.x), y: round(p.y) }
      return
    }
    if (!draft) return
    const last = draft.pts[draft.pts.length - 1]
    if (draft.kind === 'pass' || draft.kind === 'handoff') draft.pts = [draft.pts[0], p]
    else if (dist(last, p) > 0.12) draft.pts = [...draft.pts, p]
  }

  const round = (n: number) => Math.round(n * 100) / 100

  function onUp(p: Vec) {
    if (endDrag) {
      if (endDrag.moved) dirty()
      endDrag = null
      return
    }
    if (dragging) {
      if (dragging.moved) dirty()
      dragging = null
      return
    }
    const d = draft
    draft = null
    if (!d || !phase || !read) return
    const pts = simplify(d.pts, 0.18).map((q) => ({ x: round(q.x), y: round(q.y) }))
    const length = new Line(d.pts).length

    if (d.kind === 'pass' || d.kind === 'handoff') {
      const ends = [0, 1, 2, 3, 4].map((j) => run!.plan.offAt(j, run!.plan.dur))
      let j = hit(ends, p, 1.4)
      if (j < 0 || j === d.who) j = hit(startFrame.off, p, 1.4)
      if (j < 0 || j === d.who) return flash('Rilascia il passaggio su un compagno.')
      change(() => {
        phase.actions = phase.actions.filter((a) => !(a.type === 'pass' && a.from === d.who + 1) && a.type !== 'shot')
        phase.actions.push({ id: uid(), type: 'pass', from: (d.who + 1) as Slot, to: (j + 1) as Slot, ...(d.kind === 'handoff' ? { hand: true } : {}) })
      })
      return
    }
    if (length < 0.6) return
    if (d.kind === 'defense') {
      change(() => (read.defense[String(d.who)] = pts.slice(1)))
      return
    }
    const kind = d.kind as MoveKind
    change(() => {
      const old = phase.actions.find((a) => (a.type === 'move' || a.type === 'dribble' || a.type === 'screen') && a.slot === d.who + 1)
      phase.actions = phase.actions.filter((a) => a !== old)
      const id = old?.type === kind ? old.id : uid()
      phase.actions.push({ id, type: kind, slot: (d.who + 1) as Slot, path: pts.slice(1) })
    })
    selected = null
  }

  const draftD = $derived(draft ? polyD(draft.kind === 'pass' || draft.kind === 'handoff' ? draft.pts : smooth(draft.pts)) : null)

  function removeSelected() {
    if (!selected || !phase || !read) return
    const s = selected
    change(() => {
      if (s.startsWith('def:')) delete read.defense[s.slice(4)]
      else {
        phase.actions = phase.actions.filter((a) => a.id !== s)
        for (const r of phase.reads) delete r.coverage[s]
      }
    })
    selected = null
  }

  // --- Fasi e letture ---
  function addPhase() {
    const along = phasesAlong(play.data, choices)
    if (along.at(-1)?.actions.some((a) => a.type === 'shot')) {
      selectPhase(along.length - 1)
      return flash('Dopo il tiro lo schema finisce. Togli il tiro per aggiungere una fase.')
    }
    change(() => {
      const ph = newPhase()
      const along = phasesAlong(play.data, choices)
      if (!along.length) play.data.root = ph
      else {
        const last = along[along.length - 1]
        last.reads[Math.min(choices[along.length - 1] ?? 0, last.reads.length - 1)].next = ph
      }
    })
    current = phasesAlong(play.data, choices).length - 1
    if (tool === 'arrange' || tool === 'ball') tool = 'move'
    selected = null
  }

  function selectPhase(k: number) {
    current = k
    selected = null
    previewT = null
    note = ''
    if (k < 0) tool = 'arrange'
    else if (tool === 'arrange' || tool === 'ball') tool = 'move'
  }

  function pickRead(k: number, r: number) {
    const c = choices.slice(0, k)
    c[k] = r
    choices = c
    current = k
    selected = null
    previewT = null
  }

  function deletePhase() {
    if (current < 0) return
    const k = current
    const after = phasesAlong(play.data, choices).length - 1 - k
    const forks = phases[k].reads.length > 1
    if ((after > 0 || forks) && !confirm(after > 0 ? `Elimino la fase ${k + 1} e le ${after} successive?` : `Elimino la fase ${k + 1} con tutte le sue letture?`)) return
    change(() => {
      if (k === 0) play.data.root = null
      else {
        const parent = phasesAlong(play.data, choices)[k - 1]
        parent.reads[Math.min(choices[k - 1] ?? 0, parent.reads.length - 1)].next = null
      }
    })
    choices = choices.slice(0, k)
    current = k - 1
    if (current < 0) tool = 'arrange'
  }

  // Finestra per aggiungere o modificare una lettura.
  let readDialog: HTMLDialogElement
  let readForm = $state<{ index: number | null; label: string; firstLabel: string; coverage: Record<string, Coverage>; copy: boolean }>({
    index: null,
    label: '',
    firstLabel: '',
    coverage: {},
    copy: true,
  })
  const screensHere = $derived(run ? run.plan.screens : [])

  const suggest = (cov: Record<string, Coverage>) => {
    const s = screensHere[0]
    if (!s || data.defense !== 'man') return ''
    const c = cov[s.action.id] ?? data.coverage
    const label = COVERAGE_NAMES[c]
    return label[0].toUpperCase() + label.slice(1) + (c === 'cambio' ? '' : ` sul blocco del ${s.j + 1}`)
  }

  /** Cambia la copertura; se il nome era quello proposto, lo aggiorna. */
  function setCoverage(id: string, c: Coverage) {
    const auto = readForm.label === suggest(readForm.coverage)
    readForm.coverage[id] = c
    if (auto) readForm.label = suggest(readForm.coverage)
  }

  function openAddRead() {
    if (!read) return
    const other = Object.fromEntries(
      screensHere.map((s) => {
        const c = read.coverage[s.action.id] ?? data.coverage
        return [s.action.id, (c === 'sopra' ? 'sotto' : 'sopra') as Coverage]
      }),
    )
    readForm = { index: null, label: suggest(other), firstLabel: phase!.reads.length === 1 ? read.label || suggest(read.coverage) : '', coverage: other, copy: true }
    readDialog.showModal()
  }

  function openEditRead(r: number) {
    if (!phase) return
    const rd = phase.reads[r]
    const coverage = Object.fromEntries(screensHere.map((s) => [s.action.id, rd.coverage[s.action.id] ?? data.coverage]))
    readForm = { index: r, label: rd.label, firstLabel: '', coverage, copy: false }
    readDialog.showModal()
  }

  function saveRead(e: SubmitEvent) {
    e.preventDefault()
    if (!phase || !read) return
    const k = current
    const f = readForm
    change(() => {
      if (f.index === null) {
        if (phase.reads.length === 1 && f.firstLabel.trim()) phase.reads[0].label = f.firstLabel.trim()
        const r = newRead(f.label.trim())
        r.coverage = { ...f.coverage }
        if (f.copy) r.next = cloneBranch(JSON.parse(JSON.stringify(read.next)))
        phase.reads.push(r)
      } else {
        const r = phase.reads[f.index]
        r.label = f.label.trim()
        r.coverage = { ...f.coverage }
      }
    })
    if (f.index === null) pickRead(k, phase.reads.length - 1)
    readDialog.close()
  }

  function deleteRead() {
    if (!phase || readForm.index === null || phase.reads.length < 2) return
    const r = readForm.index
    if (!confirm(`Elimino la lettura "${phase.reads[r].label || r + 1}" e tutto quello che la segue?`)) return
    change(() => phase.reads.splice(r, 1))
    pickRead(current, 0)
    readDialog.close()
  }

  // --- Anteprima ---
  let raf = 0
  let previewEnd: ReturnType<typeof setTimeout> | undefined
  function preview() {
    if (!run) return
    cancelAnimationFrame(raf)
    clearTimeout(previewEnd)
    const dur = run.plan.dur
    let last = performance.now()
    previewT = 0
    const tick = (now: number) => {
      if (previewT === null) return
      previewT += (now - last) / 1000
      last = now
      if (previewT >= dur) {
        previewT = dur
        previewEnd = setTimeout(() => (previewT = null), 700)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }

  // --- Impostazioni dello schema ---
  let settings: HTMLDialogElement
  let form = $state({ name: '', situation: 'half' as Situation, defense: 'man' as DefenseType, coverage: 'sopra' as Coverage, notes: '' })

  function openSettings() {
    form = { name: play.name, situation: data.situation, defense: data.defense, coverage: data.coverage, notes: data.notes }
    settings.showModal()
  }

  function saveSettings(e: SubmitEvent) {
    e.preventDefault()
    const f = form
    change(() => {
      play.name = f.name.trim() || play.name
      if (f.situation !== play.data.situation) {
        play.data.situation = f.situation
        play.data.start = defaultStart(f.situation)
      }
      play.data.defense = f.defense
      play.data.coverage = f.coverage
      play.data.notes = f.notes
    })
    settings.close()
  }

  async function removePlay() {
    if (!confirm(`Elimino lo schema "${play.name}"? Non si può annullare.`)) return
    clearTimeout(timer)
    try {
      await deletePlay(play.id)
    } catch (e) {
      settings.close()
      status = 'error'
      statusMsg = e instanceof Error ? e.message : String(e)
      return
    }
    status = 'saved'
    clearDraft()
    go('/')
  }

  let linkMsg = $state('')
  async function copyLink() {
    if (!play.share_token) return
    await navigator.clipboard.writeText(shareUrl(play.share_token))
    linkMsg = 'Link copiato.'
  }
  async function resetLink() {
    if (!confirm('Il link vecchio smetterà di funzionare. Continuo?')) return
    const s = await newShareLink(play.id)
    play.share_token = s
    await copyLink()
    linkMsg = 'Nuovo link copiato.'
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) restore(redo, undo)
      else restore(undo, redo)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault()
      removeSelected()
    } else if (e.key === ' ' && run) {
      e.preventDefault()
      preview()
    }
  }

  const TOOLS: { id: Tool; label: string }[] = [
    { id: 'move', label: 'Taglio' },
    { id: 'dribble', label: 'Palleggio' },
    { id: 'screen', label: 'Blocco' },
    { id: 'pass', label: 'Passaggio' },
    { id: 'handoff', label: 'Consegnato' },
    { id: 'shot', label: 'Tiro' },
    { id: 'defense', label: 'Difesa' },
  ]

  const hint = $derived.by(() => {
    if (note) return note
    if (current < 0) return tool === 'ball' ? 'Tocca il giocatore che ha la palla all’inizio.' : 'Trascina i giocatori nella posizione di partenza.'
    if (holderNow < 0 && (tool === 'dribble' || tool === 'pass' || tool === 'handoff' || tool === 'shot')) return 'Dopo il tiro nessuno ha la palla.'
    switch (tool) {
      case 'move':
        return 'Trascina da un giocatore fino a dove arriva.'
      case 'dribble':
        return `Trascina dal giocatore con la palla (il ${holderNow + 1}).`
      case 'screen':
        return 'Trascina il bloccante fino al punto del blocco. Chi passa vicino aspetta che sia piazzato.'
      case 'pass':
        return `Trascina dal ${holderNow + 1} fino al compagno. La palla parte quando lui arriva.`
      case 'handoff':
        return `Trascina dal ${holderNow + 1} al compagno che gli passa accanto: la palla passa di mano quando arriva.`
      case 'shot':
        return `Tocca il ${holderNow + 1} per farlo tirare.`
      case 'defense':
        return 'Trascina un difensore per correggerne il movimento in questa lettura. Gli altri si muovono da soli.'
    }
    return ''
  })

  const statusText = $derived(
    { saved: 'Salvato', pending: 'Modifiche…', saving: 'Salvataggio…', error: 'Non salvato', conflict: 'Conflitto' }[status],
  )
</script>

<svelte:window onkeydown={onKey} onbeforeunload={beforeUnload} />

<div class="editor">
  <header class="bar">
    <a class="btn quiet icon" href="#/schema/{play.id}" aria-label="Chiudi l'editor" title="Chiudi l'editor"><Icon name="back" /></a>
    <h1>{play.name}</h1>
    <span class="status small" class:bad={status === 'error' || status === 'conflict'} title={statusMsg}>{statusText}</span>
    <button class="btn quiet icon" onclick={openSettings} aria-label="Impostazioni dello schema" title="Impostazioni dello schema"><Icon name="more" /></button>
  </header>

  {#if status === 'conflict' || status === 'error'}
    <div class="alert small" role="alert">
      {statusMsg}
      {#if status === 'conflict'}
        <button class="btn" onclick={reloadFromServer}>Ricarica la versione salvata</button>
      {:else}
        <button class="btn" onclick={() => ((status = 'pending'), save())}>Riprova</button>
      {/if}
    </div>
  {/if}

  {#if pendingDraft}
    <div class="alert draft small" role="alert">
      Su questo dispositivo ci sono modifiche a questo schema che non erano state salvate.
      <button class="btn" onclick={restoreDraft}>Ripristinale</button>
      <button class="btn quiet" onclick={discardDraft}>Scartale</button>
    </div>
  {/if}

  <div class="stage">
    <Board
      situation={data.situation}
      {color}
      {frame}
      marks={phaseMarks}
      {trails}
      {defLines}
      {selected}
      draft={draftD}
      handles={handle ? [handle] : []}
      warn={checks.risky}
      fade={previewT !== null ? 0.4 : 1}
      label="Lavagna di {play.name}"
      ondown={onDown}
      onmove={onMove}
      onup={onUp}
    />
  </div>

  <div class="tools" role="toolbar" aria-label="Strumenti">
    {#if current < 0}
      <div class="seg">
        <button aria-pressed={tool === 'arrange'} onclick={() => (tool = 'arrange')}>Sposta</button>
        <button aria-pressed={tool === 'ball'} onclick={() => (tool = 'ball')}>Palla</button>
      </div>
    {:else}
      <div class="toolset">
        {#each TOOLS as t}
          <button class="tool" aria-pressed={tool === t.id} onclick={() => ((tool = t.id), (note = ''))}>
            <Sign kind={t.id as SignKind} />
            {t.label}
          </button>
        {/each}
      </div>
    {/if}
    <div class="right">
      {#if selected}
        <button class="btn danger" onclick={removeSelected}><Icon name="trash" /> Elimina</button>
      {/if}
      <button class="btn icon" onclick={() => restore(undo, redo)} disabled={!canUndo} aria-label="Annulla" title="Annulla"><Icon name="undo" /></button>
      <button class="btn icon" onclick={() => restore(redo, undo)} disabled={!canRedo} aria-label="Ripeti" title="Ripeti"><Icon name="redo" /></button>
    </div>
  </div>

  <p class="hint small" class:warn={!!note}>{hint}</p>
  {#each checks.list as w}
    <p class="hint small warn">{w}</p>
  {/each}

  <Phases
    {phases}
    {current}
    {choices}
    withStart
    canAdd
    onphase={selectPhase}
    onread={pickRead}
    onadd={addPhase}
    onaddread={phase ? openAddRead : undefined}
    oneditread={openEditRead}
  />

  {#if run}
    <div class="row">
      <button class="btn" onclick={preview}><Icon name="play" /> Prova la fase</button>
      <button class="btn quiet danger" onclick={deletePhase}><Icon name="trash" /> Elimina fase</button>
    </div>
  {/if}
</div>

<dialog bind:this={readDialog}>
  <form onsubmit={saveRead}>
    <h2>{readForm.index === null ? 'Nuova lettura' : 'Lettura'}</h2>
    <p class="muted small">L'attacco fa le stesse cose, cambia cosa fa la difesa in questa fase e come si prosegue.</p>
    {#if readForm.firstLabel !== '' || (readForm.index === null && phase?.reads.length === 1)}
      <label class="field">
        Nome della lettura che c'è già
        <input type="text" bind:value={readForm.firstLabel} maxlength="60" />
      </label>
    {/if}
    <label class="field">
      {readForm.index === null ? 'Nome della nuova lettura' : 'Nome'}
      <input type="text" bind:value={readForm.label} maxlength="60" placeholder="Es. Il 5 aiuta sulla penetrazione" />
    </label>
    {#if data.defense === 'man'}
      {#each screensHere as s}
        <div class="field">
          Sul blocco del {s.j + 1}, il difensore di chi lo usa
          <div class="seg">
            {#each Object.entries(COVERAGE_NAMES) as [c, label]}
              <button type="button" aria-pressed={readForm.coverage[s.action.id] === c} onclick={() => setCoverage(s.action.id, c as Coverage)}>{label}</button>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
    {#if readForm.index === null}
      <label class="check">
        <input type="checkbox" bind:checked={readForm.copy} />
        Copia le fasi successive, da modificare
      </label>
      <p class="muted small">Puoi anche correggere a mano i difensori con lo strumento Difesa.</p>
    {/if}
    <div class="actions">
      {#if readForm.index !== null && (phase?.reads.length ?? 0) > 1}
        <button type="button" class="btn quiet danger" onclick={deleteRead}>Elimina</button>
      {/if}
      <button type="button" class="btn quiet" onclick={() => readDialog.close()}>Annulla</button>
      <button class="btn primary">{readForm.index === null ? 'Aggiungi' : 'Salva'}</button>
    </div>
  </form>
</dialog>

<dialog bind:this={settings}>
  <form onsubmit={saveSettings}>
    <h2>Schema</h2>
    <label class="field">
      Nome
      <input type="text" bind:value={form.name} maxlength="80" />
    </label>
    <div class="field">
      Situazione
      <div class="seg">
        {#each Object.entries(SITUATION_NAMES) as [k, label]}
          <button type="button" aria-pressed={form.situation === k} onclick={() => (form.situation = k as Situation)}>{label}</button>
        {/each}
      </div>
      {#if form.situation !== data.situation}<span class="small">Le posizioni di partenza tornano quelle predefinite.</span>{/if}
    </div>
    <div class="field">
      Contro
      <div class="seg">
        {#each Object.entries(DEFENSE_NAMES) as [k, label]}
          <button type="button" aria-pressed={form.defense === k} onclick={() => (form.defense = k as DefenseType)}>{label}</button>
        {/each}
      </div>
    </div>
    {#if form.defense === 'man'}
      <div class="field">
        Sui blocchi, di solito la difesa
        <div class="seg">
          {#each Object.entries(COVERAGE_NAMES) as [k, label]}
            <button type="button" aria-pressed={form.coverage === k} onclick={() => (form.coverage = k as Coverage)}>{label}</button>
          {/each}
        </div>
      </div>
    {/if}
    <label class="field">
      Note per i giocatori
      <textarea bind:value={form.notes} maxlength="2000"></textarea>
    </label>
    <div class="field">
      Link da condividere
      <div class="row">
        <button type="button" class="btn" onclick={copyLink}><Icon name="share" /> Copia</button>
        <button type="button" class="btn quiet" onclick={resetLink}>Crea un link nuovo</button>
      </div>
      {#if linkMsg}<span class="small">{linkMsg}</span>{/if}
    </div>
    <div class="actions">
      <button type="button" class="btn quiet danger" onclick={removePlay}>Elimina schema</button>
      <button type="button" class="btn quiet" onclick={() => settings.close()}>Annulla</button>
      <button class="btn primary">Salva</button>
    </div>
  </form>
</dialog>

<style>
  .editor {
    max-width: 860px;
    margin: 0 auto;
    padding: 0 16px 40px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .bar {
    padding-bottom: 0;
  }
  .status {
    color: var(--muted);
    white-space: nowrap;
  }
  .status.bad {
    color: var(--danger);
    font-weight: 600;
  }
  .alert {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid #f0c7c2;
    border-radius: var(--radius);
    background: #fdf3f2;
    color: var(--danger);
  }
  .alert.draft {
    border-color: var(--border);
    background: var(--surface);
    color: var(--ink);
  }
  .stage {
    margin: 0 -16px;
    background: var(--floor-out);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .toolset {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    max-width: 100%;
    scrollbar-width: none;
  }
  .tool {
    display: grid;
    justify-items: center;
    gap: 1px;
    min-width: 66px;
    padding: 5px 6px 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    font-size: 0.78rem;
    cursor: pointer;
  }
  .tool[aria-pressed='true'] {
    border-color: var(--ink);
    background: var(--ink);
    color: #fff;
  }
  .right {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }
  .hint {
    margin: 0;
    color: var(--muted);
    min-height: 1.4em;
  }
  .hint.warn {
    color: var(--danger);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .seg {
    width: fit-content;
    max-width: 100%;
    flex-wrap: wrap;
  }
  .field .seg {
    color: var(--ink);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  dialog p {
    margin: -6px 0 0;
  }
  @media (max-width: 520px) {
    .toolset {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      width: 100%;
    }
    .tool {
      min-width: 0;
    }
  }
  @media (min-width: 860px) {
    .stage {
      margin: 0;
      border-radius: 10px;
      overflow: hidden;
    }
  }
</style>
