/*
 * Set de piezas de ajedrez en SVG vectorial original (estilo Staunton, flat-design con volumen).
 * viewBox 0 0 45 45. Usa degradados y brillos compartidos definidos una vez en index.html
 * (ids gPieceWhite / gPieceBlack / gPieceShine / gPieceShadow) para no duplicar <defs> por pieza.
 * Sin dependencias ni assets externos: escalable a cualquier tamaño sin perder nitidez.
 */
(function (root) {
  'use strict';

  function svg(inner) {
    return '<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }

  var PALETTE = {
    w: { fill: 'url(#gPieceWhite)', stroke: '#6b4f24', shineOpacity: 0.55 },
    b: { fill: 'url(#gPieceBlack)', stroke: '#000000', shineOpacity: 0.28 }
  };

  function g(color, strokeWidth, content) {
    var p = PALETTE[color];
    return '<g fill="' + p.fill + '" stroke="' + p.stroke + '" stroke-width="' + strokeWidth +
      '" stroke-linejoin="round" stroke-linecap="round">' + content + '</g>';
  }
  function lineAccent(color, strokeWidth, content) {
    var p = PALETTE[color];
    return '<g fill="none" stroke="' + p.stroke + '" stroke-width="' + strokeWidth +
      '" stroke-linecap="round" stroke-linejoin="round" opacity="0.75">' + content + '</g>';
  }
  function dotAccent(color, content) {
    var p = PALETTE[color];
    return '<g fill="' + p.stroke + '" stroke="none">' + content + '</g>';
  }
  function shadow(cx, rx) {
    return '<ellipse cx="' + cx + '" cy="40.5" rx="' + rx + '" ry="2" fill="url(#gPieceShadow)"/>';
  }
  function shine(color, cx, cy, rx, ry, rotate) {
    var p = PALETTE[color];
    var t = rotate ? ' transform="rotate(' + rotate + ' ' + cx + ' ' + cy + ')"' : '';
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry +
      '" fill="url(#gPieceShine)" opacity="' + p.shineOpacity + '"' + t + '/>';
  }

  function pawn(color) {
    return svg(
      shadow(22.5, 8.6) +
      g(color, 1.3,
        '<circle cx="22.5" cy="11.3" r="5.3"/>' +
        '<path d="M17 19.5 C17 16.2 19 14.2 22.5 14.2 C26 14.2 28 16.2 28 19.5 L30.3 32 C30.3 34 29 35 27 35 L18 35 C16 35 14.7 34 14.7 32 Z"/>' +
        '<rect x="13.3" y="35" width="18.4" height="4.4" rx="1.3"/>'
      ) +
      shine(color, 20, 9.2, 2.1, 2.8)
    );
  }

  function knight(color) {
    return svg(
      shadow(21.5, 12.5) +
      g(color, 1.3,
        '<path d="M9 36 C8.5 29 10 25 10 24 C8.5 20 10 17 10 17 C11 12 14 9 17 8 C19 7 20 6.5 21 6.3 L23.5 2 L26 6.5 C28 8.5 29.5 10.5 31 12.5 C32.5 14 34 15 34.5 16.5 C33 17 32 17.3 31.8 18 C33 19 34 20 33 21.5 C31 24 29 26 28 28 C26.5 31 25 34 23.5 36 Z"/>' +
        '<rect x="9" y="36" width="25.5" height="4.2" rx="1.3"/>'
      ) +
      dotAccent(color, '<circle cx="17.5" cy="13.8" r="1.05"/>') +
      lineAccent(color, 1.1, '<path d="M11 22.4 C13.4 21 16 20.9 18 21.9"/>') +
      shine(color, 25, 15.5, 2.6, 4.4, -30)
    );
  }

  function bishop(color) {
    return svg(
      shadow(22.5, 7.4) +
      g(color, 1.3,
        '<circle cx="22.5" cy="8.3" r="2.5"/>' +
        '<path d="M22.5 12.8 C27.4 15.8 29.8 20.3 28.8 25.2 C28.2 28.1 26.2 30.2 23.5 30.9 L23.5 33.3 L27 33.3 C28 33.3 28.5 34.1 28.5 35 C28.5 36.3 27.3 36.8 26 36.8 L19 36.8 C17.7 36.8 16.5 36.3 16.5 35 C16.5 34.1 17 33.3 18 33.3 L21.5 33.3 L21.5 30.9 C18.8 30.2 16.8 28.1 16.2 25.2 C15.2 20.3 17.6 15.8 22.5 12.8 Z"/>' +
        '<rect x="15.5" y="36.8" width="14" height="3.7" rx="1.1"/>'
      ) +
      lineAccent(color, 1.2, '<path d="M19.2 16.8 L25.8 20.6"/>') +
      shine(color, 20.5, 20, 2.4, 5.4, -14)
    );
  }

  function rook(color) {
    return svg(
      shadow(22.5, 11) +
      g(color, 1.3,
        '<path d="M12 11 L12 15.5 L15 15.5 L15 12.8 L18 12.8 L18 15.5 L27 15.5 L27 12.8 L30 12.8 L30 15.5 L33 15.5 L33 11 Z"/>' +
        '<path d="M13.5 15.5 L13 27 L16 30 L16 33 L29 33 L29 30 L32 27 L31.5 15.5 Z"/>' +
        '<rect x="12" y="33" width="21" height="4.4" rx="1.2"/>'
      ) +
      lineAccent(color, 1.1, '<path d="M15.5 19.5 L29.5 19.5"/>') +
      shine(color, 18, 24, 2.5, 7)
    );
  }

  function queen(color) {
    return svg(
      shadow(22.5, 10.4) +
      g(color, 1.3,
        '<circle cx="9.5" cy="9.5" r="2.1"/>' +
        '<circle cx="22.5" cy="7" r="2.1"/>' +
        '<circle cx="35.5" cy="9.5" r="2.1"/>' +
        '<circle cx="15.5" cy="12" r="1.8"/>' +
        '<circle cx="29.5" cy="12" r="1.8"/>' +
        '<path d="M9.5 11.5 L15 27 L30 27 L35.5 11.5 L29.5 14 L27 12 L26 18 L22.5 12.5 L19 18 L18 12 L15.5 14 Z"/>' +
        '<path d="M14.5 27 C14.5 30 16.5 31.5 19 32 L19 33.6 L26 33.6 L26 32 C28.5 31.5 30.5 30 30.5 27 Z"/>' +
        '<rect x="13" y="36" width="19" height="4.2" rx="1.2"/>'
      ) +
      shine(color, 19, 19.5, 2.8, 5.6, -12)
    );
  }

  function king(color) {
    return svg(
      shadow(22.5, 9.4) +
      lineAccent(color, 1.5, '<path d="M22.5 6 L22.5 12"/><path d="M19.3 9.2 L25.7 9.2"/>') +
      g(color, 1.3,
        '<path d="M22.5 13 C28 16.5 30.5 21 29.5 26 C29 28.7 27.2 30.7 24.7 31.5 L24.7 33.6 L28 33.6 C29 33.6 29.6 34.4 29.6 35.3 C29.6 36.4 28.6 37 27.5 37 L17.5 37 C16.4 37 15.4 36.4 15.4 35.3 C15.4 34.4 16 33.6 17 33.6 L20.3 33.6 L20.3 31.5 C17.8 30.7 16 28.7 15.5 26 C14.5 21 17 16.5 22.5 13 Z"/>' +
        '<rect x="14.5" y="37" width="16" height="4.2" rx="1.2"/>'
      ) +
      lineAccent(color, 1.1, '<path d="M17 22.5 C20 20.5 25 20.5 28 22.5"/>') +
      shine(color, 19.5, 21, 2.8, 6.2, -12)
    );
  }

  var SVGS = { p: {}, n: {}, b: {}, r: {}, q: {}, k: {} };
  ['w', 'b'].forEach(function (c) {
    SVGS.p[c] = pawn(c);
    SVGS.n[c] = knight(c);
    SVGS.b[c] = bishop(c);
    SVGS.r[c] = rook(c);
    SVGS.q[c] = queen(c);
    SVGS.k[c] = king(c);
  });

  // API: CHESS_PIECE_SVGS[type][color] -> markup completo con <svg>.
  // CHESS_PIECE_INNER[type] -> markup del rey blanco sin degradados de fondo, para el logo de marca.
  root.CHESS_PIECE_SVGS = SVGS;
  root.CHESS_PIECE_INNER = { k: king('w').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') };
})(typeof window !== 'undefined' ? window : this);
