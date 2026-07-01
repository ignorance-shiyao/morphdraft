<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CHIP_COLORS, serializeChip, type ChipColor, type ChipFields } from '../core/markdown/chipEdit'
import { ICON_NAMES } from '../core/markdown/icons'

const props = defineProps<{
  anchor: { left: number; top: number; bottom: number }
  fields: ChipFields
}>()
const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'done', fields: ChipFields): void
}>()

const { t } = useI18n({ useScope: 'global' })
const panel = ref<HTMLElement | null>(null)
const style = ref({ left: `${props.anchor.left}px`, top: `${props.anchor.bottom + 8}px` })
const kind = ref<ChipFields['kind']>(props.fields.kind)
const pillColor = ref<ChipColor | ''>(props.fields.kind === 'pill' ? props.fields.color ?? '' : '')
const pillText = ref(props.fields.kind === 'pill' ? props.fields.text : '')
const barValue = ref(props.fields.kind === 'bar' ? props.fields.value : 50)
const barLabel = ref(props.fields.kind === 'bar' ? props.fields.label ?? '' : '')
const sparkValues = ref(props.fields.kind === 'spark' ? props.fields.values.join(',') : '3,5,2,8,6')
const iconName = ref(props.fields.kind === 'icon' ? props.fields.name : 'star')

const colorOptions = computed(() => ['', ...CHIP_COLORS])
const preview = computed(() => serializeChip(buildFields()))

function updatePosition() {
  const rect = panel.value?.getBoundingClientRect()
  if (!rect) return
  const pad = 10
  const left = Math.min(Math.max(pad, props.anchor.left), window.innerWidth - rect.width - pad)
  const below = props.anchor.bottom + 8
  const above = props.anchor.top - rect.height - 8
  const top = below + rect.height < window.innerHeight - pad ? below : Math.max(pad, above)
  style.value = { left: `${left}px`, top: `${top}px` }
}

function buildFields(): ChipFields {
  if (kind.value === 'bar') {
    const value = Math.max(0, Math.min(100, Math.round(Number(barValue.value) || 0)))
    const label = barLabel.value.trim()
    return label ? { kind: 'bar', value, label } : { kind: 'bar', value }
  }
  if (kind.value === 'spark') {
    const values = sparkValues.value
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n))
    return { kind: 'spark', values: values.length >= 2 ? values : [3, 5, 2, 8, 6] }
  }
  if (kind.value === 'icon') return { kind: 'icon', name: iconName.value || 'star' }
  const text = pillText.value.trim() || 'Tag'
  return pillColor.value ? { kind: 'pill', color: pillColor.value, text } : { kind: 'pill', text }
}

function done() {
  emit('done', buildFields())
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); emit('cancel') }
  else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); done() }
}

onMounted(() => {
  void nextTick(updatePosition)
  window.addEventListener('resize', updatePosition)
})
onBeforeUnmount(() => window.removeEventListener('resize', updatePosition))
</script>

<template>
  <Teleport to="body">
    <div class="cep-overlay" @pointerdown.self="emit('cancel')">
      <form ref="panel" class="cep" :style="style" @submit.prevent="done" @keydown="onKeydown">
        <div class="cep-title">{{ t('chipEditor.title') }}</div>
        <div class="cep-kind">
          <button type="button" :class="{ on: kind === 'pill' }" @click="kind = 'pill'">{{ t('chipEditor.pill') }}</button>
          <button type="button" :class="{ on: kind === 'bar' }" @click="kind = 'bar'">{{ t('chipEditor.bar') }}</button>
          <button type="button" :class="{ on: kind === 'spark' }" @click="kind = 'spark'">{{ t('chipEditor.spark') }}</button>
          <button type="button" :class="{ on: kind === 'icon' }" @click="kind = 'icon'">{{ t('chipEditor.icon') }}</button>
        </div>

        <template v-if="kind === 'pill'">
          <label><span>{{ t('chipEditor.text') }}</span><input v-model="pillText" /></label>
          <label>
            <span>{{ t('chipEditor.color') }}</span>
            <select v-model="pillColor">
              <option v-for="c in colorOptions" :key="c || 'none'" :value="c">{{ c || t('chipEditor.neutral') }}</option>
            </select>
          </label>
        </template>

        <template v-else-if="kind === 'bar'">
          <label><span>{{ t('chipEditor.value') }}</span><input v-model.number="barValue" type="number" min="0" max="100" /></label>
          <label><span>{{ t('chipEditor.label') }}</span><input v-model="barLabel" /></label>
          <input class="cep-range" v-model.number="barValue" type="range" min="0" max="100" />
        </template>

        <template v-else-if="kind === 'spark'">
          <label><span>{{ t('chipEditor.values') }}</span><input v-model="sparkValues" placeholder="3,5,2,8,6" /></label>
        </template>

        <template v-else>
          <label>
            <span>{{ t('chipEditor.icon') }}</span>
            <select v-model="iconName">
              <option v-for="name in ICON_NAMES" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
        </template>

        <div class="cep-preview">
          <span>{{ t('chipEditor.preview') }}</span>
          <code>{{ preview }}</code>
        </div>

        <div class="cep-actions">
          <button type="button" @click="emit('cancel')">{{ t('chipEditor.cancel') }}</button>
          <button class="primary" type="submit">{{ t('chipEditor.done') }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.cep-overlay { position: fixed; inset: 0; z-index: 9998; }
.cep {
  position: fixed;
  width: min(360px, calc(100vw - 20px));
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--app-control-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-elevated) 96%, transparent);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(18px) saturate(1.15);
}
.cep-title { margin-bottom: 10px; color: var(--app-fg); font-size: 14px; font-weight: 800; }
.cep-kind { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-bottom: 10px; }
.cep-kind button, .cep-actions button {
  height: 28px; border: 1px solid var(--app-control-border); border-radius: 8px;
  background: var(--app-control-bg); color: var(--app-fg); font: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
}
.cep-kind button.on { color: #fff; border-color: var(--app-primary-color); background: var(--app-primary-color); }
.cep label { display: grid; grid-template-columns: 76px 1fr; align-items: center; gap: 8px; margin-top: 8px; }
.cep label > span { color: var(--app-muted); font-size: 11px; font-weight: 650; }
.cep input, .cep select {
  min-width: 0; height: 32px; box-sizing: border-box; padding: 0 9px;
  border: 1px solid var(--app-control-border); border-radius: 8px; outline: 0;
  background: var(--app-control-bg); color: var(--app-fg); font: inherit; font-size: 12px;
}
.cep input:focus, .cep select:focus {
  border-color: var(--app-primary-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-primary-color) 13%, transparent);
}
.cep-range { width: 100%; margin-top: 10px; accent-color: var(--app-primary-color); }
.cep-preview {
  display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 10px;
  border: 1px solid var(--app-hairline); border-radius: 8px; background: var(--app-control-bg);
  color: var(--app-muted); font-size: 11px;
}
.cep-preview code { color: var(--app-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cep-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.cep-actions .primary { color: #fff; border-color: var(--app-primary-color); background: var(--app-primary-color); }
</style>
