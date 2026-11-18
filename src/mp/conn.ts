import { openRoom } from "./hub";
import { deviceId, parse, type ToHost, type ToPlayer } from "./protocol";

export type ConnState = "connecting" | "open" | "lost";

/** Player side of a transport. */
export type Conn = {
  send: (m: ToHost) => void;
  onMsg: (cb: (m: ToPlayer) => void) => void;
  onState: (cb: (s: ConnState) => void) => void;
  close: () => void;
};

function emitter<T>() {
  const cbs: ((v: T) => void)[] = [];
  return { on: (cb: (v: T) => void) => void cbs.push(cb), emit: (v: T) => cbs.forEach((cb) => cb(v)) };
}

/** Phone on the LAN: WebSocket back to the page's own server, reconnecting on drops. */
export function wsConn(code: string): Conn {
  const msgs = emitter<ToPlayer>();
  const states = emitter<ConnState>();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/ws?code=${encodeURIComponent(code)}&id=${deviceId()}`;
  let ws: WebSocket | null = null;
  let closed = false;
  let queue: string[] = [];
  const open = () => {
    states.emit("connecting");
    ws = new WebSocket(url);
    ws.onopen = () => {
      states.emit("open");
      queue.forEach((m) => ws!.send(m));
      queue = [];
    };
    ws.onmessage = (e) => {
      const m = parse<ToPlayer>(e.data);
      if (m) msgs.emit(m);
    };
    ws.onclose = () => {
      if (closed) return;
      states.emit("lost");
      setTimeout(open, 1500);
    };
  };
  open();
  return {
    send: (m) => {
      const s = JSON.stringify(m);
      if (ws?.readyState === WebSocket.OPEN) ws.send(s);
      else queue.push(s);
    },
    onMsg: msgs.on,
    onState: states.on,
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}

/** Online: whoever sends us a lobby message is the host; everything we send goes only to them. */
export function netConn(code: string): Conn {
  const msgs = emitter<ToPlayer>();
  const states = emitter<ConnState>();
  const room = openRoom(code);
  const action = room.makeAction<string>("msg");
  let host: string | null = null;
  let hello: string | null = null;
  states.emit("connecting");
  action.onMessage((data, { peerId }) => {
    const m = parse<ToPlayer>(data);
    if (!m) return;
    if (m.t === "lobby" && host !== peerId) {
      host = peerId;
      states.emit("open");
    }
    if (peerId === host) msgs.emit(m);
  });
  room.onPeerJoin(({ peerId }) => {
    if (hello) void action.send(hello, { target: peerId }).catch(() => {});
  });
  room.onPeerLeave(({ peerId }) => {
    if (peerId === host) {
      host = null;
      states.emit("lost");
    }
  });
  return {
    send: (m) => {
      const s = JSON.stringify(m);
      // Hello goes to every peer (we don't know the host yet) and again to anyone who joins later.
      if (m.t === "hello") {
        hello = s;
        void action.send(s).catch(() => {});
      } else if (host) void action.send(s, { target: host }).catch(() => {});
    },
    onMsg: msgs.on,
    onState: states.on,
    close: () => void room.leave(),
  };
}
