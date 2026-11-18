import "@fontsource/shrikhand/latin-400.css";
import "./mp/player.css";
import { wsConn } from "./mp/conn";
import { runPlayer } from "./mp/player";
import { cleanCode } from "./mp/protocol";

const code = cleanCode(new URLSearchParams(location.search).get("code") ?? "");
runPlayer(wsConn(code), document.getElementById("player")!);
