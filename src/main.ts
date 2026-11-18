import "@fontsource/shrikhand/latin-400.css";
import "./style.css";
import "./mp/player.css";
import { netConn } from "./mp/conn";
import { hostParty } from "./mp/host";
import { runPlayer } from "./mp/player";
import { cleanCode } from "./mp/protocol";
import { app } from "./dom";
import { initMusic, setMood } from "./music";
import { startGame } from "./play";
import { showSetup } from "./setup";
import { startStudio } from "./studio";

try {
  startStudio();
} catch (e) {
  console.warn("studio background disabled:", e);
}

/** The game is laid out on a fixed 1280x800 stage that scales to fit the window. */
const STAGE_W = 1280;
const STAGE_H = 800;
const fit = (): void =>
  document.documentElement.style.setProperty("--k", String(Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H)));
addEventListener("resize", fit);
fit();

initMusic();
const menu = (): void => {
  setMood("lounge");
  void showSetup((lib, mode, diff) => startGame(lib, mode, diff, menu), {
    host: (lib, mode, diff) => void hostParty(lib, mode, diff, menu),
    join: (code) => runPlayer(netConn(cleanCode(code)), app(), menu),
  });
};
menu();
