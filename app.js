'use strict';
/* =====================================================================
   Margalla Trail 5 Trip — single-page app (students + organizers)
   Backend: Supabase (auth, database, storage, realtime)
   ===================================================================== */
const CFG = window.APP_CONFIG || {};
const CUR = CFG.CURRENCY || 'Rs';
const CHECKPOINTS = [
  { id: 'depart_uni',   label: 'Left University',    icon: '🚌' },
  { id: 'arrive_trail', label: 'Arrived at Trail 5', icon: '⛰️' },
  { id: 'depart_food',  label: 'Leaving for Food',   icon: '🍽️' },
  { id: 'return_uni',   label: 'Back at University', icon: '🏫' },
];
const RELATIONS = ['Father', 'Mother', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Guardian', 'Other'];
const QR_PREFIX = 'MT5:';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `${CUR} ${Number(n || 0).toLocaleString('en-PK')}`;
const fmtDT = (d) => new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const telDigits = (p) => String(p || '').replace(/[^\d+]/g, '');
const normRoll = (r) => String(r || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const rollEmail = (r) => `${normRoll(r)}@students.margallatrip.app`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const app = $('#app');
const IC = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.1"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.5 2.5 3.5 5.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9"/>',
  qr: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M14 14h2.5v2.5M20.5 14v.1M14 20.5h.1M17 18v2.5h3.5"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  chat: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>',
};
const icon = (n, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const moneyBig = (n) => `${CUR} ${Number(n || 0).toLocaleString('en-PK')}<span class="dim">.00</span>`;
let sb = null;
const S = { session: null, student: null, settings: null, timers: [], channel: null };
let A = null; // admin state

/* ---------- UI helpers ---------- */
function toast(msg, type = '', ms = 3500) {
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function openModal(html, cls = '') {
  const o = document.createElement('div');
  o.className = `overlay ${cls}`;
  o.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(o);
  const close = () => o.remove();
  o.addEventListener('click', (e) => { if (e.target === o) close(); });
  $$('[data-close]', o).forEach((b) => b.addEventListener('click', close));
  return { el: o, close };
}
async function busy(btn, fn) {
  if (btn.disabled) return;
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = 'Please wait…';
  try { await fn(); } catch (e) { console.error(e); toast(friendly(e), 'err', 5000); }
  finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
}
function friendly(e) {
  const m = (e && e.message) || String(e);
  if (/invalid login/i.test(m)) return 'Wrong roll number / email or password.';
  if (/already registered/i.test(m)) return 'This roll number is already registered — please log in.';
  if (/roll_key/i.test(m) && /duplicate|unique/i.test(m)) return 'This roll number is already registered.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No internet connection. Please try again.';
  return m;
}
function beep() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; const c = new C();
    [0, .25, .5].forEach((t) => { const o = c.createOscillator(); const g = c.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.value = .25;
      o.start(c.currentTime + t); o.stop(c.currentTime + t + .18); });
  } catch { /* ignore */ }
}
function notify(title, body) {
  try { if ('Notification' in window && Notification.permission === 'granted')
    new Notification(title, { body, icon: 'icons/icon-192.png' }); } catch { /* ignore */ }
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch { /* ignore */ }
}
function clearTimers() { S.timers.forEach(clearInterval); S.timers = []; }
async function teardown() {
  clearTimers();
  if (S.channel) { try { await sb.removeChannel(S.channel); } catch { /* ignore */ } S.channel = null; }
  if (A && A.scanner) { try { await A.scanner.stop(); } catch { /* ignore */ } }
  A = null;
}

/* ---------- Install to home screen ---------- */
let deferredPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function installDismissed() { const t = +store.get('mt5_install_dismissed') || 0; return Date.now() - t < 3 * 864e5; }
function showInstallBanner() {
  const slot = $('#install-slot');
  if (isStandalone() || installDismissed() || slot.innerHTML) return;
  if (!deferredPrompt && !isIOS()) return;
  slot.innerHTML = `<div class="install"><img src="icons/icon-192.png" alt="">
    <div class="t"><b>Add Trail 5 Trip to your home screen</b>One tap to open — works like an app.</div>
    <button class="btn amber sm" id="inst-go">${deferredPrompt ? 'Install' : 'How?'}</button>
    <button class="x" id="inst-x" aria-label="Dismiss">✕</button></div>`;
  $('#inst-x').onclick = () => { store.set('mt5_install_dismissed', Date.now()); slot.innerHTML = ''; };
  $('#inst-go').onclick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch { /* ignore */ }
      deferredPrompt = null; slot.innerHTML = '';
    } else {
      openModal(`<h2>Add to Home Screen (iPhone)</h2><ol class="steps">
        <li>Open this site in <b>Safari</b>.</li>
        <li>Tap the <b>Share</b> button <span style="font-size:1.2em">⎙</span> at the bottom.</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
        <li>Tap <b>Add</b>. The Trail 5 icon appears on your home screen.</li></ol>
        <button class="btn block" data-close>Got it</button>`);
    }
  };
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; setTimeout(showInstallBanner, 1200); });
window.addEventListener('appinstalled', () => { $('#install-slot').innerHTML = ''; toast('Installed! Find it on your home screen.', 'ok'); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
window.addEventListener('load', () => setTimeout(showInstallBanner, 2500));

/* ---------- Boot ---------- */
async function boot() {
  if (!CFG.SUPABASE_URL || /YOUR-PROJECT/.test(CFG.SUPABASE_URL) || !window.supabase) {
    app.innerHTML = `<div class="wrap"><div class="card"><h2>Setup needed</h2>
      <p>Open <code>config.js</code> and paste your Supabase URL and anon key, then redeploy. See README.md.</p></div></div>`;
    return;
  }
  let url = String(CFG.SUPABASE_URL).trim().replace(/\/+$/, '').replace(/\/(rest|auth|storage)\/v1.*$/, '');
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
    app.innerHTML = `<div class="wrap"><div class="card"><h2>Supabase URL looks wrong</h2>
      <p>It should look like <code>https://abcdxyz.supabase.co</code> (Supabase → Project Settings → API → Project URL).<br>Currently: <code>${esc(CFG.SUPABASE_URL)}</code></p></div></div>`;
    return;
  }
  sb = window.supabase.createClient(url, String(CFG.SUPABASE_ANON_KEY).trim());
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT') { S.session = null; S.student = null; route(); } });
  route();
}

async function route() {
  await teardown();
  app.innerHTML = '<div class="splash"><div class="spinner"></div></div>';
  try {
    if (!S.session) return renderWelcome('register');
    const uid = S.session.user.id;
    const { data: org } = await sb.from('organizers').select('user_id,name').eq('user_id', uid).maybeSingle();
    if (org) return startAdmin(org);
    const { data: stu, error } = await sb.from('students').select('*').eq('id', uid).maybeSingle();
    if (error) throw error;
    S.student = stu;
    const { data: set } = await sb.from('settings').select('*').eq('id', 1).single();
    S.settings = set;
    if (!stu) return renderRegister('complete');
    if (stu.payment_status === 'confirmed') return renderDashboard();
    if (stu.payment_status === 'pending') return renderPending();
    return renderPayment();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="wrap"><div class="card center"><h2>Something went wrong</h2><p class="muted">${esc(friendly(e))}</p>
      <button class="btn" onclick="location.reload()">Retry</button> <button class="btn ghost" id="lo">Log out</button></div></div>`;
    $('#lo').onclick = logout;
  }
}
async function logout() { await sb.auth.signOut(); S.session = null; route(); }

/* =====================================================================
   WELCOME: register / login
   ===================================================================== */
async function renderWelcome(tab) {
  let info = {};
  try { const { data } = await sb.rpc('public_trip_info'); info = (data && data[0]) || {}; } catch { /* ignore */ }
  app.innerHTML = `
  <div class="hero tall"><div class="inner">
    <div class="tabs"><button data-t="register" class="${tab === 'register' ? 'on' : ''}">Register</button>
      <button data-t="login" class="${tab === 'login' ? 'on' : ''}">Log in</button></div>
    <span class="pill" style="margin-top:14px">🥾 Class trip</span>
    <h1 class="display">${esc(info.trip_name || 'Margalla Trail 5 Trip')}</h1>
    <p>📍 ${esc(info.destination || 'Margalla Hills, Islamabad')}</p>
    <div class="row" style="margin-top:12px">${info.trip_date ? `<span class="pill">📅 ${esc(fmtDT(info.trip_date))}</span>` : ''}${info.price ? `<span class="pill">💰 ${money(info.price)} / student</span>` : ''}</div>
  </div></div>
  <div class="sheet"><div class="wrap" id="welcome-body"></div></div>`;
  $$('.tabs button').forEach((b) => b.onclick = () => renderWelcome(b.dataset.t));
  if (tab === 'login') renderLogin($('#welcome-body')); else renderRegister('new', $('#welcome-body'));
}

function renderLogin(el) {
  el.innerHTML = `<form class="card" id="login-form" autocomplete="on">
    <label>Roll number <span class="muted small">(organizers: email)</span></label>
    <input name="uid" required autocapitalize="characters" autocomplete="username" placeholder="e.g. 21-CS-045">
    <label>Password</label>
    <input name="pw" type="password" required autocomplete="current-password">
    <button class="btn block" type="submit">Log in</button>
    <p class="muted small center">Forgot your password? Ask an organizer to reset it.</p></form>`;
  $('#login-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target; const btn = $('button', f);
    busy(btn, async () => {
      const id = f.uid.value.trim();
      const email = id.includes('@') ? id : rollEmail(id);
      const { data, error } = await sb.auth.signInWithPassword({ email, password: f.pw.value });
      if (error) throw error;
      S.session = data.session; route();
    });
  };
}

function renderRegister(mode, el) {
  const complete = mode === 'complete';
  const host = el || app;
  const html = `<form class="card" id="reg-form" autocomplete="on">
    ${complete ? '<h2>Finish your registration</h2><p class="muted">Your account exists, but your details are missing. Please fill them in.</p>' : '<h2>Register for the trip</h2>'}
    <label>Full name</label><input name="full_name" required autocomplete="name" placeholder="As on your university card">
    <label>Roll number</label><input name="roll_no" required autocapitalize="characters" placeholder="e.g. 21-CS-045">
    <label>Your mobile number</label><input name="phone" type="tel" required inputmode="tel" placeholder="03XX-XXXXXXX">
    <h3 style="margin-top:18px">Emergency contact</h3>
    <div class="grid2 stack-sm">
      <div><label>Contact name</label><input name="emergency_name" required placeholder="e.g. Ahmed Khan"></div>
      <div><label>Relation</label><select name="relation" required>${RELATIONS.map((r) => `<option>${r}</option>`).join('')}</select></div>
    </div>
    <label>Emergency contact number</label><input name="emergency_phone" type="tel" required inputmode="tel" placeholder="03XX-XXXXXXX">
    ${complete ? '' : `<h3 style="margin-top:18px">Create a password</h3>
    <label>Password (min 6 characters)</label><input name="pw" type="password" minlength="6" required autocomplete="new-password">
    <label>Confirm password</label><input name="pw2" type="password" minlength="6" required autocomplete="new-password">`}
    <button class="btn block" type="submit">${complete ? 'Save details' : 'Register & continue to payment'}</button>
    ${complete ? '<button type="button" class="btn ghost block" id="lo">Log out</button>' : ''}
  </form>`;
  if (el) el.innerHTML = html; else app.innerHTML = `<div class="wrap">${html}</div>`;
  if (complete && $('#lo')) $('#lo').onclick = logout;
  $('#reg-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target; const btn = $('button[type=submit]', f);
    busy(btn, async () => {
      const roll = f.roll_no.value.trim().toUpperCase();
      if (!normRoll(roll)) throw new Error('Enter a valid roll number.');
      if (!complete) {
        if (f.pw.value !== f.pw2.value) throw new Error('Passwords do not match.');
        const { data, error } = await sb.auth.signUp({ email: rollEmail(roll), password: f.pw.value });
        if (error) throw error;
        if (!data.session) throw new Error('Sign-up needs "Confirm email" turned OFF in Supabase (see README).');
        S.session = data.session;
      }
      const row = {
        id: S.session.user.id, full_name: f.full_name.value.trim(), roll_no: roll, roll_key: normRoll(roll),
        phone: f.phone.value.trim(), emergency_name: f.emergency_name.value.trim(),
        emergency_phone: f.emergency_phone.value.trim(), relation: f.relation.value,
      };
      const { error: e2 } = await sb.from('students').insert(row);
      if (e2) throw e2;
      toast('Registered! Now complete your payment.', 'ok'); route();
    });
  };
}

/* =====================================================================
   STUDENT: payment, pending, dashboard
   ===================================================================== */
function studentHeader(title, sub) {
  return `<div class="hero"><div class="inner">
    <div class="row between"><span class="pill">${esc(S.student.roll_no)}</span>
    <button class="icon-btn" id="lo" aria-label="Log out">${icon('logout', 20)}</button></div>
    <h1 style="margin-top:18px">${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
}

function renderPayment() {
  const st = S.student, set = S.settings;
  const rejected = st.payment_status === 'rejected';
  app.innerHTML = `${studentHeader('Hi ' + st.full_name.split(' ')[0] + ' 👋', 'Step 2 of 3 · Payment')}
  <div class="sheet"><div class="wrap">
    ${rejected ? `<div class="alert-box red"><b>Your last payment was not accepted.</b><br>${esc(st.reject_reason || 'Please check the details and upload a clear screenshot again.')}</div>` : ''}
    <div class="card center"><div class="muted small">Trip fee</div><div class="big-amount">${moneyBig(set.price)}</div></div>
    <div class="card"><h2>1. Send the money</h2>
      <p class="muted">Use your bank app (JazzCash, EasyPaisa, HBL, Meezan… any) and transfer to:</p>
      ${[['Bank / Wallet', set.bank_name], ['Account title', set.account_title], ['Account number', set.account_number]].filter(([, v]) => v).map(([k, v]) =>
        `<div class="copy-row"><div><div class="muted small">${k}</div><b>${esc(v)}</b></div>${k === 'Account number' ? `<button class="btn ghost sm" data-copy="${esc(v)}">Copy</button>` : ''}</div>`).join('')
        || '<p class="alert-box amber">Organizers have not added the account details yet. Please check back soon.</p>'}
      ${set.payment_note ? `<p class="small muted">${esc(set.payment_note)}</p>` : ''}
    </div>
    <form class="card" id="pay-form"><h2>2. Upload the screenshot</h2>
      <p class="muted">Take a screenshot of the successful transfer showing amount, date and transaction ID.</p>
      <label class="drop" id="drop"><input type="file" accept="image/*" id="proof" hidden><span id="drop-text">📎 Tap to choose screenshot</span><img id="preview" class="hidden" alt="Preview"></label>
      <button class="btn block" type="submit" id="pay-btn" disabled>Submit for verification</button></form>
  </div></div>`;
  $('#lo').onclick = logout;
  $$('[data-copy]').forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied', 'ok', 1500); } catch { toast('Copy not supported'); } });
  let file = null;
  $('#proof').onchange = (e) => {
    file = e.target.files[0]; if (!file) return;
    const img = $('#preview'); img.src = URL.createObjectURL(file); img.classList.remove('hidden');
    $('#drop-text').textContent = '✅ ' + file.name + ' — tap to change'; $('#pay-btn').disabled = false;
  };
  $('#pay-form').onsubmit = (e) => {
    e.preventDefault(); if (!file) return;
    busy($('#pay-btn'), async () => {
      const blob = await compressImage(file);
      const path = `${S.session.user.id}/${Date.now()}.jpg`;
      const { error } = await sb.storage.from('payment-proofs').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
      if (error) throw error;
      const { error: e2 } = await sb.rpc('submit_payment', { p_path: path });
      if (e2) throw e2;
      route();
    });
  };
}

async function compressImage(file, max = 1600, q = 0.82) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    return blob || file;
  } catch { return file; }
}

function renderPending() {
  const st = S.student;
  app.innerHTML = `${studentHeader('Payment under review', 'Step 3 of 3')}
  <div class="sheet"><div class="wrap"><div class="card status-big">
    <div class="icon pulse">⏳</div><h2>Payment verification pending</h2>
    <p class="muted">Thanks ${esc(st.full_name.split(' ')[0])}! An organizer is checking your screenshot.<br>This page updates automatically as soon as it is confirmed.</p>
    <p class="small muted">Submitted ${st.proof_submitted_at ? esc(fmtDT(st.proof_submitted_at)) : ''}</p>
    <button class="btn ghost" id="chk">Check status now</button></div></div></div>`;
  $('#lo').onclick = logout;
  const check = async () => {
    const { data } = await sb.from('students').select('*').eq('id', st.id).maybeSingle();
    if (data && data.payment_status !== 'pending') { S.student = data; if (data.payment_status === 'confirmed') toast('🎉 Payment confirmed!', 'ok'); route(); }
  };
  $('#chk').onclick = (e) => busy(e.target, check);
  S.channel = sb.channel('pending-' + st.id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students', filter: `id=eq.${st.id}` }, check).subscribe();
  S.timers.push(setInterval(check, 20000));
}

/* ---------- Student dashboard ---------- */
async function renderDashboard() {
  const st = S.student; const uid = st.id;
  const [al, at, em] = await Promise.all([
    sb.from('alerts').select('*').order('created_at', { ascending: false }).limit(50),
    sb.from('attendance').select('checkpoint,created_at').eq('student_id', uid),
    sb.from('emergencies').select('*').eq('student_id', uid).order('created_at', { ascending: false }).limit(5),
  ]);
  const D = { alerts: al.data || [], att: at.data || [], emg: em.data || [], newIds: new Set() };
  const set = () => S.settings;

  app.innerHTML = `
  <div class="hero"><div class="inner">
    <div class="row between"><div class="row"><span class="avatar">${esc(st.full_name.trim()[0] || '?').toUpperCase()}</span>
      <div><div class="small" style="opacity:.75">Welcome back</div><b>${esc(st.full_name.split(' ')[0])}</b></div></div>
      <div class="row"><span class="pill">${esc(st.roll_no)}</span><button class="icon-btn" id="lo" aria-label="Log out">${icon('logout', 20)}</button></div></div>
    <div class="dim-label">Trip starts in</div>
    <div class="countdown" id="cd"></div>
    <p id="d-dest" style="margin-top:16px"></p>
  </div></div>
  <div class="sheet"><div class="wrap">
    <div id="notif-slot"></div>
    <section data-sec="home"><div class="card qr-card"><h2>Your attendance QR</h2><p class="muted small">Show this to an organizer at every checkpoint.</p>
      <div class="qr-box" id="qr"></div><div class="small muted" style="margin-top:10px">${esc(st.full_name)}</div></div></section>
    <section data-sec="progress" class="hidden"><div class="card"><h2>Trip progress</h2><ul class="timeline" id="tl"></ul></div></section>
    <section data-sec="msgs" class="hidden"><h2 style="margin:6px 4px 8px">Messages from organizers</h2><div id="msgs"></div></section>
    <section data-sec="info" class="hidden"><div class="card"><h2>Trip details</h2><div id="info"></div></div><div id="emg-hist"></div></section>
  </div></div>
  <nav class="bnav">
    <button data-sec="home" class="on" aria-label="My QR">${icon('qr')}</button>
    <button data-sec="progress" aria-label="Progress">${icon('route')}</button>
    <button class="sos" id="sos" aria-label="Emergency">${icon('alert')}</button>
    <button data-sec="msgs" aria-label="Messages">${icon('chat')}<span class="badge hidden" id="unread"></span></button>
    <button data-sec="info" aria-label="Trip info">${icon('info')}</button>
  </nav>`;
  $('#lo').onclick = logout;
  D.sec = 'home'; D.unread = 0;
  const drawUnread = () => { const u = $('#unread'); u.textContent = D.unread; u.classList.toggle('hidden', !D.unread); };
  const showSec = (s) => {
    D.sec = s;
    $$('[data-sec]').forEach((el) => { if (el.tagName === 'SECTION') el.classList.toggle('hidden', el.dataset.sec !== s); else el.classList.toggle('on', el.dataset.sec === s); });
    if (s === 'msgs') { D.unread = 0; drawUnread(); }
    window.scrollTo(0, 0);
  };
  $$('button[data-sec]').forEach((b) => b.onclick = () => showSec(b.dataset.sec));

  const drawQR = () => {
    const text = QR_PREFIX + st.qr_token;
    store.set('mt5_qr', text);
    try { const q = qrcode(0, 'M'); q.addData(text); q.make(); $('#qr').innerHTML = q.createSvgTag(6, 0); }
    catch { $('#qr').innerHTML = `<p class="small">QR library not loaded. Your code: <b>${esc(st.qr_token.slice(0, 8))}</b></p>`; }
  };
  const drawInfo = () => {
    const s = set(); $('#d-dest').textContent = '📍 ' + s.destination;
    $('#info').innerHTML = `<div class="copy-row"><div><div class="muted small">Destination</div><b>${esc(s.destination)}</b></div></div>
      <div class="copy-row"><div><div class="muted small">Date & time</div><b>${esc(fmtDT(s.trip_date))}</b></div></div>
      ${s.meeting_point ? `<div class="copy-row"><div><div class="muted small">Meeting point</div><b>${esc(s.meeting_point)}</b></div></div>` : ''}
      ${s.itinerary ? `<div class="copy-row"><div><div class="muted small">Plan / what to bring</div><div style="white-space:pre-wrap">${esc(s.itinerary)}</div></div></div>` : ''}
      ${s.organizer_contacts ? `<div class="copy-row"><div><div class="muted small">Organizer contacts</div><div style="white-space:pre-wrap">${esc(s.organizer_contacts)}</div></div></div>` : ''}`;
  };
  const drawTimeline = () => {
    $('#tl').innerHTML = CHECKPOINTS.map((c) => {
      const a = D.att.find((x) => x.checkpoint === c.id);
      return `<li class="${a ? 'done' : ''}"><span class="dot">${a ? '✓' : c.icon}</span><div><b>${c.label}</b><div class="small muted">${a ? 'Marked ' + esc(fmtDT(a.created_at)) : 'Not yet'}</div></div></li>`;
    }).join('');
  };
  const drawMsgs = () => {
    $('#msgs').innerHTML = D.alerts.length ? D.alerts.map((a) =>
      `<div class="msg ${D.newIds.has(a.id) ? 'new' : ''}">${esc(a.message)}<time>${esc(fmtDT(a.created_at))}</time></div>`).join('')
      : '<p class="muted">No messages yet. Alerts from organizers will appear here instantly.</p>';
  };
  const drawEmg = () => {
    $('#emg-hist').innerHTML = D.emg.length ? `<div class="card"><h2>Your emergency alerts</h2>${D.emg.map((e) =>
      `<div class="list-item"><div class="grow"><b>${esc(fmtDT(e.created_at))}</b><div class="small muted">${esc(e.message || 'No note')}</div></div>
       <span class="chip ${e.resolved ? 'green' : 'red'}">${e.resolved ? 'Handled' : 'Sent'}</span></div>`).join('')}</div>` : '';
  };
  drawQR(); drawInfo(); drawTimeline(); drawMsgs(); drawEmg();
  if ('Notification' in window && Notification.permission === 'default') {
    $('#notif-slot').innerHTML = `<div class="alert-box blue row between"><span>Get a pop-up when organizers send an alert.</span><button class="btn sm" id="notif">Enable</button></div>`;
    $('#notif').onclick = async () => { await Notification.requestPermission(); $('#notif-slot').innerHTML = ''; };
  }

  // countdown
  const cd = $('#cd');
  const tick = () => {
    const ms = new Date(set().trip_date) - Date.now();
    if (ms <= 0) { cd.innerHTML = '<div style="grid-column:1/-1"><b>🎉 The trip is on!</b></div>'; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    cd.innerHTML = [[d, 'Days'], [h, 'Hours'], [m, 'Mins'], [s, 'Secs']].map(([n, l]) => `<div><b>${String(n).padStart(2, '0')}</b><span>${l}</span></div>`).join('');
  };
  tick(); S.timers.push(setInterval(tick, 1000));

  // emergency button
  $('#sos').onclick = () => {
    const last = +store.get('mt5_last_sos') || 0;
    const m = openModal(`<h2>🚨 Send emergency alert</h2>
      <p class="muted">This immediately alerts all organizers with your name, phone and location (if allowed).</p>
      <label>What is happening? (optional)</label><textarea id="sos-note" placeholder="e.g. I twisted my ankle near the second waypoint"></textarea>
      <button class="btn danger block" id="sos-send">Send emergency alert</button>
      <button class="btn ghost block" data-close>Cancel</button>`);
    $('#sos-send', m.el).onclick = (e) => busy(e.target, async () => {
      if (Date.now() - last < 30000) throw new Error('Alert already sent a moment ago. Organizers have been notified.');
      let lat = null, lng = null;
      try { const p = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000, maximumAge: 60000 })); lat = p.coords.latitude; lng = p.coords.longitude; } catch { /* location optional */ }
      const { data, error } = await sb.from('emergencies').insert({ student_id: uid, message: $('#sos-note', m.el).value.trim() || null, lat, lng }).select().single();
      if (error) throw error;
      store.set('mt5_last_sos', Date.now());
      D.emg.unshift(data); drawEmg(); m.close(); toast('Emergency alert sent to organizers', 'ok', 5000);
    });
  };

  // realtime
  S.channel = sb.channel('student-' + uid)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (p) => {
      D.alerts.unshift(p.new); D.newIds.add(p.new.id); drawMsgs();
      if (D.sec !== 'msgs') { D.unread++; drawUnread(); }
      toast('📢 New message from organizers', 'ok', 5000);
      notify('Trail 5 Trip — organizer alert', p.new.message);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'alerts' }, (p) => { D.alerts = D.alerts.filter((a) => a.id !== p.old.id); drawMsgs(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `student_id=eq.${uid}` }, async () => {
      const { data } = await sb.from('attendance').select('checkpoint,created_at').eq('student_id', uid); D.att = data || []; drawTimeline();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'emergencies', filter: `student_id=eq.${uid}` }, async () => {
      const { data } = await sb.from('emergencies').select('*').eq('student_id', uid).order('created_at', { ascending: false }).limit(5); D.emg = data || []; drawEmg();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings' }, (p) => { S.settings = p.new; drawInfo(); tick(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students', filter: `id=eq.${uid}` }, (p) => {
      if (p.new.payment_status !== 'confirmed') { S.student = p.new; route(); }
    })
    .subscribe();
}

