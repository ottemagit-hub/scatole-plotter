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

  /* ---------- Scatole a pannelli con alette (0201, 0203, aperta, manicotto) ---------- */
  function simplify(pts) {
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (q && q[0] === p[0] && q[1] === p[1]) continue;
      out.push(p);
    }
    // elimina i punti allineati
    const res = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) > 1e-9) res.push(b);
    }
    return res;
  }

  function slotted(inner, t, opt, variant) {
    const { L, P, H } = inner;
    const G = opt.glue;                       // aletta di incollaggio
    const s = opt.slot;                       // larghezza dei tagli tra alette
    const a = L + t, b = P + t;               // pannelli (lato L, lato P)
    const Hb = H + t;                         // altezza corpo
    const half = P / 2 + t / 2;               // alette che si incontrano a metà
    const full = P + t;                       // alette a tutta larghezza
    const k = Math.min(8, G / 2);             // smusso aletta incollaggio

    // altezze alette per pannello [L, P, L, P]
    const fl = {
      '0201': { top: [half, half, half, half], bot: [half, half, half, half] },
      '0203': { top: [full, half, full, half], bot: [full, half, full, half] },
      'hsc': { top: [half, half, half, half], bot: [0, 0, 0, 0] },
      'sleeve': { top: [0, 0, 0, 0], bot: [0, 0, 0, 0] },
    }[variant];
    const T = Math.max(...fl.top), B = Math.max(...fl.bot);

    const e = [G, G + a, G + a + b, G + 2 * a + b, G + 2 * a + 2 * b]; // bordi pannelli
    const X = e[4], Yb = T + Hb, Y = Yb + B;
    const xa = (i) => e[i] + (i > 0 ? s / 2 : 0);
    const xb = (i) => e[i + 1] - (i < 3 ? s / 2 : 0);

    const pts = [];
    for (let i = 0; i < 4; i++) pts.push([xa(i), T], [xa(i), T - fl.top[i]], [xb(i), T - fl.top[i]], [xb(i), T]);
    pts.push([X, Yb]);
    for (let i = 3; i >= 0; i--) pts.push([xb(i), Yb], [xb(i), Yb + fl.bot[i]], [xa(i), Yb + fl.bot[i]], [xa(i), Yb]);
    // aletta di incollaggio con angoli smussati
    pts.push([G, Yb], [k, Yb], [0, Yb - k], [0, T + k], [k, T]);

    const paths = [{ layer: 'cut', pts: simplify(pts), closed: true }];

    // cordonature verticali del corpo
    for (const x of [e[0], e[1], e[2], e[3]]) paths.push({ layer: 'crease', pts: [[x, T], [x, Yb]], closed: false });
    // cordonature orizzontali alla base delle alette (interrotte dai tagli)
    for (let i = 0; i < 4; i++) {
      if (fl.top[i] > 0) paths.push({ layer: 'crease', pts: [[xa(i), T], [xb(i), T]], closed: false });
      if (fl.bot[i] > 0) paths.push({ layer: 'crease', pts: [[xa(i), Yb], [xb(i), Yb]], closed: false });
    }
    return normalize(paths);
  }

  /* ---------- Vassoio (fondo o coperchio) con linguette ---------- */
  function tray(inner, t, opt, hinged) {
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
    if (hinged) {
      // coperchio attaccato alla parete posteriore + risvolto frontale
      const LP = BP + t;                          // profondità coperchio
      const Hl = Math.min(opt.lidHeight, Hh);     // altezza risvolto
      const c = Math.min(5, Hl / 2), ins = Math.max(t, 1);
      const y1 = -Hh - LP, y2 = y1 - Hl;
      pts.splice(1, 0,
        [0, y1], [ins, y1], [ins, y2 + c], [ins + c, y2],
        [BL - ins - c, y2], [BL - ins, y2 + c], [BL - ins, y1], [BL, y1]);
      cr(0, -Hh, BL, -Hh);                        // cerniera coperchio
      cr(ins, y1, BL - ins, y1);                  // piega risvolto
    }
    cr(0, 0, BL, 0); cr(0, BP, BL, BP); cr(0, 0, 0, BP); cr(BL, 0, BL, BP);
    // cerniere linguette
    for (const x of [0, BL]) { cr(x, -Hh, x, -g); cr(x, BP + g, x, BP + Hh); }
    return normalize(paths);
  }

  /* ---------- Scatola fondo + coperchio separato ---------- */
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
   * params: { type:'0201'|'0203'|'hsc'|'sleeve'|'tray'|'lid'|'hinge', dimMode:'inner'|'outer', L,P,H, t,
   *           glue, slot, tab, clearance, lidHeight }
   */
  function build(params) {
    const t = params.t;
    const opt = {
      glue: params.glue, slot: params.slot, tab: params.tab,
      clearance: params.clearance, lidHeight: params.lidHeight,
    };
    const type = params.type;
    const isTray = type === 'tray' || type === 'hinge' || type === 'lid';
    let inner = { L: params.L, P: params.P, H: params.H };
    if (params.dimMode === 'outer') {
      if (type === 'lid') {
        // L,P riferite al coperchio chiuso; il fondo sta dentro con gioco
        inner = { L: params.L - 4 * t - 2 * opt.clearance, P: params.P - 4 * t - 2 * opt.clearance, H: params.H };
      } else if (isTray) {
        inner = { L: params.L - 2 * t, P: params.P - 2 * t, H: params.H - t };
      } else {
        const bottoms = type === 'sleeve' ? 0 : type === 'hsc' ? 1 : 2;
        inner = { L: params.L - 2 * t, P: params.P - 2 * t, H: params.H - bottoms * t };
      }
    }
    if (inner.L <= 0 || inner.P <= 0 || inner.H <= 0) throw new Error('Dimensioni troppo piccole rispetto allo spessore.');
    let paths;
    if (type === 'lid') paths = boxLid(inner, t, opt);
    else if (type === 'tray') paths = tray(inner, t, opt, false);
    else if (type === 'hinge') paths = tray(inner, t, opt, true);
    else paths = slotted(inner, t, opt, type);
    const b = bounds(paths);
    return { paths, width: r2(b.w), height: r2(b.h), inner };
  }

  const api = { build, bounds, translate, normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Geometry = api;
})(typeof window !== 'undefined' ? window : globalThis);
