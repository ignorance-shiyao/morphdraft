<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'
import { useTagsStore, TAG_PALETTE } from '../stores/tags'
import type { DocMeta } from '../core/docTypes'
import { useDialog } from '../composables/useDialog'
import { useSafeRename } from '../composables/useSafeRename'
import { useImportJobStore } from '../stores/importJob'
import { getTemplates, type DocTemplate } from '../core/templates'
import { getString, setString, getNumber, setNumber } from '../core/localStore'
import Icon from './Icon.vue'
import OutlinePanel from './OutlinePanel.vue'
import BacklinksPanel from './BacklinksPanel.vue'
import ProblemsPanel from './ProblemsPanel.vue'
import { useI18n } from 'vue-i18n'

const doc = useDocumentStore()
const ui = useUiStore()
const tags = useTagsStore()
const dialog = useDialog()
const { renameDocumentSafely } = useSafeRename()
const importJob = useImportJobStore()
const { t } = useI18n({ useScope: 'global' })

type LibrarySort = 'name-asc' | 'name-desc' | 'updated-desc' | 'updated-asc'

const SORT_OPTIONS: { value: LibrarySort; labelKey: string }[] = [
  { value: 'name-asc', labelKey: 'sidebar.sortNameAsc' },
  { value: 'name-desc', labelKey: 'sidebar.sortNameDesc' },
  { value: 'updated-desc', labelKey: 'sidebar.sortUpdatedDesc' },
  { value: 'updated-asc', labelKey: 'sidebar.sortUpdatedAsc' },
]

function loadChoice<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  const value = getString(key, '') as T
  return value && allowed.includes(value) ? value : fallback
}

const editingId = ref<string | null>(null)
const editingText = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

