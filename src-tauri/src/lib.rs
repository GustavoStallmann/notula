// Notula backend: system+mic recording (PipeWire/Pulse via ffmpeg),
// Cloudflare Workers AI transcription (Whisper) + summarization (LLM).
//
// Step-by-step flow (no realtime): record -> transcribe -> resume.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

// ---------------------------------------------------------------------------
// Audio sources
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioSource {
    name: String,
    description: String,
    driver: String,
    format: String,
    state: String,
    kind: String,
    is_default_system: bool,
    is_default_mic: bool,
}

/// Map internal source names → human-friendly descriptions, parsed from
/// `pactl list sources` (e.g. "Monitor of Redragon H388 Gaming Headset …").
#[cfg(not(target_os = "windows"))]
fn source_descriptions() -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    let Ok(out) = Command::new("pactl").arg("list").arg("sources").output() else {
        return map;
    };
    if !out.status.success() {
        return map;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mut current = String::new();
    for line in text.lines() {
        let trimmed = line.trim_start();
        if let Some(name) = trimmed.strip_prefix("Name: ") {
            current = name.trim().to_string();
        } else if let Some(desc) = trimmed.strip_prefix("Description: ") {
            if !current.is_empty() {
                map.insert(current.clone(), desc.trim().to_string());
            }
        }
    }
    map
}

fn run_cmd(prog: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(prog)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run `{prog}`: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(format!("`{prog}` failed: {err}"));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn default_sink_and_source() -> (String, String) {
    #[cfg(target_os = "windows")]
    {
        // Defaults come from the dshow device list (Stereo Mix / first mic).
        (String::new(), String::new())
    }
    #[cfg(not(target_os = "windows"))]
    {
        default_sink_and_source_pulse()
    }
}

#[cfg(not(target_os = "windows"))]
fn default_sink_and_source_pulse() -> (String, String) {
    let info = run_cmd("pactl", &["info"]).unwrap_or_default();
    let mut sink = String::new();
    let mut source = String::new();
    for line in info.lines() {
        if let Some(v) = line.strip_prefix("Default Sink:") {
            sink = v.trim().to_string();
        }
        if let Some(v) = line.strip_prefix("Default Source:") {
            source = v.trim().to_string();
        }
    }
    (sink, source)
}

#[tauri::command]
fn list_audio_sources() -> Result<Vec<AudioSource>, String> {
    if std::env::consts::OS == "macos" {
        return Err("audio capture is not supported on macOS yet (Linux and Windows only)".into());
    }
    #[cfg(target_os = "windows")]
    {
        list_audio_sources_dshow()
    }
    #[cfg(not(target_os = "windows"))]
    {
        list_audio_sources_pulse()
    }
}

/// Windows: enumerate DirectShow audio capture devices via ffmpeg.
#[cfg(target_os = "windows")]
fn list_audio_sources_dshow() -> Result<Vec<AudioSource>, String> {
    // ffmpeg prints the device list to stderr and exits non-zero; that's expected.
    let out = Command::new("ffmpeg")
        .args([
            "-hide_banner",
            "-list_devices",
            "true",
            "-f",
            "dshow",
            "-i",
            "dummy",
        ])
        .output()
        .map_err(|e| {
            format!(
                "failed to run ffmpeg (is it installed? try `winget install ffmpeg`): {e}"
            )
        })?;
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let mut sources = Vec::new();
    let mut seen_system_default = false;
    let mut seen_mic_default = false;
    for line in text.lines() {
        // Example: [dshow @ 000001...]  "Microphone (Realtek(R) Audio)" (audio)
        let line = line.trim();
        if !line.contains("(audio)") {
            continue;
        }
        let name = line.split('"').nth(1).unwrap_or("").trim().to_string();
        if name.is_empty() || sources.iter().any(|s: &AudioSource| s.name == name) {
            continue;
        }
        let lower = name.to_lowercase();
        // Heuristic: loopback-style devices serve as the "system audio" source.
        // This includes "Stereo Mix" and virtual cables (VB-CABLE, Voicemeeter).
        let is_loop = lower.contains("stereo mix")
            || lower.contains("loopback")
            || lower.contains("what u hear")
            || lower.contains("cable")
            || lower.contains("voicemeeter");
        let (kind, is_default_system, is_default_mic) = if is_loop {
            let d = !seen_system_default;
            seen_system_default = true;
            ("system", d, false)
        } else {
            let d = !seen_mic_default;
            seen_mic_default = true;
            ("mic", false, d)
        };
        sources.push(AudioSource {
            name,
            description: String::new(),
            driver: "dshow".to_string(),
            format: String::new(),
            state: String::new(),
            kind: kind.to_string(),
            is_default_system,
            is_default_mic,
        });
    }
    if sources.is_empty() {
        return Err("no audio capture devices found. On Windows, system-audio capture needs \
            \"Stereo Mix\" enabled (Sound settings → Recording) or a virtual cable \
            (e.g. VB-CABLE), plus ffmpeg on PATH (`winget install ffmpeg`)."
            .into());
    }
    Ok(sources)
}

/// Linux (PipeWire/PulseAudio): enumerate sources via pactl.
#[cfg(not(target_os = "windows"))]
fn list_audio_sources_pulse() -> Result<Vec<AudioSource>, String> {
    let out = run_cmd("pactl", &["list", "short", "sources"])?;
    let descriptions = source_descriptions();
    let (def_sink, def_source) = default_sink_and_source();
    let def_monitor = if def_sink.is_empty() {
        String::new()
    } else {
        format!("{def_sink}.monitor")
    };
    let mut sources = Vec::new();
    for line in out.lines() {
        // format: <idx>\t<name>\t<driver>\t<format>\t<state>
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 5 {
            continue;
        }
        let name = parts[1].to_string();
        let kind = if name.ends_with(".monitor") {
            "system".to_string()
        } else {
            "mic".to_string()
        };
        sources.push(AudioSource {
            is_default_system: !def_monitor.is_empty() && name == def_monitor,
            is_default_mic: !def_source.is_empty() && name == def_source,
            description: descriptions.get(&name).cloned().unwrap_or_default(),
            name,
            driver: parts[2].to_string(),
            format: parts[3].to_string(),
            state: parts[4].to_string(),
            kind,
        });
    }
    if sources.is_empty() {
        return Err("no audio sources found (is PipeWire/PulseAudio running?)".into());
    }
    Ok(sources)
}

// ---------------------------------------------------------------------------
// Recording state
// ---------------------------------------------------------------------------

struct ActiveRecording {
    child: Child,
    stdin: Option<ChildStdin>,
    output_path: String,
    started_at: i64,
    mode: String,
}

struct RecordingState(Mutex<Option<ActiveRecording>>);

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn recordings_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("cannot resolve app data dir: {e}"))?
        .join("recordings");
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create recordings dir: {e}"))?;
    Ok(dir)
}

