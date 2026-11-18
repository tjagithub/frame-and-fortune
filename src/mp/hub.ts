import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { joinRoom, type Room } from "trystero";
import { APP_ID, parse, type ToHost, type ToPlayer } from "./protocol";

/** Host side of all transports; player ids are prefixed "lan:" or "net:". */
export type Hub = {
  send: (to: string | null, m: ToPlayer) => void;
  stop: () => void;
};

export type HubEvents = {
  msg: (from: string, m: ToHost) => void;
  join: (id: string) => void;
  leave: (id: string) => void;
};

export const LAN_PORT = 7777;

export async function lanHub(code: string, ev: HubEvents): Promise<{ hub: Hub; url: string }> {
  const url = await invoke<string>("lan_start", { code, port: LAN_PORT });
  const un: UnlistenFn[] = await Promise.all([
    listen<{ from: string; msg: string }>("lan://msg", (e) => {
      const m = parse<ToHost>(e.payload.msg);
      if (m) ev.msg(`lan:${e.payload.from}`, m);
    }),
    listen<string>("lan://join", (e) => ev.join(`lan:${e.payload}`)),
    listen<string>("lan://leave", (e) => ev.leave(`lan:${e.payload}`)),
  ]);
  const hub: Hub = {
    send: (to, m) => void invoke("lan_send", { to: to ? to.replace(/^lan:/, "") : null, msg: JSON.stringify(m) }),
    stop: () => {
      un.forEach((u) => u());
      void invoke("lan_stop");
    },
  };
  return { hub, url };
}

/** Joins the room only people with the code can find: it names the room and encrypts discovery. */
export function openRoom(code: string): Room {
  return joinRoom({ appId: APP_ID, password: `ftg:${code}` }, `ftg-${code}`);
}

/** Players are keyed by their persistent trystero userId; sends go to their current peerId. */
export function netHub(code: string, ev: HubEvents): Hub {
  const room = openRoom(code);
  const msg = room.makeAction<string>("msg");
  const peerOf = new Map<string, string>();
  room.onPeerJoin(({ peerId, userId }) => {
    peerOf.set(userId, peerId);
    ev.join(`net:${userId}`);
  });
  room.onPeerLeave(({ peerId, userId }) => {
    if (peerOf.get(userId) !== peerId) return;
    peerOf.delete(userId);
    ev.leave(`net:${userId}`);
  });
  msg.onMessage((data, { peerId, userId }) => {
    peerOf.set(userId, peerId);
    const m = parse<ToHost>(data);
    if (m) ev.msg(`net:${userId}`, m);
  });
  return {
    send: (to, m) => {
      const target = to ? peerOf.get(to.replace(/^net:/, "")) : null;
      if (to && !target) return;
      void msg.send(JSON.stringify(m), { target }).catch(() => {});
    },
    stop: () => void room.leave(),
  };
}

/** Routes each send to the transport that owns the player id. */
export function combine(hubs: Hub[]): Hub {
  const owner = (id: string) => hubs[id.startsWith("lan:") ? 0 : 1];
  return {
    send: (to, m) => (to ? owner(to)?.send(to, m) : hubs.forEach((h) => h.send(null, m))),
    stop: () => hubs.forEach((h) => h.stop()),
  };
}
