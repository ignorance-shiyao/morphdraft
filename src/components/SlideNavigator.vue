<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { renderMarkdown } from '../core/markdown'
import { deleteSlide, duplicateSlide, getSlidePages, insertSlideAfter, moveSlide, setSlideLayout, type SlidePage } from '../core/slides/pages'
import type { SlideLayout } from '../core/slides/layout'
import { suggestLayouts } from '../core/slides/suggest'
import { lineToSlideIndex } from '../core/slides/sourcemap'
import { useDialog } from '../composables/useDialog'
import { useDocumentStore } from '../stores/document'
import { useSyncStore } from '../stores/sync'
import { useUiStore } from '../stores/ui'
import Icon from './Icon.vue'
import type { SlideDisplayPage } from '../core/slides/reveal'
import { findSkin, skinCssVars } from '../core/slides/skins'
import { structureSlide } from '../core/slides/structure'
import { SLIDE_RATIOS } from '../core/paper'

interface NavPage extends SlideDisplayPage {
  source: SlidePage
}

const props = defineProps<{ active?: number; displayPages?: SlideDisplayPage[] }>()
const emit = defineEmits<{
  select: [index: number]
  exportPng: [indices: number[]]
}>()

const doc = useDocumentStore()
const sync = useSyncStore()
const ui = useUiStore()
const dialog = useDialog()
const { t } = useI18n({ useScope: 'global' })

const pages = computed(() => getSlidePages(doc.markdown))
const navPages = computed<NavPage[]>(() => {
  const sourcePages = pages.value
  if (!props.displayPages?.length) {
    return sourcePages.map((p) => ({
      index: p.index,
      startLine: p.startLine,
      title: p.title,
      source: p,
    }))
  }
  return props.displayPages.map((p) => {
    const sourceIndex = Math.max(0, lineToSlideIndex(sourcePages.map((s) => s.startLine), p.startLine))
    return { ...p, source: sourcePages[sourceIndex] ?? sourcePages[0] }
  })
})
const pageCount = computed(() => navPages.value.length)
const activeIndex = computed(() =>
  typeof props.active === 'number'
    ? props.active
    : Math.max(0, lineToSlideIndex(navPages.value.map((p) => p.startLine), sync.cursorLine)),
)

const stripEl = ref<HTMLElement | null>(null)
const thumbSnap = ref(false)
const selectedIndices = ref<number[]>([])
const selectedCount = computed(() => selectedIndices.value.length)

function go(page: NavPage) {
  emit('select', page.index)
  sync.requestGoto(page.startLine)
}

function syncActiveThumb() {
  const strip = stripEl.value
  if (!strip) return
  const active = strip.querySelector<HTMLElement>('.card.active')
  if (!active) return
  const targetLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2
  strip.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' })
}

watch(
  () => [activeIndex.value, navPages.value.length, ui.slideThumbHeight, ui.slideRatio],
  () => nextTick(syncActiveThumb),
  { flush: 'post' },
)

// ---- ⋮ 菜单 ----
const menuIndex = ref<number | null>(null)
const menuPos = ref({ left: 0, bottom: 0 })
const menuPage = computed(() => navPages.value.find((page) => page.index === menuIndex.value) ?? null)
function toggleMenu(i: number, e: MouseEvent) {
  if (menuIndex.value === i) { closeMenu(); return }
  const card = (e.currentTarget as HTMLElement | null)?.closest('.card')
  const rect = card?.getBoundingClientRect()
  if (rect) {
    menuPos.value = {
      left: Math.max(8, Math.min(window.innerWidth - 188, rect.left)),
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    }
  }
  menuIndex.value = i
}
function closeMenu() { menuIndex.value = null }
function isSelected(index: number) { return selectedIndices.value.includes(index) }
function toggleSelected(index: number) {
  selectedIndices.value = isSelected(index)
    ? selectedIndices.value.filter((value) => value !== index)
    : [...selectedIndices.value, index].sort((a, b) => a - b)
}
function exportPages(indices: number[]) {
  closeMenu()
  emit('exportPng', indices)
}
function exportSelected() {
  if (!selectedIndices.value.length) return
  exportPages(selectedIndices.value)
}
onMounted(() => {
  window.addEventListener('click', closeMenu)
  nextTick(syncActiveThumb)
})
onBeforeUnmount(() => window.removeEventListener('click', closeMenu))

