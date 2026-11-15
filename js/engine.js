// Electoral College Game — rules engine.
// Pure functions only (no Firebase, no DOM) so the same code runs in the browser and in tests.
// Every rule mirrors Jack's "COPY ONLY 2024" Excel tab; cell references are noted beside each one.

export const SEED = 1; // Blue/Red start at 1 in every state (D2:E27); the sheet subtracts 51 from spend totals.

// ---- per-state math ------------------------------------------------------

// Spend in one state including the seed, for each team.  spend = { blue: 5, red: 2 } (seed NOT included)
export function withSeed(spend = {}, teams) {
  const out = {};
  for (const t of teams) out[t] = (spend[t] || 0) + SEED;
  return out;
}

// F2 = MAX(D2,E2)/C2  — the leading team's share of everything spent there (seed included).
export function margin(spend, teams) {
  const s = withSeed(spend, teams);
  const vals = teams.map(t => s[t]);
  const total = vals.reduce((a, b) => a + b, 0);
  return Math.max(...vals) / total;
}

// Team with the most spend (seed included), or null if tied at the top.
export function leader(spend, teams) {
  const s = withSeed(spend, teams);
  let best = null, bestVal = -1, tied = false;
  for (const t of teams) {
    if (s[t] > bestVal) { best = t; bestVal = s[t]; tied = false; }
    else if (s[t] === bestVal) tied = true;
  }
  return tied ? null : best;
}

// ---- closing schedule -----------------------------------------------------

// G15 / G17: the sheet counts the NEXT question (questions scored + 1) over the game length.
// Capped at 100% — uncapped, the sheet's target hits 52 at game end and G21 returns #NUM!.
export function progress(questionsScored, totalQuestions) {
  if (!totalQuestions) return 0;
  return Math.min(1, (questionsScored + 1) / totalQuestions);
}

// G19 = ROUNDDOWN(0.0051*((G18*100)^2), 0) — how many states should be closed at this progress.
export function closeTarget(p) {
  const x = 0.0051 * Math.pow(Math.min(1, Math.max(0, p)) * 100, 2);
  return Math.min(51, Math.floor(x + 1e-9)); // tiny epsilon guards float error on exact integers
}

// Runs at a spending checkpoint, after spends are revealed.
//   states:  [{code, ev}]           spend: { CA: {blue, red}, ... } (seed not included)
//   closed:  { CA: 'blue', ... }    already-closed states (permanent, like Jack's blackouts)
//   p:       progress (0..1)        tieWinner: team that wins tied states at the final close
// Returns [{code, team, margin, reason}] for states that close now.
//
// G21 = LARGE(margins, target+1); a state closes only if its margin is STRICTLY above that line,
// so a state sitting exactly on the line stays open ("DOES NOT LOCK").
// Closed states are permanent. To close exactly the curve's count, the line is drawn over the
// still-open states only: need = target − already closed; line = (need+1)th largest open margin.
// With nothing closed yet this is identical to the sheet.
export function runClosing({ states, spend, closed, p, teams, tieWinner = null }) {
  const target = closeTarget(p);
  const open = states.filter(s => !closed[s.code]);
  const already = states.length - open.length;
  const need = target - already;
  if (need <= 0 || open.length === 0) return [];

  const scored = open.map(s => ({ code: s.code, m: margin(spend[s.code], teams) }));

  // Final close (100%): every remaining state closes; ties go to tieWinner (popular vote leader).
  if (target >= states.length || need >= open.length) {
    return scored.map(s => {
      const lead = leader(spend[s.code], teams);
      return { code: s.code, team: lead ?? tieWinner, margin: s.m, reason: lead ? 'final' : 'tie' };
    });
  }

  const sorted = scored.map(s => s.m).sort((a, b) => b - a);
  const line = sorted[need]; // (need+1)th largest
  return scored
    .filter(s => s.m > line + 1e-12)
    .map(s => ({ code: s.code, team: leader(spend[s.code], teams), margin: s.m, reason: 'margin' }));
}

// The line the board can display (G21), over open states.
export function closingLine({ states, spend, closed, p, teams }) {
  const target = closeTarget(p);
  const open = states.filter(s => !closed[s.code]);
  const need = target - (states.length - open.length);
  if (need <= 0) return null;
  const sorted = open.map(s => margin(spend[s.code], teams)).sort((a, b) => b - a);
  return need < sorted.length ? sorted[need] : 0;
}

