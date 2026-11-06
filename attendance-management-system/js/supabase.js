/* ============ js/supabase.js ============ */
/* ------------------------------------------------------------------
   1. CONFIGURATION — replace with your own Supabase project values
   ------------------------------------------------------------------ */
const SUPABASE_URL      = 'https://efvlmaazgtnngzdpmxdz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdmxtYWF6Z3Rubmd6ZHBteGR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NzQxNTgsImV4cCI6MjEwOTU1MDE1OH0._HMgzLEHzOMKhfVC9npanE_XETcHSah-jm2XiDxHohM';

/* The UMD build exposes `window.supabase`; we alias our client to `db`. */
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==================================================================
   2. THEME
   ================================================================== */
(function initTheme(){
  const saved = localStorage.getItem('attendx-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('attendx-theme', next);
  document.querySelectorAll('[data-theme-toggle]').forEach(b => {
    b.textContent = next === 'dark' ? '☀️' : '🌙';
  });
}

/* ==================================================================
   3. DOM HELPERS
   ================================================================== */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, html = ''){
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  });
  if (html) node.innerHTML = html;
  return node;
}

/* ==================================================================
   4. TOASTS
   ================================================================== */
function ensureToastWrap(){
  let wrap = $('.toast-wrap');
  if (!wrap){
    wrap = el('div', { class: 'toast-wrap' });
    document.body.appendChild(wrap);
  }
  return wrap;
}

function toast(message, type = 'info', timeout = 3400){
  const wrap = ensureToastWrap();
  const icons = { success: '✅', error: '⛔', warning: '⚠️', info: 'ℹ️' };
  const t = el('div', { class: `toast ${type}` }, `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`);
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .25s ease, transform .25s ease';
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
    setTimeout(() => t.remove(), 260);
  }, timeout);
}

/* ==================================================================
   5. SMALL UTILITIES
   ================================================================== */
function escapeHtml(str = ''){
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initials(name = ''){
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
}

function fmtDate(value){
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(value){
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function todayISO(){
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function percent(part, total){
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function statusBadge(status){
  const s = (status || '').toLowerCase();
  return `<span class="badge ${escapeHtml(s)}">${escapeHtml(s || 'unknown')}</span>`;
}

function randomCode(len = 6){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

function setLoading(btn, isLoading){
  if (!btn) return;
  btn.classList.toggle('loading', isLoading);
  btn.disabled = isLoading;
}

/* ==================================================================
   6. AUTH HELPERS
   ================================================================== */
let _profileCache = null;

async function getSession(){
  const { data } = await db.auth.getSession();
  return data.session || null;
}

async function getProfile(force = false){
  if (_profileCache && !force) return _profileCache;
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error) return null;
  _profileCache = data;
  return data;
}

/**
 * Redirects to login if not authenticated, or to the correct
 * dashboard if the user's role is not in `allowed`.
 */
async function requireAuth(allowed = []){
  const session = await getSession();
  if (!session){
    location.replace('login.html');
    return null;
  }
  const profile = await getProfile(true);
  if (!profile){
    await db.auth.signOut();
    location.replace('login.html');
    return null;
  }
  if (allowed.length && !allowed.includes(profile.role)){
    location.replace(`${profile.role}.html`);
    return null;
  }
  return profile;
}

async function logout(){
  await db.auth.signOut();
  _profileCache = null;
  location.replace('login.html');
}

/* Redirect already-authenticated users away from auth pages */
async function redirectIfAuthenticated(){
  const profile = await getProfile();
  if (profile) location.replace(`${profile.role}.html`);
}

/* ==================================================================
   7. GLOBAL WIRING (theme toggle, password toggles, modal closes)
   ================================================================== */
document.addEventListener('click', (e) => {
  const themeBtn = e.target.closest('[data-theme-toggle]');
  if (themeBtn){ toggleTheme(); return; }

  const pwdBtn = e.target.closest('[data-toggle-password]');
  if (pwdBtn){
    const input = $(pwdBtn.dataset.togglePassword);
    if (input){
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      pwdBtn.textContent = isPwd ? 'Hide' : 'Show';
    }
    return;
  }

  const closeBtn = e.target.closest('[data-modal-close]');
  if (closeBtn){
    const backdrop = closeBtn.closest('.modal-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
  }
});

/* Sync toggle icon on load */
document.addEventListener('DOMContentLoaded', () => {
  const theme = document.documentElement.getAttribute('data-theme');
  $$('[data-theme-toggle]').forEach(b => { b.textContent = theme === 'dark' ? '☀️' : '🌙'; });
});