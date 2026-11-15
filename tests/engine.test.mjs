// Run with:  node tests/engine.test.mjs
// Replays Jack's played Excel games through the engine and checks the closings match the sheet.
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';

const games = JSON.parse(readFileSync(new URL('./fixtures/excel-games.json', import.meta.url)));
const statesJson = JSON.parse(readFileSync(new URL('../data/states.json', import.meta.url)));
const states = statesJson.map(s => ({ code: s.code, ev: s.ev2024 }));
const teams = ['blue', 'red'];
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; if (!ok) console.log('FAIL', name, detail); };

for (const [tab, g] of Object.entries(games)) {
  // Excel cells include the 1–1 seed; the engine stores spend without it.
  const spend = {};
  for (const [code, v] of Object.entries(g.raw)) spend[code] = { blue: v.blue - 1, red: v.red - 1 };

  for (const c of g.cases) {
    const got = E.runClosing({ states, spend, closed: {}, p: c.p, teams }).map(x => x.code).sort();
    const want = c.line === null ? states.map(s => s.code).sort() : c.closed;
    check(`${tab} p=${c.p} target`, E.closeTarget(c.p) === c.target);
    check(`${tab} p=${c.p} closed set`, JSON.stringify(got) === JSON.stringify(want),
      `got ${got.length} want ${want.length}`);
  }
  // Spend totals match G6/G7
  const sp = E.spentTotals(spend, teams);
  check(`${tab} spent blue = G6`, sp.blue === g.cached.G6, `${sp.blue} vs ${g.cached.G6}`);
  check(`${tab} spent red = G7`, sp.red === g.cached.G7, `${sp.red} vs ${g.cached.G7}`);
  // Where the sheet had a numeric line cached, match it
  if (typeof g.cached.G21 === 'number') {
    const line = E.closingLine({ states, spend, closed: {}, p: g.cached.G18, teams });
    check(`${tab} line = G21`, Math.abs(line - g.cached.G21) < 1e-9, `${line} vs ${g.cached.G21}`);
    check(`${tab} target = G19`, E.closeTarget(g.cached.G18) === g.cached.G19);
  }
}

// Curve spot checks (floor(51·p²))
check('curve 25%', E.closeTarget(0.25) === 3);
check('curve 50%', E.closeTarget(0.5) === 12);
check('curve 75%', E.closeTarget(0.75) === 28);
check('curve 100%', E.closeTarget(1) === 51);
check('curve over 100% capped', E.closeTarget(1.0125) === 51);
check('progress = (scored+1)/total', E.progress(8, 32) === 9 / 32);
check('progress capped', E.progress(32, 32) === 1);

// Seed: one point in an empty state (2–1, 67%) outranks 10–5 (11–6, 65%)
check('seed quirk', E.margin({ blue: 1 }, teams) > E.margin({ blue: 10, red: 5 }, teams));

// Ties on the line stay open
{
  const sp = { CA: { blue: 9 }, TX: { blue: 9 }, NY: { red: 9 } }; // all 10–1
  const r = E.runClosing({ states, spend: sp, closed: {}, p: Math.sqrt(2 / 51) + 1e-6, teams }); // target 2
  check('tie on line: nothing closes', r.length === 0, JSON.stringify(r));
}

// Closed is permanent and the count follows the curve
{
  const sp = { CA: { blue: 20 }, TX: { red: 20 }, FL: { blue: 5 } };
  const closed = {};
  const p1 = Math.sqrt(1 / 51) + 1e-6; // target 1
  const r1 = E.runClosing({ states, spend: sp, closed, p: p1, teams });
  check('first closing picks a top blowout', r1.length === 0 || r1.every(x => ['CA', 'TX'].includes(x.code)), JSON.stringify(r1));
  // CA and TX tie at 21–1 → both on the line? target 1: line = 2nd largest = CA/TX margin → neither closes
  check('tied top two with target 1 stay open', r1.length === 0);
  closed.CA = 'blue';
  const r2 = E.runClosing({ states, spend: sp, closed, p: p1, teams });
  check('no extra closing when target already met', r2.length === 0);
}

// Overspend and closed-state checks
check('overspend blocked', !E.validateDraft({ CA: 5 }, 4, {}).ok);
check('closed state blocked', !E.validateDraft({ CA: 1 }, 4, { CA: 'red' }).ok);
check('valid draft', E.validateDraft({ CA: 2, TX: 2 }, 4, {}).ok);

// Final close: ties go to the popular vote leader; EC tie → popular; both tied → bonus
{
  const r = E.runClosing({ states, spend: {}, closed: {}, p: 1, teams, tieWinner: 'red' });
  check('final close closes all 51', r.length === 51 && r.every(x => x.team === 'red'));
  const res = E.finalResult({ states: [{ code: 'A', ev: 3 }, { code: 'B', ev: 3 }], closed: { A: 'blue', B: 'red' }, scored: { q1: { blue: 5, red: 5 } }, teams });
  check('EC tie + popular tie → bonus', res.needsBonus && res.how === 'bonus');
  const res2 = E.finalResult({ states: [{ code: 'A', ev: 3 }, { code: 'B', ev: 3 }], closed: { A: 'blue', B: 'red' }, scored: { q1: { blue: 6, red: 5 } }, teams });
  check('EC tie → popular vote leader', res2.ecWinner === 'blue' && res2.how === 'popular-tiebreak');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
