<script lang="ts" module>
  const PATHS = {
    back: 'M15 5l-7 7 7 7',
    play: 'M8 5.5v13l10.5-6.5z',
    pause: 'M8 5v14M16 5v14',
    prev: 'M7 6v12M18 6l-8 6 8 6z',
    next: 'M17 6v12M6 6l8 6-8 6z',
    restart: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4',
    share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
    plus: 'M12 5v14M5 12h14',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
    cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
    flat: 'M4 5h16v14H4zM4 12h16M12 12a2.5 2.5 0 0 1 0-5',
    team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-6 6.5-6s5.9 2.4 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.4c2 .8 3.2 2.9 3.5 5.6',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.7 1l-.3 2H11l-.3-2a7 7 0 0 1-1.7-1l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L5 9.3l2-3.4 1.9.7a7 7 0 0 1 1.7-1L11 3.6h4l.3 2a7 7 0 0 1 1.7 1l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z',
    check: 'M5 12.5l4.5 4.5L19 7',
    close: 'M6 6l12 12M18 6L6 18',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
  }
  export type IconName = keyof typeof PATHS
</script>

<script lang="ts">
  let { name, size = 20 }: { name: IconName; size?: number } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={name === 'play' || name === 'prev' || name === 'next' ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width={name === 'more' ? 3.2 : 1.8}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>
