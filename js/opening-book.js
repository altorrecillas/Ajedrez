/*
 * Libro de aperturas minimo para la IA. La IA siempre juega con negras (el humano juega blancas),
 * asi que el libro solo necesita cubrir respuestas de negras a las aperturas mas habituales.
 * Lineas de teoria de dominio publico (nombres/jugadas no son propiedad de nadie), escritas a mano.
 * Formato UCI (mismo formato que usan los puzzles), para poder cotejar directamente con el historial.
 */
(function (root) {
  'use strict';

  var LINES = [
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'],
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6'],
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f3d4', 'g8f6'],
    ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5', 'd7d6', 'e5f3', 'f6e4'],
    ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'],
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6'],
    ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'f1b5', 'g7g6', 'e1g1', 'f8g7'],
    ['e2e4', 'c7c5', 'b1c3', 'b8c6', 'g2g3', 'g7g6', 'f1g2', 'f8g7'],
    ['e2e4', 'c7c5', 'g1f3', 'e7e6', 'd2d4', 'c5d4', 'f3d4', 'b8c6'],
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6', 'c1g5', 'f8e7'],
    ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1d2', 'g8f6', 'e4e5', 'f6d7'],
    ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'c8f5'],
    ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a5', 'd2d4', 'g8f6'],
    ['e2e4', 'g8f6', 'e4e5', 'f6d5', 'd2d4', 'd7d6'],
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7'],
    ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'e7e6'],
    ['d2d4', 'd7d5', 'c2c4', 'd5c4', 'g1f3', 'g8f6'],
    ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6'],
    ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'e2e3', 'e8g8'],
    ['d2d4', 'g8f6', 'g1f3', 'e7e6', 'c2c4', 'd7d5', 'b1c3', 'f8e7'],
    ['d2d4', 'g8f6', 'g1f3', 'g7g6', 'c2c4', 'f8g7', 'b1c3', 'e8g8'],
    ['d2d4', 'f7f5', 'g1f3', 'g8f6', 'g2g3', 'e7e6'],
    ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g1f3', 'b8c6', 'g2g3', 'd7d5'],
    ['c2c4', 'g8f6', 'b1c3', 'e7e6', 'g1f3', 'd7d5'],
    ['g1f3', 'd7d5', 'g2g3', 'g8f6', 'f1g2', 'e7e6', 'e1g1', 'f8e7'],
    ['g2g3', 'd7d5', 'f1g2', 'g8f6', 'g1f3', 'e7e6', 'e1g1', 'f8e7'],
    ['b2b3', 'e7e5', 'c1b2', 'b8c6']
  ];

  var book = new Map();
  LINES.forEach(function (line) {
    for (var i = 0; i < line.length - 1; i += 2) {
      var prefix = line.slice(0, i + 1).join(' ');
      if (!book.has(prefix)) book.set(prefix, []);
      var arr = book.get(prefix);
      if (arr.indexOf(line[i + 1]) === -1) arr.push(line[i + 1]);
    }
  });

  function move(uciHistory) {
    var candidates = book.get(uciHistory.join(' '));
    if (!candidates || !candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  root.OpeningBook = { move: move };
})(typeof window !== 'undefined' ? window : this);