// 文稿库 / 文稿大纲 两段上下分割，可拖拽（docsHeight = 上段「文稿库」高度）
const docsHeight = ref(getNumber('mddoc:sidebar-docs-height', 260, 100, 1200))
const vsplitDragging = ref(false)
function sidebarBodyMax(): number {
  const body = document.querySelector<HTMLElement>('.sidebar .sb-body')
  return body ? Math.max(160, body.clientHeight - 120) : 600
}
function startVSplit(e: PointerEvent) {
  e.preventDefault()
  vsplitDragging.value = true
  const startY = e.clientY
  const start = docsHeight.value
  const maxH = sidebarBodyMax()
  function move(ev: PointerEvent) {
    docsHeight.value = Math.max(100, Math.min(maxH, start + (ev.clientY - startY)))
  }
  function done() {
    vsplitDragging.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', done)
    setNumber('mddoc:sidebar-docs-height', docsHeight.value)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', done, { once: true })
}

// —— 文件名搜索 + 标签筛选 ——
const query = ref('')
const activeTags = ref<string[]>([])
const allTags = computed(() => {
  const s = new Set<string>()
  doc.list.forEach((d) => (d.tags || []).forEach((t) => s.add(t)))
  return [...s]
})
const filteredList = computed(() => {
  const q = query.value.trim().toLowerCase()
  return doc.list.filter((d) => {
    if (q && !(d.title || '').toLowerCase().includes(q)) return false
    if (activeTags.value.length && !(d.tags || []).some((t) => activeTags.value.includes(t))) return false
    return true
  })
})
// R0b-2：标题筛选无结果时的全文搜索出口，带上当前关键词。
function fullTextSearch() {
  window.dispatchEvent(new CustomEvent('morph:global-search', { detail: query.value.trim() }))
}
function toggleFilter(tag: string) {
  activeTags.value = activeTags.value.includes(tag)
    ? activeTags.value.filter((t) => t !== tag)
    : [...activeTags.value, tag]
}

// —— 文件夹分组 ——
const collapsedFolders = ref<Set<string>>(new Set())
const librarySort = ref<LibrarySort>(loadChoice('mddoc:library-sort', 'name-asc', ['name-asc', 'name-desc', 'updated-desc', 'updated-asc']))
const sortAnimating = ref(false)
const allFolders = computed(() => {
  const s = new Set<string>()
  doc.folders.forEach((f) => { if (f) s.add(f) })
  doc.list.forEach((d) => { if (d.folder) s.add(d.folder) })
  const folders = [...s]
  if (librarySort.value === 'updated-desc') {
    return folders.sort((a, b) => folderUpdatedAt(b).localeCompare(folderUpdatedAt(a)) || a.localeCompare(b, 'zh-Hans-CN'))
  }
  if (librarySort.value === 'updated-asc') {
    return folders.sort((a, b) => folderUpdatedAt(a).localeCompare(folderUpdatedAt(b)) || a.localeCompare(b, 'zh-Hans-CN'))
  }
  return folders.sort((a, b) =>
    librarySort.value === 'name-desc'
      ? b.localeCompare(a, 'zh-Hans-CN')
      : a.localeCompare(b, 'zh-Hans-CN'),
  )
})
const groupedDocs = computed(() => {
  const groups: { folder: string; docs: DocMeta[] }[] = []
  const folderMap = new Map<string, DocMeta[]>()
  for (const d of filteredList.value) {
    const f = d.folder || ''
    if (!folderMap.has(f)) folderMap.set(f, [])
    folderMap.get(f)!.push(d)
  }
  const includeEmptyFolders = !query.value.trim() && activeTags.value.length === 0
  for (const f of allFolders.value) {
    const docs = sortDocs(folderMap.get(f) || [])
    if (docs.length || includeEmptyFolders) groups.push({ folder: f, docs })
  }
  // 未分类排最后
  const uncategorized = folderMap.get('')
  if (uncategorized?.length) groups.push({ folder: '', docs: sortDocs(uncategorized) })
  return groups
})
watch(librarySort, (value) => {
  setString('mddoc:library-sort', value)
  sortAnimating.value = true
  window.setTimeout(() => { sortAnimating.value = false }, 320)
})
function folderUpdatedAt(folder: string) {
  return doc.list
    .filter((d) => d.folder === folder)
    .reduce((latest, d) => d.updatedAt > latest ? d.updatedAt : latest, '')
}
function sortDocs(docs: DocMeta[]) {
  return [...docs].sort((a, b) => {
    if (librarySort.value === 'updated-asc') return a.updatedAt.localeCompare(b.updatedAt)
    if (librarySort.value === 'name-asc') return (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN')
    if (librarySort.value === 'name-desc') return (b.title || '').localeCompare(a.title || '', 'zh-Hans-CN')
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}
function toggleFolder(folder: string) {
  if (collapsedFolders.value.has(folder)) collapsedFolders.value.delete(folder)
  else collapsedFolders.value.add(folder)
}
async function moveToFolder(d: DocMeta, folder: string) {
  await doc.setDocFolder(d.id, folder || undefined)
}

// O9：侧边栏拖拽归类
const draggingDocId = ref<string | null>(null)
const dragOverFolder = ref<string | null>(null)
function onDocDragStart(d: DocMeta, e: DragEvent) {
  draggingDocId.value = d.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', d.id)
  }
}
function onFolderDragOver(folder: string, e: DragEvent) {
  if (!draggingDocId.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverFolder.value = folder
}
function onFolderDragLeave(folder: string) {
  if (dragOverFolder.value === folder) dragOverFolder.value = null
}
async function onFolderDrop(folder: string, e: DragEvent) {
  e.preventDefault()
  const id = draggingDocId.value
  if (!id) return
  const target = doc.list.find((item) => item.id === id)
  if (target && (target.folder || '') !== folder) await moveToFolder(target, folder)
  onDocDragEnd()
}
function onDocDragEnd() {
  draggingDocId.value = null
  dragOverFolder.value = null
}

// O10：排序切换器
const sortMenuOpen = ref(false)
const sortMenuEl = ref<HTMLElement | null>(null)
const sortBtnEl = ref<HTMLElement | null>(null)
function toggleSortMenu() {
  sortMenuOpen.value = !sortMenuOpen.value
}
function pickSort(value: LibrarySort) {
  librarySort.value = value
  sortMenuOpen.value = false
}
function closeSortMenu(e: MouseEvent) {
  const target = e.target as Node
  if (sortBtnEl.value?.contains(target) || sortMenuEl.value?.contains(target)) return
  sortMenuOpen.value = false
}
// —— 单文档标签编辑（弹层）——
const tagEditorId = ref<string | null>(null)
const newTag = ref('')
const newFolderName = ref('')
const colorPickerTag = ref<string | null>(null)
function openTagEditor(id: string, e: Event) {
  e.stopPropagation()
  tagEditorId.value = tagEditorId.value === id ? null : id
  newTag.value = ''
  colorPickerTag.value = null
}
function closeTagEditor(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (!t.closest('.tag-editor') && !t.closest('.tag-btn')) tagEditorId.value = null
}
onMounted(() => {
  window.addEventListener('click', closeTagEditor)
  window.addEventListener('click', closeSortMenu)
})
onBeforeUnmount(() => {
  window.removeEventListener('click', closeTagEditor)
  window.removeEventListener('click', closeSortMenu)
})
async function toggleTag(d: DocMeta, tag: string) {
  const cur = new Set(d.tags || [])
  cur.has(tag) ? cur.delete(tag) : cur.add(tag)
  await doc.setDocTags(d.id, [...cur])
}
async function addTag(d: DocMeta) {
  const t = newTag.value.trim()
  newTag.value = ''
  if (!t) return
  const cur = new Set(d.tags || [])
  cur.add(t)
  await doc.setDocTags(d.id, [...cur])
}
function setColor(tag: string, c: string) {
  tags.setColor(tag, c)
  colorPickerTag.value = null
}

// M3-6: 文档模板库
const templates = getTemplates()
async function createWithTemplate(templateId?: string, folder?: string) {
  await doc.newDoc(templateId, folder)
}
async function openNewDocDialog(folder?: string) {
  const value = await dialog.select({
    title: t('sidebar.newDoc'),
    message: folder ? t('sidebar.newDocMessageInFolder', { folder }) : t('sidebar.newDocTemplatePrompt'),
    cancelText: t('common.cancel'),
    options: templates.map((t) => ({ label: t.name, value: t.id, hint: t.category })),
  })
  if (value === null) return
  await createWithTemplate(value, folder)
}
// 打开本地文档（md 直开 / docx·pdf·xlsx·pptx·csv·html 等转 Markdown）
async function openLocalDoc() {
  try {
    const { openLocalDocFile } = await import('../core/export/save')
    const src = await openLocalDocFile()
    if (!src) return
    void importJob.runBatch([src], { openFirst: true })
  } catch (e) {
    await dialog.alert({ title: t('sidebar.openFailed'), message: e instanceof Error ? e.message : String(e), tone: 'danger' })
  }
}
async function openNewFolderDialog() {
  const name = await dialog.prompt({
    title: t('sidebar.newFolder'),
    message: t('sidebar.newFolderMessage'),
    inputPlaceholder: t('sidebar.folderNamePlaceholder'),
    confirmText: t('sidebar.create'),
    cancelText: t('common.cancel'),
  })
  const folder = name?.trim()
  if (!folder) return
  doc.createFolder(folder)
}

// 相对时间：今天显示 HH:MM，昨天显示「昨天」，更早显示 MM-DD（呼应参考图「最近编辑」列表）
function fmtRelative(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOf(now) - startOf(d)) / 86400000)
  if (dayDiff <= 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (dayDiff === 1) return t('sidebar.yesterday')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function beginTitleMarquee(e: MouseEvent) {
  const shell = e.currentTarget as HTMLElement
  const track = shell.querySelector<HTMLElement>('.name-marquee')
  if (!track) return
  const overflow = Math.ceil(track.scrollWidth - shell.clientWidth)
  shell.classList.toggle('can-scroll', overflow > 8)
  shell.style.setProperty('--title-scroll-distance', overflow > 8 ? `-${overflow}px` : '0px')
  shell.style.setProperty('--title-scroll-duration', `${Math.min(16, Math.max(7, overflow / 18))}s`)
}

function endTitleMarquee(e: MouseEvent) {
  const shell = e.currentTarget as HTMLElement
  shell.classList.remove('can-scroll')
  shell.style.removeProperty('--title-scroll-distance')
  shell.style.removeProperty('--title-scroll-duration')
}

async function pick(id: string) {
  if (id !== doc.currentId) {
    await doc.open(id)
  }
}
async function startRename(id: string, title: string) {
  if (doc.backendOn && id !== doc.currentId) await doc.open(id)
  editingId.value = id
  editingText.value = title
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
}
async function commitRename() {
  if (!editingId.value) return
  const nextTitle = editingText.value.trim()
  editingId.value = null
  await renameDocumentSafely(nextTitle)
}
async function remove(id: string, e: Event) {
  e.stopPropagation()
  const ok = await dialog.confirm({
    title: t('sidebar.deleteDocTitle'),
    message: t('sidebar.deleteDocMessage'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    tone: 'danger',
  })
  if (ok) await doc.removeDoc(id)
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <template v-if="!ui.sidebarCollapsed">
      <div class="sb-head">
        <div class="sb-title">{{ t('nav.documents') }}</div>
        <div class="sb-head-actions">
          <button class="sb-icon" :title="t('sidebar.newDoc')" @click.stop="openNewDocDialog()"><Icon name="plus" :size="15" /></button>
          <button class="sb-icon" :title="t('sidebar.newFolder')" @click.stop="openNewFolderDialog"><Icon name="folder-plus" :size="15" /></button>
          <button class="sb-icon" :title="`${t('common.open')} / ${t('common.import')}`" @click.stop="openLocalDoc"><Icon name="import" :size="15" /></button>
        </div>
      </div>

      <div v-if="doc.backendError" class="offline">
        <div class="offline-title">{{ t('sidebar.localUnavailable') }}</div>
        <div>{{ doc.backendError }}</div>
      </div>

      <div class="sb-body">
        <div class="sb-docs" :style="{ flexBasis: docsHeight + 'px' }">
        <div class="lib-section-row">
          <div class="lib-section-label">{{ t('sidebar.recent') }}</div>
          <div class="sort-dd" ref="sortBtnEl">
            <button
              class="sb-sort-btn"
              :class="{ on: sortMenuOpen }"
              :title="t('sidebar.sort')"
              :aria-label="t('sidebar.sort')"
              @click.stop="toggleSortMenu"
            >
              <Icon name="list-ordered" :size="14" />
            </button>
            <div v-if="sortMenuOpen" ref="sortMenuEl" class="sort-menu" @click.stop>
              <button
                v-for="opt in SORT_OPTIONS"
                :key="opt.value"
                :class="{ on: librarySort === opt.value }"
                @click="pickSort(opt.value)"
              >
                {{ t(opt.labelKey) }}
              </button>
            </div>
          </div>
        </div>
        <!-- R0a-3：标题筛选（仅按标题、不扫正文）。Esc 清空。全文搜索出口见 R0b。 -->
        <div class="lib-search lib-search-row">
          <Icon name="search" :size="13" class="lib-search-ic" />
          <input
            v-model="query"
            type="text"
            class="lib-search-input"
            :placeholder="t('sidebar.filterPlaceholder')"
            :aria-label="t('sidebar.filterAria')"
            @keyup.esc="query = ''"
          />
          <button v-if="query" class="lib-search-clear" :title="t('sidebar.clearFilter')" @click="query = ''">
            <Icon name="close" :size="13" />
          </button>
        </div>
        <div v-if="allTags.length" class="tag-filter">
          <button
            v-for="t in allTags"
            :key="t"
            class="tag-chip"
            :class="{ on: activeTags.includes(t) }"
            :style="{ '--tg': tags.colorOf(t) }"
            @click="toggleFilter(t)"
          >{{ t }}</button>
        </div>

        <ul class="files file-tree">
          <template v-for="group in groupedDocs" :key="group.folder || '__uncategorized'">
            <!-- 文件夹头 -->
            <li
              v-if="allFolders.length > 0"
              class="folder-header tree-row"
              :class="{ 'drag-over': dragOverFolder === group.folder }"
              @click="toggleFolder(group.folder)"
              @dragover="onFolderDragOver(group.folder, $event)"
              @dragleave="onFolderDragLeave(group.folder)"
              @drop="onFolderDrop(group.folder, $event)"
            >
              <Icon :name="collapsedFolders.has(group.folder) ? 'chevron-right' : 'chevron-down'" :size="13" class="tree-chevron" />
              <Icon name="folder" :size="15" class="folder-glyph" />
              <span class="folder-name">{{ group.folder || t('sidebar.uncategorized') }}</span>
              <span class="folder-count">{{ group.docs.length }}</span>
              <button
                v-if="group.folder"
                class="folder-new-doc"
                :title="t('sidebar.addDocInFolder')"
                @click.stop="openNewDocDialog(group.folder)"
              ><Icon name="plus" :size="12" /></button>
            </li>
            <!-- 文件夹内文档 -->
            <template v-if="!collapsedFolders.has(group.folder)">
              <li v-if="group.folder && group.docs.length === 0" class="empty folder-empty tree-row">{{ t('sidebar.emptyFolder') }}</li>
              <li
                v-for="d in group.docs"
                :key="d.id"
                class="file-row tree-row"
                :class="{ active: d.id === doc.currentId, nested: allFolders.length > 0, dragging: draggingDocId === d.id, 'sort-bump': sortAnimating }"
                draggable="true"
                @click="pick(d.id)"
                @dblclick="startRename(d.id, d.title || t('sidebar.untitled'))"
                @dragstart="onDocDragStart(d, $event)"
                @dragend="onDocDragEnd"
              >
                <input
                  v-if="editingId === d.id"
                  ref="inputEl"
                  v-model="editingText"
                  class="rename"
                  @click.stop
                  @keyup.enter="commitRename"
                  @keyup.esc="editingId = null"
                  @blur="commitRename"
                />
                <template v-else>
                  <div class="file-main">
                    <Icon name="file" :size="15" class="file-glyph" />
                    <span
                      class="name"
                      :title="d.title || t('sidebar.untitled')"
                      @mouseenter="beginTitleMarquee"
                      @mouseleave="endTitleMarquee"
                    ><span class="name-marquee">{{ d.title || t('sidebar.untitled') }}</span></span>
                    <span class="file-time">{{ fmtRelative(d.updatedAt) }}</span>
                    <span class="row-actions" @dragstart.stop>
                      <button class="row-action tag-btn" :title="t('sidebar.tagAndMove')" @click="openTagEditor(d.id, $event)"><Icon name="more" :size="14" /></button>
                      <button class="row-action rename-btn" :title="t('sidebar.rename')" @click.stop="startRename(d.id, d.title || t('sidebar.untitled'))"><Icon name="pencil" :size="14" /></button>
                      <button class="row-action danger" :title="t('common.delete')" @click="remove(d.id, $event)"><Icon name="trash" :size="14" /></button>
                    </span>
                  </div>
                  <div v-if="(d.tags || []).length" class="file-tags">
                    <span v-for="t in d.tags" :key="t" class="ftag" :style="{ '--tg': tags.colorOf(t) }">{{ t }}</span>
                  </div>

                  <!-- 标签编辑弹层 -->
                  <div v-if="tagEditorId === d.id" class="tag-editor" @click.stop>
                    <div class="te-title">{{ t('sidebar.tags') }}</div>
                    <div class="te-list">
                      <div v-for="tag in allTags" :key="tag" class="te-row">
                        <button class="te-toggle" :class="{ on: (d.tags || []).includes(tag) }" @click="toggleTag(d, tag)">
                          <span class="te-dot" :style="{ background: tags.colorOf(tag) }"></span>{{ tag }}
                        </button>
                        <button class="te-color" :style="{ background: tags.colorOf(tag) }" :title="t('sidebar.changeColor')" @click="colorPickerTag = colorPickerTag === tag ? null : tag"></button>
                        <div v-if="colorPickerTag === tag" class="te-palette">
                          <button v-for="c in TAG_PALETTE" :key="c" :style="{ background: c }" @click="setColor(tag, c)"></button>
                        </div>
                      </div>
                      <div v-if="!allTags.length" class="te-empty">{{ t('sidebar.noTags') }}</div>
                    </div>
                    <!-- 移动到文件夹 -->
                    <div class="te-divider"></div>
                    <div class="te-title">{{ t('sidebar.moveToFolder') }}</div>
                    <div class="te-list">
                      <button
                        class="te-toggle"
                        :class="{ on: !d.folder }"
                        @click="moveToFolder(d, '')"
                      >{{ t('sidebar.uncategorized') }}</button>
                      <button
                        v-for="f in allFolders"
                        :key="f"
                        class="te-toggle"
                        :class="{ on: d.folder === f }"
                        @click="moveToFolder(d, f)"
                      >{{ f }}</button>
                      <input
                        v-model="newFolderName"
                        class="te-folder-input"
                        :placeholder="t('sidebar.newFolderPlaceholder')"
                        @keyup.enter="moveToFolder(d, newFolderName); newFolderName = ''"
                      />
                    </div>
                    <div class="te-add">
                      <input v-model="newTag" :placeholder="t('sidebar.newTagPlaceholder')" @keyup.enter="addTag(d)" />
                      <button @click="addTag(d)"><Icon name="plus" :size="13" /></button>
                    </div>
                  </div>
                </template>
              </li>
            </template>
          </template>
          <li v-if="groupedDocs.length === 0" class="empty">
            <template v-if="doc.list.length && query.trim()">
              <div class="empty-title">{{ t('sidebar.noTitleMatch', { q: query.trim() }) }}</div>
              <button class="empty-fulltext" @click="fullTextSearch">{{ t('sidebar.fullTextSearch') }}</button>
            </template>
            <template v-else>{{ doc.list.length ? t('sidebar.noMatch') : t('sidebar.empty') }}</template>
          </li>
        </ul>
        </div>

        <div class="sb-vsplit" :class="{ dragging: vsplitDragging }" :title="t('sidebar.resizeSections')" @pointerdown="startVSplit"><span></span></div>

        <div class="sb-outline-pane">
          <div class="sb-section-head">
            <span class="sb-section-title">{{ t('nav.outline') }}</span>
          </div>
          <OutlinePanel class="sb-outline" />
          <BacklinksPanel />
          <ProblemsPanel />
        </div>
      </div>
    </template>

    <button v-else class="expand" :title="t('sidebar.expandLibrary')" @click="ui.toggleSidebar()"><span class="rail-label">{{ t('sidebar.libraryRail') }}</span></button>
  </aside>

</template>

<style scoped>
.sidebar {
  flex: 0 0 auto; height: 100%;
  display: flex; flex-direction: column;
  background: var(--app-shell-bg);
  border-right: 1px solid var(--app-hairline);
  overflow: hidden;
}
.sidebar.collapsed { flex-basis: 22px; width: 22px; min-width: 22px; align-items: center; justify-content: center; }
/* 与 filmbar / 工作区把手统一：竖排药丸标签，点击展开（.rail-label 样式在 base.css） */
.expand {
  width: 22px; height: 100%; padding: 0; cursor: pointer;
  display: grid; place-items: center;
  border: 0; background: transparent;
}
.sb-head {
  display: flex; align-items: center; justify-content: space-between;
  flex: 0 0 auto;
  padding: 14px 12px 8px 14px;
}
.sb-title, .sb-head .title {
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.01em;
  color: var(--app-fg);
}
/* 上下两段（文稿库 / 文稿大纲）+ 中间可拖拽分割条 */
.sb-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sb-docs {
  /* flex-basis 由 docsHeight 内联控制 */
  flex: 0 0 auto;
  min-height: 80px;
  overflow: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
}
.sb-outline-pane {
  flex: 1 1 auto;
  min-height: 80px;
  overflow: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
}
.sb-outline-pane > .sb-outline { flex: 0 0 auto; overflow: visible; }
/* 上下分割条 */
.sb-vsplit {
  flex: 0 0 auto;
  height: 11px;
  display: grid;
  place-items: center;
  cursor: row-resize;
  border-top: 1px solid var(--app-hairline);
  border-bottom: 1px solid var(--app-hairline);
  background: color-mix(in srgb, var(--app-shell-bg) 94%, var(--app-elevated));
}
.sb-vsplit span {
  width: 36px; height: 3px; border-radius: 999px;
  background: color-mix(in srgb, var(--app-border) 82%, transparent);
  transition: background .14s ease, box-shadow .14s ease;
}
.sb-vsplit:hover span, .sb-vsplit.dragging span {
  background: var(--app-primary-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-primary-color) 12%, transparent);
}
/* 文稿大纲段头 */
.sb-section-head {
  display: flex; align-items: center; justify-content: space-between;
  flex: 0 0 auto;
  padding: 10px 12px 6px 14px;
}
.sb-section-title {
  font-weight: 800; font-size: 14px; letter-spacing: 0.01em; color: var(--app-fg);
}
.sb-head .tabs { display: inline-flex; gap: 2px; }
.sb-head .tabs button {
  font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
  padding: 5px 9px; border: 0; border-radius: 7px; background: transparent; color: var(--app-muted);
  transition: color 0.15s ease, background 0.15s ease;
}
.sb-head .tabs button.on { color: var(--app-primary-color); background: var(--app-active); }
.sb-head .tabs button:not(.on):hover { color: var(--app-fg); }
.sb-head-actions { display: inline-flex; align-items: center; gap: 2px; }
.sb-icon {
  display: inline-grid; place-items: center;
  width: 26px; height: 26px;
  border: 0; border-radius: 7px;
  background: transparent; color: var(--app-muted);
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease;
}
.sb-icon:hover { color: var(--app-primary-color); background: var(--app-hover); }
.sb-sort {
  width: 26px; height: 26px; padding: 0 2px;
  border: 0; border-radius: 7px;
  background: transparent; color: var(--app-muted);
  font: inherit; font-size: 11px; cursor: pointer;
  appearance: none; -webkit-appearance: none;
  text-align: center;
}
.sb-sort:hover { color: var(--app-primary-color); background: var(--app-hover); }
.lib-section-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px 4px 14px;
}
.lib-section-label {
  padding: 0;
  font-size: 11px; font-weight: 750; letter-spacing: 0.03em;
  color: var(--app-muted);
}
.sort-dd { position: relative; }
.sb-sort-btn {
  display: inline-grid; place-items: center;
  width: 24px; height: 24px;
  border: 0; border-radius: 6px;
  background: transparent; color: var(--app-muted);
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease, transform 0.12s ease;
}
.sb-sort-btn:hover, .sb-sort-btn.on {
  color: var(--app-primary-color);
  background: var(--app-hover);
}
.sort-menu {
  position: absolute; z-index: 40; right: 0; top: calc(100% + 4px);
  min-width: 148px; padding: 4px;
  border: 1px solid var(--app-control-border);
  border-radius: 10px;
  background: var(--app-menu-bg);
  box-shadow: var(--shadow-lg);
}
.sort-menu button {
  display: block; width: 100%;
  font: inherit; font-size: 12px; font-weight: 650; text-align: left;
  padding: 7px 10px; border: 0; border-radius: 7px;
  background: transparent; color: var(--app-fg); cursor: pointer;
}
.sort-menu button:hover { background: var(--app-hover); }
.sort-menu button.on { color: var(--app-primary-color); background: color-mix(in srgb, var(--app-primary-color) 10%, transparent); }
.icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; cursor: pointer; line-height: 1;
  border: 1px solid var(--app-hairline);
  background: var(--app-elevated);
  color: var(--app-muted);
  border-radius: 9px;
  box-shadow: var(--shadow-sm), 0 1px 0 var(--app-edge) inset;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.icon:hover { color: var(--app-primary-color); border-color: color-mix(in srgb, var(--app-primary-color) 50%, var(--app-border)); background: var(--app-hover); }
.offline {
  margin: 12px;
  padding: 12px;
  font-size: 12px;
  color: var(--app-muted);
  line-height: 1.65;
  border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-bg) 84%, var(--app-panel-bg)), var(--app-panel-bg));
}
.offline-title { font-weight: 800; color: var(--app-fg); margin-bottom: 3px; }
.offline code {
  display: block;
  margin-top: 7px;
  background: color-mix(in srgb, var(--app-code-bg) 82%, var(--app-bg));
  padding: 5px 7px;
  border-radius: 7px;
  color: color-mix(in srgb, var(--app-fg) 72%, var(--app-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.offline-error {
  margin-top: 6px; color: #b42318; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.retry {
  display: block; width: 100%; margin-top: 9px; font: inherit; font-size: 12px; font-weight: 700; padding: 7px 8px;
  cursor: pointer; border: 1px solid var(--app-primary-color); background: var(--app-primary-color);
  color: #fff; border-radius: 8px;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--app-primary-color) 24%, transparent);
}
.retry:disabled { opacity: 0.55; cursor: default; }
.library-console {
  position: relative;
  margin: 8px 8px 4px;
  padding: 6px;
  border: 1px solid var(--app-hairline);
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-elevated) 70%, var(--app-shell-bg));
  box-shadow: 0 1px 0 var(--app-edge) inset;
}
.lib-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  margin-bottom: 6px;
}
.lib-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 30px;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  border-radius: 7px;
  border: 1px solid var(--app-control-border);
  background: var(--app-control-bg);
  color: var(--app-fg-soft);
  transition: color 0.14s ease, background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
}
.lib-action:hover,
.lib-action.on {
  color: var(--app-primary-color);
  border-color: color-mix(in srgb, var(--app-primary-color) 28%, var(--app-border));
  background: var(--app-hover);
}
.lib-action.primary {
  color: #fff;
  background: var(--app-primary-color);
  border-color: var(--app-primary-color);
  box-shadow: 0 5px 12px color-mix(in srgb, var(--app-primary-color) 18%, transparent);
}
.lib-action.primary:hover {
  color: #fff;
  background: color-mix(in srgb, var(--app-primary-color) 88%, #000);
}
.lib-filter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px;
  gap: 5px;
  align-items: center;
}
.lib-search {
  position: relative;
  min-width: 0;
}
/* R0a-3：文稿库标题筛选行 */
.lib-search-row {
  flex: 0 0 auto;
  margin: 2px 12px 6px;
}
.lib-search-clear {
  position: absolute;
  right: 5px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
}
.lib-search-clear:hover { color: var(--app-primary-color); background: var(--app-hover); }
.lib-search-row .lib-search-input { padding-right: 26px; }
.lib-search-ic {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--app-muted);
  pointer-events: none;
}
.lib-search input {
  width: 100%;
  box-sizing: border-box;
  height: 28px;
  font: inherit;
  font-size: 12px;
  padding: 0 8px 0 27px;
  border-radius: 6px;
  border: 1px solid var(--app-control-border);
  background: var(--app-control-bg);
  color: var(--app-fg);
  outline: none;
}
.lib-search input:focus { border-color: color-mix(in srgb, var(--app-primary-color) 50%, var(--app-border)); }
.library-sort {
  width: 100%;
  height: 28px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  border-radius: 6px;
  border: 1px solid var(--app-control-border);
  background: var(--app-control-bg);
  color: var(--app-fg-soft);
  outline: none;
}
.library-sort:focus { border-color: color-mix(in srgb, var(--app-primary-color) 50%, var(--app-border)); }
.tag-filter { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 5px; padding: 5px 8px 3px; }
.tag-chip {
  font: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
  padding: 3px 9px; border-radius: var(--radius-full);
  border: 1px solid color-mix(in srgb, var(--tg) 45%, transparent);
  background: color-mix(in srgb, var(--tg) 10%, transparent); color: var(--tg);
  transition: background var(--transition-fast);
}
.tag-chip.on { color: #fff; background: var(--tg); border-color: var(--tg); }

.files {
  list-style: none;
  margin: 0;
  padding: 3px 6px 8px;
  flex: 0 0 auto;
}
.files li {
  position: relative;
  display: block;
  padding: 0;
  border-radius: 6px;
  margin: 0 0 1px;
  cursor: pointer;
  font-size: 12.5px;
  border: 1px solid transparent;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.tree-row { min-height: 29px; }
.file-main {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 29px;
  padding: 0 6px;
}
.file-row.nested .file-main { padding-left: 25px; }
.files li:hover {
  background: color-mix(in srgb, var(--app-hover) 76%, transparent);
  border-color: color-mix(in srgb, var(--app-border) 58%, transparent);
}
.files li.active {
  background: color-mix(in srgb, var(--app-primary-color) 12%, var(--app-elevated));
  border-color: color-mix(in srgb, var(--app-primary-color) 28%, transparent);
  box-shadow: inset 2px 0 0 var(--app-primary-color), 0 1px 0 var(--app-edge) inset;
}
.file-row.dragging { opacity: 0.45; transform: scale(0.98); }
.file-row.sort-bump { transition: transform 0.28s cubic-bezier(.2, 1.1, .22, 1), opacity 0.28s ease; }
.folder-header.drag-over {
  background: color-mix(in srgb, var(--app-primary-color) 10%, var(--app-hover));
  border: 1px solid color-mix(in srgb, var(--app-primary-color) 42%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary-color) 14%, transparent);
}
.folder-header.drag-over .folder-glyph {
  transform: rotate(5deg);
  color: var(--app-primary-color);
  transition: transform 0.18s ease, color 0.18s ease;
}
.folder-glyph { transition: transform 0.18s ease, color 0.18s ease; }
.file-glyph {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--app-muted) 78%, var(--app-primary-color));
}
.files li.active .file-glyph { color: var(--app-primary-color); }
/* 行尾相对时间（最近编辑），hover 时让位给行内操作 */
.file-time {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--app-muted) 88%, transparent);
  transition: opacity 0.12s ease;
}
.files li:hover .file-time,
.files li:focus-within .file-time { opacity: 0; }
.files li.active .file-time { color: color-mix(in srgb, var(--app-primary-color) 70%, var(--app-muted)); }
.files .name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-weight: 650;
  color: var(--app-fg);
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 14px), transparent);
}
.name-marquee {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  will-change: transform;
}
.files .name.can-scroll .name-marquee {
  max-width: none;
  overflow: visible;
  text-overflow: clip;
  animation: title-marquee var(--title-scroll-duration, 10s) ease-in-out 0.45s infinite alternate;
}
@keyframes title-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(var(--title-scroll-distance, 0px)); }
}
@media (prefers-reduced-motion: reduce) {
  .files .name.can-scroll .name-marquee {
    animation: none;
    transform: translateX(var(--title-scroll-distance, 0px));
  }
}
.row-actions {
  position: absolute;
  right: 4px;
  top: 3px;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  transform: translateX(2px);
  padding-left: 14px;
  background: linear-gradient(90deg, transparent, var(--app-hover) 28%, var(--app-hover));
  pointer-events: none;
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.files li:hover .row-actions,
.files li:focus-within .row-actions {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}
.row-action {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease;
}
.row-action:hover {
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 10%, transparent);
}
.row-action.danger:hover {
  color: #e5484d;
  background: color-mix(in srgb, #e5484d 10%, transparent);
}
.files .empty { color: var(--app-muted); text-align: center; cursor: default; font-size: 12px; padding: 10px; }
.empty-title { margin-bottom: 8px; }
.empty-fulltext {
  font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
  padding: 5px 12px; border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--app-primary-color) 30%, var(--app-border));
  background: var(--app-control-bg); color: var(--app-primary-color);
}
.empty-fulltext:hover { background: var(--app-hover); }
.files .empty:hover { background: none; border-color: transparent; }
.files .rename {
  width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; padding: 5px 7px;
  border: 1px solid var(--app-primary-color); border-radius: 7px; background: var(--app-bg); color: var(--app-fg);
}

