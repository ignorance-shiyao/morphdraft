import { renderStatic } from './render-static'
import { captureSlides } from './slide-capture'
import { saveFile } from './save'
import { CODE_CSS } from '../markdown/codeTheme'
import { ALERT_CSS } from '../markdown/alerts'
import { BLOCKS_CSS } from '../markdown/blocksCss'
import { KATEX_CSS, hasKatex } from '../markdown/katexCss'
import { READER_RUNTIME } from './reader-runtime'
import { PAPER_SIZES, type PaperSize } from '../paper'
import type { SlideDims } from './slide-capture'
import type { ThemeTokens } from '../themes/presets'

const HTML_MIME = 'text/html;charset=utf-8'

export interface ExportDocOpts { padding?: string; lineHeight?: number; dims?: SlideDims; darkTheme?: ThemeTokens }

// 导出自包含单文件 HTML：固化图表 + 内联主题 CSS（亮/暗双主题）。
export async function exportHtml(
  markdown: string,
  theme: ThemeTokens,
  mode: 'document' | 'slide' = 'document',
  paperSize: PaperSize = 'a4',
  opts: ExportDocOpts = {},
  filename = mode === 'slide' ? 'slides.html' : 'document.html',
) {
  if (mode === 'slide') {
    await exportSlideHtml(markdown, theme, opts.dims, filename)
    return
  }

  const r = await renderStatic(markdown, { dark: theme.dark, tokens: theme })
  const body = r.html
  r.dispose()
  const paper = PAPER_SIZES[paperSize]
  const padding = opts.padding ?? (paperSize === 'a6' ? '10mm 9mm' : '18mm 20mm')
  const lineHeight = opts.lineHeight ?? 1.72

  const doc = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>导出文档</title>
<style>
:root{
  --primary-color:${theme.primaryColor};
  --bg:${theme.bg}; --fg:${theme.fg}; --muted:${theme.muted};
  --border:${theme.border}; --code-bg:${theme.codeBg}; --panel-bg:${theme.panelBg};
  --font-family:${theme.fontFamily}; --heading-weight:${theme.headingWeight};
  --heading-family:${theme.headingFamily ?? theme.fontFamily};
}
${opts.darkTheme ? `[data-theme="dark"]{
  --primary-color:${opts.darkTheme.primaryColor};
  --bg:${opts.darkTheme.bg}; --fg:${opts.darkTheme.fg}; --muted:${opts.darkTheme.muted};
  --border:${opts.darkTheme.border}; --code-bg:${opts.darkTheme.codeBg}; --panel-bg:${opts.darkTheme.panelBg};
}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--primary-color:${opts.darkTheme.primaryColor};--bg:${opts.darkTheme.bg};--fg:${opts.darkTheme.fg};--muted:${opts.darkTheme.muted};--border:${opts.darkTheme.border};--code-bg:${opts.darkTheme.codeBg};--panel-bg:${opts.darkTheme.panelBg};}}` : ''}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-family);}
.page{width:${paper.widthMm}mm;min-height:${paper.heightMm}mm;margin:0 auto;background:var(--bg);}
.doc-preview{max-width:none;margin:0;padding:${padding};line-height:${lineHeight};}
.doc-preview h1,.doc-preview h2,.doc-preview h3{font-weight:var(--heading-weight);font-family:var(--heading-family);}
.doc-preview h1{border-bottom:1px solid color-mix(in srgb,var(--primary-color) 44%,var(--border));padding-bottom:10px;}
.doc-preview a{color:var(--primary-color);}
.doc-preview code{background:var(--code-bg);padding:2px 5px;border-radius:4px;}
.doc-preview pre{background:var(--code-bg);padding:14px;border-radius:8px;overflow:auto;}
.doc-preview pre code{background:none;padding:0;}
.doc-preview pre{position:relative;}
.doc-preview .code-lang{position:absolute;top:6px;right:10px;font-size:11px;color:var(--muted);opacity:.7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
.doc-preview pre code span.hl{background:color-mix(in srgb,var(--primary-color) 12%,transparent);display:block;margin:0 -16px;padding:0 16px;border-left:3px solid var(--primary-color);}
.doc-preview blockquote{margin:0;padding-left:14px;border-left:4px solid var(--border);color:var(--muted);}
.doc-preview table{border-collapse:collapse;width:100%;}
.doc-preview th,.doc-preview td{border:1px solid var(--border);padding:6px 10px;}
.doc-preview th{background:color-mix(in srgb,var(--primary-color) 8%,var(--code-bg));font-weight:700;}
.doc-preview tbody tr:nth-child(even){background:color-mix(in srgb,var(--primary-color) 4%,transparent);}
.doc-preview img{max-width:100%;}
.doc-preview figure{margin:16px 0;text-align:center;}
.doc-preview figure img{display:inline-block;}
.doc-preview figcaption{margin-top:8px;font-size:0.88em;color:var(--muted);line-height:1.5;}
.chart-block{margin:16px 0;}
.chart-block svg{max-width:100%;height:auto;}
.callout{margin:16px 0;padding:12px 16px;border-radius:8px;}
.callout-note{background:color-mix(in srgb,var(--primary-color) 8%,transparent);border-left:4px solid var(--primary-color);}
.callout-card{background:var(--panel-bg);border:1px solid var(--border);}
${CODE_CSS}
${ALERT_CSS}
${BLOCKS_CSS}
.math-block{text-align:center;overflow-x:auto;}
${hasKatex(body) ? KATEX_CSS : ''}
@media screen{body{background:#f4f3fb;padding:24px 0;}.page{box-shadow:0 18px 60px rgba(0,0,0,0.12);}}
@media print{@page{size:${paper.widthMm}mm ${paper.heightMm}mm;margin:0;}body{background:var(--bg);}.page{box-shadow:none;}}
/* M5 阅读器运行时样式 */
body.has-toc{display:flex;min-height:100vh;}
.reader-toc{position:sticky;top:0;left:0;width:260px;max-height:100vh;overflow-y:auto;padding:20px 16px;background:var(--panel-bg);border-right:1px solid var(--border);font-size:14px;flex-shrink:0;transition:width .2s;}
.reader-toc.collapsed{width:0;padding:0;overflow:hidden;}
.toc-title{font-weight:700;font-size:15px;margin-bottom:12px;color:var(--fg);}
.reader-toc ul{list-style:none;padding:0;margin:0;}
.toc-item{margin:2px 0;}
.toc-link{display:block;padding:4px 8px;color:var(--muted);text-decoration:none;border-radius:4px;transition:background .15s;}
.toc-link:hover,.toc-link.active{background:color-mix(in srgb,var(--primary-color) 12%,transparent);color:var(--primary-color);}
.toc-h2{padding-left:16px;}.toc-h3{padding-left:32px;}
.toc-sub{display:none;}.toc-item:hover>.toc-sub,.toc-item:has(.toc-link.active)>.toc-sub{display:block;}
.reader-theme-btn{position:fixed;bottom:20px;right:20px;width:44px;height:44px;border-radius:50%;border:1px solid var(--border);background:var(--panel-bg);font-size:20px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);z-index:100;}
.reader-copy-btn{position:absolute;top:8px;right:8px;padding:3px 10px;font-size:12px;border:1px solid var(--border);border-radius:4px;background:var(--panel-bg);color:var(--muted);cursor:pointer;opacity:0;transition:opacity .15s;}
pre:hover .reader-copy-btn{opacity:1;}
.reader-lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;justify-content:center;align-items:center;cursor:zoom-out;}
.reader-lightbox.open{display:flex;}
.reader-lightbox img{max-width:90vw;max-height:90vh;border-radius:8px;}
/* M5-3 响应式三档 */
@media(max-width:1100px){.reader-toc{width:200px;font-size:13px;}.toc-h2{padding-left:12px;}.toc-h3{padding-left:24px;}}
@media(max-width:768px){
  body.has-toc{display:block;}
  .reader-toc{position:fixed;top:0;left:0;width:280px;height:100vh;max-height:100vh;z-index:50;transform:translateX(-100%);transition:transform .25s ease;box-shadow:4px 0 20px rgba(0,0,0,.2);}
  .reader-toc:not(.collapsed){transform:translateX(0);}
  .reader-toc-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:49;}
  .reader-toc-overlay.open{display:block;}
  .reader-toc-toggle{display:flex!important;}
}
.reader-toc-toggle{display:none;position:fixed;top:12px;left:12px;width:36px;height:36px;border-radius:8px;border:1px solid var(--border);background:var(--panel-bg);font-size:18px;cursor:pointer;z-index:51;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.1);}
/* M5-9 阅读进度条 */
.reader-progress{position:fixed;top:0;left:0;height:3px;background:var(--primary-color);z-index:1000;transition:width .1s;width:0;}
/* M5-9 标题自动编号 */
.doc-preview.numbered h1{counter-increment:h1;}.doc-preview.numbered h1::before{content:counter(h1) ". ";font-variant-numeric:tabular-nums;}
.doc-preview.numbered h2{counter-increment:h2;}.doc-preview.numbered h2::before{content:counter(h1) "." counter(h2) " ";font-variant-numeric:tabular-nums;}
.doc-preview.numbered h3{counter-increment:h3;}.doc-preview.numbered h3::before{content:counter(h1) "." counter(h2) "." counter(h3) " ";font-variant-numeric:tabular-nums;}
.doc-preview.numbered{counter-reset:h1 h2 h3;}
</style>
</head>
<body>
<main class="page"><div class="doc-preview">
${body}
</div></main>
<script>${READER_RUNTIME}</script>
</body>
</html>`

  await saveFile(filename, new Blob([doc], { type: HTML_MIME }), HTML_MIME)
}

async function exportSlideHtml(markdown: string, theme: ThemeTokens, dims: SlideDims = { w: 1280, h: 720 }, filename = 'slides.html') {
  const slides = await captureSlides(markdown, theme, dims)
  const ar = `${dims.w}/${dims.h}`
  const pages = slides
    .map((s, i) => `<section class="page"><img src="${s.png}" alt="Slide ${i + 1}" /></section>`)
    .join('')
  const doc = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>导出幻灯片</title>
<style>
  html,body{margin:0;padding:0;background:#f4f3fb;font-family:${theme.fontFamily};}
  .page{width:min(100vw,1600px);aspect-ratio:${ar};margin:24px auto;background:${theme.bg};box-shadow:0 18px 60px rgba(0,0,0,0.14);}
  .page img{width:100%;height:100%;display:block;object-fit:contain;}
  @media print{@page{size:landscape;margin:0;}html,body{background:#fff;}.page{width:100vw;height:100vh;margin:0;box-shadow:none;break-after:page;page-break-after:always;}}
</style>
</head>
<body>${pages}</body>
</html>`
  await saveFile(filename, new Blob([doc], { type: HTML_MIME }), HTML_MIME)
}
