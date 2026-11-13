// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Keep all saved state (WebView2's local storage backing store) in a "data" folder next to the
// executable, so the whole installation stays self-contained (e.g. D:\C\program\fx580vnx\data).
// This must run before `app_lib::run()` creates the webview environment.
fn redirect_webview_data_dir() {
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      let data = dir.join("data");
      if std::fs::create_dir_all(&data).is_ok() {
        // SAFETY: called at the very start of `main`, before Tauri spawns any other thread.
        unsafe { std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", data) };
      }
    }
  }
}

fn main() {
  redirect_webview_data_dir();
  app_lib::run();
}
