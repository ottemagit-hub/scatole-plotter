(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PRESETS = [
    ['1', '1 mm – cartoncino / micro F'], ['1.5', '1,5 mm – onda E'], ['2', '2 mm'],
    ['3', '3 mm – onda B'], ['4', '4 mm – onda C'], ['5', '5 mm'], ['6', '6 mm'],
    ['7', '7 mm – doppia onda BC'], ['8', '8 mm – EB'], ['10', '10 mm'],
  ];
  const STORE = 'scatole-plotter-v1';

  const tPreset = $('tPreset');
  PRESETS.forEach(([v, l]) => tPreset.add(new Option(l, v)));
  tPreset.add(new Option('Personalizzato', 'custom'));

  let current = null;

  const num = (id) => parseFloat($(id).value);
  const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('it-IT');

  function params() {
    const t = num('t');
    const slotRaw = $('slot').value.trim();
    return {
      type: $('type').value,
      dimMode: document.querySelector('input[name=dimMode]:checked').value,
      L: num('L'), P: num('P'), H: num('H'), t,
      glue: num('glue'), slot: slotRaw === '' ? 2 * t : parseFloat(slotRaw),
      tab: num('tab'), clearance: num('clearance'), lidHeight: num('lidHeight'),
    };
  }

  function validate(p) {
    for (const k of ['L', 'P', 'H', 't', 'glue', 'slot', 'tab', 'clearance', 'lidHeight'])
      if (!isFinite(p[k]) || p[k] < 0) return 'Controlla i valori inseriti.';
    if (p.L <= 0 || p.P <= 0 || p.H <= 0 || p.t <= 0) return 'Larghezza, altezza, profondità e spessore devono essere maggiori di zero.';
    return '';
  }

  function svg(result) {
    const pad = 10, w = result.width + 2 * pad, h = result.height + 2 * pad;
    const d = (p) => 'M' + p.pts.map(([x, y]) => `${x + pad} ${y + pad}`).join(' L') + (p.closed ? ' Z' : '');
    const draw = (layer, attrs) => result.paths.filter((p) => p.layer === layer)
      .map((p) => `<path d="${d(p)}" ${attrs}/>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linejoin="round">
      ${draw('crease', 'stroke="#13e" stroke-width="1.2" stroke-dasharray="6 3" vector-effect="non-scaling-stroke"')}
      ${draw('cut', 'stroke="#e11" stroke-width="1.6" vector-effect="non-scaling-stroke"')}</svg>`;
  }

  function dimsText(p) { return `${fmt(p.L)}×${fmt(p.H)}×${fmt(p.P)} mm`; }

  function update() {
    const p = params();
    const err = validate(p);
    $('error').textContent = err;
    $('lidOpts').style.display = p.type === 'lid' ? '' : 'none';
    $('tabOpt').style.display = p.type === 'lid' ? '' : 'none';
    $('dimHint').textContent = p.type === 'lid'
      ? (p.dimMode === 'inner'
        ? 'Misure interne del fondo. Il coperchio viene calcolato per chiudersi sopra il fondo.'
        : 'Larghezza e profondità esterne del coperchio chiuso; altezza = altezza interna del fondo.')
      : 'Larghezza = lato frontale, profondità = lato corto, altezza = altezza del corpo.';
    if (err) { current = null; return; }
    try {
      current = { ...Geometry.build(p), params: p };
      const area = (current.width * current.height) / 1e6;
      $('info').innerHTML = `<span>Foglio necessario: <b>${fmt(current.width)} × ${fmt(current.height)} mm</b></span>` +
        `<span>Superficie: <b>${area.toLocaleString('it-IT', { maximumFractionDigits: 3 })} m²</b></span>` +
        `<span>Misure interne: <b>${fmt(current.inner.L)}×${fmt(current.inner.H)}×${fmt(current.inner.P)} mm</b></span>`;
      $('canvas').innerHTML = svg(current);
    } catch (e) {
      current = null; $('error').textContent = e.message;
    }
  }

  function fileBase() {
    const p = current.params;
    const n = ($('name').value.trim() || 'scatola').replace(/[^\w\-]+/g, '_');
    return `${n}_${p.type}_${p.L}x${p.H}x${p.P}_${p.t}mm`;
  }

  function download(bytes, name, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('btnPdf').onclick = () => {
    if (!current) return;
    const p = current.params;
    const label = $('label').checked
      ? `${$('name').value || 'Scatola'} - ${p.type === 'lid' ? 'fondo+coperchio' : 'FEFCO 0201'} ${dimsText(p)} - cartone ${p.t} mm` : null;
    download(Export.toPDF(current, { margin: 10, label, title: fileBase() }), fileBase() + '.pdf', 'application/pdf');
  };
  $('btnDxf').onclick = () => {
    if (!current) return;
    download(Export.toDXF(current, { cutLayer: $('cutLayer').value.trim() || 'TAGLIO', creaseLayer: $('creaseLayer').value.trim() || 'CORDONATURA' }),
      fileBase() + '.dxf', 'application/dxf');
  };

  /* --- preset spessore --- */
  tPreset.onchange = () => { if (tPreset.value !== 'custom') { $('t').value = tPreset.value; update(); } };
  $('t').addEventListener('input', () => {
    const m = PRESETS.find(([v]) => parseFloat(v) === num('t'));
    tPreset.value = m ? m[0] : 'custom';
  });
  tPreset.value = '3';

  /* --- lista salvata --- */
  const FIELDS = ['name', 'type', 'L', 'H', 'P', 't', 'glue', 'slot', 'lidHeight', 'clearance', 'tab', 'cutLayer', 'creaseLayer'];
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } };
  const save = (l) => localStorage.setItem(STORE, JSON.stringify(l));

  function renderList() {
    const items = load();
    $('empty').style.display = items.length ? 'none' : '';
    $('list').innerHTML = '';
    items.forEach((it, i) => {
      const li = document.createElement('li');
      const t = document.createElement('div');
      t.innerHTML = `<b></b><div class="meta"></div><div class="btns"><button>Apri</button><button>Elimina</button></div>`;
      t.querySelector('b').textContent = it.name || 'Senza nome';
      t.querySelector('.meta').textContent = `${it.type === 'lid' ? 'Fondo+coperchio' : '0201'} ${it.L}×${it.H}×${it.P} – ${it.t} mm${it.dimMode === 'outer' ? ' (est.)' : ''}`;
      const [open, del] = t.querySelectorAll('button');
      open.onclick = () => {
        FIELDS.forEach((f) => { if (it[f] !== undefined) $(f).value = it[f]; });
        document.querySelector(`input[name=dimMode][value=${it.dimMode || 'inner'}]`).checked = true;
        $('t').dispatchEvent(new Event('input')); update();
      };
      del.onclick = () => { const l = load(); l.splice(i, 1); save(l); renderList(); };
      li.appendChild(t); $('list').appendChild(li);
    });
  }
  $('btnSave').onclick = () => {
    if (!current) return;
    const it = { dimMode: current.params.dimMode };
    FIELDS.forEach((f) => { it[f] = $(f).value; });
    const l = load(); l.unshift(it); save(l); renderList();
  };

  document.querySelectorAll('input, select').forEach((el) => {
    if (el !== tPreset) el.addEventListener('input', update);
  });
  renderList();
  update();
})();
