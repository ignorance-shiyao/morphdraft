import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/base.css'
import './styles/tokens.css'
import './styles/slides.css'
import './styles/slideSkins.css'
import './styles/slidevThemes.css'
import 'katex/dist/katex.min.css'
import { CODE_CSS } from './core/markdown/codeTheme'
import { ALERT_CSS } from './core/markdown/alerts'
import { BLOCKS_CSS } from './core/markdown/blocksCss'
import { APP_BRAND } from './config/brand'
import { hydrateFromDisk, startMirror } from './core/configMirror'
import { applyStoredLocale, i18n, startSystemLocaleSync } from './i18n'

// 注入代码高亮配色 + GitHub Alerts + 扩展块样式（预览与离屏截图导出共用）
const codeStyle = document.createElement('style')
codeStyle.textContent = CODE_CSS + ALERT_CSS + BLOCKS_CSS
document.head.appendChild(codeStyle)
document.title = APP_BRAND.title

// 桌面端：先从磁盘配置文件恢复设置（必须在 mount 前，各 store 状态工厂里的
// 同步 loadX() 才能读到恢复值），再开启变更回写镜像。浏览器端两者均为 no-op。
async function boot() {
  await hydrateFromDisk()
  startMirror()
  applyStoredLocale()
  startSystemLocaleSync()
  createApp(App).use(createPinia()).use(i18n).mount('#app')
}

void boot()
