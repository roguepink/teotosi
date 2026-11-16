/* =========================================================
   テオトシ 3D — 3D で描く係(three.js r186・同梱。CDN も importmap も使わない)
   game.js が作る「描く一覧」を受け取って、立体のブロック・盤・空・こなごなを描く。
   ここが動かない(古い機械・WebGL なし)ときは、game.js が 2D で描く。
   ========================================================= */
import * as THREE from '../vendor/three/build/three.module.js';

const COLS_ = CONFIG.COLS, ROWS_ = CONFIG.ROWS;
const THEME = [   // 空の上・下・霧・光の色・ふち
  { top: '#4aa8ff', bot: '#d4f0ff', fog: 0xbfe6ff, sky: 0xffffff, gnd: 0x88aacc, acc: 0xffe066, stars: 0 },
  { top: '#ff6e5a', bot: '#ffcf8a', fog: 0xffb98a, sky: 0xfff0dd, gnd: 0xaa6655, acc: 0xfff1a0, stars: 0 },
  { top: '#0f1850', bot: '#43308a', fog: 0x2c2468, sky: 0xc8d0ff, gnd: 0x332255, acc: 0x8fd3ff, stars: 0.8 },
  { top: '#03020c', bot: '#2a0f55', fog: 0x150a30, sky: 0xd8c8ff, gnd: 0x221144, acc: 0xff9ee0, stars: 1 },
  { top: '#06333f', bot: '#6a3093', fog: 0x2a3a66, sky: 0xd0fff0, gnd: 0x224455, acc: 0x7ee08f, stars: 0.9 }
];

let renderer, scene, camera, hemi, sun, pointL;
let blockGeo, ghostGeo, mats, ghostMats, pool = [], ghostPool = [], beams = [], rings = [];
let bgCanvas, bgTex, deco = [], stars, frameBars = [], frameMat, plate;
let parts, partState = [], PART_N = 420, partIdx = 0;
let W = 1, H = 1, D = 30, punch = 0, themeCur = { top: new THREE.Color(), bot: new THREE.Color(), fog: new THREE.Color() }, themeIdx = -1;
let dprCur = 2, slowT = 0, fastT = 0, lastT = 0;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();

function wx(gx) { return gx - (COLS_ - 1) / 2; }
function wy(gy) { return (ROWS_ - 1) / 2 - gy; }

