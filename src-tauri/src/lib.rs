use tauri::{Emitter, Manager};

#[tauri::command]
async fn open_oauth_window(app: tauri::AppHandle, url: String) -> Result<(), String> {
  let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

  if let Some(existing) = app.get_webview_window("google-oauth-window") {
    let _ = existing.close();
  }

  let builder = tauri::WebviewWindowBuilder::new(
    &app,
    "google-oauth-window",
    tauri::WebviewUrl::External(parsed_url),
  )
  .title("ARIS — Sign in with Google")
  .inner_size(520.0, 680.0)
  .center()
  .resizable(false)
  .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0");

  builder.build().map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
async fn close_oauth_window(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(existing) = app.get_webview_window("google-oauth-window") {
    let _ = existing.close();
  }
  Ok(())
}

#[tauri::command]
async fn open_in_app_meet(app: tauri::AppHandle, url: String, title: Option<String>) -> Result<(), String> {
  let win_title = title.unwrap_or_else(|| "ARIS — Google Meet".to_string());

  if let Some(existing) = app.get_webview_window("google-meet-session") {
    let _ = existing.set_focus();
    let _ = existing.eval(&format!("window.location.href = '{}';", url));
    return Ok(());
  }

  let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

  let builder = tauri::WebviewWindowBuilder::new(
    &app,
    "google-meet-session",
    tauri::WebviewUrl::External(parsed_url),
  )
  .title(win_title)
  .inner_size(1200.0, 800.0)
  .center()
  .initialization_script(r#"
    // Detect meeting code from URL and report in document title for reliable capture
    setInterval(() => {
      const p = window.location.pathname;
      if (p.startsWith('/landing') || p.includes('/_meet/ended')) {
        window.close();
        return;
      }
      const match = p.match(/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
      if (match && match[1]) {
        const code = match[1].toLowerCase();
        if (!document.title.includes(code)) {
          document.title = "ARIS_MEET:" + code;
        }
      }
    }, 500);
  "#)
  .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0");

  let win = builder.build().map_err(|e| e.to_string())?;

  let app_handle = app.clone();
  win.on_window_event(move |event| {
    if let tauri::WindowEvent::Destroyed = event {
      let _ = app_handle.emit("meet-session-ended", ());
    }
  });

  // Watcher thread to capture real Google Meet room code when Google redirects
  let watcher_app = app.clone();
  std::thread::spawn(move || {
    let mut last_detected: Option<String> = None;
    for _ in 0..1200 { // Poll every 500ms for up to 10 minutes while window exists
      std::thread::sleep(std::time::Duration::from_millis(500));
      if let Some(w) = watcher_app.get_webview_window("google-meet-session") {
        let mut extracted_code: Option<String> = None;

        // Strategy 1: Check WebView URL
        if let Ok(url) = w.url() {
          let path_str = url.path().to_lowercase();
          for segment in path_str.split('/') {
            let seg = segment.trim();
            let parts: Vec<&str> = seg.split('-').collect();
            if parts.len() == 3
              && parts[0].len() == 3
              && parts[1].len() == 4
              && parts[2].len() == 3
              && seg.chars().all(|c| c.is_ascii_lowercase() || c == '-')
            {
              extracted_code = Some(seg.to_string());
              break;
            }
          }
        }

        // Strategy 2: Check window title updated by initialization_script
        if extracted_code.is_none() {
          if let Ok(title) = w.title() {
            if let Some(pos) = title.find("ARIS_MEET:") {
              let candidate = &title[pos + 10..];
              let seg = candidate.trim().split(|c: char| !c.is_alphanumeric() && c != '-').next().unwrap_or("");
              let parts: Vec<&str> = seg.split('-').collect();
              if parts.len() == 3
                && parts[0].len() == 3
                && parts[1].len() == 4
                && parts[2].len() == 3
              {
                extracted_code = Some(seg.to_lowercase());
              }
            }
          }
        }

        if let Some(code) = extracted_code {
          if last_detected.as_ref() != Some(&code) {
            last_detected = Some(code.clone());
            let _ = watcher_app.emit("meet-code-detected", code);
          }
        }
      } else {
        break;
      }
    }
  });

  Ok(())
}

#[tauri::command]
async fn get_in_app_meet_url(app: tauri::AppHandle) -> Result<Option<String>, String> {
  if let Some(win) = app.get_webview_window("google-meet-session") {
    let url = win.url().map_err(|e| e.to_string())?;
    Ok(Some(url.to_string()))
  } else {
    Ok(None)
  }
}

#[tauri::command]
async fn get_in_app_meet_code(app: tauri::AppHandle) -> Result<Option<String>, String> {
  if let Some(win) = app.get_webview_window("google-meet-session") {
    // Check URL
    if let Ok(url) = win.url() {
      let path_str = url.path().to_lowercase();
      for segment in path_str.split('/') {
        let seg = segment.trim();
        let parts: Vec<&str> = seg.split('-').collect();
        if parts.len() == 3
          && parts[0].len() == 3
          && parts[1].len() == 4
          && parts[2].len() == 3
          && seg.chars().all(|c| c.is_ascii_lowercase() || c == '-')
        {
          return Ok(Some(seg.to_string()));
        }
      }
    }
    // Check title
    if let Ok(title) = win.title() {
      if let Some(pos) = title.find("ARIS_MEET:") {
        let candidate = &title[pos + 10..];
        let seg = candidate.trim().split(|c: char| !c.is_alphanumeric() && c != '-').next().unwrap_or("");
        let parts: Vec<&str> = seg.split('-').collect();
        if parts.len() == 3
          && parts[0].len() == 3
          && parts[1].len() == 4
          && parts[2].len() == 3
        {
          return Ok(Some(seg.to_lowercase()));
        }
      }
    }
    Ok(None)
  } else {
    Ok(None)
  }
}

#[tauri::command]
async fn close_in_app_meet(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(win) = app.get_webview_window("google-meet-session") {
    let _ = win.close();
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      app.handle().plugin(tauri_plugin_oauth::init())?;
      app.handle().plugin(tauri_plugin_opener::init())?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      open_in_app_meet,
      close_in_app_meet,
      get_in_app_meet_url,
      get_in_app_meet_code,
      open_oauth_window,
      close_oauth_window
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
