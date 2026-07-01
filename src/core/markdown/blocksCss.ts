// 借鉴 Gamma 的块级样式：扩展标注框 / 待办清单 / 折叠 / 时间线 / 步骤 / 脚注。
// 与 CODE_CSS / ALERT_CSS 同样在 main.ts 注入预览，并被 html.ts / docx.ts 内联到导出文件。

const CALLOUT_HUES: Record<string, string> = {
  note: 'var(--primary-color, #6366f1)',
  tip: '#22c55e',
  info: '#3b82f6',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#ef4444',
  caution: '#ef4444',
  important: '#8b5cf6',
  question: '#0ea5e9',
}

export const BLOCKS_CSS = `
/* 高亮 ==text== */
mark{background:color-mix(in srgb, #fde047 60%, transparent);color:inherit;padding:0 3px;border-radius:3px;}
/* 下划线 ++text++ / 上标 ^x^ / 下标 ~x~ */
ins{text-decoration:none;border-bottom:2px solid color-mix(in srgb,var(--primary-color) 55%,transparent);padding-bottom:1px;}
sub,sup{font-size:0.72em;line-height:0;}
hr{height:1px;margin:1.9em 0;border:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--primary-color) 36%,transparent) 18%,color-mix(in srgb,var(--primary-color) 72%,var(--border,#e3e3e8)) 50%,color-mix(in srgb,var(--primary-color) 36%,transparent) 82%,transparent);}

/* 内容目录 [toc] */
.toc{margin:16px 0;padding:14px 18px;border:1px solid var(--border,#e3e3e8);border-radius:10px;background:color-mix(in srgb,var(--panel-bg,#fafafa) 60%,transparent);}
.toc-title{font-weight:800;font-size:0.95em;margin-bottom:8px;color:var(--fg);}
.toc ul{margin:0;padding-left:1.1em;list-style:none;}
.toc>ul{padding-left:0;}
.toc li{margin:3px 0;line-height:1.5;}
.toc a{color:var(--primary-color);text-decoration:none;}
.toc a:hover{text-decoration:underline;}
.toc-empty{color:var(--muted);font-size:0.88em;margin:0;}

/* 扩展标注框 */
${Object.entries(CALLOUT_HUES)
  .map(
    ([k, c]) =>
      `.callout-${k}{background:color-mix(in srgb, ${c} 9%, transparent);border-left:4px solid ${c};}`,
  )
  .join('\n')}

/* 待办清单 */
.task-list{list-style:none;padding-left:2px;}
.task-list .task-item{position:relative;list-style:none;line-height:inherit;}
.task-checkbox{appearance:none;-webkit-appearance:none;position:relative;display:inline-block;box-sizing:border-box;width:14px;height:14px;margin:0 9px 0 0;vertical-align:text-bottom;border:1px solid color-mix(in srgb,var(--border,#e3e3e8) 72%,var(--primary-color,#6366f1));border-radius:3px;background:color-mix(in srgb,var(--panel-bg,#fff) 92%,var(--bg,#fff));cursor:pointer;transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease;}
.task-checkbox::after{content:'';position:absolute;left:4px;top:1px;width:4px;height:8px;border:1.8px solid #fff;border-left:0;border-top:0;opacity:0;transform:rotate(45deg) scale(.82);transform-origin:center;transition:opacity .12s ease,transform .12s ease;}
.task-checkbox:checked{border-color:color-mix(in srgb,var(--primary-color,#6366f1) 88%,var(--fg,#111));background-color:var(--primary-color,#6366f1);box-shadow:0 0 0 2px color-mix(in srgb,var(--primary-color,#6366f1) 14%,transparent);}
.task-checkbox:checked::after{opacity:1;transform:rotate(45deg) scale(1);}
.task-checkbox:hover{border-color:color-mix(in srgb,var(--primary-color,#6366f1) 76%,var(--border,#e3e3e8));}
.task-checkbox:focus-visible{outline:none;box-shadow:0 0 0 2px color-mix(in srgb,var(--primary-color,#6366f1) 20%,transparent);}
.task-item.done{color:var(--muted,#888);text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--muted,#888) 60%,transparent);}

/* 折叠列表 */
details.collapsible{margin:16px 0;padding:8px 14px;border:1px solid var(--border,#e3e3e8);border-radius:10px;background:color-mix(in srgb,var(--panel-bg,#fff) 60%,transparent);}
details.collapsible>summary{cursor:pointer;font-weight:700;color:var(--fg);list-style:none;}
details.collapsible>summary::-webkit-details-marker{display:none;}
details.collapsible>summary::before{content:'▸';display:inline-block;margin-right:8px;color:var(--primary-color);transition:transform .15s ease;}
details.collapsible[open]>summary::before{transform:rotate(90deg);}
details.collapsible>summary+*{margin-top:10px;}

/* 时间线 */
.timeline{position:relative;margin:16px 0;padding-left:22px;}
.timeline::before{content:'';position:absolute;left:5px;top:4px;bottom:4px;width:2px;background:color-mix(in srgb,var(--primary-color) 40%,var(--border));}
.timeline>ul,.timeline>ol{list-style:none;margin:0;padding:0;}
.timeline>ul>li,.timeline>ol>li{position:relative;margin:0 0 14px;padding-left:6px;}
.timeline>ul>li::before,.timeline>ol>li::before{content:'';position:absolute;left:-22px;top:7px;width:10px;height:10px;border-radius:50%;background:var(--primary-color);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary-color) 18%,transparent);}

/* 步骤 */
.steps{counter-reset:step;margin:16px 0;padding-left:0;}
.steps>ul,.steps>ol{list-style:none;margin:0;padding:0;}
.steps>ul>li,.steps>ol>li{position:relative;counter-increment:step;margin:0 0 12px;padding:2px 0 2px 40px;min-height:28px;}
.steps>ul>li::before,.steps>ol>li::before{content:counter(step);position:absolute;left:0;top:0;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:var(--primary-color);color:#fff;font-weight:800;font-size:0.82em;}

/* KPI 大数字统计卡网格（:::kpi 内写无序列表，每项首个 **加粗** 作大数字、其余作标签） */
.kpi-grid{margin:16px 0;}
.kpi-grid>ul,.kpi-grid>ol{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:14px;list-style:none;margin:0;padding:0;}
.kpi-grid>ul>li,.kpi-grid>ol>li{margin:0;padding:14px 16px;border:1px solid var(--border,#e3e3e8);border-radius:14px;background:var(--panel-bg,#fff);box-shadow:0 8px 24px rgba(20,30,50,.06);line-height:1.3;}
.kpi-grid li>strong:first-child{display:block;font-size:2.1em;font-weight:800;line-height:1.05;color:var(--primary-color);letter-spacing:-.02em;margin-bottom:2px;}
.kpi-grid li>em{font-style:normal;font-weight:700;color:#16a34a;}
.kpi-grid li>em.down{color:#ef4444;}

/* 图片网格画廊（:::gallery 内放多张 ![]() 图） */
.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:16px 0;}
.gallery p{margin:0;display:contents;}
.gallery>p:empty{display:none;}
.gallery figure{margin:0;}
.gallery img{width:100%;height:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;display:block;}
.gallery figcaption{font-size:.82em;color:var(--muted);margin-top:4px;text-align:left;}

/* 横向编号流程（:::process 内写无序列表，每项一步，箭头连接） */
.process{margin:16px 0;}
.process>ul,.process>ol{counter-reset:pstep;display:flex;flex-wrap:wrap;gap:10px;list-style:none;margin:0;padding:0;align-items:stretch;}
.process>ul>li,.process>ol>li{counter-increment:pstep;flex:1 1 0;min-width:96px;position:relative;padding:12px 14px 12px 14px;border:1px solid var(--border,#e3e3e8);border-radius:12px;background:var(--panel-bg,#fff);box-shadow:0 6px 18px rgba(20,30,50,.05);}
.process>ul>li::before,.process>ol>li::before{content:counter(pstep);display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--primary-color);color:#fff;font-weight:800;font-size:.74em;margin-bottom:6px;}
.process>ul>li:not(:last-child)::after,.process>ol>li:not(:last-child)::after{content:'';position:absolute;right:-9px;top:50%;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:8px solid color-mix(in srgb,var(--primary-color) 60%,var(--border));transform:translateY(-50%);z-index:1;}

/* 风险矩阵 2×2（:::matrix 内写 4 项无序列表 → 四象限，按位置着色：左上重→右下轻） */
.matrix>ul,.matrix>ol{display:grid;grid-template-columns:1fr 1fr;gap:10px;list-style:none;margin:16px 0;padding:0;}
.matrix>ul>li,.matrix>ol>li{margin:0;padding:12px 14px;border-radius:12px;border:1px solid var(--border,#e3e3e8);line-height:1.4;min-height:64px;}
.matrix>ul>li>strong:first-child,.matrix>ol>li>strong:first-child{display:block;margin-bottom:3px;}
.matrix>ul>li:nth-child(1){background:color-mix(in srgb,#ef4444 13%,transparent);border-color:color-mix(in srgb,#ef4444 32%,transparent);}
.matrix>ul>li:nth-child(2){background:color-mix(in srgb,#f59e0b 15%,transparent);border-color:color-mix(in srgb,#f59e0b 34%,transparent);}
.matrix>ul>li:nth-child(3){background:color-mix(in srgb,#f59e0b 15%,transparent);border-color:color-mix(in srgb,#f59e0b 34%,transparent);}
.matrix>ul>li:nth-child(4){background:color-mix(in srgb,#16a34a 13%,transparent);border-color:color-mix(in srgb,#16a34a 32%,transparent);}
/* 坐标轴标签（:::matrix 可能性 | 影响 → data-x/data-y） */
.matrix{position:relative;}
.matrix[data-y]{padding-left:20px;}
.matrix[data-x]{padding-bottom:18px;}
.matrix[data-y]::before{content:"↑ " attr(data-y);position:absolute;left:0;top:16px;bottom:16px;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;transform:rotate(180deg);font-size:.76em;font-weight:700;color:var(--muted);white-space:nowrap;}
.matrix[data-x]::after{content:attr(data-x) " →";position:absolute;left:20px;right:0;bottom:0;text-align:center;font-size:.76em;font-weight:700;color:var(--muted);white-space:nowrap;}

/* 横向路线图（:::roadmap 内写无序列表，每项一个阶段卡，顶部里程碑节点 + 连接轨） */
.roadmap{margin:16px 0;}
.roadmap>ul,.roadmap>ol{display:flex;flex-wrap:wrap;gap:12px;list-style:none;margin:0;padding:14px 0 0;}
.roadmap>ul>li,.roadmap>ol>li{flex:1 1 0;min-width:120px;position:relative;padding:14px 14px 12px;border:1px solid var(--border,#e3e3e8);border-radius:12px;background:var(--panel-bg,#fff);box-shadow:0 6px 18px rgba(20,30,50,.05);}
.roadmap>ul>li::before,.roadmap>ol>li::before{content:'';position:absolute;left:16px;top:-7px;width:12px;height:12px;border-radius:50%;background:var(--primary-color);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary-color) 18%,transparent);}
.roadmap>ul>li:not(:last-child)::after,.roadmap>ol>li:not(:last-child)::after{content:'';position:absolute;left:calc(16px + 12px);right:-12px;top:-1px;height:2px;background:color-mix(in srgb,var(--primary-color) 40%,var(--border));}
.roadmap>ul>li>strong:first-child,.roadmap>ol>li>strong:first-child{display:block;color:var(--primary-color);margin-bottom:4px;}

/* 面板卡标题头（:::panel 标题） */
.panel{padding:0!important;overflow:hidden;}
.panel>.panel-head{padding:9px 16px;font-weight:700;font-size:.92em;color:var(--fg);border-bottom:1px solid var(--border,#e3e3e8);background:color-mix(in srgb,var(--primary-color) 7%,transparent);}
.panel>.panel-head+*{margin-top:0;}
.panel>:not(.panel-head){padding-left:16px;padding-right:16px;}
.panel>:not(.panel-head):first-of-type{padding-top:14px;}
.panel>:not(.panel-head):last-child{padding-bottom:14px;}

/* 内置图标 :name:（跟随文字色，卡片标题里即主色） */
.md-icon{width:1.05em;height:1.05em;vertical-align:-0.16em;display:inline-block;flex:0 0 auto;}

/* 状态药丸 ((text)) / ((color:text)) */
.pill{display:inline-flex;align-items:center;gap:4px;padding:1px 9px;border-radius:999px;font-size:.82em;font-weight:700;line-height:1.6;white-space:nowrap;background:color-mix(in srgb,var(--muted,#888) 14%,transparent);color:color-mix(in srgb,var(--muted,#666) 70%,var(--fg,#222));}
.pill-green{background:color-mix(in srgb,#16a34a 14%,transparent);color:#15803d;}
.pill-red{background:color-mix(in srgb,#ef4444 14%,transparent);color:#dc2626;}
.pill-blue{background:color-mix(in srgb,#3b82f6 14%,transparent);color:#2563eb;}
.pill-amber{background:color-mix(in srgb,#f59e0b 18%,transparent);color:#b45309;}
.pill-gray{background:color-mix(in srgb,#94a3b8 18%,transparent);color:#475569;}
.pill-primary{background:color-mix(in srgb,var(--primary-color) 14%,transparent);color:color-mix(in srgb,var(--primary-color) 82%,var(--fg));}

/* 迷你进度条 ((bar:75)) / ((bar:75:标签)) */
.ui-bar{display:inline-flex;align-items:center;gap:8px;min-width:120px;vertical-align:middle;}
.ui-bar-label{font-size:.86em;color:var(--muted);white-space:nowrap;}
.ui-bar-track{flex:1 1 auto;min-width:48px;height:7px;border-radius:999px;background:color-mix(in srgb,var(--muted,#888) 20%,transparent);overflow:hidden;}
.ui-bar-fill{display:block;height:100%;border-radius:999px;background:var(--primary-color);}
.ui-bar-pct{font-size:.82em;font-weight:700;color:color-mix(in srgb,var(--primary-color) 80%,var(--fg));font-variant-numeric:tabular-nums;}

/* 迷你折线 ((spark:1,2,3)) */
.ui-spark{display:inline-block;width:72px;height:18px;vertical-align:middle;}
.ui-spark svg{display:block;width:100%;height:100%;overflow:visible;}
.ui-spark polyline{fill:none;stroke:var(--primary-color);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;}
.ui-spark .ui-spark-dot{fill:var(--primary-color);}

/* 脚注 */
.footnotes{margin-top:28px;padding-top:12px;border-top:1px solid var(--border,#e3e3e8);font-size:0.88em;color:var(--muted);}
.footnotes ol{padding-left:1.2em;}
.footnote-ref a{color:var(--primary-color);text-decoration:none;font-weight:700;}
.footnote-backref{text-decoration:none;}
`
