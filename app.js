(() => {
'use strict';

const KEY = 'limited-values-v1';
const DEMANDS = ['Terrible', 'Low', 'Normal', 'Good', 'Amazing'];
const TRENDS = ['Rising', 'Stable', 'Falling'];
const TREND_MARK = { Rising: '▲', Stable: '■', Falling: '▼' };
const TREND_RANK = { Rising: 0, Stable: 1, Falling: 2 };

const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const fmt = n => Number(n).toLocaleString();

const FALLBACK = {
  settings: { game: 'My game', currency: 'Coins' },
  items: [
    { id: 's1', name: 'Sample Crown', value: 12500, demand: 4, trend: 'Rising', copies: 85, note: 'Sample item', image: '', added: 5, sample: true },
    { id: 's2', name: 'Sample Wings', value: 4800, demand: 3, trend: 'Stable', copies: 410, note: 'Sample item', image: '', added: 4, sample: true },
    { id: 's3', name: 'Sample Mask', value: 950, demand: 2, trend: 'Falling', copies: 2300, note: 'Sample item', image: '', added: 3, sample: true },
    { id: 's4', name: 'Sample Halo', value: 31000, demand: 4, trend: 'Rising', copies: 22, note: 'Sample item', image: '', added: 2, sample: true },
    { id: 's5', name: 'Sample Scarf', value: 120, demand: 0, trend: 'Falling', copies: 9800, note: 'Sample item', image: '', added: 1, sample: true }
  ]
};

let saved = null;      // what is stored
let draft = null;      // what is on screen, including unsaved edits
let editingId = null;
let pendingImage = '';

/* ---------- data ---------- */

function clean(data) {
  if (!data || !Array.isArray(data.items)) throw new Error('Not a values file');
  const s = data.settings || {};
  return {
    settings: {
      game: String(s.game ?? 'My game').slice(0, 60),
      currency: String(s.currency ?? 'Coins').slice(0, 20)
    },
    items: data.items.map((it, i) => ({
      id: String(it.id || uid()),
      name: String(it.name || 'Unnamed').slice(0, 80),
      value: Math.max(0, Number(it.value) || 0),
      demand: Math.min(4, Math.max(0, Number(it.demand) || 0)),
      trend: TRENDS.includes(it.trend) ? it.trend : 'Stable',
      copies: Math.max(0, Math.floor(Number(it.copies) || 0)),
      note: String(it.note || '').slice(0, 140),
      image: typeof it.image === 'string' && it.image.startsWith('data:image/') ? it.image : '',
      added: Number(it.added) || i,
      sample: !!it.sample
    }))
  };
}

async function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return clean(JSON.parse(s));
  } catch (e) { /* fall through */ }
  try {
    const r = await fetch('values.json', { cache: 'no-cache' });
    if (r.ok) return clean(await r.json());
  } catch (e) { /* fall through */ }
  return clean(FALLBACK);
}

const isDirty = () => JSON.stringify(saved) !== JSON.stringify(draft);

/* ---------- render ---------- */

function sorted(items) {
  const q = $('#search').value.trim().toLowerCase();
  const list = items.filter(i => i.name.toLowerCase().includes(q));
  const by = $('#sort').value;
  const cmp = {
    'value-desc': (a, b) => b.value - a.value,
    'value-asc': (a, b) => a.value - b.value,
    demand: (a, b) => b.demand - a.demand || b.value - a.value,
    trend: (a, b) => TREND_RANK[a.trend] - TREND_RANK[b.trend] || b.value - a.value,
    'copies-asc': (a, b) => a.copies - b.copies,
    name: (a, b) => a.name.localeCompare(b.name),
    new: (a, b) => b.added - a.added
  }[by];
  return list.sort(cmp);
}

function rowHTML(it, currency) {
  const thumb = it.image
    ? `<img src="${esc(it.image)}" alt="">`
    : esc(it.name.trim().charAt(0).toUpperCase() || '?');
  const meter = [0, 1, 2, 3, 4].map(n => `<i class="${n <= it.demand ? 'on' : ''}"></i>`).join('');
  return `
  <article class="row" data-id="${esc(it.id)}">
    <div class="thumb">${thumb}</div>
    <div class="name">
      <h3>${esc(it.name)}</h3>
      ${it.note ? `<p class="note">${esc(it.note)}</p>` : ''}
    </div>
    <div class="value"><strong>${fmt(it.value)}</strong><span>${esc(currency)}</span></div>
    <div class="demand"><div class="meter" aria-hidden="true">${meter}</div><span>Demand: ${DEMANDS[it.demand]}</span></div>
    <div class="trend ${it.trend.toLowerCase()}">${TREND_MARK[it.trend]} ${it.trend}</div>
    <div class="copies"><strong>${fmt(it.copies)}</strong> <span>copies</span></div>
    <div class="rowtools">
      <button type="button" class="btn small ghost" data-act="edit">Edit</button>
      <button type="button" class="btn small ghost" data-act="delete">Delete</button>
    </div>
  </article>`;
}

