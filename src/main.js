import './style.css';
import * as THREE from 'three';
import { createCube } from './cube.js';
import { getPalette, applyPalette } from './palettes.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(hover: none)').matches || matchMedia('(pointer: coarse)').matches;
const pad2 = (n) => String(n).padStart(2, '0');
const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';

// ---------- data ----------
async function getJSON(url, fallback) {
  try { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw 0; return await r.json(); } catch { return fallback; }
}
const params = new URLSearchParams(location.search);
// dev only: ?works=/dev-fixtures/works.json to try the site with sample works
const worksUrl = import.meta.env.DEV && params.get('works') ? params.get('works') : '/works.json';
const base = worksUrl.slice(0, worksUrl.lastIndexOf('/') + 1);
const abs = (p) => (!p ? '' : /^(https?:)?\//.test(p) ? p : base + p);

const [site, rawWorks] = await Promise.all([getJSON('/site.json', {}), getJSON(worksUrl, [])]);
const works = (Array.isArray(rawWorks) ? rawWorks : [])
  .filter((w) => w && w.video)
  .map((w, i) => ({ ...w, i, video: abs(w.video), poster: abs(w.poster), preview: abs(w.preview), title: w.title || 'Untitled' }));

// palette: site.json "palette", or ?palette=<name> to try another
const palette = getPalette(params.get('palette') || site.palette || 'ink');
applyPalette(palette);

const metaLine = (w) => [w.client, w.type, w.format].filter(Boolean).join(' · ');

// ---------- links ----------
for (const a of $$('.js-x')) if (site.x) a.href = site.x;
$('#worksCount').textContent = pad2(works.length);
$('#worksCount2').textContent = pad2(works.length);
$('#worksCount3').textContent = pad2(works.length);
if (!works.length) {
  $('.hint--fine').innerHTML = '<b>Drag</b> a cell to twist · <b>drag</b> around to turn<br />First projects coming soon';
  $('.hint--touch').innerHTML = '<b>Swipe</b> to turn · projects coming soon';
}

// ---------- works list (phone + below the cube on desktop) ----------
const list = $('#worksList');
function renderList() {
  list.innerHTML = '';
  works.forEach((w, n) => {
    const li = document.createElement('li');
    li.className = 'work bend';
    li.innerHTML = `<button class="work__btn" type="button">
        <span class="work__i">${pad2(n + 1)}</span>
        <span class="work__thumb"></span>
        <span><span class="work__t"></span><span class="work__m"></span></span>
        <span class="work__f"></span>
        <span class="work__play" aria-hidden="true">▶</span>
      </button>`;
    $('.work__t', li).textContent = w.title;
    $('.work__m', li).textContent = [w.client, w.type].filter(Boolean).join(' · ');
    $('.work__f', li).textContent = w.format || '';
    $('.work__btn', li).setAttribute('aria-label', `Play ${w.title}${w.client ? ' — ' + w.client : ''}`);
    const thumb = $('.work__thumb', li);
    if (w.poster) thumb.style.backgroundImage = `url("${w.poster}")`;
    w.thumbEl = thumb;
    if (w.preview && !isTouch) {
      const v = document.createElement('video');
      Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'none' });
      v.src = w.preview; thumb.appendChild(v);
      const b = $('.work__btn', li);
      b.addEventListener('pointerenter', () => v.play().catch(() => {}));
      b.addEventListener('pointerleave', () => v.pause());
    }
    $('.work__btn', li).addEventListener('click', (e) => openPlayer(w, { x: e.clientX || innerWidth / 2, y: e.clientY || innerHeight / 2 }));
    list.appendChild(li);
  });
  for (let k = works.length; k < Math.max(3, works.length); k++) {
    const li = document.createElement('li');
    li.className = 'work work--soon bend';
    li.innerHTML = `<button class="work__btn" type="button" disabled>
        <span class="work__i">${pad2(k + 1)}</span><span class="work__thumb"></span>
        <span><span class="work__t">Coming soon</span><span class="work__m">Slot ${pad2(k + 1)}</span></span>
        <span class="work__f"></span><span class="work__play">▶</span></button>`;
    list.appendChild(li);
  }
}
renderList();

// ---------- loader ----------
const loaderBar = $('#loaderBar'), loaderPct = $('#loaderPct');
let total = 1, done = 0;
const tick = () => { done++; const p = Math.min(1, done / total); loaderBar.style.transform = `scaleX(${p})`; loaderPct.textContent = String(Math.round(p * 100)).padStart(3, '0'); };