// ---- 拖拽重排（封面页 index 0 固定）----
const dragIndex = ref<number | null>(null)
const dropTarget = ref<{ index: number; before: boolean } | null>(null)
function onDragStart(i: number, e: DragEvent) {
  if (i === 0) { e.preventDefault(); return }
  dragIndex.value = i
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }
  const card = (e.currentTarget as HTMLElement | null)?.querySelector('.thumb')
  if (card && e.dataTransfer) {
    e.dataTransfer.setDragImage(card, card.clientWidth / 2, card.clientHeight / 2)
  }
}
function onDragOver(i: number, e: DragEvent) {
  if (dragIndex.value === null || i === 0) return
  e.preventDefault()
  const card = e.currentTarget as HTMLElement
  const rect = card.getBoundingClientRect()
  const before = e.clientX < rect.left + rect.width / 2
  dropTarget.value = { index: i, before }
}
function resolveDropIndex(from: number, hover: number, before: boolean): number {
  let to = before ? hover : hover + 1
  if (from < to) to -= 1
  return Math.max(1, Math.min(to, pages.value.length - 1))
}
function onDrop(i: number, e: DragEvent) {
  e.preventDefault()
  if (dragIndex.value !== null && dragIndex.value !== i && i !== 0) {
    const before = dropTarget.value?.index === i ? dropTarget.value.before : e.clientX < (e.currentTarget as HTMLElement).getBoundingClientRect().left + (e.currentTarget as HTMLElement).getBoundingClientRect().width / 2
    const to = resolveDropIndex(dragIndex.value, i, before)
    if (to !== dragIndex.value) doc.setMarkdown(moveSlide(doc.markdown, dragIndex.value, to))
  }
  dragIndex.value = null
  dropTarget.value = null
}
function onDragEnd() { dragIndex.value = null; dropTarget.value = null }
function showInsertBefore(index: number) {
  return dropTarget.value?.index === index && dropTarget.value.before
}
function showInsertAfter(index: number) {
  return dropTarget.value?.index === index && !dropTarget.value.before
}
function cardShiftClass(index: number) {
  if (!dropTarget.value || dragIndex.value === null) return ''
  const { index: hover, before } = dropTarget.value
  if (index === hover && before) return 'shift-right'
  if (index === hover && !before) return 'shift-left'
  return ''
}

function addAfter(page: SlidePage) { doc.setMarkdown(insertSlideAfter(doc.markdown, page)); closeMenu() }
function duplicate(page: SlidePage) { doc.setMarkdown(duplicateSlide(doc.markdown, page)); closeMenu() }
async function remove(page: SlidePage) {
  closeMenu()
  if (pages.value.length <= 1 || page.index === 0) return
  const ok = await dialog.confirm({
    title: t('slideNavigator.deleteTitle', { n: page.index + 1 }),
    message: t('slideNavigator.deleteMessage'),
    confirmText: t('common.delete'), cancelText: t('common.cancel'), tone: 'danger',
  })
  if (ok) doc.setMarkdown(deleteSlide(doc.markdown, page))
}

