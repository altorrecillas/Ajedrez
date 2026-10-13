/*
 * Puente hacia Stockfish real (compilado a WASM, un solo hilo — no necesita cabeceras
 * especiales del servidor, funciona en cualquier hosting estatico como GitHub Pages).
 * Motor: https://github.com/nmrugg/stockfish.js (GPLv3), basado en Stockfish oficial.
 * Si por lo que sea no carga (navegador sin WASM, fallo de red la primera vez, etc.),
 * StockfishEngine.init() resuelve a false y app.js recurre a la IA propia (js/ai.js) como reserva.
 */
(function (root) {
  'use strict';

  var ENGINE_URL = 'js/vendor/stockfish/stockfish-19-lite-single.js';
  var INIT_TIMEOUT_MS = 7000;

  var worker = null;
  var ready = false;
  var failed = false;
  var readyPromise = null;
  var pending = null;
  var requestToken = 0;
  var lastElo = null, lastSkill = null;

  function handleLine(line) {
    if (line.indexOf('bestmove') === 0 && pending) {
      var parts = line.split(' ');
      var uci = parts[1];
      var p = pending;
      pending = null;
      p.resolve(uci && uci !== '(none)' ? uci : null);
    }
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(function (resolve) {
      var settled = false;
      var phase = 'uci';
      var timeoutId = setTimeout(function () {
        if (settled) return;
        settled = true; failed = true; resolve(false);
      }, INIT_TIMEOUT_MS);

      try {
        worker = new Worker(ENGINE_URL);
      } catch (e) {
        clearTimeout(timeoutId);
        failed = true; resolve(false);
        return;
      }

      worker.onerror = function () {
        if (settled) return;
        settled = true; clearTimeout(timeoutId); failed = true; resolve(false);
      };

      worker.onmessage = function (e) {
        var line = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || '';
        if (phase === 'uci' && line === 'uciok') { phase = 'ready'; worker.postMessage('isready'); return; }
        if (phase === 'ready' && line === 'readyok') {
          phase = 'done';
          settled = true; clearTimeout(timeoutId);
          ready = true;
          resolve(true);
          return;
        }
        handleLine(line);
      };
      worker.postMessage('uci');
    });
    return readyPromise;
  }

  function newGame() {
    if (worker && ready) worker.postMessage('ucinewgame');
  }

  function applyStrength(opts) {
    var elo = opts && opts.elo;
    var skill = (opts && opts.skill != null) ? opts.skill : 20;
    if (elo !== lastElo) {
      worker.postMessage('setoption name UCI_LimitStrength value ' + (elo ? 'true' : 'false'));
      if (elo) worker.postMessage('setoption name UCI_Elo value ' + elo);
      lastElo = elo;
    }
    if (skill !== lastSkill) {
      worker.postMessage('setoption name Skill Level value ' + skill);
      lastSkill = skill;
    }
  }

  function getMove(fen, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!ready || failed) { resolve(null); return; }
      requestToken++;
      var token = requestToken;
      pending = {
        resolve: function (uci) { resolve(token === requestToken ? uci : null); }
      };
      applyStrength(opts);
      worker.postMessage('position fen ' + fen);
      worker.postMessage('go movetime ' + (opts.movetime || 1000));
    });
  }

  function abort() {
    requestToken++;
    pending = null;
    if (worker && ready) { try { worker.postMessage('stop'); } catch (e) { /* ignorado */ } }
  }

  root.StockfishEngine = {
    init: init,
    newGame: newGame,
    getMove: getMove,
    abort: abort,
    isReady: function () { return ready; },
    hasFailed: function () { return failed; }
  };
})(typeof window !== 'undefined' ? window : this);
