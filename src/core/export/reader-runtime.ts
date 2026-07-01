// M5-1: 交互式 HTML 阅读器运行时（注入导出 HTML 的 vanilla JS）
// 目标：TOC 树 + 滚动 spy + 折叠 + 暗色切换，<20KB

export const READER_RUNTIME = `
(function(){
'use strict';

// ── TOC 生成 ──
function buildTOC() {
  const headings = document.querySelectorAll('.doc-preview h1, .doc-preview h2, .doc-preview h3');
  if (!headings.length) return null;

  const toc = document.createElement('nav');
  toc.className = 'reader-toc';
  toc.innerHTML = '<div class="toc-title">目录</div>';

  const list = document.createElement('ul');
  let currentH1 = null, currentH2 = null;
  let ulH1 = list, ulH2 = null;

  headings.forEach((h, i) => {
    if (!h.id) h.id = 'section-' + i;
    const level = parseInt(h.tagName[1]);
    const li = document.createElement('li');
    li.className = 'toc-item toc-h' + level;
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    a.className = 'toc-link';
    li.appendChild(a);

    if (level === 1) {
      ulH1.appendChild(li);
      currentH1 = li;
      ulH2 = null;
    } else if (level === 2) {
      if (!currentH1) { ulH1.appendChild(li); return; }
      if (!ulH2) {
        ulH2 = document.createElement('ul');
        ulH2.className = 'toc-sub';
        currentH1.appendChild(ulH2);
      }
      ulH2.appendChild(li);
      currentH2 = li;
    } else {
      if (!currentH2 && currentH1) { currentH1.appendChild(li); return; }
      if (currentH2) {
        let ulH3 = currentH2.querySelector(':scope > .toc-sub');
        if (!ulH3) {
          ulH3 = document.createElement('ul');
          ulH3.className = 'toc-sub';
          currentH2.appendChild(ulH3);
        }
        ulH3.appendChild(li);
      }
    }
  });

  toc.appendChild(list);
  return toc;
}

// ── 滚动 spy ──
function initSpy() {
  const links = document.querySelectorAll('.toc-link');
  if (!links.length) return;
  const sections = Array.from(links).map(a => {
    const id = a.getAttribute('href')?.slice(1);
    return { el: document.getElementById(id!), link: a };
  }).filter(s => s.el);

  function update() {
    let current = sections[0];
    for (const s of sections) {
      if (s.el.getBoundingClientRect().top <= 120) current = s;
    }
    links.forEach(l => l.classList.remove('active'));
    if (current) current.link.classList.add('active');
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ── 暗色切换 ──
function initThemeToggle() {
  const btn = document.createElement('button');
  btn.className = 'reader-theme-btn';
  btn.innerHTML = '&#9790;';
  btn.title = '切换暗色/亮色';
  let dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  function apply() {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    btn.innerHTML = dark ? '&#9728;' : '&#9790;';
  }
  btn.onclick = () => { dark = !dark; apply(); };
  apply();
  document.body.appendChild(btn);
}

// ── 折叠 TOC ──
function initCollapse() {
  const toc = document.querySelector('.reader-toc');
  if (!toc) return;
  const title = toc.querySelector('.toc-title');
  if (title) {
    title.style.cursor = 'pointer';
    title.onclick = () => toc.classList.toggle('collapsed');
  }
}

// ── 移动端 TOC toggle ──
function initMobileTOC() {
  const toc = document.querySelector('.reader-toc');
  if (!toc) return;

  // overlay
  const overlay = document.createElement('div');
  overlay.className = 'reader-toc-overlay';
  document.body.appendChild(overlay);

  // toggle button
  const toggle = document.createElement('button');
  toggle.className = 'reader-toc-toggle';
  toggle.innerHTML = '&#9776;';
  toggle.title = '目录';
  document.body.appendChild(toggle);

  function open() { toc.classList.remove('collapsed'); overlay.classList.add('open'); }
  function close() { toc.classList.add('collapsed'); overlay.classList.remove('open'); }

  toggle.onclick = () => toc.classList.contains('collapsed') ? open() : close();
  overlay.onclick = close;

  // 点击 TOC 链接后自动关闭（移动端）
  toc.querySelectorAll('.toc-link').forEach(a => {
    a.addEventListener('click', () => { if (window.innerWidth < 768) close(); });
  });
}

// ── 图片/表格自动编号 + 索引面板 ──
function initIndex() {
  const preview = document.querySelector('.doc-preview');
  if (!preview) return;

  const figures: { el: HTMLElement; num: number; caption: string }[] = [];
  const tables: { el: HTMLElement; num: number; caption: string }[] = [];

  // 给 figure 编号
  preview.querySelectorAll('figure').forEach((fig, i) => {
    const img = fig.querySelector('img');
    const cap = fig.querySelector('figcaption');
    const num = i + 1;
    if (img) img.setAttribute('alt', '图 ' + num);
    if (cap && !cap.textContent?.match(/^图\s*\d/)) cap.textContent = '图 ' + num + '. ' + cap.textContent;
    fig.id = 'figure-' + num;
    figures.push({ el: fig, num, caption: cap?.textContent || '图 ' + num });
  });

  // 给 table 编号
  preview.querySelectorAll('table').forEach((tbl, i) => {
    const num = i + 1;
    const caption = '表 ' + num;
    // 在表格前插入编号
    const label = document.createElement('div');
    label.style.cssText = 'font-size:13px;font-weight:700;color:var(--muted);margin-bottom:4px;';
    label.textContent = caption;
    tbl.id = 'table-' + num;
    tbl.parentElement?.insertBefore(label, tbl);
    tables.push({ el: tbl, num, caption });
  });

  if (!figures.length && !tables.length) return;

  // 构建索引面板
  const panel = document.createElement('div');
  panel.className = 'reader-index';
  panel.innerHTML = '<div class="toc-title">索引</div>';

  if (figures.length) {
    const sec = document.createElement('div');
    sec.innerHTML = '<div style="font-weight:700;font-size:13px;color:var(--muted);margin:8px 0 4px;">插图</div>';
    figures.forEach(f => {
      const a = document.createElement('a');
      a.href = '#figure-' + f.num;
      a.className = 'toc-link';
      a.textContent = f.caption;
      sec.appendChild(a);
    });
    panel.appendChild(sec);
  }

  if (tables.length) {
    const sec = document.createElement('div');
    sec.innerHTML = '<div style="font-weight:700;font-size:13px;color:var(--muted);margin:8px 0 4px;">表格</div>';
    tables.forEach(t => {
      const a = document.createElement('a');
      a.href = '#table-' + t.num;
      a.className = 'toc-link';
      a.textContent = t.caption;
      sec.appendChild(a);
    });
    panel.appendChild(sec);
  }

  // 插入到 TOC 下方
  const toc = document.querySelector('.reader-toc');
  if (toc) toc.appendChild(panel);
}

// ── 图片 lightbox ──
function initLightbox() {
  const overlay = document.createElement('div');
  overlay.className = 'reader-lightbox';
  overlay.innerHTML = '<img />';
  overlay.onclick = () => overlay.classList.remove('open');
  document.body.appendChild(overlay);

  document.querySelectorAll('.doc-preview img').forEach(img => {
    img.style.cursor = 'zoom-in';
    img.onclick = () => {
      overlay.querySelector('img')!.src = img.src;
      overlay.classList.add('open');
    };
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.classList.remove('open');
  });
}

// ── 代码块复制按钮 ──
function initCopyButtons() {
  document.querySelectorAll('.doc-preview pre').forEach(pre => {
    const btn = document.createElement('button');
    btn.className = 'reader-copy-btn';
    btn.textContent = '复制';
    btn.onclick = () => {
      const code = pre.querySelector('code');
      navigator.clipboard.writeText(code?.textContent || pre.textContent || '');
      btn.textContent = '已复制!';
      setTimeout(() => btn.textContent = '复制', 1500);
    };
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

// ── 聚光灯（鼠标周围高亮圆环，遮罩暗化其余区域） ──
function initSpotlight() {
  const overlay = document.createElement('div');
  overlay.className = 'reader-spotlight';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:90;pointer-events:none;';
  document.body.appendChild(overlay);

  let active = false;
  function update(e: MouseEvent) {
    if (!active) return;
    overlay.style.background = 'radial-gradient(circle 120px at ' + e.clientX + 'px ' + e.clientY + 'px, transparent 60%, rgba(0,0,0,0.5) 100%)';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'o' && !e.metaKey && !e.ctrlKey && (e.target as HTMLElement)?.tagName !== 'INPUT') {
      active = !active;
      overlay.style.display = active ? 'block' : 'none';
      if (active) document.addEventListener('mousemove', update);
      else document.removeEventListener('mousemove', update);
    }
  });
}

// ── 激光笔（红色圆点跟随鼠标） ──
function initLaser() {
  const dot = document.createElement('div');
  dot.className = 'reader-laser';
  dot.style.cssText = 'display:none;position:fixed;width:12px;height:12px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444;pointer-events:none;z-index:91;transform:translate(-50%,-50%);';
  document.body.appendChild(dot);

  let active = false;
  function update(e: MouseEvent) {
    if (!active) return;
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'l' && !e.metaKey && !e.ctrlKey && (e.target as HTMLElement)?.tagName !== 'INPUT') {
      active = !active;
      dot.style.display = active ? 'block' : 'none';
      if (active) document.addEventListener('mousemove', update);
      else document.removeEventListener('mousemove', update);
    }
  });
}

// ── 阅读进度条 ──
function initProgress() {
  const bar = document.createElement('div');
  bar.className = 'reader-progress';
  document.body.appendChild(bar);
  function update() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = h > 0 ? (window.scrollY / h * 100) + '%' : '0';
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ── 标题自动编号 ──
function initNumbering() {
  const preview = document.querySelector('.doc-preview');
  if (preview) preview.classList.add('numbered');
}

// ── 脚注悬浮预览 ──
function initFootnotes() {
  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'display:none;position:fixed;max-width:320px;padding:10px 14px;background:#fff;border:1px solid #ddd;border-radius:8px;font-size:13px;line-height:1.6;color:#333;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:200;pointer-events:none;';
  document.body.appendChild(tooltip);

  // 收集脚注内容
  const fnItems = document.querySelectorAll('section.footnotes li, .footnotes li');
  const fnMap = new Map<string, string>();
  fnItems.forEach(li => {
    const id = li.id || '';
    if (id) fnMap.set(id, (li as HTMLElement).innerText || '');
  });

  // 监听脚注引用链接
  document.querySelectorAll('a[href*="#fn"], a[href*="#user-content-fn"], .footnote-ref a').forEach(link => {
    link.addEventListener('mouseenter', () => {
      const href = (link as HTMLAnchorElement).getAttribute('href') || '';
      const fnId = href.replace(/^#/, '');
      const content = fnMap.get(fnId) || document.getElementById(fnId)?.innerText || '';
      if (!content) return;
      tooltip.textContent = content;
      tooltip.style.display = 'block';
      const rect = link.getBoundingClientRect();
      tooltip.style.left = Math.min(rect.left, window.innerWidth - 340) + 'px';
      tooltip.style.top = (rect.bottom + 8) + 'px';
    });
    link.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });
}

// ── 初始化 ──
function init() {
  const toc = buildTOC();
  if (toc) {
    document.body.classList.add('has-toc');
    document.body.insertBefore(toc, document.body.firstChild);
  }
  initSpy();
  initThemeToggle();
  initCollapse();
  initMobileTOC();
  initLightbox();
  initCopyButtons();
  initProgress();
  initNumbering();
  initIndex();
  initSpotlight();
  initLaser();
  initFootnotes();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
`;