function render() {
  $('#gameName').textContent = draft.settings.game;
  document.title = `${draft.settings.game} · Limited Values`;

  const list = sorted(draft.items);
  $('#list').innerHTML = list.length
    ? list.map(i => rowHTML(i, draft.settings.currency)).join('')
    : `<p class="state"><strong>${draft.items.length ? 'No matches' : 'No limiteds yet'}</strong><br>${
        draft.items.length ? 'Try a different name.' : 'Choose Edit values, then add your first limited.'}</p>`;

  $('#samplesNote').hidden = !draft.items.some(i => i.sample);
  $('#savebar').hidden = !isDirty();
}

/* ---------- editor ---------- */

function fillSelects() {
  $('#fDemand').innerHTML = DEMANDS.map((d, i) => `<option value="${i}">${d}</option>`).join('');
  $('#fTrend').innerHTML = TRENDS.map(t => `<option>${t}</option>`).join('');
}

function showPreview() {
  const p = $('#picPreview');
  p.innerHTML = pendingImage ? `<img src="${esc(pendingImage)}" alt="">` : '';
  $('#picClear').hidden = !pendingImage;
}

function resetForm() {
  editingId = null;
  pendingImage = '';
  $('#itemForm').reset();
  $('#fPic').value = '';
  $('#formTitle').textContent = 'Add a limited';
  $('#formSubmit').textContent = 'Add limited';
  $('#formCancel').hidden = true;
  showPreview();
}

function startEdit(id) {
  const it = draft.items.find(i => i.id === id);
  if (!it) return;
  editingId = id;
  $('#fName').value = it.name;
  $('#fValue').value = it.value;
  $('#fDemand').value = it.demand;
  $('#fTrend').value = it.trend;
  $('#fCopies').value = it.copies;
  $('#fNote').value = it.note;
  pendingImage = it.image;
  showPreview();
  $('#formTitle').textContent = 'Edit limited';
  $('#formSubmit').textContent = 'Update limited';
  $('#formCancel').hidden = false;
  $('#formTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#fName').focus({ preventScroll: true });
}

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 192;
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
    img.src = url;
  });
}

/* ---------- events ---------- */

$('#editToggle').addEventListener('click', () => {
  const on = document.body.classList.toggle('editing');
  $('#editor').hidden = !on;
  $('#editToggle').setAttribute('aria-expanded', on);
  $('#editToggle').textContent = on ? 'Done editing' : 'Edit values';
});

$('#search').addEventListener('input', render);
$('#sort').addEventListener('change', render);

$('#setGame').addEventListener('input', e => { draft.settings.game = e.target.value; render(); });
$('#setCurrency').addEventListener('input', e => { draft.settings.currency = e.target.value; render(); });

$('#fPic').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try { pendingImage = await shrinkImage(f); showPreview(); }
  catch { alert('That file could not be read as a picture. Choose a PNG, JPG or WebP image.'); e.target.value = ''; }
});
$('#picClear').addEventListener('click', () => { pendingImage = ''; $('#fPic').value = ''; showPreview(); });

$('#itemForm').addEventListener('submit', e => {
  e.preventDefault();
  const base = {
    name: $('#fName').value.trim(),
    value: Math.max(0, Number($('#fValue').value) || 0),
    demand: Number($('#fDemand').value),
    trend: $('#fTrend').value,
    copies: Math.max(0, Math.floor(Number($('#fCopies').value) || 0)),
    note: $('#fNote').value.trim(),
    image: pendingImage
  };
  if (!base.name) return;
  if (editingId) {
    const i = draft.items.findIndex(x => x.id === editingId);
    draft.items[i] = { ...draft.items[i], ...base };
  } else {
    draft.items.push({ id: uid(), added: Date.now(), sample: false, ...base });
  }
  resetForm();
  render();
});
$('#formCancel').addEventListener('click', resetForm);

$('#list').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.row').dataset.id;
  if (btn.dataset.act === 'edit') startEdit(id);
  if (btn.dataset.act === 'delete') {
    draft.items = draft.items.filter(i => i.id !== id);
    if (editingId === id) resetForm();
    render();
  }
});

$('#removeSamples').addEventListener('click', () => {
  draft.items = draft.items.filter(i => !i.sample);
  render();
});

$('#saveBtn').addEventListener('click', () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
    saved = clone(draft);
    render();
  } catch {
    alert('The changes could not be saved in this browser. Remove some pictures and try again, or export values.json to keep a copy.');
  }
});
$('#discardBtn').addEventListener('click', () => {
  draft = clone(saved);
  resetForm();
  syncSettings();
  render();
});

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'values.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    draft = clean(JSON.parse(await f.text()));
    resetForm();
    syncSettings();
    render();
  } catch {
    alert('That file is not a valid values.json. Export one from this page and try again.');
  }
  e.target.value = '';
});

$('#resetBtn').addEventListener('click', async () => {
  if (!confirm('Discard the values saved in this browser and load the published values.json?')) return;
  localStorage.removeItem(KEY);
  saved = await load();
  draft = clone(saved);
  resetForm();
  syncSettings();
  render();
});

window.addEventListener('beforeunload', e => {
  if (draft && isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

function syncSettings() {
  $('#setGame').value = draft.settings.game;
  $('#setCurrency').value = draft.settings.currency;
}

/* ---------- start ---------- */

(async function init() {
  fillSelects();
  saved = await load();
  draft = clone(saved);
  syncSettings();
  render();
})();
})();
