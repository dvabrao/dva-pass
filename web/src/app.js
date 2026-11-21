// DVA_Pass — cofre de senhas compatível com KeePass (KDBX 3.1 / 4)
// criado por Daniel Vale Abrão (dvabrao@gmail.com)
import * as K from 'kdbxweb';
import { argon2d, argon2id } from 'hash-wasm';
import { platform, recent, isAndroid } from './platform.js';
import { icon, LOGO } from './icons.js';

const kdbxweb = (K.default && K.default.Kdbx) ? K.default : K;
const VERSION = __APP_VERSION__;
const PV = kdbxweb.ProtectedValue;

kdbxweb.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type) => {
  const fn = type === 0 ? argon2d : argon2id;
  const out = await fn({ password: new Uint8Array(password), salt: new Uint8Array(salt), memorySize: memory, iterations, hashLength: length, parallelism, outputType: 'binary' });
  return out.buffer;
});

// ================= configurações =================
const DEF = {
  theme: 'dark', autolock: 5, lockOnLeave: false, clip: 30, showUser: true, sort: 'title',
  gen: { len: 20, upper: true, lower: true, digits: true, symbols: true, noAmb: true },
  brand: { name: 'DVA_Pass', logo: null, credit: 'Daniel Vale Abrão', contact: 'dvabrao@gmail.com', place: 'Ribeirão Preto · SP · 2026', tagline: 'Seu cofre de senhas, compatível com KeePass' },
  bioAsked: {},
};
let S = load();
function load() {
  let s = {}; try { s = JSON.parse(localStorage.getItem('dva.settings') || '{}'); } catch {}
  return { ...DEF, ...s, gen: { ...DEF.gen, ...(s.gen || {}) }, brand: { ...DEF.brand, ...(s.brand || {}) }, bioAsked: s.bioAsked || {} };
}
function saveS() { localStorage.setItem('dva.settings', JSON.stringify(S)); }
function applyTheme() { document.documentElement.dataset.theme = S.theme; document.title = S.brand.name + ' ' + VERSION; }
applyTheme();

