// Concept stills: one cube, three looks. ?v=A|B|C
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search);
const V = (q.get('v') || 'A').toUpperCase();
const ACC = new THREE.Color('#FF4A1C');

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const WORKS = [
  { t: 'elimograph', c: 'Brand intro', f: '9:16', img: 'frames/w1.jpg' },
  { t: 'elimograph', c: 'Brand intro', f: '9:16', img: 'frames/w2.jpg' },
  { t: 'Ploto', c: 'Launch teaser', f: '9:16', img: 'frames/w3.jpg' },
  { t: 'Ploto', c: 'Launch teaser', f: '9:16', img: 'frames/w4.jpg' },
  { t: 'BewertungsFlow', c: 'Product teaser', f: '9:16', img: 'frames/w5.jpg' },
  { t: 'BewertungsFlow', c: 'Product teaser', f: '9:16', img: 'frames/w6.jpg' },
  { t: 'Cova', c: 'Launch teaser', f: '9:16', img: 'frames/w7.jpg' },
  { t: 'Cova', c: 'Launch teaser', f: '9:16', img: 'frames/w8.jpg' },
];

const LOOK = {
  A: { gap: 1.035, bloom: [1.0, 0.55, 1.0], exposure: 1 },
  B: { gap: 1.07, bloom: [1.1, 0.45, 1.0], exposure: 1 },
  C: { gap: 1.2, bloom: [1.1, 0.7, 1.0], exposure: 1 },
}[V];

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');
const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
camera.position.set(0, 0, 17);

const isPhone = innerWidth < 760;

// ---------- textures ----------
const loader = new THREE.TextureLoader();
const loadTex = (u) => new Promise((r) => loader.load(u, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; r(t); }));

