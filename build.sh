#!/usr/bin/env bash
# Build fairy-stockfish-single: Fairy-Stockfish compiled to single-threaded
# WebAssembly, so it runs in any Web Worker without SharedArrayBuffer.
#
# Needs: git, and Emscripten's emcc on PATH (https://emscripten.org, tested
# with the version pinned in .github/workflows/build.yml).
# Output: dist/fairy-stockfish.js and dist/fairy-stockfish.wasm
#
#   ./build.sh                      # build the pinned upstream commit
#   FSF_COMMIT=<sha> ./build.sh     # try another upstream commit
set -euo pipefail

FSF_REPO="${FSF_REPO:-https://github.com/fairy-stockfish/Fairy-Stockfish}"
FSF_COMMIT="${FSF_COMMIT:-4e3d0147d5b8da1b780a29f0b3e1d24311d028fa}"

here="$(cd "$(dirname "$0")" && pwd)"
work="$here/.build"
rm -rf "$work"
mkdir -p "$work" "$here/dist"

git -C "$work" init -q fsf
git -C "$work/fsf" fetch -q --depth 1 "$FSF_REPO" "$FSF_COMMIT"
git -C "$work/fsf" checkout -q FETCH_HEAD
git -C "$work/fsf" apply "$here/patches/single-thread.patch"

cd "$work/fsf/src"

# The engine sources: Makefile_js's list (ffish.js) minus its bindings, plus main.cpp.
SRCS="main.cpp benchmark.cpp bitbase.cpp bitboard.cpp endgame.cpp evaluate.cpp
  material.cpp misc.cpp movegen.cpp movepick.cpp pawns.cpp position.cpp psqt.cpp
  search.cpp thread.cpp timeman.cpp tt.cpp uci.cpp ucioption.cpp tune.cpp syzygy/tbprobe.cpp
  nnue/evaluate_nnue.cpp nnue/features/half_ka_v2.cpp
  partner.cpp parser.cpp piece.cpp variant.cpp xboard.cpp
  nnue/features/half_ka_v2_variants.cpp"

# -DSINGLE_THREAD      the patch: search on the caller's stack, no std::thread
# -DLARGEBOARDS        boards up to 12x10 (grand, capablanca, xiangqi, shogi...)
# -DALLVARS            every built-in variant, including duck and amazons
# -DNNUE_EMBEDDING_OFF no network file is baked in; evaluation is classical
# STACK_SIZE=8MB       the search recurses deeply; Emscripten's default is 64 KB
# ENVIRONMENT          worker for browsers, node for the test in test/
emcc -O3 -std=c++17 -Wall \
  -DNDEBUG -DSINGLE_THREAD -DLARGEBOARDS -DPRECOMPUTED_MAGICS -DALLVARS -DNNUE_EMBEDDING_OFF \
  $SRCS \
  -s ENVIRONMENT=web,worker,node \
  -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=64MB -s MAXIMUM_MEMORY=1GB \
  -s STACK_SIZE=8MB \
  -s FORCE_FILESYSTEM=1 \
  -s EXPORTED_FUNCTIONS=_main,_fsf_command \
  -s EXPORTED_RUNTIME_METHODS=ccall,FS \
  --pre-js "$here/glue/pre.js" \
  -o "$here/dist/fairy-stockfish.js"

ls -la "$here/dist"
