// Plays the built engine through UCI in Node: standard chess, Gardner 5x5,
// a custom variant from an ini, and an unlimited "go" that must still end.
// Run after ./build.sh:   node test/uci.test.cjs
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const lines = [];
const waiters = [];
function onLine(line) {
  lines.push(line);
  for (const w of waiters.splice(0)) if (!w(line)) waiters.push(w);
}

// The build is a classic script that reads a global `Module`, so run it in
// this context rather than require() it.
globalThis.Module = { onLine };
globalThis.require = require;
globalThis.__dirname = path.join(__dirname, "..", "dist");
globalThis.__filename = path.join(globalThis.__dirname, "fairy-stockfish.js");
vm.runInThisContext(fs.readFileSync(globalThis.__filename, "utf8"), { filename: globalThis.__filename });

function ready() {
  return new Promise((resolve) => {
    const t = setInterval(() => Module.ready && (clearInterval(t), resolve()), 10);
  });
}
// Each "go" runs to the end inside the call, so the reply is already in `lines`.
function send(cmd) {
  const from = lines.length;
  Module.fsf(cmd);
  return lines.slice(from);
}
function bestmove(out) {
  const line = out.find((l) => l.startsWith("bestmove"));
  assert.ok(line, "no bestmove in:\n" + out.join("\n"));
  return line.split(" ")[1];
}

(async () => {
  await ready();
  assert.ok(send("uci").includes("uciok"), "uci handshake");
  assert.deepStrictEqual(send("isready"), ["readyok"]);

  send("position startpos moves e2e4 e7e5");
  console.log("chess:", bestmove(send("go depth 8")));

  send("setoption name UCI_Variant value gardner");
  send("position startpos");
  const g = bestmove(send("go movetime 300"));
  assert.match(g, /^[a-e][1-5][a-e][1-5]/, "a Gardner move stays on the 5x5 board");
  console.log("gardner:", g);

  send({
    variants: fs.readFileSync(path.join(__dirname, "..", "example", "pawnwars.ini"), "utf8"),
  });
  send("setoption name UCI_Variant value pawnwars");
  send("position fen 8/1P6/8/8/8/8/6p1/8 w - - 0 1");
  const pw = bestmove(send("go depth 4"));
  assert.match(pw, /^b7b8/, "White runs the b-pawn home and wins");
  console.log("pawnwars:", pw);

  const t0 = Date.now();
  const inf = send("go infinite");
  bestmove(inf);
  assert.ok(Date.now() - t0 < 5000, "an unlimited go ends on its own");
  console.log("go infinite ended in", Date.now() - t0, "ms");

  console.log("ok");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
