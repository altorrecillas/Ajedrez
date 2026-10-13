/* Web Worker: ejecuta la busqueda de la IA fuera del hilo principal para no bloquear la UI en movil. */
importScripts('engine.js', 'ai.js');

self.onmessage = function (e) {
  var data = e.data || {};
  var result = ChessAI.findBestMove(data.fen, { timeLimitMs: data.timeLimitMs, maxDepth: data.maxDepth });
  self.postMessage({ requestId: data.requestId, result: result });
};
