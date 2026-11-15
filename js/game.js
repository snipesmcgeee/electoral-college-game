// Derived view of a game record, shared by the board, host and phones.
import * as E from './engine.js';

let STATES = null;
export async function loadStates(base = '..') {
  if (!STATES) STATES = await (await fetch(`${base}/data/states.json`)).json();
  return STATES;
}

export function teamIds(game) { return game.settings.teams.map(t => t.id); }
export function teamName(game, id) { return game.settings.teams.find(t => t.id === id)?.name || id; }

export function view(game, allStates) {
  const teams = teamIds(game);
  const year = game.settings.mapYear || 2024;
  const states = allStates.map(s => ({ code: s.code, ev: s[`ev${year}`], name: s.name, fips: s.fips }));
  const spend = game.spend || {}, closed = game.closed || {};
  const earned = E.earnedTotals(game.scored, teams);
  const spent = E.spentTotals(spend, teams);
  const balance = Object.fromEntries(teams.map(t => [t, earned[t] - spent[t]]));
  const ec = E.electoralTotals({ states, spend, closed, teams });
  const p = E.progress(game.qIndex || 0, game.total || 1);
  return {
    teams, states, spend, closed, earned, spent, balance, ec, p,
    closedCount: Object.keys(closed).length,
    target: E.closeTarget(p),
    nextCheckpoint: (game.checkpoints || []).find(c => c > (game.qIndex || 0)) ?? game.total,
  };
}

export const STATUS_TEXT = {
  lobby: 'Waiting to start',
  question: 'Question',
  scoring: 'Scoring',
  spending: 'Spending round',
  over: 'Final results',
};