/* =====================================================================
   ORGANIZER DASHBOARD
   ===================================================================== */
async function startAdmin(org) {
  A = { org, tab: 'overview', students: [], emergencies: [], attendance: [], alerts: [], settings: null,
        payFilter: 'pending', cp: 'depart_uni', mode: 'scan', urls: {}, scanner: null, lastScan: { t: '', at: 0 } };
  await loadAdminData();
  renderAdminShell();
  const reload = (fn) => async () => { if (!A) return; await fn(); refreshAdmin(); };
  S.channel = sb.channel('admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, reload(async () => { A.students = (await sb.from('students').select('*').order('created_at', { ascending: false })).data || []; }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, reload(async () => { A.attendance = (await sb.from('attendance').select('student_id,checkpoint,created_at')).data || []; }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, reload(async () => { A.alerts = (await sb.from('alerts').select('*').order('created_at', { ascending: false }).limit(50)).data || []; }))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergencies' }, async (p) => {
      await loadEmergencies(); refreshAdmin();
      const e = A.emergencies.find((x) => x.id === p.new.id); if (e) sosOverlay(e);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'emergencies' }, reload(loadEmergencies))
    .subscribe();
}
const EMG_SELECT = '*, students(full_name,roll_no,phone,emergency_name,emergency_phone,relation)';
async function loadEmergencies() { A.emergencies = (await sb.from('emergencies').select(EMG_SELECT).order('created_at', { ascending: false })).data || []; }
async function loadAdminData() {
  const [s, a, al, set] = await Promise.all([
    sb.from('students').select('*').order('created_at', { ascending: false }),
    sb.from('attendance').select('student_id,checkpoint,created_at'),
    sb.from('alerts').select('*').order('created_at', { ascending: false }).limit(50),
    sb.from('settings').select('*').eq('id', 1).single(),
  ]);
  A.students = s.data || []; A.attendance = a.data || []; A.alerts = al.data || []; A.settings = set.data;
  await loadEmergencies();
}
const pendingCount = () => A.students.filter((s) => s.payment_status === 'pending').length;
const openEmgCount = () => A.emergencies.filter((e) => !e.resolved).length;

