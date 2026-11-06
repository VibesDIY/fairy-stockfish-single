// A small promise wrapper around fairy-stockfish-single, for any web page.
//
//   import { createEngine } from "./engine.js";
//   const engine = createEngine({ variant: "gardner" });
//   const move = await engine.bestMove("rnbqk/ppppp/5/PPPPP/RNBQK w - - 0 1", "movetime 500");
//   engine.quit();
//
// Pin the URL to a tag or commit of this repo so an engine update never
// changes a published app under its players.
const FSF = "https://cdn.jsdelivr.net/gh/VibesDIY/fairy-stockfish-single@main/dist/fairy-stockfish";

export function createEngine({ variant = "chess", variantsIni, skill } = {}) {
  // A Worker must come from the page's own origin, so a blob worker
  // importScripts the engine, and the .wasm address rides in the #hash.
  const boot = URL.createObjectURL(
    new Blob([`importScripts(${JSON.stringify(`${FSF}.js`)});`], { type: "application/javascript" })
  );
  const worker = new Worker(`${boot}#${encodeURIComponent(`${FSF}.wasm`)}`);

  let waiting = null; // { resolve, reject } for the "go" in flight
  worker.onmessage = (e) => {
    const line = String(e.data);
    if (line.startsWith("bestmove") && waiting) {
      const move = line.split(" ")[1];
      waiting.resolve(move === "(none)" ? null : move);
      waiting = null;
    }
  };
  worker.onerror = (e) => {
    if (waiting) waiting.reject(new Error(e.message || "engine failed to load"));
    waiting = null;
  };

  worker.postMessage("uci");
  if (variantsIni) worker.postMessage({ variants: variantsIni });
  worker.postMessage(`setoption name UCI_Variant value ${variant}`);
  if (skill != null) worker.postMessage(`setoption name Skill Level value ${skill}`);

  return {
    // fen: the position to move from; go: the search limit, e.g. "movetime 500" or "depth 8".
    bestMove(fen, go = "movetime 500") {
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject };
        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go ${go}`);
      });
    },
    quit() {
      worker.terminate();
      URL.revokeObjectURL(boot);
    },
  };
}
