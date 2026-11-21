// Camada de plataforma: Android (ponte Java) ou PC (Chrome/Edge com File System Access API)
const A = window.AndroidApp;
export const isAndroid = !!A;

// ---------- utilidades ----------
export function b64ToBytes(b64) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
export function bytesToB64(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
  return btoa(s);
}
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ---------- chamadas assíncronas para o Android ----------
const pending = new Map();
window.DVA_cb = (id, ok, data) => {
  const p = pending.get(id); if (!p) return; pending.delete(id);
  ok ? p.resolve(data) : p.reject(Object.assign(new Error(data || 'erro'), { code: data }));
};
function call(method, ...args) {
  return new Promise((resolve, reject) => {
    const id = uid(); pending.set(id, { resolve, reject });
    try { A[method](id, ...args); } catch (e) { pending.delete(id); reject(e); }
  });
}

// ---------- IndexedDB (PC: guarda os "atalhos" dos arquivos) ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('dva-pass', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('handles');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbPut(k, v) { try { return await idbPut0(k, v); } catch (e) { console.warn('idb', e); } }
async function idbPut0(k, v) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('handles', 'readwrite'); t.objectStore('handles').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function idbGet(k) { const d = await idb(); return new Promise((res, rej) => { const r = d.transaction('handles').objectStore('handles').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbDel(k) { const d = await idb(); return new Promise((res) => { const t = d.transaction('handles', 'readwrite'); t.objectStore('handles').delete(k); t.oncomplete = res; t.onerror = res; }); }

const hasFSA = 'showOpenFilePicker' in window;
const kdbxTypes = [{ description: 'Cofre KeePass', accept: { 'application/octet-stream': ['.kdbx'] } }];

// ---------- arquivos recentes ----------
export const recent = {
  list() { try { return JSON.parse(localStorage.getItem('dva.recent') || '[]'); } catch { return []; } },
  save(l) { localStorage.setItem('dva.recent', JSON.stringify(l)); },
  add(f) {
    const l = this.list().filter(x => x.id !== f.id);
    l.unshift({ id: f.id, name: f.name, uri: f.uri || null, keyName: f.keyName || null, keyUri: f.keyUri || null });
    this.save(l.slice(0, 8));
  },
  async remove(id) {
    const f = this.list().find(x => x.id === id);
    this.save(this.list().filter(x => x.id !== id));
    if (!isAndroid) { await idbDel(id); await idbDel(id + ':key'); }
    else if (f && f.uri) { try { A.releaseUri(f.uri); } catch {} }
  },
};

// ---------- interface comum ----------
// "arquivo" = { id, name, uri? (Android), handle? (PC), fallback? (somente leitura + download) }
export const platform = {
  name: isAndroid ? 'android' : 'pc',
  canWrite: isAndroid || hasFSA,

  async pickDb() {
    if (isAndroid) {
      const r = JSON.parse(await call('pickFile', 'db'));
      return { id: 'a:' + r.uri, name: r.name, uri: r.uri };
    }
    if (hasFSA) {
      const [h] = await window.showOpenFilePicker({ types: kdbxTypes, excludeAcceptAllOption: false });
      const id = 'p:' + uid(); await idbPut(id, h);
      return { id, name: h.name, handle: h };
    }
    const file = await pickViaInput('.kdbx');
    return { id: 'f:' + file.name, name: file.name, fallback: file };
  },

  async pickKey() {
    if (isAndroid) {
      const r = JSON.parse(await call('pickFile', 'key'));
      return { name: r.name, uri: r.uri, bytes: b64ToBytes(await call('readFile', r.uri)) };
    }
    if (hasFSA) {
      const [h] = await window.showOpenFilePicker();
      return { name: h.name, handle: h, bytes: new Uint8Array(await (await h.getFile()).arrayBuffer()) };
    }
    const f = await pickViaInput('*'); return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
  },

  async createDb(suggested) {
    if (isAndroid) {
      const r = JSON.parse(await call('createFile', suggested));
      return { id: 'a:' + r.uri, name: r.name, uri: r.uri };
    }
    if (hasFSA) {
      const h = await window.showSaveFilePicker({ suggestedName: suggested, types: kdbxTypes });
      const id = 'p:' + uid(); await idbPut(id, h);
      return { id, name: h.name, handle: h };
    }
    return { id: 'f:' + suggested, name: suggested, fallback: null };
  },

  // Recupera o arquivo de um item da lista de recentes
  async fromRecent(r) {
    if (isAndroid) return { id: r.id, name: r.name, uri: r.uri, keyName: r.keyName, keyUri: r.keyUri };
    const handle = await idbGet(r.id);
    if (!handle) throw new Error('Atalho perdido. Abra o arquivo novamente.');
    const keyHandle = await idbGet(r.id + ':key');
    return { id: r.id, name: r.name, handle, keyName: r.keyName, keyHandle };
  },

  async rememberKey(file, key) {
    file.keyName = key ? key.name : null;
    if (isAndroid) file.keyUri = key ? key.uri : null;
    else if (key && key.handle) await idbPut(file.id + ':key', key.handle); else await idbDel(file.id + ':key');
  },

  async readKey(file) {
    if (isAndroid && file.keyUri) return b64ToBytes(await call('readFile', file.keyUri));
    if (file.keyHandle) {
      if ((await file.keyHandle.queryPermission({ mode: 'read' })) !== 'granted') await file.keyHandle.requestPermission({ mode: 'read' });
      return new Uint8Array(await (await file.keyHandle.getFile()).arrayBuffer());
    }
    return null;
  },

  // Deve ser chamado num clique (o Chrome pede permissão)
  async ensurePermission(file) {
    if (!file.handle) return;
    const o = { mode: 'readwrite' };
    if ((await file.handle.queryPermission(o)) !== 'granted') {
      if ((await file.handle.requestPermission(o)) !== 'granted') throw new Error('Permissão negada para o arquivo.');
    }
  },

  async read(file) {
    if (isAndroid) return b64ToBytes(await call('readFile', file.uri));
    if (file.handle) return new Uint8Array(await (await file.handle.getFile()).arrayBuffer());
    if (file.fallback) return new Uint8Array(await file.fallback.arrayBuffer());
    throw new Error('Arquivo indisponível');
  },

  async write(file, bytes) {
    if (isAndroid) return call('writeFile', file.uri, bytesToB64(bytes));
    if (file.handle) { const w = await file.handle.createWritable(); await w.write(bytes); await w.close(); return; }
    download(file.name, bytes); // navegador sem gravação direta
  },

  async saveAs(name, bytes) {
    if (isAndroid) return call('saveAs', name, bytesToB64(bytes));
    download(name, bytes);
  },

  copy(text, clearSec) {
    if (isAndroid) { A.copy(text, clearSec || 0); return Promise.resolve(); }
    const p = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject();
    if (clearSec > 0) setTimeout(() => { navigator.clipboard && navigator.clipboard.writeText('').catch(() => {}); }, clearSec * 1000);
    return p.catch(() => legacyCopy(text));
  },

  openUrl(url) { if (isAndroid) A.openUrl(url); else window.open(url, '_blank', 'noopener'); },

  bio: {
    status() { return isAndroid ? A.bioStatus() : 'unsupported'; }, // ok | none | unsupported
    has(key) { return isAndroid && A.bioHas(key); },
    save(key, secret) { return call('bioEncrypt', key, secret); },
    load(key) { return call('bioDecrypt', key); },
    remove(key) { if (isAndroid) A.bioRemove(key); },
  },

  exit() { if (isAndroid) A.exitApp(); },
};

function pickViaInput(accept) {
  return new Promise((res, rej) => {
    const i = document.createElement('input'); i.type = 'file'; if (accept !== '*') i.accept = accept;
    i.onchange = () => i.files[0] ? res(i.files[0]) : rej(new Error('cancelado'));
    i.click();
  });
}
function download(name, bytes) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function legacyCopy(t) {
  const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
}