function roundedSquare(s, r) {
  const sh = new THREE.Shape(), h = s / 2;
  sh.moveTo(-h + r, -h); sh.lineTo(h - r, -h); sh.quadraticCurveTo(h, -h, h, -h + r);
  sh.lineTo(h, h - r); sh.quadraticCurveTo(h, h, h - r, h); sh.lineTo(-h + r, h);
  sh.quadraticCurveTo(-h, h, -h, h - r); sh.lineTo(-h, -h + r); sh.quadraticCurveTo(-h, -h, -h + r, -h);
  return sh;
}
function faceTexture(h, variant) {
  const px = 256, c = document.createElement('canvas'); c.width = c.height = px;
  paintFace(c.getContext('2d'), h, 0, 0, px, variant);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const S = 0.84;   // ブロックの面の大きさ(ふちの丸みで 0.94 くらいになる)
function buildMaterials() {
  mats = [];
  ghostMats = [];
  for (let h = 0; h < 7; h++) {
    const side = new THREE.Color(PAL[h].b).multiplyScalar(0.8);
    const tn = faceTexture(h, 0), ts = faceTexture(h, 1);
    [tn, ts].forEach(t => { t.repeat.set(1 / S, 1 / S); t.offset.set(0.5, 0.5); });
    const sideMat = new THREE.MeshStandardMaterial({ color: side, roughness: 0.42, metalness: 0.05 });
    const v = [];
    v[0] = [new THREE.MeshStandardMaterial({ map: tn, roughness: 0.32, metalness: 0.02 }), sideMat];
    v[1] = [new THREE.MeshStandardMaterial({ map: ts, roughness: 0.32, emissive: 0x551122, emissiveIntensity: 0.6 }), new THREE.MeshStandardMaterial({ color: side, roughness: 0.42, emissive: 0x661122, emissiveIntensity: 0.5 })];
    v[2] = [new THREE.MeshStandardMaterial({ map: tn, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.85 }), new THREE.MeshStandardMaterial({ color: side, emissive: 0xffffff, emissiveIntensity: 0.85 })];
    v[3] = [new THREE.MeshStandardMaterial({ map: tn, roughness: 0.6, color: 0x55526a }), new THREE.MeshStandardMaterial({ color: 0x3a3848, roughness: 0.7 })];
    mats.push(v);
    ghostMats.push(new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL[h].a), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
  }
}
function makePlateTexture() {
  const c = document.createElement('canvas'); c.width = COLS_ * 32; c.height = ROWS_ * 32;
  const g = c.getContext('2d');
  g.fillStyle = '#140d2c'; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < ROWS_; y++) for (let x = 0; x < COLS_; x++) if ((x + y) % 2) { g.fillStyle = '#1c1438'; g.fillRect(x * 32, y * 32, 32, 32); }
  g.strokeStyle = 'rgba(255,255,255,.05)';
  for (let x = 0; x <= COLS_; x++) { g.beginPath(); g.moveTo(x * 32, 0); g.lineTo(x * 32, c.height); g.stroke(); }
  for (let y = 0; y <= ROWS_; y++) { g.beginPath(); g.moveTo(0, y * 32); g.lineTo(c.width, y * 32); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildScene() {
  scene = new THREE.Scene();
  bgCanvas = document.createElement('canvas'); bgCanvas.width = 4; bgCanvas.height = 256;
  bgTex = new THREE.CanvasTexture(bgCanvas); bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;
  scene.fog = new THREE.Fog(0xbfe6ff, 40, 110);
  camera = new THREE.PerspectiveCamera(34, 1, 0.5, 200);
  hemi = new THREE.HemisphereLight(0xffffff, 0x88aacc, 1.6); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(-5, 9, 14); scene.add(sun);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 10, bottom: -10, near: 1, far: 40 });
  sun.shadow.bias = -0.002; sun.shadow.radius = 4;
  pointL = new THREE.PointLight(0xffffff, 0, 9, 1.6); scene.add(pointL);

  // ブロックの形(ぷっくり 角の丸い 立方体)
  blockGeo = new THREE.ExtrudeGeometry(roundedSquare(S, 0.2), { depth: 0.5, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.05, bevelSegments: 3, curveSegments: 6 });
  blockGeo.translate(0, 0, -0.35);
  ghostGeo = blockGeo;
  buildMaterials();

  // 盤(うしろの板と、光るふち)
  const pw = COLS_ + 0.5, ph = ROWS_ + 0.5;
  plate = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.3), [
    new THREE.MeshStandardMaterial({ color: 0x120b26, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x120b26, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x120b26, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x120b26, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: makePlateTexture(), roughness: 0.75 }), new THREE.MeshStandardMaterial({ color: 0x120b26 })
  ]);
  plate.position.z = -0.55; plate.receiveShadow = true; scene.add(plate);
  frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1f52, emissive: 0xffe066, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.3 });
  const bt = 0.28;
  [[0, ph / 2 + bt / 2, pw + bt * 2, bt], [0, -ph / 2 - bt / 2, pw + bt * 2, bt], [-pw / 2 - bt / 2, 0, bt, ph], [pw / 2 + bt / 2, 0, bt, ph]].forEach(b => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b[2], b[3], 0.9), frameMat);
    m.position.set(b[0], b[1], -0.15); scene.add(m); frameBars.push(m);
  });
  // 台座(下にうかぶ島)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.2, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x3a2b6e, roughness: 0.6, flatShading: true }));
  base.position.set(0, -ph / 2 - 1.2, -0.4); base.scale.z = 0.5; scene.add(base);

  // ブロックの入れもの(使い回す)
  for (let i = 0; i < 150; i++) { const m = new THREE.Mesh(blockGeo, mats[0][0]); m.visible = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); pool.push(m); }
  const edges = new THREE.EdgesGeometry(blockGeo, 35);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ghostGeo, ghostMats[0]); m.visible = false;
    const ln = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    m.add(ln); m.userData.ln = ln; scene.add(m); ghostPool.push(m);
  }
  // 勝ちの光の線
  const beamGeo = new THREE.BoxGeometry(1, 0.1, 0.1);
  for (let i = 0; i < 80; i++) {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false; m.position.z = 0.5; scene.add(m); beams.push(m);
  }
  // 広がる輪(🎁 💣 ⭐)
  const ringGeo = new THREE.TorusGeometry(1, 0.07, 8, 48);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false; m.position.z = 0.6; m.userData = { t: 9 }; scene.add(m); rings.push(m);
  }
  // こなごな(1回で描けるように まとめた入れもの)
  parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.17, 0.17), new THREE.MeshStandardMaterial({ roughness: 0.4 }), PART_N);
  parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < PART_N; i++) {
    partState.push({ life: 0, t: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), vr: new THREE.Vector3(), s: 1 });
    tmpM.makeScale(0, 0, 0); parts.setMatrixAt(i, tmpM); parts.setColorAt(i, tmpC.set(0xffffff));
  }
  parts.frustumCulled = false; scene.add(parts);
  // 遠くに うかぶ ブロック
  const decoMats = [0, 1, 2, 3].map(h => new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL[h].b), roughness: 0.5 }));
  for (let i = 0; i < 34; i++) {
    const m = new THREE.Mesh(blockGeo, decoMats[i % 4]);
    const s = 0.7 + Math.random() * 1.8;
    m.scale.set(s, s, s);
    m.position.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, -14 - Math.random() * 40);
    if (Math.abs(m.position.x) < 9 && m.position.z > -24) m.position.x += m.position.x < 0 ? -10 : 10;
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    m.userData = { vr: new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3), vy: 0.2 + Math.random() * 0.5 };
    scene.add(m); deco.push(m);
  }
  // 星
  const sg = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 500; i++) sp.push((Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, -40 - Math.random() * 60);
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0, fog: false }));
  scene.add(stars);
}
function paintBg(top, bot) {
  const g = bgCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(1, '#' + bot.getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256); bgTex.needsUpdate = true;
}
function fitCamera() {
  camera.aspect = W / H;
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfW = COLS_ / 2 + 1.0, halfH = ROWS_ / 2 + 0.9;
  D = Math.max(halfH / tv, halfW / (tv * camera.aspect)) * 1.0 + 1.0;
  camera.updateProjectionMatrix();
}
function setCam(t, F) {
  const sway = F.title ? Math.sin(t * 0.35) * 0.6 : Math.sin(t * 0.25) * 0.12;
  let sx = 0, sy = 0;
  if (F.shake > 0) { sx = (Math.random() - 0.5) * F.shake * 0.5; sy = (Math.random() - 0.5) * F.shake * 0.5; }
  const z = D - punch * 1.6;
  camera.position.set(D * (0.16 + sway * 0.06) + sx, D * 0.24 + sy, z * 0.97);
  camera.lookAt(sx * 0.5 + 0.25, -0.35 + sy * 0.5, 0);
}
function spawnPart(x, y, z, color, speed) {
  const s = partState[partIdx]; partIdx = (partIdx + 1) % PART_N;
  s.p.set(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + Math.random() * 0.3);
  const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random());
  s.v.set(Math.cos(a) * v, Math.sin(a) * v + speed * 0.6, 2 + Math.random() * speed * 1.1);
  s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  s.vr.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
  s.t = 0; s.life = 0.7 + Math.random() * 0.5; s.s = 0.6 + Math.random() * 0.9;
  parts.setColorAt(partIdx === 0 ? PART_N - 1 : partIdx - 1, tmpC.set(color));
  parts.instanceColor.needsUpdate = true;
}

