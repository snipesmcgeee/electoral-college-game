// US map drawn with D3 from the us-atlas state shapes (already projected to a 975×610 canvas).
// Needs vendor/d3.min.js and vendor/topojson-client.min.js loaded on the page first.
import { leader, margin } from './engine.js';

export const PALETTE = {
  blue: { solid: '#1f5fd1', lean: '#9fbdf0', label: 'Blue' },
  red: { solid: '#cf3a32', lean: '#f2aaa5', label: 'Red' },
  green: { solid: '#2f9e57', lean: '#a9dcb9', label: 'Green' },
  purple: { solid: '#7b3fc4', lean: '#c9b1ea', label: 'Purple' },
  orange: { solid: '#e07a1f', lean: '#f5c79c', label: 'Orange' },
  gold: { solid: '#c98a12', lean: '#ecd29a', label: 'Gold' },
  teal: { solid: '#128c8c', lean: '#9fd6d6', label: 'Teal' },
  pink: { solid: '#d1407f', lean: '#f2b0cd', label: 'Pink' },
  black: { solid: '#2b2b2b', lean: '#a8a8a8', label: 'Black' },
};
export const TOSSUP = '#d3d3d6';

// { blue: {solid, lean}, red: {...} } for this game's chosen colors (team ids stay 'blue'/'red' as slots).
export function teamColors(game) {
  const out = {};
  for (const t of game?.settings?.teams || [{ id: 'blue' }, { id: 'red' }]) out[t.id] = PALETTE[t.color || t.id] || PALETTE.blue;
  return out;
}
// Also recolor pills/buttons (CSS uses --blue / --red for the two party slots).
export function applyTeamColors(game) {
  const c = teamColors(game);
  for (const [id, v] of Object.entries(c)) document.documentElement.style.setProperty(`--${id}`, v.solid);
  return c;
}

// Small states shown as boxes off the east coast, like 270toWin.
const BOXES = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];

export async function drawMap(svgEl, states, base = '..') {
  const topo = await (await fetch(`${base}/data/us-states.topo.json`)).json();
  const byFips = Object.fromEntries(states.map(s => [s.fips, s]));
  const svg = d3.select(svgEl).attr('viewBox', '0 0 1060 610');
  const path = d3.geoPath();
  const feats = topojson.feature(topo, topo.objects.states).features;
  const g = svg.append('g');
  g.selectAll('path').data(feats).join('path')
    .attr('d', path)
    .attr('class', 'st')
    .attr('data-code', d => byFips[d.id]?.code);
  // EV labels on bigger states
  const lbl = svg.append('g').attr('class', 'lbls');
  for (const f of feats) {
    const s = byFips[f.id];
    if (!s || BOXES.includes(s.code)) continue;
    const [x, y] = path.centroid(f);
    if (!isFinite(x)) continue;
    const t = lbl.append('text').attr('x', x).attr('y', y).attr('data-code', s.code).attr('class', 'lbl');
    t.append('tspan').attr('x', x).attr('dy', '-0.1em').text(s.code);
    t.append('tspan').attr('x', x).attr('dy', '1.05em').attr('class', 'ev').text('');
  }
  const bx = svg.append('g').attr('class', 'boxes');
  BOXES.forEach((code, i) => {
    const y = 170 + i * 34;
    bx.append('rect').attr('x', 985).attr('y', y).attr('width', 26).attr('height', 26).attr('rx', 4).attr('class', 'st').attr('data-code', code);
    bx.append('text').attr('x', 1018).attr('y', y + 18).attr('class', 'boxlbl').attr('data-code', code).text(code);
  });
  return svgEl;
}

// Color every state: closed = solid team color with a lock outline; open = pale lean; tied = grey.
export function paintMap(svgEl, { states, spend, closed, teams, ev, highlight = [], colors = teamColors(null) }) {
  const evOf = Object.fromEntries(states.map(s => [s.code, ev(s)]));
  for (const node of svgEl.querySelectorAll('.st')) {
    const code = node.dataset.code;
    if (!code) continue;
    const c = closed[code];
    const l = c || leader(spend[code], teams);
    node.style.fill = c ? colors[c].solid : l ? colors[l].lean : TOSSUP;
    node.classList.toggle('closed', !!c);
    node.classList.toggle('flash', highlight.includes(code));
    const m = margin(spend[code], teams);
    node.setAttribute('aria-label', `${code} ${evOf[code]} EV${c ? ' closed ' + c : ''} ${Math.round(m * 100)}%`);
  }
  for (const t of svgEl.querySelectorAll('text.lbl')) {
    const code = t.dataset.code;
    t.querySelector('.ev').textContent = evOf[code];
    t.classList.toggle('on-dark', !!closed[code]);
  }
  for (const t of svgEl.querySelectorAll('text.boxlbl')) t.textContent = `${t.dataset.code} ${evOf[t.dataset.code]}`;
}