/// Keep only filesystem-safe characters for a user-given recording name.
/// Returns an empty string when nothing usable remains.
fn clean_stem(raw: &str) -> String {
    let mut s = raw.trim().replace(['/', '\\', '\0'], "");
    while s.starts_with('.') {
        s.remove(0);
    }
    let mut s: String = s.chars().take(80).collect();
    s = s.trim().to_string();
    s
}

/// Falls back to "meeting" when nothing usable remains.
fn sanitize_recording_name(raw: Option<String>) -> String {
    let s = clean_stem(&raw.unwrap_or_default());
    if s.is_empty() {
        "meeting".to_string()
    } else {
        s
    }
}

/// `<dir>/<stem>.wav`, with ` (2)`, ` (3)`, … suffixes on collision.
fn unique_wav_path(dir: &std::path::Path, stem: &str) -> PathBuf {
    let mut candidate = dir.join(format!("{stem}.wav"));
    let mut i = 2u32;
    while candidate.exists() {
        candidate = dir.join(format!("{stem} ({i}).wav"));
        i += 1;
    }
    candidate
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingStarted {
    path: String,
    started_at: i64,
    mode: String,
    system_source: Option<String>,
    mic_source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingStatus {
    is_recording: bool,
    elapsed_secs: i64,
    output_path: Option<String>,
    mode: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoppedRecording {
    path: String,
    duration_secs: i64,
    size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingFile {
    name: String,
    path: String,
    size_bytes: u64,
    modified: i64,
    has_transcript: bool,
    has_summary: bool,
}

/// Sibling sidecar files that link a transcript (.txt) and a summary (.md)
/// directly to their recording (.wav): same folder, same file stem.
fn sidecar_paths(wav: &std::path::Path) -> (PathBuf, PathBuf) {
    (wav.with_extension("txt"), wav.with_extension("md"))
}

#[tauri::command]
fn start_recording(
    app: AppHandle,
    state: State<RecordingState>,
    mode: String,
    system_source: Option<String>,
    mic_source: Option<String>,
    name: Option<String>,
) -> Result<RecordingStarted, String> {
    {
        let guard = state.0.lock().map_err(|e| format!("state lock: {e}"))?;
        if guard.is_some() {
            return Err("a recording is already in progress".into());
        }
    }

    let mode = mode.to_lowercase();
    if mode != "system" && mode != "mic" && mode != "both" {
        return Err("mode must be one of: system, mic, both".into());
    }
    if std::env::consts::OS == "macos" {
        return Err("audio recording is not supported on macOS yet (Linux and Windows only)".into());
    }

    // Resolve default devices when not explicitly provided.
    let (def_sink, def_source) = default_sink_and_source();
    let sys = system_source
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            if def_sink.is_empty() {
                String::new()
            } else {
                format!("{def_sink}.monitor")
            }
        });
    let mic = mic_source
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(def_source);

    if (mode == "system" || mode == "both") && sys.is_empty() {
        return Err("no system audio source selected (pick one in the dropdown)".into());
    }
    if (mode == "mic" || mode == "both") && mic.is_empty() {
        return Err("no microphone source selected (pick one in the dropdown)".into());
    }

    // ffmpeg must be available.
    run_cmd("ffmpeg", &["-version"]).map_err(|_| {
        #[cfg(target_os = "windows")]
        {
            "ffmpeg not found. Install it with `winget install ffmpeg`, make sure it is on \
             PATH, then restart the app."
                .to_string()
        }
        #[cfg(not(target_os = "windows"))]
        {
            "ffmpeg not found. Install it (e.g. `sudo pacman -S ffmpeg` on Arch, \
             `sudo apt install ffmpeg` on Debian/Ubuntu) and make sure it is on PATH."
                .to_string()
        }
    })?;

    let dir = recordings_dir(&app)?;
    let stem = sanitize_recording_name(name);
    let out_path = unique_wav_path(&dir, &stem);
    let out_str = out_path.to_string_lossy().to_string();

    // Platform audio input: PipeWire/PulseAudio elsewhere, DirectShow on Windows.
    // dshow gets a generous real-time buffer so long meetings don't drop audio.
    fn input_args(source: &str) -> Vec<String> {
        #[cfg(target_os = "windows")]
        {
            vec![
                "-f".to_string(),
                "dshow".to_string(),
                "-rtbufsize".to_string(),
                "64M".to_string(),
                "-i".to_string(),
                format!("audio=\"{source}\""),
            ]
        }
        #[cfg(not(target_os = "windows"))]
        {
            vec![
                "-f".to_string(),
                "pulse".to_string(),
                "-i".to_string(),
                source.to_string(),
            ]
        }
    }

    let mut args: Vec<String> =
        vec!["-y".to_string(), "-loglevel".to_string(), "error".to_string()];
    match mode.as_str() {
        "system" => {
            args.extend(input_args(&sys));
        }
        "mic" => {
            args.extend(input_args(&mic));
        }
        _ => {
            args.extend(input_args(&sys));
            args.extend(input_args(&mic));
            args.push("-filter_complex".to_string());
            args.push("amix=inputs=2:duration=longest:dropout_transition=0".to_string());
        }
    }
    // 16 kHz mono is ideal for Whisper and keeps files small.
    args.extend(
        ["-c:a", "pcm_s16le", "-ar", "16000", "-ac", "1"]
            .iter()
            .map(|s| s.to_string()),
    );

    let mut cmd = Command::new("ffmpeg");
    cmd.args(&args);
    cmd.arg(&out_str);
    // Piped stdin so we can quit gracefully with "q" on every platform.
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to start ffmpeg: {e}"))?;
    let stdin = child.stdin.take();
    let started_at = now_unix();

    {
        let mut guard = state.0.lock().map_err(|e| format!("state lock: {e}"))?;
        *guard = Some(ActiveRecording {
            child,
            stdin,
            output_path: out_str.clone(),
            started_at,
            mode: mode.clone(),
        });
    }

    // Give ffmpeg a moment; if it exits immediately the device was invalid.
    std::thread::sleep(std::time::Duration::from_millis(400));
    {
        let mut guard = state.0.lock().map_err(|e| format!("state lock: {e}"))?;
        if let Some(rec) = guard.as_mut() {
            match rec.child.try_wait() {
                Ok(Some(status)) => {
                    *guard = None;
                    return Err(format!(
                        "ffmpeg exited immediately (code {status}). Check the audio source."
                    ));
                }
                Ok(None) => {}
                Err(e) => {
                    *guard = None;
                    return Err(format!("ffmpeg check failed: {e}"));
                }
            }
        }
    }

    Ok(RecordingStarted {
        path: out_str,
        started_at,
        mode,
        system_source: if sys.is_empty() { None } else { Some(sys) },
        mic_source: if mic.is_empty() { None } else { Some(mic) },
    })
}

#[tauri::command]
fn stop_recording(state: State<RecordingState>) -> Result<StoppedRecording, String> {
    let rec = {
        let mut guard = state.0.lock().map_err(|e| format!("state lock: {e}"))?;
        guard.take().ok_or("no recording in progress")?
    };
    let mut rec = rec;
    let duration_secs = now_unix() - rec.started_at;

    // Ask ffmpeg to quit gracefully by sending "q" on stdin (works on every
    // platform and finalizes the WAV header). Fall back to kill if it hangs.
    if let Some(mut stdin) = rec.stdin.take() {
        let _ = stdin.write_all(b"q\n");
        let _ = stdin.flush();
        drop(stdin);
    }
    // Wait up to ~8s for graceful exit.
    let mut exited = false;
    for _ in 0..80 {
        match rec.child.try_wait() {
            Ok(Some(_)) => {
                exited = true;
                break;
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(100)),
            Err(_) => break,
        }
    }
    if !exited {
        let _ = rec.child.kill();
        let _ = rec.child.wait();
    } else {
        let _ = rec.child.wait();
    }

    let meta = std::fs::metadata(&rec.output_path)
        .map_err(|e| format!("recording stopped but file missing: {e}"))?;
    Ok(StoppedRecording {
        path: rec.output_path,
        duration_secs: duration_secs.max(0),
        size_bytes: meta.len(),
    })
}

#[tauri::command]
fn get_recording_status(state: State<RecordingState>) -> Result<RecordingStatus, String> {
    let guard = state.0.lock().map_err(|e| format!("state lock: {e}"))?;
    match guard.as_ref() {
        Some(rec) => Ok(RecordingStatus {
            is_recording: true,
            elapsed_secs: (now_unix() - rec.started_at).max(0),
            output_path: Some(rec.output_path.clone()),
            mode: Some(rec.mode.clone()),
        }),
        None => Ok(RecordingStatus {
            is_recording: false,
            elapsed_secs: 0,
            output_path: None,
            mode: None,
        }),
    }
}

#[tauri::command]
fn list_recordings(app: AppHandle) -> Result<Vec<RecordingFile>, String> {
    let dir = recordings_dir(&app)?;
    let mut files = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("cannot list recordings: {e}"))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("wav") {
            continue;
        }
        let meta = entry.metadata().unwrap_or_else(|_| {
            std::fs::metadata(&p).expect("metadata fallback unreachable in practice")
        });
        // Re-read safely without expect:
        let (size, modified) = match entry.metadata() {
            Ok(m) => (
                m.len(),
                m.modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0),
            ),
            Err(_) => (meta.len(), 0),
        };
        let (txt_p, md_p) = sidecar_paths(&p);
        files.push(RecordingFile {
            name: p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("recording.wav")
                .to_string(),
            path: p.to_string_lossy().to_string(),
            size_bytes: size,
            modified,
            has_transcript: txt_p.exists(),
            has_summary: md_p.exists(),
        });
    }
    files.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(files)
}

