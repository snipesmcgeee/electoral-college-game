// Small DOM helpers shared by the pages.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid.nodeType ? kid : String(kid));
  return e;
}

export function toast(msg, kind = '') {
  const t = h('div', { class: `toast ${kind}` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

export const qs = new URLSearchParams(location.search);
// replaceChildren that skips null/false (DOM would print them as text)
export function fill(el, ...kids) { el.replaceChildren(...kids.flat().filter(k => k !== null && k !== undefined && k !== false)); }
export const fmt = n => Number(n || 0).toLocaleString();
export const pct = x => `${Math.round(x * 100)}%`;

export function makeCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
}

export function notConfigured(root) {
  root.replaceChildren(h('div', { class: 'card warn' },
    h('h2', {}, 'Firebase not set up yet'),
    h('p', {}, 'Paste your Firebase web config into js/firebase-config.js. Steps are in the README.')));
}
