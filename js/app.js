(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PRESETS = [
    ['1', '1 mm – cartoncino / micro F'], ['1.5', '1,5 mm – onda E'], ['2', '2 mm'],
    ['3', '3 mm – onda B'], ['4', '4 mm – onda C'], ['5', '5 mm'], ['6', '6 mm'],
    ['7', '7 mm – doppia onda BC'], ['8', '8 mm – EB'], ['10', '10 mm'],
  ];
  const TYPE_NAMES = {
    '0201': 'Americana FEFCO 0201', '0203': 'Americana tipo FOL (0203)', hsc: 'Americana aperta sotto',
    sleeve: 'Manicotto', tray: 'Vassoio aperto', lid: 'Fondo + coperchio', hinge: 'Coperchio incernierato',
  };
  const HINTS = {
    '0201': 'Larghezza = lato frontale, profondità = lato corto, altezza = altezza del corpo.',
    '0203': 'Alette sui lati lunghi a tutta larghezza (si sovrappongono), alette sui lati corti a metà.',
    hsc: 'Alette solo sopra; il fondo resta aperto (si chiude a parte).',
    sleeve: 'Fascia chiusa a 4 pannelli con aletta di incollaggio; altezza = altezza del manicotto.',
    tray: 'Vassoio aperto: base + 4 pareti, le linguette si incollano all\'interno degli angoli.',
    lid: null,
    hinge: 'Un solo pezzo: il coperchio è attaccato alla parete posteriore, il risvolto copre la parete frontale.',
  };
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
      ${draw('crease', 'stroke="#13e" stroke-width="1.2" vector-effect="non-scaling-stroke"')}
      ${draw('cut', 'stroke="#e11" stroke-width="1.6" vector-effect="non-scaling-stroke"')}</svg>`;
  }

  function dimsText(p) { return `${fmt(p.L)}×${fmt(p.H)}×${fmt(p.P)} mm`; }

  function update() {
    const p = params();
    const err = validate(p);
    $('error').textContent = err;
    const slottedType = ['0201', '0203', 'hsc', 'sleeve'].includes(p.type);
    $('slotOpts').style.display = slottedType ? '' : 'none';
    $('lidOpts').style.display = p.type === 'lid' || p.type === 'hinge' ? '' : 'none';
    $('clearance').parentElement.style.display = p.type === 'lid' ? '' : 'none';
    $('tabOpt').style.display = slottedType ? 'none' : '';
    $('dimHint').textContent = p.type === 'lid'
      ? (p.dimMode === 'inner'
        ? 'Misure interne del fondo. Il coperchio viene calcolato per chiudersi sopra il fondo.'
        : 'Larghezza e profondità esterne del coperchio chiuso; altezza = altezza interna del fondo.')
      : HINTS[p.type];
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

  const blobUrls = [];
  function download(bytes, name, mime) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    blobUrls.push(url);
    // 1) download automatico (può essere bloccato se la pagina è dentro un riquadro protetto)
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    // 2) link sempre visibile, da cliccare se il download automatico non parte
    const area = $('dlArea');
    area.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = 'File pronto: ';
    const link = document.createElement('a');
    link.href = url; link.download = name; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = '⬇ ' + name;
    p.appendChild(link);
    const note = document.createElement('span');
    note.textContent = ' – se non parte il download, fai clic destro sul link → «Salva link con nome», oppure apri l\'app come file dal repository (dist/scatole-plotter.html).';
    p.appendChild(note);
    area.appendChild(p);
  }

  $('btnPdf').onclick = () => {
    if (!current) return;
    const p = current.params;
    const label = $('label').checked
      ? `${$('name').value || 'Scatola'} - ${TYPE_NAMES[p.type]} ${dimsText(p)} - cartone ${p.t} mm` : null;
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
  let mem = [];
  let persistent = true;
  try { localStorage.setItem(STORE + '-test', '1'); localStorage.removeItem(STORE + '-test'); } catch (e) { persistent = false; }
  const load = () => {
    if (persistent) { try { const v = JSON.parse(localStorage.getItem(STORE)); return Array.isArray(v) ? v : []; } catch (e) { persistent = false; } }
    return mem;
  };
  const save = (l) => {
    mem = l;
    if (persistent) { try { localStorage.setItem(STORE, JSON.stringify(l)); } catch (e) { persistent = false; } }
    $('storeNote').style.display = persistent ? 'none' : '';
  };

  let activeId = null;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ensureIds = (l) => l.map((it) => (it.id ? it : { ...it, id: newId() }));
  const snapshot = () => {
    const it = { dimMode: current.params.dimMode };
    FIELDS.forEach((f) => { it[f] = $(f).value; });
    return it;
  };
  const labelOf = (it) => `${TYPE_NAMES[it.type] || it.type} ${it.L}×${it.H}×${it.P} – ${it.t} mm${it.dimMode === 'outer' ? ' (est.)' : ''}`;

  function openItem(it) {
    FIELDS.forEach((f) => { if (it[f] !== undefined) $(f).value = it[f]; });
    document.querySelector(`input[name=dimMode][value=${it.dimMode || 'inner'}]`).checked = true;
    activeId = it.id;
    $('t').dispatchEvent(new Event('input'));
    update(); renderList();
  }

  function renderList() {
    const items = load();
    $('empty').style.display = items.length ? 'none' : '';
    $('count').textContent = items.length ? `(${items.length})` : '';
    const active = items.find((it) => it.id === activeId);
    $('btnUpdate').style.display = active ? '' : 'none';
    if (active) $('btnUpdate').textContent = '✏️ Aggiorna «' + (active.name || 'Senza nome') + '»';
    $('btnSave').textContent = active ? '💾 Salva come nuova' : '💾 Salva nella lista';
    $('list').innerHTML = '';
    items.forEach((it) => {
      const li = document.createElement('li');
      if (it.id === activeId) li.className = 'active';
      li.innerHTML = '<b></b><div class="meta"></div><div class="btns"><button data-a="open">Apri</button><button data-a="pdf">PDF</button><button data-a="dxf">DXF</button><button data-a="dup">Duplica</button><button data-a="del">Elimina</button></div>';
      li.querySelector('b').textContent = it.name || 'Senza nome';
      li.querySelector('.meta').textContent = labelOf(it);
      li.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          const act = b.dataset.a;
          if (act === 'open') openItem(it);
          else if (act === 'pdf') { openItem(it); $('btnPdf').click(); }
          else if (act === 'dxf') { openItem(it); $('btnDxf').click(); }
          else if (act === 'dup') {
            const l = load(); const i = l.findIndex((x) => x.id === it.id);
            l.splice(i + 1, 0, { ...it, id: newId(), name: (it.name || 'Senza nome') + ' (copia)' });
            save(l); renderList();
          } else if (act === 'del') {
            if (it.id === activeId) activeId = null;
            save(load().filter((x) => x.id !== it.id)); renderList();
          }
        };
      });
      $('list').appendChild(li);
    });
  }
  $('btnSave').onclick = () => {
    if (!current) return;
    const it = { ...snapshot(), id: newId() };
    save([it, ...load()]); activeId = it.id; renderList();
  };
  $('btnUpdate').onclick = () => {
    if (!current || !activeId) return;
    save(load().map((x) => (x.id === activeId ? { ...snapshot(), id: activeId } : x))); renderList();
  };
  $('btnNew').onclick = () => { activeId = null; $('name').value = ''; $('name').focus(); renderList(); };

  $('btnExport').onclick = () => {
    const l = load();
    if (!l.length) return;
    download(JSON.stringify(l, null, 2), 'scatole_salvate.json', 'application/json');
  };
  $('fileImport').onchange = (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    file.text().then((txt) => {
      const imported = JSON.parse(txt);
      if (!Array.isArray(imported)) throw new Error();
      save(ensureIds(imported).concat(load())); renderList();
    }).catch(() => { $('error').textContent = 'File della lista non valido.'; });
    ev.target.value = '';
  };

  document.querySelectorAll('input, select').forEach((el) => {
    if (el !== tPreset) el.addEventListener('input', update);
  });
  $('storeNote').style.display = persistent ? 'none' : '';
  renderList();
  update();
})();