const TABS = [
  ['overview', 'Overview'], ['payments', 'Payments'], ['attendance', 'Attendance'],
  ['alerts', 'Alerts'], ['sos', 'Emergencies'], ['students', 'Students'], ['settings', 'Settings'],
];
function renderAdminShell() {
  app.innerHTML = `<div class="hero"><div class="inner wide">
    <div class="row between"><div class="row"><span class="avatar">${esc((A.org.name || 'O').trim()[0] || 'O').toUpperCase()}</span>
      <div><div class="small" style="opacity:.75">Organizer</div><b>${esc(A.org.name || 'Dashboard')}</b></div></div>
      <div class="row" style="gap:8px">
        <button class="icon-btn" id="notif-a" aria-label="Enable alert sound">${icon('bell', 20)}</button>
        <button class="icon-btn" data-tab="students" aria-label="Students">${icon('users', 20)}</button>
        <button class="icon-btn" data-tab="settings" aria-label="Settings">${icon('gear', 20)}</button>
        <button class="icon-btn" id="lo" aria-label="Log out">${icon('logout', 20)}</button></div></div>
    <h1 id="hdr-title" style="margin-top:18px"></h1><div id="hdr-extra"></div></div></div>
    <div class="sheet"><div class="wrap wide" id="tab"></div></div>
    <nav class="bnav" id="navtabs"></nav>`;
  $('#lo').onclick = logout;
  $('#notif-a').onclick = async () => {
    if ('Notification' in window) { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Notifications on' : 'Notifications blocked'); }
    beep();
  };
  showTab(A.tab);
}
const NAV = [['overview', 'home'], ['payments', 'card'], ['attendance', 'scan'], ['alerts', 'chat'], ['sos', 'alert']];
function drawNav() {
  const label = (id) => (TABS.find((t) => t[0] === id) || [])[1];
  $('#navtabs').innerHTML = NAV.map(([id, ic]) => {
    const n = id === 'payments' ? pendingCount() : id === 'sos' ? openEmgCount() : 0;
    return `<button data-tab="${id}" class="${A.tab === id ? 'on' : ''}${id === 'sos' && n ? ' sos' : ''}" aria-label="${label(id)}">${icon(ic)}${n ? `<span class="badge">${n}</span>` : ''}</button>`;
  }).join('');
  $('#hdr-title').textContent = label(A.tab);
  $$('.icon-btn[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === A.tab));
  $$('[data-tab]').forEach((b) => b.onclick = () => showTab(b.dataset.tab));
}
async function stopScanner() {
  if (A && A.scanner) { try { await A.scanner.stop(); A.scanner.clear(); } catch { /* ignore */ } A.scanner = null; }
}
async function showTab(id) {
  await stopScanner();
  A.tab = id; drawNav();
  const el = $('#tab'); el.innerHTML = ''; $('#hdr-extra').innerHTML = '';
  TAB_FN[id].mount(el);
  window.scrollTo(0, 0);
}
function refreshAdmin() {
  if (!A || !$('#tab')) return;
  drawNav(); const t = TAB_FN[A.tab]; if (t.update) t.update($('#tab'));
}
function sosOverlay(e) {
  beep(); notify('🚨 EMERGENCY', `${e.students?.full_name || 'A student'} needs help`);
  const s = e.students || {};
  const m = openModal(`<div class="center"><div style="font-size:3rem">🚨</div><h2 style="color:var(--red)">EMERGENCY ALERT</h2>
    <h3>${esc(s.full_name)} <span class="muted">(${esc(s.roll_no)})</span></h3>
    ${e.message ? `<div class="alert-box red">${esc(e.message)}</div>` : ''}
    <p>Student: <a href="tel:${telDigits(s.phone)}"><b>${esc(s.phone)}</b></a><br>
    ${esc(s.relation)}: <a href="tel:${telDigits(s.emergency_phone)}"><b>${esc(s.emergency_phone)}</b></a> ${s.emergency_name ? '(' + esc(s.emergency_name) + ')' : ''}</p>
    ${e.lat ? `<a class="btn ghost block" target="_blank" rel="noopener" href="https://maps.google.com/?q=${e.lat},${e.lng}">📍 Open location</a>` : '<p class="muted small">Location not shared.</p>'}
    <button class="btn block" data-close>Acknowledge</button></div>`, 'sos-overlay');
  const rep = setInterval(() => { if (m.el.isConnected) beep(); else clearInterval(rep); }, 3000);
}

const stStatusChip = (s) => ({
  unpaid: '<span class="chip gray">Unpaid</span>', pending: '<span class="chip amber">Pending</span>',
  confirmed: '<span class="chip green">Confirmed</span>', rejected: '<span class="chip red">Rejected</span>',
}[s.payment_status]);
const hasAtt = (sid, cp) => A.attendance.some((a) => a.student_id === sid && a.checkpoint === cp);
const confirmedStudents = () => A.students.filter((s) => s.payment_status === 'confirmed');

/* ---------- Overview ---------- */
const OverviewTab = {
  mount(el) { this.update(el); },
  update(el) {
    const st = A.students, conf = confirmedStudents();
    const collected = conf.reduce((n, s) => n + (s.paid_amount || 0), 0);
    $('#hdr-extra').innerHTML = `<div class="dim-label" style="margin-top:6px">Money collected</div><div class="bignum">${moneyBig(collected)}</div>
      <div class="row" style="margin-top:14px"><span class="pill">${st.length} registered</span><span class="pill">${pendingCount()} pending</span><span class="pill">${conf.length} confirmed</span></div>`;
    el.innerHTML = `
    ${openEmgCount() ? `<div class="alert-box red row between"><b>🚨 ${openEmgCount()} unresolved emergency alert(s)</b><button class="btn danger sm" data-go="sos">View</button></div>` : ''}
    <div class="grid4" style="margin-bottom:14px">
      <div class="card stat"><div class="n">${st.length}</div><div class="l">Total students</div></div>
      <div class="card stat click" data-go="payments"><div class="n" style="color:${pendingCount() ? 'var(--brand)' : 'inherit'}">${pendingCount()}</div><div class="l">Pending verifications</div></div>
      <div class="card stat"><div class="n">${conf.length}</div><div class="l">Confirmed (going)</div></div>
      <div class="card stat"><div class="n">${money(conf.length * A.settings.price)}</div><div class="l">Expected total</div></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Trip</h2>
        <p><b>${esc(A.settings.destination)}</b><br><span class="muted">${esc(fmtDT(A.settings.trip_date))}</span></p>
        <p>Price per student: <b>${money(A.settings.price)}</b><br>Expected from confirmed: <b>${money(conf.length * A.settings.price)}</b></p></div>
      <div class="card"><h2>Attendance</h2>${CHECKPOINTS.map((c) => {
        const n = A.attendance.filter((a) => a.checkpoint === c.id && conf.some((s) => s.id === a.student_id)).length;
        const pct = conf.length ? Math.round(n / conf.length * 100) : 0;
        return `<div style="margin:10px 0"><div class="row between small"><span>${c.icon} ${c.label}</span><b>${n} / ${conf.length}</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
      }).join('')}</div>
    </div>`;
    el.insertAdjacentHTML('beforeend', `<div class="card row between"><div><b>Backup</b><div class="small muted">Download all data as an Excel file.</div></div><button class="btn sm" id="xlsx-ov">⬇ Excel backup</button></div>`);
    $('#xlsx-ov', el).onclick = (e) => busy(e.currentTarget, exportExcel);
    $$('[data-go]', el).forEach((b) => b.onclick = () => showTab(b.dataset.go));
  },
};

/* ---------- Payments ---------- */
const PayTab = {
  mount(el) { this.update(el); },
  update(el) {
    const F = [['pending', 'Pending'], ['confirmed', 'Confirmed'], ['rejected', 'Rejected'], ['unpaid', 'Not paid yet'], ['all', 'All']];
    const cnt = (k) => k === 'all' ? A.students.length : A.students.filter((s) => s.payment_status === k).length;
    let list = A.students.filter((s) => A.payFilter === 'all' || s.payment_status === A.payFilter);
    list = [...list].sort((a, b) => new Date(a.proof_submitted_at || a.created_at) - new Date(b.proof_submitted_at || b.created_at));
    el.innerHTML = `<div class="filters">${F.map(([k, l]) => `<button data-f="${k}" class="${A.payFilter === k ? 'on' : ''}">${l} (${cnt(k)})</button>`).join('')}</div>
    <div class="card">${list.length ? list.map((s) => `
      <div class="list-item" data-id="${s.id}">
        ${s.payment_proof_path ? `<img class="thumb" data-path="${esc(s.payment_proof_path)}" alt="Payment proof">` : '<div class="thumb"></div>'}
        <div class="grow"><div class="row"><b>${esc(s.full_name)}</b>${stStatusChip(s)}</div>
          <div class="small muted">${esc(s.roll_no)} · ${esc(s.phone || '')}</div>
          <div class="small muted">${s.proof_submitted_at ? 'Sent ' + esc(fmtDT(s.proof_submitted_at)) : 'No screenshot yet'}${s.payment_status === 'confirmed' ? ' · ' + money(s.paid_amount) : ''}</div>
          ${s.reject_reason ? `<div class="small" style="color:var(--red)">Reason: ${esc(s.reject_reason)}</div>` : ''}
          ${s.payment_status === 'pending' ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-act="ok">✓ Confirm ${money(A.settings.price)}</button><button class="btn danger sm" data-act="no">✗ Reject</button></div>` : ''}
          ${s.payment_status === 'confirmed' ? `<div style="margin-top:8px"><button class="btn ghost sm" data-act="no">Revoke</button></div>` : ''}
          ${s.payment_status === 'rejected' && s.payment_proof_path ? `<div style="margin-top:8px"><button class="btn sm" data-act="ok">Confirm anyway</button></div>` : ''}
        </div></div>`).join('') : '<p class="muted center">Nothing here.</p>'}</div>`;
    $$('.filters button', el).forEach((b) => b.onclick = () => { A.payFilter = b.dataset.f; this.update(el); });
    $$('img[data-path]', el).forEach(async (img) => {
      const p = img.dataset.path;
      if (!A.urls[p]) { const { data } = await sb.storage.from('payment-proofs').createSignedUrl(p, 3600); A.urls[p] = data && data.signedUrl; }
      if (A.urls[p]) img.src = A.urls[p];
      img.onclick = () => A.urls[p] && openModal(`<img class="full" src="${A.urls[p]}" alt="Payment proof"><button class="btn block" data-close>Close</button>`);
    });
    $$('[data-act]', el).forEach((b) => b.onclick = () => {
      const id = b.closest('[data-id]').dataset.id; const s = A.students.find((x) => x.id === id);
      if (b.dataset.act === 'ok') confirmPayment(s, b); else rejectPayment(s);
    });
  },
};
async function confirmPayment(s, btn) {
  await busy(btn, async () => {
    const { error } = await sb.from('students').update({ payment_status: 'confirmed', paid_amount: A.settings.price, confirmed_at: new Date().toISOString(), reject_reason: null }).eq('id', s.id);
    if (error) throw error;
    Object.assign(s, { payment_status: 'confirmed', paid_amount: A.settings.price, reject_reason: null });
    toast(`Confirmed ${s.full_name}`, 'ok'); refreshAdmin();
  });
}
function rejectPayment(s) {
  const m = openModal(`<h2>${s.payment_status === 'confirmed' ? 'Revoke' : 'Reject'} payment — ${esc(s.full_name)}</h2>
    <label>Reason (shown to the student)</label><textarea id="rr" placeholder="e.g. Amount is less than ${A.settings.price}, or screenshot is unclear"></textarea>
    <button class="btn danger block" id="rr-go">Submit</button><button class="btn ghost block" data-close>Cancel</button>`);
  $('#rr-go', m.el).onclick = (e) => busy(e.target, async () => {
    const reason = $('#rr', m.el).value.trim() || 'Payment could not be verified. Please upload a clear screenshot.';
    const { error } = await sb.from('students').update({ payment_status: 'rejected', reject_reason: reason, paid_amount: 0, confirmed_at: null }).eq('id', s.id);
    if (error) throw error;
    Object.assign(s, { payment_status: 'rejected', reject_reason: reason, paid_amount: 0 });
    m.close(); toast('Marked as rejected'); refreshAdmin();
  });
}

