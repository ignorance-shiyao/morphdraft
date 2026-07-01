// 应用命令 / 快捷键的单一事实源。
//
// 背景（R0a-2）：HelpDialog 与 App.vue / 原生菜单各自手写快捷键表，曾出现
// 「Cmd+P 是命令面板还是文档切换」之类的反转漂移。这里集中声明命令元数据，
// HelpDialog 的快捷键区从本表生成；新增/改键只改这一处。
//
// 注意：本表只承载「元数据」（展示用文案、分组、快捷键），不承载 run 闭包——
// 命令的实际执行仍在各组件里（依赖 store / 组件上下文）。这样既消除展示漂移，
// 又不强行把所有运行逻辑挪进无上下文的纯模块。

export type CommandAvailability = 'always' | 'document' | 'slide'

export interface AppCommandDefinition {
  id: string
  /** 展示标题（也是 HelpDialog 里快捷键的说明文案） */
  title: string
  /** 分组：文件 / 编辑 / 视图 …（HelpDialog 按此分段） */
  group: string
  /** 模糊搜索关键词（命令面板用） */
  keywords?: string
  /** 展示用快捷键文案，如 'Cmd/Ctrl + N'。无则该命令不进帮助快捷键区。 */
  shortcut?: string
  /** 可用上下文：always=任意；document/slide=仅对应模式。默认为 always。 */
  available?: CommandAvailability
}

// 快捷键以「应用内实际行为」为准（App.vue 全局 keydown + CodeMirror + 原生菜单），
// 而非过去 HelpDialog 手写的反转值。
export const APP_COMMANDS: AppCommandDefinition[] = [
  // —— 文件 ——
  { id: 'doc.new', title: '新建文档', group: '文件', keywords: 'new create xinjian', shortcut: 'Cmd/Ctrl + N' },
  { id: 'doc.open-local', title: '打开本地文档', group: '文件', keywords: 'open local file import dakai', shortcut: 'Cmd/Ctrl + O' },
  { id: 'doc.snapshot', title: '保存快照', group: '文件', keywords: 'snapshot save version baocun', shortcut: 'Cmd/Ctrl + S' },
  { id: 'file.save-as', title: '另存为', group: '文件', keywords: 'save as lingcunwei', shortcut: 'Cmd/Ctrl + Shift + S' },

  // —— 编辑 ——（撤销/重做/全选为 CodeMirror/浏览器原生，仅登记以保证帮助一致）
  { id: 'edit.undo', title: '撤销', group: '编辑', keywords: 'undo chexiao', shortcut: 'Cmd/Ctrl + Z' },
  { id: 'edit.redo', title: '重做', group: '编辑', keywords: 'redo chongzuo', shortcut: 'Cmd/Ctrl + Shift + Z' },
  { id: 'edit.find', title: '查找', group: '编辑', keywords: 'find search chazhao', shortcut: 'Cmd/Ctrl + F' },
  { id: 'edit.replace', title: '替换', group: '编辑', keywords: 'replace tihuan', shortcut: 'Cmd/Ctrl + H' },
  { id: 'edit.select-all', title: '全选', group: '编辑', keywords: 'select all quanxuan', shortcut: 'Cmd/Ctrl + A' },

  // —— 视图 ——（与 App.vue onKeydown 一致：1 源码 / 2 页面 / 3 PPT）
  { id: 'view.source', title: '源码视图', group: '视图', keywords: 'source code yuanma', shortcut: 'Cmd/Ctrl + 1' },
  { id: 'view.page', title: '页面视图', group: '视图', keywords: 'page document yemian', shortcut: 'Cmd/Ctrl + 2' },
  { id: 'view.ppt', title: 'PPT 视图', group: '视图', keywords: 'slide ppt huandeng', shortcut: 'Cmd/Ctrl + 3' },
  { id: 'view.toggle-sidebar', title: '切换侧栏', group: '视图', keywords: 'sidebar toggle cebian', shortcut: 'Cmd/Ctrl + \\' },
  { id: 'palette.files', title: '文档切换', group: '视图', keywords: 'switch document files qiehuan', shortcut: 'Cmd/Ctrl + P' },
  { id: 'palette.commands', title: '命令面板', group: '视图', keywords: 'command palette mingling', shortcut: 'Cmd/Ctrl + Shift + P' },
  { id: 'help.shortcuts', title: '快捷键速查', group: '视图', keywords: 'help shortcuts bangzhu', shortcut: 'Cmd/Ctrl + /' },
]

// HelpDialog 快捷键区：按分组聚合带 shortcut 的命令，保持 APP_COMMANDS 中的声明顺序。
export function shortcutGroups(): { group: string; items: { id: string; shortcut: string; title: string }[] }[] {
  const order: string[] = []
  const map = new Map<string, { id: string; shortcut: string; title: string }[]>()
  for (const c of APP_COMMANDS) {
    if (!c.shortcut) continue
    if (!map.has(c.group)) {
      map.set(c.group, [])
      order.push(c.group)
    }
    map.get(c.group)!.push({ id: c.id, shortcut: c.shortcut, title: c.title })
  }
  return order.map((group) => ({ group, items: map.get(group)! }))
}
