/*
 * IA de ajedrez: negamax + poda alfa-beta + profundización iterativa acotada por tiempo
 * + búsqueda de quietud (quiescence) sobre capturas para evitar el "efecto horizonte".
 * Sin librerías externas; usa ChessEngine para generar y aplicar movimientos.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'));
  } else {
    root.ChessAI = factory(root.ChessEngine);
  }
}(typeof self !== 'undefined' ? self : this, function (ChessEngine) {
  'use strict';

  var PIECE_VALUES = ChessEngine.PIECE_VALUES;
  var MATE_VALUE = 100000;
  var TIME_UP = { timeUp: true };

  var PAWN_PST = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ];
  var KNIGHT_PST = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50]
  ];
  var BISHOP_PST = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20]
  ];
  var ROOK_PST = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0]
  ];
  var QUEEN_PST = [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20]
  ];
  var KING_MID_PST = [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20]
  ];
  var KING_END_PST = [
    [-50, -40, -30, -20, -20, -30, -40, -50],
    [-30, -20, -10, 0, 0, -10, -20, -30],
    [-30, -10, 20, 30, 30, 20, -10, -30],
    [-30, -10, 30, 40, 40, 30, -10, -30],
    [-30, -10, 30, 40, 40, 30, -10, -30],
    [-30, -10, 20, 30, 30, 20, -10, -30],
    [-30, -30, 0, 0, 0, 0, -30, -30],
    [-50, -30, -30, -30, -30, -30, -30, -50]
  ];
  var PST = { p: PAWN_PST, n: KNIGHT_PST, b: BISHOP_PST, r: ROOK_PST, q: QUEEN_PST };

  function isEndgame(board) {
    var nonPawn = 0, queens = 0;
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = board[r][c];
      if (!p || p.type === 'k' || p.type === 'p') continue;
      nonPawn += PIECE_VALUES[p.type];
      if (p.type === 'q') queens++;
    }
    return queens === 0 || nonPawn <= 1600;
  }

  function evaluateWhitePerspective(engine) {
    var board = engine.board;
    var endgame = isEndgame(board);
    var score = 0;
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var p = board[r][c];
        if (!p) continue;
        var value = PIECE_VALUES[p.type];
        var table = p.type === 'k' ? (endgame ? KING_END_PST : KING_MID_PST) : PST[p.type];
        var pstVal = p.color === 'w' ? table[r][c] : table[7 - r][c];
        var total = value + pstVal;
        score += p.color === 'w' ? total : -total;
      }
    }
    return score;
  }

  function evaluateRelative(engine, color) {
    var white = evaluateWhitePerspective(engine);
    return color === 'w' ? white : -white;
  }

  function moveOrderScore(m) {
    var s = 0;
    if (m.captured) s += 10 * PIECE_VALUES[m.captured] - PIECE_VALUES[m.piece];
    if (m.promotion) s += PIECE_VALUES[m.promotion];
    if (m.castle) s += 30;
    return s;
  }

  function orderMoves(moves, preferred) {
    moves.sort(function (a, b) {
      if (preferred) {
        var ap = movesEqual(a, preferred) ? 1 : 0;
        var bp = movesEqual(b, preferred) ? 1 : 0;
        if (ap !== bp) return bp - ap;
      }
      return moveOrderScore(b) - moveOrderScore(a);
    });
  }

  function movesEqual(a, b) {
    return a && b && a.from.row === b.from.row && a.from.col === b.from.col &&
      a.to.row === b.to.row && a.to.col === b.to.col && a.promotion === b.promotion;
  }

  function quiescence(engine, alpha, beta, color, deadline) {
    if (Date.now() > deadline) throw TIME_UP;
    var standPat = evaluateRelative(engine, color);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    var moves = engine.legalMoves(color).filter(function (m) { return m.captured || m.promotion; });
    orderMoves(moves, null);
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      engine._fastMake(m);
      var score = -quiescence(engine, -beta, -alpha, color === 'w' ? 'b' : 'w', deadline);
      engine._fastUnmake();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(engine, depth, ply, alpha, beta, color, deadline) {
    if (Date.now() > deadline) throw TIME_UP;
    var moves = engine.legalMoves(color);
    if (moves.length === 0) {
      if (engine.isInCheck(color)) return -(MATE_VALUE - ply);
      return 0;
    }
    if (depth === 0) return quiescence(engine, alpha, beta, color, deadline);
    orderMoves(moves, null);
    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      engine._fastMake(m);
      var score = -negamax(engine, depth - 1, ply + 1, -beta, -alpha, color === 'w' ? 'b' : 'w', deadline);
      engine._fastUnmake();
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function findBestMove(fen, opts) {
    opts = opts || {};
    var timeLimitMs = opts.timeLimitMs || 1500;
    var maxDepth = opts.maxDepth || 6;
    var engine = new ChessEngine(fen);
    var color = engine.turn;
    var deadline = Date.now() + timeLimitMs;
    var bestMove = null, bestScore = 0, reachedDepth = 0;

    try {
      for (var depth = 1; depth <= maxDepth; depth++) {
        var moves = engine.legalMoves(color);
        if (!moves.length) break;
        orderMoves(moves, bestMove);
        var alpha = -Infinity, beta = Infinity;
        var localBest = null, localBestScore = -Infinity;
        for (var i = 0; i < moves.length; i++) {
          var m = moves[i];
          engine._fastMake(m);
          var score = -negamax(engine, depth - 1, 1, -beta, -alpha, color === 'w' ? 'b' : 'w', deadline);
          engine._fastUnmake();
          if (score > localBestScore) { localBestScore = score; localBest = m; }
          if (score > alpha) alpha = score;
        }
        bestMove = localBest;
        bestScore = localBestScore;
        reachedDepth = depth;
        if (Date.now() > deadline) break;
        if (bestScore > MATE_VALUE - 1000) break; // mate encontrado, no hace falta profundizar mas
      }
    } catch (e) {
      if (e !== TIME_UP) throw e;
    }

    if (!bestMove) return null;
    return {
      from: ChessEngine.sq(bestMove.from.row, bestMove.from.col),
      to: ChessEngine.sq(bestMove.to.row, bestMove.to.col),
      promotion: bestMove.promotion || null,
      score: bestScore,
      depth: reachedDepth
    };
  }

  return { findBestMove: findBestMove, evaluateWhitePerspective: evaluateWhitePerspective };
}));