const V = {
  name: '3d',
  init(stageEl, canvas) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    if (!renderer || !renderer.getContext()) return false;
    dprCur = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dprCur);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    buildScene();
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); });
    return true;
  },
  resize(w, h) {
    W = Math.max(1, w); H = Math.max(1, h);
    renderer.setSize(W, H, false);
    fitCamera();
  },
  cellPx() {
    const a = this.project(0, 0), b = this.project(1, 0);
    return Math.max(10, Math.abs(b.x - a.x));
  },
  project(gx, gy) {
    tmpV.set(wx(gx), wy(gy), 0.35).project(camera);
    return { x: (tmpV.x + 1) / 2 * W, y: (1 - tmpV.y) / 2 * H };
  },
  event(e) {
    if (e.t === 'burst') {
      const x = wx(e.x), y = wy(e.y), c = PAL[e.h].hex, c2 = new THREE.Color(PAL[e.h].a).getHex();
      for (let i = 0; i < e.n; i++) spawnPart(x, y, 0.3, i % 3 === 0 ? c2 : c, 4.5);
    } else if (e.t === 'ring') {
      const r = rings.find(m => m.userData.t >= 1) || rings[0];
      r.userData = { t: 0, c: e.c }; r.position.set(wx(e.x), wy(e.y), 0.6); r.material.color.set(e.c); r.visible = true;
    } else if (e.t === 'punch') punch = Math.max(punch, e.s);
    else if (e.t === 'confetti') {
      const cols = [0xffe066, 0xff6b81, 0x5aa9ff, 0x51d06f, 0xb48cff];
      for (let i = 0; i < 70; i++) spawnPart((Math.random() - 0.5) * 7, ROWS_ / 2 - Math.random() * 2, 1, cols[i % 5], 5);
    } else if (e.t === 'drop') {
      for (const c of e.cells) for (let i = 0; i < 3; i++) spawnPart(wx(c.x), wy(c.y) - 0.4, 0.2, 0xffffff, 2);
    }
  },
  render(F, dt) {
    const t = performance.now() / 1000;
    // 空の色(レベルで変わる。ゆっくり うつりかわる)
    const th = THEME[F.theme];
    if (themeIdx < 0) { themeCur.top.set(th.top); themeCur.bot.set(th.bot); themeCur.fog.set(th.fog); themeIdx = F.theme; paintBg(themeCur.top, themeCur.bot); }
    const k = Math.min(1, dt * 1.5);
    const before = themeCur.top.getHex() + themeCur.bot.getHex();
    themeCur.top.lerp(tmpC.set(th.top), k); themeCur.bot.lerp(tmpC.set(th.bot), k); themeCur.fog.lerp(tmpC.set(th.fog), k);
    if (themeCur.top.getHex() + themeCur.bot.getHex() !== before) paintBg(themeCur.top, themeCur.bot);
    scene.fog.color.copy(themeCur.fog);
    hemi.color.lerp(tmpC.set(th.sky), k); hemi.groundColor.lerp(tmpC.set(th.gnd), k);
    stars.material.opacity += (th.stars - stars.material.opacity) * k;
    stars.rotation.z += dt * 0.01;
    // ふちの光: ピンチは赤、フィーバーは虹
    if (F.danger) { frameMat.emissive.set(0xff3355); frameMat.emissiveIntensity = 0.7 + 0.5 * Math.sin(t * 9); }
    else if (F.fever) { frameMat.emissive.setHSL((t * 0.6) % 1, 0.9, 0.55); frameMat.emissiveIntensity = 1.2; }
    else { frameMat.emissive.lerp(tmpC.set(th.acc), k); frameMat.emissiveIntensity = 0.55; }
    // 遠くのブロック
    const spd = F.fever ? 4 : 1;
    for (const m of deco) {
      m.rotation.x += m.userData.vr.x * dt * spd; m.rotation.y += m.userData.vr.y * dt * spd; m.rotation.z += m.userData.vr.z * dt * spd;
      m.position.y += m.userData.vy * dt * spd;
      if (m.position.y > 34) m.position.y = -34;
    }
    punch = Math.max(0, punch - dt * 2.2);
    setCam(t, F);

    // ブロック
    let n = 0, pieceX = 0, pieceY = 0, pieceN = 0;
    for (let i = 0; i < F.cells.length && n < pool.length; i++) {
      const c = F.cells[i], m = pool[n++];
      m.visible = true;
      m.material = mats[c.h][c.v] || mats[c.h][0];
      const bob = c.piece ? Math.sin(t * 5) * 0.04 : 0;
      m.position.set(wx(c.x), wy(c.y) + bob, c.piece ? 0.12 : 0);
      m.rotation.set(c.piece ? -0.06 : 0, c.piece ? Math.sin(t * 3) * 0.05 : 0, c.rz || 0);
      m.scale.set(c.s * (c.sx || 1), c.s * (c.sy || 1), c.s);
      if (F.title) m.rotation.y = Math.sin(t * 0.8 + c.x * 0.6 + c.y * 0.4) * 0.12;
      if (c.piece) { pieceX += m.position.x; pieceY += m.position.y; pieceN++; }
    }
    for (; n < pool.length; n++) pool[n].visible = false;
    // 落ちているブロックを照らす 小さな明かり(フィーバー中は にじ色)
    if (pieceN) {
      pointL.position.set(pieceX / pieceN, pieceY / pieceN, 2.2);
      pointL.intensity = F.fever ? 6 : 2.5;
      if (F.fever) pointL.color.setHSL((t * 0.8) % 1, 1, 0.6); else pointL.color.set(0xffffff);
    } else pointL.intensity = 0;
    // かげ
    for (let i = 0; i < ghostPool.length; i++) {
      const g = ghostPool[i], q = F.ghost[i];
      if (!q) { g.visible = false; continue; }
      g.visible = true; g.material = ghostMats[q.h];
      g.material.opacity = 0.22 + 0.1 * Math.sin(t * 6);
      g.userData.ln.material.color.set(PAL[q.h].a);
      g.position.set(wx(q.x), wy(q.y), 0); g.scale.set(0.96, 0.96, 0.96);
    }
    // 光の線
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i], q = F.beams[i];
      if (!q) { b.visible = false; continue; }
      const x1 = wx(q.x1), y1 = wy(q.y1), x2 = wx(q.x2), y2 = wy(q.y2), len = Math.hypot(x2 - x1, y2 - y1);
      b.visible = true; b.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.55);
      b.rotation.set(0, 0, Math.atan2(y2 - y1, x2 - x1));
      b.scale.set(len * Math.min(1, q.k * 1.8), 1 + 0.6 * Math.sin(q.k * Math.PI), 1);
      b.material.color.set(q.c); b.material.opacity = 0.95 * (1 - Math.max(0, q.k - 0.7) / 0.3);
    }
    // 輪
    for (const r of rings) {
      if (!r.visible) continue;
      r.userData.t += dt;
      const rk = r.userData.t / 1.0;
      if (rk >= 1) { r.visible = false; r.userData.t = 9; continue; }
      const sc = 0.4 + rk * 7; r.scale.set(sc, sc, sc); r.material.opacity = 1 - rk;
    }
    // こなごな
    let anyPart = false;
    for (let i = 0; i < PART_N; i++) {
      const s = partState[i];
      if (s.t >= s.life) { if (s.life) { tmpM.makeScale(0, 0, 0); parts.setMatrixAt(i, tmpM); s.life = 0; anyPart = true; } continue; }
      s.t += dt; anyPart = true;
      s.v.y -= 11 * dt; s.p.addScaledVector(s.v, dt);
      s.r.addScaledVector(s.vr, dt);
      const a = 1 - s.t / s.life, sc = s.s * Math.min(1, a * 2.5);
      tmpQ.setFromEuler(tmpE.set(s.r.x, s.r.y, s.r.z));
      tmpM.compose(s.p, tmpQ, tmpS.set(sc, sc, sc)); parts.setMatrixAt(i, tmpM);
    }
    if (anyPart) parts.instanceMatrix.needsUpdate = true;
    // 遅い機械では きめを少し粗くする
    if (lastT) {
      const ft = t - lastT;
      if (ft > 0.028) { slowT += ft; fastT = 0; } else { fastT += ft; slowT = Math.max(0, slowT - ft * 0.5); }
      if (slowT > 1.5 && dprCur > 1) { dprCur = Math.max(1, dprCur - 0.5); renderer.setPixelRatio(dprCur); renderer.setSize(W, H, false); slowT = 0; }
    }
    lastT = t;
    renderer.render(scene, camera);
  }
};
window.VIEW3D = V;
