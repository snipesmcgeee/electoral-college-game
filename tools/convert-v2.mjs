// One-time conversion of data/questions.json to the tagged / number-type format.
//   node tools/convert-v2.mjs            → rewrites data/questions.json, prints a report
// Checks every converted range question scores the same as before on a grid of guesses.
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeQuestion, numberPoints, withQuestionMark, CATEGORIES } from '../js/qformat.js';
import { rangePoints } from '../js/scoring.js';

const path = new URL('../data/questions.json', import.meta.url);
const qs = JSON.parse(readFileSync(path, 'utf8'));

// ---- categories (1–2 main) by question; old category kept as a sub-tag ----
const C = {};
const set = (ids, cats) => ids.forEach(id => { C[id] = cats; });
const r = (prefix, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${prefix}-${String(a + i).padStart(3, '0')}`);
set(r('kansas', 2, 9), ['Geography']);
set(r('kansas', 10, 17), ['Sports']);
set(['kansas-018', 'kansas-023'], ['TV & Movies']);
set(['kansas-019'], ['Literature & Art']);
set(['kansas-020'], ['Music', 'TV & Movies']);
set(['kansas-021', 'kansas-022', 'kansas-029'], ['Music']);
set(['kansas-024'], ['Politics', 'Business & Tech']);
set(['kansas-025'], ['Food & Drink', 'Business & Tech']);
set(['kansas-026', 'kansas-028', 'kansas-030'], ['History']);
set(['kansas-027', 'kansas-031'], ['Politics', 'History']);
set(['kansas-032'], ['Food & Drink', 'History']);
set(['kansas-033'], ['Geography', 'History']);
set(r('deca', 16, 18), ['Pop Culture']);
set(r('deca', 19, 21), ['Science']);
set([...r('deca', 22, 24), ...r('deca', 88, 90), ...r('deca', 97, 99)], ['Animals']);
set(r('deca', 25, 27), ['TV & Movies']);
set(r('deca', 28, 30), ['Food & Drink']);
set([...r('deca', 31, 33), ...r('deca', 70, 72)], ['Literature & Art', 'TV & Movies']);
set(['deca-034', 'deca-035'], ['TV & Movies', 'Music']);
set(['deca-036'], ['TV & Movies']);
set(r('deca', 37, 39), ['Politics', 'History']);
set([...r('deca', 40, 42), ...r('deca', 52, 54), 'deca-079', 'deca-080'], ['Sports']);
set(['deca-081'], ['Sports', 'History']);
set(['deca-043', 'deca-044', ...r('deca', 61, 63), ...r('deca', 85, 87), 'deca-101', 'deca-102'], ['Geography']);
set(['deca-045'], ['Geography', 'Science']);
set([...r('deca', 46, 48), 'deca-112', 'deca-114'], ['Science']);
set(['deca-049'], ['Food & Drink', 'Music']);
set(['deca-050', 'deca-055', ...r('deca', 92, 93), ...r('deca', 109, 111)], ['Food & Drink']);
set(['deca-051', 'deca-091'], ['Food & Drink', 'Science']);
set(['deca-056', 'deca-057', 'deca-106'], ['Food & Drink', 'History']);
set(['deca-107'], ['Food & Drink', 'Sports']);
set(['deca-108'], ['Food & Drink', 'Pop Culture']);
set([...r('deca', 58, 60), ...r('deca', 65, 69), 'deca-078', 'deca-082', 'deca-084'], ['Business & Tech']);
set(['deca-064'], ['Business & Tech', 'History']);
set(['deca-076'], ['Business & Tech', 'Pop Culture']);
set(['deca-077'], ['Science', 'Business & Tech']);
set(['deca-083'], ['Business & Tech', 'TV & Movies']);
set([...r('deca', 73, 75), 'deca-095', ...r('deca', 103, 105)], ['TV & Movies']);
set(['deca-094', 'deca-113'], ['History']);
set(['deca-096'], ['TV & Movies', 'History']);
set(['deca-100'], ['Geography', 'History']);
set(r('deca', 115, 117), ['History', 'Politics']);
for (let i = 2; i <= 84; i++) C[`trump-${String(i).padStart(3, '0')}`] = ['Politics'];
set(['trump-033'], ['Politics', 'History']);
set(['trump-064'], ['Politics', 'Pop Culture']);
set(['trump-081'], ['Politics', 'TV & Movies']);
for (const q of qs) if (q.id.startsWith('music-')) C[q.id] = ['Music'];

// ---- sub-tags ----
const extraTags = q => {
  const t = [];
  if (q.id.startsWith('kansas-')) t.push('kansas');
  if (q.id.startsWith('trump-')) t.push('trump');
  if (q.category === 'Nicknames') t.push('nicknames');
  if (q.id.startsWith('music-first')) t.push('first word');
  if (q.id.startsWith('music-count')) t.push('word count');
  if (['deca-016', 'deca-017', 'deca-018'].includes(q.id)) t.push('group');
  return t;
};
const skipOld = new Set(['Politics', 'Geography', 'Sports', 'Science', 'Music', 'True/False', 'Trump', 'Nicknames', 'Kansas', 'Song Lyrics', 'Jobs', 'Pets', 'City', 'Food', 'Entertainment']);
const tagsFor = q => {
  const t = extraTags(q);
  if (!skipOld.has(q.category)) t.push(q.category.toLowerCase().replace(/^hp$/, 'harry potter'));
  if (q.category === 'Song Lyrics') t.push('song lyrics');
  return [...new Set(t)];
};

// ---- general (works for any crowd) — unchecked = too specific for a general game ----
const NICHE = new Set([
  ...['003', '004', '006', '007', '008', '009', '011', '013', '015', '017', '020', '021', '022', '024', '025', '029', '030', '031', '033'].map(n => `kansas-${n}`),
  ...['016', '017', '018', '028', '029', '030', '035', '040', '042', '052', '054', '067', '087', '096', '097', '098', '099', '107', '114'].map(n => `deca-${n}`),
]);
const TRUMP_GENERAL = new Set(['007', '016', '018', '026', '036', '044', '050', '051', '055', '057', '061', '069', '072', '073', '075', '078', '081'].map(n => `trump-${n}`));
const isGeneral = q => q.id.startsWith('trump-') ? TRUMP_GENERAL.has(q.id) : !NICHE.has(q.id);

// ---- re-check dates for answers that change over time ----
const RECHECK = {
  'deca-067': 'Bitcoin price moves daily', 'deca-066': 'Tesla lineup changes', 'deca-040': 'MLB salaries change every season',
  'deca-030': "Leinenkugel's lineup changes", 'deca-043': 'Population changes', 'deca-076': 'Console sales change',
  'deca-090': 'Breed rankings change yearly', 'deca-052': 'Packers starters change', 'kansas-015': 'World Series appearances',
  'kansas-017': 'Final Four count', 'deca-079': 'Super Bowl counts', 'deca-036': 'Official princess list',
};

// ---- question marks ----
const TEXT_FIX = { 'kansas-028': t => t.replace(/first woman to:?\s*$/, 'first woman to do what?') };

const report = { converted: 0, mismatched: [], untagged: [] };
const out = qs.map(q0 => {
  let q = normalizeQuestion(q0);
  q.text = withQuestionMark(TEXT_FIX[q0.id] ? TEXT_FIX[q0.id](q0.text) : q0.text);
  q.categories = C[q.id] || [];
  if (!q.categories.length || !q.categories.every(c => CATEGORIES.includes(c))) report.untagged.push(q.id);
  q.category = q.categories[0] || '';
  q.tags = tagsFor(q0);
  q.general = isGeneral(q0);
  if (RECHECK[q.id]) { q.recheckBy = '2027-01-01'; q.recheckNote = RECHECK[q.id]; }
  if (q0.type === 'range') report.converted++;
  if (q0.type === 'range' && q.scale.length) {
    // equivalence: whole-number guesses across the scored window
    const lo = q0.answerLo, hi = q0.answerHi ?? lo;
    const reach = Math.max(1, ...q.scale.flatMap(s => [s.below || 0, s.above || 0]).filter(x => x < 1e11));
    const stepSize = Math.max(1, Math.round(reach / 400));
    const bad = [];
    for (let g = Math.floor(lo - reach * 1.2) - 2; g <= Math.ceil(hi + reach * 1.2) + 2; g += stepSize) {
      const a = rangePoints(q0, g), b = numberPoints(q, g);
      if (a !== b) { bad.push(`${g}: was ${a}, now ${b}`); if (bad.length > 3) break; }
    }
    if (bad.length) {
      report.mismatched.push(`${q.id} (${bad.join('; ')})`);
      q.needsReview = true;
      q.reviewNotes = [...(q.reviewNotes || []), 'Excel steps only listed exact values; the table now gives points in between — check the rows'];
    }
  }
  return q;
});
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ total: out.length, rangeConverted: report.converted, mismatched: report.mismatched, untagged: report.untagged,
  general: out.filter(q => q.general).length, notGeneral: out.filter(q => !q.general).length,
  recheck: out.filter(q => q.recheckBy).length }, null, 1));
