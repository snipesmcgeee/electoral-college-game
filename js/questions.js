// The question bank lives in the repo (data/questions.json).
// Usage ("which games has this question been played in") lives in Firestore: usage/{questionId}.
import { db, fs } from './firebase.js';

let BANK = null;
export async function loadQuestions(base = '..') {
  if (!BANK) BANK = Object.fromEntries((await (await fetch(`${base}/data/questions.json`)).json()).map(q => [q.id, q]));
  return BANK;
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
