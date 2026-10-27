/** Use the classic, single-threaded engine worker directly. Public assets are copied by Vite. */
export function createStockfishWorker(): Worker {
  const script = new URL(`${import.meta.env.BASE_URL}stockfish/stockfish-nnue-16-single.js`, window.location.href);
  const wasm = new URL('stockfish-nnue-16-single.wasm', script);
  script.hash = encodeURIComponent(wasm.href);
  return new Worker(script.href);
}
