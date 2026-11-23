// Renders the concept stills: node concepts/shoot.mjs  -> concepts/out/*.png
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files', pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', local = process.env.LOCALAPPDATA || '';
  return [`${pf}\\Google\\Chrome\\Application\\chrome.exe`, `${pf86}\\Google\\Chrome\\Application\\chrome.exe`, `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`, `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`].find((p) => fs.existsSync(p));
}

const server = await createServer({ root: path.join(here, '..'), server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization'] });

const shots = (process.argv[2] || 'A,B,C').split(',').flatMap((v) => [
  { v, name: `concept_${v}_desktop.png`, vp: { width: 1920, height: 1080, deviceScaleFactor: 1 } },
  { v, name: `concept_${v}_phone.png`, vp: { width: 390, height: 844, deviceScaleFactor: 2 }, full: true },
]);

for (const s of shots) {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log(s.name, m.text()); });
  page.on('pageerror', (e) => console.log(s.name, e.message));
  await page.setViewport(s.vp);
  await page.goto(`http://localhost:5199/concepts/?v=${s.v}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__ready === true', { timeout: 60000 });
  await page.screenshot({ path: path.join(out, s.name), fullPage: !!s.full });
  console.log('ok', s.name);
  await page.close();
}
await browser.close();
await server.close();