#[tauri::command]
fn delete_recording(app: AppHandle, path: String) -> Result<(), String> {
    let dir = recordings_dir(&app)?;
    let target = PathBuf::from(&path);
    if !target.starts_with(&dir) {
        return Err("refusing to delete a file outside the recordings folder".into());
    }
    std::fs::remove_file(&target).map_err(|e| format!("cannot delete recording: {e}"))?;
    // Also remove linked transcript / summary sidecars (best effort).
    let (txt_p, md_p) = sidecar_paths(&target);
    let _ = std::fs::remove_file(txt_p);
    let _ = std::fs::remove_file(md_p);
    Ok(())
}

#[tauri::command]
fn rename_recording(app: AppHandle, old_path: String, new_name: String) -> Result<String, String> {
    let dir = recordings_dir(&app)?;
    let old = PathBuf::from(&old_path);
    if !old.starts_with(&dir) {
        return Err("refusing to rename a file outside the recordings folder".into());
    }
    if old.extension().and_then(|e| e.to_str()) != Some("wav") {
        return Err("only wav recordings can be renamed".into());
    }
    let stem = clean_stem(&new_name);
    if stem.is_empty() {
        return Err("name cannot be empty".into());
    }
    let new_wav = dir.join(format!("{stem}.wav"));
    if new_wav != old {
        if new_wav.exists() {
            return Err("a recording with that name already exists".into());
        }
        let (old_txt, old_md) = sidecar_paths(&old);
        let (new_txt, new_md) = sidecar_paths(&new_wav);
        std::fs::rename(&old, &new_wav).map_err(|e| format!("cannot rename recording: {e}"))?;
        // Move linked transcript / summary alongside (best effort).
        if old_txt.exists() {
            let _ = std::fs::rename(&old_txt, &new_txt);
        }
        if old_md.exists() {
            let _ = std::fs::rename(&old_md, &new_md);
        }
    }
    Ok(new_wav.to_string_lossy().to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskArtifacts {
    transcript: Option<String>,
    summary: Option<String>,
}

#[tauri::command]
fn get_task_artifacts(path: String) -> Result<TaskArtifacts, String> {
    let wav = PathBuf::from(&path);
    if wav.extension().and_then(|e| e.to_str()) != Some("wav") {
        return Err("not a recording file".into());
    }
    let (txt_p, md_p) = sidecar_paths(&wav);
    let transcript = std::fs::read_to_string(txt_p)
        .ok()
        .filter(|s| !s.trim().is_empty());
    let summary = std::fs::read_to_string(md_p)
        .ok()
        .filter(|s| !s.trim().is_empty());
    Ok(TaskArtifacts {
        transcript,
        summary,
    })
}

// ---------------------------------------------------------------------------
// Cloudflare Workers AI
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscribeResult {
    text: String,
    chunks: usize,
    model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SummarizeResult {
    markdown: String,
    model: String,
}

fn cf_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("cannot build http client: {e}"))
}

/// Try several JSON pointers in order, returning the first hit.
fn pointer_any<'a>(v: &'a serde_json::Value, paths: &[&str]) -> Option<&'a serde_json::Value> {
    paths.iter().find_map(|p| v.pointer(p))
}

