<script setup lang="ts">
// 统一的描边图标（24x24，stroke=currentColor），替代零散 emoji/字符按钮。
const props = withDefaults(defineProps<{ name: string; size?: number; stroke?: number }>(), {
  size: 16,
  stroke: 1.8,
})

const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  import: 'M12 3v10M12 13l-3.5-3.5M12 13l3.5-3.5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  chart: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-9',
  callout: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
  'chevrons-left': 'M11 18l-6-6 6-6M18 18l-6-6 6-6',
  'chevrons-right': 'M13 6l6 6-6 6M6 6l6 6-6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  pencil: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  history: 'M3 3v5h5M3.05 13a9 9 0 1 0 .5-4M12 7v5l3 2',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  search: 'M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z',
  close: 'M18 6L6 18M6 6l12 12',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 14V10M9 2h6M18 6l1.5-1.5',
  notes: 'M4 4h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 8h8M8 12h8M8 16h5',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  folder: 'M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  'folder-plus': 'M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v6M9 14h6',
  'folder-open': 'M3 8V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1M2.5 11.5h19l-1.8 7.2A2 2 0 0 1 17.7 20H6.3a2 2 0 0 1-1.95-1.55z',
  'panel-left': 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 4v16',
  palette: 'M12 22a10 10 0 1 1 0-20 8.5 8.5 0 0 1 8.5 8.5c0 2-1.6 3.5-3.6 3.5H15a2 2 0 0 0-2 2c0 .5.2.9.5 1.3.3.4.5.8.5 1.2a2 2 0 0 1-2 2zM7.5 10.5h.01M11 7h.01M15.5 8.5h.01',
  check: 'M20 6L9 17l-5-5',
  database: 'M12 5c4.97 0 9-1.12 9-2.5S16.97 0 12 0 3 1.12 3 2.5 7.03 5 12 5zM3 2.5v7c0 1.38 4.03 2.5 9 2.5s9-1.12 9-2.5v-7M3 9.5v7c0 1.38 4.03 2.5 9 2.5s9-1.12 9-2.5v-7',
  copy: 'M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  more: 'M12 5v.01M12 12v.01M12 19v.01',
  'more-horizontal': 'M5 12v.01M12 12v.01M19 12v.01',
  'grip-vertical': 'M9 5.5h.01M15 5.5h.01M9 12h.01M15 12h.01M9 18.5h.01M15 18.5h.01',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M12 17h.01',
  heading: 'M6 12h12M6 20V4M18 20V4',
  bold: 'M6 4h7a4 4 0 0 1 0 8H6zM6 12h8a4 4 0 0 1 0 8H6z',
  italic: 'M19 4h-9M14 20H5M15 4L9 20',
  strike: 'M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  link: 'M10 13a5 5 0 0 0 7.07.07l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07-.07l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  'list-ordered': 'M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M4 16h2v1l-2 1.5V20h2',
  'check-square': 'M4 4h16v16H4zM8 12l2.5 2.5L16 9',
  'check-circle': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12l2.5 2.5L16 9',
  circle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  'arrow-down': 'M12 5v14M6 13l6 6 6-6',
  quote: 'M6 17h3l2-4V7H5v6h3zM14 17h3l2-4V7h-6v6h3z',
  divider: 'M5 12h14',
  table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  highlight: 'M4 21h16M6 17l8-8 3 3-8 8H6zM13 6l3-3 3 3-3 3z',
  underline: 'M6 4v6a6 6 0 0 0 12 0V4M4 21h16',
  pin: 'M14 4l6 6-3.2 1.1-4.9 4.9-.3 4-2.8-2.8-4.1 4.1-1.4-1.4 4.1-4.1-2.8-2.8 4-.3 4.9-4.9L14 4z',
  'pin-off': 'M14 4l6 6-3.2 1.1-2.4 2.4M9.9 15.9l-.3 4-2.8-2.8-4.1 4.1-1.4-1.4 4.1-4.1-2.8-2.8 4-.3 2.1-2.1M3 3l18 18',
  'row-above': 'M12 19V5M5 12l7-7 7 7',
  'row-below': 'M12 5v14M5 12l7 7 7-7',
  columns: 'M12 3v18M3 3h18v18H3z',
  rows: 'M3 12h18M3 3h18v18H3z',
  play: 'M5 3l14 9-14 9V3z',
  'edit-pen': 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  pointer: 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51zM13 13l6 6',
  sigma: 'M18 7V4H6l6 8-6 8h12v-3',
  smile: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  message: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  'alert-triangle': 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  'chevron-right-square': 'M4 4h16v16H4zM10 8l4 4-4 4',
  'code-square': 'M4 4h16v16H4zM10 9l-3 3 3 3M14 9l3 3-3 3',
  card: 'M4 6h16v12H4zM4 10h16',
  timeline: 'M6 5v14M6 7h10M6 12h13M6 17h8',
  steps: 'M4 7h4v4H4zM10 9h10M4 15h4v4H4zM10 17h10',
  footnote: 'M5 6h8M9 6v12M15 7l4 4M19 7l-4 4',
  toc: 'M5 6h14M5 12h14M5 18h14M3 6h.01M3 12h.01M3 18h.01',
  flow: 'M6 5h6v6H6zM15 13h6v6h-6zM9 11v3a2 2 0 0 0 2 2h4M12 8h4a2 2 0 0 1 2 2v3',
  monitor: 'M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 21h8M12 17v4',
  maximize: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3',
  laser: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  'align-left': 'M17 10H3M21 6H3M21 14H3M17 18H3',
  'align-center': 'M18 10H6M21 6H3M21 14H3M18 18H6',
  'align-right': 'M21 10H7M21 6H3M21 14H3M21 18H7',
  rounded: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2',
  shadow: 'M8 4h12v12M4 8h8v8H4z',
  replace: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.65 4.36A9 9 0 0 0 20.5 15',
  type: 'M4 7V5h16v2M9 19h6M12 5v14',
}
</script>

<template>
  <svg
    class="ico"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="props.stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="PATHS[props.name] || ''" />
  </svg>
</template>

<style scoped>
.ico { display: inline-block; vertical-align: -0.18em; flex: 0 0 auto; }
</style>
