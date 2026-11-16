// The question bank: data/questions.json in the repo, plus edits saved in Firestore (questionEdits/{id}).
//   edit doc = full question  → replaces the repo version (or adds a new question, custom: true)
//   { hidden: true }          → kept, but not offered to hosts (restorable)
//   { deleted: true }         → gone everywhere (repo questions); added questions are erased outright
// Usage ("which games has this question been played in") lives in usage/{questionId}.
import { db, fs } from './firebase.js';
import { normalizeQuestion, withQuestionMark } from './qformat.js';

let REPO = null;
export async function loadRepo(base = '..') {
  if (!REPO) REPO = Object.fromEntries((await (await fetch(`${base}/data/questions.json`)).json()).map(q => [q.id, q]));
  return REPO;
}

// { id: question } with edits applied; deleted ones removed. Hidden ones keep hidden: true.
export async function loadQuestions(base = '..') {
  const repo = await loadRepo(base);
  const out = Object.fromEntries(Object.entries(repo).map(([id, q]) => [id, { ...q }]));
  try {
    const snap = await fs.getDocs(fs.collection(db, 'questionEdits'));
    for (const d of snap.docs) {
      const e = d.data();
      if (e.deleted) { delete out[d.id]; continue; }
      out[d.id] = { ...(out[d.id] || {}), ...e, id: d.id };
    }
  } catch (e) { console.warn('question edits not loaded', e); }
  for (const id of Object.keys(out)) out[id] = normalizeQuestion(out[id]); // older edits → current format
  return out;
}

export const isCustom = id => !(REPO && REPO[id]);

export function saveQuestion(q) {
  const clean = JSON.parse(JSON.stringify(normalizeQuestion({ ...q, text: withQuestionMark(q.text) })));
  if (!clean.needsReview) delete clean.reviewNotes;
  return fs.setDoc(fs.doc(db, 'questionEdits', q.id), clean);
}
export function setHidden(id, hidden) {
  return fs.setDoc(fs.doc(db, 'questionEdits', id), { hidden }, { merge: true });
}
export function deleteForever(id) {
  return isCustom(id) ? fs.deleteDoc(fs.doc(db, 'questionEdits', id)) : fs.setDoc(fs.doc(db, 'questionEdits', id), { deleted: true });
}

// { questionId: [{ game, code, date }] } — Excel games come from each question's `games` field.
export async function loadUsage(Q) {
  const out = {};
  for (const q of Object.values(Q)) out[q.id] = (q.games || []).map(g => ({ game: g, code: null, date: null, source: 'excel' }));
  const snap = await fs.getDocs(fs.collection(db, 'usage'));
  for (const d of snap.docs) (out[d.id] ||= []).push(...(d.data().plays || []));
  return out;
}

export function recordUse(qid, game) {
  return fs.setDoc(fs.doc(db, 'usage', qid),
    { plays: fs.arrayUnion({ game: game.name, code: game.code, date: new Date().toISOString().slice(0, 10) }) }, { merge: true });
}

export function usageLabel(uses) {
  return (uses || []).map(u => u.date ? `${u.game} (${u.date})` : u.game).join(', ');
}