/// Group diarized words (`{text, speaker}`) into "Speaker N: ..." segments.
/// Cloudflare numbers speakers from 0, so we display them from 1.
fn segments_from_words(words: &[serde_json::Value], label: &str) -> String {
    let mut out = String::new();
    let mut current: Option<i64> = None;
    for w in words {
        let text = w.get("text").and_then(|v| v.as_str()).unwrap_or("");
        if text.trim().is_empty() {
            continue;
        }
        let sp = w.get("speaker").and_then(|v| v.as_i64()).unwrap_or(0);
        if current != Some(sp) {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(&format!("{label} {}: ", sp + 1));
            current = Some(sp);
        } else {
            out.push(' ');
        }
        out.push_str(text.trim());
    }
    out
}

fn speaker_label(lang_code: &str) -> &'static str {
    match lang_code {
        "en" => "Speaker",
        "fr" => "Locuteur",
        "es" => "Hablante",
        "de" => "Sprecher",
        _ => "Falante",
    }
}

/// Split a long WAV into ~chunk_secs segments using ffmpeg, returns chunk paths.
/// If the file is small enough, returns the single normalized file.
fn prepare_chunks(
    wav_path: &str,
    workdir: &std::path::Path,
    chunk_secs: u64,
    audio_filter: Option<&str>,
) -> Result<Vec<PathBuf>, String> {
    // Optional ffmpeg -af chain (silence trimming / speed-up) to cut billed minutes.
    let af: Vec<&str> = audio_filter.map(|f| vec!["-af", f]).unwrap_or_default();
    let meta =
        std::fs::metadata(wav_path).map_err(|e| format!("audio file not found: {e}"))?;
    const SINGLE_LIMIT: u64 = 8 * 1024 * 1024;
    if meta.len() <= SINGLE_LIMIT {
        // Normalize to 16kHz mono WAV to maximize Whisper accuracy.
        let norm = workdir.join("norm.wav");
        let st = Command::new("ffmpeg")
            .args([
                "-y",
                "-loglevel",
                "error",
                "-i",
                wav_path,
            ])
            .args(&af)
            .args([
                "-c:a",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                &norm.to_string_lossy(),
            ])
            .status()
            .map_err(|e| format!("ffmpeg normalize failed: {e}"))?;
        if !st.success() {
            return Err("ffmpeg normalize failed".into());
        }
        return Ok(vec![norm]);
    }
    let pattern = workdir.join("chunk-%03d.wav");
    let st = Command::new("ffmpeg")
        .args([
            "-y",
            "-loglevel",
            "error",
            "-i",
            wav_path,
        ])
        .args(&af)
        .args([
            "-c:a",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-f",
            "segment",
            "-segment_time",
            &chunk_secs.to_string(),
            &pattern.to_string_lossy(),
        ])
        .status()
        .map_err(|e| format!("ffmpeg split failed: {e}"))?;
    if !st.success() {
        return Err("ffmpeg split failed".into());
    }
    let mut chunks: Vec<PathBuf> = std::fs::read_dir(workdir)
        .map_err(|e| format!("cannot read chunks: {e}"))?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("chunk-") && n.ends_with(".wav"))
                .unwrap_or(false)
        })
        .collect();
    chunks.sort();
    if chunks.is_empty() {
        return Err("no audio chunks produced".into());
    }
    Ok(chunks)
}

