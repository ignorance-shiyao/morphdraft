<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { useDocumentStore } from '../stores/document'
import { useStorageStore } from '../stores/storage'
import type { StorageType } from '../core/storage/factory'
import { useDialog } from '../composables/useDialog'
import Icon from './Icon.vue'
import AppLogo from './AppLogo.vue'
import { APP_BRAND } from '../config/brand'
import { useI18n } from 'vue-i18n'
import { saveFile } from '../core/export/save'

const settings = useSettingsStore()
const ui = useUiStore()
const doc = useDocumentStore()
const dialog = useDialog()
const fileInput = ref<HTMLInputElement | null>(null)
const { t } = useI18n({ useScope: 'global' })
const portableBusy = ref(false)

// —— 同步后端设置 ——
const storage = useStorageStore()
const storageSaved = ref(false)
function pickBackend(type: StorageType) {
  const p = storage.persisted as { baseUrl?: string; username?: string }
  if (type === 'webdav') storage.setBackend({ type, baseUrl: p.baseUrl ?? '', username: p.username })
  else if (type === 'http') storage.setBackend({ type, baseUrl: p.baseUrl ?? '' })
  else storage.setBackend({ type: type as 'local' | 'memory' })
  storageSaved.value = false
}
function setStorageUrl(v: string) {
  const p = storage.persisted
  if (p.type === 'http') storage.setBackend({ type: 'http', baseUrl: v })
  else if (p.type === 'webdav') storage.setBackend({ type: 'webdav', baseUrl: v, username: p.username })
  storageSaved.value = false
}
function setStorageUser(v: string) {
  const p = storage.persisted
  if (p.type === 'webdav') storage.setBackend({ type: 'webdav', baseUrl: p.baseUrl, username: v })
  storageSaved.value = false
}
function saveStorage() {
  storage.save()
  storageSaved.value = true
}
const storageUrl = computed(() => (storage.persisted as { baseUrl?: string }).baseUrl ?? '')
const storageUser = computed(() => (storage.persisted as { username?: string }).username ?? '')

type SectionId = 'data' | 'layout' | 'backup'
const NAV = computed<{ id: SectionId; icon: string; title: string; sub: string }[]>(() => [
  { id: 'data', icon: 'database', title: t('settings.local'), sub: t('settings.localSub') },
  { id: 'layout', icon: 'sliders', title: t('settings.layout'), sub: t('settings.layoutSub') },
  { id: 'backup', icon: 'save', title: t('settings.backup'), sub: t('settings.backupSub') },
])
const active = ref<SectionId>('data')

watch(
  () => settings.open,
  (open) => {
    if (open) active.value = 'data'
  },
)

