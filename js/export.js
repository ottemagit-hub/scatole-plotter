/*
 * Esportazione: PDF vettoriale 1:1 (1 pt = 1/72 in, pagina = ingombro + margine)
 * e DXF R12 (layer separati taglio/cordonatura).
 */
(function (root) {
  'use strict';

  const MM = 72 / 25.4;
  const f = (n) => (Math.round(n * 1000) / 1000).toString();
  const ascii = (s) => String(s).replace(/×/g, 'x').replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1');

  /**
   * opts: { margin(mm), label(string|null), cutWidth, creaseWidth (mm) }
   * Ritorna Uint8Array del PDF.
   */
  function toPDF(result, opts) {
    const margin = opts.margin ?? 10;
    const pw = (result.width + 2 * margin) * MM;
    const ph = (result.height + 2 * margin) * MM;
    const X = (x) => f((x + margin) * MM);
    const Y = (y) => f(ph - (y + margin) * MM); // PDF ha Y verso l'alto

    let c = '';
    const draw = (layer) => {
      if (layer === 'cut') c += `1 0 0 RG ${f((opts.cutWidth ?? 0.25) * MM)} w [] 0 d\n`;
      else c += `0 0 1 RG ${f((opts.creaseWidth ?? 0.25) * MM)} w [] 0 d\n`;
      for (const p of result.paths) {
        if (p.layer !== layer) continue;
        p.pts.forEach(([x, y], i) => { c += `${X(x)} ${Y(y)} ${i ? 'l' : 'm'}\n`; });
        c += p.closed ? 'h S\n' : 'S\n';
      }
    };
    c += '1 J 1 j\n';
    draw('crease');
    draw('cut');
    if (opts.label) {
      c += `0 g BT /F1 ${f(3.5 * MM)} Tf ${f(2 * MM)} ${f(ph - 5 * MM)} Td (${ascii(opts.label)}) Tj ET\n`;
    }

    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
      `<< /Length ${c.length} >>\nstream\n${c}endstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Title (${ascii(opts.title || 'Scatola')}) /Producer (Scatole Plotter) >>`,
    ];
    let out = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offs) out += `${String(o).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  /** opts: { cutLayer, creaseLayer } — asse Y verso l'alto come da convenzione CAD. */
  function toDXF(result, opts) {
    const H = result.height;
    const layers = [
      [opts.cutLayer || 'TAGLIO', 1],
      [opts.creaseLayer || 'CORDONATURA', 5],
    ];
    const name = { cut: layers[0][0], crease: layers[1][0] };
    const g = (code, val) => `${code}\n${val}\n`;
    let d = g(0, 'SECTION') + g(2, 'HEADER') + g(9, '$ACADVER') + g(1, 'AC1009') + g(9, '$INSUNITS') + g(70, 4) + g(0, 'ENDSEC');
    d += g(0, 'SECTION') + g(2, 'TABLES') + g(0, 'TABLE') + g(2, 'LAYER') + g(70, layers.length);
    for (const [n, col] of layers) d += g(0, 'LAYER') + g(2, n) + g(70, 0) + g(62, col) + g(6, 'CONTINUOUS');
    d += g(0, 'ENDTAB') + g(0, 'ENDSEC');
    d += g(0, 'SECTION') + g(2, 'ENTITIES');
    for (const p of result.paths) {
      d += g(0, 'POLYLINE') + g(8, name[p.layer]) + g(66, 1) + g(70, p.closed ? 1 : 0);
      for (const [x, y] of p.pts) d += g(0, 'VERTEX') + g(8, name[p.layer]) + g(10, f(x)) + g(20, f(H - y)) + g(30, 0);
      d += g(0, 'SEQEND') + g(8, name[p.layer]);
    }
    d += g(0, 'ENDSEC') + g(0, 'EOF');
    return new TextEncoder().encode(d.replace(/\n/g, '\r\n'));
  }

  const api = { toPDF, toDXF };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Export = api;
})(typeof window !== 'undefined' ? window : globalThis);
