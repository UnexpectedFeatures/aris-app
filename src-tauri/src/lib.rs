use tauri::{Emitter, Manager};
use tauri::webview::{PermissionKind, PermissionResponse};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct TranscriptEntry {
  pub who: String,
  pub text: String,
  pub t: String,
}

static MEET_TRANSCRIPT: std::sync::Mutex<Vec<TranscriptEntry>> = std::sync::Mutex::new(Vec::new());

#[tauri::command]
fn get_in_app_meet_transcript() -> Vec<TranscriptEntry> {
  MEET_TRANSCRIPT.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
fn clear_in_app_meet_transcript() {
  let mut lock = MEET_TRANSCRIPT.lock().unwrap_or_else(|e| e.into_inner());
  lock.clear();
}

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
async fn open_in_app_meet(
  app: tauri::AppHandle,
  url: String,
  title: Option<String>,
  host_name: Option<String>,
) -> Result<(), String> {
  let win_title = title.unwrap_or_else(|| "ARIS — Google Meet".to_string());

  // Clear previous session transcript buffer
  {
    let mut lock = MEET_TRANSCRIPT.lock().unwrap_or_else(|e| e.into_inner());
    lock.clear();
  }

  if let Some(existing) = app.get_webview_window("google-meet-session") {
    let _ = existing.close();
    std::thread::sleep(std::time::Duration::from_millis(200));
  }

  let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

  let host_display_json = serde_json::to_string(&host_name.unwrap_or_else(|| "You".to_string()))
    .unwrap_or_else(|_| "\"You\"".to_string());

  let app_handle_res = app.clone();
  let builder = tauri::WebviewWindowBuilder::new(
    &app,
    "google-meet-session",
    tauri::WebviewUrl::External(parsed_url),
  )
  .title(win_title)
  .inner_size(1200.0, 800.0)
  .center()
  .devtools(true)
  .on_permission_request(|_webview, kind| {
    println!("[ARIS RUST] 🎙️ Google Meet Window permission requested: {:?}", kind);
    match kind {
      PermissionKind::Camera | PermissionKind::Microphone => PermissionResponse::Allow,
      _ => PermissionResponse::Default,
    }
  })
  .on_web_resource_request(move |request, response| {
    let uri_str = request.uri().to_string();
    if uri_str.contains("__aris_transcript__") {
      *response.status_mut() = tauri::http::StatusCode::OK;
      *response.body_mut() = std::borrow::Cow::Borrowed(b"{\"ok\":true}");

      if let Ok(parsed) = url::Url::parse(&uri_str) {
        if let Some((_, data_val)) = parsed.query_pairs().find(|(k, _)| k == "data") {
          if let Ok(entry) = serde_json::from_str::<TranscriptEntry>(&data_val) {
            let mut lock = MEET_TRANSCRIPT.lock().unwrap_or_else(|e| e.into_inner());
            let is_duplicate = lock
              .last()
              .map(|prev| prev.who == entry.who && prev.text == entry.text)
              .unwrap_or(false);
            if !is_duplicate && !entry.text.trim().is_empty() {
              println!("\n[ARIS TERMINAL] 🎙️ PICKED UP CAPTION (HTTP): [{}] {}: {}", entry.t, entry.who, entry.text);
              lock.push(entry.clone());
              let _ = app_handle_res.emit("meet-transcript-chunk", entry);
            }
          }
        }
      }
    }
  })
  .initialization_script(format!("window.__ARIS_HOST_NAME__ = {};\n", host_display_json) + r#"
    // ARIS Meet Integration & Live Caption Scraper
    (function () {
      const HOST_NAME = window.__ARIS_HOST_NAME__ || 'You';
      console.log('[ARIS] Injected into Google Meet window with Host:', HOST_NAME);

      let currentCode = "";
      let lastCommittedText = "";
      let lastCommittedSpeaker = "";
      let pendingSpeaker = "";
      let pendingText = "";
      let lastSeenText = "";
      let lastTextChangeTime = Date.now();
      let lineCount = 0;
      const queue = [];
      let currentSeq = 1;

      function updateBadge(text, active) {
        try {
          let el = document.getElementById('aris-transcript-indicator');
          if (!el) {
            el = document.createElement('div');
            el.id = 'aris-transcript-indicator';
            el.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999999;background:#0d1a10;color:#fff;font-family:sans-serif;font-size:11.5px;font-weight:600;padding:6px 14px;border-radius:20px;border:1px solid #2b4c33;box-shadow:0 4px 14px rgba(0,0,0,0.35);pointer-events:none;display:flex;align-items:center;gap:8px;';
            const dot = document.createElement('span');
            dot.id = 'aris-badge-dot';
            dot.style.cssText = 'width:8px;height:8px;border-radius:50%;display:inline-block;';
            const txt = document.createElement('span');
            txt.id = 'aris-badge-text';
            el.appendChild(dot);
            el.appendChild(txt);
            (document.body || document.documentElement).appendChild(el);
          }
          const dot = document.getElementById('aris-badge-dot');
          const txt = document.getElementById('aris-badge-text');
          if (dot) {
            dot.style.background = active ? '#4cd964' : '#f59e0b';
            dot.style.boxShadow = active ? '0 0 8px #4cd964' : 'none';
          }
          if (txt) {
            txt.textContent = 'ARIS: ' + text;
          }
        } catch (e) {}
      }

      function formatTimeNow() {
        const d = new Date();
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      function commitSentence(who, text) {
        const clean = (text || '').trim();
        if (!clean || clean.length < 2) return;
        if (clean === lastCommittedText && who === lastCommittedSpeaker) return;

        lastCommittedText = clean;
        lastCommittedSpeaker = who;
        lineCount++;

        const entry = {
          who: (who || HOST_NAME || 'You').replace(/^[•\s]+/, '').trim(),
          text: clean,
          t: formatTimeNow()
        };

        queue.push(entry);
        console.log('[ARIS] ✅ Captured line:', entry);
        updateBadge(`Capturing (${lineCount} lines)`, true);

        pendingText = '';
        pendingSpeaker = '';
        lastSeenText = '';
      }

      function flushPending() {
        if (!pendingSpeaker || !pendingText) return;
        let textToCommit = '';
        if (lastCommittedText && pendingText.startsWith(lastCommittedText) && pendingSpeaker === lastCommittedSpeaker) {
          textToCommit = pendingText.slice(lastCommittedText.length).replace(/^[.,\s]+/, '').trim();
        } else if (pendingText !== lastCommittedText) {
          textToCommit = pendingText;
        }
        if (textToCommit && textToCommit.length >= 2) {
          commitSentence(pendingSpeaker, textToCommit);
        }
      }
      window.__ARIS_FLUSH = flushPending;

      function isNoise(t) {
        if (!t) return true;
        const s = t.toLowerCase().trim();
        return (
          s.length < 2 ||
          s.includes("your meeting's ready") ||
          s.includes("your meeting is safe") ||
          s.includes("add others") ||
          s.includes("copy link") ||
          s.includes("joined as ") ||
          s.includes("get your permission before") ||
          s.includes("meeting details") ||
          s.includes("people who use this meeting link") ||
          s.includes("share this meeting link") ||
          s.includes("you are muted") ||
          s.includes("your microphone is muted") ||
          s.includes("your microphone is turned off") ||
          s.includes("turn on your microphone") ||
          s.includes("click to unmute") ||
          s.includes("you are presenting") ||
          s.includes("someone is presenting") ||
          s.includes("raised a hand")
        );
      }

      function parseSpeaker(container) {
        if (!container) return '';
        // 1. Text-based speaker classes
        const nameEl = container.querySelector('.NWpY1d, div[jsname="r4nke"], .zs75Ib, .adEAEc, [data-self-name]');
        if (nameEl && nameEl.textContent && nameEl.textContent.trim()) {
          return nameEl.textContent.trim();
        }
        // 2. Avatar img alt (excluding generic words)
        const imgEl = container.querySelector('img[alt]');
        if (imgEl) {
          const alt = (imgEl.getAttribute('alt') || '').trim();
          if (alt && !alt.toLowerCase().includes('avatar') && !alt.toLowerCase().includes('profile') && !alt.toLowerCase().includes('picture')) {
            return alt;
          }
        }
        // 3. Parent container fallback
        const parent = container.closest('div[jscontroller]') || container.parentElement;
        if (parent && parent !== container) {
          const pNameEl = parent.querySelector('.NWpY1d, div[jsname="r4nke"], .zs75Ib');
          if (pNameEl && pNameEl.textContent && pNameEl.textContent.trim()) {
            return pNameEl.textContent.trim();
          }
        }
        return '';
      }

      function resolveSpeaker(raw) {
        const s = (raw || '').trim();
        const lower = s.toLowerCase();
        if (lower === 'you' || lower.startsWith('you ') || lower.startsWith('you(') || lower === '' || lower === 'participant' || lower === 'speaker') {
          return HOST_NAME || 'You';
        }
        return s;
      }

      function extractCaptions() {
        // If not in the active call yet, don't scrape lobby noise
        const inCall = !!document.querySelector('button[aria-label^="Leave call" i], [role="button"][aria-label^="Leave call" i], button[data-tooltip*="Leave call" i]');
        if (!inCall) return [];

        const results = [];

        // Priority 1: Google Meet Official Captions Region & Turn Blocks (.nMcdL)
        const turns = document.querySelectorAll('[aria-label="Captions"][role="region"] .nMcdL, .nMcdL');
        if (turns.length > 0) {
          turns.forEach((turn) => {
            const rawWho = parseSpeaker(turn);
            const who = resolveSpeaker(rawWho);
            const tEl = turn.querySelector('.ygicle, .VbkSUe, .bh44bd, div.iTTPOb');
            const text = tEl ? (tEl.textContent || '').trim() : '';
            if (text && !isNoise(text)) {
              results.push({ who, text });
            }
          });
        }

        // Priority 2: Direct caption classes (.ygicle, .VbkSUe, etc.)
        if (results.length === 0) {
          const captionNodes = document.querySelectorAll('.ygicle, .VbkSUe, .bh44bd, div.iTTPOb');
          captionNodes.forEach((node) => {
            const text = (node.textContent || '').trim();
            if (!text || isNoise(text)) return;
            const parent = node.closest('.nMcdL') || node.closest('div[jscontroller]') || node.parentElement?.parentElement || node.parentElement;
            const rawWho = parseSpeaker(parent);
            const who = resolveSpeaker(rawWho);
            results.push({ who, text });
          });
        }

        // Priority 3: Captions container div[jsname="YSxPC"] or div.a4bIc
        if (results.length === 0) {
          const containers = document.querySelectorAll('div[jsname="YSxPC"], div.a4bIc');
          containers.forEach((c) => {
            const full = (c.textContent || '').trim();
            if (!full || full.length < 2 || isNoise(full)) return;
            let who = HOST_NAME || 'You';
            let text = full;
            const colon = full.indexOf(':');
            if (colon > 0 && colon < 35) {
              const possibleWho = full.slice(0, colon).trim();
              who = resolveSpeaker(possibleWho);
              text = full.slice(colon + 1).trim();
            }
            if (text && !isNoise(text)) results.push({ who, text });
          });
        }

        return results;
      }

      function processCaptions() {
        const found = extractCaptions();
        if (found.length > 0) {
          const latest = found[found.length - 1];
          if (latest && latest.text) {
            console.log('[ARIS Live Speech Detected]', latest.who, ':', latest.text);
            updateBadge(`Hearing ${latest.who}...`, true);

            // 1. If speaker changed, immediately flush previous speaker's speech
            if (pendingSpeaker && latest.who !== pendingSpeaker && pendingText) {
              flushPending();
              pendingSpeaker = latest.who;
              pendingText = latest.text;
              lastSeenText = latest.text;
              lastTextChangeTime = Date.now();
              return;
            }

            pendingSpeaker = latest.who;

            // 2. If text grew/changed (new words spoken)
            if (latest.text !== lastSeenText) {
              lastSeenText = latest.text;
              pendingText = latest.text;
              lastTextChangeTime = Date.now();
            } else {
              // 3. Text has stopped changing (speaker paused or finished sentence for >= 1000ms)
              const steadyDuration = Date.now() - lastTextChangeTime;
              if (steadyDuration >= 1000 && pendingText) {
                flushPending();
              }
            }
          }
        } else {
          // Captions cleared/hidden from DOM -> speaker finished, flush immediately
          if (pendingText) {
            flushPending();
          }
        }
      }

      // 1. URL & Meeting Code Watcher (runs every 500ms)
      setInterval(() => {
        const p = window.location.pathname;
        if (p.startsWith('/landing') || p.includes('/_meet/ended')) {
          window.close();
          return;
        }
        const m = p.match(/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
        if (m && m[1]) {
          currentCode = m[1].toLowerCase();
        }
      }, 500);

      // 2. Auto-enable captions when in call
      setInterval(() => {
        if (!currentCode) return;
        const inCall = !!document.querySelector('button[aria-label^="Leave call" i], [role="button"][aria-label^="Leave call" i], button[data-tooltip*="Leave call" i]');
        if (!inCall) {
          updateBadge('Join meeting to start', false);
          return;
        }

        // Check if captions are already on
        const isOffBtn = document.querySelector('button[aria-label*="Turn off captions" i], button[data-tooltip*="Turn off captions" i], [aria-label="Captions"][role="region"]');
        if (isOffBtn) {
          if (lineCount === 0 && !pendingText) updateBadge('Captions ON (listening...)', true);
          return;
        }

        // Click "Turn on captions" if found
        const turnOnBtn = document.querySelector('button[aria-label*="Turn on captions" i], button[data-tooltip*="Turn on captions" i], button[aria-label*="closed caption" i]');
        if (turnOnBtn) {
          console.log('[ARIS] Clicking Turn on captions');
          turnOnBtn.click();
          updateBadge('Turning captions ON...', false);
          return;
        }

        // Or trigger 'c' key shortcut
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', keyCode: 67, which: 67, bubbles: true }));
        updateBadge("Press 'c' to enable captions", false);
      }, 2000);

      // 3. Fast Polling + MutationObserver for captions
      setInterval(processCaptions, 400);

      const observer = new MutationObserver(() => {
        processCaptions();
      });
      const target = document.body || document.documentElement;
      if (target) {
        observer.observe(target, { childList: true, subtree: true, characterData: true });
      }

      // 4. Multi-channel syncing to Rust backend (URL Hash + Image Ping)
      let lastSentSeq = 0;
      let lastSentAt = 0;

      setInterval(() => {
        const now = Date.now();
        if (window.__ARIS_ACK === currentSeq || (lastSentSeq === currentSeq && now - lastSentAt > 1000)) {
          queue.shift();
          currentSeq++;
        }

        if (queue.length > 0) {
          const item = queue[0];
          lastSentSeq = currentSeq;
          lastSentAt = now;
          const jsonStr = JSON.stringify(item);

          // Channel 1: URL Hash fragment (readable via w.url().fragment() in Rust)
          try {
            window.location.hash = 'ARIS_CAP:' + currentSeq + ':' + encodeURIComponent(jsonStr) + '|END_CAP';
          } catch (e) {}

          // Channel 2: Image ping (bypasses meetsw.js service worker, intercepted by on_web_resource_request)
          try {
            const img = new Image();
            img.src = 'https://aris-internal.local/__aris_transcript__?seq=' + currentSeq + '&data=' + encodeURIComponent(jsonStr);
          } catch (e) {}
        } else {
          try {
            if (window.location.hash && window.location.hash.includes('ARIS_CAP:')) {
              history.replaceState(null, '', window.location.pathname);
            }
          } catch (e) {}
        }
      }, 100);

      window.addEventListener('beforeunload', () => {
        flushPending();
      });
    })();
  "#)
  .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0");

  let win = builder.build().map_err(|e| e.to_string())?;

  let app_handle = app.clone();
  win.on_window_event(move |event| {
    if let tauri::WindowEvent::Destroyed = event {
      let _ = app_handle.emit("meet-session-ended", ());
    }
  });

  // Watcher thread to capture Google Meet room code AND live caption chunks
  let watcher_app = app.clone();
  std::thread::spawn(move || {
    let mut last_detected: Option<String> = None;
    let mut last_caption_seq: u64 = 0;

    for _ in 0..6000 { // Poll every 100ms for up to 10 minutes while window exists
      std::thread::sleep(std::time::Duration::from_millis(100));
      if let Some(w) = watcher_app.get_webview_window("google-meet-session") {
        let mut extracted_code: Option<String> = None;

        // Strategy 1: Check WebView URL for room code AND fragment for caption chunks
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

          // Check URL fragment for caption chunk
          if let Some(fragment) = url.fragment() {
            if let Some(pos) = fragment.find("ARIS_CAP:") {
              let cap_str = &fragment[pos + 9..];
              if let Some(colon) = cap_str.find(':') {
                let seq_str = &cap_str[..colon];
                let encoded_json = &cap_str[colon + 1..];
                if let Ok(seq) = seq_str.parse::<u64>() {
                  if last_caption_seq != seq {
                    let clean_encoded = if let Some(end_idx) = encoded_json.find("|END_CAP") {
                      &encoded_json[..end_idx]
                    } else {
                      encoded_json
                    };
                    let raw_json: String = url::form_urlencoded::parse(format!("v={}", clean_encoded).as_bytes())
                      .find(|(k, _)| k == "v")
                      .map(|(_, val)| val.into_owned())
                      .unwrap_or_else(|| clean_encoded.to_string());

                    if let Ok(entry) = serde_json::from_str::<TranscriptEntry>(&raw_json) {
                      last_caption_seq = seq;
                      let mut lock = MEET_TRANSCRIPT.lock().unwrap_or_else(|e| e.into_inner());
                      let is_dup = lock
                        .last()
                        .map(|prev| prev.who == entry.who && prev.text == entry.text)
                        .unwrap_or(false);
                      if !is_dup && !entry.text.trim().is_empty() {
                        println!("\n[ARIS TERMINAL] 🎙️ PICKED UP CAPTION (URL HASH): [{}] {}: {}", entry.t, entry.who, entry.text);
                        lock.push(entry.clone());
                        let _ = watcher_app.emit("meet-transcript-chunk", entry);
                      }
                      let _ = w.eval(&format!("window.__ARIS_ACK = {};", seq));
                    }
                  }
                }
              }
            }
          }
        }

        // Strategy 2: Check window title for meeting code AND caption transcript chunks
        if let Ok(title) = w.title() {
          if extracted_code.is_none() {
            if let Some(pos) = title.find("ARIS_MEET:") {
              let candidate = &title[pos + 10..];
              let seg = candidate
                .split('|')
                .next()
                .unwrap_or("")
                .trim()
                .split(|c: char| !c.is_alphanumeric() && c != '-')
                .next()
                .unwrap_or("");
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

          // Check for caption chunk in title
          if let Some(pos) = title.find("ARIS_CAP:") {
            let cap_str = &title[pos + 9..];
            if let Some(colon) = cap_str.find(':') {
              let seq_str = &cap_str[..colon];
              let raw_json = &cap_str[colon + 1..];
              if let Ok(seq) = seq_str.parse::<u64>() {
                if last_caption_seq != seq {
                  let clean_json = if let Some(end_idx) = raw_json.find("|END_CAP") {
                    &raw_json[..end_idx]
                  } else if let Some(end_idx) = raw_json.rfind('}') {
                    &raw_json[..=end_idx]
                  } else {
                    raw_json
                  };

                  match serde_json::from_str::<TranscriptEntry>(clean_json) {
                    Ok(entry) => {
                      last_caption_seq = seq;
                      let mut lock = MEET_TRANSCRIPT.lock().unwrap_or_else(|e| e.into_inner());
                      let is_dup = lock
                        .last()
                        .map(|prev| prev.who == entry.who && prev.text == entry.text)
                        .unwrap_or(false);
                      if !is_dup && !entry.text.trim().is_empty() {
                        println!("\n[ARIS TERMINAL] 🎙️ PICKED UP CAPTION (IPC): [{}] {}: {}", entry.t, entry.who, entry.text);
                        lock.push(entry.clone());
                        let _ = watcher_app.emit("meet-transcript-chunk", entry);
                      }
                      let _ = w.eval(&format!("window.__ARIS_ACK = {};", seq));
                    }
                    Err(err) => {
                      println!("[ARIS Transcript JSON Err] {} -> {}", clean_json, err);
                    }
                  }
                }
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
    let _ = win.eval("if (typeof window.__ARIS_FLUSH === 'function') { window.__ARIS_FLUSH(); }");
    std::thread::sleep(std::time::Duration::from_millis(250));
  }

  let lock = MEET_TRANSCRIPT.lock().unwrap_or_else(|e| e.into_inner());
  println!("\n================== [ARIS RUST TERMINAL] MEET SESSION ENDED ==================");
  println!("Total Captured Transcript Lines: {}", lock.len());
  for (idx, line) in lock.iter().enumerate() {
    println!("  [{}] [{}] {}: {}", idx + 1, line.t, line.who, line.text);
  }
  println!("=============================================================================\n");

  if let Some(win) = app.get_webview_window("google-meet-session") {
    let _ = win.close();
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .on_permission_request(|_webview, kind| {
      println!("[ARIS RUST] 🎙️ Webview permission requested: {:?}", kind);
      match kind {
        PermissionKind::Camera | PermissionKind::Microphone => {
          println!("[ARIS RUST] 🎙️ Media permission ({:?}) -> AUTO-GRANTED", kind);
          PermissionResponse::Allow
        }
        _ => PermissionResponse::Default,
      }
    })
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
      get_in_app_meet_transcript,
      clear_in_app_meet_transcript,
      open_oauth_window,
      close_oauth_window
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
