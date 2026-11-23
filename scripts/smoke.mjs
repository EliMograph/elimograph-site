// Smoke test against a running dev server (npm run dev): cube integrity after many twists + screenshots.
//   node scripts/smoke.mjs [http://localhost:5173]   -> dev-fixtures/shots/*.png
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const url = (process.argv[2] || 'http://localhost:5173') + '/?works=/dev-fixtures/works.json';
const out = path.resolve('dev-fixtures/shots');
fs.mkdirSync(out, { recursive: true });
const pf = process.env.PROGRAMFILES || 'C:\\Program Files', pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
const exe = process.env.CHROME_PATH || [`${pf}\\Google\\Chrome\\Application\\chrome.exe`, `${pf86}\\Google\\Chrome\\Application\\chrome.exe`, `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
let ok = true;

async function open(vp) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport(vp);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__cube && document.body.classList.contains("is-in")', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2200));
  await page.evaluate(() => window.scrollTo(0, innerHeight * 0.8)); // cube in the middle
  await new Promise((r) => setTimeout(r, 300));
  return page;
}

// desktop
const page = await open({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.screenshot({ path: path.join(out, 'desktop_hero.png') });
const res = await page.evaluate(async () => {
  const d = window.__cube._debug;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 30; i++) { while (d.st.twist) await wait(16); d.startAnimMove(0.05); await wait(20); }
  while (d.st.twist) await wait(16);
  const keys = d.cubies.map((c) => d.coordOf(c).join(','));
  const offGrid = d.cubies.filter((c) => ['x', 'y', 'z'].some((a) => Math.abs(c.position[a] / d.gap - Math.round(c.position[a] / d.gap)) > 1e-6)).length;
  // every screen must still face outwards: its normal points away from the cube centre
  const outward = d.screens.filter((s) => {
    const n = s.getWorldDirection(new s.position.constructor()); const p = s.getWorldPosition(new s.position.constructor());
    const c = s.parent.parent.getWorldPosition(new s.position.constructor());
    return n.dot(p.sub(c)) > 0;
  }).length;
  return { cubies: d.cubies.length, unique: new Set(keys).size, centre: keys.includes('0,0,0'), offGrid, outward, screens: d.screens.length };
});
console.log('after 30 twists:', res);
if (res.unique !== 26 || res.centre || res.offGrid || res.outward !== 54) ok = false;

// drag-twist on a cell: find a screen's screen position and drag across it
await page.evaluate(async () => { const d = window.__cube._debug; while (d.st.twist) await new Promise((r) => setTimeout(r, 16)); d.st.lastInteract = d.st.time + 30; });
const pt = await page.evaluate(() => { const d = window.__cube._debug; const V = d.screens[0].position.constructor; const s = d.screens.filter((x) => x.userData.work).map((x) => ({ x, f: x.getWorldDirection(new V()).z })).sort((a, b) => b.f - a.f)[0].x; return window.__cube.screenRect(s); });
await page.mouse.move(pt.x, pt.y); await page.mouse.down();
for (let i = 1; i <= 12; i++) await page.mouse.move(pt.x + i * 12, pt.y + i * 1.5);
const during = await page.evaluate(() => { const t = window.__cube._debug.st.twist; return t && { axis: t.axis, layer: t.layer, angle: +t.angle.toFixed(2), mode: t.mode }; });
await page.screenshot({ path: path.join(out, 'desktop_dragtwist.png') });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 700));
console.log('drag twist:', during, '→ after release twist =', await page.evaluate(() => window.__cube._debug.st.twist));
if (!during || during.mode !== 'drag') ok = false;

// hover a work cell: tooltip + preview
const pt2 = await page.evaluate(() => { const d = window.__cube._debug; const V = d.screens[0].position.constructor; const s = d.screens.filter((x) => x.userData.work).map((x) => ({ x, f: x.getWorldDirection(new V()).z })).sort((a, b) => b.f - a.f)[0].x; return window.__cube.screenRect(s); });
await page.mouse.move(pt2.x - 5, pt2.y - 5); await page.mouse.move(pt2.x, pt2.y);
await new Promise((r) => setTimeout(r, 900));
const tip = await page.evaluate(() => ({ on: document.getElementById('tip').classList.contains('is-on'), t: document.querySelector('.tip__t').textContent }));
console.log('hover tip:', tip);
await page.screenshot({ path: path.join(out, 'desktop_hover.png') });
// click opens the player
await page.mouse.click(pt2.x, pt2.y);
await new Promise((r) => setTimeout(r, 900));
const pl = await page.evaluate(() => ({ open: !document.getElementById('player').hidden, src: document.getElementById('playerVideo').currentSrc, title: document.getElementById('playerTitle').textContent }));
console.log('player:', pl);
await page.screenshot({ path: path.join(out, 'desktop_player.png') });
if (!pl.open) ok = false;
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 500));
// scroll: twists + bent list
await page.evaluate(() => window.scrollTo(0, 0));
for (let i = 0; i < 14; i++) { await page.mouse.wheel({ deltaY: 120 }); await new Promise((r) => setTimeout(r, 30)); }
await new Promise((r) => setTimeout(r, 120));
await page.screenshot({ path: path.join(out, 'desktop_scroll.png') });
await page.evaluate(() => document.getElementById('works').scrollIntoView());
for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: 160 }); await new Promise((r) => setTimeout(r, 16)); }
await page.screenshot({ path: path.join(out, 'desktop_works_bend.png') });
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: path.join(out, 'desktop_works.png') });
await page.close();

// phone
const ph = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ph.screenshot({ path: path.join(out, 'phone_full.png'), fullPage: true });
await ph.close();

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
process.exit(ok && !errors.length ? 0 : 1);
