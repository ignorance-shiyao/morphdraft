import { ref } from 'vue'
import { translate } from '../i18n'

export interface PresenterPreview {
  currentHtml: string
  nextHtml: string
  currentTitle: string
  nextTitle: string
  notesHtml: string
  revealClass: string
  revealStyle: string
}

export interface PresenterState {
  currentSlide: number
  totalSlides: number
  elapsed: number
  preview: PresenterPreview
}

const EMPTY_PREVIEW: PresenterPreview = {
  currentHtml: '',
  nextHtml: '',
  currentTitle: '',
  nextTitle: '',
  notesHtml: '',
  revealClass: 'reveal',
  revealStyle: '',
}

export function usePresenter() {
  const isOpen = ref(false)
  const state = ref<PresenterState>({
    currentSlide: 0,
    totalSlides: 0,
    elapsed: 0,
    preview: EMPTY_PREVIEW,
  })

  let timer: number | null = null
  let presenterWindow: Window | null = null

  function open(totalSlides: number, currentSlide = 0, preview: Partial<PresenterPreview> = {}) {
    state.value = {
      currentSlide,
      totalSlides,
      elapsed: state.value.elapsed,
      preview: { ...EMPTY_PREVIEW, ...preview },
    }

    const w = 1280
    const h = 820
    const left = Math.max(0, (screen.width - w) / 2)
    const top = Math.max(0, (screen.height - h) / 2)
    presenterWindow = window.open(
      '',
      'mddoc-presenter',
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no`
    )

    if (presenterWindow) {
      writePresenterShell(presenterWindow)
      applyPresenterState(presenterWindow)
      isOpen.value = true
      startTimer()
    }
  }

  function close() {
    stopTimer()
    presenterWindow?.close()
    presenterWindow = null
    isOpen.value = false
  }

  function update(slide: number, total: number, preview: Partial<PresenterPreview> = {}) {
    state.value.currentSlide = slide
    state.value.totalSlides = total
    state.value.preview = { ...state.value.preview, ...preview }
    if (presenterWindow && !presenterWindow.closed) {
      applyPresenterState(presenterWindow)
    } else {
      presenterWindow = null
      isOpen.value = false
    }
  }

  function startTimer() {
    stopTimer()
    timer = window.setInterval(() => {
      state.value.elapsed++
      const timerEl = presenterWindow?.document.getElementById('timer')
      if (timerEl) timerEl.textContent = formatTime(state.value.elapsed)
    }, 1000)
  }

  function resetTimer() {
    state.value.elapsed = 0
    const timerEl = presenterWindow?.document.getElementById('timer')
    if (timerEl) timerEl.textContent = formatTime(0)
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  function collectAppStyles(): string {
    return Array.from(document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style,link[rel="stylesheet"]'))
      .map((el) => {
        if (el.tagName.toLowerCase() === 'style') return `<style>${(el as HTMLStyleElement).textContent ?? ''}</style>`
        const href = (el as HTMLLinkElement).href
        return href ? `<link rel="stylesheet" href="${escapeAttr(href)}">` : ''
      })
      .join('\n')
  }

  function writePresenterShell(win: Window) {
    const doc = win.document
    const label = (key: string, params?: Record<string, unknown>) => escapeHtml(translate(`presenterWindow.${key}`, params))
    doc.open()
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${label('title')}</title>
${collectAppStyles()}
<style>
  :root {
    color-scheme: dark;
    --presenter-bg: #080b12;
    --presenter-panel: rgba(17, 24, 39, .82);
    --presenter-panel-strong: rgba(24, 32, 48, .92);
    --presenter-border: rgba(148, 163, 184, .22);
    --presenter-fg: #eef2ff;
    --presenter-muted: #8b98ad;
    --presenter-accent: #5eead4;
    --presenter-warn: #fbbf24;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    height: 100vh;
    overflow: hidden;
    font-family: Inter, "PingFang SC", "Noto Sans SC", system-ui, sans-serif;
    color: var(--presenter-fg);
    background:
      radial-gradient(circle at 18% 12%, rgba(94, 234, 212, .16), transparent 34%),
      radial-gradient(circle at 84% 10%, rgba(99, 102, 241, .18), transparent 38%),
      linear-gradient(145deg, #070a11, #101523 58%, #070a11);
  }
  .presenter-shell { height: 100vh; display: grid; grid-template-rows: auto 1fr; gap: 14px; padding: 18px; }
  .topbar {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 12px 14px 12px 16px;
    border: 1px solid var(--presenter-border);
    border-radius: 16px;
    background: rgba(15, 23, 42, .72);
    box-shadow: 0 18px 50px rgba(0, 0, 0, .24);
    backdrop-filter: blur(18px);
  }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand-mark { width: 10px; height: 34px; border-radius: 99px; background: linear-gradient(180deg, var(--presenter-accent), #60a5fa); box-shadow: 0 0 22px rgba(94, 234, 212, .36); }
  .brand-title { font-size: 15px; font-weight: 760; letter-spacing: .02em; white-space: nowrap; }
  .brand-sub { margin-top: 2px; font-size: 12px; color: var(--presenter-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 48vw; }
  .timer-wrap { display: flex; align-items: center; gap: 18px; }
  .timer { font-size: 34px; font-weight: 780; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
  .counter { font-size: 12px; color: var(--presenter-muted); text-align: right; }
  .progress-track { width: 160px; height: 8px; border-radius: 99px; background: rgba(148, 163, 184, .18); overflow: hidden; }
  .progress-fill { height: 100%; width: 0%; border-radius: inherit; background: linear-gradient(90deg, var(--presenter-accent), #60a5fa); transition: width .18s ease; }
  .grid { min-height: 0; display: grid; grid-template-columns: minmax(0, 1.36fr) minmax(360px, .8fr); gap: 14px; }
  .left { min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) 158px; gap: 14px; }
  .right { min-height: 0; display: grid; grid-template-rows: 220px minmax(0, 1fr) auto; gap: 14px; }
  .panel {
    min-width: 0; min-height: 0;
    border: 1px solid var(--presenter-border);
    border-radius: 18px;
    background: var(--presenter-panel);
    box-shadow: 0 22px 58px rgba(0, 0, 0, .28);
    overflow: hidden;
    backdrop-filter: blur(18px);
  }
  .panel-head {
    height: 42px;
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 0 12px;
    border-bottom: 1px solid rgba(148, 163, 184, .16);
    background: rgba(255, 255, 255, .035);
  }
  .panel-title { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; font-weight: 760; color: #dbeafe; letter-spacing: .08em; text-transform: uppercase; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--presenter-accent); box-shadow: 0 0 14px currentColor; }
  .panel-meta { font-size: 12px; color: var(--presenter-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .slide-preview { height: calc(100% - 42px); padding: 12px; background: radial-gradient(circle at top, rgba(255,255,255,.08), transparent 55%); }
  .slide-box {
    width: 100%; height: 100%; overflow: hidden;
    border-radius: 14px;
    background: #0b1020;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.08), 0 16px 36px rgba(0,0,0,.32);
  }
  .slide-box .presenter-render,
  .slide-box .reveal,
  .slide-box .slides { width: 100%; height: 100%; }
  .slide-box .reveal { overflow: hidden; }
  .slide-box .slides {
    position: relative !important;
    inset: auto !important;
    transform: none !important;
    zoom: 1 !important;
  }
  .slide-box .slides > section {
    display: block !important;
    position: relative !important;
    inset: auto !important;
    width: 100% !important;
    height: 100% !important;
    opacity: 1 !important;
    visibility: visible !important;
    transform: none !important;
    pointer-events: none !important;
  }
  .slide-box .slide-surface { width: 100% !important; height: 100% !important; font-size: clamp(12px, 1.55vw, 22px); }
  .notes-panel { display: flex; flex-direction: column; }
  .notes-body {
    flex: 1 1 auto; min-height: 0;
    padding: 18px 20px 22px;
    overflow: auto;
    font-size: 20px;
    line-height: 1.72;
    color: #e5e7eb;
  }
  .notes-body strong { color: #fff; background: linear-gradient(transparent 58%, rgba(94,234,212,.28) 58%); }
  .notes-body p { margin: 0 0 14px; }
  .notes-empty { color: var(--presenter-muted); font-size: 15px; }
  .cue-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 12px; }
  .cue { border-radius: 14px; border: 1px solid rgba(148,163,184,.16); background: rgba(255,255,255,.04); padding: 12px; }
  .cue-label { font-size: 11px; color: var(--presenter-muted); margin-bottom: 6px; }
  .cue-value { font-size: 14px; font-weight: 720; color: #f8fafc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .controls { display: flex; gap: 10px; padding: 12px; }
  button {
    flex: 1 1 0;
    border: 1px solid rgba(148,163,184,.2);
    border-radius: 12px;
    padding: 10px 12px;
    color: #e5e7eb;
    background: rgba(255,255,255,.055);
    font: inherit;
    font-size: 13px;
    font-weight: 720;
    cursor: pointer;
  }
  button:hover { border-color: rgba(94,234,212,.55); background: rgba(94,234,212,.12); }
  .shortcut { padding: 0 12px 12px; color: var(--presenter-muted); font-size: 12px; line-height: 1.55; }
  @media (max-width: 980px) {
    body { overflow: auto; }
    .presenter-shell { height: auto; min-height: 100vh; }
    .grid, .left, .right { display: flex; flex-direction: column; }
    .panel.current-panel { height: 48vh; }
    .panel.next-panel { height: 28vh; }
    .notes-panel { min-height: 360px; }
  }
</style>
</head>
<body>
  <div class="presenter-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"></span>
        <div>
          <div class="brand-title">${label('title')}</div>
          <div class="brand-sub" id="deck-subtitle">${label('currentPage')}</div>
        </div>
      </div>
      <div class="timer-wrap">
        <div>
          <div class="counter" id="page-counter">${label('pageCounter', { current: 1, total: 1 })}</div>
          <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
        </div>
        <div class="timer" id="timer">${formatTime(state.value.elapsed)}</div>
      </div>
    </header>
    <main class="grid">
      <section class="left">
        <div class="panel current-panel">
          <div class="panel-head">
            <div class="panel-title"><span class="dot"></span>${label('current')}</div>
            <div class="panel-meta" id="current-title"></div>
          </div>
          <div class="slide-preview"><div class="slide-box" id="current-preview"></div></div>
        </div>
        <div class="panel">
          <div class="cue-strip">
            <div class="cue"><div class="cue-label">${label('current')}</div><div class="cue-value" id="cue-current"></div></div>
            <div class="cue"><div class="cue-label">${label('nextPage')}</div><div class="cue-value" id="cue-next"></div></div>
            <div class="cue"><div class="cue-label">${label('rhythm')}</div><div class="cue-value">${label('rhythmHint')}</div></div>
          </div>
        </div>
      </section>
      <section class="right">
        <div class="panel next-panel">
          <div class="panel-head">
            <div class="panel-title"><span class="dot"></span>${label('next')}</div>
            <div class="panel-meta" id="next-title"></div>
          </div>
          <div class="slide-preview"><div class="slide-box" id="next-preview"></div></div>
        </div>
        <div class="panel notes-panel">
          <div class="panel-head">
            <div class="panel-title"><span class="dot"></span>${label('speakerNotes')}</div>
            <div class="panel-meta">${label('notesMeta')}</div>
          </div>
          <div class="notes-body" id="notes"></div>
        </div>
        <div class="panel">
          <div class="controls">
            <button id="prev">${label('prevButton')}</button>
            <button id="next">${label('nextButton')}</button>
            <button id="reset">${label('resetTimer')}</button>
          </div>
          <div class="shortcut">${label('shortcut')}</div>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`)
    doc.close()
    bindPresenterWindow(win)
  }

  function bindPresenterWindow(win: Window) {
    const send = (type: string) => {
      try { window.postMessage({ type }, window.location.origin) } catch { /* ignore */ }
    }
    win.document.getElementById('prev')?.addEventListener('click', () => send('mddoc-presenter-prev'))
    win.document.getElementById('next')?.addEventListener('click', () => send('mddoc-presenter-next'))
    win.document.getElementById('reset')?.addEventListener('click', resetTimer)
    win.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') send('mddoc-presenter-prev')
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') send('mddoc-presenter-next')
      if (e.key.toLowerCase() === 'r') resetTimer()
      if (e.key === 'Escape') close()
    })
    win.addEventListener('beforeunload', () => {
      presenterWindow = null
      isOpen.value = false
      stopTimer()
    })
  }

  function applyPresenterState(win: Window) {
    const doc = win.document
    const s = state.value
    const p = s.preview
    setText(doc, 'deck-subtitle', p.currentTitle || translate('presenterWindow.pageN', { n: s.currentSlide + 1 }))
    setText(doc, 'page-counter', translate('presenterWindow.pageCounter', { current: s.currentSlide + 1, total: s.totalSlides }))
    setText(doc, 'current-title', p.currentTitle || translate('presenterWindow.currentPage'))
    setText(doc, 'next-title', p.nextTitle || translate('presenterWindow.nextPage'))
    setText(doc, 'cue-current', p.currentTitle || translate('presenterWindow.pageN', { n: s.currentSlide + 1 }))
    setText(doc, 'cue-next', p.nextTitle || translate('presenterWindow.end'))
    const progress = s.totalSlides > 1 ? (s.currentSlide / (s.totalSlides - 1)) * 100 : 100
    const fill = doc.getElementById('progress-fill')
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, progress))}%`
    const current = doc.getElementById('current-preview')
    const next = doc.getElementById('next-preview')
    if (current) current.innerHTML = renderPreview(p.currentHtml, p.revealClass, p.revealStyle)
    if (next) next.innerHTML = renderPreview(p.nextHtml, p.revealClass, p.revealStyle)
    const notes = doc.getElementById('notes')
    if (notes) notes.innerHTML = p.notesHtml || `<div class="notes-empty">${escapeHtml(translate('presenterWindow.emptyNotes'))}</div>`
  }

  function renderPreview(html: string, revealClass: string, revealStyle: string) {
    const safeClass = escapeAttr(revealClass || 'reveal')
    const safeStyle = escapeAttr(revealStyle || '')
    return `<div class="presenter-render ${safeClass}" style="${safeStyle}"><div class="slides">${html || ''}</div></div>`
  }

  function setText(doc: Document, id: string, text: string) {
    const el = doc.getElementById(id)
    if (el) el.textContent = text
  }

  function escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  }

  function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  return {
    isOpen,
    state,
    open,
    close,
    update,
  }
}
