// Question format helpers, shared by the browser and the repo-conversion script.
//
// Number questions (one type, two scoring modes):
//   { type: 'number', numberMode: 'range' | 'closer', answerLo, answerHi, value,
//     scale: [{ points: 10, below: 20, above: 20 }, { points: 8, below: 40, above: 40 }, ...] }
//   An answer inside answerLo..answerHi earns the full value. Otherwise the first row (highest
//   points first) whose reach covers the miss earns its points: `below` is how far under the answer
//   still counts, `above` how far over. A blank reach (null) means that row doesn't apply on that side.
//   Rows can step unevenly and reach differently above and below.
//
// Older questions ('range' with bands or a step width, 'closer') are converted on load, so edits
// saved before this format keep working.

export const CATEGORIES = ['Sports', 'History', 'Geography', 'Science', 'Animals', 'TV & Movies', 'Music',
  'Literature & Art', 'Food & Drink', 'Politics', 'Business & Tech', 'Pop Culture'];

export const TYPES = { qa: 'Question & answer', number: 'Number', list: 'List', tf: 'True / false' };

const BIG = 1e12; // "no limit" for an open-ended old band

// Strip trailing periods/colons/spaces and end with exactly one question mark.
export function withQuestionMark(text) {
  const t = String(text ?? '').trim();
  if (!t) return t;
  if (/[?]\s*$/.test(t)) return t;
  return t.replace(/[\s.:;,!]+$/, '') + '?';
}

function oldRangeToScale(q) {
  const lo = Number(q.answerLo), hi = Number(q.answerHi ?? q.answerLo);
  const rows = [];
  if (q.bands && q.bands.length) {
    for (const b of q.bands) {
      if (b.points >= q.value) continue;
      let below = null, above = null;
      for (const [a, z0] of b.ranges) {
        const z = z0 === null ? BIG : z0;
        if (z < lo) below = Math.max(below ?? 0, lo - a);
        else if (a > hi) above = Math.max(above ?? 0, z - hi);
      }
      rows.push({ points: b.points, below, above });
    }
  } else if (q.step) {
    const sp = q.stepPoints || 2;
    for (let k = 1; q.value - sp * k > 0; k++) rows.push({ points: q.value - sp * k, below: q.step * k, above: q.step * k });
  }
  return rows.sort((a, b) => b.points - a.points);
}

// Bring any question to the current format (returns a new object; the input is not changed).
export function normalizeQuestion(q0) {
  const q = { ...q0 };
  if (q.type === 'range' || q.type === 'closer') {
    q.numberMode = q.type === 'closer' ? 'closer' : 'range';
    q.scale = q.type === 'range' ? oldRangeToScale(q0) : (q.scale || []);
    q.type = 'number';
    delete q.bands; delete q.step; delete q.stepPoints;
  }
  if (q.type === 'number') {
    q.numberMode ||= 'range';
    q.scale ||= [];
    if (q.answerHi === undefined || q.answerHi === null) q.answerHi = q.answerLo;
  }
  if (!q.categories) q.categories = q.category && CATEGORIES.includes(q.category) ? [q.category] : [];
  if (!q.tags) q.tags = [];
  if (q.general === undefined) q.general = true;
  q.category = q.categories[0] || q.category || '';
  return q;
}

// Points for one guess on a range-mode number question.
export function numberPoints(q, guessNum) {
  if (guessNum === null || guessNum === undefined || Number.isNaN(guessNum)) return 0;
  const lo = Number(q.answerLo), hi = Number(q.answerHi ?? q.answerLo);
  const scale = q.scale || [];
  const whole = [lo, hi, ...scale.flatMap(r => [r.below, r.above]).filter(x => x !== null && x !== undefined)].every(Number.isInteger);
  const g = whole ? Math.round(guessNum) : guessNum;
  if (g >= lo && g <= hi) return q.value;
  const under = g < lo, miss = under ? lo - g : g - hi;
  for (const r of [...scale].sort((a, b) => b.points - a.points)) {
    const reach = under ? r.below : r.above;
    if (reach !== null && reach !== undefined && reach !== '' && miss <= Number(reach) + 1e-9) return r.points;
  }
  return 0;
}

// Re-check dates: 'due' when the date has passed (or is today), else null.
export function recheckDue(q, today = new Date().toISOString().slice(0, 10)) {
  return q.recheckBy && q.recheckBy <= today ? 'due' : null;
}