/* 文档上的标签小条 */
.file-tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 6px 6px 47px; }
.ftag {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  color: color-mix(in srgb, var(--tg) 78%, var(--app-fg));
  background: color-mix(in srgb, var(--tg) 11%, transparent);
}

/* 文件夹头 */
.folder-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 6px;
  margin: 5px 0 1px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 740;
  color: var(--app-fg-soft);
  cursor: pointer; user-select: none;
}
.folder-header:hover {
  background: color-mix(in srgb, var(--app-hover) 76%, transparent);
  border-color: color-mix(in srgb, var(--app-border) 58%, transparent);
}
.tree-chevron { color: var(--app-muted); margin-right: -2px; }
.folder-glyph { color: color-mix(in srgb, var(--app-muted) 84%, var(--app-primary-color)); }
.folder-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-count {
  font-size: 10px;
  font-weight: 700;
  color: var(--app-muted);
  background: color-mix(in srgb, var(--app-fg) 6%, transparent);
  padding: 1px 5px;
  border-radius: 999px;
}
.folder-new-doc {
  position: absolute;
  right: 4px;
  top: 3px;
  display: inline-grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
}
.folder-header:hover .folder-new-doc {
  opacity: 1;
  pointer-events: auto;
}
.folder-new-doc:hover {
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 10%, transparent);
}
.files .folder-empty {
  margin-left: 25px;
  text-align: left;
}

