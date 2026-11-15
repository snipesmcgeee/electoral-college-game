// In-browser stand-in for js/firebase.js, used only by tests/e2e.py.
// Stores everything in localStorage so several tabs (host, board, phones) share one "database".
const KEY = 'mockdb';
const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
const save = d => localStorage.setItem(KEY, JSON.stringify(d));

export const configured = true;
export const db = {};
export const auth = {};

const tabUid = sessionStorage.getItem('uid') || ('u' + Math.random().toString(36).slice(2, 8));
sessionStorage.setItem('uid', tabUid);
export async function signInGuest() { return { uid: tabUid, isAnonymous: true }; }

const docRef = path => ({ kind: 'doc', path, id: path.split('/').pop() });
const colRef = path => ({ kind: 'col', path, cons: [] });

function apply(obj, path, val) {
  const parts = path.split('.');
  let o = obj;
  for (const p of parts.slice(0, -1)) { if (typeof o[p] !== 'object' || o[p] === null) o[p] = {}; o = o[p]; }
  const last = parts.at(-1);
  if (val && val.__op === 'inc') o[last] = (Number(o[last]) || 0) + val.n;
  else if (val && val.__op === 'union') o[last] = [...new Set([...(o[last] || []), ...val.vals])];
  else o[last] = clone(val);
}
const clone = v => v === undefined ? null : JSON.parse(JSON.stringify(v));
function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !v.__op && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], v);
    else apply(a, k, v);
  }
  return a;
}
function snapDoc(d, path) {
  const data = d[path];
  return { id: path.split('/').pop(), ref: docRef(path), exists: () => data !== undefined, data: () => clone(data) ?? undefined };
}
function runQuery(d, q) {
  let docs = Object.keys(d).filter(p => p.startsWith(q.path + '/') && p.split('/').length === q.path.split('/').length + 1)
    .map(p => snapDoc(d, p));
  for (const c of q.cons) {
    if (c.t === 'where') docs = docs.filter(s => s.data()?.[c.f] === c.v);
    if (c.t === 'order') docs.sort((a, b) => (a.id < b.id ? -1 : 1) * (c.dir === 'desc' ? -1 : 1));
    if (c.t === 'limit') docs = docs.slice(0, c.n);
  }
  return { docs, empty: docs.length === 0, size: docs.length };
}

export const fs = {
  doc: (_db, ...p) => docRef(p.join('/')),
  collection: (_db, ...p) => colRef(p.join('/')),
  query: (col, ...cons) => ({ ...col, cons }),
  where: (f, _op, v) => ({ t: 'where', f, v }),
  orderBy: (_f, dir = 'asc') => ({ t: 'order', dir }),
  limit: n => ({ t: 'limit', n }),
  documentId: () => '__id__',
  increment: n => ({ __op: 'inc', n }),
  arrayUnion: (...vals) => ({ __op: 'union', vals }),
  async getDoc(ref) { return snapDoc(load(), ref.path); },
  async getDocs(q) { return runQuery(load(), q); },
  async setDoc(ref, data, opts) {
    const d = load();
    d[ref.path] = opts?.merge && d[ref.path] ? deepMerge(d[ref.path], data) : deepMerge({}, data);
    save(d);
  },
  async updateDoc(ref, upd) {
    const d = load();
    if (!d[ref.path]) throw new Error('not found ' + ref.path);
    for (const [k, v] of Object.entries(upd)) apply(d[ref.path], k, v);
    save(d);
  },
  async deleteDoc(ref) { const d = load(); delete d[ref.path]; save(d); },
  writeBatch() {
    const ops = [];
    return {
      set: (r, data, o) => ops.push(() => fs.setDoc(r, data, o)),
      update: (r, u) => ops.push(() => fs.updateDoc(r, u)),
      delete: r => ops.push(() => fs.deleteDoc(r)),
      commit: async () => { for (const op of ops) await op(); },
    };
  },
  onSnapshot(ref, cb) {
    let last = null;
    const tick = () => {
      const d = load();
      const s = ref.kind === 'doc' ? snapDoc(d, ref.path) : runQuery(d, ref);
      const key = JSON.stringify(ref.kind === 'doc' ? s.data() : s.docs.map(x => [x.id, x.data()]));
      if (key !== last) { last = key; cb(s); }
    };
    tick();
    const t = setInterval(tick, 150);
    return () => clearInterval(t);
  },
};

export const gameRef = code => fs.doc(db, 'games', code);
export const sub = (code, ...path) => fs.doc(db, 'games', code, ...path);
export const subCol = (code, name) => fs.collection(db, 'games', code, name);
