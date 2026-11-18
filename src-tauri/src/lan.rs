//! LAN party server: serves the phone player page and relays WebSocket messages
//! between phones and the host webview. Every request needs the game code.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, HeaderMap, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot};

type Clients = Arc<Mutex<HashMap<String, (u64, mpsc::UnboundedSender<String>)>>>;

#[derive(Default)]
pub struct Lan(Mutex<Option<Running>>);

struct Running {
    clients: Clients,
    stop: oneshot::Sender<()>,
}

#[derive(Clone)]
struct Ctx {
    app: AppHandle,
    code: String,
    clients: Clients,
    serial: Arc<AtomicU64>,
}

#[derive(Serialize, Clone)]
struct LanMsg {
    from: String,
    msg: String,
}

const COOKIE: &str = "ftg_code";

fn authorised(ctx: &Ctx, query: &HashMap<String, String>, headers: &HeaderMap) -> bool {
    if query.get("code").is_some_and(|c| c.eq_ignore_ascii_case(&ctx.code)) {
        return true;
    }
    let cookie = headers.get(header::COOKIE).and_then(|v| v.to_str().ok()).unwrap_or("");
    cookie.split(';').any(|kv| kv.trim() == format!("{COOKIE}={}", ctx.code))
}

fn stop_running(state: &Lan) {
    if let Some(r) = state.0.lock().unwrap().take() {
        r.clients.lock().unwrap().clear();
        let _ = r.stop.send(());
    }
}

/// Starts the server and returns the join URL (with the code) for the QR code.
#[tauri::command]
pub async fn lan_start(app: AppHandle, state: tauri::State<'_, Lan>, code: String, port: u16) -> Result<String, String> {
    stop_running(&state);
    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(l) => l,
        Err(_) => tokio::net::TcpListener::bind(("0.0.0.0", 0)).await.map_err(|e| e.to_string())?,
    };
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let ip = local_ip_address::local_ip().map_err(|e| format!("no LAN address: {e}"))?;
    let clients: Clients = Arc::default();
    let ctx = Ctx { app, code: code.to_uppercase(), clients: clients.clone(), serial: Arc::default() };
    let router = Router::new()
        .route("/ws", get(ws_handler))
        .fallback(get(static_handler))
        .with_state(ctx);
    let (stop, stopped) = oneshot::channel();
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = stopped.await;
            })
            .await;
    });
    *state.0.lock().unwrap() = Some(Running { clients, stop });
    Ok(format!("http://{ip}:{port}/player.html?code={}", code.to_uppercase()))
}

#[tauri::command]
pub fn lan_stop(state: tauri::State<'_, Lan>) {
    stop_running(&state);
}

/// Sends to one phone, or to all of them when `to` is None.
#[tauri::command]
pub fn lan_send(state: tauri::State<'_, Lan>, to: Option<String>, msg: String) {
    let guard = state.0.lock().unwrap();
    let Some(running) = guard.as_ref() else { return };
    let clients = running.clients.lock().unwrap();
    match to {
        Some(id) => {
            if let Some((_, tx)) = clients.get(&id) {
                let _ = tx.send(msg);
            }
        }
        None => clients.values().for_each(|(_, tx)| {
            let _ = tx.send(msg.clone());
        }),
    }
}

async fn ws_handler(
    State(ctx): State<Ctx>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if !authorised(&ctx, &query, &headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let id: String = query.get("id").map(String::as_str).unwrap_or("").chars().filter(|c| c.is_ascii_alphanumeric()).take(32).collect();
    if id.is_empty() {
        return StatusCode::BAD_REQUEST.into_response();
    }
    ws.max_message_size(64 * 1024).on_upgrade(move |socket| client(socket, ctx, id))
}

async fn client(socket: WebSocket, ctx: Ctx, id: String) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let serial = ctx.serial.fetch_add(1, Ordering::Relaxed);
    ctx.clients.lock().unwrap().insert(id.clone(), (serial, tx));
    let _ = ctx.app.emit("lan://join", &id);
    let writer = tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            if sink.send(Message::Text(m.into())).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });
    while let Some(Ok(msg)) = stream.next().await {
        match msg {
            Message::Text(t) => {
                let _ = ctx.app.emit("lan://msg", LanMsg { from: id.clone(), msg: t.to_string() });
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    writer.abort();
    // A reconnect may already have replaced this socket; only the newest one reports leaving.
    let mine = {
        let mut clients = ctx.clients.lock().unwrap();
        let mine = clients.get(&id).is_some_and(|(s, _)| *s == serial);
        if mine {
            clients.remove(&id);
        }
        mine
    };
    if mine {
        let _ = ctx.app.emit("lan://leave", &id);
    }
}

async fn static_handler(
    State(ctx): State<Ctx>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
    uri: Uri,
) -> Response {
    if !authorised(&ctx, &query, &headers) {
        return (StatusCode::FORBIDDEN, "Scan the QR code on the host screen to join.").into_response();
    }
    let path = match uri.path() {
        "/" => "/player.html",
        p => p,
    };
    let set_cookie = format!("{COOKIE}={}; Path=/; SameSite=Strict", ctx.code);
    let (mime, bytes) = if tauri::is_dev() {
        match dev_fetch(&ctx, uri.path_and_query().map(|p| p.as_str()).unwrap_or(path)).await {
            Some(r) => r,
            None => return StatusCode::NOT_FOUND.into_response(),
        }
    } else {
        match ctx.app.asset_resolver().get(path.to_string()) {
            Some(a) => (a.mime_type, a.bytes),
            None => return StatusCode::NOT_FOUND.into_response(),
        }
    };
    ([(header::CONTENT_TYPE, mime), (header::SET_COOKIE, set_cookie)], bytes).into_response()
}

/// In dev the frontend isn't embedded, so proxy the Vite dev server.
async fn dev_fetch(ctx: &Ctx, path_and_query: &str) -> Option<(String, Vec<u8>)> {
    let base = ctx.app.config().build.dev_url.clone()?;
    let url = format!("{}{}", base.as_str().trim_end_matches('/'), path_and_query);
    tauri::async_runtime::spawn_blocking(move || {
        let resp = ureq::get(&url).call().ok()?;
        let mime = resp.content_type().to_string();
        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut resp.into_reader(), &mut buf).ok()?;
        Some((mime, buf))
    })
    .await
    .ok()
    .flatten()
}