function placeholderTex(n) {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#070505'; g.fillRect(0, 0, S, S);
  if (V === 'B') {
    // B is dotted in the shader; give it a bright glyph to sample
    g.fillStyle = 'rgba(255,74,28,0.22)'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.36, 0, 7); g.fill();
    g.fillStyle = '#FF4A1C'; g.font = '900 150px Disp'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n).padStart(2, '0'), S / 2, S / 2 + 6);
  } else {
    const rg = g.createRadialGradient(S / 2, S * 0.55, 10, S / 2, S * 0.55, S * 0.6);
    rg.addColorStop(0, 'rgba(255,74,28,0.30)'); rg.addColorStop(1, 'rgba(255,74,28,0)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,74,28,0.55)'; g.lineWidth = 3; g.strokeRect(30, 30, S - 60, S - 60);
    g.fillStyle = 'rgba(244,241,238,0.5)'; g.font = '500 30px "JetBrains Mono"'; g.textBaseline = 'top';
    g.fillText(String(n).padStart(2, '0'), 58, 56);
    g.fillStyle = '#FF4A1C'; g.font = '500 30px "JetBrains Mono"'; g.textBaseline = 'alphabetic';
    g.fillText('COMING SOON', 58, S - 62);
    g.fillStyle = '#FF4A1C'; g.beginPath(); g.arc(S - 72, S - 72, 9, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ---------- screen materials ----------
function screenMat(tex, bright) {
  if (V === 'B') {
    return new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uBright: { value: bright }, uAcc: { value: ACC } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        uniform sampler2D map; uniform float uBright; uniform vec3 uAcc; varying vec2 vUv;
        void main(){
          float N = 34.;
          vec2 cell = floor(vUv*N); vec2 c = (cell+.5)/N;
          vec3 s = texture2D(map, c).rgb;
          float l = dot(s, vec3(.299,.587,.114));
          float r = .12 + .42*sqrt(l);
          float d = length(fract(vUv*N)-.5);
          float dotm = smoothstep(r, r-.12, d);
          float warm = smoothstep(.15,.6, s.r - s.b);
          vec3 col = mix(vec3(.93,.91,.89)*(.3+.72*l), uAcc*1.9, warm);
          float edge = step(.035, vUv.x)*step(vUv.x,.965)*step(.035,vUv.y)*step(vUv.y,.965);
          gl_FragColor = vec4(col*dotm*uBright*edge + vec3(.02)*edge, 1.);
        }`,
    });
  }
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  m.color.setScalar(bright);
  return m;
}

// ---------- cube ----------
const root = new THREE.Group();
scene.add(root);
const cubies = [];
const bodyGeo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 4, V === 'C' ? 0.12 : 0.07);
const screenGeo = V === 'C' ? new THREE.PlaneGeometry(0.78, 0.78) : new THREE.PlaneGeometry(0.84, 0.84);

let bodyMat;
if (V === 'A') {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  bodyMat = new THREE.MeshPhysicalMaterial({ color: '#0c0b0b', metalness: 0.5, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.35 });
} else if (V === 'B') {
  bodyMat = new THREE.MeshBasicMaterial({ color: '#000000' });
} else {
  bodyMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAcc: { value: ACC } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uAcc; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.-abs(dot(vN,vV)), 2.6); vec3 c = mix(vec3(1.,.93,.88), uAcc, .55); gl_FragColor = vec4(c*(.02+1.7*f*f), 1.); }`,
  });
}

const rand = mulberry32(7);
const HOVER = { pos: [0, 0, 1], axis: 'z' };
let hoverMesh = null;
let phIndex = 1, workIndex = 0;
const pendingTex = [];

function addCubie(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x * LOOK.gap, y * LOOK.gap, z * LOOK.gap);
  g.userData.c = [x, y, z];
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.renderOrder = V === 'C' ? 2 : 0;
  g.add(body);
  if (V === 'B') {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.96, 0.96, 0.96)), new THREE.LineBasicMaterial({ color: '#3b3734' }));
    g.add(e);
  }
  const faces = [['x', 1], ['x', -1], ['y', 1], ['y', -1], ['z', 1], ['z', -1]];
  for (const [ax, s] of faces) {
    const v = { x, y, z }[ax];
    if (v !== s) continue;
    const isHover = x === HOVER.pos[0] && y === HOVER.pos[1] && z === HOVER.pos[2] && ax === HOVER.axis && s === 1;
    let texP, bright, work = null;
    if (isHover) { work = WORKS[2]; texP = loadTex(work.img); bright = 0.97; }
    else if (rand() < 0.3) { work = WORKS[workIndex++ % WORKS.length]; if (work === WORKS[2]) work = WORKS[workIndex++ % WORKS.length]; texP = loadTex(work.img); bright = V === 'B' ? 0.8 : 0.6; }
    else { texP = Promise.resolve(placeholderTex(phIndex++)); bright = V === 'B' ? 0.9 : 2.0; }
    const mesh = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ color: 0 }));
    pendingTex.push(texP.then((t) => { mesh.material = screenMat(t, bright); }));
    const off = V === 'C' ? 0.36 : 0.484;
    if (ax === 'x') { mesh.rotation.y = s * Math.PI / 2; mesh.position.x = s * off; }
    if (ax === 'y') { mesh.rotation.x = -s * Math.PI / 2; mesh.position.y = s * off; }
    if (ax === 'z') { mesh.rotation.y = s === 1 ? 0 : Math.PI; mesh.position.z = s * off; }
    mesh.renderOrder = 1;
    g.add(mesh);
    if (isHover) {
      hoverMesh = mesh;
      if (V === 'C') g.position.z += 0.34; // pops out of the cube
      if (V === 'A') { // rim light around the hovered screen
        const rim = new THREE.Mesh(new THREE.PlaneGeometry(0.93, 0.93), new THREE.MeshBasicMaterial({ color: ACC.clone().multiplyScalar(2.6), toneMapped: false }));
        rim.position.copy(mesh.position).multiplyScalar(0.995); rim.rotation.copy(mesh.rotation);
        g.add(rim);
      }
      if (V === 'B') {
        const fr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.9, 0.9)), new THREE.LineBasicMaterial({ color: ACC.clone().multiplyScalar(2.5), toneMapped: false }));
        fr.position.copy(mesh.position).multiplyScalar(1.01); fr.rotation.copy(mesh.rotation);
        g.add(fr);
      }
    }
  }
  root.add(g);
  cubies.push(g);
}
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) addCubie(x, y, z);

// glowing core visible through the gaps (A), dim in C
if (V === 'A') {
  const core = new THREE.Mesh(new THREE.SphereGeometry(V === 'A' ? 1.05 : 0.5, 48, 32), new THREE.MeshBasicMaterial({ color: ACC.clone().multiplyScalar(V === 'A' ? 3 : 2.2), toneMapped: false }));
  root.add(core);
}

// a layer mid-twist: the top slice turns like a real cube
const pivot = new THREE.Group();
root.add(pivot);
for (const c of cubies) if (c.userData.c[1] === 1) pivot.attach(c);
pivot.rotation.y = 0.52;

root.rotation.set(0.4, -0.72, 0);