#[tauri::command]
async fn transcribe_audio(
    app: AppHandle,
    file_path: String,
    account_id: String,
    api_token: String,
    model: String,
    language: Option<String>,
    trim_silence: Option<bool>,
    speed: Option<f64>,
) -> Result<TranscribeResult, String> {
    if account_id.trim().is_empty() || api_token.trim().is_empty() {
        return Err("Cloudflare Account ID and API Token are required (see Settings)".into());
    }
    if std::fs::metadata(&file_path).is_err() {
        return Err("audio file not found".into());
    }
    let model = if model.trim().is_empty() {
        "xai/grok-stt".to_string()
    } else {
        model.trim().to_string()
    };
    // Grok STT (third-party xAI model) uses the enveloped /ai/run endpoint and
    // supports speaker diarization; Whisper-style models use /ai/run/{model}.
    let use_grok = model.contains("grok-stt");
    let lang_code = language
        .as_ref()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .unwrap_or_default();

    // Unique per process + nanosecond timestamp: two transcriptions started in
    // the same second must never share a workdir (chunk files would collide).
    let workdir = std::env::temp_dir().join(format!(
        "notula-stt-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(&workdir).map_err(|e| format!("temp dir: {e}"))?;
    // STT is billed per audio minute: drop long pauses and optionally speed up.
    let mut filters: Vec<String> = Vec::new();
    if trim_silence.unwrap_or(false) {
        filters.push(
            "silenceremove=start_periods=1:start_threshold=-45dB:\
             stop_periods=-1:stop_duration=1.5:stop_threshold=-45dB:stop_silence=0.3"
                .to_string(),
        );
    }
    let speed = speed.unwrap_or(1.0).clamp(1.0, 1.5);
    if speed > 1.001 {
        filters.push(format!("atempo={speed:.2}"));
    }
    let audio_filter = (!filters.is_empty()).then(|| filters.join(","));
    let chunks = prepare_chunks(&file_path, &workdir, 180, audio_filter.as_deref())?;
    let total = chunks.len();

    let client = cf_client()?;
    let whisper_url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/ai/run/{}",
        account_id.trim(),
        model
    );
    let grok_url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/ai/run",
        account_id.trim()
    );

    let mut texts = Vec::new();
    let mut first_raw: Option<String> = None;
    let mut first_meta: Option<serde_json::Value> = None;
    // Index of the Grok request variant that produced text; once known, later
    // chunks use only it so a silent chunk is never re-billed with other variants.
    let mut proven_variant: Option<usize> = None;
    for (i, chunk) in chunks.iter().enumerate() {
        let _ = app.emit(
            "transcribe-progress",
            serde_json::json!({ "current": i + 1, "total": total }),
        );
        let bytes =
            std::fs::read(chunk).map_err(|e| format!("cannot read chunk {}: {e}", i + 1))?;
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        // Grok: try request variants until one yields text —
        // (diarize+language) → (diarize only) → (plain). First non-empty wins.
        // This both self-heals (e.g. a parameter the deployment dislikes) and
        // tells us which variant worked.
        let text = if use_grok {
            let label = speaker_label(&lang_code);
            let mut got = String::new();
            let variants = [
                (!lang_code.is_empty(), true),
                (false, true),
                (false, false),
            ];
            for (vi, (v_lang, v_diarize)) in variants.into_iter().enumerate() {
                if proven_variant.is_some_and(|p| p != vi) {
                    continue;
                }
                let mut input = serde_json::json!({
                    "file": format!("data:audio/wav;base64,{b64}"),
                });
                if v_diarize {
                    input["diarize"] = serde_json::Value::Bool(true);
                }
                if v_lang {
                    input["language"] = serde_json::Value::String(lang_code.clone());
                }
                let vbody = serde_json::json!({ "model": model, "input": input });
                let vresp = client
                    .post(&grok_url)
                    .bearer_auth(api_token.trim())
                    .json(&vbody)
                    .send()
                    .await
                    .map_err(|e| {
                        format!("Cloudflare request failed (chunk {}/{}): {e}", i + 1, total)
                    })?;
                let vstatus = vresp.status();
                let vjson: serde_json::Value = vresp
                    .json()
                    .await
                    .map_err(|e| format!("invalid Cloudflare response: {e}"))?;
                if !vstatus.is_success() {
                    return Err(format!("Cloudflare error {vstatus}: {vjson}"));
                }
                if first_raw.is_none() {
                    first_raw = Some(vjson.to_string());
                    first_meta = Some(serde_json::json!({
                        "model": model,
                        "chunk_bytes": bytes.len(),
                        "b64_len": b64.len(),
                        "variant": { "language": v_lang, "diarize": v_diarize },
                    }));
                }
                // Grok reports async state; anything but Completed is a real failure.
                if let Some(state) = vjson
                    .pointer("/state")
                    .and_then(|v| v.as_str())
                    .filter(|s| *s != "Completed")
                {
                    let raw = vjson.to_string();
                    let snippet: String = raw.chars().take(300).collect();
                    return Err(format!(
                        "transcription failed for chunk {}/{total} (state {state}: {snippet})",
                        i + 1
                    ));
                }
                got = pointer_any(&vjson, &["/result/result/words", "/result/words"])
                    .and_then(|v| v.as_array())
                    .map(|words| segments_from_words(words, label))
                    .filter(|s| !s.trim().is_empty())
                    .or_else(|| {
                        pointer_any(&vjson, &["/result/result/text", "/result/text", "/text"])
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
                    .unwrap_or_default();
                if !got.trim().is_empty() {
                    proven_variant = Some(vi);
                    break;
                }
            }
            got
        } else {
            let mut body = serde_json::json!({ "audio": b64 });
            if !lang_code.is_empty() {
                body["language"] = serde_json::Value::String(lang_code.clone());
            }
            let resp = client
                .post(&whisper_url)
                .bearer_auth(api_token.trim())
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Cloudflare request failed (chunk {}/{}): {e}", i + 1, total))?;
            let status = resp.status();
            let json: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("invalid Cloudflare response: {e}"))?;
            if !status.is_success() {
                return Err(format!("Cloudflare error {status}: {json}"));
            }
            if first_raw.is_none() {
                first_raw = Some(json.to_string());
            }
            // Whisper envelope is { result: { text }, ... } but be lenient.
            json.pointer("/result/text")
                .and_then(|v| v.as_str())
                .or_else(|| json.pointer("/text").and_then(|v| v.as_str()))
                .unwrap_or("")
                .to_string()
        };
        if text.trim().is_empty() {
            // Silence (or nothing detected) in this chunk — keep it empty and
            // continue instead of aborting the whole transcription.
            texts.push(String::new());
        } else {
            texts.push(text.trim().to_string());
        }
    }

    let _ = std::fs::remove_dir_all(&workdir);
    let text = texts
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if text.is_empty() {
        // Save request metadata + full first response for debugging (the
        // request audio itself is never included). Tell the user where.
        let dbg = serde_json::json!({
            "request_meta": first_meta,
            "response": first_raw
                .as_deref()
                .unwrap_or("")
                .chars()
                .take(4000)
                .collect::<String>(),
        });
        let dbg_path = std::env::temp_dir().join("notula-stt-debug.json");
        let _ = std::fs::write(&dbg_path, serde_json::to_string_pretty(&dbg).unwrap_or_default());
        return Err(format!(
            "no speech detected in this recording — debug saved to {}",
            dbg_path.display()
        )
        .into());
    }
    // Link the transcript directly to its audio via a .txt sidecar (best effort).
    let (txt_p, _) = sidecar_paths(std::path::Path::new(&file_path));
    let _ = std::fs::write(txt_p, &text);
    Ok(TranscribeResult {
        text,
        chunks: total,
        model,
    })
}

#[tauri::command]
async fn summarize_transcript(
    transcript: String,
    account_id: String,
    api_token: String,
    model: String,
    language: String,
    file_path: Option<String>,
    kind: Option<String>,
) -> Result<SummarizeResult, String> {
    if transcript.trim().is_empty() {
        return Err("transcript is empty — transcribe audio first".into());
    }
    if account_id.trim().is_empty() || api_token.trim().is_empty() {
        return Err("Cloudflare Account ID and API Token are required (see Settings)".into());
    }
    let model = if model.trim().is_empty() {
        "@cf/meta/llama-3.1-8b-instruct-fast".to_string()
    } else {
        // Migrate models deprecated by Cloudflare (May 2026 catalog refresh).
        match model.trim() {
            "@cf/meta/llama-3.1-8b-instruct" | "@cf/meta/llama-3.1-8b-instruct-awq" => {
                "@cf/meta/llama-3.1-8b-instruct-fast".to_string()
            }
            m => m.to_string(),
        }
    };
    let language = if language.trim().is_empty() {
        "the same language as the transcript".to_string()
    } else {
        language.trim().to_string()
    };

    let pt = language.to_lowercase().contains("portugu");
    let system = if kind.as_deref() == Some("class") {
        let (h_top, h_con, h_ex, h_hw, h_sum, none_word) = if pt {
            (
                "Tópicos abordados",
                "Conceitos-chave",
                "Exemplos e exercícios",
                "Tarefas e próximos passos",
                "Resumo",
                "Nenhum",
            )
        } else {
            (
                "Topics covered",
                "Key concepts",
                "Examples and exercises",
                "Homework and next steps",
                "Summary",
                "None",
            )
        };
        format!(
            "You are a precise study assistant. Analyze the class/lecture transcript and reply in {language} \
             using Markdown with exactly these sections:\n\
             ## {h_top}\n- Bullet list of the subjects taught, in the order they appeared (max 10).\n\
             ## {h_con}\n- Bullet list of important concepts, definitions, formulas or rules explained, each with a short explanation.\n\
             ## {h_ex}\n- Bullet list of examples, exercises or questions worked through (or '{none_word}' if there are none).\n\
             ## {h_hw}\n- Bullet list of assignments, deadlines, exams or material to study (or '{none_word}' if there are none).\n\
             ## {h_sum}\n- A concise paragraph summarizing the class (5-8 sentences).\n\
             Be factual, do not invent concepts, dates, numbers or assignments that are not in the transcript."
        )
    } else {
        let (h_key, h_dec, h_act, h_sum, none_word) = if pt {
            (
                "Pontos-chave",
                "Decisões",
                "Ações",
                "Resumo",
                "Nenhuma",
            )
        } else {
            (
                "Key points",
                "Decisions",
                "Action items",
                "Summary",
                "None",
            )
        };
        format!(
            "You are a precise meeting assistant. Analyze the meeting transcript and reply in {language} \
             using Markdown with exactly these sections:\n\
             ## {h_key}\n- Bullet list of the most important points discussed (max 10).\n\
             ## {h_dec}\n- Bullet list of decisions made (or '{none_word}' if there are none).\n\
             ## {h_act}\n- Bullet list with owner if mentioned, otherwise 'Unassigned'.\n\
             ## {h_sum}\n- A concise paragraph summarizing the meeting (5-8 sentences).\n\
             Be factual, do not invent names, numbers or commitments that are not in the transcript."
        )
    };

    let client = cf_client()?;
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/ai/run/{}",
        account_id.trim(),
        model
    );
    let body = serde_json::json!({
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": format!("{} transcript:\n\n{transcript}", if kind.as_deref() == Some("class") { "Class" } else { "Meeting" }) }
        ],
        // Workers AI defaults to a tiny output cap, which truncated the summary.
        "max_tokens": 2048
    });
    let resp = client
        .post(&url)
        .bearer_auth(api_token.trim())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Cloudflare request failed: {e}"))?;
    let status = resp.status();
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("invalid Cloudflare response: {e}"))?;
    if !status.is_success() {
        return Err(format!("Cloudflare error {status}: {json}"));
    }
    let markdown = json
        .pointer("/result/response")
        .and_then(|v| v.as_str())
        .or_else(|| json.pointer("/result/text").and_then(|v| v.as_str()))
        .or_else(|| json.pointer("/response").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();
    if markdown.trim().is_empty() {
        let raw = json.to_string();
        let snippet: String = raw.chars().take(300).collect();
        return Err(format!("empty summary (raw: {snippet})"));
    }
    // Link the summary directly to its audio via a .md sidecar (best effort).
    if let Some(fp) = file_path.as_ref().filter(|s| !s.trim().is_empty()) {
        let (_, md_p) = sidecar_paths(std::path::Path::new(fp));
        let _ = std::fs::write(md_p, &markdown);
    }
    Ok(SummarizeResult {
        markdown,
        model,
    })
}

// Keep a trivial command so the default template wiring stays valid.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Notula is ready.", name)
}

/// OS identifier for platform-specific UI ("windows", "linux", "macos", …).
#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's accelerated compositing makes every CSS animation flicker on
    // start (seen on Wayland + Intel). Respect an explicit user override.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        // SAFETY: runs first thing in the process, before any thread is spawned.
        unsafe { std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1") };
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(RecordingState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            greet,
            get_platform,
            list_audio_sources,
            start_recording,
            stop_recording,
            get_recording_status,
            list_recordings,
            delete_recording,
            rename_recording,
            get_task_artifacts,
            transcribe_audio,
            summarize_transcript
        ])
        .run(tauri::generate_context!())
        .expect("error while running Notula");
}
