// M6-3: 矢量 PDF（print CSS + window.print，文字可选可搜）
import { renderStatic } from './render-static'
import { CODE_CSS } from '../markdown/codeTheme'
import { ALERT_CSS } from '../markdown/alerts'
import { BLOCKS_CSS } from '../markdown/blocksCss'
import { KATEX_CSS, hasKatex } from '../markdown/katexCss'
import { PAPER_SIZES, MARGIN_PRESETS, LINE_HEIGHTS, paperPadding, type PaperSize, type PaperMargin, type LineHeightKey } from '../paper'
import type { ThemeTokens } from '../themes/presets'

export interface VectorPdfOpts {
  paperMargin?: PaperMargin
  lineHeight?: LineHeightKey
}

export async function exportVectorPdf(
  markdown: string,
  theme: ThemeTokens,
  paperSize: PaperSize = 'a4',
  opts: VectorPdfOpts = {},
) {
  const paper = PAPER_SIZES[paperSize]
  const pm = opts.paperMargin ?? 'normal'
  const padding = paperPadding(paperSize, pm)
  const lh = LINE_HEIGHTS[opts.lineHeight ?? 'normal']

  // 离屏渲染
  const r = await renderStatic(markdown, { dark: theme.dark, tokens: theme, width: paper.widthPx })
  const body = r.html
  r.dispose()

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>矢量 PDF</title>
<style>
@page {
  size: ${paper.widthMm}mm ${paper.heightMm}mm;
  margin: 0;
}
:root {
  --primary-color:${theme.primaryColor};
  --bg:${theme.bg}; --fg:${theme.fg}; --muted:${theme.muted};
  --border:${theme.border}; --code-bg:${theme.codeBg}; --panel-bg:${theme.panelBg};
  --font-family:${theme.fontFamily}; --heading-weight:${theme.headingWeight};
  --heading-family:${theme.headingFamily ?? theme.fontFamily};
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0; padding: 0;
  background: var(--bg); color: var(--fg);
  font-family: var(--font-family);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.page {
  width: ${paper.widthMm}mm;
  min-height: ${paper.heightMm}mm;
  padding: ${padding};
  page-break-after: always;
  overflow: hidden;
  line-height: ${lh.value};
}
.page:last-child { page-break-after: auto; }
.doc-preview h1, .doc-preview h2, .doc-preview h3 {
  font-weight: var(--heading-weight);
  font-family: var(--heading-family);
}
.doc-preview h1 {
  border-bottom: 1px solid color-mix(in srgb, var(--primary-color) 44%, var(--border));
  padding-bottom: 10px;
}
.doc-preview a { color: var(--primary-color); }
.doc-preview code {
  background: var(--code-bg); padding: 2px 5px; border-radius: 4px;
}
.doc-preview pre {
  background: var(--code-bg); padding: 14px; border-radius: 8px; overflow: auto;
}
.doc-preview pre code { background: none; padding: 0; }
.doc-preview blockquote {
  margin: 0; padding-left: 14px;
  border-left: 4px solid var(--border); color: var(--muted);
}
.doc-preview table { border-collapse: collapse; width: 100%; }
.doc-preview th, .doc-preview td { border: 1px solid var(--border); padding: 6px 10px; }
.doc-preview th {
  background: color-mix(in srgb, var(--primary-color) 8%, var(--code-bg));
  font-weight: 700;
}
.doc-preview tbody tr:nth-child(even) {
  background: color-mix(in srgb, var(--primary-color) 4%, transparent);
}
.doc-preview img { max-width: 100%; }
.doc-preview figure { margin: 16px 0; text-align: center; }
.doc-preview figure img { display: inline-block; }
.doc-preview figcaption {
  margin-top: 8px; font-size: 0.88em; color: var(--muted); line-height: 1.5;
}
.doc-preview mark {
  background: color-mix(in srgb, var(--primary-color) 22%, transparent);
  color: inherit; padding: 1px 4px; border-radius: 3px;
}
.doc-preview ins {
  text-decoration: none;
  border-bottom: 2px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
}
.doc-preview sub, .doc-preview sup { font-size: 0.72em; line-height: 0; }
.doc-preview kbd {
  display: inline-block; padding: 1px 6px; font-size: 0.82em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--panel-bg); border: 1px solid var(--border);
  border-bottom-width: 2px; border-radius: 4px;
}
.chart-block { margin: 16px 0; }
.chart-block svg { max-width: 100%; height: auto; }
.callout { margin: 16px 0; padding: 12px 16px; border-radius: 8px; }
.callout-note {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  border-left: 4px solid var(--primary-color);
}
.math-block { text-align: center; overflow-x: auto; }
.toc { margin: 16px 0; padding: 14px 18px; border: 1px solid var(--border); border-radius: 10px; }
.wikilink { color: var(--primary-color); text-decoration: none; border-bottom: 1px dashed var(--primary-color); }
${CODE_CSS}
${ALERT_CSS}
${BLOCKS_CSS}
${hasKatex(body) ? KATEX_CSS : ''}
/* 打印时隐藏空白页 */
@page { margin: 0; }
</style>
</head>
<body>
<div class="page"><div class="doc-preview">
${body}
</div></div>
<script>
  // 渲染完成后自动打印
  window.onload = function() {
    setTimeout(function() { window.print(); }, 300);
  };
</script>
</body>
</html>`

  // 在新窗口中打开并触发打印
  const w = window.open('', '_blank')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}