const LAYOUTS = computed<{ value: SlideLayout | 'auto'; label: string }[]>(() => [
  { value: 'auto', label: t('slideNavigator.layouts.auto') },
  { value: 'cover', label: t('slideNavigator.layouts.cover') },
  { value: 'section', label: t('slideNavigator.layouts.section') },
  { value: 'center', label: t('slideNavigator.layouts.center') },
  { value: 'default', label: t('slideNavigator.layouts.default') },
  { value: 'split', label: t('slideNavigator.layouts.split') },
  { value: 'grid', label: t('slideNavigator.layouts.grid') },
  { value: 'image-left', label: t('slideNavigator.layouts.imageLeft') },
  { value: 'image-right', label: t('slideNavigator.layouts.imageRight') },
  { value: 'image-full', label: t('slideNavigator.layouts.imageFull') },
])

// M4-3: 智能版式推荐
const suggestedLayout = computed(() => {
  const page = menuPage.value?.source
  if (!page) return null
  const suggestions = suggestLayouts(page.body)
  return suggestions.find(s => s.recommended)?.layout ?? null
})
function changeLayout(page: SlidePage, value: SlideLayout | 'auto') {
  doc.setMarkdown(setSlideLayout(doc.markdown, page.index, value))
}

const thumbSkin = computed(() => findSkin(ui.slideSkin))
const thumbSkinClass = computed(() => thumbSkin.value ? `skin-${thumbSkin.value.id}` : '')
const thumbSkinStyle = computed(() => thumbSkin.value ? skinCssVars(thumbSkin.value) : {})
const thumbMetrics = computed(() => {
  const dims = SLIDE_RATIOS[ui.slideRatio]
  const height = ui.slideThumbHeight
  const width = Math.round(height * dims.w / dims.h)
  return {
    '--thumb-w': `${width}px`,
    '--thumb-h': `${height}px`,
    '--slide-w': `${dims.w}px`,
    '--slide-h': `${dims.h}px`,
    '--thumb-scale': String(height / dims.h),
  }
})

function fallbackThumbHtml(page: SlidePage) {
  const section = document.createElement('div')
  section.className = `slide-surface slide-layout-${page.layout}`
  section.innerHTML = `<div class="slide-inner">${renderMarkdown(page.body)}</div>`
  structureSlide(section, page.layout)
  return section.outerHTML
}

function thumbHtml(page: NavPage) {
  return page.html || fallbackThumbHtml(page.source)
}

// M4-2: 版式缩略图预览（渲染当前页内容 + 版式样式）
function layoutThumbHtml(page: SlidePage, layout: SlideLayout | 'auto'): string {
  const layoutClass = layout === 'auto' ? '' : `slide-layout-${layout}`
  return `<div class="slide-surface ${layoutClass}" style="transform:scale(0.15);transform-origin:top left;width:667px;height:375px;pointer-events:none;overflow:hidden">${renderMarkdown(page.body)}</div>`
}

function layoutLabel(layout: SlideLayout) {
  const map: Record<string, string> = {
    cover: t('slideNavigator.layouts.cover'),
    section: t('slideNavigator.layouts.section'),
    center: t('slideNavigator.layouts.center'),
    split: t('slideNavigator.layouts.split'),
    grid: t('slideNavigator.layouts.grid'),
    'image-left': t('slideNavigator.layouts.imageLeft'),
    'image-right': t('slideNavigator.layouts.imageRight'),
    'image-full': t('slideNavigator.layouts.imageFull'),
  }
  return map[layout] ?? t('slideNavigator.layouts.default')
}
function addAtEnd() {
  const last = pages.value[pages.value.length - 1]
  if (last) addAfter(last)
}

const THUMB_COLLAPSE_THRESHOLD = 24
const THUMB_SNAP_MS = 220
function playThumbSnap(action: () => void) {
  thumbSnap.value = false
  requestAnimationFrame(() => {
    thumbSnap.value = true
    action()
    window.setTimeout(() => { thumbSnap.value = false }, THUMB_SNAP_MS)
  })
}
function expandThumbs() {
  playThumbSnap(() => {
    if (ui.slideThumbHeight <= 56) ui.setSlideThumbHeight(88)
    ui.setSlideThumbCollapsed(false)
  })
}

