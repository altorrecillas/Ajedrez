/* Controlador de la interfaz: tablero, interacción táctil/ratón, IA (worker), sonido, persistencia. */
(function () {
  'use strict';

  var engine = new ChessEngine();
  var flipped = false;
  var selected = null;
  var legalTargets = [];
  var dragState = null;
  var pendingPromotion = null;
  var mode = 'ai';
  var difficulty = 'medium';
  var soundOn = true;
  var aiThinking = false;
  var gameOverShown = false;
  var requestCounter = 0;
  var worker = null;
  var audioCtx = null;
  var positionHistory = [ChessEngine.START_FEN]; // FEN tras cada jugada; indice 0 = posicion inicial
  var viewIndex = null; // null = posicion en vivo; numero = revisando positionHistory[viewIndex]
  var focusSquare = 'e2'; // casilla con foco de teclado (navegacion accesible)
  var boardHadFocus = false;
  var toastTimer = null;

  // timeLimitMs/maxDepth los usa la IA propia (reserva); elo/skill/movetime los usa Stockfish real.
  var DIFFICULTY_PRESETS = {
    easy: { timeLimitMs: 400, maxDepth: 2, elo: 1320, skill: 1, movetime: 500 },
    medium: { timeLimitMs: 1200, maxDepth: 4, elo: 1900, skill: 8, movetime: 1200 },
    hard: { timeLimitMs: 2500, maxDepth: 6, elo: 2600, skill: 16, movetime: 2200 },
    maximum: { timeLimitMs: 2500, maxDepth: 6, elo: null, skill: 20, movetime: 3000 }
  };
  var TIME_CONTROLS = {
    none: null,
    '1+0': { initial: 60000, increment: 0 },
    '1+1': { initial: 60000, increment: 1000 },
    '3+0': { initial: 180000, increment: 0 },
    '3+2': { initial: 180000, increment: 2000 },
    '5+0': { initial: 300000, increment: 0 },
    '10+0': { initial: 600000, increment: 0 },
    '10+5': { initial: 600000, increment: 5000 },
    '15+10': { initial: 900000, increment: 10000 },
    '30+0': { initial: 1800000, increment: 0 }
  };
  var timeControlKey = 'none';
  var clocks = { w: 0, b: 0 };
  var lastTick = Date.now();

  var CAPTURE_ORDER = ['q', 'r', 'b', 'n', 'p'];
  var PROMO_ORDER = ['q', 'r', 'b', 'n'];
  var STORAGE_KEY = 'ajedrez.partida.v1';
  var SETTINGS_KEY = 'ajedrez.ajustes.v1';

  var el = {
    board: document.getElementById('board'),
    coordFiles: document.getElementById('coordFiles'),
    coordRanks: document.getElementById('coordRanks'),
    turnText: document.getElementById('turnText'),
    turnDot: document.getElementById('turnDot'),
    aiThinking: document.getElementById('aiThinking'),
    capturedByWhite: document.getElementById('capturedByWhite'),
    capturedByBlack: document.getElementById('capturedByBlack'),
    materialDiff: document.getElementById('materialDiff'),
    moveList: document.getElementById('moveList'),
    btnNew: document.getElementById('btnNew'),
    btnUndo: document.getElementById('btnUndo'),
    btnFlip: document.getElementById('btnFlip'),
    modeSwitch: document.getElementById('modeSwitch'),
    difficultyRow: document.getElementById('difficultyRow'),
    difficulty: document.getElementById('difficulty'),
    promoOverlay: document.getElementById('promoOverlay'),
    promoChoices: document.getElementById('promoChoices'),
    gameOverOverlay: document.getElementById('gameOverOverlay'),
    gameOverModal: document.querySelector('#gameOverOverlay .modal'),
    gameOverTitle: document.getElementById('gameOverTitle'),
    gameOverSubtitle: document.getElementById('gameOverSubtitle'),
    btnRematch: document.getElementById('btnRematch'),
    btnCloseGameOver: document.getElementById('btnCloseGameOver'),
    btnMenu: document.getElementById('btnMenu'),
    menuOverlay: document.getElementById('menuOverlay'),
    menuSound: document.getElementById('menuSound'),
    menuTheme: document.getElementById('menuTheme'),
    btnMenuClose: document.getElementById('btnMenuClose'),
    brandMark: document.querySelector('.brand-mark'),
    themeMeta: document.querySelector('meta[name="theme-color"]'),
    ariaStatus: document.getElementById('ariaStatus'),
    toast: document.getElementById('toast'),
    splash: document.getElementById('splash'),
    reviewBanner: document.getElementById('reviewBanner'),
    reviewText: document.getElementById('reviewText'),
    btnExitReview: document.getElementById('btnExitReview'),
    btnDrawOffer: document.getElementById('btnDrawOffer'),
    btnResign: document.getElementById('btnResign'),
    btnPosition: document.getElementById('btnPosition'),
    positionOverlay: document.getElementById('positionOverlay'),
    fenOutput: document.getElementById('fenOutput'),
    pgnOutput: document.getElementById('pgnOutput'),
    btnCopyFen: document.getElementById('btnCopyFen'),
    btnCopyPgn: document.getElementById('btnCopyPgn'),
    fenInput: document.getElementById('fenInput'),
    pgnInput: document.getElementById('pgnInput'),
    btnLoadFen: document.getElementById('btnLoadFen'),
    btnLoadPgn: document.getElementById('btnLoadPgn'),
    btnPositionClose: document.getElementById('btnPositionClose'),
    btnDownloadGame: document.getElementById('btnDownloadGame'),
    btnUploadGame: document.getElementById('btnUploadGame'),
    uploadGameInput: document.getElementById('uploadGameInput'),
    clocksRow: document.getElementById('clocksRow'),
    clockWhite: document.getElementById('clockWhite'),
    clockBlack: document.getElementById('clockBlack'),
    clockWhiteTime: document.getElementById('clockWhiteTime'),
    clockBlackTime: document.getElementById('clockBlackTime'),
    timeControl: document.getElementById('timeControl'),
    timeControlHint: document.getElementById('timeControlHint')
  };

  function announce(msg) { if (el.ariaStatus) el.ariaStatus.textContent = msg; }
  function showToast(msg, ms) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, ms || 2200);
  }

  // ---------------- Persistencia ----------------
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        mode: mode, difficulty: difficulty, soundOn: soundOn,
        theme: document.documentElement.getAttribute('data-theme'), flipped: flipped,
        timeControlKey: timeControlKey
      }));
    } catch (e) { /* almacenamiento no disponible: se ignora */ }
  }
  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s.mode) mode = s.mode;
      if (s.difficulty) difficulty = s.difficulty;
      if (typeof s.soundOn === 'boolean') soundOn = s.soundOn;
      if (typeof s.flipped === 'boolean') flipped = s.flipped;
      if (s.timeControlKey && TIME_CONTROLS[s.timeControlKey] !== undefined) timeControlKey = s.timeControlKey;
    } catch (e) { /* ignorado */ }
  }
  function getStoredTheme() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return null;
      return JSON.parse(raw).theme || null;
    } catch (e) { return null; }
  }
  function saveGame() {
    try {
      var moves = engine.history.map(function (h) { return { from: h.from, to: h.to, promotion: h.promotion }; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        moves: moves, timeControlKey: timeControlKey, clocks: { w: clocks.w, b: clocks.b }
      }));
    } catch (e) { /* ignorado */ }
  }
  function loadGame() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data.moves || !data.moves.length) return;
      var fresh = new ChessEngine();
      for (var i = 0; i < data.moves.length; i++) {
        var m = data.moves[i];
        var rec = fresh.makeMove(m.from, m.to, m.promotion);
        if (!rec) return;
      }
      engine = fresh;
      rebuildPositionHistory();
      if (data.timeControlKey && TIME_CONTROLS[data.timeControlKey] !== undefined && data.clocks) {
        timeControlKey = data.timeControlKey;
        clocks = { w: data.clocks.w, b: data.clocks.b };
        lastTick = Date.now();
      }
    } catch (e) { /* partida guardada corrupta: se ignora y se empieza de nuevo */ }
  }
  function clearSavedGame() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignorado */ } }

  // ---------------- Tema ----------------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (el.themeMeta) el.themeMeta.setAttribute('content', theme === 'light' ? '#f2efe8' : '#10141a');
    el.menuTheme.checked = theme === 'dark';
  }
  function initTheme() {
    var stored = getStoredTheme();
    var theme = stored || ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark');
    applyTheme(theme);
  }

  // ---------------- Sonido (sintetizado, sin assets externos) ----------------
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }
  function beep(freq, duration, type, gainPeak) {
    if (!soundOn) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var t0 = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.18, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }
  function playMoveSound(rec, status) {
    if (status.result === 'checkmate') {
      beep(196, 0.28, 'sawtooth', 0.16);
      setTimeout(function () { beep(146, 0.32, 'sawtooth', 0.14); }, 90);
      return;
    }
    if (rec.castle) {
      beep(320, 0.08, 'triangle', 0.14);
      setTimeout(function () { beep(440, 0.09, 'triangle', 0.14); }, 70);
      return;
    }
    if (rec.captured) { beep(190, 0.12, 'square', 0.2); return; }
    if (status.inCheck) { beep(880, 0.1, 'triangle', 0.16); return; }
    beep(560, 0.06, 'sine', 0.13);
  }
  function updateSoundUI() {
    el.menuSound.checked = soundOn;
  }

  // ---------------- Reloj ----------------
  function resetClocks(tcKey) {
    var tc = TIME_CONTROLS[tcKey];
    clocks = tc ? { w: tc.initial, b: tc.initial } : { w: 0, b: 0 };
    lastTick = Date.now();
  }

  function formatClock(ms) {
    var totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function renderClocks() {
    if (timeControlKey === 'none') { el.clocksRow.hidden = true; return; }
    el.clocksRow.hidden = false;
    el.clockWhiteTime.textContent = formatClock(clocks.w);
    el.clockBlackTime.textContent = formatClock(clocks.b);
    var liveTurn = !isReviewing() && !gameOverShown ? engine.turn : null;
    el.clockWhite.classList.toggle('active', liveTurn === 'w');
    el.clockBlack.classList.toggle('active', liveTurn === 'b');
    el.clockWhite.classList.toggle('low-time', clocks.w <= 20000);
    el.clockBlack.classList.toggle('low-time', clocks.b <= 20000);
  }

  function handleFlagFall(color) {
    var drawn = engine._insufficientMaterial();
    if (drawn) {
      finishGameManually('Tablas', 'Se acabó el tiempo, pero no hay material suficiente para dar mate');
    } else {
      var winner = color === 'w' ? 'negras' : 'blancas';
      finishGameManually('Tiempo agotado', 'Ganan las ' + winner);
    }
  }

  function tickClock() {
    if (timeControlKey === 'none' || gameOverShown) { lastTick = Date.now(); return; }
    var now = Date.now();
    if (!isReviewing()) {
      var elapsed = now - lastTick;
      var turn = engine.turn;
      clocks[turn] = Math.max(0, clocks[turn] - elapsed);
      if (clocks[turn] <= 0) {
        lastTick = now;
        renderClocks();
        handleFlagFall(turn);
        return;
      }
    }
    lastTick = now;
    renderClocks();
  }
  setInterval(tickClock, 250);

  el.timeControl.addEventListener('change', function () {
    timeControlKey = el.timeControl.value;
    if (engine.history.length) {
      el.timeControlHint.hidden = false; // la partida en curso sigue con su reloj hasta la proxima partida nueva
    } else {
      resetClocks(timeControlKey); // aun no ha empezado a jugarse: se puede aplicar ya
      renderClocks();
    }
    saveSettings();
  });

  // ---------------- Render del tablero ----------------
  function displayCoord(dr, dc) {
    var r = flipped ? 7 - dr : dr;
    var c = flipped ? 7 - dc : dc;
    return { r: r, c: c };
  }

  function renderCoords() {
    el.coordFiles.innerHTML = '';
    el.coordRanks.innerHTML = '';
    var files = 'abcdefgh'.split('');
    var ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    if (flipped) { files = files.slice().reverse(); ranks = ranks.slice().reverse(); }
    files.forEach(function (f) { var s = document.createElement('span'); s.textContent = f; el.coordFiles.appendChild(s); });
    ranks.forEach(function (r) { var s = document.createElement('span'); s.textContent = r; el.coordRanks.appendChild(s); });
  }

  function isReviewing() { return viewIndex !== null; }

  function displayEngine() {
    if (!isReviewing()) return engine;
    return new ChessEngine(positionHistory[viewIndex]);
  }

  function renderBoard(animateEntrance) {
    var hadFocus = boardHadFocus; // innerHTML='' dispara blur/focusout sincrono y pone boardHadFocus a false
    el.board.innerHTML = '';
    var dEngine = displayEngine();
    var status = dEngine.getStatus();
    var checkSq = null;
    if (status.inCheck) {
      var k = dEngine.findKing(dEngine.turn);
      if (k) checkSq = ChessEngine.sq(k.row, k.col);
    }
    var lastRec = isReviewing() ? (viewIndex > 0 ? engine.history[viewIndex - 1] : null) : engine.history[engine.history.length - 1];
    var interactive = !isReviewing();

    for (var dr = 0; dr < 8; dr++) {
      for (var dc = 0; dc < 8; dc++) {
        var pos = displayCoord(dr, dc);
        var r = pos.r, c = pos.c;
        var sqStr = ChessEngine.sq(r, c);
        var sqEl = document.createElement('div');
        sqEl.className = 'square' + (((r + c) % 2 === 1) ? ' dark' : '');
        sqEl.dataset.square = sqStr;
        sqEl.setAttribute('role', 'gridcell');
        sqEl.tabIndex = (interactive && sqStr === focusSquare) ? 0 : -1;
        if (interactive && selected === sqStr) sqEl.classList.add('sel');
        if (lastRec && lastRec.from === sqStr) sqEl.classList.add('last-from');
        if (lastRec && lastRec.to === sqStr) sqEl.classList.add('last-to');
        if (checkSq === sqStr) sqEl.classList.add('check-glow');

        var piece = dEngine.board[r][c];
        if (piece) {
          var wrap = document.createElement('div');
          wrap.className = 'piece piece-' + (piece.color === 'w' ? 'white' : 'black');
          if (interactive && piece.color === dEngine.turn && isHumanTurn() && !gameOverShown && !aiThinking) {
            wrap.classList.add('movable');
          }
          wrap.innerHTML = CHESS_PIECE_SVGS[piece.type][piece.color];
          if (animateEntrance) {
            wrap.classList.add('pop-in');
            wrap.style.animationDelay = (dr * 16 + dc * 5) + 'ms';
          }
          sqEl.appendChild(wrap);
        }

        if (interactive && selected) {
          var mv = null;
          for (var i = 0; i < legalTargets.length; i++) {
            if (ChessEngine.sq(legalTargets[i].to.row, legalTargets[i].to.col) === sqStr) { mv = legalTargets[i]; break; }
          }
          if (mv) {
            var dot = document.createElement('div');
            dot.className = 'move-dot' + (mv.captured ? ' capture' : '');
            sqEl.appendChild(dot);
          }
        }

        el.board.appendChild(sqEl);
      }
    }
    if (hadFocus && interactive) {
      var focusEl = el.board.querySelector('[data-square="' + focusSquare + '"]');
      if (focusEl) focusEl.focus();
    }
  }

  function squareCenter(sqStr) {
    var sqEl = el.board.querySelector('[data-square="' + sqStr + '"]');
    if (!sqEl) return null;
    var r = sqEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function animateSlide(fromSq, toSq) {
    var fromC = squareCenter(fromSq);
    var toC = squareCenter(toSq);
    var pieceEl = el.board.querySelector('[data-square="' + toSq + '"] .piece');
    if (!pieceEl || !fromC || !toC) return;
    var dx = fromC.x - toC.x, dy = fromC.y - toC.y;
    pieceEl.style.transition = 'none';
    pieceEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    // eslint-disable-next-line no-unused-expressions
    pieceEl.getBoundingClientRect();
    requestAnimationFrame(function () {
      pieceEl.style.transition = 'transform .32s cubic-bezier(.34,1.56,.64,1)';
      pieceEl.style.transform = '';
    });
  }

  // ---------------- Estado / turno ----------------
  function isHumanTurn() {
    if (mode === '2p') return true;
    return engine.turn === 'w';
  }

  function updateStatusUI() {
    renderClocks();
    if (isReviewing()) {
      el.reviewBanner.hidden = false;
      el.reviewText.textContent = 'Viendo la jugada ' + viewIndex + ' de ' + (positionHistory.length - 1);
      return;
    }
    el.reviewBanner.hidden = true;
    var status = engine.getStatus();
    el.turnDot.className = 'turn-dot' + (engine.turn === 'b' ? ' black' : '');
    var who = engine.turn === 'w' ? 'blancas' : 'negras';
    el.turnText.textContent = (status.inCheck ? 'Jaque a las ' : 'Turno de las ') + who;
    announce(el.turnText.textContent);
  }

  function viewPosition(ply) {
    if (ply < 0 || ply >= positionHistory.length) return;
    viewIndex = ply;
    selected = null; legalTargets = [];
    renderBoard();
    updateStatusUI();
    renderCapturedAndHistory();
  }
  function exitReview() {
    if (!isReviewing()) return;
    viewIndex = null;
    renderBoard();
    updateStatusUI();
    renderCapturedAndHistory();
  }
  el.btnExitReview.addEventListener('click', exitReview);

  function renderCapturedAndHistory() {
    var capByWhite = [], capByBlack = [];
    engine.history.forEach(function (h) {
      if (!h.captured) return;
      if (h.color === 'w') capByWhite.push(h.captured); else capByBlack.push(h.captured);
    });
    capByWhite.sort(function (a, b) { return CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b); });
    capByBlack.sort(function (a, b) { return CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b); });

    el.capturedByWhite.innerHTML = capByWhite.map(function (t) {
      return '<div class="mini-piece piece piece-black">' + CHESS_PIECE_SVGS[t].b + '</div>';
    }).join('');
    el.capturedByBlack.innerHTML = capByBlack.map(function (t) {
      return '<div class="mini-piece piece piece-white">' + CHESS_PIECE_SVGS[t].w + '</div>';
    }).join('');

    function valueOf(list) { return list.reduce(function (s, t) { return s + ChessEngine.PIECE_VALUES[t]; }, 0); }
    var diff = Math.round((valueOf(capByWhite) - valueOf(capByBlack)) / 100);
    el.materialDiff.textContent = diff === 0 ? '' : (diff > 0 ? '+' + diff : String(diff));

    el.moveList.innerHTML = '';
    var lastIndex = engine.history.length - 1;
    for (var i = 0; i < engine.history.length; i += 2) {
      var num = (i / 2) + 1;
      var whiteMove = engine.history[i];
      var blackMove = engine.history[i + 1];
      var numEl = document.createElement('li'); numEl.className = 'mv-num'; numEl.textContent = num + '.';
      var wEl = makeMoveListEntry(whiteMove, i, i === lastIndex);
      var bEl = makeMoveListEntry(blackMove, i + 1, i + 1 === lastIndex);
      el.moveList.appendChild(numEl);
      el.moveList.appendChild(wEl);
      el.moveList.appendChild(bEl);
    }
    if (!isReviewing()) el.moveList.scrollTop = el.moveList.scrollHeight;
  }

  function makeMoveListEntry(moveRec, historyIndex, isCurrent) {
    if (!moveRec) {
      var empty = document.createElement('li'); empty.className = 'mv-san'; return empty;
    }
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mv-san';
    btn.textContent = moveRec.san;
    if (isCurrent && !isReviewing()) btn.classList.add('current');
    if (isReviewing() && viewIndex === historyIndex + 1) btn.classList.add('viewing');
    btn.addEventListener('click', function () { viewPosition(historyIndex + 1); });
    li.appendChild(btn);
    li.style.display = 'contents';
    return li;
  }

  var REASON_ES = {
    stalemate: 'ahogado', 'fifty-move': 'la regla de las 50 jugadas',
    repetition: 'repetición de posición', 'insufficient-material': 'material insuficiente'
  };

  function checkGameOver() {
    var status = engine.getStatus();
    if (!status.isGameOver) return false;
    gameOverShown = true;
    clearSavedGame();
    if (status.result === 'checkmate') {
      var winner = status.turn === 'w' ? 'negras' : 'blancas';
      el.gameOverTitle.textContent = 'Jaque mate';
      el.gameOverSubtitle.textContent = 'Ganan las ' + winner;
      if (el.gameOverModal) el.gameOverModal.classList.add('celebrate');
    } else {
      el.gameOverTitle.textContent = 'Tablas';
      el.gameOverSubtitle.textContent = 'Empate por ' + (REASON_ES[status.reason] || status.reason);
      if (el.gameOverModal) el.gameOverModal.classList.remove('celebrate');
    }
    el.gameOverOverlay.hidden = false;
    announce(el.gameOverTitle.textContent + '. ' + el.gameOverSubtitle.textContent);
    return true;
  }

  function cancelPendingAI() {
    requestCounter++;
    if (typeof StockfishEngine !== 'undefined') StockfishEngine.abort();
  }

  function finishGameManually(title, subtitle) {
    gameOverShown = true;
    clearSavedGame();
    cancelPendingAI();
    aiThinking = false; el.aiThinking.hidden = true;
    el.gameOverTitle.textContent = title;
    el.gameOverSubtitle.textContent = subtitle;
    if (el.gameOverModal) el.gameOverModal.classList.remove('celebrate');
    el.gameOverOverlay.hidden = false;
    announce(title + '. ' + subtitle);
  }

  el.btnResign.addEventListener('click', function () {
    if (gameOverShown || isReviewing() || aiThinking) return;
    if (mode === 'ai' && engine.turn !== 'w') return; // no se puede rendir en nombre de la maquina
    var winner = engine.turn === 'w' ? 'negras' : 'blancas';
    finishGameManually('Abandono', 'Ganan las ' + winner);
  });

  el.btnDrawOffer.addEventListener('click', function () {
    if (gameOverShown || isReviewing() || aiThinking || !engine.history.length) return;
    if (mode === '2p') {
      if (window.confirm('¿El otro jugador acepta tablas?')) {
        finishGameManually('Tablas', 'Empate acordado');
      } else {
        showToast('El rival rechaza las tablas.');
      }
      return;
    }
    if (typeof ChessAI === 'undefined') { showToast('La máquina rechaza las tablas.'); return; }
    var scoreWhite = ChessAI.evaluateWhitePerspective(engine);
    var scoreForBlack = -scoreWhite;
    if (scoreForBlack >= -150) {
      finishGameManually('Tablas', 'La máquina acepta tablas');
    } else {
      showToast('La máquina rechaza las tablas: cree que está mejor.');
    }
  });

  // ---------------- Movimientos ----------------
  function selectSquare(sqStr) {
    var pos = ChessEngine.parseSq(sqStr);
    var piece = engine.board[pos.row][pos.col];
    if (!piece || piece.color !== engine.turn) return;
    selected = sqStr;
    legalTargets = engine.movesFrom(sqStr);
    renderBoard();
  }
  function clearSelection() {
    if (!selected) return;
    selected = null; legalTargets = [];
    renderBoard();
  }

  function commitMove(from, to, promotion) {
    var rec = engine.makeMove(from, to, promotion);
    if (!rec) return;
    positionHistory.push(engine.toFEN());
    if (timeControlKey !== 'none') {
      var tcInc = TIME_CONTROLS[timeControlKey];
      if (tcInc && tcInc.increment) clocks[rec.color] += tcInc.increment;
    }
    selected = null; legalTargets = [];
    renderBoard();
    animateSlide(rec.from, rec.to);
    if (rec.castle) {
      var rank = rec.color === 'w' ? '1' : '8';
      if (rec.castle === 'K') animateSlide('h' + rank, 'f' + rank);
      else animateSlide('a' + rank, 'd' + rank);
    }
    if (rec.captured) {
      var toEl = el.board.querySelector('[data-square="' + rec.to + '"]');
      if (toEl) {
        toEl.classList.add('impact');
        setTimeout(function () { toEl.classList.remove('impact'); }, 340);
      }
    }
    var status = engine.getStatus();
    playMoveSound(rec, status);
    updateStatusUI();
    renderCapturedAndHistory();
    saveGame();
    if (!checkGameOver()) {
      maybeTriggerAI();
    }
  }

  function tryMove(fromSq, toSq, candidates) {
    if (candidates.length > 1) {
      pendingPromotion = { from: fromSq, to: toSq };
      openPromotionModal(engine.turn);
      return;
    }
    commitMove(fromSq, toSq, null);
  }

  function openPromotionModal(color) {
    el.promoChoices.innerHTML = '';
    PROMO_ORDER.forEach(function (type) {
      var btn = document.createElement('button');
      btn.className = 'promo-choice';
      btn.setAttribute('aria-label', type);
      btn.innerHTML = '<div class="piece piece-' + (color === 'w' ? 'white' : 'black') + '">' + CHESS_PIECE_SVGS[type][color] + '</div>';
      btn.addEventListener('click', function () {
        var pp = pendingPromotion; pendingPromotion = null;
        el.promoOverlay.hidden = true;
        if (pp) commitMove(pp.from, pp.to, type);
      });
      el.promoChoices.appendChild(btn);
    });
    el.promoOverlay.hidden = false;
  }

  // ---------------- IA ----------------
  function ensureWorker() {
    if (worker) return;
    worker = new Worker('js/ai-worker.js');
    worker.onmessage = function (e) {
      var data = e.data || {};
      if (data.requestId !== requestCounter) return; // respuesta obsoleta (deshecha o partida nueva)
      aiThinking = false;
      el.aiThinking.hidden = true;
      if (!data.result) return;
      commitMove(data.result.from, data.result.to, data.result.promotion);
    };
  }
  function runFallbackAI(myRequestId, fen, preset) {
    ensureWorker();
    worker.postMessage({ requestId: myRequestId, fen: fen, timeLimitMs: preset.timeLimitMs, maxDepth: preset.maxDepth });
  }

  function maybeTriggerAI() {
    if (mode !== 'ai' || gameOverShown || engine.turn !== 'b') return;

    if (typeof OpeningBook !== 'undefined') {
      var uciHistory = engine.history.map(function (h) { return h.from + h.to + (h.promotion || ''); });
      var bookUci = OpeningBook.move(uciHistory);
      if (bookUci) {
        var bFrom = bookUci.slice(0, 2), bTo = bookUci.slice(2, 4), bPromo = bookUci.length > 4 ? bookUci[4] : null;
        aiThinking = true;
        el.aiThinking.hidden = false;
        var bookRequestId = ++requestCounter;
        setTimeout(function () {
          if (bookRequestId !== requestCounter) return;
          aiThinking = false;
          el.aiThinking.hidden = true;
          commitMove(bFrom, bTo, bPromo);
        }, 260); // pequena pausa para que se note que "penso" la jugada de libro
        return;
      }
    }

    aiThinking = true;
    el.aiThinking.hidden = false;
    var myRequestId = ++requestCounter;
    var preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;
    var fen = engine.toFEN();

    if (typeof StockfishEngine !== 'undefined' && !StockfishEngine.hasFailed()) {
      StockfishEngine.init().then(function (available) {
        if (myRequestId !== requestCounter) return;
        if (!available) { runFallbackAI(myRequestId, fen, preset); return; }
        StockfishEngine.getMove(fen, { elo: preset.elo, skill: preset.skill, movetime: preset.movetime }).then(function (uci) {
          if (myRequestId !== requestCounter) return;
          if (!uci) { runFallbackAI(myRequestId, fen, preset); return; }
          aiThinking = false;
          el.aiThinking.hidden = true;
          var from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci.length > 4 ? uci[4] : null;
          commitMove(from, to, promo);
        });
      });
      return;
    }

    runFallbackAI(myRequestId, fen, preset);
  }

  // ---------------- Entrada: tap / arrastrar ----------------
  function squareFromPoint(x, y) {
    var elAt = document.elementFromPoint(x, y);
    var sqEl = elAt && elAt.closest && elAt.closest('.square');
    return sqEl ? sqEl.dataset.square : null;
  }

  function activateSquare(sqStr) {
    if (isReviewing() || gameOverShown || aiThinking || !isHumanTurn()) return false;
    if (selected) {
      if (sqStr === selected) { clearSelection(); return false; }
      var candidates = legalTargets.filter(function (m) { return ChessEngine.sq(m.to.row, m.to.col) === sqStr; });
      if (candidates.length) { tryMove(selected, sqStr, candidates); return false; }
    }
    var pos = ChessEngine.parseSq(sqStr);
    var piece = engine.board[pos.row][pos.col];
    if (piece && piece.color === engine.turn) {
      selectSquare(sqStr);
      focusSquare = sqStr;
      return true;
    }
    clearSelection();
    return false;
  }

  function onPointerDown(e) {
    var sqEl = e.target.closest('.square');
    if (!sqEl) return;
    var sqStr = sqEl.dataset.square;
    var didSelect = activateSquare(sqStr);
    if (didSelect) {
      var pieceEl = el.board.querySelector('[data-square="' + sqStr + '"] .piece');
      if (pieceEl) {
        dragState = { square: sqStr, pieceEl: pieceEl, startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId };
        try { pieceEl.setPointerCapture(e.pointerId); } catch (err) { /* ignorado */ }
      }
    }
  }

  function onPointerMove(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    var dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) > 5) {
      dragState.moved = true;
      dragState.pieceEl.classList.add('dragging');
    }
    if (dragState.moved) {
      dragState.pieceEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.12)';
    }
  }

  function onPointerUp(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    var ds = dragState;
    dragState = null;
    try { ds.pieceEl.releasePointerCapture(ds.pointerId); } catch (err) { /* ignorado */ }
    ds.pieceEl.classList.remove('dragging');
    ds.pieceEl.style.transform = '';
    if (!ds.moved) return;
    var targetSq = squareFromPoint(e.clientX, e.clientY);
    if (targetSq && targetSq !== ds.square) {
      var candidates = legalTargets.filter(function (m) { return ChessEngine.sq(m.to.row, m.to.col) === targetSq; });
      if (candidates.length) { tryMove(ds.square, targetSq, candidates); return; }
    }
    renderBoard();
  }

  el.board.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // ---------------- Navegacion por teclado (accesibilidad) ----------------
  el.board.addEventListener('keydown', function (e) {
    if (isReviewing()) return;
    var key = e.key;
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      e.preventDefault();
      var pos = ChessEngine.parseSq(focusSquare);
      var r = pos.row, c = pos.col;
      if (key === 'ArrowUp') r = flipped ? Math.min(7, r + 1) : Math.max(0, r - 1);
      else if (key === 'ArrowDown') r = flipped ? Math.max(0, r - 1) : Math.min(7, r + 1);
      else if (key === 'ArrowLeft') c = flipped ? Math.min(7, c + 1) : Math.max(0, c - 1);
      else if (key === 'ArrowRight') c = flipped ? Math.max(0, c - 1) : Math.min(7, c + 1);
      focusSquare = ChessEngine.sq(r, c);
      renderBoard();
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      activateSquare(focusSquare);
    }
  });
  el.board.addEventListener('focusin', function () { boardHadFocus = true; });
  el.board.addEventListener('focusout', function () { boardHadFocus = false; });

  // ---------------- Controles ----------------
  function finishStateRefresh(animateEntrance) {
    selected = null; legalTargets = [];
    renderBoard(animateEntrance);
    updateStatusUI();
    renderCapturedAndHistory();
    saveGame();
  }

  function rebuildPositionHistory() {
    positionHistory = [ChessEngine.START_FEN];
    var replay = new ChessEngine();
    engine.history.forEach(function (h) {
      replay.makeMove(h.from, h.to, h.promotion);
      positionHistory.push(replay.toFEN());
    });
  }

  function startNewGame() {
    cancelPendingAI();
    aiThinking = false; el.aiThinking.hidden = true;
    gameOverShown = false;
    el.gameOverOverlay.hidden = true;
    viewIndex = null;
    engine = new ChessEngine();
    positionHistory = [ChessEngine.START_FEN];
    resetClocks(timeControlKey);
    el.timeControlHint.hidden = true;
    clearSavedGame();
    if (typeof StockfishEngine !== 'undefined') StockfishEngine.newGame();
    finishStateRefresh(true);
  }

  el.btnNew.addEventListener('click', startNewGame);
  el.btnRematch.addEventListener('click', startNewGame);
  el.btnCloseGameOver.addEventListener('click', function () { el.gameOverOverlay.hidden = true; });
  el.gameOverOverlay.addEventListener('click', function (e) { if (e.target === el.gameOverOverlay) el.gameOverOverlay.hidden = true; });

  el.btnUndo.addEventListener('click', function () {
    if (!engine.history.length) return;
    cancelPendingAI();
    aiThinking = false; el.aiThinking.hidden = true;
    gameOverShown = false;
    el.gameOverOverlay.hidden = true;
    viewIndex = null;
    engine.undoMove();
    positionHistory.pop();
    if (mode === 'ai' && engine.turn === 'b' && engine.history.length) {
      engine.undoMove();
      positionHistory.pop();
    }
    finishStateRefresh();
  });

  el.btnFlip.addEventListener('click', function () {
    flipped = !flipped;
    renderCoords();
    renderBoard();
    saveSettings();
  });

  el.modeSwitch.addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn || btn.dataset.mode === mode) return;
    Array.prototype.forEach.call(el.modeSwitch.querySelectorAll('.seg-btn'), function (b) { b.classList.toggle('active', b === btn); });
    mode = btn.dataset.mode;
    el.difficultyRow.classList.toggle('hidden-row', mode !== 'ai');
    saveSettings();
    maybeTriggerAI();
  });

  el.difficulty.addEventListener('change', function () {
    difficulty = el.difficulty.value;
    saveSettings();
  });

  el.menuSound.addEventListener('change', function () { soundOn = el.menuSound.checked; updateSoundUI(); saveSettings(); });
  el.menuTheme.addEventListener('change', function () { applyTheme(el.menuTheme.checked ? 'dark' : 'light'); saveSettings(); });

  el.btnMenu.addEventListener('click', function () { el.menuOverlay.hidden = false; });
  el.btnMenuClose.addEventListener('click', function () { el.menuOverlay.hidden = true; });
  el.menuOverlay.addEventListener('click', function (e) { if (e.target === el.menuOverlay) el.menuOverlay.hidden = true; });

  // ---------------- Posición y partida (FEN / PGN) ----------------
  function buildPgnText() {
    var parts = [];
    for (var i = 0; i < engine.history.length; i += 2) {
      var num = (i / 2) + 1;
      var w = engine.history[i], b = engine.history[i + 1];
      parts.push(num + '. ' + (w ? w.san : '') + (b ? ' ' + b.san : ''));
    }
    return parts.join(' ');
  }

  function copyToClipboard(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showToast(okMsg); }).catch(function () { showToast('No se pudo copiar'); });
    } else {
      showToast('No se pudo copiar');
    }
  }

  function loadFreshGame(newEngine, newPositionHistory, savedClockState) {
    cancelPendingAI();
    aiThinking = false; el.aiThinking.hidden = true;
    gameOverShown = false;
    el.gameOverOverlay.hidden = true;
    viewIndex = null;
    if (typeof StockfishEngine !== 'undefined') StockfishEngine.newGame();
    engine = newEngine;
    positionHistory = newPositionHistory;
    if (savedClockState && TIME_CONTROLS[savedClockState.timeControlKey] !== undefined) {
      timeControlKey = savedClockState.timeControlKey;
      clocks = { w: savedClockState.clocks.w, b: savedClockState.clocks.b };
      lastTick = Date.now();
      el.timeControl.value = timeControlKey;
    } else {
      resetClocks(timeControlKey);
    }
    el.timeControlHint.hidden = true;
    clearSavedGame();
    finishStateRefresh(true);
    if (!checkGameOver()) maybeTriggerAI();
  }

  function importPgn(text) {
    var clean = text
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\d+\.(\.\.)?/g, ' ')
      .replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, ' ')
      .trim();
    var tokens = clean.split(/\s+/).filter(Boolean).map(function (t) { return t.replace(/[!?]+$/, ''); });
    if (!tokens.length) return null;
    var testEngine = new ChessEngine();
    var newPositionHistory = [ChessEngine.START_FEN];
    for (var i = 0; i < tokens.length; i++) {
      var san = tokens[i];
      var legal = testEngine.legalMoves(testEngine.turn);
      var match = null;
      for (var j = 0; j < legal.length; j++) {
        var candidateSan = testEngine._computeSAN(legal[j], legal);
        if (candidateSan === san) { match = legal[j]; break; }
      }
      if (!match) return null;
      testEngine.makeMove(ChessEngine.sq(match.from.row, match.from.col), ChessEngine.sq(match.to.row, match.to.col), match.promotion);
      newPositionHistory.push(testEngine.toFEN());
    }
    return { engine: testEngine, positionHistory: newPositionHistory };
  }

  el.btnPosition.addEventListener('click', function () {
    el.fenOutput.value = engine.toFEN();
    el.pgnOutput.value = buildPgnText() || '(sin jugadas todavía)';
    el.fenInput.value = '';
    el.pgnInput.value = '';
    el.positionOverlay.hidden = false;
  });
  el.btnPositionClose.addEventListener('click', function () { el.positionOverlay.hidden = true; });
  el.positionOverlay.addEventListener('click', function (e) { if (e.target === el.positionOverlay) el.positionOverlay.hidden = true; });

  el.btnCopyFen.addEventListener('click', function () { copyToClipboard(el.fenOutput.value, 'FEN copiado'); });
  el.btnCopyPgn.addEventListener('click', function () { copyToClipboard(el.pgnOutput.value, 'PGN copiado'); });

  el.btnLoadFen.addEventListener('click', function () {
    var fen = el.fenInput.value.trim();
    if (!fen) return;
    var testEngine;
    try { testEngine = new ChessEngine(fen); } catch (e) { showToast('FEN no válido'); return; }
    if (!testEngine.board || !testEngine.findKing('w') || !testEngine.findKing('b')) { showToast('FEN no válido'); return; }
    loadFreshGame(testEngine, [fen]);
    el.positionOverlay.hidden = true;
    showToast('Posición cargada');
  });

  el.btnLoadPgn.addEventListener('click', function () {
    var text = el.pgnInput.value;
    if (!text.trim()) return;
    var result = importPgn(text);
    if (!result) { showToast('No se pudo interpretar el PGN'); return; }
    loadFreshGame(result.engine, result.positionHistory);
    el.positionOverlay.hidden = true;
    showToast('Partida cargada (' + (result.positionHistory.length - 1) + ' jugadas)');
  });

  el.btnDownloadGame.addEventListener('click', function () {
    var data = {
      app: 'ajedrez-juegoshtml',
      version: 1,
      created: new Date().toISOString(),
      mode: mode,
      difficulty: difficulty,
      timeControlKey: timeControlKey,
      clocks: { w: clocks.w, b: clocks.b },
      moves: engine.history.map(function (h) { return { from: h.from, to: h.to, promotion: h.promotion }; })
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ajedrez-partida-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('Partida descargada');
  });

  el.btnUploadGame.addEventListener('click', function () { el.uploadGameInput.click(); });
  el.uploadGameInput.addEventListener('change', function () {
    var file = el.uploadGameInput.files && el.uploadGameInput.files[0];
    el.uploadGameInput.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) { showToast('Archivo no válido'); return; }
      if (!data || !Array.isArray(data.moves)) { showToast('Archivo no válido'); return; }
      var testEngine = new ChessEngine();
      var newPositionHistory = [ChessEngine.START_FEN];
      for (var i = 0; i < data.moves.length; i++) {
        var m = data.moves[i];
        var rec = testEngine.makeMove(m.from, m.to, m.promotion);
        if (!rec) { showToast('El archivo contiene una partida no válida'); return; }
        newPositionHistory.push(testEngine.toFEN());
      }
      if (data.mode === 'ai' || data.mode === '2p') mode = data.mode;
      if (data.difficulty && DIFFICULTY_PRESETS[data.difficulty]) difficulty = data.difficulty;
      applyModeUI();
      saveSettings();
      var savedClockState = null;
      if (data.timeControlKey && data.clocks && typeof data.clocks.w === 'number' && typeof data.clocks.b === 'number') {
        savedClockState = { timeControlKey: data.timeControlKey, clocks: data.clocks };
      }
      loadFreshGame(testEngine, newPositionHistory, savedClockState);
      el.positionOverlay.hidden = true;
      showToast('Partida cargada (' + (newPositionHistory.length - 1) + ' jugadas)');
    };
    reader.onerror = function () { showToast('No se pudo leer el archivo'); };
    reader.readAsText(file);
  });

  // ---------------- Arranque ----------------
  function applyModeUI() {
    Array.prototype.forEach.call(el.modeSwitch.querySelectorAll('.seg-btn'), function (b) { b.classList.toggle('active', b.dataset.mode === mode); });
    el.difficultyRow.classList.toggle('hidden-row', mode !== 'ai');
    el.difficulty.value = difficulty;
    el.timeControl.value = timeControlKey;
  }

  function handleLaunchShortcut() {
    // Nota: "daily" lo gestiona puzzle-trainer.js (se carga despues de este script) - aqui solo
    // se consume y limpia "new" para no borrar el parametro antes de que el otro modulo lo lea.
    var params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'new') return;
    startNewGame();
    params.delete('action');
    var qs = params.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  function hideSplash() {
    if (!el.splash) return;
    el.splash.classList.add('hide');
    setTimeout(function () { if (el.splash) el.splash.remove(); }, 400);
  }

  function init() {
    loadSettings();
    initTheme();
    resetClocks(timeControlKey);
    loadGame();
    applyModeUI();
    updateSoundUI();
    renderCoords();
    finishStateRefresh(true);
    if (el.brandMark) el.brandMark.innerHTML = CHESS_PIECE_INNER.k;
    if (typeof StockfishEngine !== 'undefined') StockfishEngine.init(); // precarga en segundo plano
    if (!checkGameOver()) maybeTriggerAI();
    handleLaunchShortcut();
    requestAnimationFrame(hideSplash);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* PWA opcional: se ignora si falla */ });
    }
  }

  init();
})();
