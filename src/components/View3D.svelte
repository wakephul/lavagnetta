<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import * as THREE from 'three'
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
  import { BASKET, BOARD_Y, RIM_R, courtShapes, viewFor } from '../lib/court'
  import { inkOn } from '../lib/color'
  import { dist } from '../lib/geo'
  import type { Frame } from '../lib/sim'
  import type { Situation } from '../lib/types'

  type Props = { situation: Situation; color: string; frame: Frame; names?: (string | null)[]; me?: number | null }
  let { situation, color, frame, names = [], me = null }: Props = $props()

  // Il campo 3D usa le stesse misure della lavagna: x del campo → X, y del campo → Z, altezza → Y.
  const CX = 7.5
  const PX = 80

  let host: HTMLDivElement
  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene
  let camera: THREE.PerspectiveCamera
  let controls: OrbitControls
  let off: THREE.Group[] = []
  let def: THREE.Group[] = []
  let ball: THREE.Mesh
  let ring: THREE.Mesh
  let resize: ResizeObserver
  let floorTex: THREE.CanvasTexture | null = null
  let ready = $state(false)

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

  function mix(a: string, b: string, k: number) {
    const ca = new THREE.Color(a)
    return '#' + ca.lerp(new THREE.Color(b), 1 - k).getHexString()
  }

  function floorTexture(): THREE.CanvasTexture {
    const v = viewFor(situation)
    const c = document.createElement('canvas')
    c.width = Math.round(v.w * PX)
    c.height = Math.round(v.h * PX)
    const g = c.getContext('2d')!
    g.scale(PX, PX)
    g.translate(-v.x, -v.y)
    const floor = css('--floor')
    const fills = { floor, out: css('--floor-out'), paint: mix(color, floor, 0.17) }
    const strokes = { line: css('--line'), ink: css('--ink'), rim: css('--rim') }
    g.lineCap = 'round'
    // Ferro e tabellone esistono già in 3D: sul pavimento non vanno disegnati.
    for (const s of courtShapes(situation).filter((s) => s.stroke !== 'rim' && s.stroke !== 'ink')) {
      const p = new Path2D(s.d)
      if (s.fill) {
        g.fillStyle = fills[s.fill]
        g.fill(p)
      }
      if (s.stroke) {
        g.strokeStyle = strokes[s.stroke]
        g.lineWidth = s.width ?? 0.05
        g.setLineDash(s.dash ?? [])
        g.stroke(p)
      }
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }

  function textSprite(text: string, size: number, fg: string, bg: string | null) {
    const c = document.createElement('canvas')
    const g = c.getContext('2d')!
    const font = `700 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
    g.font = font
    const w = Math.max(96, Math.ceil(g.measureText(text).width) + 40)
    c.width = w
    c.height = 96
    g.font = font
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (bg) {
      g.fillStyle = bg
      g.beginPath()
      g.roundRect(4, 8, w - 8, 80, 40)
      g.fill()
    }
    g.lineWidth = 10
    g.strokeStyle = bg ? 'transparent' : 'rgba(255,255,255,0.9)'
    if (!bg) g.strokeText(text, w / 2, 50)
    g.fillStyle = fg
    g.fillText(text, w / 2, 50)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
    sprite.scale.set((size * w) / 96, size, 1)
    sprite.renderOrder = 10
    return sprite
  }

  function player(fill: string, n: number, side: 'off' | 'def') {
    const g = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: fill, roughness: 0.65 })
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.95, 6, 16), mat)
    body.position.y = 0.22 + 0.475
    body.castShadow = true
    g.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), mat)
    head.position.y = 1.53
    head.castShadow = true
    g.add(head)
    const num = textSprite(String(n), 0.42, side === 'off' ? inkOn(color) : '#fff', side === 'off' ? color : css('--def'))
    num.position.y = 2.15
    g.add(num)
    return g
  }

  function nameSprites() {
    off.forEach((g, i) => {
      const old = g.getObjectByName('name')
      if (old) g.remove(old)
      const n = names[i]
      if (!n) return
      const s = textSprite(n, 0.34, css('--ink'), null)
      s.name = 'name'
      s.position.y = 2.55
      g.add(s)
    })
  }

  function hoop() {
    const g = new THREE.Group()
    const white = new THREE.MeshStandardMaterial({ color: '#f5f5f2', roughness: 0.4, transparent: true, opacity: 0.85 })
    const dark = new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.6 })
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.03), white)
    board.position.set(0, 2.9 + 0.525, BOARD_Y)
    g.add(board)
    const frameBox = new THREE.Mesh(new THREE.BoxGeometry(0.59, 0.45, 0.032), new THREE.MeshBasicMaterial({ color: '#c44d12', wireframe: true }))
    frameBox.position.set(0, 3.05 + 0.2, BOARD_Y + 0.005)
    g.add(frameBox)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.012, 8, 32), new THREE.MeshStandardMaterial({ color: '#c44d12' }))
    rim.rotation.x = Math.PI / 2
    rim.position.set(0, 3.05, BASKET.y)
    g.add(rim)
    const net = new THREE.Mesh(
      new THREE.CylinderGeometry(RIM_R, RIM_R * 0.6, 0.42, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.7 }),
    )
    net.position.set(0, 3.05 - 0.21, BASKET.y)
    g.add(net)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 12), dark)
    pole.position.set(0, 1.7, -1.1)
    pole.castShadow = true
    g.add(pole)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.3), dark)
    arm.position.set(0, 3.35, (BOARD_Y - 1.1) / 2 - 0.05)
    g.add(arm)
    return g
  }

  const presets = {
    alto: { pos: [0, 15, 13], at: [0, 0, 6] },
    dietro: { pos: [-3.2, 7, -4], at: [0, 0.5, 7] },
    lato: { pos: [-12, 6, 6], at: [0, 0.5, 5.5] },
    campo: { pos: [0, 4, 17], at: [0, 1.5, 3] },
  } as const
  type Preset = keyof typeof presets
  let preset = $state<Preset>('alto')

  function setPreset(p: Preset) {
    preset = p
    const c = presets[p]
    camera.position.set(c.pos[0], c.pos[1], c.pos[2])
    controls.target.set(c.at[0], c.at[1], c.at[2])
    controls.update()
    render()
  }

  function render() {
    if (renderer) renderer.render(scene, camera)
  }

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    scene = new THREE.Scene()
    scene.background = new THREE.Color(css('--floor-out'))
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)

    scene.add(new THREE.HemisphereLight('#ffffff', '#b9a98f', 1.6))
    const sun = new THREE.DirectionalLight('#ffffff', 1.4)
    sun.position.set(-6, 14, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 })
    scene.add(sun)

    const v = viewFor(situation)
    floorTex = floorTexture()
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(v.w, v.h), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(v.x + v.w / 2 - CX, 0, v.y + v.h / 2)
    floor.receiveShadow = true
    scene.add(floor)
    scene.add(hoop())

    off = [0, 1, 2, 3, 4].map((i) => player(color, i + 1, 'off'))
    def = [0, 1, 2, 3, 4].map((i) => player(css('--def'), i + 1, 'def'))
    for (const g of [...off, ...def]) scene.add(g)
    nameSprites()

    ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.01
    scene.add(ring)

    ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshStandardMaterial({ color: css('--ball'), roughness: 0.7 }))
    ball.castShadow = true
    scene.add(ball)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.maxPolarAngle = Math.PI / 2 - 0.05
    controls.minDistance = 4
    controls.maxDistance = 40
    controls.addEventListener('change', render)

    resize = new ResizeObserver(() => {
      const w = host.clientWidth
      const h = Math.min(Math.round(w * 0.82), innerHeight - 190)
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    })
    resize.observe(host)
    setPreset('alto')
    ready = true
  })

  $effect(() => {
    if (!ready) return
    const f = frame
    f.off.forEach((p, i) => off[i].position.set(p.x - CX, 0, p.y))
    f.def.forEach((p, i) => def[i].position.set(p.x - CX, 0, p.y))
    const k = f.holder >= 0 ? 1 : Math.min(1, dist(f.ball, BASKET) / 1.5)
    ball.position.set(f.ball.x - CX + 0.3 * k, Math.max(0.12, f.bz), f.ball.y + 0.22 * k)
    ring.visible = me !== null
    if (me !== null) ring.position.set(f.off[me].x - CX, 0.01, f.off[me].y)
    render()
  })

  $effect(() => {
    if (!ready) return
    void names
    nameSprites()
    render()
  })

  onDestroy(() => {
    resize?.disconnect()
    controls?.dispose()
    scene?.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material & { map?: THREE.Texture }
      mat?.map?.dispose()
      mat?.dispose?.()
    })
    floorTex?.dispose()
    renderer?.dispose()
    renderer?.domElement.remove()
  })
</script>

<div class="v3d">
  <div bind:this={host} class="host"></div>
  <div class="cams seg" role="group" aria-label="Inquadratura">
    <button aria-pressed={preset === 'alto'} onclick={() => setPreset('alto')}>Dall'alto</button>
    <button aria-pressed={preset === 'dietro'} onclick={() => setPreset('dietro')}>Dietro il canestro</button>
    <button aria-pressed={preset === 'lato'} onclick={() => setPreset('lato')}>Di lato</button>
    <button aria-pressed={preset === 'campo'} onclick={() => setPreset('campo')}>Dal campo</button>
  </div>
</div>

<style>
  .v3d {
    position: relative;
  }
  .host :global(canvas) {
    display: block;
    touch-action: none;
  }
  .cams {
    position: absolute;
    left: 8px;
    bottom: 8px;
    max-width: calc(100% - 16px);
    flex-wrap: wrap;
    opacity: 0.94;
  }
  .cams button {
    font-size: 0.82rem;
    min-height: 32px;
    padding: 0 10px;
  }
</style>
