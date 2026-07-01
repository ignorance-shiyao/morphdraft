<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useImportJobStore, type ImportStage } from '../stores/importJob'
import Icon from './Icon.vue'

const job = useImportJobStore()
const { t } = useI18n({ useScope: 'global' })

const stageLabel = computed(() => {
  const key = `importJob.stage.${job.stage}` as const
  const mapped = t(key)
  if (mapped !== key) return mapped
  return t('importJob.stage.converting')
})

const headline = computed(() => {
  if (job.stage === 'done') return t('drop.resultTitle')
  if (job.stage === 'error') return t('drop.failureTitle')
  return t('importJob.title')
})

const subline = computed(() => {
  if (job.stage === 'done' && job.result) {
    return t('drop.result', {
      imported: job.result.imported,
      skipped: job.result.skipped.length,
      failed: job.result.failed.length,
    })
  }
  if (job.stage === 'error') return job.error || t('importJob.unknownError')
  if (job.fileName) {
    const base = t('importJob.fileProgress', { current: job.current, total: job.total, name: job.fileName })
    return job.detail ? `${base} · ${job.detail}` : base
  }
  return t('importJob.backgroundHint')
})

const showBar = computed(() => job.active || job.stage === 'queued')

function stageIcon(stage: ImportStage) {
  if (stage === 'done') return 'check'
  if (stage === 'error') return 'close'
  return 'download'
}

let autoDismissTimer: number | undefined
watch(
  () => job.stage,
  (stage) => {
    if (autoDismissTimer) window.clearTimeout(autoDismissTimer)
    if (stage === 'done' || stage === 'error') {
      autoDismissTimer = window.setTimeout(() => job.dismiss(), 12000)
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="job.isVisible" class="import-progress-host" :class="{ minimized: job.minimized }">
      <div class="import-progress-card" role="status" aria-live="polite">
        <div class="ipc-head">
          <div class="ipc-icon" :class="{ spin: job.active }">
            <Icon :name="stageIcon(job.stage)" :size="16" />
          </div>
          <div class="ipc-text">
            <strong>{{ headline }}</strong>
            <span class="ipc-sub">{{ subline }}</span>
          </div>
          <div class="ipc-actions">
            <button
              v-if="job.active"
              class="ipc-btn"
              :title="job.minimized ? t('importJob.expand') : t('importJob.minimize')"
              @click="job.toggleMinimized()"
            >
              <Icon :name="job.minimized ? 'chevron-down' : 'chevron-right'" :size="14" />
            </button>
            <button
              v-if="!job.active"
              class="ipc-btn"
              :title="t('common.close')"
              @click="job.dismiss()"
            >
              <Icon name="close" :size="14" />
            </button>
          </div>
        </div>
        <template v-if="!job.minimized">
          <div v-if="showBar" class="ipc-track">
            <span class="ipc-bar" :style="{ width: `${job.progressPct}%` }"></span>
          </div>
          <p v-if="job.active" class="ipc-hint">{{ t('importJob.backgroundHint') }}</p>
          <ul v-if="job.stage === 'done' && job.result?.failed.length" class="ipc-failures">
            <li v-for="item in job.result.failed" :key="item.name">
              {{ item.name }}：{{ item.message }}
            </li>
          </ul>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.import-progress-host {
  position: fixed;
  right: 16px;
  bottom: 36px;
  z-index: calc(var(--z-modal) + 12);
  width: min(380px, calc(100vw - 32px));
  pointer-events: auto;
}
.import-progress-host.minimized {
  width: min(320px, calc(100vw - 32px));
}
.import-progress-card {
  padding: 12px 14px;
  border: 1px solid var(--app-hairline);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-elevated) 96%, transparent);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(14px);
}
.ipc-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.ipc-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--app-primary-color);
  background: color-mix(in srgb, var(--app-primary-color) 12%, transparent);
}
.ipc-icon.spin {
  animation: ipc-spin 1.1s linear infinite;
}
@keyframes ipc-spin {
  to { transform: rotate(360deg); }
}
.ipc-text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ipc-text strong {
  font-size: 13px;
  font-weight: 800;
  color: var(--app-fg);
}
.ipc-sub {
  font-size: 11px;
  line-height: 1.45;
  color: var(--app-muted);
  word-break: break-all;
}
.ipc-actions {
  flex: 0 0 auto;
  display: inline-flex;
  gap: 2px;
}
.ipc-btn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
}
.ipc-btn:hover {
  color: var(--app-primary-color);
  background: var(--app-hover);
}
.ipc-track {
  position: relative;
  height: 4px;
  margin-top: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--app-primary-color) 12%, transparent);
}
.ipc-bar {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: var(--app-primary-color);
  transition: width 0.25s ease;
}
.ipc-hint {
  margin: 8px 0 0;
  font-size: 10.5px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--app-muted) 88%, var(--app-primary-color));
}
.ipc-failures {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 11px;
  color: #b42318;
  line-height: 1.45;
}
</style>
