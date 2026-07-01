use tauri::menu::{MenuBuilder, SubmenuBuilder, MenuItemBuilder};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      let handle = app.handle();

      let file_menu = SubmenuBuilder::new(handle, "文件")
        .item(&MenuItemBuilder::new("新建").id("file_new").accelerator("CmdOrCtrl+N").build(handle)?)
        .item(&MenuItemBuilder::new("打开本地文档…").id("file_open").accelerator("CmdOrCtrl+O").build(handle)?)
        .item(&MenuItemBuilder::new("导入 Word…").id("file_import_word").build(handle)?)
        .item(&MenuItemBuilder::new("导入 Notion…").id("file_import_notion").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::new("批量导出文档…").id("file_batch_export").build(handle)?)
        .item(&MenuItemBuilder::new("保存").id("file_save").accelerator("CmdOrCtrl+S").build(handle)?)
        .item(&MenuItemBuilder::new("另存为…").id("file_save_as").accelerator("CmdOrCtrl+Shift+S").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::new("导出 HTML…").id("export_html").build(handle)?)
        .item(&MenuItemBuilder::new("导出 PDF…").id("export_pdf").build(handle)?)
        .item(&MenuItemBuilder::new("导出 Word…").id("export_word").build(handle)?)
        .item(&MenuItemBuilder::new("导出 PPTX…").id("export_pptx").build(handle)?)
        .item(&MenuItemBuilder::new("导出矢量 PDF…").id("export_vector_pdf").build(handle)?)
        .item(&MenuItemBuilder::new("复制为公众号格式").id("export_wechat").build(handle)?)
        .item(&MenuItemBuilder::new("导出长图…").id("export_long_image").build(handle)?)
        .item(&MenuItemBuilder::new("复制为知乎格式").id("export_zhihu").build(handle)?)
        .separator()
        .quit()
        .build()?;

      let edit_menu = SubmenuBuilder::new(handle, "编辑")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .separator()
        .item(&MenuItemBuilder::new("查找").id("edit_find").accelerator("CmdOrCtrl+F").build(handle)?)
        .item(&MenuItemBuilder::new("替换").id("edit_replace").accelerator("CmdOrCtrl+H").build(handle)?)
        .build()?;

      let view_menu = SubmenuBuilder::new(handle, "视图")
        .item(&MenuItemBuilder::new("源码视图").id("view_source").accelerator("CmdOrCtrl+1").build(handle)?)
        .item(&MenuItemBuilder::new("页面视图").id("view_page").accelerator("CmdOrCtrl+2").build(handle)?)
        .item(&MenuItemBuilder::new("PPT 视图").id("view_ppt").accelerator("CmdOrCtrl+3").build(handle)?)
        .separator()
        .item(&MenuItemBuilder::new("对照视图").id("view_split").build(handle)?)
        .item(&MenuItemBuilder::new("切换侧栏").id("view_toggle_sidebar").accelerator("CmdOrCtrl+\\").build(handle)?)
        .build()?;

      let help_menu = SubmenuBuilder::new(handle, "帮助")
        .item(&MenuItemBuilder::new("快捷键速查").id("help_shortcuts").accelerator("CmdOrCtrl+/").build(handle)?)
        .build()?;

      let menu = MenuBuilder::new(handle)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&help_menu)
        .build()?;

      handle.set_menu(menu)?;
      Ok(())
    })
    .on_menu_event(|app, event| {
      let id = &event.id().0;
      if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit("menu-event", id.as_str());
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
