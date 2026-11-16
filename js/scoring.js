// Auto-checking typed answers. Every result is a suggestion: the host can override any score.
import { normalizeQuestion, numberPoints } from './qformat.js';

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Levenshtein distance, for forgiving small typos ("Topkea").
function dist(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// 'exact' | 'close' (typo-level) | null
export function textMatch(guess, target) {
  const g = normalize(guess), t = normalize(target);
  if (!g || !t) return null;
  if (g === t) return 'exact';
  const allowed = t.length >= 10 ? 2 : t.length >= 5 ? 1 : 0;
  if (allowed && dist(g, t) <= allowed) return 'close';
  return null;
}

export function parseNumber(s) {
  if (typeof s === 'number') return s;
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Old range format (bands or a step width). Kept so the conversion to scoring tables can be checked.
export function rangePoints(q, guess) {
  const g = parseNumber(guess);
  if (g === null) return 0;
  const lo = q.answerLo, hi = q.answerHi ?? q.answerLo;
  if (q.bands && q.bands.length) {
    const intBands = q.bands.every(b => b.ranges.every(([a, z]) => Number.isInteger(a) && (z === null || Number.isInteger(z))));
    const x = intBands ? Math.round(g) : g;
    for (const b of q.bands) {
      for (const [a, z] of b.ranges) if (x >= a && x <= (z === null ? Infinity : z)) return b.points;
    }
    return 0;
  }
  if (lo === undefined || lo === null || !q.step) return 0;
  const d = g >= lo && g <= hi ? 0 : Math.min(Math.abs(g - lo), Math.abs(g - hi));
  if (d === 0) return q.value;
  return Math.max(0, q.value - (q.stepPoints || 2) * Math.ceil(d / q.step - 1e-9));
}

// List: points per matched item (no penalty for wrong ones), capped at the question's value.
export function listMatches(q, guess) {
  const parts = String(guess ?? '').split(/,|\n|;|\band\b/i).map(s => s.trim()).filter(Boolean);
  const hit = new Set();
  for (const p of parts) {
    q.items.forEach((item, i) => {
      if (hit.has(i)) return;
      const alts = String(item).split('/');
      if (alts.some(a => textMatch(p, a))) hit.add(i);
    });
  }
  return [...hit];
}

// Returns { points, confidence: 'auto'|'check'|'host', note }
export function autoScore(q0, guess) {
  const q = normalizeQuestion(q0);
  if (guess === undefined || guess === null || String(guess).trim() === '') return { points: 0, confidence: 'auto', note: 'no answer' };
  if (q.judge === 'host') return { points: 0, confidence: 'host', note: 'host judges' };
  switch (q.type) {
    case 'number': {
      if (q.numberMode === 'closer') return { points: 0, confidence: 'host', note: 'closest takes all — decided across teams' };
      const pts = numberPoints(q, parseNumber(guess));
      return { points: pts, confidence: 'auto', note: `guess ${parseNumber(guess)}` };
    }
    case 'tf': {
      const g = normalize(guess)[0], t = normalize(q.accepted?.[0] ?? q.answer)[0];
      return { points: g && g === t ? q.value : 0, confidence: 'auto' };
    }
    case 'list': {
      const hits = listMatches(q, guess);
      const pts = Math.min(q.value, hits.length * (q.perItem || 0));
      return { points: pts, confidence: 'check', note: `${hits.length} of ${q.items.length} matched` };
    }
    default: {
      const targets = q.accepted?.length ? q.accepted : [q.answer];
      let best = null;
      for (const t of targets) { const m = textMatch(guess, t); if (m === 'exact') { best = 'exact'; break; } if (m) best = 'close'; }
      if (best === 'exact') return { points: q.value, confidence: 'auto' };
      if (best === 'close') return { points: q.value, confidence: 'check', note: 'close spelling' };
      return { points: 0, confidence: 'check', note: 'no match' };
    }
  }
}

// Closer: closest guess takes all; ties share. guesses = { blue: '123', red: '140' }
export function closerPoints(q, guesses) {
  const target = q.answerLo;
  const d = {};
  for (const [team, g] of Object.entries(guesses)) {
    const n = parseNumber(g);
    if (n !== null) d[team] = Math.abs(n - target);
  }
  const best = Math.min(...Object.values(d));
  return Object.fromEntries(Object.keys(guesses).map(t => [t, d[t] === best ? q.value : 0]));
}

// What players/board may see (no answer fields).
export function publicQuestion(q) {
  return { id: q.id, text: q.text, type: q.type, numberMode: q.numberMode || null, value: q.value, category: q.category || '', timer: q.timer || null,
    items: q.type === 'list' ? q.items?.length ?? null : null };
}