/* 标签编辑弹层 */
.tag-editor {
  position: absolute; z-index: 30; right: 6px; top: 34px; width: 196px;
  padding: 8px; border-radius: var(--radius-lg);
  border: 1px solid var(--app-control-border);
  background: var(--app-menu-bg);
  box-shadow: var(--shadow-lg);
  cursor: default;
}
.te-title { font-size: 11px; font-weight: 800; color: var(--app-muted); margin-bottom: 6px; }
.te-list { max-height: 200px; overflow: auto; }
.te-row { position: relative; display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.te-toggle {
  flex: 1; display: flex; align-items: center; gap: 7px; min-width: 0;
  font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left;
  padding: 5px 7px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--app-fg);
}
.te-toggle:hover { background: color-mix(in srgb, var(--app-primary-color) 9%, transparent); }
.te-toggle.on { background: color-mix(in srgb, var(--app-primary-color) 12%, transparent); }
.te-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
.te-toggle.on::after { content: '✓'; margin-left: auto; color: var(--app-primary-color); font-weight: 800; }
.te-color { flex: 0 0 auto; width: 18px; height: 18px; border-radius: 5px; border: 1px solid rgba(0,0,0,0.1); cursor: pointer; }
.te-palette {
  position: absolute; right: 0; top: 28px; z-index: 5; display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;
  padding: 6px; border-radius: var(--radius-md); background: var(--app-bg);
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent); box-shadow: var(--shadow-md);
}
.te-palette button { width: 18px; height: 18px; border-radius: 5px; border: 0; cursor: pointer; }
.te-empty { font-size: 11px; color: var(--app-muted); padding: 4px 7px; }
.te-add { display: flex; gap: 5px; margin-top: 6px; }
.te-add input {
  flex: 1; min-width: 0; font: inherit; font-size: 12px; padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent); border-radius: var(--radius-sm);
  background: var(--app-bg); color: var(--app-fg); outline: none;
}
.te-add button {
  flex: 0 0 auto; display: grid; place-items: center; width: 28px; cursor: pointer;
  border: 1px solid var(--app-primary-color); border-radius: var(--radius-sm);
  background: var(--app-primary-color); color: #fff;
}
.te-divider {
  height: 1px; margin: 8px 0;
  background: color-mix(in srgb, var(--app-border) 70%, transparent);
}
.te-folder-input {
  width: 100%; box-sizing: border-box; font: inherit; font-size: 12px; padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent); border-radius: var(--radius-sm);
  background: var(--app-bg); color: var(--app-fg); outline: none; margin-top: 4px;
}
.te-folder-input:focus { border-color: color-mix(in srgb, var(--app-primary-color) 50%, var(--app-border)); }

</style>