// ================= utilidades =================
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const txt = (v) => v instanceof PV ? v.getText() : (v == null ? '' : String(v));
const fld = (e, k) => txt(e.fields.get(k));
const app = () => $('#app');
const fmtDate = (d) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
function logoHtml(cls = '') { return S.brand.logo ? `<img class="logo-img ${cls}" src="${esc(S.brand.logo)}" alt="">` : LOGO; }
function wordmark() {
  const n = S.brand.name || 'DVA_Pass'; const i = n.indexOf('_');
  return `<span class="wordmark">${i > 0 ? esc(n.slice(0, i)) + '<b>_</b>' + esc(n.slice(i + 1)) : esc(n)}</span>`;
}
const PALETTE = ['#E9C37E', '#8EC5FF', '#9FE3B9', '#F5A3A3', '#C8B3FF', '#FFC48C', '#86E1E0', '#F3A6D6'];
function avatar(title) {
  const t = (title || '?').trim(); let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="avatar" style="background:${PALETTE[h % PALETTE.length]}">${esc((t[0] || '?').toUpperCase())}</span>`;
}
function pwHtml(p) {
  return `<span class="pw">${[...p].map(c => /[0-9]/.test(c) ? `<span class="d">${esc(c)}</span>` : /[A-Za-z]/.test(c) ? esc(c) : `<span class="s">${esc(c)}</span>`).join('')}</span>`;
}
let toastT;
function toast(msg, ic = 'check') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = icon(ic) + `<span>${esc(msg)}</span>`;
  document.body.appendChild(d); clearTimeout(toastT); toastT = setTimeout(() => d.remove(), 2600);
}
async function sha(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join(''); }
function copy(text, what) {
  if (!text) return;
  platform.copy(text, S.clip).then(() => toast(S.clip > 0 ? `${what} copiado · apaga em ${S.clip} s` : `${what} copiado`, 'copy'));
}

// ================= diálogos =================
function dialog({ title, body = '', html = '', buttons = [{ label: 'OK', value: true, cls: 'primary' }], onOpen }) {
  return new Promise(res => {
    const o = document.createElement('div'); o.className = 'overlay';
    o.innerHTML = `<div class="dialog" role="dialog"><h2>${esc(title)}</h2>${body ? `<p>${esc(body)}</p>` : ''}<div class="dbody">${html}</div><div class="acts"></div></div>`;
    const close = (v) => { o.remove(); popBack(closer); res(v); };
    const closer = () => close(undefined);
    buttons.forEach(b => {
      const el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.textContent = b.label;
      el.onclick = () => { const v = typeof b.value === 'function' ? b.value(o) : b.value; if (v === false) return; close(v); };
      $('.acts', o).appendChild(el);
    });
    o.addEventListener('mousedown', e => { if (e.target === o) closer(); });
    document.body.appendChild(o); pushBack(closer);
    o.addEventListener('keydown', e => { if (e.key === 'Escape') closer(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') { const p = $('.acts .primary', o); p && p.click(); } });
    onOpen && onOpen(o);
    const f = $('input,select,textarea', o); f && setTimeout(() => f.focus(), 30);
  });
}
const confirmBox = (title, body, ok = 'Confirmar', danger) => dialog({ title, body, buttons: [{ label: 'Cancelar', value: false, cls: 'ghost' }, { label: ok, value: true, cls: danger ? 'danger' : 'primary' }] }).then(v => !!v);
const promptBox = (title, label, value = '') => dialog({
  title, html: `<div class="field"><label>${esc(label)}</label><div class="input"><input id="pv" value="${esc(value)}"></div></div>`,
  buttons: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'OK', cls: 'primary', value: (o) => $('#pv', o).value.trim() || false }],
});

// ================= botão voltar (Android) =================
const backStack = [];
function pushBack(fn) { backStack.push(fn); }
function popBack(fn) { const i = backStack.lastIndexOf(fn); if (i >= 0) backStack.splice(i, 1); }
window.DVA_back = () => { const fn = backStack.pop(); if (fn) { fn(); return true; } return false; };

// ================= estado =================
let file = null;          // arquivo atual
let db = null;            // Kdbx aberto
let loadedHash = null;    // hash do arquivo como lido/gravado por último
const V = { group: null, query: '', entry: null, pane: 'list', editing: false, reveal: false, collapsed: new Set() };
let saveState = 'ok', saveTimer = null, saving = null;
let lastAct = Date.now(), hiddenAt = 0;

// ================= bloqueio automático =================
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); if (db && S.lockOnLeave && saveState !== 'busy') lock(); }
  else checkLock();
});
setInterval(checkLock, 5000);
function checkLock() {
  if (!db || !S.autolock || saveState === 'busy') return;
  if (Date.now() - lastAct > S.autolock * 60000) lock();
}
window.DVA_pause = () => { if (db && S.lockOnLeave) lock(); };

// ================= início =================
function renderHome() {
  db = null; file = null; backStack.length = 0;
  const list = recent.list();
  app().innerHTML = `<div class="gate"><div class="gate-card">
    <div class="gate-hero">${logoHtml()}${wordmark()}<p>${esc(S.brand.tagline)}</p></div>
    <div class="panel">
      ${list.length ? `<h3>Cofres recentes</h3><ul class="recent">${list.map(r => `<li><button class="open" data-id="${esc(r.id)}">${icon('shield')}<span style="min-width:0"><div class="nm">${esc(r.name)}</div><div class="sub">${r.keyName ? 'com arquivo-chave' : 'senha mestra'}</div></span></button><button class="ibtn" data-rm="${esc(r.id)}" title="Tirar da lista">${icon('x')}</button></li>`).join('')}</ul>` : ''}
      <div class="stack">
        <button class="btn ${list.length ? '' : 'primary'} block" id="bOpen">${icon('file')} Abrir cofre (.kdbx)</button>
        <button class="btn ghost block" id="bNew">${icon('filePlus')} Criar novo cofre</button>
      </div>
      <div class="hint">${isAndroid
        ? 'Para usar o mesmo arquivo do computador, escolha o <b>.kdbx</b> que está no <b>Google Drive</b>. Todas as alterações são gravadas nele.'
        : platform.canWrite ? 'Dica: abra o <b>.kdbx</b> direto da pasta do <b>Google Drive</b> no computador (ex.: <b>G:\\Meu Drive</b>). As alterações são gravadas no próprio arquivo e chegam ao celular.'
        : 'Este navegador não grava direto no arquivo. Use o <b>Chrome</b> ou o <b>Edge</b> para editar; aqui, ao salvar, o arquivo será baixado.'}</div>
    </div>
    <p class="hint" style="text-align:center"><button class="btn ghost sm" id="bCfg0">${icon('gear')} Configurações</button></p>
  </div></div>`;
  app().querySelectorAll('[data-id]').forEach(b => b.onclick = async () => {
    try { const r = list.find(x => x.id === b.dataset.id); renderUnlock(await platform.fromRecent(r)); } catch (e) { toast(e.message, 'info'); }
  });
  app().querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { await recent.remove(b.dataset.rm); platform.bio.remove(b.dataset.rm); renderHome(); });
  $('#bOpen').onclick = async () => { try { renderUnlock(await platform.pickDb()); } catch (e) { if (!/abort|cancel/i.test(e.name + e.message)) toast(e.message, 'info'); } };
  $('#bNew').onclick = newDbFlow;
  $('#bCfg0').onclick = () => openSettings();
}

// ================= desbloqueio =================
function renderUnlock(f, err = '') {
  file = f; db = null; backStack.length = 0;
  const bio = isAndroid && platform.bio.has(f.id);
  let key = f.keyName ? { name: f.keyName, remembered: true } : null;
  app().innerHTML = `<div class="gate"><div class="gate-card">
    <div class="gate-hero">${logoHtml()}${wordmark()}</div>
    <div class="panel">
      <div class="filecard">${icon('shield')}<div style="min-width:0;flex:1"><div class="nm">${esc(f.name)}</div><div class="sub" style="font-size:13px;color:var(--faint)">${f.fallback ? 'somente leitura neste navegador' : 'cofre KeePass'}</div></div></div>
      ${bio ? `<button class="bigfinger" id="bBio">${icon('finger')}<span>Toque para usar a digital</span></button>` : ''}
      <div class="field"><label>Senha mestra</label>
        <div class="input"><input id="mp" type="password" autocomplete="current-password" class="mono" spellcheck="false"><button class="ibtn" id="eye" title="Mostrar">${icon('eye')}</button></div>
      </div>
      <div class="field"><label>Arquivo-chave (opcional)</label>
        <div style="display:flex;gap:8px;align-items:center"><button class="btn sm" id="bKey">${icon('key')} <span id="kn">${key ? esc(key.name) : 'Escolher…'}</span></button>${key ? `<button class="ibtn" id="kx" title="Remover">${icon('x')}</button>` : ''}</div>
      </div>
      <div class="err" id="err">${esc(err)}</div>
      <div class="stack" style="margin-top:12px">
        <button class="btn primary block" id="bUnlock">${icon('unlock')} Desbloquear</button>
        <button class="btn ghost block" id="bBack">${icon('back')} Outro cofre</button>
      </div>
    </div></div></div>`;
  const mp = $('#mp');
  $('#eye').onclick = () => { mp.type = mp.type === 'password' ? 'text' : 'password'; $('#eye').innerHTML = icon(mp.type === 'password' ? 'eye' : 'eyeOff'); };
  $('#bKey').onclick = async () => { try { key = await platform.pickKey(); renderKey(); } catch {} };
  const renderKey = () => { $('#kn').textContent = key ? key.name : 'Escolher…'; };
  $('#kx') && ($('#kx').onclick = () => { key = null; $('#kx').remove(); renderKey(); });
  $('#bBack').onclick = renderHome;
  mp.addEventListener('keydown', e => { if (e.key === 'Enter') $('#bUnlock').click(); });
  $('#bUnlock').onclick = () => doUnlock(mp.value, key, false);
  if (bio) {
    const go = async () => {
      try { const pw = await platform.bio.load(f.id); doUnlock(pw, key, true); }
      catch (e) {
        if (e.code === 'invalidated') { platform.bio.remove(f.id); $('#err').textContent = 'A digital mudou no aparelho. Digite a senha mestra para ativar de novo.'; $('#bBio')?.remove(); }
      }
    };
    $('#bBio').onclick = go; setTimeout(go, 250);
  } else setTimeout(() => mp.focus(), 50);
}

async function doUnlock(password, key, viaBio) {
  const btn = $('#bUnlock'); const errEl = $('#err');
  btn.disabled = true; btn.innerHTML = icon('clock') + ' Abrindo…'; errEl.textContent = '';
  try {
    await platform.ensurePermission(file);
    let keyBytes = key && key.bytes ? key.bytes : null;
    if (key && !keyBytes && key.remembered) keyBytes = await platform.readKey(file);
    const bytes = await platform.read(file);
    const creds = new kdbxweb.Credentials(password ? PV.fromString(password) : null, keyBytes ? keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) : null);
    await creds.ready;
    db = await kdbxweb.Kdbx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), creds);
    loadedHash = await sha(bytes);
    if (key && !key.remembered) await platform.rememberKey(file, key);
    if (!key && file.keyName) await platform.rememberKey(file, null);
    if (!file.fallback) recent.add(file);
    lastAct = Date.now(); saveState = 'ok';
    Object.assign(V, { group: null, query: '', entry: null, pane: 'list', editing: false, reveal: false });
    renderVault();
    if (!viaBio && password && isAndroid && platform.bio.status() === 'ok' && !platform.bio.has(file.id) && !S.bioAsked[file.id]) {
      S.bioAsked[file.id] = 1; saveS();
      if (await confirmBox('Usar a digital?', 'Da próxima vez, abra este cofre só com a impressão digital. A senha fica guardada de forma criptografada no aparelho.', 'Ativar digital')) enableBio(password);
    }
  } catch (e) {
    db = null;
    const m = e && e.code === 'InvalidKey' ? 'Senha mestra ou arquivo-chave incorreto.' : (e && e.message) || String(e);
    if (viaBio && e && e.code === 'InvalidKey') platform.bio.remove(file.id);
    if (errEl) errEl.textContent = m;
    if (btn) { btn.disabled = false; btn.innerHTML = icon('unlock') + ' Desbloquear'; }
  }
}
async function enableBio(password) {
  try { await platform.bio.save(file.id, password); toast('Digital ativada para este cofre', 'finger'); }
  catch (e) { if (e.code !== 'cancel') toast('Não foi possível ativar a digital', 'info'); }
}

function lock() {
  if (!file) return renderHome();
  document.querySelectorAll('.overlay,.cfg').forEach(o => o.remove());
  db = null; renderUnlock(file);
}

// ================= novo cofre =================
async function newDbFlow() {
  const r = await dialog({
    title: 'Criar novo cofre', body: 'O arquivo é um cofre KeePass (.kdbx) e também abre no KeePass2 e no Keepass2Android.',
    html: `<div class="field"><label>Nome do cofre</label><div class="input"><input id="nn" value="Minhas senhas"></div></div>
      <div class="field"><label>Senha mestra</label><div class="input"><input id="np" type="password" class="mono"></div></div>
      <div class="field"><label>Repita a senha</label><div class="input"><input id="np2" type="password" class="mono"></div></div><div class="err" id="ne"></div>`,
    buttons: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Criar', cls: 'primary', value: (o) => {
      const n = $('#nn', o).value.trim(), p = $('#np', o).value, p2 = $('#np2', o).value;
      if (!n) { $('#ne', o).textContent = 'Dê um nome ao cofre.'; return false; }
      if (p.length < 8) { $('#ne', o).textContent = 'Use uma senha mestra com pelo menos 8 caracteres.'; return false; }
      if (p !== p2) { $('#ne', o).textContent = 'As senhas não conferem.'; return false; }
      return { n, p };
    } }],
  });
  if (!r) return;
  try {
    const f = await platform.createDb(r.n.replace(/[\\/:*?"<>|]/g, '') + '.kdbx');
    const creds = new kdbxweb.Credentials(PV.fromString(r.p));
    const d = kdbxweb.Kdbx.create(creds, r.n);
    d.setKdf(kdbxweb.Consts.KdfId.Argon2d);
    d.createGroup(d.getDefaultGroup(), 'Geral'); d.createGroup(d.getDefaultGroup(), 'Trabalho'); d.createGroup(d.getDefaultGroup(), 'Internet');
    const bytes = new Uint8Array(await d.save());
    await platform.write(f, bytes);
    file = f; db = d; loadedHash = await sha(bytes); if (!f.fallback) recent.add(f);
    Object.assign(V, { group: null, query: '', entry: null, pane: 'list', editing: false });
    renderVault(); toast('Cofre criado');
  } catch (e) { if (!/abort|cancel/i.test(e.name + e.message)) toast(e.message, 'info'); }
}

// ================= gravação (com mesclagem se o arquivo mudou em outro aparelho) =================
function setStatus(s) {
  saveState = s; const el = $('#status'); if (!el) return;
  el.className = 'status ' + s;
  el.innerHTML = '<span class="dot"></span><span class="stx">' + ({ ok: 'Salvo', busy: 'Salvando…', err: 'Erro ao salvar — toque', dirty: 'Alterado' }[s]) + '</span>';
}
function touch() { setStatus('dirty'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); }
async function save() {
  if (!db) return; if (saving) { await saving; }
  saving = (async () => {
    setStatus('busy');
    try {
      if (!file.fallback) {
        try {
          const remote = await platform.read(file);
          if (loadedHash && (await sha(remote)) !== loadedHash) {
            const rdb = await kdbxweb.Kdbx.load(remote.buffer.slice(remote.byteOffset, remote.byteOffset + remote.byteLength), db.credentials);
            db.merge(rdb);
            toast('Alterações de outro aparelho foram mescladas', 'layers');
          }
        } catch (e) { if (e && e.code === 'InvalidKey') throw new Error('O arquivo no Drive foi trocado de senha em outro aparelho.'); }
      }
      const bytes = new Uint8Array(await db.save());
      await platform.write(file, bytes);
      loadedHash = await sha(bytes);
      setStatus('ok');
    } catch (e) { console.error(e); setStatus('err'); toast('Não salvou: ' + (e.message || e), 'info'); }
  })();
  await saving; saving = null;
  if (V.entry && !V.editing) renderDetail();
  renderGroups(); renderList();
}

// ================= cofre =================
function allGroups(g = db.getDefaultGroup(), depth = 0, out = []) {
  out.push({ g, depth }); g.groups.forEach(c => allGroups(c, depth + 1, out)); return out;
}
function binGroup() { return db.meta.recycleBinUuid ? db.getGroup(db.meta.recycleBinUuid) : null; }
function inBin(item) { const b = binGroup(); if (!b) return false; let g = item.parentGroup; while (g) { if (g === b) return true; g = g.parentGroup; } return false; }
function groupPath(g) { const p = []; while (g && g.parentGroup) { p.unshift(g.name); g = g.parentGroup; } return p.join(' › ') || (db.getDefaultGroup().name); }

function renderVault() {
  backStack.length = 0;
  app().innerHTML = `
    <header class="topbar">
      <button class="ibtn show-m" id="bMenu" title="Pastas">${icon('menu')}</button>
      <div class="brand">${logoHtml()}${wordmark()}<span class="dbname">· ${esc(file.name)}</span></div>
      <span class="status ok" id="status"><span class="dot"></span><span class="stx">Salvo</span></span>
      <button class="ibtn hide-m" id="bAdd" title="Nova entrada">${icon('plus')}</button>
      <button class="ibtn" id="bGen" title="Gerador de senhas">${icon('dice')}</button>
      <button class="ibtn" id="bSet" title="Configurações">${icon('gear')}</button>
      <button class="ibtn" id="bLock" title="Bloquear">${icon('lock')}</button>
    </header>
    <div class="vault p-list" id="vault">
      <aside class="groups" id="groups"></aside>
      <section class="list" id="list"></section>
      <section class="detail" id="detail"></section>
      <button class="fab" id="fab" title="Nova entrada">${icon('plus')}</button>
    </div>`;
  $('#bMenu').onclick = () => setPane(V.pane === 'groups' ? 'list' : 'groups');
  $('#bAdd').onclick = $('#fab').onclick = () => startEdit(null);
  $('#bGen').onclick = () => openGenerator();
  $('#bSet').onclick = () => openSettings();
  $('#bLock').onclick = lock;
  $('#status').onclick = () => { if (saveState === 'err') save(); };
  setStatus(saveState === 'err' ? 'err' : 'ok');
  renderGroups(); renderList(); renderDetail(); setPane(V.pane);
}
function setPane(p) {
  const prev = V.pane; V.pane = p; const v = $('#vault'); if (!v) return;
  v.className = 'vault p-' + p;
  if (p !== 'list' && prev === 'list') pushBack(paneBack);
  if (p === 'list') popBack(paneBack);
}
function paneBack() {
  if (V.editing) { V.editing = false; renderDetail(); if (!V.entry) return setPane('list'); return pushBack(paneBack); }
  setPane('list');
}

function renderGroups() {
  const el = $('#groups'); if (!el || !db) return;
  const bin = binGroup();
  const count = (g) => { let n = 0; for (const e of g.allEntries()) if (!inBin(e)) n++; return n; };
  const total = count(db.getDefaultGroup());
  let h = `<div class="gsec">Cofre</div>
    <button class="gitem ${V.group === null ? 'sel' : ''}" data-g="">${icon('layers')}<span>Todas as entradas</span><span class="cnt">${total}</span></button>
    <div class="gsec">Pastas</div>`;
  const walk = (g, d) => {
    if (g === bin) return;
    const has = g.groups.some(c => c !== bin); const col = V.collapsed.has(g.uuid.id);
    h += `<button class="gitem ${V.group === g ? 'sel' : ''}" data-g="${g.uuid.id}" style="padding-left:${10 + d * 16}px">
      ${has ? `<span class="tw" data-tw="${g.uuid.id}">${icon(col ? 'chevron' : 'down')}</span>` : ''}${icon('folder')}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name)}</span><span class="cnt">${g.entries.length || ''}</span></button>`;
    if (!col) g.groups.forEach(c => walk(c, d + 1));
  };
  walk(db.getDefaultGroup(), 0);
  if (bin) h += `<div class="gsec">Lixeira</div><button class="gitem ${V.group === bin ? 'sel' : ''}" data-g="${bin.uuid.id}">${icon('bin')}<span>Lixeira</span><span class="cnt">${count(bin) || ''}</span></button>`;
  h += `<div style="padding:12px 4px"><button class="btn sm ghost" id="bNG">${icon('folderPlus')} Nova pasta</button></div>`;
  el.innerHTML = h;
  el.querySelectorAll('[data-tw]').forEach(t => t.onclick = (ev) => { ev.stopPropagation(); const id = t.dataset.tw; V.collapsed.has(id) ? V.collapsed.delete(id) : V.collapsed.add(id); renderGroups(); });
  el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
    V.group = b.dataset.g ? allGroups().map(x => x.g).find(g => g.uuid.id === b.dataset.g) || (bin && bin.uuid.id === b.dataset.g ? bin : null) : null;
    V.query = ''; renderGroups(); renderList(); setPane('list');
  });
  $('#bNG').onclick = async () => {
    const n = await promptBox('Nova pasta', 'Nome da pasta'); if (!n) return;
    const parent = V.group && V.group !== bin ? V.group : db.getDefaultGroup();
    const g = db.createGroup(parent, n); V.group = g; touch(); renderGroups(); renderList(); setPane('list');
  };
}

function visibleEntries() {
  const bin = binGroup(); const q = norm(V.query);
  let src;
  if (V.group) src = V.query ? [...V.group.allEntries()] : V.group.entries.slice();
  else src = [...db.getDefaultGroup().allEntries()].filter(e => !inBin(e));
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    src = src.filter(e => {
      let hay = '';
      for (const [k, v] of e.fields) if (!(v instanceof PV)) hay += ' ' + v; else if (k === 'UserName' || k === 'URL') hay += ' ' + v.getText();
      hay += ' ' + (e.tags || []).join(' '); hay = norm(hay);
      return terms.every(t => hay.includes(t));
    });
  }
  return src.sort((a, b) => S.sort === 'mod' ? (b.times.lastModTime - a.times.lastModTime) : fld(a, 'Title').localeCompare(fld(b, 'Title'), 'pt-BR', { sensitivity: 'base' }));
}

function renderList() {
  const el = $('#list'); if (!el || !db) return;
  const bin = binGroup(); const g = V.group;
  const isBin = g && g === bin; const isRoot = g === db.getDefaultGroup();
  const title = g ? (isBin ? 'Lixeira' : g.name) : 'Todas as entradas';
  const searchFocused = document.activeElement && document.activeElement.id === 'q';
  el.innerHTML = `
    <div class="searchbar"><div class="input">${icon('search')}<input id="q" type="search" placeholder="Buscar em todo o cofre…" value="${esc(V.query)}" autocomplete="off" spellcheck="false"></div></div>
    <div class="lhead"><h2>${esc(title)}</h2>
      ${g && !isBin ? `<button class="ibtn" id="gAdd" title="Subpasta">${icon('folderPlus')}</button>` : ''}
      ${g && !isBin && !isRoot ? `<button class="ibtn" id="gRen" title="Renomear pasta">${icon('edit')}</button><button class="ibtn" id="gDel" title="Excluir pasta">${icon('trash')}</button>` : ''}
      ${isBin ? `<button class="btn sm danger" id="gEmpty">${icon('trash')} Esvaziar</button>` : ''}
      <button class="ibtn" id="sort" title="Ordenar">${icon(S.sort === 'mod' ? 'clock' : 'layers')}</button>
    </div>
    <ul class="entries" id="entries"></ul>`;
  const ul = $('#entries'); const list = visibleEntries();
  const subs = (!V.query && g) ? g.groups.filter(c => c !== bin) : [];
  ul.innerHTML = subs.map(c => `<li><button class="eitem" data-sg="${c.uuid.id}"><span class="avatar" style="background:var(--surface2);color:var(--accent-hi)">${icon('folder')}</span><span class="meta"><div class="t">${esc(c.name)}</div><div class="u">${c.entries.length} entrada(s)</div></span>${icon('chevron')}</button></li>`).join('')
    + list.map((e, i) => `<li><button class="eitem ${V.entry === e ? 'sel' : ''}" data-i="${i}">${avatar(fld(e, 'Title'))}<span class="meta"><div class="t">${esc(fld(e, 'Title') || '(sem título)')}</div>${S.showUser ? `<div class="u">${esc(fld(e, 'UserName') || fld(e, 'URL') || ' ')}</div>` : ''}${(V.query || !g) && e.parentGroup ? `<div class="g">${esc(groupPath(e.parentGroup))}</div>` : ''}</span></button></li>`).join('');
  if (!list.length && !subs.length) ul.innerHTML = `<div class="empty">${icon(V.query ? 'search' : 'key')}${V.query ? 'Nada encontrado.' : 'Nenhuma entrada aqui ainda.'}</div>`;
  ul.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { V.entry = list[+b.dataset.i]; V.editing = false; V.reveal = false; renderList(); renderDetail(); setPane('detail'); });
  ul.querySelectorAll('[data-sg]').forEach(b => b.onclick = () => { V.group = g.groups.find(c => c.uuid.id === b.dataset.sg); renderGroups(); renderList(); });
  const q = $('#q');
  q.oninput = () => { V.query = q.value; const pos = q.selectionStart; renderList(); const nq = $('#q'); nq.focus(); nq.setSelectionRange(pos, pos); };
  if (searchFocused) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  $('#sort').onclick = () => { S.sort = S.sort === 'mod' ? 'title' : 'mod'; saveS(); renderList(); toast(S.sort === 'mod' ? 'Ordenado por alteração recente' : 'Ordenado por nome', 'layers'); };
  $('#gAdd') && ($('#gAdd').onclick = async () => { const n = await promptBox('Nova subpasta', 'Nome'); if (!n) return; V.group = db.createGroup(g, n); touch(); renderGroups(); renderList(); });
  $('#gRen') && ($('#gRen').onclick = async () => { const n = await promptBox('Renomear pasta', 'Nome', g.name); if (!n) return; g.name = n; g.times.update(); touch(); renderGroups(); renderList(); });
  $('#gDel') && ($('#gDel').onclick = async () => {
    if (!await confirmBox('Excluir pasta?', `"${g.name}" e tudo que estiver dentro vão para a Lixeira.`, 'Excluir', true)) return;
    db.remove(g); V.group = null; V.entry = null; touch(); renderGroups(); renderList(); renderDetail();
  });
  $('#gEmpty') && ($('#gEmpty').onclick = async () => {
    if (!await confirmBox('Esvaziar a Lixeira?', 'As entradas serão apagadas de vez. Não dá para desfazer.', 'Esvaziar', true)) return;
    [...bin.groups].forEach(x => db.move(x, null)); [...bin.entries].forEach(x => db.move(x, null));
    V.entry = null; touch(); renderGroups(); renderList(); renderDetail();
  });
}

// ---------- TOTP ----------
function otpConf(e) {
  const v = fld(e, 'otp');
  if (v) {
    try { const u = new URL(v); const p = u.searchParams; if (p.get('secret')) return { secret: p.get('secret'), digits: +(p.get('digits') || 6), period: +(p.get('period') || 30), algo: (p.get('algorithm') || 'SHA1').toUpperCase() }; }
    catch { if (/^[A-Z2-7=\s]+$/i.test(v)) return { secret: v, digits: 6, period: 30, algo: 'SHA1' }; }
  }
  const s = fld(e, 'TimeOtp-Secret-Base32');
  if (s) return { secret: s, digits: +(fld(e, 'TimeOtp-Length') || 6), period: +(fld(e, 'TimeOtp-Period') || 30), algo: (fld(e, 'TimeOtp-Algorithm') || 'SHA1').replace(/HMAC-?/i, '').replace('-', '').toUpperCase() };
  return null;
}
function b32(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; s = s.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0, val = 0; const out = [];
  for (const c of s) { const i = A.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
async function totp(c) {
  const ctr = Math.floor(Date.now() / 1000 / c.period); const msg = new Uint8Array(8);
  let x = ctr; for (let i = 7; i >= 0; i--) { msg[i] = x & 255; x = Math.floor(x / 256); }
  const hash = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[c.algo] || 'SHA-1';
  const k = await crypto.subtle.importKey('raw', b32(c.secret), { name: 'HMAC', hash }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg)); const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** c.digits).padStart(c.digits, '0');
}
let otpTimer = null;

// ---------- detalhe ----------
const STD = ['Title', 'UserName', 'Password', 'URL', 'Notes'];
const HIDE = ['otp', 'TimeOtp-Secret-Base32', 'TimeOtp-Length', 'TimeOtp-Period', 'TimeOtp-Algorithm', 'KeeOtp'];
function renderDetail() {
  const el = $('#detail'); if (!el || !db) return; clearInterval(otpTimer);
  if (V.editing) return renderEdit();
  const e = V.entry;
  if (!e || !e.parentGroup) { V.entry = null; el.innerHTML = `<div class="dempty">${logoHtml()}${wordmark()}<div>Escolha uma entrada para ver os detalhes.</div></div>`; return; }
  const title = fld(e, 'Title'), user = fld(e, 'UserName'), pw = fld(e, 'Password'), url = fld(e, 'URL'), notes = fld(e, 'Notes');
  const custom = [...e.fields.keys()].filter(k => !STD.includes(k) && !HIDE.includes(k));
  const otp = otpConf(e); const isB = inBin(e);
  const row = (lbl, valHtml, acts) => `<div class="row"><div class="grow"><div class="lbl">${esc(lbl)}</div><div class="val">${valHtml}</div></div>${acts}</div>`;
  const cbtn = (k, t = 'Copiar') => `<button class="ibtn" data-copy="${esc(k)}" title="${t}">${icon('copy')}</button>`;
  el.innerHTML = `<div class="dwrap">
    <button class="btn ghost sm show-m" id="dBack" style="margin:-6px 0 10px -8px">${icon('back')} Voltar</button>
    <div class="dhead">${avatar(title)}<div style="min-width:0"><h1>${esc(title || '(sem título)')}</h1><div class="path">${icon('folder', 'ic-inline')}${esc(groupPath(e.parentGroup))}</div></div></div>
    <div class="dactions">
      ${isB ? `<button class="btn sm" id="dRestore">${icon('back')} Restaurar</button><button class="btn sm danger" id="dDel">${icon('trash')} Apagar de vez</button>`
            : `<button class="btn sm primary" id="dEdit">${icon('edit')} Editar</button><button class="btn sm" id="dMove">${icon('move')} Mover</button><button class="btn sm" id="dDup">${icon('copy')} Duplicar</button><button class="btn sm danger" id="dDel">${icon('trash')} Excluir</button>`}
    </div>
    <div class="card">
      ${row('Usuário', user ? esc(user) : '<span style="color:var(--faint)">—</span>', user ? cbtn('UserName') : '')}
      ${row('Senha', pw ? (V.reveal ? pwHtml(pw) : `<span class="masked">${'•'.repeat(Math.min(pw.length, 16))}</span>`) : '<span style="color:var(--faint)">—</span>',
        pw ? `<button class="ibtn" id="rev" title="${V.reveal ? 'Ocultar' : 'Mostrar'}">${icon(V.reveal ? 'eyeOff' : 'eye')}</button>${cbtn('Password')}` : '')}
      ${otp ? row('Código 2FA (TOTP)', `<span class="totp" id="otp">······</span>`, `<svg class="ring" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" stroke="var(--line2)"/><circle id="otpr" cx="13" cy="13" r="10" stroke="var(--accent)" stroke-dasharray="62.8" stroke-dashoffset="0"/></svg><button class="ibtn" id="cotp" title="Copiar">${icon('copy')}</button>`) : ''}
      ${url ? row('Endereço', `<a href="#" id="ourl">${esc(url)}</a>`, `<button class="ibtn" id="ourl2" title="Abrir">${icon('link')}</button>${cbtn('URL')}`) : ''}
    </div>
    ${custom.length ? `<div class="sect">Campos extras</div><div class="card">${custom.map(k => {
      const v = e.fields.get(k); const prot = v instanceof PV; const s = txt(v);
      return row(k, prot ? `<span class="masked" data-pf="${esc(k)}">••••••••</span>` : esc(s), `${prot ? `<button class="ibtn" data-rv="${esc(k)}" title="Mostrar">${icon('eye')}</button>` : ''}${cbtn(k)}`);
    }).join('')}</div>` : ''}
    ${notes ? `<div class="sect">Notas</div><div class="card"><div class="notes">${esc(notes)}</div></div>` : ''}
    ${Object.keys(e.binaries ? Object.fromEntries(e.binaries) : {}).length ? `<div class="sect">Anexos</div><div class="card">${[...e.binaries.keys()].map(n => row('Arquivo', esc(n), `<button class="ibtn" data-att="${esc(n)}" title="Baixar">${icon('download')}</button>`)).join('')}</div>` : ''}
    ${(e.tags || []).length ? `<div class="sect">Etiquetas</div><div class="chips">${e.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="sect">Informações</div>
    <div class="times">Criada em ${fmtDate(e.times.creationTime)}<br>Alterada em ${fmtDate(e.times.lastModTime)}${e.history && e.history.length ? `<br>${e.history.length} versão(ões) anterior(es) guardada(s) no histórico` : ''}</div>
  </div>`;
  $('#dBack') && ($('#dBack').onclick = () => setPane('list'));
  el.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { const k = b.dataset.copy; copy(fld(e, k), { UserName: 'Usuário', Password: 'Senha', URL: 'Endereço' }[k] || k); });
  el.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => { const s = el.querySelector(`[data-pf="${CSS.escape(b.dataset.rv)}"]`); const on = s.classList.toggle('masked'); s.innerHTML = on ? '••••••••' : pwHtml(fld(e, b.dataset.rv)); b.innerHTML = icon(on ? 'eye' : 'eyeOff'); });
  el.querySelectorAll('[data-att]').forEach(b => b.onclick = async () => {
    const bin = e.binaries.get(b.dataset.att); let data = bin && bin.value !== undefined ? bin.value : bin;
    if (data instanceof PV) data = data.getBinary(); await platform.saveAs(b.dataset.att, new Uint8Array(data)); toast('Anexo salvo', 'download');
  });
  $('#rev') && ($('#rev').onclick = () => { V.reveal = !V.reveal; renderDetail(); });
  const openU = (ev) => { ev && ev.preventDefault(); let u = url; if (!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u; platform.openUrl(u); };
  $('#ourl') && ($('#ourl').onclick = openU); $('#ourl2') && ($('#ourl2').onclick = openU);
  if (otp) {
    let code = '';
    const tick = async () => {
      try { code = await totp(otp); const o = $('#otp'); if (!o) return clearInterval(otpTimer); o.textContent = code.replace(/(\d{3})(?=\d)/g, '$1 ');
        const left = otp.period - (Math.floor(Date.now() / 1000) % otp.period); $('#otpr').setAttribute('stroke-dashoffset', String(62.8 * (1 - left / otp.period))); }
      catch { const o = $('#otp'); if (o) o.textContent = 'inválido'; }
    };
    tick(); otpTimer = setInterval(tick, 1000); $('#cotp').onclick = () => copy(code, 'Código');
  }
  if (isB) {
    $('#dRestore').onclick = () => { db.move(e, db.getDefaultGroup()); touch(); renderGroups(); renderList(); renderDetail(); toast('Entrada restaurada'); };
    $('#dDel').onclick = async () => { if (!await confirmBox('Apagar de vez?', 'Esta entrada será apagada definitivamente.', 'Apagar', true)) return; db.move(e, null); V.entry = null; touch(); renderGroups(); renderList(); renderDetail(); setPane('list'); };
    return;
  }
  $('#dEdit').onclick = () => startEdit(e);
  $('#dDel').onclick = async () => { if (!await confirmBox('Excluir entrada?', `"${title}" vai para a Lixeira.`, 'Excluir', true)) return; db.remove(e); V.entry = null; touch(); renderGroups(); renderList(); renderDetail(); setPane('list'); toast('Movida para a Lixeira', 'trash'); };
  $('#dDup').onclick = () => {
    const n = db.createEntry(e.parentGroup); n.copyFrom(e); n.uuid = kdbxweb.KdbxUuid.random(); n.history = []; n.fields.set('Title', title + ' (cópia)'); n.times.update();
    V.entry = n; touch(); renderList(); renderDetail(); toast('Entrada duplicada');
  };
  $('#dMove').onclick = async () => {
    const opts = allGroups().filter(x => x.g !== binGroup() && !inBin(x.g)).map(x => `<option value="${x.g.uuid.id}" ${x.g === e.parentGroup ? 'selected' : ''}>${'\u00A0\u00A0'.repeat(x.depth)}${esc(x.g.name)}</option>`).join('');
    const id = await dialog({ title: 'Mover para', html: `<div class="input"><select id="mg">${opts}</select></div>`, buttons: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Mover', cls: 'primary', value: o => $('#mg', o).value }] });
    if (!id) return; const g = allGroups().map(x => x.g).find(g => g.uuid.id === id); if (g && g !== e.parentGroup) { db.move(e, g); touch(); renderGroups(); renderList(); renderDetail(); toast('Movida para ' + g.name, 'move'); }
  };
}

// ---------- edição ----------
let draft = null;
function startEdit(e) {
  const bin = binGroup();
  const g = e ? e.parentGroup : (V.group && V.group !== bin ? V.group : db.getDefaultGroup());
  draft = {
    entry: e, group: g,
    Title: e ? fld(e, 'Title') : '', UserName: e ? fld(e, 'UserName') : '', Password: e ? fld(e, 'Password') : genPassword(S.gen),
    URL: e ? fld(e, 'URL') : '', Notes: e ? fld(e, 'Notes') : '', otp: e ? fld(e, 'otp') : '', tags: e ? (e.tags || []).join(', ') : '',
    custom: e ? [...e.fields.keys()].filter(k => !STD.includes(k) && k !== 'otp').map(k => ({ k, v: fld(e, k), p: e.fields.get(k) instanceof PV })) : [],
  };
  V.editing = true; V.reveal = !e; renderDetail();
  if (V.pane !== 'detail') setPane('detail');
}
function renderEdit() {
  const el = $('#detail'); const d = draft;
  const opts = allGroups().filter(x => x.g !== binGroup() && !inBin(x.g)).map(x => `<option value="${x.g.uuid.id}" ${x.g === d.group ? 'selected' : ''}>${'\u00A0\u00A0\u00A0'.repeat(x.depth)}${esc(x.g.name)}</option>`).join('');
  el.innerHTML = `<div class="dwrap">
    <div class="dhead">${avatar(d.Title || '+')}<div><h1>${d.entry ? 'Editar entrada' : 'Nova entrada'}</h1><div class="path">Tudo é gravado no seu arquivo .kdbx</div></div></div>
    <div class="field"><label>Título</label><div class="input"><input id="fT" value="${esc(d.Title)}" placeholder="Ex.: Gmail, Banco, SEI…"></div></div>
    <div class="field"><label>Usuário</label><div class="input"><input id="fU" value="${esc(d.UserName)}" autocomplete="off" spellcheck="false"></div></div>
    <div class="field"><label>Senha</label><div class="input"><input id="fP" class="mono" type="${V.reveal ? 'text' : 'password'}" value="${esc(d.Password)}" autocomplete="new-password" spellcheck="false">
      <button class="ibtn" id="fEye" title="Mostrar">${icon(V.reveal ? 'eyeOff' : 'eye')}</button><button class="ibtn on" id="fGen" title="Gerar senha">${icon('dice')}</button></div>
      <div class="strength"><i id="sBar"></i></div><div class="slabel" id="sLbl"></div></div>
    <div class="field"><label>Endereço (URL)</label><div class="input"><input id="fL" value="${esc(d.URL)}" inputmode="url" spellcheck="false" placeholder="https://"></div></div>
    <div class="field"><label>Pasta</label><div class="input"><select id="fG">${opts}</select></div></div>
    <div class="field"><label>Notas</label><div class="input"><textarea id="fN">${esc(d.Notes)}</textarea></div></div>
    <div class="field"><label>Código 2FA (chave TOTP ou link otpauth://) — opcional</label><div class="input"><input id="fO" class="mono" value="${esc(d.otp)}" spellcheck="false"></div></div>
    <div class="field"><label>Etiquetas (separadas por vírgula)</label><div class="input"><input id="fTg" value="${esc(d.tags)}"></div></div>
    <div class="field"><label>Campos extras</label><div id="cfs"></div><button class="btn sm ghost" id="addCf" style="align-self:flex-start">${icon('plus')} Adicionar campo</button></div>
    <div class="formbar"><button class="btn ghost" id="fCancel">Cancelar</button><button class="btn primary" id="fSave">${icon('check')} Salvar</button></div>
  </div>`;
  const bind = (id, k) => { $(id).oninput = (ev) => { d[k] = ev.target.value; if (k === 'Password') strength(); }; };
  bind('#fT', 'Title'); bind('#fU', 'UserName'); bind('#fP', 'Password'); bind('#fL', 'URL'); bind('#fN', 'Notes'); bind('#fO', 'otp'); bind('#fTg', 'tags');
  $('#fG').onchange = (ev) => { d.group = allGroups().map(x => x.g).find(g => g.uuid.id === ev.target.value); };
  $('#fEye').onclick = () => { V.reveal = !V.reveal; $('#fP').type = V.reveal ? 'text' : 'password'; $('#fEye').innerHTML = icon(V.reveal ? 'eyeOff' : 'eye'); };
  $('#fGen').onclick = async () => { const p = await openGenerator(true); if (p) { d.Password = p; $('#fP').value = p; V.reveal = true; $('#fP').type = 'text'; strength(); } };
  const renderCf = () => {
    $('#cfs').innerHTML = d.custom.map((c, i) => `<div class="cfrow"><div class="input"><input data-ck="${i}" value="${esc(c.k)}" placeholder="Nome"></div><div class="input"><input data-cv="${i}" value="${esc(c.v)}" placeholder="Valor" type="${c.p ? 'password' : 'text'}"></div>
      <button class="ibtn ${c.p ? 'on' : ''}" data-cp="${i}" title="Protegido">${icon('lock')}</button><button class="ibtn" data-cx="${i}" title="Remover">${icon('x')}</button></div>`).join('');
    $('#cfs').querySelectorAll('[data-ck]').forEach(x => x.oninput = () => { d.custom[+x.dataset.ck].k = x.value; });
    $('#cfs').querySelectorAll('[data-cv]').forEach(x => x.oninput = () => { d.custom[+x.dataset.cv].v = x.value; });
    $('#cfs').querySelectorAll('[data-cp]').forEach(x => x.onclick = () => { const c = d.custom[+x.dataset.cp]; c.p = !c.p; renderCf(); });
    $('#cfs').querySelectorAll('[data-cx]').forEach(x => x.onclick = () => { d.custom.splice(+x.dataset.cx, 1); renderCf(); });
  };
  renderCf();
  $('#addCf').onclick = () => { d.custom.push({ k: '', v: '', p: false }); renderCf(); $('#cfs').querySelector(`[data-ck="${d.custom.length - 1}"]`).focus(); };
  const strength = () => { const s = scorePw(d.Password); $('#sBar').style.width = s.pct + '%'; $('#sBar').style.background = s.color; $('#sLbl').textContent = d.Password ? `${s.label} · ~${s.bits} bits` : ''; };
  strength();
  $('#fCancel').onclick = () => { V.editing = false; renderDetail(); if (!d.entry) setPane('list'); };
  $('#fSave').onclick = () => commitEdit();
  if (!d.entry) setTimeout(() => { const a = document.activeElement; if ((!a || a === document.body || a.id === 'bAdd' || a.id === 'fab') && $('#fT')) $('#fT').focus(); }, 30);
}
function commitEdit() {
  const d = draft;
  if (!d.Title.trim()) { toast('Dê um título à entrada', 'info'); $('#fT').focus(); return; }
  const names = d.custom.map(c => c.k.trim()).filter(Boolean);
  if (names.some(n => STD.includes(n) || n === 'otp') || new Set(names).size !== names.length) { toast('Nomes de campos extras repetidos ou reservados', 'info'); return; }
  let e = d.entry;
  if (e) e.pushHistory(); else e = db.createEntry(d.group);
  e.fields.set('Title', d.Title.trim()); e.fields.set('UserName', d.UserName); e.fields.set('Password', PV.fromString(d.Password));
  e.fields.set('URL', d.URL.trim()); e.fields.set('Notes', d.Notes);
  if (d.otp.trim()) e.fields.set('otp', d.otp.trim()); else e.fields.delete('otp');
  for (const k of [...e.fields.keys()]) if (!STD.includes(k) && k !== 'otp') e.fields.delete(k);
  d.custom.forEach(c => { const k = c.k.trim(); if (k) e.fields.set(k, c.p ? PV.fromString(c.v) : c.v); });
  e.tags = d.tags.split(',').map(s => s.trim()).filter(Boolean);
  e.times.update();
  if (d.entry && d.group !== e.parentGroup) db.move(e, d.group);
  V.entry = e; V.editing = false; V.reveal = false; draft = null;
  touch(); renderGroups(); renderList(); renderDetail(); toast('Entrada salva');
}

// ================= gerador de senhas =================
const SETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%&*()-_=+[]{};:,.?/' };
const AMB = /[Il1O0o|`'"]/g;
function rnd(n) { const a = new Uint32Array(1); const lim = Math.floor(0x100000000 / n) * n; do crypto.getRandomValues(a); while (a[0] >= lim); return a[0] % n; }
function genPassword(o) {
  const sets = Object.keys(SETS).filter(k => o[k]).map(k => o.noAmb ? SETS[k].replace(AMB, '') : SETS[k]);
  if (!sets.length) return '';
  const all = sets.join(''); const out = sets.map(s => s[rnd(s.length)]);
  while (out.length < o.len) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.slice(0, o.len).join('');
}
function scorePw(p) {
  let pool = 0; if (/[a-z]/.test(p)) pool += 26; if (/[A-Z]/.test(p)) pool += 26; if (/\d/.test(p)) pool += 10; if (/[^A-Za-z0-9]/.test(p)) pool += 30;
  let bits = Math.round(p.length * Math.log2(pool || 1)); if (/^(.)\1+$/.test(p)) bits = 4;
  const lv = bits < 40 ? ['Fraca', 'var(--danger)', 25] : bits < 64 ? ['Razoável', '#E5A54B', 50] : bits < 90 ? ['Forte', 'var(--ok)', 78] : ['Muito forte', 'var(--ok)', 100];
  return { bits, label: lv[0], color: lv[1], pct: lv[2] };
}
function openGenerator(pick = false) {
  const o = { ...S.gen }; let cur = genPassword(o);
  return dialog({
    title: 'Gerador de senhas',
    html: `<div class="genout" id="go"></div><div class="strength"><i id="gb"></i></div><div class="slabel" id="gl"></div>
      <div class="range"><span>Tamanho</span><input type="range" id="glen" min="6" max="64" value="${o.len}"><b id="glv">${o.len}</b></div>
      <div class="chips">${[['upper', 'A-Z'], ['lower', 'a-z'], ['digits', '0-9'], ['symbols', '!@#'], ['noAmb', 'Sem ambíguos (l, 1, O, 0)']].map(([k, l]) => `<button class="chip ${o[k] ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
      <button class="btn sm" id="gre">${icon('dice')} Gerar outra</button>`,
    buttons: pick ? [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Usar esta senha', cls: 'primary', value: () => { S.gen = o; saveS(); return cur; } }]
      : [{ label: 'Fechar', value: null, cls: 'ghost' }, { label: 'Copiar', cls: 'primary', value: () => { S.gen = o; saveS(); copy(cur, 'Senha'); return cur; } }],
    onOpen: (ov) => {
      const show = () => { $('#go', ov).innerHTML = pwHtml(cur); const s = scorePw(cur); $('#gb', ov).style.width = s.pct + '%'; $('#gb', ov).style.background = s.color; $('#gl', ov).textContent = `${s.label} · ~${s.bits} bits`; };
      const regen = () => { cur = genPassword(o); show(); };
      $('#glen', ov).oninput = (ev) => { o.len = +ev.target.value; $('#glv', ov).textContent = o.len; regen(); };
      ov.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
        const k = b.dataset.k; o[k] = !o[k];
        if (!['upper', 'lower', 'digits', 'symbols'].some(x => o[x])) { o[k] = true; return; }
        b.classList.toggle('on', o[k]); regen();
      });
      $('#gre', ov).onclick = regen; show();
    },
  });
}

// ================= configurações (tela cheia com abas) =================
function openSettings(tab = 'geral') {
  document.querySelectorAll('.cfg').forEach(c => c.remove());
  const c = document.createElement('div'); c.className = 'cfg';
  const tabs = [['geral', 'Geral'], ['seg', 'Segurança'], ['apar', 'Aparência'], ['ajuda', 'Ajuda'], ['sobre', 'Sobre']];
  c.innerHTML = `<div class="cfg-head">${logoHtml()}<h2>Configurações</h2><button class="btn sm" id="cClose">Fechar ${icon('x')}</button></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
    <div class="cfg-body"><div class="pg" id="pg"></div></div>`;
  document.body.appendChild(c);
  const close = () => { c.remove(); popBack(close); if (db) renderVault(); else if (file) renderUnlock(file); else renderHome(); };
  pushBack(close); $('#cClose', c).onclick = close;
  c.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { c.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === b)); page(b.dataset.t); });
  const sel = (id, val, opts) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const sw = (id, on) => `<label class="sw"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></label>`;
  const it = (t, d, ctl) => `<div class="it"><div class="grow"><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div>${ctl}</div>`;
  function page(t) {
    const pg = $('#pg', c);
    if (t === 'geral') {
      pg.innerHTML = `<div class="card">
        ${it('Cofre aberto', db ? esc(file.name) : 'nenhum', db ? `<button class="btn sm" id="cSave">${icon('save')} Salvar agora</button>` : '')}
        ${it('Ordem das entradas', '', sel('cSort', S.sort, [['title', 'Por nome'], ['mod', 'Alteração recente']]))}
        ${it('Gerador de senhas', `Padrão: ${S.gen.len} caracteres`, `<button class="btn sm" id="cGen">${icon('dice')} Abrir</button>`)}
        ${db ? it('Nome do cofre', esc(db.meta.name || ''), `<button class="btn sm" id="cName">${icon('edit')} Alterar</button>`) : ''}
        ${db ? it('Lixeira', 'Entradas excluídas vão para a Lixeira antes de sumir', sw('cBin', db.meta.recycleBinEnabled !== false)) : ''}
        ${db ? it('Cópia de segurança', 'Baixa uma cópia do .kdbx com a data de hoje', `<button class="btn sm" id="cBak">${icon('download')} Baixar</button>`) : ''}
      </div>`;
      $('#cSort', pg).onchange = (e) => { S.sort = e.target.value; saveS(); };
      $('#cGen', pg).onclick = () => openGenerator();
      $('#cSave', pg) && ($('#cSave', pg).onclick = async () => { await save(); toast('Salvo'); });
      $('#cName', pg) && ($('#cName', pg).onclick = async () => { const n = await promptBox('Nome do cofre', 'Nome', db.meta.name); if (n) { db.meta.name = n; db.meta.nameChanged = new Date(); touch(); page('geral'); } });
      $('#cBin', pg) && ($('#cBin', pg).onchange = (e) => { db.meta.recycleBinEnabled = e.target.checked; touch(); });
      $('#cBak', pg) && ($('#cBak', pg).onclick = async () => { const b = new Uint8Array(await db.save()); await platform.saveAs(file.name.replace(/\.kdbx$/i, '') + '-' + new Date().toISOString().slice(0, 10) + '.kdbx', b); toast('Cópia salva', 'download'); });
    }
    if (t === 'seg') {
      const bs = platform.bio.status();
      pg.innerHTML = `<div class="card">
        ${it('Bloquear sozinho após', 'Sem uso por esse tempo, o cofre se fecha', sel('cAuto', S.autolock, [[1, '1 minuto'], [2, '2 minutos'], [5, '5 minutos'], [10, '10 minutos'], [15, '15 minutos'], [30, '30 minutos'], [0, 'Nunca']]))}
        ${it('Bloquear ao sair do app', 'Fecha o cofre quando você troca de app ou de aba', sw('cLeave', S.lockOnLeave))}
        ${it('Apagar área de transferência', 'Tempo até apagar a senha copiada', sel('cClip', S.clip, [[10, '10 s'], [20, '20 s'], [30, '30 s'], [60, '1 min'], [120, '2 min'], [0, 'Não apagar']]))}
        ${isAndroid ? it('Digital neste cofre', bs === 'ok' ? (db ? 'Abrir com a impressão digital' : 'Abra um cofre para configurar') : 'Nenhuma digital cadastrada no aparelho', db && bs === 'ok' ? sw('cBio', platform.bio.has(file.id)) : '') : ''}
        ${db ? it('Senha mestra', 'Troca a senha que abre este cofre', `<button class="btn sm" id="cPw">${icon('key')} Trocar</button>`) : ''}
      </div>`;
      $('#cAuto', pg).onchange = (e) => { S.autolock = +e.target.value; saveS(); };
      $('#cLeave', pg).onchange = (e) => { S.lockOnLeave = e.target.checked; saveS(); };
      $('#cClip', pg).onchange = (e) => { S.clip = +e.target.value; saveS(); };
      $('#cBio', pg) && ($('#cBio', pg).onchange = async (e) => {
        if (!e.target.checked) { platform.bio.remove(file.id); toast('Digital desativada', 'finger'); return; }
        const p = await dialog({ title: 'Ativar digital', html: `<div class="field"><label>Confirme a senha mestra</label><div class="input"><input id="bp" type="password" class="mono"></div></div>`, buttons: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Continuar', cls: 'primary', value: o => $('#bp', o).value || false }] });
        if (!p || !db.credentials.passwordHash) { e.target.checked = false; return; }
        const test = new kdbxweb.Credentials(PV.fromString(p)); await test.ready;
        const a = test.passwordHash.getBinary(), bb = db.credentials.passwordHash.getBinary();
        if (a.length !== bb.length || a.some((x, i) => x !== bb[i])) { toast('Senha mestra incorreta', 'info'); e.target.checked = false; return; }
        await enableBio(p); page('seg');
      });
      $('#cPw', pg) && ($('#cPw', pg).onclick = async () => {
        const r = await dialog({ title: 'Trocar senha mestra', body: 'O arquivo continuará compatível com o KeePass. Nos outros aparelhos, use a nova senha.',
          html: `<div class="field"><label>Nova senha mestra</label><div class="input"><input id="n1" type="password" class="mono"></div></div><div class="field"><label>Repita</label><div class="input"><input id="n2" type="password" class="mono"></div></div><div class="err" id="ne"></div>`,
          buttons: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Trocar', cls: 'primary', value: o => { const a = $('#n1', o).value, b = $('#n2', o).value; if (a.length < 8) { $('#ne', o).textContent = 'Mínimo de 8 caracteres.'; return false; } if (a !== b) { $('#ne', o).textContent = 'As senhas não conferem.'; return false; } return a; } }] });
        if (!r) return;
        await db.credentials.setPassword(PV.fromString(r)); db.meta.keyChanged = new Date();
        await save(); loadedHash = null;
        if (platform.bio.has(file.id)) { platform.bio.remove(file.id); await enableBio(r); }
        toast('Senha mestra trocada', 'key');
      });
    }
    if (t === 'apar') {
      pg.innerHTML = `<div class="card">
        ${it('Tema', 'Escuro de alto contraste ou claro', sel('cTheme', S.theme, [['dark', 'Escuro'], ['light', 'Claro']]))}
        ${it('Mostrar usuário na lista', '', sw('cUser', S.showUser))}
        <div class="it"><div class="grow"><div class="t">Logomarca</div><div class="d">Use uma imagem sua (PNG, JPG ou SVG)</div></div>
          <div class="logo-pick"><div class="prev">${logoHtml()}</div><button class="btn sm" id="cLogo">Trocar</button>${S.brand.logo ? `<button class="btn sm ghost" id="cLogoX">Padrão</button>` : ''}</div></div>
        ${it('Nome do app', esc(S.brand.name), `<button class="btn sm" id="cBName">${icon('edit')} Editar</button>`)}
        ${it('Frase da tela inicial', esc(S.brand.tagline), `<button class="btn sm" id="cTag">${icon('edit')} Editar</button>`)}
      </div>`;
      $('#cTheme', pg).onchange = (e) => { S.theme = e.target.value; saveS(); applyTheme(); };
      $('#cUser', pg).onchange = (e) => { S.showUser = e.target.checked; saveS(); };
      $('#cLogo', pg).onclick = () => pickLogo(() => { reopen('apar'); });
      $('#cLogoX', pg) && ($('#cLogoX', pg).onclick = () => { S.brand.logo = null; saveS(); reopen('apar'); });
      $('#cBName', pg).onclick = async () => { const n = await promptBox('Nome do app', 'Use _ para destacar (ex.: DVA_Pass)', S.brand.name); if (n) { S.brand.name = n; saveS(); applyTheme(); reopen('apar'); } };
      $('#cTag', pg).onclick = async () => { const n = await promptBox('Frase da tela inicial', 'Frase', S.brand.tagline); if (n) { S.brand.tagline = n; saveS(); page('apar'); } };
    }
    if (t === 'ajuda') {
      pg.innerHTML = `<div class="card help"><table>
        <tr><td>Mesmo cofre no PC e no celular</td><td>Guarde o .kdbx no Google Drive. No celular, abra o arquivo pelo Drive; no PC, abra pela pasta do Google Drive (G:). Cada alteração é gravada no próprio arquivo.</td></tr>
        <tr><td>Alterei nos dois aparelhos</td><td>Ao salvar, o DVA_Pass percebe que o arquivo mudou e mescla as alterações, sem perder nada.</td></tr>
        <tr><td>Compatível com KeePass</td><td>O arquivo continua abrindo no KeePass2 e no Keepass2Android. Pode usar os dois juntos.</td></tr>
        <tr><td>Digital</td><td>No Android, depois de abrir com a senha, ative a digital. A senha fica criptografada no aparelho e só sai com a sua digital.</td></tr>
        <tr><td>Copiar senha</td><td>Toque no ícone de copiar. A área de transferência é apagada sozinha (ajuste em Segurança).</td></tr>
        <tr><td>Código 2FA</td><td>Coloque a chave TOTP na entrada e o código de 6 dígitos aparece com o tempo restante.</td></tr>
        <tr><td>Busca</td><td>Procura no título, usuário, endereço, notas, etiquetas e campos extras, sem ligar para acentos.</td></tr>
        <tr><td>Excluí sem querer</td><td>Abra a Lixeira, escolha a entrada e toque em Restaurar.</td></tr>
        <tr><td>No computador</td><td>Use o Chrome ou o Edge para gravar direto no arquivo. Em outros navegadores, o arquivo é baixado ao salvar.</td></tr>
        <tr><td>Esqueci a senha mestra</td><td>Não há como recuperar: é isso que protege o cofre. Guarde-a num lugar seguro.</td></tr>
      </table></div>`;
    }
    if (t === 'sobre') {
      const b = S.brand;
      pg.innerHTML = `<div class="card"><div class="about">
        ${logoHtml()}${wordmark()}
        <span class="ver">versão ${esc(VERSION)} ${isAndroid ? '· Android' : '· navegador'}</span><br>
        <span class="credit">criado por <b>${esc(b.credit)}</b></span><br>
        contato: <a href="mailto:${esc(b.contact)}">${esc(b.contact)}</a><br><br>
        <span class="small">${esc(b.place)}</span><br>
        <span class="small">Cofres KeePass KDBX 3.1 e 4 · criptografia AES-256 / ChaCha20 · Argon2</span><br><br>
        <button class="btn sm" id="cEditAbout">${icon('edit')} Editar Sobre e logomarca</button>
      </div></div>
      <div class="card">${it('Restaurar configurações', 'Volta tema, logomarca e textos ao padrão. Não mexe nos cofres.', `<button class="btn sm danger" id="cReset">Restaurar</button>`)}</div>`;
      $('#cEditAbout', pg).onclick = () => editAbout(() => page('sobre'));
      $('#cReset', pg).onclick = async () => { if (!await confirmBox('Restaurar configurações?', 'Os seus cofres e senhas não são afetados.', 'Restaurar', true)) return; S = { ...DEF, brand: { ...DEF.brand }, gen: { ...DEF.gen }, bioAsked: S.bioAsked }; saveS(); applyTheme(); reopen('sobre'); };
    }
  }
  function reopen(t) { c.remove(); popBack(close); openSettings(t); }
  page(tab);
}
function pickLogo(done) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
  i.onchange = () => {
    const f = i.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      if (f.type === 'image/svg+xml') { S.brand.logo = r.result; saveS(); return done(); }
      const img = new Image(); img.onload = () => {
        const s = 256, cv = document.createElement('canvas'); cv.width = cv.height = s; const ctx = cv.getContext('2d');
        const k = Math.min(s / img.width, s / img.height); const w = img.width * k, h = img.height * k;
        ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h); S.brand.logo = cv.toDataURL('image/png'); saveS(); done();
      }; img.src = r.result;
    };
    r.readAsDataURL(f);
  };
  i.click();
}
async function editAbout(done) {
  const b = S.brand;
  const r = await dialog({
    title: 'Editar Sobre',
    html: `<div class="field"><label>Nome do app</label><div class="input"><input id="a1" value="${esc(b.name)}"></div></div>
      <div class="field"><label>Criado por</label><div class="input"><input id="a2" value="${esc(b.credit)}"></div></div>
      <div class="field"><label>Contato</label><div class="input"><input id="a3" value="${esc(b.contact)}"></div></div>
      <div class="field"><label>Linha final</label><div class="input"><input id="a4" value="${esc(b.place)}"></div></div>
      <div class="field"><label>Logomarca</label><div class="logo-pick"><div class="prev" id="lp">${logoHtml()}</div><button class="btn sm" id="a5">Trocar imagem</button><button class="btn sm ghost" id="a6">Padrão</button></div></div>`,
    buttons: [{ label: 'Cancelar', value: null, cls: 'ghost' }, { label: 'Salvar', cls: 'primary', value: o => ({ name: $('#a1', o).value.trim() || 'DVA_Pass', credit: $('#a2', o).value.trim(), contact: $('#a3', o).value.trim(), place: $('#a4', o).value.trim() }) }],
    onOpen: (o) => {
      $('#a5', o).onclick = () => pickLogo(() => { $('#lp', o).innerHTML = logoHtml(); });
      $('#a6', o).onclick = () => { S.brand.logo = null; saveS(); $('#lp', o).innerHTML = logoHtml(); };
    },
  });
  if (r) { Object.assign(S.brand, r); saveS(); applyTheme(); toast('Sobre atualizado'); }
  done();
}

// ================= início =================
document.addEventListener('keydown', (e) => {
  if (!db || document.querySelector('.overlay,.cfg')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#q') && $('#q').focus(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); startEdit(null); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); lock(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  if (e.key === 'Escape' && V.editing) { V.editing = false; renderDetail(); }
});
window.addEventListener('beforeunload', (e) => { if (saveState === 'dirty' || saveState === 'busy') { e.preventDefault(); e.returnValue = ''; } });
renderHome();
window.__dva = { get db() { return db; }, save, V };
