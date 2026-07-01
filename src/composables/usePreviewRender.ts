import { watch, onMounted, onBeforeUnmount, nextTick, type Ref } from 'vue'
import { renderWithSource } from '../core/markdown'
import { resolveAssetUrls } from '../core/markdown'
import { toggleTaskAndSort } from '../core/markdown/taskToggle'
import { mountCharts, disposeChart, chartThemeStamp } from '../core/charts/mount'
import { mountMermaidToolsInRoot } from '../core/charts/mermaidTools'
import { setMermaidTheme } from '../core/charts/mermaid'
import { composeChartCards } from '../core/markdown/chartCards'
import { mergeSplitTables } from '../core/export/paginate'
import { useDocumentStore } from '../stores/document'
import { useThemeStore } from '../stores/theme'
import { useSyncStore } from '../stores/sync'

// 把 store.markdown 渲染进 host 元素，处理图表挂载/清理、主题联动，
// 并提供与编辑器的双向定位 + 滚动同步（供 DocumentPreview 使用）。
export function usePreviewRender(
  host: Ref<HTMLElement | null>,
  opts: {
    onRendered?: () => void
      onSourceClick?: (payload: {
          line: number
          el: HTMLElement
          event: MouseEvent
          target?: HTMLElement
      }) => boolean | void
    // 行内编辑期间暂停自动重渲染，避免整段 DOM 被替换打断浮层编辑器
    isRenderSuspended?: () => boolean
  } = {},
) {
  const doc = useDocumentStore()
  const theme = useThemeStore()
  const sync = useSyncStore()
  let cleanup: (() => void) | null = null
  let lineOffset = 0
  let scrollLock = 0

  function scroller(): HTMLElement | null {
    return host.value?.parentElement ?? null
  }
  function lineEls(): { line: number; el: HTMLElement }[] {
    if (!host.value) return []
    return Array.from(host.value.querySelectorAll<HTMLElement>('[data-source-line]'))
      .filter((el) => !el.classList.contains('md-heading-hidden'))
      .map((el) => ({ line: Number(el.dataset.sourceLine) + lineOffset, el }))
      .sort((a, b) => a.line - b.line)
  }

  // 顶层块签名：图块按 (类型, chart-code) 计（已渲染的旧块内含 SVG/canvas，与新占位 HTML 不同，
  // 但只要源代码没变就视为同一块、复用旧节点保住实例）；其余块按 outerHTML 计（确定性渲染 → 内容没变即同签名）。
  // 关键：剔除 data-source-line 再比对——在文档中部增删行会让下方所有块的源码行号整体平移，
  // 但块内容并未改变，不应据此判定为「已变」而整块重建。复用后再用 syncSourceLines 把新行号补写回去。
  function blockSignature(el: Element): string {
    if (el.classList?.contains('chart-block')) {
      // 关键：把「渲染时的主题指纹」并入签名——已渲染旧块用它当时记下的 themeStamp，
      // 新模板块没有 stamp 则取当前主题。主题变更 → 两者指纹不同 → 不复用 → 重渲染成新主题色。
      const he = el as HTMLElement
      const stamp = he.dataset.themeStamp ?? chartThemeStamp(theme.tokens)
      return `chart::${he.dataset.chartType}::${he.dataset.chartCode}::${stamp}`
    }
    const clone = el.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.md-table-handle, .md-code-copy, .md-row-select').forEach((n) => n.remove())
    clone.querySelectorAll('.md-image-resize, .md-heading-toggle').forEach((n) => n.remove())
    clone.querySelectorAll('.md-row-selected').forEach((n) => n.classList.remove('md-row-selected'))
    clone.querySelectorAll('.md-cell-selected').forEach((n) => n.classList.remove('md-cell-selected'))
    clone.querySelectorAll('.md-resizable-image, .md-heading-collapsed, .md-heading-hidden')
      .forEach((n) => n.classList.remove('md-resizable-image', 'md-heading-collapsed', 'md-heading-hidden'))
    return `html::${clone.outerHTML.replace(/ data-source-line="\d+"/g, '')}`
  }

  // 收集 root 自身 + 后代里所有带 data-source-line 的元素（文档顺序）。
  function sourceLineEls(root: Element): Element[] {
    const list: Element[] = []
    if (root.hasAttribute('data-source-line')) list.push(root)
    root.querySelectorAll('[data-source-line]').forEach((n) => list.push(n))
    return list
  }

  // 复用旧节点时，按结构对齐把新节点的源码行号补写到旧节点（两者内容签名相同 → 结构一致 → 一一对应）。
  function syncSourceLines(oldEl: Element, newEl: Element): void {
    const olds = sourceLineEls(oldEl)
    const news = sourceLineEls(newEl)
    const len = Math.min(olds.length, news.length)
    for (let i = 0; i < len; i++) {
      const v = news[i].getAttribute('data-source-line')
      if (v !== null) olds[i].setAttribute('data-source-line', v)
    }
  }

  function disposeChartsIn(el: Element): void {
    if (el.matches?.('.chart-block')) disposeChart(el as HTMLElement)
    el.querySelectorAll?.('.chart-block').forEach((c) => disposeChart(c as HTMLElement))
  }

  // 把分页 sheet 与图表卡片拆回扁平顶层块，使现有 DOM 顶层结构与 renderWithSource 的扁平输出对齐，
  // 这样 morph 才能按块一一比对。节点身份在拆解中保持不变（只搬位置、不重建内容）。
  function flattenForMorph(hostEl: HTMLElement): void {
    // 1) 拆分页 sheet：把每张 sheet 里的块搬回顶层，再把跨页拆开的表格碎片拼回整表
    const sheets = hostEl.querySelectorAll(':scope > .page-sheet')
    if (sheets.length) {
      const frag = document.createDocumentFragment()
      sheets.forEach((s) => { while (s.firstChild) frag.appendChild(s.firstChild) })
      hostEl.replaceChildren(frag)
      mergeSplitTables(hostEl)
    }
    // 2) 拆图表卡片：把标题与图块搬回顶层（与 composeChartCards 互逆），丢弃 badge/title/body 外壳
    for (const card of Array.from(hostEl.querySelectorAll<HTMLElement>(':scope > .chart-card'))) {
      const heading = card.querySelector<HTMLElement>(
        '.chart-card-title > h1, .chart-card-title > h2, .chart-card-title > h3, .chart-card-title > h4, .chart-card-title > h5, .chart-card-title > h6',
      )
      const chart = card.querySelector<HTMLElement>('.chart-card-body > .chart-block')
      const frag = document.createDocumentFragment()
      if (heading) frag.appendChild(heading)
      if (chart) frag.appendChild(chart)
      card.replaceWith(frag)
    }
  }

  // 顶层块的 keyed 复用：以 finals 为目标顺序，复用签名相同的旧节点，仅对真正变动的块换新/移动。
  function morphTopLevel(hostEl: HTMLElement, html: string): void {
    // highlight() 会给当前光标块加 .src-active；先清掉，避免它污染 outerHTML 签名导致误判为「已变」
    hostEl.querySelectorAll('.src-active').forEach((n) => n.classList.remove('src-active'))

    const tpl = document.createElement('template')
    tpl.innerHTML = html
    const newNodes = Array.from(tpl.content.children) as HTMLElement[]

    // 旧节点按签名入池（同签名可能多份，用队列保证一一对应）
    const pool = new Map<string, HTMLElement[]>()
    for (const el of Array.from(hostEl.children) as HTMLElement[]) {
      const key = blockSignature(el)
      const arr = pool.get(key)
      if (arr) arr.push(el)
      else pool.set(key, [el])
    }

    // 目标节点列表：能复用就复用旧节点（保身份），否则用新模板节点；
    // 复用时把新行号补写回旧节点，保证点击→源码定位、光标高亮仍准确。
    const finals: HTMLElement[] = newNodes.map((nn) => {
      const reuse = pool.get(blockSignature(nn))?.shift()
      if (reuse) {
        syncSourceLines(reuse, nn)
        return reuse
      }
      return nn
    })

    // 1) 删除不再使用的旧节点（先 dispose 其中的图表实例避免泄漏）
    const finalSet = new Set(finals)
    for (const old of Array.from(hostEl.children)) {
      if (!finalSet.has(old as HTMLElement)) {
        disposeChartsIn(old)
        old.remove()
      }
    }
    // 2) 按 finals 顺序就位：已在正确位置的复用节点原地不动（cursor 前进），其余 insertBefore（移动/插入）
    let cursor = hostEl.firstChild
    for (const node of finals) {
      if (node === cursor) cursor = cursor.nextSibling
      else hostEl.insertBefore(node, cursor)
    }
  }

  // 源码里的空白行 1:1 反映到预览：Markdown 会把多个空行并成一个段落间距，
  // 这里在「紧邻某顶层块上方的连续空行」处补足占位行——一段 k 个空行里，第 1 个由块间默认外边距
  // 充当（≈1 行），其余 k-1 个各补一条 1 行高的空行块，于是 N 个空行≈N 行高、不再被合并。
  // 空行块带 data-source-line，既参与左右滚动定位，也让行号锚点更密、对齐更稳。
  function insertBlankLineSpacers(html: string, bodyLines: string[]): string {
    const tpl = document.createElement('template')
    tpl.innerHTML = html
    for (const block of Array.from(tpl.content.children) as HTMLElement[]) {
      const ds = block.getAttribute('data-source-line')
      if (ds == null) continue
      const b = Number(ds)
      if (!Number.isFinite(b)) continue
      let k = 0
      for (let i = b - 1; i >= 0 && /^\s*$/.test(bodyLines[i] ?? ''); i--) k++
      // 顶上的 k-1 个空行（line: b-k .. b-2）各补一条占位；最靠近块的那个空行交给默认外边距
      for (let line = b - k; line <= b - 2; line++) {
        const spacer = document.createElement('div')
        spacer.className = 'md-blank-line'
        spacer.setAttribute('data-source-line', String(line))
        // 放一个 <br> 让空行有「可落光标 / 可被选区穿过」的位置（否则空 div 既选不中也点不进去）
        spacer.appendChild(document.createElement('br'))
        block.parentNode?.insertBefore(spacer, block)
      }
    }
    return tpl.innerHTML
  }

  async function render() {
      const targetHost = host.value
      if (!targetHost) return
    // O5 修复：整页 innerHTML 替换会让滚动容器跳回顶部（打字时预览“自动滚动”）。
    // 真正的滚动容器是 .paper-scroll（host 的祖先，非 parentElement=.paper-zoom）。
    // 渲染前记下滚动位置，重建后恢复；置 scrollLock 抑制恢复引发的滚动回声。
    const sc = (targetHost.closest('.paper-scroll') as HTMLElement | null) ?? scroller()
    const prevTop = sc?.scrollTop ?? 0
    cleanup = null
    await setMermaidTheme(theme.tokens)
    // 先解析 asset:// 引用为 data: URL
    const resolved = await resolveAssetUrls(doc.markdown)
    const { html: rawHtml, lineOffset: off } = renderWithSource(resolved)
      if (host.value !== targetHost) return
    lineOffset = off
    // 源码空白行 1:1 占位（用去掉 frontmatter 后的正文行做空行判定，与 data-source-line 对齐）
    const html = insertBlankLineSpacers(rawHtml, resolved.split('\n').slice(off))
    // 抖动修复（核心）：不再 `innerHTML = html` 整页重建（会把所有顶层块的 DOM 全部销毁重造 → 肉眼可见闪烁）。
    // 改为顶层块「按签名复用」的 morph：未变的块保留原 DOM 节点（不重排、不重画），只有真正变动的块换新节点。
    // 先把上一帧的分页 sheet / 图表卡片拆回扁平顶层结构，使现有 DOM 与新 HTML 的顶层块一一对应。
    flattenForMorph(targetHost)
    morphTopLevel(targetHost, html)
    // morph 后图块若被复用则保留了已渲染 SVG/echarts；composeChartCards 再把标题 + 图块重新包成卡片。
    composeChartCards(targetHost)
    // morph 基本不动滚动容器内容（节点保留），但保险起见仍同步复位一次，抑制 paginate 前的瞬态。
    if (sc && prevTop > 0) sc.scrollTop = prevTop
    await nextTick()
      if (host.value !== targetHost) return
      const cleanupCharts = await mountCharts(targetHost, { tokens: theme.tokens })
    opts.onRendered?.()
    // onRendered 里会 paginate()（重排分页 DOM）+ nextTick(measure)，会再次冲掉滚动；
    // 故等下一帧布局完全落定后再恢复，置 scrollLock 抑制回声。
    if (sc && prevTop > 0) {
      requestAnimationFrame(() => {
        if (host.value !== targetHost) return
        scrollLock = Date.now() + 300
        sc.scrollTop = prevTop
      })
    }
      const cleanupTools = mountMermaidToolsInRoot(targetHost, (el) => {
        const line = Number(el.dataset.sourceLine) + lineOffset
        if (Number.isFinite(line)) sync.requestGoto(line)
      })
      cleanup = () => {
        cleanupTools()
        cleanupCharts()
      }
  }

  // 预览点击 → 编辑器跳转 / WikiLink 跳转
  function onClick(e: MouseEvent) {
    const target = e.target as HTMLElement

      // U4：任务列表复选框点击 → 切换源码勾选态 + 自动排序（未完成在前）。
      const checkbox = target.closest('.task-checkbox') as HTMLElement | null
      if (checkbox) {
        const li = checkbox.closest('[data-source-line]') as HTMLElement | null
        if (li) {
          e.preventDefault()
          const line = Number(li.dataset.sourceLine) + lineOffset
          doc.setMarkdown(toggleTaskAndSort(doc.markdown, line))
        }
        return
      }

      // 代码语言角标优先进入快捷编辑，不走通用代码块定位。
      const languageBadge = target.closest('.code-lang') as HTMLElement | null
      if (languageBadge) {
          const codeBlock = languageBadge.closest('[data-source-line]') as HTMLElement | null
          if (!codeBlock) return
          const line = Number(codeBlock.dataset.sourceLine) + lineOffset
          e.preventDefault()
          e.stopPropagation()
          opts.onSourceClick?.({line, el: codeBlock, event: e, target: languageBadge})
          return
      }

    // M3-2: WikiLink 点击 → 打开或创建文档
    const wikiLink = target.closest('.wikilink') as HTMLElement | null
    if (wikiLink?.dataset.page) {
      e.preventDefault()
      handleWikiLink(wikiLink.dataset.page)
      return
    }

    const el = target.closest?.('[data-source-line]') as HTMLElement | null
    if (!el) return
    // 关键修复：刚拖选出一段文本（非折叠选区，且锚点在预览内）时触发的 click → 不进入编辑、不放置光标，
    // 否则 activateWysiwygBlock 会把选区折叠掉，表现为"预览里选不中内容"。
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && host.value?.contains(sel.anchorNode)) return
    const line = Number(el.dataset.sourceLine) + lineOffset
      if (opts.onSourceClick?.({line, el, event: e, target})) return
    sync.requestGoto(line)
  }

  // M3-2: 处理 WikiLink 点击
  async function handleWikiLink(pageName: string) {
    // 查找现有文档
    const existing = doc.list.find(d => d.title === pageName)
    if (existing) {
      await doc.open(existing.id)
    } else {
      // 不存在 → 创建新文档
      await doc.newDoc()
      doc.renameDoc(pageName)
    }
  }
  // 预览滚动 → 编辑器滚动
  function onScroll() {
    const sc = scroller()
    if (!sc || Date.now() < scrollLock) return
    const top = sc.getBoundingClientRect().top
    let best = 0
    for (const { line, el } of lineEls()) {
      if (el.getBoundingClientRect().top - top <= 8) best = line
      else break
    }
    sync.requestScroll(best, 'preview')
  }

  function highlight(line: number, doScroll: boolean) {
    const els = lineEls()
    if (!els.length) return
    let target = els[0].el
    for (const { line: l, el } of els) {
      if (l <= line) target = el
      else break
    }
    host.value?.querySelectorAll('.src-active').forEach((n) => n.classList.remove('src-active'))
    target.classList.add('src-active')
    if (doScroll) {
      const sc = scroller()
      if (sc) {
        const r = target.getBoundingClientRect()
        const cr = sc.getBoundingClientRect()
        if (r.top < cr.top || r.bottom > cr.bottom) {
          scrollLock = Date.now() + 250
          target.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }
    }
  }

  onMounted(() => {
    render()
    host.value?.addEventListener('click', onClick)
      host.value?.addEventListener('keydown', onKeydown)
    scroller()?.addEventListener('scroll', onScroll, { passive: true })
  })
  // 打字时防抖渲染（整页 innerHTML + 图表重挂载有成本），主题切换则立即渲染
  let rt: number | undefined
  watch(
    () => doc.markdown,
    () => {
      window.clearTimeout(rt)
      rt = window.setTimeout(() => {
        if (opts.isRenderSuspended?.()) return
        render()
      }, 220)
    },
    { flush: 'post' },
  )
  // 主题切换（effectiveId）+ 明暗切换（dark）都要重渲染——图块配色由主题派生，
  // 配合 themeStamp，主题变更时旧图块会被判定为「需重渲染」而非复用。
  watch(() => [theme.effectiveId, theme.dark], render, { flush: 'post' })

  // 编辑器光标行 → 预览高亮（仅在不可见时滚动，避免打字时乱跳）
  watch(() => sync.cursorLine, (l) => highlight(l, false))
  // 编辑器跳转/滚动 → 预览滚动
  watch(() => sync.gotoNonce, () => highlight(sync.gotoLine, true))
  watch(() => sync.scrollNonce, () => {
    if (sync.scrollSource === 'editor') highlight(sync.scrollLine, true)
  })

  onBeforeUnmount(() => {
    host.value?.removeEventListener('click', onClick)
      host.value?.removeEventListener('keydown', onKeydown)
    scroller()?.removeEventListener('scroll', onScroll)
    cleanup?.()
  })

    function onKeydown(e: KeyboardEvent) {
        if (e.key !== 'Enter' && e.key !== ' ') return
        const target = e.target as HTMLElement
        if (!target.matches('.code-lang')) return
        e.preventDefault()
        target.click()
    }

  return { render }
}
