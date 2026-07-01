<script setup lang="ts">
// 墨形 MorphDraft 标志（透明背景）。size 控制高度，宽度按比例自适应。
import { APP_BRAND } from '../config/brand'
import logoUrl from '../assets/logo.svg'
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <img :src="logoUrl" :style="{ height: size + 'px' }" class="app-logo" :alt="APP_BRAND.displayName" />
</template>

<style scoped>
.app-logo { display: block; width: auto; flex: 0 0 auto; user-select: none; }
</style>
