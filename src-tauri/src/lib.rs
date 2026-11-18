mod lan;

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{io::Read, path::PathBuf, process::Command};

type Res<T> = Result<T, String>;

const VIDEO_EXT: &[&str] = &[
    "mkv", "mp4", "m4v", "avi", "mov", "wmv", "webm", "mpg", "mpeg", "ts", "m2ts", "flv", "ogv",
];
const MIN_BYTES: u64 = 20_000_000;

/// GUI apps on macOS don't inherit the shell PATH, so also check the usual brew dirs.
fn tool(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    std::env::split_paths(&path)
        .chain(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"].map(PathBuf::from))
        .map(|d| d.join(name))
        .find(|p| p.is_file())
}

fn need(name: &str) -> Res<PathBuf> {
    tool(name).ok_or_else(|| format!("{name} not found (brew install {name})"))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Res<T> + Send + 'static) -> Res<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

fn run(cmd: &mut Command) -> Res<Vec<u8>> {
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(out.stdout)
}

#[tauri::command]
fn tools() -> Value {
    json!({
        "ffmpeg": tool("ffmpeg").is_some(),
        "ffprobe": tool("ffprobe").is_some(),
        "ytdlp": tool("yt-dlp").is_some(),
    })
}

fn scan(dir: &str) -> Vec<String> {
    walkdir::WalkDir::new(dir)
        .follow_links(true)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && !e.file_name().to_string_lossy().starts_with('.'))
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .is_some_and(|x| VIDEO_EXT.contains(&x.to_ascii_lowercase().as_str()))
        })
        .filter(|e| e.metadata().map(|m| m.len() >= MIN_BYTES).unwrap_or(false))
        .map(|e| e.path().to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
async fn scan_dir(dir: String) -> Res<Vec<String>> {
    blocking(move || Ok(scan(&dir))).await
}

fn duration(path: &str) -> Res<f64> {
    let out = run(Command::new(need("ffprobe")?).args([
        "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path,
    ]))?;
    let text = String::from_utf8_lossy(&out);
    text.trim().parse().map_err(|_| format!("no duration for {path}"))
}

fn frame(path: &str, fraction: f64) -> Res<String> {
    let at = duration(path)? * fraction.clamp(0.0, 1.0);
    let jpeg = run(Command::new(need("ffmpeg")?).args([
        "-v", "error", "-ss", &format!("{at:.2}"), "-i", path, "-frames:v", "1",
        "-vf", "scale='min(1280,iw)':-2", "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "3", "-",
    ]))?;
    if jpeg.is_empty() {
        return Err(format!("no frame at {at:.0}s in {path}"));
    }
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(jpeg)))
}

#[tauri::command]
async fn grab_frame(path: String, fraction: f64) -> Res<String> {
    blocking(move || frame(&path, fraction)).await
}

/// Returns None for HTTP error statuses (e.g. a missing YouTube thumbnail).
fn get(url: &str) -> Res<Option<(String, Vec<u8>)>> {
    match ureq::get(url).call() {
        Ok(resp) => {
            let ct = resp.content_type().to_string();
            let mut buf = Vec::new();
            resp.into_reader()
                .take(20_000_000)
                .read_to_end(&mut buf)
                .map_err(|e| e.to_string())?;
            Ok(Some((ct, buf)))
        }
        Err(ureq::Error::Status(..)) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn fetch_image(url: String) -> Res<Option<String>> {
    blocking(move || {
        Ok(get(&url)?.map(|(ct, b)| format!("data:{ct};base64,{}", STANDARD.encode(b))))
    })
    .await
}

#[tauri::command]
async fn fetch_text(url: String) -> Res<Option<String>> {
    blocking(move || Ok(get(&url)?.map(|(_, b)| String::from_utf8_lossy(&b).into_owned()))).await
}

/// Flat playlist listing; private lists such as Liked (LL) need browser cookies.
#[tauri::command]
async fn yt_playlist(url: String, browser: Option<String>) -> Res<Vec<Value>> {
    blocking(move || {
        let mut cmd = Command::new(need("yt-dlp")?);
        cmd.args(["--flat-playlist", "-J", "--no-warnings"]);
        if let Some(b) = browser.filter(|b| !b.is_empty()) {
            cmd.args(["--cookies-from-browser", &b]);
        }
        let out = run(cmd.arg(&url))?;
        let doc: Value = serde_json::from_slice(&out).map_err(|e| e.to_string())?;
        let entries = doc["entries"].as_array().cloned().unwrap_or_default();
        Ok(entries
            .into_iter()
            .map(|e| {
                let channel = e["channel"].as_str().or(e["uploader"].as_str()).unwrap_or("");
                json!({ "id": e["id"], "title": e["title"], "channel": channel })
            })
            .collect())
    })
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run_app() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(lan::Lan::default())
        .invoke_handler(tauri::generate_handler![
            tools, scan_dir, grab_frame, fetch_image, fetch_text, yt_playlist,
            lan::lan_start, lan::lan_stop, lan::lan_send
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grabs_frame_from_generated_clip() {
        let dir = std::env::temp_dir().join("ftg-test");
        std::fs::create_dir_all(&dir).unwrap();
        let clip = dir.join("clip.mp4");
        let clip_s = clip.to_string_lossy().to_string();
        run(Command::new(need("ffmpeg").unwrap()).args([
            "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=5:size=640x360:rate=24",
            &clip_s,
        ]))
        .unwrap();
        assert!((duration(&clip_s).unwrap() - 5.0).abs() < 0.2);
        let url = frame(&clip_s, 0.5).unwrap();
        assert!(url.starts_with("data:image/jpeg;base64,") && url.len() > 1000);
    }
}