/* ---------- Attendance ---------- */
const AttTab = {
  mount(el) {
    el.innerHTML = `<div class="card"><h2>Mark attendance</h2>
      <div class="filters" id="cp-pick">${CHECKPOINTS.map((c) => `<button data-cp="${c.id}">${c.icon} ${c.label}</button>`).join('')}</div>
      <div class="tabs"><button data-m="scan">📷 Scan QR</button><button data-m="manual">✍️ Manual</button></div>
      <div id="att-body"></div></div>
      <div class="card"><div class="row between"><h2 id="att-title" style="margin:0"></h2><span id="att-count" class="chip green"></span></div>
      <input id="att-search" placeholder="Search name or roll number…" style="margin:12px 0">
      <div id="att-list"></div></div>`;
    $$('#cp-pick button', el).forEach((b) => b.onclick = () => { A.cp = b.dataset.cp; this.draw(el); });
    $$('.tabs button', el).forEach((b) => b.onclick = async () => { A.mode = b.dataset.m; await stopScanner(); this.draw(el); });
    $('#att-search', el).oninput = () => this.list(el);
    this.draw(el);
  },
  update(el) { this.list(el); },
  draw(el) {
    $$('#cp-pick button', el).forEach((b) => b.classList.toggle('on', b.dataset.cp === A.cp));
    $$('.tabs button', el).forEach((b) => b.classList.toggle('on', b.dataset.m === A.mode));
    const body = $('#att-body', el);
    if (A.mode === 'scan') {
      body.innerHTML = `<div id="reader"></div><div id="scan-res" class="scan-result hidden"></div>
        <div class="center"><button class="btn" id="scan-go">Start camera</button></div>
        <p class="muted small center">Marking: <b>${CHECKPOINTS.find((c) => c.id === A.cp).label}</b>. Allow camera access when asked.</p>`;
      $('#scan-go', el).onclick = (e) => busy(e.target, () => this.startScan(el));
    } else {
      body.innerHTML = `<p class="muted small">Tap a student below to mark / unmark <b>${CHECKPOINTS.find((c) => c.id === A.cp).label}</b>.</p>`;
    }
    this.list(el);
  },
  async startScan(el) {
    if (!window.Html5Qrcode) throw new Error('Scanner library failed to load. Check internet.');
    await stopScanner();
    A.scanner = new Html5Qrcode('reader');
    await A.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (t) => this.onScan(t, el), () => {});
    $('#scan-go', el).classList.add('hidden');
  },
  showRes(el, kind, big, small) {
    const r = $('#scan-res', el); if (!r) return;
    r.className = `scan-result ${kind}`; r.innerHTML = `<div class="big">${big}</div><div class="small">${small || ''}</div>`;
    try { navigator.vibrate && navigator.vibrate(kind === 'ok' ? 80 : [80, 60, 80]); } catch { /* ignore */ }
  },
  async onScan(text, el) {
    const now = Date.now();
    if (text === A.lastScan.t && now - A.lastScan.at < 3500) return;
    A.lastScan = { t: text, at: now };
    if (!text.startsWith(QR_PREFIX)) return this.showRes(el, 'bad', '❌ Not a trip QR code');
    const s = A.students.find((x) => x.qr_token === text.slice(QR_PREFIX.length));
    if (!s) return this.showRes(el, 'bad', '❌ Unknown QR code', 'Not registered, or list is outdated.');
    const cpLabel = CHECKPOINTS.find((c) => c.id === A.cp).label;
    if (s.payment_status !== 'confirmed') return this.showRes(el, 'bad', `⚠️ ${esc(s.full_name)}`, `Payment not confirmed (${s.payment_status}). Not marked.`);
    const r = await markAtt(s, A.cp);
    if (r === 'ok') this.showRes(el, 'ok', `✅ ${esc(s.full_name)}`, `${esc(s.roll_no)} · ${cpLabel}`);
    else if (r === 'dup') this.showRes(el, 'dup', `🔁 ${esc(s.full_name)}`, `Already marked for ${cpLabel}`);
    else this.showRes(el, 'bad', '❌ Could not save', 'Check your internet and scan again.');
    this.list(el);
  },
  list(el) {
    const q = ($('#att-search', el)?.value || '').toLowerCase().trim();
    const conf = confirmedStudents();
    const done = conf.filter((s) => hasAtt(s.id, A.cp)).length;
    $('#att-title', el).textContent = CHECKPOINTS.find((c) => c.id === A.cp).label;
    $('#att-count', el).textContent = `${done} / ${conf.length} marked`;
    const rows = conf.filter((s) => !q || s.full_name.toLowerCase().includes(q) || s.roll_no.toLowerCase().includes(q))
      .sort((a, b) => hasAtt(a.id, A.cp) - hasAtt(b.id, A.cp) || a.full_name.localeCompare(b.full_name));
    $('#att-list', el).innerHTML = rows.length ? rows.map((s) => {
      const m = hasAtt(s.id, A.cp);
      return `<div class="list-item" data-id="${s.id}"><div class="grow"><b>${esc(s.full_name)}</b><div class="small muted">${esc(s.roll_no)}</div></div>
        <button class="btn sm ${m ? 'ghost' : ''}" data-tog="${m ? 'off' : 'on'}">${m ? '✓ Marked · Undo' : 'Mark present'}</button></div>`;
    }).join('') : '<p class="muted center">No confirmed students match.</p>';
    $$('[data-tog]', $('#att-list', el)).forEach((b) => b.onclick = () => busy(b, async () => {
      const s = A.students.find((x) => x.id === b.closest('[data-id]').dataset.id);
      if (b.dataset.tog === 'on') await markAtt(s, A.cp); else await unmarkAtt(s, A.cp);
      this.list(el);
    }));
  },
};
async function markAtt(s, cp) {
  if (hasAtt(s.id, cp)) return 'dup';
  const { error } = await sb.from('attendance').insert({ student_id: s.id, checkpoint: cp });
  if (error) return error.code === '23505' ? 'dup' : 'err';
  A.attendance.push({ student_id: s.id, checkpoint: cp, created_at: new Date().toISOString() });
  return 'ok';
}
async function unmarkAtt(s, cp) {
  const { error } = await sb.from('attendance').delete().eq('student_id', s.id).eq('checkpoint', cp);
  if (error) throw error;
  A.attendance = A.attendance.filter((a) => !(a.student_id === s.id && a.checkpoint === cp));
}

