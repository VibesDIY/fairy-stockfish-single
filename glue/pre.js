// fairy-stockfish-single: the glue that makes the WebAssembly engine speak UCI.
//
// Emscripten pastes this file in front of its own output (--pre-js), so it
// runs first and sets up `Module` before the engine starts.
//
// In a Web Worker (the normal way to use it):
//   - every string the page posts is one or more UCI lines, run in order;
//   - every line the engine prints is posted back as a string;
//   - posting { variants: "<variants.ini text>" } loads custom variants;
//   - the .wasm file is fetched from the URL in the worker's #hash, if there
//     is one, else from next to this script.
//
// Outside a worker (Node tests), set Module.onLine before loading the script
// and call Module.fsf("go depth 5") once Module.ready is true.
//
// Copyright (C) 2026 Vibes DIY. GPL-3.0-or-later, like Fairy-Stockfish.

(function () {
  var isWorker =
    typeof WorkerGlobalScope !== "undefined" &&
    typeof self !== "undefined" &&
    self instanceof WorkerGlobalScope;

  // A blob: worker cannot find a .wasm "next to" itself, so the page passes
  // the .wasm address in the worker URL's #hash (the same contract as the
  // stockfish.js lite builds).
  var wasmFromHash = "";
  if (isWorker && self.location && self.location.hash) {
    wasmFromHash = decodeURIComponent(self.location.hash.slice(1));
  }
  var locate = Module.locateFile;
  Module.locateFile = function (path, prefix) {
    if (wasmFromHash && /\.wasm$/.test(path)) return wasmFromHash;
    return locate ? locate(path, prefix) : prefix + path;
  };

  function emit(line) {
    if (typeof Module.onLine === "function") Module.onLine(line);
    else if (isWorker) self.postMessage(line);
    else console.log(line);
  }
  Module.print = emit;
  Module.printErr = function (line) {
    emit("info string " + line);
  };

  var pending = [];
  Module.ready = false;

  function runLine(line) {
    Module.ccall("fsf_command", null, ["string"], [line]);
  }

  function handle(message) {
    if (message && typeof message === "object" && typeof message.variants === "string") {
      // Custom variants: write the ini text into the in-memory file system and
      // point the VariantPath option at it. The new variant names are then
      // valid values for "setoption name UCI_Variant value <name>".
      Module.FS.writeFile("/variants.ini", message.variants);
      runLine("setoption name VariantPath value /variants.ini");
      return;
    }
    String(message)
      .split("\n")
      .forEach(function (line) {
        line = line.trim();
        if (line) runLine(line);
      });
  }

  Module.fsf = function (message) {
    if (Module.ready) handle(message);
    else pending.push(message);
  };

  // postRun fires after main() has initialised the engine; only then is it
  // safe to send commands.
  Module.postRun = [].concat(Module.postRun || [], function () {
    Module.ready = true;
    pending.splice(0).forEach(handle);
  });

  if (isWorker) {
    self.onmessage = function (event) {
      Module.fsf(event.data);
    };
  }
})();
