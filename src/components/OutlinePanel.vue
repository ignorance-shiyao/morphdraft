<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDocumentStore } from '../stores/document'
import { useSyncStore } from '../stores/sync'
import { parseOutline } from '../core/markdown/outline'
import { moveSection } from '../core/markdown/sectionMove'
import Icon from './Icon.vue'
import { useI18n } from 'vue-i18n'

const doc = useDocumentStore()
const sync = useSyncStore()
const { t } = useI18n({ useScope: 'global' })

const items = computed(() => parseOutline(doc.markdown))
const minLevel = computed(() => (items.value.length ? Math.min(...items.value.map((i) => i.level)) : 1))
const collapsedLines = ref<Set<number>>(new Set())

interface OutlineNode {
  index: number
  level: number
  text: string
  line: number
  children: OutlineNode[]
}

const tree = computed(() => {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  items.value.forEach((it, index) => {
    const node: OutlineNode = { ...it, index, children: [] }
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push(node)
  })
  return roots
})

const visibleItems = computed(() => {
  const out: OutlineNode[] = []
  function walk(nodes: OutlineNode[]) {
    for (const node of nodes) {
      out.push(node)
      if (node.children.length && !collapsedLines.value.has(node.line)) walk(node.children)
    }
  }
  walk(tree.value)
  return out
})

watch(
  () => doc.currentId,
  () => {
    const collapsed = new Set<number>()
    function collect(nodes: OutlineNode[]) {
      for (const node of nodes) {
        if (node.level >= 2 && node.children.length) collapsed.add(node.line)
        collect(node.children)
      }
    }
    collect(tree.value)
    collapsedLines.value = collapsed
  },
  { immediate: true },
)

// 大纲高亮跟随「最近一次定位」：编辑时跟光标行，滚动时跟视口顶部行（滚动任一区域都会更新 scrollLine）。
// 这样大纲、源码、预览三个区域的「当前位置」保持一致，而不是只认光标。
const focusLine = ref(sync.cursorLine)
watch(() => sync.cursorLine, (l) => { focusLine.value = l })
watch(() => sync.scrollNonce, () => { focusLine.value = sync.scrollLine })

const activeVisibleLine = computed(() => {
  let line = -1
  for (const it of visibleItems.value) {
    if (it.line <= focusLine.value) line = it.line
    else break
  }
  return line
})

function go(line: number) {
  sync.requestGoto(line) // 源码：定位 + 选中（居中）
  sync.requestScroll(line, 'editor') // 预览：把同一处对齐到顶部，保持三区一致（不再只动源码）
}

// 找到与给定行同级（同一父节点下）的兄弟节点列表
function siblingsOf(line: number): OutlineNode[] {
  let found: OutlineNode[] = []
  function walk(nodes: OutlineNode[]): boolean {
    if (nodes.some((n) => n.line === line)) { found = nodes; return true }
    for (const n of nodes) if (walk(n.children)) return true
    return false
  }
  walk(tree.value)
  return found
}

function toggleNode(node: OutlineNode, e: Event) {
  e.stopPropagation()
  const next = new Set(collapsedLines.value)
  if (next.has(node.line)) {
    // 手风琴：展开当前节点的同时，收起同级其它已展开的节点
    for (const sib of siblingsOf(node.line)) {
      if (sib.line !== node.line && sib.children.length) next.add(sib.line)
    }
    next.delete(node.line)
  } else {
    next.add(node.line)
  }
  collapsedLines.value = next
}

// —— 拖拽重排 ——
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

function onDragStart(e: DragEvent, index: number) {
  dragIndex.value = index
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', String(index))
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  overIndex.value = index
}

function onDragLeave() {
  overIndex.value = null
}

function onDrop(e: DragEvent, toIndex: number) {
  e.preventDefault()
  const fromIndex = dragIndex.value
  dragIndex.value = null
  overIndex.value = null
  if (fromIndex === null || fromIndex === toIndex) return
  const newMd = moveSection(doc.markdown, items.value, fromIndex, toIndex)
  if (newMd !== doc.markdown) doc.setMarkdown(newMd)
}

function onDragEnd() {
  dragIndex.value = null
  overIndex.value = null
}
</script>

<template>
  <div class="outline">
    <ul v-if="items.length" class="list">
      <li
        v-for="it in visibleItems"
        :key="it.line"
        :class="{
          active: it.line === activeVisibleLine,
          'drag-over': overIndex === it.index && dragIndex !== null && dragIndex !== it.index,
          collapsed: it.children.length && collapsedLines.has(it.line),
        }"
        :style="{ paddingLeft: 10 + (it.level - minLevel) * 14 + 'px' }"
        :title="it.text"
        draggable="true"
        @click="go(it.line)"
        @dragstart="onDragStart($event, it.index)"
        @dragover="onDragOver($event, it.index)"
        @dragleave="onDragLeave"
        @drop="onDrop($event, it.index)"
        @dragend="onDragEnd"
      >
        <button
          v-if="it.children.length"
          class="twisty"
          :aria-label="collapsedLines.has(it.line) ? t('outline.expand') : t('outline.collapse')"
          @click="toggleNode(it, $event)"
        >
          <Icon name="chevron-down" :size="12" />
        </button>
        <span v-else class="twisty-spacer"></span>
        <span class="lvl">H{{ it.level }}</span>
        <span class="t">{{ it.text }}</span>
      </li>
    </ul>
    <div v-else class="empty">{{ t('outline.empty') }}</div>
  </div>
</template>

<style scoped>
.outline { flex: 1 1 auto; overflow: auto; padding: 6px; }
.list { list-style: none; margin: 0; padding: 0; }
.list li {
  display: flex; align-items: center; gap: 7px; cursor: grab;
  padding: 6px 8px; border-radius: 7px; font-size: 13px; color: var(--app-fg);
  border-left: 2px solid transparent;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.list li:active { cursor: grabbing; }
.list li:hover { background: var(--app-hover); }
.list li.active {
  background: var(--app-active);
  border-left-color: var(--app-primary-color);
}
.list li.drag-over {
  border-top: 2px solid var(--app-primary-color);
}
.twisty {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  color: color-mix(in srgb, var(--app-muted) 82%, transparent);
  background: transparent;
  cursor: pointer;
  transition: color 0.14s ease, background 0.14s ease, transform 0.14s ease;
}
.twisty:hover {
  color: var(--app-primary-color);
  background: var(--app-hover);
}
.list li.collapsed .twisty {
  transform: rotate(-90deg);
}
.twisty-spacer {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
}
.lvl { flex: 0 0 auto; font-size: 10px; font-weight: 700; color: var(--app-muted); opacity: 0.7; }
.t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { padding: 24px 12px; text-align: center; color: var(--app-muted); font-size: 12px; }
</style>
