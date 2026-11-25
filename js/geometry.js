/*
 * Generazione della geometria di taglio (mm, asse Y verso il basso).
 *
 * Ogni "path" è { layer: 'cut' | 'crease', pts: [[x,y],...], closed: bool }.
 * Le dimensioni di input sono SEMPRE convertite in dimensioni interne prima
 * di costruire il fustellato; lo spessore `t` compensa le cordonature:
 *  - 0201: pannello = dim_interna + t ; altezza corpo = H + t
 *  - vassoio: base = dim_interna + 2t ; parete = H + t/2
 */
(function (root) {
  'use strict';

  const r2 = (n) => Math.round(n * 100) / 100;

  function bounds(paths) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of paths) for (const [x, y] of p.pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  function translate(paths, dx, dy) {
    return paths.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [r2(x + dx), r2(y + dy)]) }));
  }

  function normalize(paths) {
    const b = bounds(paths);
    return translate(paths, -b.minX, -b.minY);
  }

  /* ---------- FEFCO 0201 (scatola americana) ---------- */
  function box0201(inner, t, opt) {
    const { L, P, H } = inner;
    const G = opt.glue;                       // aletta di incollaggio
    const s = opt.slot;                       // larghezza dei tagli tra alette
    const a = L + t, b = P + t;               // pannelli (lato L, lato P)
    const Hb = H + t;                         // altezza corpo
    const F = P / 2 + t / 2;                  // altezza alette
    const k = Math.min(8, G / 2);             // smusso aletta incollaggio

    const e = [G, G + a, G + a + b, G + 2 * a + b, G + 2 * a + 2 * b]; // bordi pannelli
    const X = e[4], Y = Hb + 2 * F;
    const inner3 = [e[1], e[2], e[3]];        // cordonature verticali interne

    const pts = [[G, F], [G, 0]];
    for (const c of inner3) pts.push([c - s / 2, 0], [c - s / 2, F], [c + s / 2, F], [c + s / 2, 0]);
    pts.push([X, 0], [X, Y]);
    for (const c of [...inner3].reverse()) pts.push([c + s / 2, Y], [c + s / 2, Y - F], [c - s / 2, Y - F], [c - s / 2, Y]);
    pts.push([G, Y], [G, F + Hb]);
    // aletta di incollaggio con angoli smussati
    pts.push([k, F + Hb], [0, F + Hb - k], [0, F + k], [k, F]);

    const paths = [{ layer: 'cut', pts, closed: true }];

    // cordonature verticali (tra le alette e il corpo)
    for (const x of [e[0], ...inner3]) paths.push({ layer: 'crease', pts: [[x, F], [x, F + Hb]], closed: false });
    // cordonature orizzontali, interrotte dove ci sono i tagli
    for (const y of [F, F + Hb]) {
      for (let i = 0; i < 4; i++) {
        const x1 = e[i] + (i > 0 ? s / 2 : 0);
        const x2 = e[i + 1] - (i < 3 ? s / 2 : 0);
        paths.push({ layer: 'crease', pts: [[x1, y], [x2, y]], closed: false });
      }
    }
    return normalize(paths);
  }

  /* ---------- Vassoio (fondo o coperchio) con linguette ---------- */
  function tray(inner, t, opt) {
    const { L, P, H } = inner;
    const BL = L + 2 * t, BP = P + 2 * t;
    const Hh = H + t / 2;
    const Tw = Math.min(Hh, opt.tab);
    const k = Math.min(6, Tw / 2);
    const g = Math.max(t, 1);

    const pts = [
      [0, -Hh], [BL, -Hh],
      [BL + Tw - k, -Hh], [BL + Tw, -Hh + k], [BL + Tw, -g - k], [BL + Tw - k, -g], [BL, -g],
      [BL, 0], [BL + Hh, 0], [BL + Hh, BP], [BL, BP],
      [BL, BP + g], [BL + Tw - k, BP + g], [BL + Tw, BP + g + k], [BL + Tw, BP + Hh - k], [BL + Tw - k, BP + Hh],
      [BL, BP + Hh], [0, BP + Hh],
      [-Tw + k, BP + Hh], [-Tw, BP + Hh - k], [-Tw, BP + g + k], [-Tw + k, BP + g], [0, BP + g],
      [0, BP], [-Hh, BP], [-Hh, 0], [0, 0],
      [0, -g], [-Tw + k, -g], [-Tw, -g - k], [-Tw, -Hh + k], [-Tw + k, -Hh],
    ];
    const paths = [{ layer: 'cut', pts, closed: true }];
    const cr = (x1, y1, x2, y2) => paths.push({ layer: 'crease', pts: [[x1, y1], [x2, y2]], closed: false });
    cr(0, 0, BL, 0); cr(0, BP, BL, BP); cr(0, 0, 0, BP); cr(BL, 0, BL, BP);
    // cerniere linguette
    for (const x of [0, BL]) { cr(x, -Hh, x, -g); cr(x, BP + g, x, BP + Hh); }
    return normalize(paths);
  }

  /* ---------- Scatola fondo + coperchio ---------- */
  function boxLid(inner, t, opt) {
    const c = opt.clearance;
    const base = tray(inner, t, opt);
    const lidInner = { L: inner.L + 2 * t + 2 * c, P: inner.P + 2 * t + 2 * c, H: opt.lidHeight };
    const lid = tray(lidInner, t, opt);
    const bb = bounds(base);
    const all = base.concat(translate(lid, bb.w + 15, 0));
    return normalize(all);
  }

  /* ---------- API ---------- */
  /**
   * params: { type:'0201'|'lid', dimMode:'inner'|'outer', L,P,H, t,
   *           glue, slot, tab, clearance, lidHeight }
   */
  function build(params) {
    const t = params.t;
    const opt = {
      glue: params.glue, slot: params.slot, tab: params.tab,
      clearance: params.clearance, lidHeight: params.lidHeight,
    };
    let inner = { L: params.L, P: params.P, H: params.H };
    if (params.dimMode === 'outer') {
      if (params.type === 'lid') {
        // L,P riferite al coperchio chiuso; il fondo sta dentro con gioco
        inner = { L: params.L - 4 * t - 2 * opt.clearance, P: params.P - 4 * t - 2 * opt.clearance, H: params.H };
      } else {
        inner = { L: params.L - 2 * t, P: params.P - 2 * t, H: params.H - 2 * t };
      }
    }
    if (inner.L <= 0 || inner.P <= 0 || inner.H <= 0) throw new Error('Dimensioni troppo piccole rispetto allo spessore.');
    const paths = params.type === 'lid' ? boxLid(inner, t, opt) : box0201(inner, t, opt);
    const b = bounds(paths);
    return { paths, width: r2(b.w), height: r2(b.h), inner };
  }

  const api = { build, bounds, translate, normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Geometry = api;
})(typeof window !== 'undefined' ? window : globalThis);
