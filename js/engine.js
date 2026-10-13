/*
 * Motor de reglas de ajedrez, sin dependencias externas.
 * Funciona igual en el navegador (window.ChessEngine) y en Node (module.exports),
 * lo que permite testear la generación de movimientos con perft() antes de usarla en la UI.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChessEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FILES = 'abcdefgh';
  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  var ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var QUEEN_DIRS = ROOK_DIRS.concat(BISHOP_DIRS);
  var KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function sq(r, c) { return FILES[c] + (8 - r); }
  function parseSq(s) { return { row: 8 - parseInt(s[1], 10), col: FILES.indexOf(s[0]) }; }
  function cloneBoard(board) {
    var out = new Array(8);
    for (var r = 0; r < 8; r++) {
      var row = new Array(8);
      for (var c = 0; c < 8; c++) {
        var p = board[r][c];
        row[c] = p ? { type: p.type, color: p.color } : null;
      }
      out[r] = row;
    }
    return out;
  }

  function ChessEngine(fen) {
    this.loadFEN(fen || START_FEN);
  }

  ChessEngine.prototype.loadFEN = function (fen) {
    var parts = fen.trim().split(/\s+/);
    var placement = parts[0], turn = parts[1], castling = parts[2] || '-',
        ep = parts[3] || '-', halfmove = parts[4] || '0', fullmove = parts[5] || '1';
    var rows = placement.split('/');
    this.board = [];
    for (var i = 0; i < rows.length; i++) {
      var row = [];
      var rowStr = rows[i];
      for (var j = 0; j < rowStr.length; j++) {
        var ch = rowStr[j];
        if (/\d/.test(ch)) {
          for (var k = 0; k < parseInt(ch, 10); k++) row.push(null);
        } else {
          var color = ch === ch.toUpperCase() ? 'w' : 'b';
          row.push({ type: ch.toLowerCase(), color: color });
        }
      }
      this.board.push(row);
    }
    this.turn = turn;
    this.castling = {
      wK: castling.indexOf('K') !== -1, wQ: castling.indexOf('Q') !== -1,
      bK: castling.indexOf('k') !== -1, bQ: castling.indexOf('q') !== -1
    };
    this.epTarget = ep !== '-' ? parseSq(ep) : null;
    this.halfmoveClock = parseInt(halfmove, 10);
    this.fullmoveNumber = parseInt(fullmove, 10);
    this.history = [];
    this.undoStack = [];
    this._searchStack = [];
    this.positionCounts = new Map();
    this._recordPosition();
  };

  ChessEngine.prototype.toFEN = function () {
    var placement = '';
    for (var r = 0; r < 8; r++) {
      var empty = 0;
      for (var c = 0; c < 8; c++) {
        var p = this.board[r][c];
        if (!p) { empty++; continue; }
        if (empty) { placement += empty; empty = 0; }
        placement += p.color === 'w' ? p.type.toUpperCase() : p.type;
      }
      if (empty) placement += empty;
      if (r < 7) placement += '/';
    }
    var castling = '';
    if (this.castling.wK) castling += 'K';
    if (this.castling.wQ) castling += 'Q';
    if (this.castling.bK) castling += 'k';
    if (this.castling.bQ) castling += 'q';
    if (!castling) castling = '-';
    var ep = this.epTarget ? sq(this.epTarget.row, this.epTarget.col) : '-';
    return placement + ' ' + this.turn + ' ' + castling + ' ' + ep + ' ' + this.halfmoveClock + ' ' + this.fullmoveNumber;
  };

  ChessEngine.prototype._positionKey = function () {
    var f = this.toFEN().split(' ');
    return f[0] + ' ' + f[1] + ' ' + f[2] + ' ' + f[3];
  };

  ChessEngine.prototype._recordPosition = function () {
    var key = this._positionKey();
    this.positionCounts.set(key, (this.positionCounts.get(key) || 0) + 1);
  };

  ChessEngine.prototype.getPiece = function (r, c) { return inBounds(r, c) ? this.board[r][c] : null; };

  ChessEngine.prototype.isSquareAttacked = function (row, col, byColor) {
    var board = this.board, r, c, p, i;
    var dr = byColor === 'w' ? 1 : -1;
    for (i = 0; i < 2; i++) {
      var dc = i === 0 ? -1 : 1;
      p = this.getPiece(row + dr, col + dc);
      if (p && p.color === byColor && p.type === 'p') return true;
    }
    for (i = 0; i < KNIGHT_OFFSETS.length; i++) {
      p = this.getPiece(row + KNIGHT_OFFSETS[i][0], col + KNIGHT_OFFSETS[i][1]);
      if (p && p.color === byColor && p.type === 'n') return true;
    }
    for (i = 0; i < QUEEN_DIRS.length; i++) {
      p = this.getPiece(row + QUEEN_DIRS[i][0], col + QUEEN_DIRS[i][1]);
      if (p && p.color === byColor && p.type === 'k') return true;
    }
    for (i = 0; i < ROOK_DIRS.length; i++) {
      r = row + ROOK_DIRS[i][0]; c = col + ROOK_DIRS[i][1];
      while (inBounds(r, c)) {
        p = board[r][c];
        if (p) {
          if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
          break;
        }
        r += ROOK_DIRS[i][0]; c += ROOK_DIRS[i][1];
      }
    }
    for (i = 0; i < BISHOP_DIRS.length; i++) {
      r = row + BISHOP_DIRS[i][0]; c = col + BISHOP_DIRS[i][1];
      while (inBounds(r, c)) {
        p = board[r][c];
        if (p) {
          if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
          break;
        }
        r += BISHOP_DIRS[i][0]; c += BISHOP_DIRS[i][1];
      }
    }
    return false;
  };

  ChessEngine.prototype.findKing = function (color) {
    for (var r = 0; r < 8; r++)
      for (var c = 0; c < 8; c++) {
        var p = this.board[r][c];
        if (p && p.type === 'k' && p.color === color) return { row: r, col: c };
      }
    return null;
  };

  ChessEngine.prototype.isInCheck = function (color) {
    var k = this.findKing(color);
    if (!k) return false;
    return this.isSquareAttacked(k.row, k.col, color === 'w' ? 'b' : 'w');
  };

  ChessEngine.prototype._pseudoMovesForSquare = function (row, col) {
    var p = this.board[row][col];
    if (!p) return [];
    var moves = [];
    var color = p.color;
    var opp = color === 'w' ? 'b' : 'w';
    var self = this;
    function push(r, c, extra) {
      if (!inBounds(r, c)) return;
      var target = self.board[r][c];
      if (target && target.color === color) return;
      var m = { from: { row: row, col: col }, to: { row: r, col: c }, piece: p.type, color: color, captured: target ? target.type : null };
      if (extra) for (var k in extra) m[k] = extra[k];
      moves.push(m);
    }

    if (p.type === 'p') {
      var dir = color === 'w' ? -1 : 1;
      var startRow = color === 'w' ? 6 : 1;
      var promoRow = color === 'w' ? 0 : 7;
      if (inBounds(row + dir, col) && !this.board[row + dir][col]) {
        if (row + dir === promoRow) {
          ['q', 'r', 'b', 'n'].forEach(function (pr) { push(row + dir, col, { promotion: pr }); });
        } else {
          push(row + dir, col);
        }
        if (row === startRow && !this.board[row + 2 * dir][col]) {
          push(row + 2 * dir, col, { doublePawn: true });
        }
      }
      for (var i = 0; i < 2; i++) {
        var dc = i === 0 ? -1 : 1;
        var r = row + dir, c = col + dc;
        if (!inBounds(r, c)) continue;
        var target = this.board[r][c];
        if (target && target.color === opp) {
          if (r === promoRow) {
            ['q', 'r', 'b', 'n'].forEach(function (pr) {
              moves.push({ from: { row: row, col: col }, to: { row: r, col: c }, piece: 'p', color: color, captured: target.type, promotion: pr });
            });
          } else {
            moves.push({ from: { row: row, col: col }, to: { row: r, col: c }, piece: 'p', color: color, captured: target.type });
          }
        } else if (this.epTarget && this.epTarget.row === r && this.epTarget.col === c) {
          moves.push({ from: { row: row, col: col }, to: { row: r, col: c }, piece: 'p', color: color, captured: 'p', enPassant: true });
        }
      }
    } else if (p.type === 'n') {
      for (var ni = 0; ni < KNIGHT_OFFSETS.length; ni++) push(row + KNIGHT_OFFSETS[ni][0], col + KNIGHT_OFFSETS[ni][1]);
    } else if (p.type === 'k') {
      for (var qi = 0; qi < QUEEN_DIRS.length; qi++) push(row + QUEEN_DIRS[qi][0], col + QUEEN_DIRS[qi][1]);
      var homeRow = color === 'w' ? 7 : 0;
      if (row === homeRow && col === 4 && !this.isInCheck(color)) {
        var kSideRight = color === 'w' ? this.castling.wK : this.castling.bK;
        var qSideRight = color === 'w' ? this.castling.wQ : this.castling.bQ;
        if (kSideRight && !this.board[homeRow][5] && !this.board[homeRow][6] &&
            this.board[homeRow][7] && this.board[homeRow][7].type === 'r' && this.board[homeRow][7].color === color &&
            !this.isSquareAttacked(homeRow, 5, opp) && !this.isSquareAttacked(homeRow, 6, opp)) {
          moves.push({ from: { row: row, col: col }, to: { row: homeRow, col: 6 }, piece: 'k', color: color, captured: null, castle: 'K' });
        }
        if (qSideRight && !this.board[homeRow][3] && !this.board[homeRow][2] && !this.board[homeRow][1] &&
            this.board[homeRow][0] && this.board[homeRow][0].type === 'r' && this.board[homeRow][0].color === color &&
            !this.isSquareAttacked(homeRow, 3, opp) && !this.isSquareAttacked(homeRow, 2, opp)) {
          moves.push({ from: { row: row, col: col }, to: { row: homeRow, col: 2 }, piece: 'k', color: color, captured: null, castle: 'Q' });
        }
      }
    } else {
      var dirs = p.type === 'b' ? BISHOP_DIRS : p.type === 'r' ? ROOK_DIRS : QUEEN_DIRS;
      for (var di = 0; di < dirs.length; di++) {
        var rr = row + dirs[di][0], cc = col + dirs[di][1];
        while (inBounds(rr, cc)) {
          var t = this.board[rr][cc];
          if (t) { if (t.color !== color) push(rr, cc); break; }
          push(rr, cc);
          rr += dirs[di][0]; cc += dirs[di][1];
        }
      }
    }
    return moves;
  };

  ChessEngine.prototype._allPseudoMoves = function (color) {
    var moves = [];
    for (var r = 0; r < 8; r++)
      for (var c = 0; c < 8; c++) {
        var p = this.board[r][c];
        if (p && p.color === color) moves = moves.concat(this._pseudoMovesForSquare(r, c));
      }
    return moves;
  };

  ChessEngine.prototype._applyMoveInPlace = function (move) {
    var from = move.from, to = move.to, piece = move.piece, color = move.color, promotion = move.promotion;
    this.board[from.row][from.col] = null;
    this.board[to.row][to.col] = { type: promotion || piece, color: color };
    if (move.enPassant) {
      var capRow = color === 'w' ? to.row + 1 : to.row - 1;
      this.board[capRow][to.col] = null;
    }
    if (move.castle === 'K') {
      this.board[to.row][5] = this.board[to.row][7];
      this.board[to.row][7] = null;
    } else if (move.castle === 'Q') {
      this.board[to.row][3] = this.board[to.row][0];
      this.board[to.row][0] = null;
    }
  };

  ChessEngine.prototype._updateCastlingRightsAfter = function (move) {
    var clear = (function (self) {
      return function (r, c) {
        if (r === 7 && c === 4) { self.castling.wK = false; self.castling.wQ = false; }
        else if (r === 0 && c === 4) { self.castling.bK = false; self.castling.bQ = false; }
        else if (r === 7 && c === 0) self.castling.wQ = false;
        else if (r === 7 && c === 7) self.castling.wK = false;
        else if (r === 0 && c === 0) self.castling.bQ = false;
        else if (r === 0 && c === 7) self.castling.bK = false;
      };
    })(this);
    clear(move.from.row, move.from.col);
    clear(move.to.row, move.to.col);
  };

  ChessEngine.prototype._legalMovesForColor = function (color) {
    var pseudo = this._allPseudoMoves(color);
    var legal = [];
    var savedBoard = this.board;
    for (var i = 0; i < pseudo.length; i++) {
      var m = pseudo[i];
      this.board = cloneBoard(savedBoard);
      this._applyMoveInPlace(m);
      if (!this.isInCheck(color)) legal.push(m);
      this.board = savedBoard;
    }
    return legal;
  };

  ChessEngine.prototype.legalMoves = function (colorOverride) {
    return this._legalMovesForColor(colorOverride || this.turn);
  };

  ChessEngine.prototype.movesFrom = function (squareStr) {
    var s = typeof squareStr === 'string' ? parseSq(squareStr) : squareStr;
    return this.legalMoves(this.turn).filter(function (m) { return m.from.row === s.row && m.from.col === s.col; });
  };

  ChessEngine.prototype.makeMove = function (fromStr, toStr, promotionChoice) {
    var from = typeof fromStr === 'string' ? parseSq(fromStr) : fromStr;
    var to = typeof toStr === 'string' ? parseSq(toStr) : toStr;
    var legal = this.legalMoves(this.turn);
    var candidates = legal.filter(function (m) {
      return m.from.row === from.row && m.from.col === from.col && m.to.row === to.row && m.to.col === to.col;
    });
    var move = candidates[0];
    if (candidates.length > 1) {
      move = candidates.filter(function (m) { return m.promotion === promotionChoice; })[0] ||
             candidates.filter(function (m) { return m.promotion === 'q'; })[0];
    }
    if (!move) return null;

    this.undoStack.push({
      board: cloneBoard(this.board),
      turn: this.turn,
      castling: { wK: this.castling.wK, wQ: this.castling.wQ, bK: this.castling.bK, bQ: this.castling.bQ },
      epTarget: this.epTarget ? { row: this.epTarget.row, col: this.epTarget.col } : null,
      halfmoveClock: this.halfmoveClock,
      fullmoveNumber: this.fullmoveNumber,
      positionCounts: new Map(this.positionCounts)
    });

    var san = this._computeSAN(move, legal);

    this._applyMoveInPlace(move);
    this._updateCastlingRightsAfter(move);
    this.epTarget = move.doublePawn ? { row: (move.from.row + move.to.row) / 2, col: move.from.col } : null;
    if (move.piece === 'p' || move.captured) this.halfmoveClock = 0; else this.halfmoveClock++;
    if (this.turn === 'b') this.fullmoveNumber++;
    this.turn = this.turn === 'w' ? 'b' : 'w';
    this._recordPosition();

    var record = {
      san: san, from: sq(move.from.row, move.from.col), to: sq(move.to.row, move.to.col),
      piece: move.piece, color: move.color, captured: move.captured || null,
      promotion: move.promotion || null, castle: move.castle || null, enPassant: !!move.enPassant
    };
    this.history.push(record);
    return record;
  };

  ChessEngine.prototype.undoMove = function () {
    if (!this.undoStack.length) return false;
    var snap = this.undoStack.pop();
    this.board = snap.board;
    this.turn = snap.turn;
    this.castling = snap.castling;
    this.epTarget = snap.epTarget;
    this.halfmoveClock = snap.halfmoveClock;
    this.fullmoveNumber = snap.fullmoveNumber;
    this.positionCounts = snap.positionCounts;
    this.history.pop();
    return true;
  };

  ChessEngine.prototype._computeSAN = function (move, legalMovesBeforeMove) {
    if (move.castle === 'K') return this._suffixSAN('O-O', move);
    if (move.castle === 'Q') return this._suffixSAN('O-O-O', move);
    var pieceLetter = move.piece === 'p' ? '' : move.piece.toUpperCase();
    var disambig = '';
    if (move.piece !== 'p') {
      var others = legalMovesBeforeMove.filter(function (m) {
        return m.piece === move.piece && m.color === move.color &&
               m.to.row === move.to.row && m.to.col === move.to.col &&
               !(m.from.row === move.from.row && m.from.col === move.from.col);
      });
      if (others.length) {
        var sameFile = others.some(function (m) { return m.from.col === move.from.col; });
        var sameRank = others.some(function (m) { return m.from.row === move.from.row; });
        if (!sameFile) disambig = FILES[move.from.col];
        else if (!sameRank) disambig = String(8 - move.from.row);
        else disambig = FILES[move.from.col] + String(8 - move.from.row);
      }
    }
    var capture = move.captured ? 'x' : '';
    if (move.piece === 'p' && capture) disambig = FILES[move.from.col];
    var dest = sq(move.to.row, move.to.col);
    var promo = move.promotion ? '=' + move.promotion.toUpperCase() : '';
    return this._suffixSAN(pieceLetter + disambig + capture + dest + promo, move);
  };

  ChessEngine.prototype._suffixSAN = function (base, move) {
    var savedBoard = this.board;
    this.board = cloneBoard(this.board);
    this._applyMoveInPlace(move);
    var opp = move.color === 'w' ? 'b' : 'w';
    var check = this.isInCheck(opp);
    var mate = false;
    if (check) mate = this._legalMovesForColor(opp).length === 0;
    this.board = savedBoard;
    if (mate) return base + '#';
    if (check) return base + '+';
    return base;
  };

  ChessEngine.prototype.getStatus = function () {
    var color = this.turn;
    var inCheck = this.isInCheck(color);
    var moves = this.legalMoves(color);
    var noMoves = moves.length === 0;
    var result = 'playing', reason = null;
    if (noMoves && inCheck) { result = 'checkmate'; reason = 'checkmate'; }
    else if (noMoves && !inCheck) { result = 'draw'; reason = 'stalemate'; }
    else if (this.halfmoveClock >= 100) { result = 'draw'; reason = 'fifty-move'; }
    else if (this.positionCounts.get(this._positionKey()) >= 3) { result = 'draw'; reason = 'repetition'; }
    else if (this._insufficientMaterial()) { result = 'draw'; reason = 'insufficient-material'; }
    return { turn: color, inCheck: inCheck, result: result, reason: reason, isGameOver: result !== 'playing' };
  };

  ChessEngine.prototype._insufficientMaterial = function () {
    var pieces = [];
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = this.board[r][c];
      if (p && p.type !== 'k') pieces.push(p);
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1 && (pieces[0].type === 'n' || pieces[0].type === 'b')) return true;
    return false;
  };

  // --- Rutas rápidas para búsqueda (IA / perft): sin SAN, sin historial, sin notación ---

  ChessEngine.prototype._fastMake = function (move) {
    this._searchStack.push({
      board: cloneBoard(this.board),
      turn: this.turn,
      castling: { wK: this.castling.wK, wQ: this.castling.wQ, bK: this.castling.bK, bQ: this.castling.bQ },
      epTarget: this.epTarget ? { row: this.epTarget.row, col: this.epTarget.col } : null,
      halfmoveClock: this.halfmoveClock,
      fullmoveNumber: this.fullmoveNumber
    });
    this._applyMoveInPlace(move);
    this._updateCastlingRightsAfter(move);
    this.epTarget = move.doublePawn ? { row: (move.from.row + move.to.row) / 2, col: move.from.col } : null;
    if (move.piece === 'p' || move.captured) this.halfmoveClock = 0; else this.halfmoveClock++;
    if (this.turn === 'b') this.fullmoveNumber++;
    this.turn = this.turn === 'w' ? 'b' : 'w';
  };

  ChessEngine.prototype._fastUnmake = function () {
    var snap = this._searchStack.pop();
    this.board = snap.board;
    this.turn = snap.turn;
    this.castling = snap.castling;
    this.epTarget = snap.epTarget;
    this.halfmoveClock = snap.halfmoveClock;
    this.fullmoveNumber = snap.fullmoveNumber;
  };

  ChessEngine.prototype.perft = function (depth, color) {
    color = color || this.turn;
    if (depth === 0) return 1;
    var moves = this.legalMoves(color);
    if (depth === 1) return moves.length;
    var nodes = 0;
    for (var i = 0; i < moves.length; i++) {
      this._fastMake(moves[i]);
      nodes += this.perft(depth - 1, this.turn);
      this._fastUnmake();
    }
    return nodes;
  };

  ChessEngine.START_FEN = START_FEN;
  ChessEngine.PIECE_VALUES = PIECE_VALUES;
  ChessEngine.sq = sq;
  ChessEngine.parseSq = parseSq;
  ChessEngine.cloneBoard = cloneBoard;

  return ChessEngine;
}));