// ---- money ----------------------------------------------------------------

// G25/G26: points earned = popular vote.
export function earnedTotals(scored, teams) {
  const out = Object.fromEntries(teams.map(t => [t, 0]));
  for (const q of Object.values(scored || {})) for (const t of teams) out[t] += Number(q[t] || 0);
  return out;
}

// G6/G7: spend totals (seed excluded).
export function spentTotals(spend, teams) {
  const out = Object.fromEntries(teams.map(t => [t, 0]));
  for (const s of Object.values(spend || {})) for (const t of teams) out[t] += Number(s[t] || 0);
  return out;
}

// A27/F27: unspent balance.
export function balances(scored, spend, teams) {
  const e = earnedTotals(scored, teams), s = spentTotals(spend, teams);
  return Object.fromEntries(teams.map(t => [t, e[t] - s[t]]));
}

// Check one team's draft for this round. alloc = { CA: 5, TX: 3 }
export function validateDraft(alloc, balance, closed) {
  const errors = [];
  let total = 0;
  for (const [code, n] of Object.entries(alloc || {})) {
    const v = Number(n);
    if (!Number.isInteger(v) || v < 0) errors.push(`${code}: must be a whole number ≥ 0`);
    if (v > 0 && closed[code]) errors.push(`${code} is closed`);
    total += v > 0 ? v : 0;
  }
  if (total > balance) errors.push(`Spending ${total} but only ${balance} available`);
  return { ok: errors.length === 0, total, errors };
}

// Add revealed drafts to cumulative spend. drafts = { blue: {CA: 5}, red: {...} }
export function applyDrafts(spend, drafts, closed) {
  const next = JSON.parse(JSON.stringify(spend || {}));
  for (const [team, alloc] of Object.entries(drafts || {})) {
    for (const [code, n] of Object.entries(alloc || {})) {
      const v = Number(n) || 0;
      if (v <= 0 || closed[code]) continue;
      next[code] = next[code] || {};
      next[code][team] = (next[code][team] || 0) + v;
    }
  }
  return next;
}

// ---- results --------------------------------------------------------------

// EV per team: closed states are final; open states count as "lean" for the current leader.
export function electoralTotals({ states, spend, closed, teams }) {
  const final = Object.fromEntries(teams.map(t => [t, 0]));
  const lean = Object.fromEntries(teams.map(t => [t, 0]));
  let tossup = 0;
  for (const s of states) {
    if (closed[s.code]) { final[closed[s.code]] += s.ev; continue; }
    const l = leader(spend[s.code], teams);
    if (l) lean[l] += s.ev; else tossup += s.ev;
  }
  return { final, lean, tossup };
}

// Team with the most of a value, or null on a tie.
export function topTeam(values, teams) {
  let best = null, v = -Infinity, tied = false;
  for (const t of teams) {
    if (values[t] > v) { best = t; v = values[t]; tied = false; } else if (values[t] === v) tied = true;
  }
  return tied ? null : best;
}

// Final result. Ties: popular vote leader, then a bonus question (returns needsBonus).
export function finalResult({ states, closed, scored, teams }) {
  const ec = Object.fromEntries(teams.map(t => [t, 0]));
  for (const s of states) if (closed[s.code]) ec[closed[s.code]] += s.ev;
  const popular = earnedTotals(scored, teams);
  const popWinner = topTeam(popular, teams);
  let ecWinner = topTeam(ec, teams), how = 'electoral';
  if (!ecWinner) { ecWinner = popWinner; how = popWinner ? 'popular-tiebreak' : 'bonus'; }
  return { ec, popular, ecWinner, popWinner, how, needsBonus: !ecWinner };
}

export function isCheckpoint(qIndex, checkpoints, total) {
  // qIndex = number of questions scored so far (1-based count). The last question is always a checkpoint.
  return qIndex === total || (checkpoints || []).includes(qIndex);
}

export function checkpointsEvery(n, total) {
  const out = [];
  for (let i = n; i < total; i += n) out.push(i);
  out.push(total);
  return out;
}