function startThumbResize(e: PointerEvent) {
  e.preventDefault()
  const startY = e.clientY
  const startHeight = ui.slideThumbHeight
  let shouldCollapse = false
  const move = (ev: PointerEvent) => {
    const next = startHeight - (ev.clientY - startY)
    shouldCollapse = next < 56 - THUMB_COLLAPSE_THRESHOLD
    ui.setSlideThumbHeight(shouldCollapse ? 56 : next)
  }
  const done = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', done)
    document.body.classList.remove('resizing-thumbs')
    if (shouldCollapse) playThumbSnap(() => ui.setSlideThumbCollapsed(true))
  }
  document.body.classList.add('resizing-thumbs')
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', done, { once: true })
}

// 横向滚轮：竖滚 → 横滚
function onWheel(e: WheelEvent) {
  if (!stripEl.value) return
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    stripEl.value.scrollLeft += e.deltaY
    e.preventDefault()
  }
}
</script>

<template>
  <div class="filmbar" :class="{ collapsed: ui.slideThumbCollapsed, snapping: thumbSnap }">
    <button v-if="ui.slideThumbCollapsed" class="filmbar-expand" @click="expandThumbs">
      <span class="rail-label">{{ t('slideNavigator.thumbnails') }}</span>
    </button>
    <template v-else>
    <div
      class="filmbar-resize"
      @pointerdown="startThumbResize"
    >
      <span></span>
    </div>
    <div class="filmbar-head">
      <span class="fb-title">{{ t('slideNavigator.finishedPreview') }}</span>
      <div class="fb-actions">
        <button v-if="selectedCount" class="fb-export" @click="exportSelected">{{ t('slideNavigator.exportSelected', { count: selectedCount }) }}</button>
        <span class="fb-count">{{ t('slideNavigator.pageCount', { count: pageCount }) }}</span>
      </div>
    </div>
    <div class="strip" ref="stripEl" @wheel="onWheel">
      <template v-for="page in navPages" :key="page.index + ':' + page.startLine">
        <div
          v-if="showInsertBefore(page.source.index)"
          class="insertion-indicator"
          aria-hidden="true"
        ></div>
        <div
          class="card"
          :class="{
            active: page.index === activeIndex,
            selected: isSelected(page.index),
            dragging: page.index === dragIndex,
            'shift-left': cardShiftClass(page.source.index) === 'shift-left',
            'shift-right': cardShiftClass(page.source.index) === 'shift-right',
          }"
          :style="thumbMetrics"
          :draggable="!page.autoPage && page.source.index !== 0"
          @click="go(page)"
          @contextmenu.prevent.stop="toggleMenu(page.index, $event)"
          @dragstart="onDragStart(page.source.index, $event)"
          @dragover="onDragOver(page.source.index, $event)"
          @drop="onDrop(page.source.index, $event)"
          @dragend="onDragEnd"
        >
          <div class="thumb">
            <span class="idx">{{ page.index + 1 }}</span>
            <div class="mini reveal" :class="thumbSkinClass" :style="thumbSkinStyle" v-html="thumbHtml(page)"></div>
            <span v-if="page.autoPage" class="tag">{{ t('slideNavigator.continued', { n: page.autoPage }) }}</span>
            <span v-else-if="page.source.layout !== 'default'" class="tag">{{ layoutLabel(page.source.layout) }}</span>
            <button class="more" :title="t('slideNavigator.moreActions')" @click.stop="toggleMenu(page.index, $event)">
              <Icon name="more" :size="14" />
            </button>
          </div>
          <div class="cap">{{ page.title || t('slideNavigator.untitled') }}</div>
        </div>
        <div
          v-if="showInsertAfter(page.source.index)"
          class="insertion-indicator"
          aria-hidden="true"
        ></div>
        <div v-if="!page.autoPage" class="insert-col" @click="addAfter(page.source)"><span><Icon name="plus" :size="11" /></span></div>
      </template>
      <button class="add-end" :title="t('slideNavigator.addSection')" @click="addAtEnd"><Icon name="plus" :size="16" /></button>
    </div>
    </template>
    <Teleport to="body">
      <div
        v-if="menuPage"
        class="menu"
        :style="{ left: `${menuPos.left}px`, bottom: `${menuPos.bottom}px` }"
        @click.stop
      >
        <button @click.stop="exportPages([menuPage.index])"><Icon name="download" :size="13" /> {{ t('slideNavigator.exportThisPng') }}</button>
        <button @click.stop="toggleSelected(menuPage.index)">
          <Icon :name="isSelected(menuPage.index) ? 'check' : 'plus'" :size="13" />
          {{ isSelected(menuPage.index) ? t('slideNavigator.unselectPage') : t('slideNavigator.selectPage') }}
        </button>
        <template v-if="!menuPage.autoPage">
          <div class="menu-sep"></div>
          <button @click="addAfter(menuPage.source)"><Icon name="plus" :size="13" /> {{ t('slideNavigator.insertRight') }}</button>
          <button @click="duplicate(menuPage.source)"><Icon name="copy" :size="13" /> {{ t('slideNavigator.duplicateSection') }}</button>
          <button class="danger" :disabled="pages.length <= 1 || menuPage.source.index === 0" @click="remove(menuPage.source)">
            <Icon name="trash" :size="13" /> {{ t('slideNavigator.deleteSection') }}
          </button>
          <div class="menu-sep"></div>
          <div class="menu-label">{{ t('slideNavigator.layout') }}</div>
          <div class="layout-grid">
            <button
              v-for="opt in LAYOUTS"
              :key="opt.value"
              :class="{ on: opt.value === menuPage.source.layout, recommended: opt.value === suggestedLayout }"
              class="layout-thumb"
              @click="changeLayout(menuPage.source, opt.value)"
            >
              <div class="thumb-preview" v-html="layoutThumbHtml(menuPage.source, opt.value)"></div>
              <span class="thumb-label">{{ opt.label }}<span v-if="opt.value === suggestedLayout" class="rec-star">★</span></span>
            </button>
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.filmbar {
  flex: 0 0 auto;
  border-top: 1px solid var(--app-hairline);
  background: color-mix(in srgb, var(--app-shell-bg) 92%, var(--app-elevated));
  position: relative;
  transition: flex-basis 220ms cubic-bezier(.2, 1.12, .22, 1), min-height 220ms cubic-bezier(.2, 1.12, .22, 1), transform 220ms cubic-bezier(.2, 1.12, .22, 1);
}
.filmbar.snapping {
  animation: filmbar-snap 220ms cubic-bezier(.2, 1.12, .22, 1);
}
.filmbar.collapsed {
  flex: 0 0 22px;
  min-height: 22px;
  background: var(--app-shell-bg);
}
.filmbar-expand {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  width: 100%;
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
/* 横排药丸标签（.rail-label 基础样式在 base.css，全局） */
.filmbar-expand :deep(.rail-label) { padding: 3px 13px; }
.filmbar-expand:hover :deep(.rail-label) {
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 14%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-primary-color) 10%, transparent);
}
@keyframes filmbar-snap {
  0% { transform: translateY(0); }
  52% { transform: translateY(2px); }
  100% { transform: translateY(0); }
}
.filmbar-resize {
  position: absolute;
  left: 0;
  right: 0;
  top: -5px;
  height: 10px;
  display: grid;
  place-items: center;
  cursor: row-resize;
  z-index: 8;
}
.filmbar-resize span {
  width: 72px;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-border) 82%, transparent);
  transition: background 0.14s ease, box-shadow 0.14s ease;
}
.filmbar-resize:hover span,
body.resizing-thumbs .filmbar-resize span {
  background: var(--app-primary-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-primary-color) 12%, transparent);
}
/* 成品预览标题行（成品预览 · 共 N 页） */
.filmbar-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 14px 0;
}
.fb-title {
  font-size: 12px; font-weight: 800; letter-spacing: 0.02em; color: var(--app-fg);
}
.fb-count {
  font-size: 11px; font-weight: 700;
  color: var(--app-muted);
  padding: 2px 9px; border-radius: 999px;
  background: color-mix(in srgb, var(--app-fg) 6%, transparent);
}
.fb-actions { display: flex; align-items: center; gap: 8px; }
.fb-export {
  border: 1px solid color-mix(in srgb, var(--app-primary-color) 35%, var(--app-border));
  border-radius: 999px;
  padding: 3px 9px;
  background: color-mix(in srgb, var(--app-primary-color) 10%, transparent);
  color: var(--app-primary-color);
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
}
.strip {
  display: flex;
  align-items: flex-start;
  gap: 0;
  padding: 10px 14px 12px;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: thin;
}
.card {
  position: relative;
  flex: 0 0 auto;
  width: var(--thumb-w);
  cursor: pointer;
}
.thumb {
  position: relative;
  width: var(--thumb-w);
  height: var(--thumb-h);
  overflow: hidden;
  border: 1px solid var(--app-control-border);
  border-radius: 8px;
  background: var(--bg);
  box-shadow: var(--shadow-sm);
  transition: border-color .15s ease, box-shadow .15s ease, transform .12s ease;
}
.card:hover .thumb { border-color: color-mix(in srgb, var(--app-primary-color) 42%, var(--app-border)); transform: translateY(-1px); }
.card.active .thumb {
  border-color: var(--app-primary-color);
  box-shadow: var(--app-selected-ring), var(--shadow-md);
}
.card.selected .thumb {
  border-color: var(--app-primary-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary-color) 22%, transparent), var(--shadow-md);
}
.card.dragging { opacity: 0.35; transform: scale(0.96); }
.card.shift-left { transform: translateX(-6px); transition: transform 0.16s ease; }
.card.shift-right { transform: translateX(6px); transition: transform 0.16s ease; }
.insertion-indicator {
  flex: 0 0 auto;
  align-self: stretch;
  width: 3px;
  margin: 0 -1px;
  border-radius: 999px;
  background: var(--app-primary-color);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--app-primary-color) 24%, transparent),
    0 0 14px color-mix(in srgb, var(--app-primary-color) 55%, transparent);
  animation: insert-pulse 0.9s ease-in-out infinite alternate;
}
@keyframes insert-pulse {
  from { opacity: 0.72; transform: scaleY(0.94); }
  to { opacity: 1; transform: scaleY(1); }
}
.idx {
  position: absolute; left: 5px; top: 5px; z-index: 2;
  min-width: 17px; height: 17px; padding: 0 4px; box-sizing: border-box;
  display: grid; place-items: center;
  font-size: 10px; font-weight: 800; line-height: 1;
  border-radius: var(--radius-sm); color: #fff;
  background: color-mix(in srgb, var(--app-fg) 55%, transparent);
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}
.card.active .idx { background: var(--app-primary-color); }
.mini {
  width: 100%; height: 100%; overflow: hidden;
  color: var(--fg);
  pointer-events: none;
}
.mini :deep(.slide-surface) {
  width: var(--slide-w);
  height: var(--slide-h);
  min-height: var(--slide-h);
  transform: scale(var(--thumb-scale));
  transform-origin: top left;
  font-size: 23px;
  box-shadow: none !important;
}
.mini :deep(.slide-inner) {
  overflow: hidden;
}
.more {
  position: absolute; top: 4px; right: 4px; z-index: 2;
  width: 20px; height: 20px; display: grid; place-items: center;
  border: 0; border-radius: 6px; cursor: pointer;
  color: var(--app-fg-soft); background: color-mix(in srgb, var(--app-elevated) 86%, transparent);
  opacity: 0; transition: opacity .12s ease, background .12s ease;
}
.card:hover .more { opacity: 1; }
.more:hover { background: var(--app-bg); color: var(--app-primary-color); }
.tag {
  position: absolute; left: 5px; bottom: 5px; z-index: 2;
  font-size: 8.5px; font-weight: 800; padding: 1px 5px; border-radius: 999px;
  color: #fff; background: color-mix(in srgb, var(--app-primary-color) 80%, transparent);
}
.cap {
  margin: 6px 2px 0;
  font-size: 12px; font-weight: 700; line-height: 1.3;
  color: var(--app-fg);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.card.active .cap { color: var(--app-primary-color); }

/* ⋮ 菜单（向上弹出） */
.menu {
  position: fixed; z-index: 1000;
  width: 172px; padding: 6px;
  max-height: min(70vh, 440px);
  overflow-y: auto;
  border: 1px solid var(--app-hairline);
  border-radius: var(--radius-lg);
  background: var(--app-elevated);
  box-shadow: var(--shadow-lg);
}
.menu > button {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 7px 8px; border: 0; border-radius: 7px; cursor: pointer;
  font: inherit; font-size: 12px; font-weight: 600; text-align: left;
  background: none; color: var(--app-fg);
}
.menu > button:hover:not(:disabled) { background: var(--app-hover); }
.menu > button.danger:hover:not(:disabled) { background: color-mix(in srgb, #ef4444 12%, transparent); color: #ef4444; }
.menu > button:disabled { opacity: .4; cursor: default; }
.menu-sep { height: 1px; margin: 5px 2px; background: color-mix(in srgb, var(--app-border) 70%, transparent); }
.menu-label { font-size: 10.5px; font-weight: 800; color: var(--app-muted); padding: 2px 6px 5px; }
.layout-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 0 4px 3px; }
.layout-thumb {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 3px; border-radius: 6px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--app-border) 82%, transparent);
  background: var(--app-bg); transition: all 0.12s ease;
}
.layout-thumb:hover { border-color: color-mix(in srgb, var(--app-primary-color) 45%, var(--app-border)); }
.layout-thumb.on { border-color: var(--app-primary-color); background: color-mix(in srgb, var(--app-primary-color) 8%, var(--app-bg)); }
.layout-thumb.recommended { border-color: color-mix(in srgb, var(--app-primary-color) 60%, var(--app-border)); }
.thumb-preview { width: 56px; height: 32px; overflow: hidden; border-radius: 3px; background: #fff; border: 1px solid var(--app-border); pointer-events: none; }
.thumb-label { font-size: 10px; font-weight: 650; color: var(--app-muted); }
.rec-star { color: #f59e0b; font-size: 9px; margin-left: 1px; }

/* 卡片间竖向插入线（hover 浮现） */
.insert-col {
  flex: 0 0 auto; width: 14px; align-self: stretch;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0; transition: opacity .12s ease;
}
.insert-col:hover { opacity: 1; }
.insert-col::before, .insert-col::after { content: ''; flex: 1; width: 2px; background: color-mix(in srgb, var(--app-primary-color) 55%, transparent); border-radius: 2px; }
.insert-col span {
  flex: 0 0 auto; display: grid; place-items: center; width: 16px; height: 16px; margin: 4px 0;
  border-radius: 50%; background: var(--app-primary-color); color: #fff;
}
.add-end {
  flex: 0 0 auto; align-self: stretch; width: 40px; margin-left: 4px;
  display: grid; place-items: center;
  aspect-ratio: auto;
  font: inherit; cursor: pointer; color: var(--app-muted);
  border: 1px dashed var(--app-control-border); border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--app-elevated) 42%, transparent);
  transition: color .15s ease, border-color .15s ease;
}
.add-end:hover { color: var(--app-primary-color); border-color: color-mix(in srgb, var(--app-primary-color) 50%, var(--app-border)); }
</style>
