<script setup lang="ts">
// X1: 导出前预览弹层。复用现有渲染管线（renderStatic / captureSlides），不重写导出逻辑。
// 确认后 emit('confirm', filename)，由 Toolbar 调真正的导出函数；取消 emit('cancel')。
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ThemeTokens } from '../core/themes/presets'
import { SLIDE_RATIOS } from '../core/paper'
import { useUiStore } from '../stores/ui'

const props = defineProps<{
  kind: string
  label: string
  confirmLabel: string // 「下载」或「复制」
  markdown: string
  tokens: ThemeTokens
  slideMode: boolean
  defaultName: string
  summary: string // 参数摘要（纸张/比例/模板等）
  showName?: boolean // 复制类（公众号/知乎）无文件名，置 false
}>()
const emit = defineEmits<{ (e: 'confirm', filename: string): void; (e: 'cancel'): void }>()

const ui = useUiStore()
const { t } = useI18n({ useScope: 'global' })
const filename = ref(props.defaultName)
const loading = ref(true)
const errorMsg = ref('')

// 预览形态：幻灯片类 → 缩略图网格；其余 → 渲染 HTML
const slideKinds = new Set(['pptx', 'pdf', 'handout'])
const isSlideThumbs = computed(() => props.slideMode && slideKinds.has(props.kind))

const thumbs = ref<string[]>([]) // 幻灯片 PNG data URI
const docHtml = ref('') // 文档渲染 HTML
let disposeStatic: (() => void) | null = null

async function buildPreview() {
  loading.value = true
  errorMsg.value = ''
  try {
    if (isSlideThumbs.value) {
      const dims = SLIDE_RATIOS[ui.slideRatio]
      const { captureSlides } = await import('../core/export/slide-capture')
      const slides = await captureSlides(props.markdown, props.tokens, dims)
      thumbs.value = slides.map((s) => s.png)
    } else {
      const { renderStatic } = await import('../core/export/render-static')
      const r = await renderStatic(props.markdown, { tokens: props.tokens, width: 820 })
      docHtml.value = r.html
      disposeStatic = r.dispose
    }
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function onConfirm() {
  emit('confirm', filename.value.trim() || props.defaultName)
}

onMounted(buildPreview)
onBeforeUnmount(() => disposeStatic?.())
</script>

<template>
  <Teleport to="body">
    <div class="xp-backdrop" @click="emit('cancel')">
      <section class="xp-dialog" role="dialog" aria-modal="true" @click.stop>
        <header class="xp-head">
          <div class="xp-title">
            <strong>{{ t('exportPreview.title') }}</strong>
            <span class="xp-kind">{{ label }}</span>
          </div>
          <button class="xp-close" :title="t('exportPreview.close')" @click="emit('cancel')">✕</button>
        </header>

        <div class="xp-body">
          <div v-if="loading" class="xp-state">{{ t('exportPreview.loading') }}</div>
          <div v-else-if="errorMsg" class="xp-state xp-error">{{ t('exportPreview.failed', { message: errorMsg }) }}</div>

          <!-- 幻灯片缩略图网格 -->
          <div v-else-if="isSlideThumbs" class="xp-thumbs">
            <div v-for="(png, i) in thumbs" :key="i" class="xp-thumb">
              <img :src="png" :alt="t('exportPreview.slideAlt', { n: i + 1 })" />
              <span class="xp-thumb-no">{{ i + 1 }}</span>
            </div>
            <p v-if="!thumbs.length" class="xp-state">{{ t('exportPreview.emptySlides') }}</p>
          </div>

          <!-- 文档/分享：渲染 HTML 预览 -->
          <div v-else class="xp-doc-scroll">
            <div class="xp-paper doc-preview" v-html="docHtml"></div>
          </div>
        </div>

        <footer class="xp-foot">
          <label v-if="showName !== false" class="xp-name">
            {{ t('exportPreview.filename') }}
            <input v-model="filename" spellcheck="false" />
          </label>
          <span class="xp-summary">{{ summary }}</span>
          <span class="xp-spacer"></span>
          <button class="xp-btn ghost" @click="emit('cancel')">{{ t('common.cancel') }}</button>
          <button class="xp-btn primary" :disabled="loading" @click="onConfirm">{{ confirmLabel }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.xp-backdrop {
  position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center;
  padding: 24px; background: rgba(15, 23, 42, 0.36); backdrop-filter: blur(8px);
}
.xp-dialog {
  width: min(860px, 100%); max-height: 88vh; display: flex; flex-direction: column;
  border: 1px solid var(--app-hairline);
  border-radius: var(--radius-2xl); background: var(--app-elevated);
  color: var(--app-fg); box-shadow: var(--shadow-lg); overflow: hidden;
}
.xp-head {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--app-hairline);
}
.xp-title { display: flex; align-items: baseline; gap: 10px; }
.xp-title strong { font-size: 15px; }
.xp-kind {
  font-size: 12px; font-weight: 700; color: var(--app-primary-color);
  padding: 2px 8px; border-radius: 999px;
  background: color-mix(in srgb, var(--app-primary-color) 12%, transparent);
}
.xp-close {
  font: inherit; font-size: 15px; width: 28px; height: 28px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent; background: transparent; color: var(--app-muted);
}
.xp-close:hover { background: var(--app-hover); color: var(--app-primary-color); }
.xp-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px 18px; background: var(--app-soft-bg); }
.xp-state { padding: 40px; text-align: center; color: var(--app-muted); font-size: 13px; }
.xp-error { color: #b42318; }
.xp-thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
.xp-thumb {
  position: relative; border: 1px solid var(--app-border); border-radius: 10px; overflow: hidden;
  background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}
.xp-thumb img { display: block; width: 100%; height: auto; }
.xp-thumb-no {
  position: absolute; left: 6px; bottom: 6px; font-size: 11px; font-weight: 800; color: #fff;
  background: rgba(0, 0, 0, 0.55); border-radius: 999px; padding: 1px 8px;
}
.xp-doc-scroll { display: grid; place-items: start center; }
.xp-paper {
  width: 100%; max-width: 820px; background: #fff; color: #1f2328;
  padding: 32px 40px; border-radius: 8px; border: 1px solid var(--app-border);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}
.xp-foot {
  flex: 0 0 auto; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 12px 18px; border-top: 1px solid var(--app-hairline);
}
.xp-name { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 650; color: var(--app-muted); }
.xp-name input {
  font: inherit; font-size: 13px; width: 200px; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--app-border); background: var(--app-bg); color: var(--app-fg);
}
.xp-summary { font-size: 12px; color: var(--app-muted); }
.xp-spacer { flex: 1 1 auto; }
.xp-btn { font: inherit; font-size: 13px; font-weight: 700; min-width: 84px; padding: 8px 14px; border-radius: 9px; cursor: pointer; }
.xp-btn.ghost { border: 1px solid var(--app-border); background: var(--app-bg); color: var(--app-fg); }
.xp-btn.primary { border: 1px solid var(--app-primary-color); background: var(--app-primary-color); color: #fff; }
.xp-btn.primary:disabled { opacity: 0.5; cursor: default; }
</style>