// textures: poster image, else a frame grabbed from the preview / video
const texLoader = new THREE.TextureLoader();
function grabFrame(src) {
  return new Promise((res) => {
    const v = document.createElement('video');
    Object.assign(v, { muted: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
    const fail = () => res(null);
    v.addEventListener('error', fail, { once: true });
    v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); }, { once: true });
    v.addEventListener('seeked', () => {
      const S = 512, c = document.createElement('canvas');
      const a = v.videoWidth / v.videoHeight; c.width = a >= 1 ? S : Math.round(S * a); c.height = a >= 1 ? Math.round(S / a) : S;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      res(c);
    }, { once: true });
    v.src = src;
    setTimeout(fail, 8000);
  });
}
async function loadWorkTexture(w) {
  let tex = null;
  try {
    if (w.poster) tex = await texLoader.loadAsync(w.poster);
    else {
      const c = await grabFrame(w.preview || w.video);
      if (c) { tex = new THREE.CanvasTexture(c); w.thumbEl && (w.thumbEl.style.backgroundImage = `url("${c.toDataURL('image/jpeg', 0.8)}")`); }
    }
  } catch { tex = null; }
  if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; }
  tick();
  return tex;
}

// ---------- cube ----------
let cube = null;
try {
  cube = createCube($('#gl'), { palette, reducedMotion, isTouch });
} catch (e) {
  console.warn('WebGL unavailable', e);
  document.body.classList.add('no-gl');
  $('#gl').style.display = 'none';
}

if (cube) {
  if (import.meta.env.DEV) window.__cube = cube;
  total = 1 + Math.min(works.length, 54);
  cube.resize();
  addEventListener('resize', () => { cube.resize(); onScroll(); });
  document.addEventListener('visibilitychange', onScroll);
}

await Promise.all([
  document.fonts.ready.then(tick),
  cube ? cube.setWorks(works, loadWorkTexture) : Promise.resolve(),
  new Promise((r) => setTimeout(r, reducedMotion ? 0 : 700)),
]);
loaderBar.style.transform = 'scaleX(1)'; loaderPct.textContent = '100';

// ---------- intro ----------
const loader = $('#loader');
loader.classList.add('is-done');
setTimeout(() => loader.remove(), 1300);
setTimeout(() => {
  document.body.classList.add('is-in');
  cube?.reveal();
  if (!reducedMotion) {
    $$('.mask-lines .line > span').forEach((el, i) => el.animate(
      [{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }],
      { duration: 1100, delay: i * 90, easing: EXPO, fill: 'forwards' },
    ));
    $$('.reveal').forEach((el, i) => { el.style.transitionDelay = `${300 + i * 90}ms`; });
  }
}, reducedMotion ? 0 : 350);

// ---------- tooltip (native cursor; the tip moves with the pointer event itself, no lag) ----------
const tip = $('#tip');
let tipOn = false;
let lastPointer = { x: 0, y: 0 };
function placeTip(x, y) {
  const tx = Math.min(x + 22, innerWidth - 270), ty = Math.min(y + 20, innerHeight - 110);
  tip.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
}
addEventListener('pointermove', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; if (tipOn) placeTip(e.clientX, e.clientY); }, { passive: true });
let hoverVideo = null;
if (cube) {
  cube.onHover = (screen, data) => {
    const w = screen ? data.work : null;
    tipOn = !!w && !isTouch;
    if (tipOn) { placeTip(lastPointer.x, lastPointer.y); tip.style.setProperty('--cell', data.color); }
    tip.classList.toggle('is-on', tipOn);
    if (hoverVideo) { hoverVideo.el.pause(); cube.setScreenTexture(hoverVideo.screen, hoverVideo.screen.userData.poster); hoverVideo = null; }
    if (!w) return;
    $('.tip__t', tip).textContent = w.title;
    $('.tip__m', tip).textContent = metaLine(w);
    $('.tip__p', tip).textContent = '▶ Click to play';
    // short silent preview plays on the hovered cell
    if ((w.preview || w.video) && !reducedMotion) {
      if (!w._pv) {
        const v = document.createElement('video');
        Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
        v.src = w.preview || w.video;
        const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace;
        w._pv = { el: v, tex: t };
      }
      const pv = w._pv;
      hoverVideo = { el: pv.el, screen };
      pv.el.play().then(() => { if (hoverVideo && hoverVideo.screen === screen) cube.setScreenTexture(screen, pv.tex); }).catch(() => {});
    }
  };
  cube.onOpen = (w, at) => openPlayer(w, at);

  // solve / shuffle button; its icon is a tiny face: mixed up, or one colour when solved
  const btn = $('#solve'), label = $('.solve__label', btn), ico = $('.solve__ico', btn);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mixed = Array.from({ length: 9 }, () => cube.faces[Math.floor(rnd() * 6)]);
  ico.innerHTML = '<i></i>'.repeat(9);
  const cells = $$('i', ico);
  const setState = ({ solved, busy }) => {
    btn.disabled = !!busy;
    label.textContent = busy === 'solve' ? 'Solving…' : busy === 'shuffle' ? 'Shuffling…' : solved ? 'Shuffle' : 'Solve the cube';
    btn.classList.toggle('is-solved', solved && !busy);
    const one = solved || busy === 'solve';
    cells.forEach((el, i) => { el.style.background = one ? cube.faces[4] : mixed[i]; });
  };
  cube.onState = setState;
  setState(cube.state());
  btn.addEventListener('click', () => (cube.state().solved ? cube.shuffle() : cube.solve()));
}

