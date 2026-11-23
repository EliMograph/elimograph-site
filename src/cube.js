// The Rubik's cube: 26 dark cubies with glowing glass tiles, real layer turns, solve / shuffle.
// A tile with a work shows the picture inside a frame of its face colour.
// Rendered straight to the canvas (no post-processing) so it stays at full frame rate.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const GAP = 1.035; // distance between cubie centres
const HALF_PI = Math.PI / 2;
const AXES = ['x', 'y', 'z'];
const AXIS_V = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const FACES = [['x', 1], ['x', -1], ['y', 1], ['y', -1], ['z', 1], ['z', -1]];
const SCRAMBLE = 22; // seeded moves applied before the first frame
const IDLE_LIMIT = 30; // idle twists stop once the history is this long
const IDLE_EVERY = 6; // seconds

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const normQ = (q) => { const n = ((q % 4) + 4) % 4; return n === 3 ? -1 : n; };

// ---------- tile: dark tinted glass, LED grid, glowing rim, a slow sweep of light ----------
const tileVert = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const tileFrag = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 uScale; uniform vec2 uOffset;
  uniform vec3 uColor; uniform vec3 uBody;
  uniform float uHasMap, uHover, uReveal, uFlash, uTime;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
  void main() {
    vec3 n = normalize(vN), v = normalize(vV);
    vec2 p = vUv - .5;
    float d = sdBox(p, vec2(.5), .119);          // 0 at the tile edge, negative inside
    float aa = fwidth(d);
    // glass: dark tint, a little lighter at the top
    vec3 col = uColor * (.2 + .16 * vUv.y);
    // fine LED grid
    vec2 gp = vUv * 14.; vec2 gw = fwidth(gp);
    vec2 g = smoothstep(vec2(.5) - gw, vec2(.5), abs(fract(gp) - .5));
    col *= 1. - max(g.x, g.y) * .3;
    // light from the rim, and the rim itself
    col += uColor * exp(d * 22.) * (.55 + .4 * uHover);
    col += uColor * (1. - smoothstep(0., aa * 1.5 + .006, abs(d + .014))) * (.85 + .4 * uHover);
    // a band of light drifts across the whole cube
    float band = smoothstep(.9, 1., sin(dot(vW, vec3(.5, .8, .32)) * .8 - uTime * .7));
    col += mix(uColor, vec3(1.), .55) * band * .28;
    // glint + fresnel
    vec3 L = normalize(vec3(-.45, .85, .6));
    float spec = pow(max(dot(n, normalize(L + v)), 0.), 70.) * .3;
    col += spec + uColor * pow(1. - max(dot(n, v), 0.), 3.) * .2;
    if (uHasMap > .5) {
      float fw = .11;
      float di = sdBox(p, vec2(.5 - fw), .05);
      float ai = fwidth(di);
      float inner = 1. - smoothstep(-ai, ai, di);
      vec3 img = texture2D(map, (p / (1. - 2. * fw) + .5) * uScale + uOffset).rgb * mix(.8, 1., uHover);
      col = mix(col, img + spec * .3, inner);
    }
    col *= 1. + uHover * .3;
    col += uColor * uFlash * .6;
    gl_FragColor = vec4(mix(uBody, col, uReveal), 1.);
    #include <colorspace_fragment>
  }`;

// soft coloured aura: a full-screen background glow, fixed to the viewport (part of the page, not of the cube)
const auraFrag = /* glsl */ `
  uniform vec3 uA, uB, uC; uniform float uTime, uStrength, uAspect;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - .5) * vec2(uAspect, 1.);   // in viewport heights
    // three soft blobs of colour drifting slowly around the middle
    float t = uTime * .12;
    vec2 a = vec2(cos(t), sin(t * 1.3)) * .14;
    vec2 b = vec2(cos(t + 2.1), sin(t * 1.1 + 2.1)) * .14;
    vec2 c = vec2(cos(t + 4.2), sin(t * .9 + 4.2)) * .14;
    vec3 col = uA * exp(-dot(p - a, p - a) * 9.) + uB * exp(-dot(p - b, p - b) * 9.) + uC * exp(-dot(p - c, p - c) * 11.) * .7;
    gl_FragColor = vec4(col * uStrength, 1.);
    #include <colorspace_fragment>
    // dither after the sRGB conversion, only where there is glow: no banding, no visible edge
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5;
    gl_FragColor.rgb += n / 255. * smoothstep(.0, .02, max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)));
  }`;

function roundedSquare(size, r) {
  const h = size / 2, s = new THREE.Shape();
  s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / size + 0.5, p.getY(i) / size + 0.5);
  return g;
}

// square centre-crop for any aspect
function cropFor(w, h) {
  const a = w / h;
  return a > 1 ? { scale: [1 / a, 1], offset: [(1 - 1 / a) / 2, 0] } : { scale: [1, a], offset: [0, (1 - a) / 2] };
}

export function createCube(canvas, { palette, reducedMotion = false, isTouch = false } = {}) {
  const P = palette;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const maxPR = Math.min(window.devicePixelRatio, 2);
  let pr = Math.min(maxPR, 1.5);
  renderer.setPixelRatio(pr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(P.bg, 1);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
  camera.position.set(0, 0, 17);

  // ---------- cube ----------
  const holder = new THREE.Group(); // scroll position + scale
  scene.add(holder);
  const root = new THREE.Group(); // pitch
  holder.add(root);
  const spin = new THREE.Group(); // auto-rotation + user orbit
  root.add(spin);
  const cubies = [];
  const tiles = [];
  const bodyGeo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 3, 0.08);
  const bodyMat = new THREE.MeshStandardMaterial({ color: P.body, metalness: 0.75, roughness: 0.3, envMapIntensity: 0.35 });
  const tileGeo = roundedSquare(0.84, 0.1);
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
  const bodyLin = new THREE.Color(P.body);
  const faceColors = P.faces.map((c) => new THREE.Color(c));
  const seedRand = mulberry32(11);
  const time = { value: 0 };

  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const g = new THREE.Group();
    g.position.set(x * GAP, y * GAP, z * GAP);
    g.add(new THREE.Mesh(bodyGeo, bodyMat));
    FACES.forEach(([ax, s], fi) => {
      if ({ x, y, z }[ax] !== s) return;
      const mat = new THREE.ShaderMaterial({
        vertexShader: tileVert, fragmentShader: tileFrag,
        uniforms: {
          map: { value: blank }, uScale: { value: new THREE.Vector2(1, 1) }, uOffset: { value: new THREE.Vector2(0, 0) },
          uColor: { value: faceColors[fi] }, uBody: { value: bodyLin }, uTime: time,
          uHasMap: { value: 0 }, uHover: { value: 0 }, uReveal: { value: reducedMotion ? 1 : 0 }, uFlash: { value: 0 },
        },
      });
      const m = new THREE.Mesh(tileGeo, mat);
      const off = 0.4815;
      if (ax === 'x') { m.rotation.y = s * HALF_PI; m.position.x = s * off; }
      if (ax === 'y') { m.rotation.x = -s * HALF_PI; m.position.y = s * off; }
      if (ax === 'z') { m.rotation.y = s === 1 ? 0 : Math.PI; m.position.z = s * off; }
      m.userData = { home: fi, color: P.faces[fi], work: null, slot: 0, delay: seedRand() };
      g.add(m);
      tiles.push(m);
    });
    spin.add(g);
    cubies.push(g);
  }

  // aura: drawn first, covering the whole viewport, independent of the cube's position
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
    fragmentShader: auraFrag,
    uniforms: { uA: { value: faceColors[4] }, uB: { value: faceColors[5] }, uC: { value: faceColors[0] }, uTime: time, uStrength: { value: P.aura ?? 0.2 }, uAspect: { value: 1 } },
    depthTest: false, depthWrite: false,
  }));
  aura.frustumCulled = false;
  aura.renderOrder = -1;
  scene.add(aura);

  // ---------- state ----------
  const st = {
    yaw: -0.72, pitch: 0.42, vYaw: 0, vPitch: 0, // orbit
    hover: null, mouse: new THREE.Vector2(-9999, -9999),
    twist: null, // { axis, layer, angle, target, mode: 'drag'|'anim', from, t, dur }
    hist: [], queue: [], busy: null, wantSolve: false, hold: false, flashAt: -9,
    lastInteract: 0, time: 0, reveal: reducedMotion ? 1 : 0, revealStart: -1, intro: reducedMotion ? 1 : 0,
    scroll: 0, w: 1, h: 1, halfW: 1, halfH: 1, cursor: '',
  };
  const rand = mulberry32(2026);
  const raycaster = new THREE.Raycaster();
  const tmpV = new THREE.Vector3();

  const coordOf = (c) => [Math.round(c.position.x / GAP), Math.round(c.position.y / GAP), Math.round(c.position.z / GAP)];

  // move history, so the cube can be solved by playing it back. Moves on one axis commute, so they merge.
  function record(axis, layer, q) {
    for (let i = st.hist.length - 1; i >= 0 && st.hist[i].axis === axis; i--) {
      if (st.hist[i].layer !== layer) continue;
      const n = normQ(st.hist[i].q + q);
      if (n) st.hist[i].q = n; else st.hist.splice(i, 1);
      return;
    }
    const n = normQ(q);
    if (n) st.hist.push({ axis, layer, q: n });
  }

  function beginTwist(axis, layer) {
    const pivot = new THREE.Group();
    spin.add(pivot);
    const ai = AXES.indexOf(axis);
    for (const c of cubies) if (coordOf(c)[ai] === layer) pivot.attach(c);
    return { axis, layer, pivot, angle: 0 };
  }
  function setTwistAngle(tw, a) { tw.angle = a; tw.pivot.rotation.set(0, 0, 0); tw.pivot.rotation[tw.axis] = a; }
  function endTwist(tw) {
    const q = Math.round(tw.angle / HALF_PI);
    setTwistAngle(tw, q * HALF_PI);
    tw.pivot.updateMatrixWorld(true);
    for (const c of [...tw.pivot.children]) {
      spin.attach(c);
      c.position.set(Math.round(c.position.x / GAP) * GAP, Math.round(c.position.y / GAP) * GAP, Math.round(c.position.z / GAP) * GAP);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(c.quaternion);
      for (let i = 0; i < 16; i++) m.elements[i] = Math.round(m.elements[i]);
      c.quaternion.setFromRotationMatrix(m);
    }
    spin.remove(tw.pivot);
    if (!tw.silent && q) record(tw.axis, tw.layer, q);
  }
  function randomMove() {
    let axis, layer;
    do { axis = AXES[Math.floor(rand() * 3)]; layer = Math.floor(rand() * 3) - 1; }
    while (st.lastMove && st.lastMove.axis === axis && st.lastMove.layer === layer);
    st.lastMove = { axis, layer };
    return { axis, layer, q: rand() < 0.5 ? -1 : 1 };
  }
  function startMove(m, dur, opts = {}) {
    const tw = beginTwist(m.axis, m.layer);
    Object.assign(tw, { mode: 'anim', target: m.q * HALF_PI, from: 0, t: 0, dur, ...opts });
    st.twist = tw;
  }
  function startAnimMove(dur = 0.9) { startMove(randomMove(), dur); }

  // scrambled from the start, so there is something to solve
  for (let i = 0; i < SCRAMBLE; i++) { const m = randomMove(); const tw = beginTwist(m.axis, m.layer); setTwistAngle(tw, m.q * HALF_PI); endTwist(tw); }

  const state = () => ({ solved: st.hist.length === 0 && !st.busy && !st.twist, busy: st.busy || (st.wantSolve ? 'solve' : null) });
  let lastState = '';
  function emit() {
    const s = state(); const k = JSON.stringify(s);
    if (k !== lastState) { lastState = k; api.onState?.(s); }
  }
  function queueSolve() {
    st.wantSolve = false;
    if (!st.hist.length) { emit(); return; }
    const moves = st.hist.slice().reverse();
    st.hist = [];
    const dur = clamp(3.5 / moves.length, 0.1, 0.35);
    st.queue = moves.map((m) => ({ axis: m.axis, layer: m.layer, q: -m.q, dur: dur * (Math.abs(m.q) === 2 ? 1.4 : 1), silent: true }));
    st.busy = 'solve';
    emit();
  }

  // ---------- pointer ----------
  const ptr = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, moved: 0, hit: null, kind: null, lastT: 0 };
  const ndcV = new THREE.Vector2();
  function pick(x, y) {
    ndcV.set((x / st.w) * 2 - 1, -(y / st.h) * 2 + 1); // the canvas covers the viewport
    raycaster.setFromCamera(ndcV, camera);
    const hits = raycaster.intersectObjects(tiles, false);
    return hits[0] || null;
  }
  function toScreen(v) {
    const p = v.clone().project(camera);
    return new THREE.Vector2((p.x * 0.5 + 0.5) * st.w, (-p.y * 0.5 + 0.5) * st.h);
  }
  const locked = () => !!(st.busy || st.queue.length || st.wantSolve);

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    ptr.hit = pick(e.clientX, e.clientY);
    ptr.down = true; ptr.id = e.pointerId; ptr.x = ptr.sx = e.clientX; ptr.y = ptr.sy = e.clientY; ptr.moved = 0; ptr.kind = null; ptr.lastT = performance.now();
    st.vYaw = st.vPitch = 0;
    st.lastInteract = st.time;
  }
  function onMove(e) {
    st.mouse.set(e.clientX, e.clientY);
    if (!ptr.down || e.pointerId !== ptr.id) return;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    ptr.moved += Math.abs(dx) + Math.abs(dy);
    const totX = e.clientX - ptr.sx, totY = e.clientY - ptr.sy;
    const now = performance.now(), dt = Math.max(1, now - ptr.lastT);
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.lastT = now;
    st.lastInteract = st.time;

    if (!ptr.kind && Math.hypot(totX, totY) > 8) {
      // touch: horizontal swipes turn the cube, vertical ones scroll the page
      if (isTouch && Math.abs(totY) > Math.abs(totX)) { ptr.down = false; return; }
      ptr.kind = 'orbit';
      if (ptr.hit && !st.twist && !locked() && !isTouch) {
        // which layer to twist: the one whose motion best matches the drag direction
        const hit = ptr.hit;
        const local = spin.worldToLocal(hit.point.clone());
        const nl = new THREE.Vector3(0, 0, 1).transformDirection(hit.object.matrixWorld).transformDirection(new THREE.Matrix4().copy(spin.matrixWorld).invert());
        const nAxis = AXES.reduce((best, a) => (Math.abs(nl[a]) > Math.abs(nl[best]) ? a : best), 'x');
        const drag = new THREE.Vector2(totX, totY).normalize();
        let best = null;
        for (const a of AXES) {
          if (a === nAxis) continue;
          const tangent = new THREE.Vector3().crossVectors(AXIS_V[a], local).multiplyScalar(0.05);
          const p0 = toScreen(spin.localToWorld(local.clone()));
          const p1 = toScreen(spin.localToWorld(local.clone().add(tangent)));
          const sv = p1.sub(p0); const pxPerRad = sv.length() / 0.05;
          if (pxPerRad < 1) continue;
          const align = sv.normalize().dot(drag);
          if (!best || Math.abs(align) > Math.abs(best.align)) best = { a, align, dirScreen: sv.clone(), pxPerRad };
        }
        if (best) {
          const layer = clamp(Math.round(local.getComponent(AXES.indexOf(best.a)) / GAP), -1, 1);
          const tw = beginTwist(best.a, layer);
          Object.assign(tw, { mode: 'drag', dirScreen: best.dirScreen, pxPerRad: best.pxPerRad });
          st.twist = tw;
          st.hold = false;
          ptr.kind = 'twist';
        }
      }
      canvas.setPointerCapture?.(e.pointerId);
    }
    if (ptr.kind === 'twist' && st.twist && st.twist.mode === 'drag') {
      const along = new THREE.Vector2(totX, totY).dot(st.twist.dirScreen);
      setTwistAngle(st.twist, clamp(along / st.twist.pxPerRad, -Math.PI * 0.75, Math.PI * 0.75));
    } else if (ptr.kind === 'orbit') {
      const k = 0.0062;
      st.yaw += dx * k; st.pitch = clamp(st.pitch + dy * k * (isTouch ? 0 : 1), -0.9, 1.1);
      st.vYaw = (dx * k) / dt * 16; st.vPitch = isTouch ? 0 : (dy * k) / dt * 16;
    }
  }
  function onUp(e) {
    if (!ptr.down || (e.pointerId !== undefined && e.pointerId !== ptr.id)) return;
    ptr.down = false;
    if (ptr.kind === 'twist' && st.twist) {
      const tw = st.twist;
      const target = clamp(Math.round(tw.angle / HALF_PI), -1, 1) * HALF_PI;
      Object.assign(tw, { mode: 'anim', from: tw.angle, target, t: 0, dur: 0.45 });
    } else if (!ptr.kind && ptr.moved < 10 && ptr.hit) {
      const w = ptr.hit.object.userData.work;
      if (w) api.onOpen?.(w, { x: e.clientX, y: e.clientY });
    }
    ptr.kind = null;
  }
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  document.addEventListener('pointerleave', () => { if (!ptr.down) st.mouse.set(-9999, -9999); });

  // ---------- layout ----------
  function resize() {
    st.w = Math.max(1, window.innerWidth); st.h = Math.max(1, window.innerHeight);
    renderer.setSize(st.w, st.h, false);
    camera.aspect = st.w / st.h;
    aura.material.uniforms.uAspect.value = camera.aspect;
    // keep the cube a similar size: by height on wide screens, by width on phones
    st.halfH = Math.max(4.0, 3.15 / camera.aspect);
    st.halfW = st.halfH * camera.aspect;
    camera.position.z = st.halfH / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.updateProjectionMatrix();
  }

  // where the cube sits for a given scroll (s = scrollY / viewport height)
  function place() {
    const s = st.scroll, phone = st.w < 760;
    const a = smooth(clamp(s / 0.7, 0, 1)); // first: it rises from the bottom edge to the middle
    const fx = lerp(phone ? 0.5 : 0.68, 0.5, a);
    let fy = lerp(phone ? 0.9 : 0.94, 0.5, a);
    let sc = 1;
    if (s > 1) { const k = s - 1; fy = 0.5 - k; sc = 1 - 0.22 * smooth(clamp(k / 0.8, 0, 1)); } // then: up and a bit smaller
    fy += (1 - st.intro) * 0.45; // intro: comes up from below
    // aura follows the cube's moment on stage: grows while it rises, peaks while it's in front of you, fades as it leaves
    const level = s < 0.7 ? lerp(0.2, 1, smooth(clamp(s / 0.7, 0, 1))) : s <= 1 ? 1 : lerp(1, 0.08, smooth(clamp((s - 1) / 0.8, 0, 1)));
    aura.material.uniforms.uStrength.value = (P.aura ?? 0.2) * level * st.intro;
    holder.position.set((fx - 0.5) * 2 * st.halfW, (0.5 - fy) * 2 * st.halfH, 0);
    holder.scale.setScalar(sc);
  }

  function setCursor(c) { if (c !== st.cursor) { st.cursor = c; canvas.style.cursor = c; } }

  // adaptive resolution: if frames are slow, render fewer pixels instead of stuttering
  const perf = { acc: 0, n: 0 };
  function adapt(dt) {
    perf.acc += dt; perf.n++;
    if (perf.acc < 1) return;
    const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
    if (avg > 1 / 50 && pr > 0.75) { pr = Math.max(0.75, pr - 0.25); renderer.setPixelRatio(pr); renderer.setSize(st.w, st.h, false); }
  }

  // ---------- frame ----------
  let last = performance.now();
  function frame(now) {
    const rawDt = (now - last) / 1000; last = now;
    const dt = Math.min(0.05, rawDt);
    st.time += dt; time.value = st.time;
    if (st.revealStart >= 0) {
      st.reveal = clamp((st.time - st.revealStart) / 1.4, 0, 1);
      st.intro = reducedMotion ? 1 : easeOutExpo(clamp((st.time - st.revealStart) / 1.6, 0, 1));
    }
    const frozen = !!(st.hover && st.hover.userData.work);

    // orbit: inertia + slow auto-rotation
    if (!ptr.down || ptr.kind !== 'orbit') {
      st.yaw += st.vYaw; st.pitch = clamp(st.pitch + st.vPitch, -0.9, 1.1);
      const damp = Math.pow(0.94, dt * 60); st.vYaw *= damp; st.vPitch *= damp;
      if (!reducedMotion && !frozen) st.yaw += dt * 0.08;
      if (!ptr.down) st.pitch += (0.42 - st.pitch) * Math.min(1, dt * 0.6);
    }
    root.rotation.set(st.pitch, 0, 0);
    spin.rotation.set(0, st.yaw, 0);
    place();

    // twists: solve/shuffle queue first, then idle
    const tw = st.twist;
    if (tw && tw.mode === 'anim') {
      tw.t += dt / tw.dur;
      const k = tw.t >= 1 ? 1 : (tw.ease === 'inout' ? easeInOut(tw.t) : easeOutExpo(tw.t));
      setTwistAngle(tw, tw.from + (tw.target - tw.from) * k);
      if (tw.t >= 1) {
        endTwist(tw); st.twist = null;
        if (st.busy && !st.queue.length) {
          if (st.busy === 'solve') { st.hold = true; st.flashAt = st.time; }
          st.busy = null;
        }
        emit();
      }
    } else if (!tw) {
      if (st.wantSolve) queueSolve();
      if (st.queue.length) { const m = st.queue.shift(); startMove(m, m.dur, { silent: m.silent, ease: 'inout' }); }
      else if (st.reveal >= 1 && !st.hold && !reducedMotion && st.hist.length < IDLE_LIMIT
        && st.time - st.lastInteract > IDLE_EVERY && st.time - (st.lastIdle || 0) > IDLE_EVERY) { st.lastIdle = st.time; startMove(randomMove(), 1.1, { ease: 'inout' }); }
    }
    if (frozen) st.lastInteract = st.time; // hold still while a work is under the cursor

    // hover (fine pointers only)
    let hovered = null;
    if (!isTouch && st.mouse.x > -999 && !(ptr.down && ptr.kind) && !api.blocked) {
      holder.updateMatrixWorld(true);
      const h = pick(st.mouse.x, st.mouse.y);
      hovered = h ? h.object : null;
    }
    if (hovered !== st.hover) {
      if (st.hover) api.onHover?.(null, st.hover.userData);
      st.hover = hovered;
      if (hovered) api.onHover?.(hovered, hovered.userData);
    }
    if (!isTouch) setCursor(ptr.down && ptr.kind ? 'grabbing' : hovered ? (hovered.userData.work ? 'pointer' : 'grab') : '');

    const flashT = st.time - st.flashAt;
    for (const s of tiles) {
      const u = s.material.uniforms;
      const target = s === hovered ? 1 : 0;
      u.uHover.value += (target - u.uHover.value) * Math.min(1, dt * 10);
      if (st.reveal < 1 && !reducedMotion) {
        s.getWorldPosition(tmpV); // wave: tiles higher up light first
        u.uReveal.value = clamp(st.reveal * 1.6 - (1.5 - (tmpV.y - holder.position.y)) / 6 - s.userData.delay * 0.08, 0, 1);
      } else u.uReveal.value = 1;
      const ft = flashT - s.userData.delay * 0.35;
      u.uFlash.value = ft > 0 && ft < 1.2 ? Math.exp(-ft * 4) * (1 - Math.exp(-ft * 40)) : 0;
    }

    renderer.render(scene, camera);
    adapt(rawDt);
  }

  let raf = 0, running = false;
  const loop = (t) => { frame(t); raf = requestAnimationFrame(loop); };
  const api = {
    renderer,
    resize,
    blocked: false,
    start() { if (running) return; running = true; last = performance.now(); perf.acc = perf.n = 0; raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    reveal() { st.revealStart = st.time; },
    setScroll(s) { st.scroll = s; },
    // play the history back: the cube solves itself
    solve() { if (locked()) return; st.wantSolve = true; if (ptr.kind === 'twist') onUp({}); emit(); },
    shuffle() {
      if (locked()) return;
      st.hold = false; st.lastInteract = st.time;
      st.queue = Array.from({ length: 20 }, () => ({ ...randomMove(), dur: 0.15 }));
      st.busy = 'shuffle'; emit();
    },
    state,
    faces: P.faces,
    // place works on tiles: the first ones go on the faces you see first
    setWorks(works, load) {
      scene.updateMatrixWorld(true);
      const facePri = { z1: 0, x1: 1, y1: 2, 'x-1': 3, 'z-1': 4, 'y-1': 5 };
      const inv = new THREE.Matrix4().copy(spin.matrixWorld).invert();
      const info = tiles.map((s) => {
        const n = new THREE.Vector3(0, 0, 1).transformDirection(s.matrixWorld).transformDirection(inv);
        const a = AXES.reduce((b, k) => (Math.abs(n[k]) > Math.abs(n[b]) ? k : b), 'x');
        return { s, face: a + (n[a] > 0 ? 1 : -1), dist: coordOf(s.parent).reduce((t, v) => t + Math.abs(v), 0) };
      });
      const byFace = {};
      for (const it of info.sort((p, q) => p.dist - q.dist)) (byFace[it.face] ||= []).push(it.s);
      const order = [];
      for (let i = 0; order.length < tiles.length; i++) for (const k of Object.keys(facePri)) if (byFace[k][i]) order.push(byFace[k][i]);
      const jobs = [];
      order.forEach((s, i) => {
        const w = works[i] || null;
        const u = s.material.uniforms;
        s.userData.slot = i + 1;
        s.userData.work = w;
        u.uHasMap.value = 0;
        if (!w) return;
        jobs.push(load(w).then((tex) => {
          if (!tex) return;
          const img = tex.image; const iw = img.videoWidth || img.width, ih = img.videoHeight || img.height;
          const c = cropFor(iw, ih);
          u.map.value = tex; u.uHasMap.value = 1; u.uScale.value.set(...c.scale); u.uOffset.value.set(...c.offset);
          s.userData.poster = tex;
        }));
      });
      return Promise.all(jobs);
    },
    setScreenTexture(screen, tex) { if (tex) screen.material.uniforms.map.value = tex; },
    screenRect(screen) {
      screen.getWorldPosition(tmpV);
      const p = toScreen(tmpV);
      return { x: p.x, y: p.y };
    },
    onHover: null,
    onOpen: null,
    onState: null,
    _debug: { cubies, screens: tiles, st, startAnimMove, coordOf, gap: GAP, pr: () => pr },
  };
  return api;
}