/* ---------- Alerts ---------- */
const AlertsTab = {
  mount(el) {
    el.innerHTML = `<div class="card"><h2>📢 Send an alert to all students</h2>
      <p class="muted small">Appears instantly on every confirmed student's dashboard.</p>
      <textarea id="al-msg" placeholder="e.g. Bus leaves at 7:30 AM sharp from the main gate. Bring water and ID card."></textarea>
      <button class="btn block" id="al-send">Send to all students</button></div>
      <div class="card"><h2>Sent messages</h2><div id="al-hist"></div></div>`;
    $('#al-send', el).onclick = (e) => busy(e.target, async () => {
      const msg = $('#al-msg', el).value.trim(); if (!msg) throw new Error('Type a message first.');
      const { error } = await sb.from('alerts').insert({ message: msg });
      if (error) throw error;
      $('#al-msg', el).value = ''; toast(`Sent to ${confirmedStudents().length} students`, 'ok');
    });
    this.update(el);
  },
  update(el) {
    $('#al-hist', el).innerHTML = A.alerts.length ? A.alerts.map((a) => `<div class="msg">${esc(a.message)}<time>${esc(fmtDT(a.created_at))} · <a href="#" data-del="${a.id}">delete</a></time></div>`).join('') : '<p class="muted">No messages sent yet.</p>';
    $$('[data-del]', el).forEach((b) => b.onclick = async (e) => { e.preventDefault();
      if (!confirm('Delete this message for everyone?')) return;
      const { error } = await sb.from('alerts').delete().eq('id', +b.dataset.del); if (error) toast(error.message, 'err'); });
  },
};

