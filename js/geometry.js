/*
 * Generazione della geometria di taglio (mm, asse Y verso il basso).
 *
 * Ogni "path" è { layer: 'cut' | 'crease', pts: [[x,y],...], closed: bool }.
 * Le dimensioni di input sono SEMPRE convertite in dimensioni interne prima
 * di costruire il fustellato; lo spessore `t` compensa le cordonature.
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

  function simplify(pts) {
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (q && Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6) continue;
      out.push(p);
    }
    if (out.length > 1) {
      const a = out[0], b = out[out.length - 1];
      if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) out.pop();
    }
    const res = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) > 1e-6) res.push([r2(b[0]), r2(b[1])]);
    }
    return res;
  }

  function arcPts(cx, cy, r, a0, a1, steps) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push([r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))]);
    }
    return pts;
  }

  /* ---------- Serie 02xx a fessura (0201, 0202, 0203, 0204, 0200/hsc, 0501/sleeve) ---------- */
  function slotted(inner, t, opt, variant) {
    const { L, P, H } = inner;
    const G = opt.glue;                       // aletta di incollaggio
    const s = opt.slot;                       // larghezza dei tagli tra alette
    const a = L + t, b = P + t;               // pannelli (lato L, lato P)
    const Hb = H + t;                         // altezza corpo
    const half = P / 2 + t / 2;               // alette che si incontrano a metà
    const full = P + t;                       // alette a tutta larghezza
    const pso = Math.min(full, (P + Math.min(opt.overlap, P)) / 2 + t / 2); // parz. sovrapposte
    const halfL = L / 2 + t / 2;              // alette corte fino al centro (0204)
    const k = Math.min(8, G / 2);             // smusso aletta incollaggio

    // altezze alette per pannello [L, P, L, P]
    const fl = {
      '0201': { top: [half, half, half, half], bot: [half, half, half, half] },
      '0202': { top: [pso, half, pso, half], bot: [pso, half, pso, half] },
      '0203': { top: [full, half, full, half], bot: [full, half, full, half] },
      '0204': { top: [half, halfL, half, halfL], bot: [half, halfL, half, halfL] },
      'hsc': { top: [half, half, half, half], bot: [0, 0, 0, 0] },
      'sleeve': { top: [0, 0, 0, 0], bot: [0, 0, 0, 0] },
    }[variant];
    const T = Math.max(...fl.top), B = Math.max(...fl.bot);

    const e = [G, G + a, G + a + b, G + 2 * a + b, G + 2 * a + 2 * b]; // bordi pannelli
    const X = e[4], Yb = T + Hb;
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

  /* ---------- FEFCO 0211 e 0215 (astuccio con linguetta a incastro / coda di rondine) ---------- */
  function boxTuck(inner, t, opt, snapBottom) {
    const { L, P, H } = inner;
    const G = opt.glue;
    const s = Math.max(opt.slot, t);
    const a = L + t, b = P + t;
    const Hb = H + 2 * t;
    const Dlid = P + t;
    const Htuck = Math.max(12, Math.min(opt.lidHeight, Hb - 6));
    const Ddust = Math.min(r2(0.62 * P + t), Dlid - t);
    const ins = Math.max(t, 1.5);
    const rTuck = Math.min(12, Htuck * 0.45, a * 0.2);
    const rThumb = Math.min(10, a * 0.12, Hb * 0.18);
    const k = Math.min(8, G / 2);

    const e = [G, G + a, G + a + b, G + 2 * a + b, G + 2 * a + 2 * b];
    const Yt = Dlid + Htuck, Yb = Yt + Hb;
    const paths = [];
    const cr = (x1, y1, x2, y2) => paths.push({ layer: 'crease', pts: [[r2(x1), r2(y1)], [r2(x2), r2(y2)]], closed: false });

    // Contorno superiore per pannello i (dir = -1 sopra, +1 sotto)
    const tuckPanel = (x1, x2, y0, dir) => {
      const yLid = y0 + dir * Dlid;
      const yTip = yLid + dir * Htuck;
      cr(x1, y0, x2, y0);
      cr(x1 + ins, yLid, x2 - ins, yLid);
      if (dir < 0) {
        return [
          [x1, y0], [x1, yLid], [x1 + ins, yLid],
          ...arcPts(x1 + ins + rTuck, yTip + rTuck, rTuck, Math.PI, 1.5 * Math.PI, 5),
          ...arcPts(x2 - ins - rTuck, yTip + rTuck, rTuck, 1.5 * Math.PI, 2 * Math.PI, 5),
          [x2 - ins, yLid], [x2, yLid], [x2, y0],
        ];
      }
      return [
        [x2, y0], [x2, yLid], [x2 - ins, yLid],
        ...arcPts(x2 - ins - rTuck, yTip - rTuck, rTuck, 0, 0.5 * Math.PI, 5),
        ...arcPts(x1 + ins + rTuck, yTip - rTuck, rTuck, 0.5 * Math.PI, Math.PI, 5),
        [x1 + ins, yLid], [x1, yLid], [x1, y0],
      ];
    };

    const dustFlap = (x1, x2, y0, dir, notchLeft) => {
      const ch = Math.min(10, (x2 - x1) * 0.22, Ddust * 0.4);
      const step = Math.min(Htuck * 0.45, Ddust * 0.35);
      cr(x1, y0, x2, y0);
      if (dir < 0) {
        return notchLeft
          ? [[x1, y0], [x1 + ch * 0.5, y0 - step], [x1 + ch, y0 - Ddust], [x2 - ch, y0 - Ddust], [x2, y0 - Ddust + ch], [x2, y0]]
          : [[x1, y0], [x1, y0 - Ddust + ch], [x1 + ch, y0 - Ddust], [x2 - ch, y0 - Ddust], [x2 - ch * 0.5, y0 - step], [x2, y0]];
      }
      return notchLeft
        ? [[x2, y0], [x2, y0 + Ddust - ch], [x2 - ch, y0 + Ddust], [x1 + ch, y0 + Ddust], [x1 + ch * 0.5, y0 + step], [x1, y0]]
        : [[x2, y0], [x2 - ch * 0.5, y0 + step], [x2 - ch, y0 + Ddust], [x1 + ch, y0 + Ddust], [x1, y0 + Ddust - ch], [x1, y0]];
    };

    const thumbEdge = (x1, x2, y0, dir) => {
      const xm = (x1 + x2) / 2;
      if (dir < 0) return [[x1, y0], ...arcPts(xm, y0, rThumb, Math.PI, 0, 8), [x2, y0]];
      return [[x2, y0], ...arcPts(xm, y0, rThumb, 0, -Math.PI, 8), [x1, y0]];
    };

    const pts = [];
    // Lato superiore: P0 = coperchio+linguetta, P1 = antipolvere, P2 = invito pollice, P3 = antipolvere
    pts.push(...tuckPanel(e[0], e[1] - s / 2, Yt, -1));
    pts.push(...dustFlap(e[1] + s / 2, e[2] - s / 2, Yt, -1, false));
    pts.push(...thumbEdge(e[2] + s / 2, e[3] - s / 2, Yt, -1));
    pts.push(...dustFlap(e[3] + s / 2, e[4], Yt, -1, true));

    pts.push([e[4], Yb]);

    // Lato inferiore
    if (!snapBottom) {
      // FEFCO 0211: chiusura a incastro sul pannello frontale P2 (reverse tuck)
      pts.push(...dustFlap(e[3] + s / 2, e[4], Yb, 1, false));
      pts.push(...tuckPanel(e[2] + s / 2, e[3] - s / 2, Yb, 1));
      pts.push(...dustFlap(e[1] + s / 2, e[2] - s / 2, Yb, 1, true));
      pts.push(...thumbEdge(e[0], e[1] - s / 2, Yb, 1));
    } else {
      // FEFCO 0215: fondo a coda di rondine (1-2-3 snap-lock)
      const hHalf = P / 2 + t / 2;
      const ext = Math.max(12, Math.min(22, P * 0.2));
      const Dmain = Math.min(P + t, hHalf + ext);
      const wNeck = Math.max(14, Math.min(a - 24, a * 0.36));
      const ear = Math.min(7, (a - wNeck) * 0.25);
      const ch = Math.min(8, b * 0.18);

      // P3 (lato corto destro): aletta sagomata a spalla
      {
        const x1 = e[3] + s / 2, x2 = e[4];
        cr(x1, Yb, x2, Yb);
        pts.push([x2, Yb], [x2 - ch, Yb + hHalf], [x1 + ch, Yb + hHalf], [x1, Yb + hHalf * 0.55], [x1, Yb]);
      }
      // P2 (frontale): aletta femmina con scasso centrale a hHalf
      {
        const x1 = e[2] + s / 2, x2 = e[3] - s / 2, xm = (x1 + x2) / 2;
        const wSlot = wNeck + 2;
        cr(x1, Yb, x2, Yb);
        pts.push(
          [x2, Yb], [x2 - ins, Yb + Dmain - 4], [x2 - ins - 4, Yb + Dmain],
          [xm + wSlot / 2 + 3, Yb + Dmain], [xm + wSlot / 2, Yb + hHalf - t],
          [xm - wSlot / 2, Yb + hHalf - t], [xm - wSlot / 2 - 3, Yb + Dmain],
          [x1 + ins + 4, Yb + Dmain], [x1 + ins, Yb + Dmain - 4], [x1, Yb]
        );
      }
      // P1 (lato corto sinistro): aletta sagomata simmetrica
      {
        const x1 = e[1] + s / 2, x2 = e[2] - s / 2;
        cr(x1, Yb, x2, Yb);
        pts.push([x2, Yb], [x2, Yb + hHalf * 0.55], [x2 - ch, Yb + hHalf], [x1 + ch, Yb + hHalf], [x1, Yb]);
      }
      // P0 (posteriore): aletta maschio a coda di rondine
      {
        const x1 = e[0], x2 = e[1] - s / 2, xm = (x1 + x2) / 2;
        const ySh = Yb + hHalf - t, yNeck = Yb + hHalf + t;
        cr(x1, Yb, x2, Yb);
        pts.push(
          [x2, Yb], [x2 - ins, ySh], [xm + wNeck / 2, ySh], [xm + wNeck / 2, yNeck],
          [xm + wNeck / 2 + ear, yNeck + 2], [xm + wNeck / 2 + ear - 3, Yb + Dmain],
          [xm - wNeck / 2 - ear + 3, Yb + Dmain], [xm - wNeck / 2 - ear, yNeck + 2],
          [xm - wNeck / 2, yNeck], [xm - wNeck / 2, ySh], [x1 + ins, ySh], [x1, Yb]
        );
      }
    }

    // Aletta di incollaggio
    pts.push([G, Yb], [k, Yb], [0, Yb - k], [0, Yt + k], [k, Yt], [G, Yt]);

    paths.unshift({ layer: 'cut', pts: simplify(pts), closed: true });
    for (const x of [e[0], e[1], e[2], e[3]]) cr(x, Yt, x, Yb);
    return normalize(paths);
  }

  /* ---------- FEFCO 0711 (scatola a fondo automatico / crash-lock) ---------- */
  function box0711(inner, t, opt) {
    const { L, P, H } = inner;
    if (L < 0.55 * P) throw new Error('Per FEFCO 0711 la larghezza deve essere almeno il 55% della profondità.');
    const G = opt.glue;
    const s = Math.max(opt.slot, t);
    const a = L + t, b = P + t;
    const Hb = H + t;
    const T = P / 2 + t / 2;
    const Fs = P / 2 + t / 2;
    const Fb = Math.min(r2(0.64 * P + t), r2(a * 0.68));
    const d45 = Math.min(r2(Fs * 0.85), r2(a * 0.36));
    const hook = Math.min(9, a * 0.05);
    const k = Math.min(8, G / 2);

    const e = [G, G + a, G + a + b, G + 2 * a + b, G + 2 * a + 2 * b];
    const Yb = T + Hb;
    const xa = (i) => e[i] + (i > 0 ? s / 2 : 0);
    const xb = (i) => e[i + 1] - (i < 3 ? s / 2 : 0);

    const paths = [];
    const cr = (x1, y1, x2, y2) => paths.push({ layer: 'crease', pts: [[r2(x1), r2(y1)], [r2(x2), r2(y2)]], closed: false });

    const pts = [];
    // Alette superiori tipo 0201
    for (let i = 0; i < 4; i++) {
      pts.push([xa(i), T], [xa(i), 0], [xb(i), 0], [xb(i), T]);
      cr(xa(i), T, xb(i), T);
    }
    pts.push([e[4], Yb]);

    const shortBottom = (x1, x2) => {
      const bevel = Math.min(14, (x2 - x1) * 0.2);
      cr(x1, Yb, x2, Yb);
      return [[x2, Yb], [x2 - bevel, Yb + Fs], [x1, Yb + Fs], [x1, Yb]];
    };

    const longBottom = (x1, x2) => {
      const xm = (x1 + x2) / 2;
      cr(x1, Yb, x2, Yb);
      // cordonatura diagonale a 45° sul triangolo di incollaggio (lato destro dell'aletta)
      cr(x2, Yb, x2 - d45, Yb + d45);
      return [
        [x2, Yb], [x2 - 2, Yb + d45], [x2 - d45, Yb + d45],
        [xm - 2, Yb + Fs - 2], [xm + hook, Yb + Fb],
        [x1 + 3, Yb + Fb], [x1, Yb],
      ];
    };

    pts.push(...shortBottom(xa(3), xb(3)));
    pts.push(...longBottom(xa(2), xb(2)));
    pts.push(...shortBottom(xa(1), xb(1)));
    pts.push(...longBottom(xa(0), xb(0)));

    pts.push([G, Yb], [k, Yb], [0, Yb - k], [0, T + k], [k, T]);

    paths.unshift({ layer: 'cut', pts: simplify(pts), closed: true });
    for (const x of [e[0], e[1], e[2], e[3]]) cr(x, T, x, Yb);
    return normalize(paths);
  }

  /* ---------- FEFCO 0401 (cartella a croce avvolgente) ---------- */
  function box0401(inner, t) {
    const { L, P, H } = inner;
    const BL = L + t, BP = P + t;
    const W1 = H + t;                         // pareti interne (sinistra/destra)
    const W2 = H + 2 * t;                     // pareti esterne (sopra/sotto, avvolgono quelle interne)
    const Fx = L / 2;                         // falde sin/dx che si incontrano al centro
    const Fy = P / 2 + t / 2;                 // falde sup/inf che si incontrano al centro
    const ins = t;
    const k = Math.min(6, Fx * 0.25, Fy * 0.25);

    const pts = [
      [0, 0], [0, -W2], [k, -W2 - Fy], [BL - k, -W2 - Fy], [BL, -W2], [BL, 0],
      [BL, ins], [BL + W1, ins], [BL + W1 + Fx, ins + k], [BL + W1 + Fx, BP - ins - k], [BL + W1, BP - ins], [BL, BP - ins],
      [BL, BP], [BL, BP + W2], [BL - k, BP + W2 + Fy], [k, BP + W2 + Fy], [0, BP + W2], [0, BP],
      [0, BP - ins], [-W1, BP - ins], [-W1 - Fx, BP - ins - k], [-W1 - Fx, ins + k], [-W1, ins], [0, ins],
    ];
    const paths = [{ layer: 'cut', pts: simplify(pts), closed: true }];
    const cr = (x1, y1, x2, y2) => paths.push({ layer: 'crease', pts: [[r2(x1), r2(y1)], [r2(x2), r2(y2)]], closed: false });
    cr(0, 0, BL, 0); cr(0, BP, BL, BP);
    cr(0, -W2, BL, -W2); cr(0, BP + W2, BL, BP + W2);
    cr(0, ins, 0, BP - ins); cr(BL, ins, BL, BP - ins);
    cr(-W1, ins, -W1, BP - ins); cr(BL + W1, ins, BL + W1, BP - ins);
    return normalize(paths);
  }

  /* ---------- FEFCO 0427 (scatola a libro / e-commerce automontante senza colla) ---------- */
  function box0427(inner, t) {
    const { L, P, H } = inner;
    if (H < 3 * t) throw new Error('Altezza troppo bassa rispetto allo spessore per la doppia parete FEFCO 0427.');
    const BL = L + 4 * t;                     // fondo tra le pareti esterne (2t per doppia parete su ogni lato)
    const BP = P + 2 * t;
    const Hw = H + t;                         // altezza pareti principali
    const wRoll = 2 * t + 0.5;                // ponte superiore doppia parete
    const Hin = Math.max(H - t, 6);           // parete interna ripiegata
    const hFoot = t + 1.5;                    // sporgenza piedini di bloccaggio
    const sw = t + 0.5;                       // larghezza fessure sul fondo
    const gLock = 2 * t + 1.5;                // tasca anteriore per le orecchie del coperchio
    const g = Math.max(t, 1.5);               // scarico alette angolari
    const Lear = Math.max(8, Math.min(Hw, (BP - gLock) / 2 - g - 2));
    const LP = P + 2 * t;                     // profondità coperchio
    const Htuck = Math.max(H - t, 8);         // risvolto frontale coperchio
    const gWing = Math.max(2 * t, 2);         // intaglio tra coperchio e orecchie di chiusura
    const Wwing = Math.max(10, Math.min(P * 0.42, 45));
    const k = Math.min(5, Lear * 0.3, Wwing * 0.3);

    // Posizioni Y delle fessure/piedini lungo il fondo [0 .. BP - gLock]
    const usableP = BP - gLock - t;
    const tabLen = usableP >= 110 ? Math.min(26, usableP * 0.22) : Math.min(34, usableP * 0.45);
    const slots = usableP >= 110
      ? [[t + usableP * 0.22 - tabLen / 2, t + usableP * 0.22 + tabLen / 2],
         [t + usableP * 0.78 - tabLen / 2, t + usableP * 0.78 + tabLen / 2]]
      : [[t + (usableP - tabLen) / 2, t + (usableP + tabLen) / 2]];

    const paths = [];
    const cr = (x1, y1, x2, y2) => paths.push({ layer: 'crease', pts: [[r2(x1), r2(y1)], [r2(x2), r2(y2)]], closed: false });

    // Cordonature verticali del fondo x=0 e x=BL, interrotte in corrispondenza delle fessure
    const splitCrease = (x) => {
      let yCur = 0;
      for (const [ya, yb] of slots) {
        if (ya > yCur) cr(x, yCur, x, ya);
        yCur = yb;
      }
      if (yCur < BP) cr(x, yCur, x, BP);
    };
    splitCrease(0);
    splitCrease(BL);

    // Fessure rettangolari di bloccaggio sul fondo
    for (const [ya, yb] of slots) {
      paths.push({ layer: 'cut', pts: [[0, r2(ya)], [r2(sw), r2(ya)], [r2(sw), r2(yb)], [0, r2(yb)]], closed: true });
      paths.push({ layer: 'cut', pts: [[r2(BL - sw), r2(ya)], [r2(BL), r2(ya)], [r2(BL), r2(yb)], [r2(BL - sw), r2(yb)]], closed: true });
    }

    const yLid = -Hw - LP;
    const yTip = yLid - Htuck;
    const ixL = 2 * t, ixR = BL - 2 * t;

    const pts = [];
    // 1) Lato superiore: parete posteriore + coperchio + risvolto frontale con 2 orecchie laterali
    pts.push(
      [0, -Hw], [0, yLid], [ixL, yLid],
      [ixL, yLid - gWing], [ixL - Wwing + k, yLid - gWing], [ixL - Wwing, yLid - gWing - k],
      [ixL - Wwing, yTip + k], [ixL - Wwing + k, yTip], [ixL, yTip],
      [ixR, yTip],
      [ixR + Wwing - k, yTip], [ixR + Wwing, yTip + k],
      [ixR + Wwing, yLid - gWing - k], [ixR + Wwing - k, yLid - gWing], [ixR, yLid - gWing],
      [ixR, yLid], [BL, yLid], [BL, -Hw]
    );
    // Aletta angolare posteriore destra
    pts.push([BL + Lear - k, -Hw], [BL + Lear, -Hw + k], [BL + Lear, -g - k], [BL + Lear - k, -g], [BL, -g], [BL, 0]);

    // 2) Doppia parete destra (dall'alto verso il basso lungo il bordo esterno con i piedini)
    const xR1 = BL + Hw, xR2 = xR1 + wRoll, xR3 = xR2 + Hin;
    pts.push([xR2, 0], [xR2, t], [xR3, t]);
    for (const [ya, yb] of slots) {
      pts.push([xR3, ya + 0.5], [xR3 + hFoot, ya + 1], [xR3 + hFoot, yb - 1], [xR3, yb - 0.5]);
    }
    pts.push([xR3, BP - gLock], [xR2, BP - gLock], [xR2, BP], [BL, BP]);

    // 3) Parete anteriore + alette angolari anteriori (destra e sinistra)
    pts.push(
      [BL, BP + g], [BL + Lear - k, BP + g], [BL + Lear, BP + g + k], [BL + Lear, BP + Hw - k], [BL + Lear - k, BP + Hw],
      [BL, BP + Hw], [0, BP + Hw],
      [-Lear + k, BP + Hw], [-Lear, BP + Hw - k], [-Lear, BP + g + k], [-Lear + k, BP + g], [0, BP + g], [0, BP]
    );

    // 4) Doppia parete sinistra (dal basso verso l'alto)
    const xL1 = -Hw, xL2 = xL1 - wRoll, xL3 = xL2 - Hin;
    pts.push([xL2, BP], [xL2, BP - gLock], [xL3, BP - gLock]);
    for (const [ya, yb] of [...slots].reverse()) {
      pts.push([xL3, yb - 0.5], [xL3 - hFoot, yb - 1], [xL3 - hFoot, ya + 1], [xL3, ya + 0.5]);
    }
    pts.push([xL3, t], [xL2, t], [xL2, 0], [0, 0]);

    // Aletta angolare posteriore sinistra
    pts.push([0, -g], [-Lear + k, -g], [-Lear, -g - k], [-Lear, -Hw + k], [-Lear + k, -Hw]);

    paths.unshift({ layer: 'cut', pts: simplify(pts), closed: true });

    // Cordonature orizzontali e verticali
    cr(0, 0, BL, 0);
    cr(0, BP, BL, BP);
    cr(0, -Hw, BL, -Hw);
    cr(ixL, yLid, ixR, yLid);
    // Orecchie del coperchio
    cr(ixL, yTip, ixL, yLid - gWing);
    cr(ixR, yTip, ixR, yLid - gWing);
    // Cerniere alette angolari
    for (const x of [0, BL]) { cr(x, -Hw, x, -g); cr(x, BP + g, x, BP + Hw); }
    // Doppie cordonature pareti laterali
    cr(xR1, 0, xR1, BP); cr(xR2, t, xR2, BP - gLock);
    cr(xL1, 0, xL1, BP); cr(xL2, t, xL2, BP - gLock);

    return normalize(paths);
  }

  /* ---------- Vassoio (0458 fondo o coperchio, 0422 con coperchio incernierato) ---------- */
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

  /* ---------- FEFCO 0330: Scatola fondo + coperchio separato ---------- */
  function boxLid(inner, t, opt) {
    const c = opt.clearance;
    const base = tray(inner, t, opt);
    const lidInner = { L: inner.L + 2 * t + 2 * c, P: inner.P + 2 * t + 2 * c, H: opt.lidHeight };
    const lid = tray(lidInner, t, opt);
    const bb = bounds(base);
    const all = base.concat(translate(lid, bb.w + 15, 0));
    return normalize(all);
  }

  /* ---------- FEFCO 0901: Falda piana di separazione ---------- */
  function pad0901(inner, opt) {
    const c = opt.clearance;
    const W = Math.max(10, inner.L - 2 * c);
    const D = Math.max(10, inner.P - 2 * c);
    const k = Math.min(3, W * 0.05, D * 0.05);
    const pts = k > 0.5
      ? [[k, 0], [W - k, 0], [W, k], [W, D - k], [W - k, D], [k, D], [0, D - k], [0, k]]
      : [[0, 0], [W, 0], [W, D], [0, D]];
    return normalize([{ layer: 'cut', pts: simplify(pts), closed: true }]);
  }

  /* ---------- FEFCO 0933: Divisori ad alveare a incastro ---------- */
  function grid0933(inner, t, opt) {
    const c = opt.clearance;
    const nL = Math.max(2, Math.min(20, Math.round(opt.cellsL || 3)));
    const nP = Math.max(2, Math.min(20, Math.round(opt.cellsP || 2)));
    const WL = inner.L - 2 * c;
    const WP = inner.P - 2 * c;
    const Hd = inner.H - c;
    const sw = t + 0.3;                           // larghezza intagli d'incastro
    const sd = Hd / 2 + 0.5;                      // profondità intagli (metà altezza)
    if (WL / nL <= sw + 4 || WP / nP <= sw + 4) {
      throw new Error('Troppe celle rispetto alle dimensioni e allo spessore.');
    }
    if (Hd < 12) throw new Error('Altezza troppo bassa per realizzare i divisori.');

    const strip = (W, nCells, x0, y0) => {
      const lead = Math.min(1.5, sw * 0.4);
      const pts = [[x0, y0]];
      for (let i = 1; i < nCells; i++) {
        const xc = x0 + (W * i) / nCells;
        pts.push(
          [xc - sw / 2 - lead, y0],
          [xc - sw / 2, y0 + lead],
          [xc - sw / 2, y0 + sd],
          [xc + sw / 2, y0 + sd],
          [xc + sw / 2, y0 + lead],
          [xc + sw / 2 + lead, y0]
        );
      }
      pts.push([x0 + W, y0], [x0 + W, y0 + Hd], [x0, y0 + Hd]);
      return { layer: 'cut', pts: simplify(pts), closed: true };
    };

    const paths = [];
    const gap = 8;
    // (nP - 1) pettini lunghi WL (con nL - 1 intagli ciascuno)
    for (let j = 0; j < nP - 1; j++) paths.push(strip(WL, nL, 0, j * (Hd + gap)));
    // (nL - 1) pettini corti WP affiancati a destra (con nP - 1 intagli ciascuno)
    const xCol2 = WL + 12;
    for (let i = 0; i < nL - 1; i++) paths.push(strip(WP, nP, xCol2, i * (Hd + gap)));
    return normalize(paths);
  }

  /* ---------- API ---------- */
  function build(params) {
    const t = params.t;
    const opt = {
      glue: params.glue, slot: params.slot, tab: params.tab,
      clearance: params.clearance, lidHeight: params.lidHeight,
      overlap: params.overlap ?? 30, cellsL: params.cellsL ?? 3, cellsP: params.cellsP ?? 2,
    };
    const type = params.type;
    let inner = { L: params.L, P: params.P, H: params.H };
    if (params.dimMode === 'outer') {
      if (type === 'lid') {
        inner = { L: params.L - 4 * t - 2 * opt.clearance, P: params.P - 4 * t - 2 * opt.clearance, H: params.H };
      } else if (type === 'tray' || type === 'hinge') {
        inner = { L: params.L - 2 * t, P: params.P - 2 * t, H: params.H - (type === 'hinge' ? 2 * t : t) };
      } else if (type === '0401') {
        inner = { L: params.L - 2 * t, P: params.P - 2 * t, H: params.H - 3 * t };
      } else if (type === '0427') {
        inner = { L: params.L - 4 * t, P: params.P - 2 * t, H: params.H - 2 * t };
      } else if (type === '0901' || type === '0933') {
        inner = { L: params.L, P: params.P, H: params.H };
      } else {
        const bottoms = type === 'sleeve' ? 0 : type === 'hsc' ? 1 : 2;
        inner = { L: params.L - 2 * t, P: params.P - 2 * t, H: params.H - bottoms * t };
      }
    }
    if (inner.L <= 0 || inner.P <= 0 || (type !== '0901' && inner.H <= 0)) {
      throw new Error('Dimensioni troppo piccole rispetto allo spessore.');
    }

    let paths;
    if (type === 'lid') paths = boxLid(inner, t, opt);
    else if (type === 'tray') paths = tray(inner, t, opt, false);
    else if (type === 'hinge') paths = tray(inner, t, opt, true);
    else if (type === '0211') paths = boxTuck(inner, t, opt, false);
    else if (type === '0215') paths = boxTuck(inner, t, opt, true);
    else if (type === '0711') paths = box0711(inner, t, opt);
    else if (type === '0401') paths = box0401(inner, t);
    else if (type === '0427') paths = box0427(inner, t);
    else if (type === '0901') paths = pad0901(inner, opt);
    else if (type === '0933') paths = grid0933(inner, t, opt);
    else paths = slotted(inner, t, opt, type);

    const b = bounds(paths);
    return { paths, width: r2(b.w), height: r2(b.h), inner };
  }

  const api = { build, bounds, translate, normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Geometry = api;
})(typeof window !== 'undefined' ? window : globalThis);