async function exportBackup() {
  const backup = await doc.exportBackup()
  const name = `morphdraft-backup-${new Date().toISOString().slice(0, 10)}.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

async function preparePortableExport() {
  const pack = await doc.buildPortableExport()
  if (pack.manifest.missingAssets.length) {
    const ok = await dialog.confirm({
      title: t('settingsPage.missingAssetsTitle', { count: pack.manifest.missingAssets.length }),
      message: t('settingsPage.missingAssetsMessage', { assets: pack.manifest.missingAssets.slice(0, 8).join('\n') }),
      confirmText: t('settingsPage.continueExport'),
      cancelText: t('common.cancel'),
    })
    if (!ok) return null
  }
  return pack
}

async function exportPortableZip() {
  portableBusy.value = true
  try {
    const pack = await preparePortableExport()
    if (!pack) return
    const { createPortableZip } = await import('../core/export/portable')
    const blob = await createPortableZip(pack)
    const date = new Date().toISOString().slice(0, 10)
    await saveFile(`morphdraft-portable-${date}.zip`, blob, 'application/zip')
  } catch (error) {
    await dialog.alert({
      title: t('settingsPage.portableZipFailed'),
      message: error instanceof Error ? error.message : String(error),
      tone: 'danger',
    })
  } finally {
    portableBusy.value = false
  }
}

async function exportPortableFolder() {
  portableBusy.value = true
  try {
    const pack = await preparePortableExport()
    if (!pack) return
    const { savePortableDirectory } = await import('../core/export/portable')
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const path = await savePortableDirectory(pack, `morphdraft-portable-${date}`)
    if (path) await dialog.alert({ title: t('settingsPage.portableFolderDone'), message: path })
  } catch (error) {
    await dialog.alert({
      title: t('settingsPage.portableFolderFailed'),
      message: error instanceof Error ? error.message : String(error),
      tone: 'danger',
    })
  } finally {
    portableBusy.value = false
  }
}
function pickImportFile() {
  fileInput.value?.click()
}
async function importBackup(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const ok = await dialog.confirm({
    title: t('settingsPage.importBackupTitle'),
    message: t('settingsPage.importBackupMessage'),
    confirmText: t('common.import'), cancelText: t('common.cancel'), tone: 'danger',
  })
  if (!ok) return
  try {
    const backup = JSON.parse(await file.text())
    await doc.importBackup(backup)
    await dialog.alert({ title: t('settingsPage.importDone'), message: t('settingsPage.importDoneMessage') })
  } catch (err) {
    await dialog.alert({ title: t('settingsPage.importFailed'), message: err instanceof Error ? err.message : String(err), tone: 'danger' })
  }
}
async function clearLocalData() {
  const ok = await dialog.confirm({
    title: t('settingsPage.clearTitle'),
    message: t('settingsPage.clearMessage'),
    confirmText: t('settingsPage.clear'), cancelText: t('common.cancel'), tone: 'danger',
  })
  if (ok) await doc.clearLocalData()
}
async function cleanupOrphanAssets() {
  const ok = await dialog.confirm({
    title: t('settingsPage.cleanupTitle'),
    message: t('settingsPage.cleanupMessage'),
    confirmText: t('settingsPage.cleanup'), cancelText: t('common.cancel'), tone: 'danger',
  })
  if (!ok) return
  const { removed, scanned } = await doc.cleanupOrphanAssets()
  await dialog.alert({
    title: t('settingsPage.cleanupDone'),
    message: removed
      ? t('settingsPage.cleanupRemoved', { removed, scanned })
      : t('settingsPage.cleanupNone', { scanned }),
  })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="settings.open" class="s-backdrop" @click="settings.close">
      <section class="s-dialog" role="dialog" aria-modal="true" @click.stop>
        <header class="s-top">
          <div class="brand"><AppLogo :size="26" /> {{ APP_BRAND.displayName }}</div>
          <button class="close" :title="t('common.close')" @click="settings.close"><Icon name="close" :size="18" /></button>
        </header>

        <div class="s-main">
          <nav class="s-nav">
            <button
              v-for="n in NAV"
              :key="n.id"
              class="nav-item"
              :class="{ on: active === n.id }"
              @click="active = n.id"
            >
              <Icon :name="n.icon" :size="18" />
              <span class="nav-txt">
                <strong>{{ n.title }}</strong>
                <small>{{ n.sub }}</small>
              </span>
            </button>
            <div class="nav-foot">
              <button class="ghost" @click="ui.resetLayout"><Icon name="history" :size="14" /> {{ t('settings.resetLayout') }}</button>
            </div>
          </nav>

          <div class="s-content">
            <!-- 本地优先 -->
            <template v-if="active === 'data'">
              <div class="sec-head">
                <h2>{{ t('settingsPage.localTitle') }}</h2>
                <p>{{ t('settingsPage.localDescription') }}</p>
              </div>
              <div class="card">
                <h3>{{ t('settingsPage.dataStorage') }}</h3>
                <div class="info-grid">
                  <div><span class="label">{{ t('settingsPage.currentMode') }}</span><strong>{{ doc.backendLabel }}</strong></div>
                  <div><span class="label">{{ t('settingsPage.persistence') }}</span><strong>{{ doc.backendKind === 'vault' ? t('settingsPage.vaultPersistence') : t('settingsPage.builtinPersistence') }}</strong></div>
                  <div><span class="label">{{ t('settingsPage.capability') }}</span><strong>{{ t('settingsPage.capabilityValue') }}</strong></div>
                </div>
                <p class="note">{{ t('settingsPage.localNote') }}</p>
              </div>
              <!-- 工作目录（仅桌面端） -->
              <div v-if="settings.isTauri" class="card">
                <h3>{{ t('settingsPage.workDir') }}</h3>
                <p class="note">{{ t('settingsPage.workDirNote') }}</p>
                <div class="server-row">
                  <input :value="settings.workDir" class="text-input" :placeholder="t('settingsPage.workDirPlaceholder')" readonly />
                  <button class="btn" @click="settings.pickWorkDir">{{ t('settingsPage.change') }}</button>
                  <button class="btn" :disabled="!settings.workDir" @click="settings.openWorkDirInFinder">{{ t('common.open') }}</button>
                </div>
                <p v-if="settings.workDir" class="note">{{ t('settingsPage.currentPath', { path: settings.workDir }) }}</p>
                <p v-else class="note">{{ t('settingsPage.noWorkDir') }}</p>
              </div>
              <!-- 同步后端 -->
              <div class="card">
                <h3>{{ t('storageSync.title') }}</h3>
                <p class="note">{{ t('storageSync.note') }}</p>
                <div class="seg backend-seg">
                  <button :class="{ on: storage.type === 'local' }" @click="pickBackend('local')">{{ t('storageSync.local') }}</button>
                  <button :class="{ on: storage.type === 'webdav' }" @click="pickBackend('webdav')">{{ t('storageSync.webdav') }}</button>
                  <button :class="{ on: storage.type === 'http' }" @click="pickBackend('http')">{{ t('storageSync.http') }}</button>
                </div>
                <template v-if="storage.remote">
                  <label class="field">
                    <span>{{ t('storageSync.serverUrl') }}</span>
                    <input class="text-input" :value="storageUrl" :placeholder="t('storageSync.serverUrlHint')"
                      @input="setStorageUrl(($event.target as HTMLInputElement).value)" />
                  </label>
                  <label v-if="storage.type === 'webdav'" class="field">
                    <span>{{ t('storageSync.username') }}</span>
                    <input class="text-input" :value="storageUser"
                      @input="setStorageUser(($event.target as HTMLInputElement).value)" />
                  </label>
                  <label v-if="storage.type === 'webdav'" class="field">
                    <span>{{ t('storageSync.password') }}</span>
                    <input class="text-input" type="password" autocomplete="off"
                      @input="storage.setSecret({ password: ($event.target as HTMLInputElement).value })" />
                  </label>
                  <label v-if="storage.type === 'http'" class="field">
                    <span>{{ t('storageSync.token') }}</span>
                    <input class="text-input" type="password" autocomplete="off"
                      @input="storage.setSecret({ token: ($event.target as HTMLInputElement).value })" />
                  </label>
                  <p class="note">{{ t('storageSync.credentialsNote') }}</p>
                  <div class="action-row">
                    <button class="btn" :disabled="!storage.complete || storage.testing" @click="storage.testConnection()">
                      {{ storage.testing ? t('storageSync.testing') : t('storageSync.test') }}
                    </button>
                    <button class="btn primary" :disabled="!storage.complete" @click="saveStorage">{{ t('storageSync.save') }}</button>
                    <span v-if="storage.status?.ok" class="conn-ok">✓ {{ t('storageSync.connected') }}</span>
                    <span v-else-if="storage.status" class="conn-bad">{{ t('storageSync.failed', { error: storage.status.error }) }}</span>
                    <span v-else-if="storageSaved" class="conn-ok">✓ {{ t('storageSync.saved') }}</span>
                  </div>
                  <p class="note">{{ t('storageSync.syncPending') }}</p>
                </template>
              </div>
            </template>

            <!-- 界面布局 -->
            <template v-else-if="active === 'layout'">
              <div class="sec-head"><h2>{{ t('settingsPage.layoutTitle') }}</h2><p>{{ t('settingsPage.layoutDescription') }}</p></div>
              <div class="card">
                <label class="range-row">
                  <span>{{ t('settingsPage.sidebarWidth') }}</span>
                  <input type="range" min="200" max="420" :value="ui.sidebarWidth" @input="ui.setSidebarWidth(Number(($event.target as HTMLInputElement).value))" />
                  <strong>{{ ui.sidebarWidth }}px</strong>
                </label>
                <label class="range-row">
                  <span>{{ t('settingsPage.editorRatio') }}</span>
                  <input type="range" min="25" max="75" :value="Math.round(ui.editorRatio * 100)" @input="ui.setEditorRatio(Number(($event.target as HTMLInputElement).value) / 100)" />
                  <strong>{{ Math.round(ui.editorRatio * 100) }}%</strong>
                </label>
                <div class="action-row"><button class="btn" @click="ui.resetLayout">{{ t('settingsPage.resetLayout') }}</button></div>
              </div>
              <div class="card">
                <h3>{{ t('settingsPage.editor') }}</h3>
                <label class="switch-row">
                  <input type="checkbox" :checked="ui.smartPunctuation" @change="ui.toggleSmartPunctuation()" />
                  <span>{{ t('settingsPage.smartPunctuation') }}</span>
                </label>
                <p class="note" v-html="t('settingsPage.smartPunctuationNote')"></p>
                <label class="switch-row" style="margin-top:12px">
                  <input type="checkbox" :checked="ui.exportPreview" @change="ui.toggleExportPreview()" />
                  <span>{{ t('settingsPage.exportPreview') }}</span>
                </label>
                <p class="note">{{ t('settingsPage.exportPreviewNote') }}</p>
              </div>
            </template>

            <!-- 备份与恢复 -->
            <template v-else-if="active === 'backup'">
              <div class="sec-head"><h2>{{ t('settingsPage.backupTitle') }}</h2><p>{{ t('settingsPage.backupDescription') }}</p></div>
              <div class="card">
                <h3>{{ t('settingsPage.portablePackage') }}</h3>
                <p class="note">{{ t('settingsPage.portableNote') }}</p>
                <div class="action-row">
                  <button class="btn primary" :disabled="portableBusy" @click="exportPortableZip">
                    {{ portableBusy ? t('settingsPage.exporting') : t('settingsPage.exportPortableZip') }}
                  </button>
                  <button v-if="settings.isTauri" class="btn" :disabled="portableBusy" @click="exportPortableFolder">
                    {{ t('settingsPage.exportToFolder') }}
                  </button>
                </div>
              </div>
              <div class="card">
                <h3>{{ t('settingsPage.localBackup') }}</h3>
                <p class="note">{{ t('settingsPage.localBackupNote') }}</p>
                <div class="action-row">
                  <button class="btn primary" @click="exportBackup">{{ t('settingsPage.exportBackup') }}</button>
                  <button class="btn" @click="pickImportFile">{{ t('settingsPage.importBackup') }}</button>
                  <button class="btn danger" @click="clearLocalData">{{ t('settingsPage.clearLocalLibrary') }}</button>
                  <input ref="fileInput" class="hidden-file" type="file" accept="application/json,.json" @change="importBackup" />
                </div>
              </div>
              <div class="card">
                <h3>{{ t('settingsPage.imageAssets') }}</h3>
                <p class="note">{{ t('settingsPage.imageAssetsNote') }}</p>
                <div class="action-row">
                  <button class="btn danger" @click="cleanupOrphanAssets">{{ t('settingsPage.cleanupOrphanImages') }}</button>
                </div>
              </div>
            </template>

          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.s-dialog {
  /* —— 组件公共变量（引用尺度 token + 主题 --app-*），换肤无需改结构 —— */
  --s-card-bg: var(--app-shell-bg);
  --s-card-border: var(--app-hairline);
  --s-nav-bg: var(--app-shell-bg);
  --s-hover: var(--app-hover);
}
.s-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(8px);
}
.s-dialog {
  width: min(940px, 100%);
  height: min(640px, 92vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--s-card-border);
  border-radius: var(--radius-2xl);
  background: var(--app-elevated);
  color: var(--app-fg);
  box-shadow: var(--shadow-lg);
}
.s-top {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid color-mix(in srgb, var(--app-border) 70%, transparent);
}
.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; font-size: var(--font-size-lg); }
.logo {
  display: grid; place-items: center;
  width: 28px; height: 28px; border-radius: var(--radius-md);
  font-size: 15px; font-weight: 900;
  color: var(--app-bg); background: var(--app-fg);
}
.logo.lg { width: 48px; height: 48px; font-size: 24px; border-radius: var(--radius-lg); }
.close {
  display: grid; place-items: center;
  width: 32px; height: 32px; cursor: pointer;
  border: 1px solid var(--s-card-border); border-radius: var(--radius-md);
  background: var(--app-bg); color: var(--app-muted);
  transition: color var(--transition-fast), border-color var(--transition-fast);
}
.close:hover { color: var(--app-fg); border-color: color-mix(in srgb, var(--app-primary-color) 40%, var(--app-border)); }

.s-main { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 232px 1fr; }
.s-nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: var(--space-3);
  border-right: 1px solid color-mix(in srgb, var(--app-border) 70%, transparent);
  background: var(--s-nav-bg);
  overflow: auto;
}
.nav-item {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 11px;
  border: 0; border-radius: var(--radius-lg);
  background: none; color: var(--app-muted);
  cursor: pointer; text-align: left;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.nav-item:hover { background: var(--s-hover); color: var(--app-fg); }
.nav-item.on { background: color-mix(in srgb, var(--app-primary-color) 13%, transparent); color: var(--app-primary-color); }
.nav-txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.nav-txt strong { font-size: 13.5px; font-weight: 700; }
.nav-txt small { font-size: 11px; color: var(--app-muted); }
.nav-item.on .nav-txt small { color: color-mix(in srgb, var(--app-primary-color) 70%, var(--app-muted)); }
.nav-foot { margin-top: auto; padding-top: var(--space-2); }
.ghost {
  width: 100%;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
  padding: 9px; border: 1px solid var(--s-card-border); border-radius: var(--radius-md);
  background: var(--app-bg); color: var(--app-muted);
}
.ghost:hover { color: var(--app-primary-color); border-color: color-mix(in srgb, var(--app-primary-color) 40%, var(--app-border)); }

.s-content { overflow: auto; padding: var(--space-6) var(--space-8); }
.sec-head { margin-bottom: var(--space-5); }
.sec-head h2 { margin: 0 0 6px; font-size: var(--font-size-xl); }
.sec-head p { margin: 0; font-size: var(--font-size-sm); color: var(--app-muted); line-height: var(--line-height-normal); }
.card {
  padding: var(--space-5);
  border: 1px solid var(--s-card-border);
  border-radius: var(--radius-xl);
  background: var(--s-card-bg);
}
.card + .card { margin-top: var(--space-4); }
.card h3 { margin: 0 0 var(--space-3); font-size: var(--font-size-md); }

.info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.info-grid > div { padding: 11px; border: 1px solid var(--s-card-border); border-radius: var(--radius-lg); background: var(--app-bg); }
.label { display: block; margin-bottom: 5px; font-size: 11px; color: var(--app-muted); }
.info-grid strong { font-size: 13px; }
.note { margin: var(--space-3) 0 0; color: var(--app-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
.note code { background: var(--app-code-bg); padding: 1px 5px; border-radius: var(--radius-xs); }

.switch-row { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; }
.switch-row input { width: 16px; height: 16px; accent-color: var(--app-primary-color); }
.server-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: var(--space-3); }
.text-input {
  min-width: 0; font: inherit; font-size: 13px; padding: 9px 11px;
  border: 1px solid var(--s-card-border); border-radius: var(--radius-md);
  background: var(--app-bg); color: var(--app-fg);
}
.text-input:focus { outline: none; border-color: color-mix(in srgb, var(--app-primary-color) 55%, var(--app-border)); }

.btn {
  font: inherit; font-size: 12px; font-weight: 750; cursor: pointer;
  padding: 9px 14px; border-radius: var(--radius-md);
  border: 1px solid var(--s-card-border); background: var(--app-bg); color: var(--app-fg);
  transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
}
.btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--app-primary-color) 45%, var(--app-border)); color: var(--app-primary-color); }
.btn:disabled { opacity: 0.55; cursor: default; }
.btn.primary { background: var(--app-primary-color); border-color: var(--app-primary-color); color: #fff; }
.btn.primary:hover { color: #fff; filter: brightness(1.05); }
.btn.danger { color: #b42318; border-color: color-mix(in srgb, #dc2626 45%, var(--app-border)); }
.btn.danger:hover { color: #b42318; background: color-mix(in srgb, #dc2626 8%, var(--app-bg)); }
.action-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: var(--space-3); }
.hidden-file { display: none; }

.status-line { display: inline-flex; align-items: center; gap: 7px; margin-top: var(--space-3); color: var(--app-muted); font-size: 12px; font-weight: 750; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--app-muted); }
.status-line.ok { color: #16a34a; } .status-line.ok .status-dot { background: #16a34a; }
.status-line.error { color: #b42318; } .status-line.error .status-dot { background: #b42318; }

.range-row { display: flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 700; }
.range-row + .range-row { margin-top: var(--space-4); }
.range-row span { width: 90px; }
.range-row input { flex: 1; accent-color: var(--app-primary-color); }
.range-row strong { width: 48px; text-align: right; }
.backend-seg { display: inline-flex; gap: 2px; padding: 3px; margin-bottom: var(--space-3); border-radius: 9px; background: color-mix(in srgb, var(--app-fg) 5%, var(--app-bg)); border: 1px solid color-mix(in srgb, var(--app-border) 55%, transparent); }
.backend-seg button { border: 0; background: transparent; cursor: pointer; padding: 6px 14px; border-radius: 6px; font: inherit; font-size: 12px; font-weight: 650; color: var(--app-muted); white-space: nowrap; }
.backend-seg button.on { background: var(--app-primary-color); color: #fff; }
.field { display: flex; flex-direction: column; gap: 5px; margin-top: var(--space-3); font-size: 12px; font-weight: 650; color: var(--app-muted); }
.field .text-input { font-weight: 500; }
.conn-ok { align-self: center; font-size: 12px; font-weight: 700; color: #15803d; }
.conn-bad { align-self: center; font-size: 12px; font-weight: 650; color: #b42318; }

.font-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  align-items: center;
  gap: 20px;
}

.font-row + .font-row {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--s-card-border);
}

.font-row > span {
  display: grid;
  gap: 3px;
}

.font-row strong {
  font-size: 13px;
}

.font-row small {
  color: var(--app-muted);
  font-size: 11px;
}

.font-row select {
  width: 100%;
  padding: 9px 32px 9px 10px;
  border: 1px solid var(--s-card-border);
  border-radius: var(--radius-md);
  outline: none;
  background: var(--app-bg);
  color: var(--app-fg);
  font: inherit;
  font-size: 13px;
}

.font-row select:focus {
  border-color: var(--app-primary-color);
}

.theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
.theme-cell {
  display: flex; flex-direction: column; gap: 7px; padding: 8px;
  border: 1.5px solid var(--s-card-border); border-radius: var(--radius-lg);
  background: var(--app-bg); cursor: pointer; text-align: left;
  transition: border-color var(--transition-fast), transform var(--transition-fast);
}
.theme-cell:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--app-primary-color) 40%, var(--app-border)); }
.theme-cell.on { border-color: var(--app-primary-color); box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-primary-color) 22%, transparent); }
.sw { position: relative; height: 42px; border-radius: var(--radius-sm); border: 1px solid; overflow: hidden; }
.sw .dot { position: absolute; left: 9px; top: 9px; width: 16px; height: 16px; border-radius: 50%; }
.sw .bar { position: absolute; left: 9px; bottom: 9px; width: 56px; height: 5px; border-radius: 3px; opacity: 0.85; }
.tn { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 700; color: var(--app-fg); }
.tn small { font-size: 10px; font-weight: 700; color: var(--app-muted); }

@media (max-width: 760px) {
  .s-main { grid-template-columns: 1fr; }
  .s-nav { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--app-border); }
  .s-nav .nav-item { flex: 0 0 auto; }
  .s-nav .nav-txt strong, .s-nav .nav-txt small { white-space: nowrap; }
  .nav-foot { display: none; }
  .info-grid { grid-template-columns: 1fr; }

  .font-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
