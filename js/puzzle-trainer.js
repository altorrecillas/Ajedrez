/*
 * Modo "Lecciones": menu de temas tacticos + entrenador de puzzles.
 * Modulo independiente del juego principal (app.js): usa su propio ChessEngine,
 * su propio tablero (#puzzleBoard) y no toca el estado de la partida en curso.
 */
(function () {
  'use strict';

  var el = {
    mainTabs: document.getElementById('mainTabs'),
    playView: document.getElementById('playView'),
    lessonsView: document.getElementById('lessonsView'),
    puzzleView: document.getElementById('puzzleView'),
    dailyMeta: document.getElementById('dailyMeta'),
    dailyTitle: document.getElementById('dailyTitle'),
    dailyDesc: document.getElementById('dailyDesc'),
    btnDailyPlay: document.getElementById('btnDailyPlay'),
    lessonGrid: document.getElementById('lessonGrid'),
    puzzleBoard: document.getElementById('puzzleBoard'),
    puzzleCoordFiles: document.getElementById('puzzleCoordFiles'),
    puzzleCoordRanks: document.getElementById('puzzleCoordRanks'),
    puzzleIcon: document.getElementById('puzzleIcon'),
    puzzleTitle: document.getElementById('puzzleTitle'),
    puzzlePrompt: document.getElementById('puzzlePrompt'),
    puzzleFeedback: document.getElementById('puzzleFeedback'),
    btnPuzzleExit: document.getElementById('btnPuzzleExit'),
    btnPuzzleHint: document.getElementById('btnPuzzleHint'),
    btnPuzzleRetry: document.getElementById('btnPuzzleRetry'),
    btnPuzzleNext: document.getElementById('btnPuzzleNext'),
    puzzleDots: document.getElementById('puzzleDots'),
    ariaStatus: document.getElementById('ariaStatus')
  };

  if (!el.mainTabs || typeof CHESS_LESSONS === 'undefined') return;

  // Iconos propios en SVG (nada de emoji: se ven distinto -o directamente no se ven- segun el sistema).
  var S = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = {
    eye: '<svg viewBox="0 0 24 24" ' + S + '><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    fork: '<svg viewBox="0 0 24 24" ' + S + '><path d="M12 20V11M12 11 6 5M12 11l6-6"/><circle cx="12" cy="20" r="1.6" fill="currentColor" stroke="none"/></svg>',
    pin: '<svg viewBox="0 0 24 24" ' + S + '><path d="M12 3v18"/><circle cx="12" cy="7" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="17" r="2.2" fill="currentColor" stroke="none"/></svg>',
    skewer: '<svg viewBox="0 0 24 24" ' + S + '><path d="M3 12h14M3 12l4-4M3 12l4 4"/><circle cx="19" cy="12" r="2.2" fill="currentColor" stroke="none"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" ' + S + '><circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v3M12 18.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13 2 5 14h5.5l-1 8L19 10h-5.5Z"/></svg>',
    hook: '<svg viewBox="0 0 24 24" ' + S + '><path d="M4 6h9a5 5 0 0 1 5 5v3"/><path d="M14 11l4 3 4-3"/></svg>',
    castle: '<svg viewBox="0 0 24 24" ' + S + '><path d="M4 21V10h3V7h3V4h4v3h3v3h3v11Z"/><path d="M4 10h16M9 21v-5h6v5"/></svg>',
    knight: '<svg viewBox="0 0 45 45" fill="currentColor" stroke="none"><path d="M9 36 C8.5 29 10 25 10 24 C8.5 20 10 17 10 17 C11 12 14 9 17 8 C19 7 20 6.5 21 6.3 L23.5 2 L26 6.5 C28 8.5 29.5 10.5 31 12.5 C32.5 14 34 15 34.5 16.5 C33 17 32 17.3 31.8 18 C33 19 34 20 33 21.5 C31 24 29 26 28 28 C26.5 31 25 34 23.5 36 Z"/></svg>',
    queen: '<svg viewBox="0 0 45 45" fill="currentColor" stroke="none"><path d="M9.5 11.5 L15 27 L30 27 L35.5 11.5 L29.5 14 L27 12 L26 18 L22.5 12.5 L19 18 L18 12 L15.5 14 Z"/><circle cx="9.5" cy="9.5" r="2.3"/><circle cx="22.5" cy="7" r="2.3"/><circle cx="35.5" cy="9.5" r="2.3"/></svg>'
  };

  var STORAGE_KEY = 'ajedrez.puzzles.progreso.v1';
  var solved = loadSolved();

  var state = {
    themeIndex: -1,
    puzzleIndex: -1,
    engine: null,
    solutionPointer: 0,
    selected: null,
    legalTargets: [],
    solverColor: null,
    locked: false,
    focusSquare: 'e4',
    boardHadFocus: false
  };

  function loadSolved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) { return new Set(); }
  }
  function saveSolved() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(solved))); } catch (e) { /* ignorado */ }
  }

  // ---------------- Sonido (comparte la preferencia del juego principal) ----------------
  var audioCtx = null;
  function isSoundOn() {
    try {
      var raw = localStorage.getItem('ajedrez.ajustes.v1');
      if (!raw) return true;
      var s = JSON.parse(raw);
      return s.soundOn !== false;
    } catch (e) { return true; }
  }
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }
  function beep(freq, duration, type, gainPeak) {
    if (!isSoundOn()) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var t0 = ctx.currentTime;
    var osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type || 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.18, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }
  function playPuzzleSound(kind) {
    if (kind === 'wrong') { beep(160, 0.18, 'sawtooth', 0.18); return; }
    if (kind === 'correct') { beep(660, 0.09, 'sine', 0.15); return; }
    if (kind === 'solved') { beep(523, 0.1, 'sine', 0.15); setTimeout(function () { beep(784, 0.16, 'sine', 0.16); }, 100); return; }
    beep(480, 0.06, 'sine', 0.12);
  }

  // ---------------- Navegacion ----------------
  function showView(name) {
    el.playView.hidden = name !== 'play';
    el.lessonsView.hidden = name !== 'lessons';
    el.puzzleView.hidden = name !== 'puzzle';
    Array.prototype.forEach.call(el.mainTabs.querySelectorAll('.tab-btn'), function (b) {
      b.classList.toggle('active', b.dataset.view === (name === 'puzzle' ? 'lessons' : name));
    });
    if (name === 'lessons') renderLessonGrid();
  }
  el.mainTabs.addEventListener('click', function (e) {
    var btn = e.target.closest('.tab-btn');
    if (!btn) return;
    showView(btn.dataset.view);
  });
  el.btnPuzzleExit.addEventListener('click', function () { showView('lessons'); });

  // ---------------- Puzzle del dia ----------------
  function flatPool() {
    var all = [];
    CHESS_LESSONS.forEach(function (lesson, li) {
      lesson.puzzles.forEach(function (p, pi) { all.push({ li: li, pi: pi, lesson: lesson, puzzle: p }); });
    });
    return all;
  }
  function pickDaily() {
    var all = flatPool();
    var d = new Date();
    var start = new Date(d.getFullYear(), 0, 0);
    var dayOfYear = Math.floor((d - start) / 86400000);
    return all[dayOfYear % all.length];
  }
  function renderDailyCard() {
    var d = pickDaily();
    el.dailyTitle.innerHTML = '<span class="lesson-icon daily-icon">' + ICONS[d.lesson.icon] + '</span> ' + d.lesson.title;
    el.dailyDesc.textContent = d.lesson.description;
    var dateStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
    el.dailyMeta.textContent = dateStr + (solved.has(d.puzzle.id) ? ' · ya resuelto ✓' : '');
    el.btnDailyPlay.onclick = function () { loadPuzzle(d.li, d.pi); showView('puzzle'); };
  }

  // ---------------- Rejilla de lecciones ----------------
  function renderLessonGrid() {
    el.lessonGrid.innerHTML = '';
    CHESS_LESSONS.forEach(function (lesson, li) {
      var solvedCount = lesson.puzzles.filter(function (p) { return solved.has(p.id); }).length;
      var pct = Math.round((100 * solvedCount) / lesson.puzzles.length);
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'lesson-card';
      card.innerHTML =
        '<span class="lesson-icon">' + ICONS[lesson.icon] + '</span>' +
        '<h3>' + lesson.title + '</h3>' +
        '<span class="lesson-progress-label">' + solvedCount + '/' + lesson.puzzles.length + ' resueltos</span>' +
        '<div class="lesson-progress-bar"><div class="lesson-progress-fill" style="width:' + pct + '%"></div></div>';
      card.addEventListener('click', function () {
        var firstUnsolved = lesson.puzzles.findIndex(function (p) { return !solved.has(p.id); });
        loadPuzzle(li, firstUnsolved === -1 ? 0 : firstUnsolved);
        showView('puzzle');
      });
      el.lessonGrid.appendChild(card);
    });
    renderDailyCard();
  }

  // ---------------- Entrenador de puzzles ----------------
  function loadPuzzle(li, pi) {
    var lesson = CHESS_LESSONS[li];
    var puzzle = lesson.puzzles[pi];
    state.themeIndex = li; state.puzzleIndex = pi;
    state.engine = new ChessEngine(puzzle.fen);
    state.solverColor = state.engine.turn;
    state.solutionPointer = 0;
    state.selected = null; state.legalTargets = [];
    state.locked = false;
    state.focusSquare = puzzle.moves[0].slice(0, 2);

    el.puzzleIcon.innerHTML = ICONS[lesson.icon];
    el.puzzleTitle.textContent = lesson.title;
    el.puzzleFeedback.hidden = true;
    el.btnPuzzleNext.hidden = true;
    updatePrompt();
    renderPuzzleCoords();
    renderPuzzleBoard();
    renderPuzzleDots();
  }

  function updatePrompt() {
    var who = state.solverColor === 'w' ? 'las blancas' : 'las negras';
    el.puzzlePrompt.textContent = 'Encuentra la mejor jugada para ' + who;
  }

  function renderPuzzleDots() {
    el.puzzleDots.innerHTML = '';
    var lesson = CHESS_LESSONS[state.themeIndex];
    lesson.puzzles.forEach(function (p, i) {
      var dot = document.createElement('span');
      dot.className = 'pdot' + (solved.has(p.id) ? ' solved' : '') + (i === state.puzzleIndex ? ' current' : '');
      el.puzzleDots.appendChild(dot);
    });
  }

  function renderPuzzleCoords() {
    el.puzzleCoordFiles.innerHTML = '';
    el.puzzleCoordRanks.innerHTML = '';
    'abcdefgh'.split('').forEach(function (f) { var s = document.createElement('span'); s.textContent = f; el.puzzleCoordFiles.appendChild(s); });
    [8, 7, 6, 5, 4, 3, 2, 1].forEach(function (r) { var s = document.createElement('span'); s.textContent = r; el.puzzleCoordRanks.appendChild(s); });
  }

  function renderPuzzleBoard() {
    var hadFocus = state.boardHadFocus; // innerHTML='' dispara blur/focusout sincrono
    el.puzzleBoard.innerHTML = '';
    var engine = state.engine;
    var status = engine.getStatus();
    var checkSq = null;
    if (status.inCheck) {
      var k = engine.findKing(engine.turn);
      if (k) checkSq = ChessEngine.sq(k.row, k.col);
    }
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var sqStr = ChessEngine.sq(r, c);
        var sqEl = document.createElement('div');
        sqEl.className = 'square' + (((r + c) % 2 === 1) ? ' dark' : '');
        sqEl.dataset.square = sqStr;
        sqEl.setAttribute('role', 'gridcell');
        sqEl.tabIndex = (!state.locked && sqStr === state.focusSquare) ? 0 : -1;
        if (state.selected === sqStr) sqEl.classList.add('sel');
        if (checkSq === sqStr) sqEl.classList.add('check-glow');

        var piece = engine.board[r][c];
        if (piece) {
          var wrap = document.createElement('div');
          wrap.className = 'piece piece-' + (piece.color === 'w' ? 'white' : 'black');
          if (piece.color === engine.turn && !state.locked) wrap.classList.add('movable');
          wrap.innerHTML = CHESS_PIECE_SVGS[piece.type][piece.color];
          sqEl.appendChild(wrap);
        }

        if (state.selected) {
          var mv = state.legalTargets.filter(function (m) { return ChessEngine.sq(m.to.row, m.to.col) === sqStr; })[0];
          if (mv) {
            var dot = document.createElement('div');
            dot.className = 'move-dot' + (mv.captured ? ' capture' : '');
            sqEl.appendChild(dot);
          }
        }
        el.puzzleBoard.appendChild(sqEl);
      }
    }
    if (hadFocus && !state.locked) {
      var focusEl = el.puzzleBoard.querySelector('[data-square="' + state.focusSquare + '"]');
      if (focusEl) focusEl.focus();
    }
  }

  function puzzleSquareCenter(sqStr) {
    var sqEl = el.puzzleBoard.querySelector('[data-square="' + sqStr + '"]');
    if (!sqEl) return null;
    var r = sqEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function animatePuzzleSlide(fromSq, toSq) {
    var fromC = puzzleSquareCenter(fromSq), toC = puzzleSquareCenter(toSq);
    var pieceEl = el.puzzleBoard.querySelector('[data-square="' + toSq + '"] .piece');
    if (!pieceEl || !fromC || !toC) return;
    var dx = fromC.x - toC.x, dy = fromC.y - toC.y;
    pieceEl.style.transition = 'none';
    pieceEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    pieceEl.getBoundingClientRect();
    requestAnimationFrame(function () {
      pieceEl.style.transition = 'transform .32s cubic-bezier(.34,1.56,.64,1)';
      pieceEl.style.transform = '';
    });
  }

  function clearPuzzleSelection() {
    if (!state.selected) return;
    state.selected = null; state.legalTargets = [];
    renderPuzzleBoard();
  }

  function currentPuzzle() {
    return CHESS_LESSONS[state.themeIndex].puzzles[state.puzzleIndex];
  }

  function attemptPuzzleMove(from, to) {
    var puzzle = currentPuzzle();
    var expectedUci = puzzle.moves[state.solutionPointer];
    var expFrom = expectedUci.slice(0, 2), expTo = expectedUci.slice(2, 4);
    var expPromo = expectedUci.length > 4 ? expectedUci[4] : undefined;

    if (from === expFrom && to === expTo) {
      state.locked = true;
      var rec = state.engine.makeMove(from, to, expPromo);
      state.selected = null; state.legalTargets = [];
      renderPuzzleBoard();
      animatePuzzleSlide(rec.from, rec.to);
      playPuzzleSound('correct');
      state.solutionPointer++;
      if (state.solutionPointer >= puzzle.moves.length) {
        setTimeout(function () { onPuzzleSolved(puzzle); }, 280);
      } else {
        setTimeout(function () { playOpponentReply(puzzle); }, 550);
      }
    } else {
      showWrongFeedback(to);
      clearPuzzleSelection();
    }
  }

  function playOpponentReply(puzzle) {
    var uci = puzzle.moves[state.solutionPointer];
    var from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci.length > 4 ? uci[4] : undefined;
    var rec = state.engine.makeMove(from, to, promo);
    renderPuzzleBoard();
    animatePuzzleSlide(rec.from, rec.to);
    playPuzzleSound('reply');
    state.solutionPointer++;
    if (state.solutionPointer >= puzzle.moves.length) {
      onPuzzleSolved(puzzle);
    } else {
      state.locked = false;
      renderPuzzleBoard();
      updatePrompt();
    }
  }

  function onPuzzleSolved(puzzle) {
    solved.add(puzzle.id);
    saveSolved();
    state.locked = true;
    var lesson = CHESS_LESSONS[state.themeIndex];
    var sanLine = state.engine.history.map(function (h) { return h.san; }).join(' ');
    el.puzzleFeedback.hidden = false;
    el.puzzleFeedback.className = 'puzzle-feedback ok';
    el.puzzleFeedback.innerHTML = '<strong>¡Resuelto!</strong> ' + lesson.description +
      '<span class="puzzle-recap-line">' + sanLine + '</span>';
    el.btnPuzzleNext.hidden = false;
    playPuzzleSound('solved');
    renderPuzzleDots();
    if (el.ariaStatus) el.ariaStatus.textContent = 'Puzzle resuelto. ' + lesson.description;
  }

  function showWrongFeedback(sqStr) {
    var sqEl = el.puzzleBoard.querySelector('[data-square="' + sqStr + '"]');
    if (sqEl) {
      sqEl.classList.add('wrong-flash');
      setTimeout(function () { sqEl.classList.remove('wrong-flash'); }, 500);
    }
    el.puzzleFeedback.hidden = false;
    el.puzzleFeedback.className = 'puzzle-feedback bad';
    el.puzzleFeedback.textContent = 'Esa no es la mejor jugada. ¡Prueba otra vez!';
    playPuzzleSound('wrong');
    if (el.ariaStatus) el.ariaStatus.textContent = 'Jugada incorrecta. Prueba otra vez.';
    setTimeout(function () { el.puzzleFeedback.hidden = true; }, 1400);
  }

  function activatePuzzleSquare(sqStr) {
    if (state.locked || !state.engine) return;
    if (state.selected) {
      if (sqStr === state.selected) { clearPuzzleSelection(); return; }
      var candidates = state.legalTargets.filter(function (m) { return ChessEngine.sq(m.to.row, m.to.col) === sqStr; });
      if (candidates.length) { attemptPuzzleMove(state.selected, sqStr); return; }
    }
    var pos = ChessEngine.parseSq(sqStr);
    var piece = state.engine.board[pos.row][pos.col];
    if (piece && piece.color === state.engine.turn) {
      state.selected = sqStr;
      state.legalTargets = state.engine.movesFrom(sqStr);
      state.focusSquare = sqStr;
      renderPuzzleBoard();
    } else {
      clearPuzzleSelection();
    }
  }

  el.puzzleBoard.addEventListener('pointerdown', function (e) {
    var sqEl = e.target.closest('.square');
    if (!sqEl) return;
    activatePuzzleSquare(sqEl.dataset.square);
  });

  el.puzzleBoard.addEventListener('keydown', function (e) {
    var key = e.key;
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      e.preventDefault();
      var pos = ChessEngine.parseSq(state.focusSquare);
      var r = pos.row, c = pos.col;
      if (key === 'ArrowUp') r = Math.max(0, r - 1);
      else if (key === 'ArrowDown') r = Math.min(7, r + 1);
      else if (key === 'ArrowLeft') c = Math.max(0, c - 1);
      else if (key === 'ArrowRight') c = Math.min(7, c + 1);
      state.focusSquare = ChessEngine.sq(r, c);
      renderPuzzleBoard();
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      activatePuzzleSquare(state.focusSquare);
    }
  });
  el.puzzleBoard.addEventListener('focusin', function () { state.boardHadFocus = true; });
  el.puzzleBoard.addEventListener('focusout', function () { state.boardHadFocus = false; });

  el.btnPuzzleHint.addEventListener('click', function () {
    if (state.locked || !state.engine) return;
    var puzzle = currentPuzzle();
    var uci = puzzle.moves[state.solutionPointer];
    var fromSq = uci.slice(0, 2);
    state.selected = fromSq;
    state.legalTargets = state.engine.movesFrom(fromSq);
    renderPuzzleBoard();
  });
  el.btnPuzzleRetry.addEventListener('click', function () {
    if (state.themeIndex === -1) return;
    loadPuzzle(state.themeIndex, state.puzzleIndex);
  });
  el.btnPuzzleNext.addEventListener('click', function () {
    var lesson = CHESS_LESSONS[state.themeIndex];
    var nextIndex = (state.puzzleIndex + 1) % lesson.puzzles.length;
    loadPuzzle(state.themeIndex, nextIndex);
  });

  renderDailyCard();

  var launchParams = new URLSearchParams(window.location.search);
  if (launchParams.get('action') === 'daily') {
    var d = pickDaily();
    loadPuzzle(d.li, d.pi);
    showView('puzzle');
    launchParams.delete('action');
    var qs = launchParams.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }
})();
