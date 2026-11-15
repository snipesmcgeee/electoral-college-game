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

// Show any database/network error on screen instead of leaving the page stuck on "Loading…".
export function showError(err) {
  const msg = String(err?.message || err || 'Unknown error');
  const code = err?.code || '';
  const hint = /permission|insufficient/i.test(msg + code)
    ? 'The database rules are blocking this device. In Firebase → Firestore Database → Rules, publish the rules from firestore.rules.'
    : /auth|admin-restricted|operation-not-allowed/i.test(msg + code)
      ? 'Anonymous sign-in looks turned off. In Firebase → Authentication → Sign-in method, enable Anonymous.'
      : /offline|network|unavailable/i.test(msg + code) ? 'Can\'t reach the database. Check the internet connection.' : '';
  let box = document.getElementById('err-box');
  if (!box) {
    box = h('div', { id: 'err-box', class: 'card warn', style: 'position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:100;color:#1d1f24' });
    document.body.append(box);
  }
  box.replaceChildren(h('b', {}, 'Something went wrong'), h('div', {}, hint || msg), hint ? h('div', { class: 'muted', style: 'font-size:.8rem' }, msg) : null,
    h('button', { class: 'small secondary', style: 'margin-top:.5rem', onclick: () => box.remove() }, 'Dismiss'));
}
window.addEventListener('unhandledrejection', e => showError(e.reason));
window.addEventListener('error', e => showError(e.error || e.message));