// ---------- scroll: the page scrolls normally; the cube rises, then leaves upwards ----------
let lastY = scrollY, vel = 0;
const bar = $('#cubebar'), worksEl = $('#works');
const ramp = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
function onScroll() {
  const s = scrollY / innerHeight;
  vel += scrollY - lastY; lastY = scrollY;
  document.body.classList.toggle('is-scrolled', s > 1.3);
  if (!cube) return;
  cube.setScroll(s);
  // render only while the cube can be seen
  if (s < 2.1 && !document.hidden) cube.start(); else cube.stop();
  // solve button + hint: visible while the cube is in the middle
  // ...and it steps aside before the list reaches it
  const listTop = worksEl.getBoundingClientRect().top, barTop = innerHeight - bar.offsetHeight - 48;
  const o = Math.min(ramp(s, 0.3, 0.6), ramp(listTop, barTop + 10, barTop + 110));
  bar.style.opacity = o.toFixed(3);
  bar.style.visibility = o > 0.01 ? 'visible' : 'hidden';
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

let bendV = 0, bent = false;
function ui() {
  // sections bend like paper with scroll speed
  bendV += (vel - bendV) * 0.18; vel *= 0.6;
  const v = Math.max(-60, Math.min(60, bendV));
  if (!reducedMotion && (Math.abs(v) >= 0.2 || bent)) {
    const H = innerHeight;
    // read every rect first, then write: no forced layout per element
    const rects = bendEls.map((el) => el.getBoundingClientRect());
    bent = Math.abs(v) >= 0.2;
    bendEls.forEach((el, i) => {
      const r = rects[i];
      if (bent && (r.bottom < -50 || r.top > H + 50)) return;
      const d = ((r.top + r.height / 2) / H - 0.5) * 2; // -1 top .. 1 bottom
      el.style.transform = bent ? `perspective(900px) translateZ(${-Math.abs(v) * 0.6 * (1 - Math.abs(d) * 0.4)}px) rotateX(${(-v * 0.32 * d).toFixed(2)}deg)` : '';
    });
  }
  requestAnimationFrame(ui);
}
let bendEls = $$('.bend');
requestAnimationFrame(ui);

// ---------- player ----------
const player = $('#player'), pv = $('#playerVideo');
let lastFocus = null;
function openPlayer(w, at) {
  lastFocus = document.activeElement;
  $('#playerTitle').textContent = w.title;
  $('#playerMeta').textContent = metaLine(w);
  pv.src = w.video;
  if (w.poster) pv.poster = w.poster; else pv.removeAttribute('poster');
  player.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  if (!reducedMotion) {
    const R = Math.hypot(Math.max(at.x, innerWidth - at.x), Math.max(at.y, innerHeight - at.y));
    player.animate([{ clipPath: `circle(0px at ${at.x}px ${at.y}px)` }, { clipPath: `circle(${R}px at ${at.x}px ${at.y}px)` }], { duration: 650, easing: EXPO });
  }
  pv.currentTime = 0;
  pv.play().catch(() => {});
  $('#playerClose').focus();
}
function closePlayer() {
  if (player.hidden) return;
  pv.pause();
  const done = () => { player.hidden = true; pv.removeAttribute('src'); pv.load(); document.documentElement.style.overflow = ''; lastFocus?.focus?.(); };
  if (reducedMotion) done();
  else player.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease-out' }).onfinish = done;
}
$('#playerClose').addEventListener('click', closePlayer);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePlayer(); closeMail(); } });

// ---------- contact: the email slides up from the bottom ----------
const mail = $('#mail'), mailLink = $('#mailLink'), mailCopy = $('#mailCopy');
if (site.email) { mailLink.textContent = site.email; mailLink.href = `mailto:${site.email}`; }
function openMail(e) {
  if (!site.email) return; // no address yet: the link just jumps to the footer
  e.preventDefault();
  e.stopPropagation();
  mail.classList.add('is-open');
  mail.setAttribute('aria-hidden', 'false');
  mailCopy.textContent = 'Copy';
  mailLink.focus({ preventScroll: true });
}
function closeMail() {
  if (!mail.classList.contains('is-open')) return;
  mail.classList.remove('is-open');
  mail.setAttribute('aria-hidden', 'true');
}
for (const a of $$('.js-contact')) a.addEventListener('click', openMail);
$('#mailClose').addEventListener('click', closeMail);
mailCopy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(site.email); mailCopy.textContent = 'Copied'; } catch { mailLink.click(); }
});
document.addEventListener('pointerdown', (e) => { if (!mail.contains(e.target) && !e.target.closest('.js-contact')) closeMail(); });