/* ---------- Emergencies ---------- */
const SosTab = {
  mount(el) { this.update(el); },
  update(el) {
    el.innerHTML = `<div class="card"><h2>🚨 Emergency alerts</h2>${A.emergencies.length ? A.emergencies.map((e) => {
      const s = e.students || {};
      return `<div class="list-item" style="${e.resolved ? 'opacity:.6' : ''}"><div class="grow">
        <div class="row"><b>${esc(s.full_name)}</b><span class="small muted">${esc(s.roll_no)}</span><span class="chip ${e.resolved ? 'green' : 'red'}">${e.resolved ? 'Handled' : 'OPEN'}</span></div>
        <div class="small muted">${esc(fmtDT(e.created_at))}</div>
        ${e.message ? `<div class="alert-box red">${esc(e.message)}</div>` : ''}
        <div class="row small" style="margin-top:6px"><a class="btn ghost sm" href="tel:${telDigits(s.phone)}">📞 Student ${esc(s.phone)}</a>
          <a class="btn ghost sm" href="tel:${telDigits(s.emergency_phone)}">📞 ${esc(s.relation)} ${esc(s.emergency_phone)}</a>
          ${e.lat ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://maps.google.com/?q=${e.lat},${e.lng}">📍 Location</a>` : ''}</div>
        ${e.resolved ? '' : `<button class="btn sm" style="margin-top:8px" data-res="${e.id}">Mark as handled</button>`}</div></div>`;
    }).join('') : '<p class="muted center">No emergencies. 🎉</p>'}</div>`;
    $$('[data-res]', el).forEach((b) => b.onclick = () => busy(b, async () => {
      const { error } = await sb.from('emergencies').update({ resolved: true }).eq('id', +b.dataset.res); if (error) throw error;
      const e = A.emergencies.find((x) => x.id === +b.dataset.res); if (e) e.resolved = true; refreshAdmin();
    }));
  },
};

/* ---------- Students ---------- */
const StudentsTab = {
  mount(el) {
    el.innerHTML = `<div class="card"><div class="row between"><h2 style="margin:0">All students</h2><button class="btn sm" id="xlsx">⬇ Excel backup</button></div>
      <input id="stu-q" placeholder="Search name, roll or phone…" style="margin:12px 0"><div id="stu-list"></div></div>`;
    $('#stu-q', el).oninput = () => this.update(el);
    $('#xlsx', el).onclick = (e) => busy(e.currentTarget, exportExcel);
    this.update(el);
  },
  update(el) {
    const q = ($('#stu-q', el).value || '').toLowerCase().trim();
    const rows = A.students.filter((s) => !q || [s.full_name, s.roll_no, s.phone].some((v) => String(v || '').toLowerCase().includes(q)));
    $('#stu-list', el).innerHTML = rows.length ? rows.map((s) => `<div class="list-item" data-id="${s.id}" style="cursor:pointer">
      <div class="grow"><b>${esc(s.full_name)}</b> ${stStatusChip(s)}<div class="small muted">${esc(s.roll_no)} · ${esc(s.phone || '')}</div></div>
      <div class="small">${CHECKPOINTS.map((c) => hasAtt(s.id, c.id) ? c.icon : '·').join(' ')}</div></div>`).join('') : '<p class="muted center">No students found.</p>';
    $$('[data-id]', el).forEach((r) => r.onclick = () => studentModal(A.students.find((x) => x.id === r.dataset.id)));
  },
};
function studentModal(s) {
  openModal(`<h2>${esc(s.full_name)}</h2><p>${stStatusChip(s)} <span class="muted">Roll ${esc(s.roll_no)}</span></p>
    <div class="copy-row"><div><div class="muted small">Mobile</div><a href="tel:${telDigits(s.phone)}"><b>${esc(s.phone)}</b></a></div></div>
    <div class="copy-row"><div><div class="muted small">Emergency contact (${esc(s.relation)})</div><b>${esc(s.emergency_name || '')}</b> <a href="tel:${telDigits(s.emergency_phone)}"><b>${esc(s.emergency_phone)}</b></a></div></div>
    <div class="copy-row"><div><div class="muted small">Registered</div>${esc(fmtDT(s.created_at))}</div></div>
    <h3 style="margin-top:14px">Attendance</h3>
    ${CHECKPOINTS.map((c) => `<div>${hasAtt(s.id, c.id) ? '✅' : '⬜'} ${c.label}</div>`).join('')}
    <button class="btn block" data-close>Close</button>`);
}
async function exportExcel() {
  if (!window.XLSX) throw new Error('Excel library failed to load. Check your internet and try again.');
  await loadAdminData(); // always export the latest data from the database
  const sheet = (rows, widths) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'No data' }]);
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    return ws;
  };
  const when = (d) => (d ? fmtDT(d) : '');
  const byId = Object.fromEntries(A.students.map((s) => [s.id, s]));
  const cpLabel = Object.fromEntries(CHECKPOINTS.map((c) => [c.id, c.label]));

  const students = A.students.map((s) => {
    const row = {
      Name: s.full_name, 'Roll number': s.roll_no, Phone: s.phone || '',
      'Emergency contact': s.emergency_name || '', Relation: s.relation, 'Emergency phone': s.emergency_phone,
      'Payment status': s.payment_status, 'Amount paid': s.paid_amount || 0,
      'Proof sent': when(s.proof_submitted_at), 'Confirmed at': when(s.confirmed_at), 'Reject reason': s.reject_reason || '',
      Registered: when(s.created_at),
    };
    CHECKPOINTS.forEach((c) => { const a = A.attendance.find((x) => x.student_id === s.id && x.checkpoint === c.id); row[c.label] = a ? when(a.created_at) : ''; });
    return row;
  });
  const attendance = [...A.attendance].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((a) => ({
    Time: when(a.created_at), Checkpoint: cpLabel[a.checkpoint] || a.checkpoint,
    Name: byId[a.student_id]?.full_name || '', 'Roll number': byId[a.student_id]?.roll_no || '',
  }));
  const emergencies = A.emergencies.map((e) => ({
    Time: when(e.created_at), Name: e.students?.full_name || '', 'Roll number': e.students?.roll_no || '',
    Phone: e.students?.phone || '', 'Emergency phone': e.students?.emergency_phone || '', Note: e.message || '',
    Location: e.lat ? `https://maps.google.com/?q=${e.lat},${e.lng}` : '', Status: e.resolved ? 'Handled' : 'Open',
  }));
  const alerts = A.alerts.map((a) => ({ Time: when(a.created_at), Message: a.message }));
  const conf = confirmedStudents();
  const summary = [
    { Item: 'Exported at', Value: fmtDT(new Date()) },
    { Item: 'Trip', Value: A.settings.trip_name }, { Item: 'Destination', Value: A.settings.destination },
    { Item: 'Trip date', Value: when(A.settings.trip_date) }, { Item: 'Price per student', Value: A.settings.price },
    { Item: 'Registered students', Value: A.students.length }, { Item: 'Confirmed students', Value: conf.length },
    { Item: 'Pending verifications', Value: pendingCount() },
    { Item: 'Money collected', Value: conf.reduce((n, s) => n + (s.paid_amount || 0), 0) },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(summary, [26, 40]), 'Summary');
  XLSX.utils.book_append_sheet(wb, sheet(students, [24, 16, 15, 20, 11, 16, 14, 12, 20, 20, 24, 20, 20, 20, 20, 20]), 'Students');
  XLSX.utils.book_append_sheet(wb, sheet(attendance, [20, 22, 24, 16]), 'Attendance log');
  XLSX.utils.book_append_sheet(wb, sheet(emergencies, [20, 24, 16, 15, 16, 36, 42, 10]), 'Emergencies');
  XLSX.utils.book_append_sheet(wb, sheet(alerts, [20, 90]), 'Alerts sent');
  XLSX.writeFile(wb, `trail5-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast('Backup downloaded', 'ok');
  refreshAdmin();
}

/* ---------- Settings ---------- */
const SettingsTab = {
  mount(el) {
    const s = A.settings;
    const local = (iso) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
    el.innerHTML = `<form class="card" id="set-form"><h2>Trip settings</h2>
      <div class="grid2 stack-sm"><div><label>Price per student (${CUR})</label><input name="price" type="number" min="0" required value="${s.price}"></div>
      <div><label>Trip date & time</label><input name="trip_date" type="datetime-local" required value="${local(s.trip_date)}"></div></div>
      <label>Trip name</label><input name="trip_name" value="${esc(s.trip_name)}">
      <label>Destination</label><input name="destination" value="${esc(s.destination)}">
      <label>Meeting point</label><input name="meeting_point" value="${esc(s.meeting_point || '')}">
      <label>Plan / what to bring</label><textarea name="itinerary">${esc(s.itinerary || '')}</textarea>
      <label>Organizer contact numbers (shown to students)</label><textarea name="organizer_contacts" placeholder="Ali — 03XX-XXXXXXX&#10;Sara — 03XX-XXXXXXX">${esc(s.organizer_contacts || '')}</textarea>
      <h3 style="margin-top:18px">Payment account</h3>
      <label>Bank / wallet name</label><input name="bank_name" value="${esc(s.bank_name || '')}" placeholder="e.g. JazzCash / Meezan Bank">
      <label>Account title</label><input name="account_title" value="${esc(s.account_title || '')}">
      <label>Account number / IBAN</label><input name="account_number" value="${esc(s.account_number || '')}">
      <label>Note for students</label><input name="payment_note" value="${esc(s.payment_note || '')}">
      <p class="alert-box amber small">Changing the price affects students who have not paid yet. Already-confirmed payments keep the amount recorded at confirmation.</p>
      <button class="btn block" type="submit">Save settings</button></form>`;
    $('#set-form', el).onsubmit = (e) => {
      e.preventDefault(); const f = e.target;
      busy($('button', f), async () => {
        const upd = { price: parseInt(f.price.value, 10), trip_date: new Date(f.trip_date.value).toISOString(),
          trip_name: f.trip_name.value.trim(), destination: f.destination.value.trim(), meeting_point: f.meeting_point.value.trim(),
          itinerary: f.itinerary.value, organizer_contacts: f.organizer_contacts.value, bank_name: f.bank_name.value.trim(),
          account_title: f.account_title.value.trim(), account_number: f.account_number.value.trim(), payment_note: f.payment_note.value.trim() };
        const { data, error } = await sb.from('settings').update(upd).eq('id', 1).select().single();
        if (error) throw error;
        A.settings = data; toast('Settings saved', 'ok');
      });
    };
  },
};

const TAB_FN = { overview: OverviewTab, payments: PayTab, attendance: AttTab, alerts: AlertsTab, sos: SosTab, students: StudentsTab, settings: SettingsTab };

boot();
