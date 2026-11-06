# fairy-stockfish-single

[Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish), the chess-variant engine, compiled to **single-threaded WebAssembly**. It runs in an ordinary Web Worker on any web page, with no special server headers.

It plays everything Fairy-Stockfish plays: standard chess, Chess960, atomic, crazyhouse, antichess, horde, three-check, King of the Hill, 5x5 Gardner and 6x6 Los Alamos minichess, shogi, xiangqi, and over a hundred more (121 built in). It also plays **variants you write yourself** in a few lines of ini, such as Pawn Wars ([example/pawnwars.ini](example/pawnwars.ini)).

We built it for [Vibes DIY](https://vibes.diy), where people make small web apps by describing them, so a chess club can ask for its own odd little game and get a computer opponent that knows the rules.

## Why single-threaded

The other WebAssembly builds of Fairy-Stockfish (for example `fairy-stockfish-nnue.wasm`) are multi-threaded. Threads in WebAssembly need `SharedArrayBuffer`, and browsers only allow that on pages that are *cross-origin isolated*: pages served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Those headers also block embedding most third-party content, such as maps, videos and images from other sites, and many hosts can't set them at all.

This build uses one thread, so it needs none of that. The cost is speed: one core instead of several. For a game against people that is plenty, and the `Skill Level` option turns it down further.

## Use it

The engine speaks [UCI](https://backscattering.de/chess/uci/) over `postMessage`. You post strings to it, and it posts strings back.

Files are served by jsDelivr straight from this repo. Pin a tag or commit in place of `main` for anything you publish:

```
https://cdn.jsdelivr.net/gh/VibesDIY/fairy-stockfish-single@main/dist/fairy-stockfish.js
https://cdn.jsdelivr.net/gh/VibesDIY/fairy-stockfish-single@main/dist/fairy-stockfish.wasm
```

A Worker has to come from your page's own origin, so start a small blob worker that loads the engine, and pass the `.wasm` address in the worker URL's `#hash`. The engine looks there first.

```js
const FSF = "https://cdn.jsdelivr.net/gh/VibesDIY/fairy-stockfish-single@main/dist/fairy-stockfish";
const boot = URL.createObjectURL(
  new Blob([`importScripts("${FSF}.js");`], { type: "application/javascript" })
);
const engine = new Worker(`${boot}#${encodeURIComponent(FSF + ".wasm")}`);

engine.onmessage = (e) => {
  if (e.data.startsWith("bestmove")) console.log("engine plays", e.data.split(" ")[1]);
};

engine.postMessage("uci");
engine.postMessage("setoption name UCI_Variant value gardner");   // 5x5 minichess
engine.postMessage("position fen rnbqk/ppppp/5/PPPPP/RNBQK w - - 0 1");
engine.postMessage("go movetime 500");
```

[example/engine.js](example/engine.js) wraps this in a promise: `await engine.bestMove(fen, "movetime 500")`.

### Your own variants

Post an object with the text of a [variants.ini](https://github.com/fairy-stockfish/Fairy-Stockfish/blob/master/src/variants.ini) (that file documents every rule you can set). The engine writes it to its in-memory file system and loads it. Each section becomes a variant name you can select.

```js
engine.postMessage({ variants: `
[pawnwars:chess]
startFen = 8/pppppppp/8/8/8/8/PPPPPPPP/8 w - - 0 1
king = -
castling = false
extinctionValue = loss
extinctionPieceTypes = *
flagPiece = p
flagRegionWhite = *8
flagRegionBlack = *1
promotionPieceTypes = q
` });
engine.postMessage("setoption name UCI_Variant value pawnwars");
engine.postMessage("position startpos");
engine.postMessage("go depth 8");
```

For legal moves, check, game end and FEN in your user interface, use [ffish.js](https://www.npmjs.com/package/ffish-es6). It is the same Fairy-Stockfish rules code as a library, and it is already single-threaded. Load the same ini into it with `ffish.loadVariantConfig(text)` so the board and the engine agree.

### Differences from desktop Fairy-Stockfish

- **Every `go` needs a limit.** The search runs on the worker's only thread, so a `stop` sent mid-search waits until the search is over. Use `movetime`, `depth`, `nodes` or a clock (`wtime`/`btime`). A `go` with no limit (including `go infinite`) searches for 2 seconds and says so in an `info string`. `go ponder` is searched as a normal limited search.
- **Evaluation is classical by default.** No neural network file ships with the build. `Use NNUE` defaults to false, and the classical evaluation covers every variant. It is still far stronger than any club player.
- **`Threads` stays at 1.** Setting it higher has no effect.
- To stop a search early, `worker.terminate()` and start a new worker. Loading takes well under a second once the files are cached.

## Build it

The build applies [patches/single-thread.patch](patches/single-thread.patch) to a pinned Fairy-Stockfish commit and compiles it with [Emscripten](https://emscripten.org):

```sh
./build.sh                        # needs git and emcc on PATH
node test/uci.test.cjs            # plays chess, Gardner, Pawn Wars and an unlimited go
```

`FSF_COMMIT=<sha> ./build.sh` builds a different upstream commit. The patch is small and every change sits behind `#ifdef SINGLE_THREAD`, so it should apply to newer commits with little or no work.

What the patch does:

| File | Change |
| --- | --- |
| `thread_win32_osx.h` | `NativeThread` becomes an empty class, so no OS thread is created |
| `thread.cpp` | `start_searching()` runs the search on the caller's stack and returns when it ends |
| `tt.cpp` | `clear()` zeroes the hash table on the calling thread instead of starting helper threads |
| `search.cpp` | skips the busy-wait for a `stop` that can never arrive during a search |
| `uci.cpp` | keeps the position between calls, runs one command per call, and limits an open-ended `go` to 2 s |
| `main.cpp` | exports `fsf_command(line)`, the WebAssembly entry point, and leaves the engine running after `main()` |
| `ucioption.cpp` | `Use NNUE` defaults to false |

[glue/pre.js](glue/pre.js) is the JavaScript that turns `postMessage` into `fsf_command` calls and engine output into `postMessage`.

GitHub Actions ([.github/workflows/build.yml](.github/workflows/build.yml)) builds with a pinned Emscripten on every push, runs the test, and commits `dist/` back to `main` when it changes.

## License

GPL-3.0-or-later, the same as Fairy-Stockfish and Stockfish ([LICENSE](LICENSE)). This repo is the corresponding source for the files in `dist/`: the upstream commit pinned in `build.sh`, the patch, the glue and the build script.

The engine runs in its own Worker and talks to your page only through UCI text messages, the same way a desktop engine runs as its own program next to a chess GUI.

Fairy-Stockfish is by Fabian Fichter and contributors, building on Stockfish by the Stockfish developers. This build is by [Vibes DIY](https://vibes.diy). Please send bugs in the engine itself upstream, and bugs in this build here.