// ---------- space ----------
function dotTex() { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, '#fff'); r.addColorStop(0.35, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); }
{
  const r = mulberry32(42), N = V === 'C' ? 900 : 650, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1), R = 30 + r() * 60;
    pos.set([R * Math.sin(ph) * Math.cos(th), R * Math.sin(ph) * Math.sin(th), -Math.abs(R * Math.cos(ph)) - 5], i * 3);
    const warm = r() < 0.12, b = 0.25 + r() * 0.6;
    col.set(warm ? [b * 1.0, b * 0.35, b * 0.15] : [b, b * 0.97, b * 0.94], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (V !== 'B') scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.3 * renderer.getPixelRatio(), sizeAttenuation: false, vertexColors: true, map: dotTex(), transparent: true, depthWrite: false })));
}
if (V === 'C') { // embers drifting around the cube
  const r = mulberry32(9), N = 220, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const a = r() * 6.283, rad = 3.2 + r() * 4.5; pos.set([Math.cos(a) * rad, (r() - 0.5) * 7, Math.sin(a) * rad * 0.6], i * 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 3.4 * renderer.getPixelRatio(), map: dotTex(), sizeAttenuation: false, color: ACC.clone().multiplyScalar(2.4), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
}
if (V === 'B') { // curved lattice behind the cube, like a wireframe room
  const m = new THREE.LineBasicMaterial({ color: '#2a2725' });
  const pts = [], R = 22, H = 30;
  for (let i = -18; i <= 18; i++) { const a = i * 0.07; pts.push(Math.sin(a) * R, -H / 2, -Math.cos(a) * R + 8, Math.sin(a) * R, H / 2, -Math.cos(a) * R + 8); }
  for (let j = -15; j <= 15; j++) for (let i = -18; i < 18; i++) { const a = i * 0.07, b = (i + 1) * 0.07, y = j; pts.push(Math.sin(a) * R, y, -Math.cos(a) * R + 8, Math.sin(b) * R, y, -Math.cos(b) * R + 8); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(geo, m));
}

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), ...LOOK.bloom);
composer.addPass(bloom);
const cursorPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uMouse: { value: new THREE.Vector2(-9, -9) }, uAspect: { value: 1 }, uAcc: { value: ACC } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uMouse; uniform float uAspect; uniform vec3 uAcc; varying vec2 vUv;
    void main(){
      vec2 d = vUv - uMouse; d.x *= uAspect;
      float r = .085; float k = exp(-dot(d,d)/(r*r));
      vec2 dir = normalize(d + 1e-5); dir.x /= uAspect;
      vec2 off = -dir * k * .012;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off*1.25).r;
      c.g = texture2D(tDiffuse, vUv + off).g;
      c.b = texture2D(tDiffuse, vUv + off*.75).b;
      float halo = exp(-dot(d,d)/(.14*.14));
      c += uAcc * halo * .10;
      gl_FragColor = vec4(c, 1.);
    }`,
});
composer.addPass(cursorPass);
composer.addPass(new OutputPass());

// ---------- layout ----------
function layout() {
  const el = canvas.parentElement, W = el.clientWidth, H = el.clientHeight;
  renderer.setSize(W, H, false); composer.setSize(W, H); bloom.setSize(W, H);
  camera.aspect = W / H;
  if (isPhone) { camera.clearViewOffset(); camera.fov = 29; bloom.radius = 0.3; camera.position.z = 17; }
  else { camera.setViewOffset(W, H, -W * 0.17, H * 0.0, W, H); camera.fov = 26; }
  camera.updateProjectionMatrix();
  cursorPass.uniforms.uAspect.value = W / H;
  return { W, H };
}

// ---------- phone list ----------
if (isPhone) {
  const list = document.getElementById('list');
  const rows = [WORKS[2], WORKS[0], WORKS[4], WORKS[6], null, null];
  rows.forEach((w, i) => {
    const d = document.createElement('div');
    d.className = 'row' + (w ? '' : ' soon');
    d.innerHTML = w
      ? `<div class="thumb" style="background-image:url(${w.img})"></div><div><div class="n">${w.t}</div><div class="m">${w.c} · ${w.f}</div></div><div class="play">▶</div>`
      : `<div class="thumb"></div><div><div class="n">Coming soon</div><div class="m">Slot ${String(i + 1).padStart(2, '0')}</div></div>`;
    list.appendChild(d);
  });
}

// ---------- render one deterministic frame ----------
await document.fonts.ready;
await Promise.all(pendingTex);
const { W, H } = layout();
scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);

if (!isPhone && hoverMesh) {
  const p = new THREE.Vector3(); hoverMesh.getWorldPosition(p); p.project(camera);
  const sx = (p.x * 0.5 + 0.5) * W, sy = (-p.y * 0.5 + 0.5) * H;
  const cx = sx + W * 0.03, cy = sy + H * 0.065;
  cursorPass.uniforms.uMouse.value.set(cx / W, 1 - cy / H);
  const cur = document.getElementById('cur'); cur.style.left = cx + 'px'; cur.style.top = cy + 'px';
  const tip = document.getElementById('tip'); tip.style.left = cx + 24 + 'px'; tip.style.top = cy + 18 + 'px';
} else {
  document.getElementById('cur').style.display = 'none';
  document.getElementById('tip').style.display = 'none';
}
composer.render();
composer.render();
window.__ready = true;
