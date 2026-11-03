// Google Analytics 4, page views only, and only after the reader says yes.
// No top-level use of `document` or `window` beyond what runs in a browser: this file is loaded by boot.js on every page.
// It does nothing on localhost, so local work and the test suite never send data.

export const MEASUREMENT_ID = 'G-N9SZ5XCHD9';
const KEY = 'analytics-consent';
const LOCAL = new Set(['localhost', '[::1]', '']);

export const isLocal = (hostname) => LOCAL.has(hostname) || hostname.endsWith('.localhost');

const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* storage blocked: the choice lasts for this page only */ } };

let loaded = false;
function load() {
  if (loaded) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.append(s);
}

function banner() {
  const box = document.createElement('div');
  box.className = 'consent'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Analytics');
  const text = document.createElement('p');
  text.textContent = 'Allow Google Analytics to count page views? It sets cookies. Nothing else on this site tracks you.';
  const yes = document.createElement('button'); yes.type = 'button'; yes.textContent = 'Allow';
  const no = document.createElement('button'); no.type = 'button'; no.textContent = 'No thanks';
  const done = (v) => { write(v); box.remove(); if (v === 'yes') load(); };
  yes.addEventListener('click', () => done('yes'));
  no.addEventListener('click', () => done('no'));
  box.append(text, yes, no);
  document.body.append(box);
}

/** A footer link so the choice can be changed later. */
function footerLink() {
  const foot = document.querySelector('.site-foot');
  if (!foot) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'linklike'; b.textContent = 'Analytics choice';
  b.addEventListener('click', () => { document.querySelector('.consent')?.remove(); banner(); });
  foot.append(' · ', b);
}

export function initAnalytics() {
  if (typeof document === 'undefined' || isLocal(location.hostname) || location.protocol === 'file:') return;
  const choice = read();
  if (choice === 'yes') load(); else if (choice !== 'no') banner();
  footerLink();
}

/** Send a GA4 event. Does nothing until the reader has allowed analytics. */
export function track(name, params = {}) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') { window.gtag('event', name, params); return true; }
  return false;
}

/**
 * Two events, nothing else:
 *   widget_used    once per page load per widget, on the first control the reader touches ({ concept, widget: 'main' | 'breaks' })
 *   answer_opened  when a "Check yourself" answer is opened ({ concept, question: 1, 2 or 3 })
 */
export function trackInteractions(slug) {
  if (typeof document === 'undefined') return;
  const seen = new Set();
  document.addEventListener('click', (e) => {
    const box = e.target.closest?.('.reveal');
    const btn = e.target.closest?.('.reveal button');
    if (box && btn && btn.getAttribute('aria-expanded') === 'true') {
      track('answer_opened', { concept: slug, question: [...document.querySelectorAll('.qa')].indexOf(box.closest('.qa')) + 1 });
    }
  });
  const used = (e) => {
    if (e.type === 'click' && !e.target.closest?.('button, input, label, .handle')) return;
    const w = e.target.closest?.('#widget, #breaks-widget');
    if (!w || seen.has(w.id)) return;
    if (track('widget_used', { concept: slug, widget: w.id === 'widget' ? 'main' : 'breaks' })) seen.add(w.id);
  };
  for (const type of ['input', 'change', 'click']) document.addEventListener(type, used);
}

initAnalytics();
