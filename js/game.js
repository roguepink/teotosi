'use strict';
/* =========================================================
   テオトシ 3D — 進行・入力・音・画面の文字(HUD)
   絵は「描く係」(view3d.js の 3D か、下の VIEW2D)に まかせる。
   毎フレーム buildFrame() で「どこに何を描くか」の一覧を作って渡す。
   ========================================================= */
function $(id) { return document.getElementById(id); }
var stage = $('stage'), cv3 = $('c3'), cv2 = $('c2'), fxLayer = $('fx');

var G = {
  state: 'title', phase: 'fall', grid: L.empty(), piece: null, next: [], hold: null, holdUsed: false,
  score: 0, shown: 0, best: 0, level: 1, cleared: 0, beaten: 0, maxChain: 0, maxCombo: 0, pieces: 0,
  fallT: 0, lockT: 0, lockResets: 0, softKey: false, softBtn: false, vis: { x: 0, y: 0 },
  res: null, riseIn: 0, rise: null, deadT: 0, overShown: false,
  t: 0, shake: 0, land: null, rotFx: 0, rotDir: 1, holdFx: 0,
  combo: 0, fever: 0, feverT: 0, mission: null, missionNo: 0, missionsDone: 0, pinchCool: 0,
  lockSum: null, ev: [], boxSeen: false, bombSeen: false
};
try { G.best = +localStorage.getItem(CONFIG.BEST_KEY) || 0; } catch (e) {}

/* ---------- ブロックの絵(2D)。3D の表面の絵にも使う ---------- */
var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Android Emoji",sans-serif';
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
// 絵文字を1つ描いて、色がついた範囲を調べ、正方形の真ん中に置く(iPhone の WebKit は ✌️ の幅をまちがえるため)
var GLYPH_CACHE = {};
function emojiGlyph(i, px) {
  px = Math.max(4, Math.round(px));
  var key = i + ':' + px;
  if (GLYPH_CACHE[key]) return GLYPH_CACHE[key];
  var big = px * 2, t = document.createElement('canvas'); t.width = t.height = big;
  var g = t.getContext('2d');
  g.font = px + 'px ' + EMOJI_FONT; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(HANDS[i], px * 0.3, big / 2);
  var out = document.createElement('canvas'); out.width = out.height = px;
  var o = out.getContext('2d'), d = null;
  try { d = g.getImageData(0, 0, big, big).data; } catch (e) {}
  var minx = big, miny = big, maxx = -1, maxy = -1;
  if (d) for (var y = 0; y < big; y++) for (var x = 0; x < big; x++) {
    if (d[(y * big + x) * 4 + 3] > 10) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  if (maxx < 0) {
    o.font = Math.round(px * 0.86) + 'px ' + EMOJI_FONT; o.textAlign = 'center'; o.textBaseline = 'middle';
    o.fillText(HANDS[i], px / 2, px * 0.54);
  } else {
    var w = maxx - minx + 1, h = maxy - miny + 1, k = Math.min(px / w, px / h), dw = w * k, dh = h * k;
    o.drawImage(t, minx, miny, w, h, (px - dw) / 2, (px - dh) / 2, dw, dh);
  }
  GLYPH_CACHE[key] = out;
  return out;
}
// 表面の絵(x,y から s の正方形)。variant 1 = こわがっている(消される予告)
function paintFace(g, h, x, y, s, variant) {
  var P = PAL[h], gr;
  if (h === 5) { gr = g.createLinearGradient(x, y, x + s, y + s); gr.addColorStop(0, '#ffe066'); gr.addColorStop(0.35, '#ff9ee0'); gr.addColorStop(0.7, '#b48cff'); gr.addColorStop(1, '#5fc8ff'); }
  else { gr = g.createLinearGradient(x, y, x, y + s); gr.addColorStop(0, P.a); gr.addColorStop(1, P.b); }
  g.fillStyle = gr; g.fillRect(x, y, s, s);
  g.globalAlpha = 0.32; g.fillStyle = '#fff'; rr(g, x + s * 0.14, y + s * 0.08, s * 0.72, s * 0.15, s * 0.07); g.fill();
  if (h !== 4) { g.globalAlpha = 0.2; g.beginPath(); g.arc(x + s / 2, y + s * 0.5, s * 0.34, 0, 6.2832); g.fill(); }
  g.globalAlpha = 1;
  if (h === 4) {        // いわ: 古いスマホでも出るように ヒビを描く
    g.strokeStyle = 'rgba(40,36,56,.75)'; g.lineWidth = Math.max(1, s * 0.05); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x + s * 0.3, y + s * 0.22); g.lineTo(x + s * 0.44, y + s * 0.44); g.lineTo(x + s * 0.36, y + s * 0.6); g.lineTo(x + s * 0.5, y + s * 0.8);
    g.moveTo(x + s * 0.44, y + s * 0.44); g.lineTo(x + s * 0.64, y + s * 0.38); g.lineTo(x + s * 0.74, y + s * 0.22);
    g.moveTo(x + s * 0.64, y + s * 0.38); g.lineTo(x + s * 0.7, y + s * 0.62); g.stroke();
  } else {
    var es = Math.round(s * 0.6);
    g.drawImage(emojiGlyph(h, es), x + (s - es) / 2, y + s * 0.5 - es / 2, es, es);
  }
  if (variant === 1) {  // 消される予告: 赤い「!」
    var r = s * 0.17, cx = x + s * 0.8, cy = y + s * 0.2;
    g.fillStyle = '#ff3355'; g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, s * 0.03); g.stroke();
    g.fillStyle = '#fff'; g.font = '900 ' + Math.round(r * 1.6) + 'px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('!', cx, cy + r * 0.08);
  }
}
function makeBlock(h, px, variant) {
  var c = document.createElement('canvas'); c.width = c.height = px;
  var g = c.getContext('2d'), p = Math.max(1, px * 0.045), r = px * 0.22;
  rr(g, p, p, px - 2 * p, px - 2 * p, r); g.fillStyle = PAL[h].e; g.fill();
  g.save(); rr(g, p, p, px - 2 * p, px - 2 * p - px * 0.08, r); g.clip();
  paintFace(g, h, p, p, px - 2 * p, variant); g.restore();
  return c;
}

/* ---------- 音(WebAudio・外部ファイルなし) ---------- */
var AU = { c: null, g: null, muted: false, noiseBuf: null, bgmT: 0, step: 0, timer: null };
try { AU.muted = localStorage.getItem(CONFIG.MUTE_KEY) === '1'; } catch (e) {}
function audioInit() {
  try {
    if (!AU.c) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      AU.c = new AC(); AU.g = AU.c.createGain(); AU.g.gain.value = 0.55; AU.g.connect(AU.c.destination);
      var len = AU.c.sampleRate * 0.3, buf = AU.c.createBuffer(1, len, AU.c.sampleRate), ch = buf.getChannelData(0);
      for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      AU.noiseBuf = buf;
    }
    if (AU.c.state === 'suspended') AU.c.resume();
  } catch (e) {}
}
function tone(f, d, type, v, f2, delay, at) {
  if (!AU.c || AU.muted) return;
  try {
    var t = (at || AU.c.currentTime) + (delay || 0), o = AU.c.createOscillator(), g = AU.c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(AU.g); o.start(t); o.stop(t + d + 0.03);
  } catch (e) {}
}
function noise(d, v, delay, at, hp) {
  if (!AU.c || AU.muted || !AU.noiseBuf) return;
  try {
    var t = (at || AU.c.currentTime) + (delay || 0), s = AU.c.createBufferSource(), g = AU.c.createGain(), f = AU.c.createBiquadFilter();
    s.buffer = AU.noiseBuf; f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp || 900;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(AU.g); s.start(t); s.stop(t + d + 0.02);
  } catch (e) {}
}
var SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093];
var SFX = {
  move: function () { tone(420, 0.035, 'square', 0.03); },
  rot: function () { tone(620, 0.06, 'triangle', 0.08, 900); },
  lock: function () { tone(210, 0.09, 'sine', 0.25, 110); },
  drop: function () { tone(160, 0.14, 'sine', 0.3, 55); noise(0.08, 0.08); },
  hold: function () { tone(520, 0.07, 'triangle', 0.1, 390); },
  hit: function (chain, n) {
    var b = Math.min(SCALE.length - 1, (chain - 1) * 2);
    for (var i = 0; i < Math.min(n, 4); i++) tone(SCALE[Math.min(SCALE.length - 1, b + i)], 0.16, 'triangle', 0.14, 0, i * 0.045);
    noise(0.06, 0.05, 0, 0, 2000);
  },
  nakayoshi: function (chain) {
    var b = Math.min(6, chain);
    for (var i = 0; i < 5; i++) tone(SCALE[Math.min(SCALE.length - 1, b + i)] * 1.5, 0.12, 'sine', 0.09, 0, i * 0.035);
  },
  box: function () { tone(300, 0.5, 'sawtooth', 0.05, 1800); for (var i = 0; i < 6; i++) tone(SCALE[2 + i], 0.22, 'triangle', 0.11, 0, 0.12 + i * 0.05); },
  bomb: function () { noise(0.5, 0.35); tone(90, 0.4, 'sine', 0.4, 35); },
  fever: function () { var f = [523, 659, 784, 1047, 1319, 1568]; for (var i = 0; i < 6; i++) tone(f[i], 0.2, 'square', 0.06, 0, i * 0.06); },
  mission: function () { var f = [784, 988, 1175, 1568]; for (var i = 0; i < 4; i++) tone(f[i], 0.25, 'triangle', 0.12, 0, i * 0.08); },
  level: function () { var f = [659, 784, 988, 1319]; for (var i = 0; i < 4; i++) tone(f[i], 0.18, 'square', 0.05, 0, i * 0.09); },
  combo: function (n) { tone(880 + Math.min(n, 10) * 60, 0.08, 'sine', 0.08); },
  rise: function () { tone(90, 0.3, 'sawtooth', 0.06, 55); },
  over: function () { var f = [523, 440, 349, 262]; for (var i = 0; i < 4; i++) tone(f[i], 0.3, 'triangle', 0.12, 0, i * 0.16); }
};
// BGM: C → Am → F → G のくり返し。フィーバー中は 速く・高く
var CHORDS = [
  { root: 130.81, arp: [261.6, 329.6, 392.0, 523.3] },
  { root: 110.0, arp: [220.0, 261.6, 329.6, 440.0] },
  { root: 87.31, arp: [174.6, 220.0, 261.6, 349.2] },
  { root: 98.0, arp: [196.0, 246.9, 293.7, 392.0] }
];
function bgmWanted() { return AU.c && !AU.muted && G.state === 'play' && G.phase !== 'dead' && !document.hidden; }
function bgmTick() {
  if (!bgmWanted()) { AU.bgmT = 0; return; }
  var now = AU.c.currentTime, fever = G.feverT > 0, bpm = fever ? 150 : 112 + Math.min(16, G.level * 1.2);
  var stepDur = 60 / bpm / 4;
  if (!AU.bgmT || AU.bgmT < now) AU.bgmT = now + 0.05;
  while (AU.bgmT < now + 0.2) {
    var s = AU.step % 16, bar = Math.floor(AU.step / 16) % 4, ch = CHORDS[bar], t = AU.bgmT;
    if (s === 0 || s === 8) tone(ch.root, stepDur * 3, 'triangle', 0.07, 0, 0, t);
    if (s === 6 || s === 14) tone(ch.root * 1.5, stepDur * 1.5, 'triangle', 0.045, 0, 0, t);
    if (fever || s % 2 === 0) {
      var note = ch.arp[(s / (fever ? 1 : 2) | 0) % 4] * (fever ? 2 : 1);
      tone(note, stepDur * 1.6, 'triangle', fever ? 0.022 : 0.026, 0, 0, t);
    }
    if (s === 4 || s === 12) noise(0.05, 0.03, 0, t, 5000);
    if (fever && s % 2 === 1) noise(0.03, 0.015, 0, t, 7000);
    AU.step++; AU.bgmT += stepDur;
  }
}
setInterval(function () { try { bgmTick(); } catch (e) {} }, 50);
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
function setMute(m) {
  AU.muted = m;
  try { localStorage.setItem(CONFIG.MUTE_KEY, m ? '1' : '0'); } catch (e) {}
  $('btnMute').classList.toggle('off', m);
  if (!m) { audioInit(); SFX.rot(); }
}

/* ---------- ゲームの進行 ---------- */
function newGame() {
  G.grid = L.empty();
  for (var y = ROWS - 3; y < ROWS; y++) G.grid[y] = garbageRow(y === ROWS - 3 ? 4 : 2);
  breakGroups(G.grid);
  G.score = 0; G.shown = 0; G.level = 1; G.cleared = 0; G.beaten = 0; G.maxChain = 0; G.maxCombo = 0; G.pieces = 0;
  G.hold = null; G.holdUsed = false; G.res = null; G.rise = null; G.riseIn = 0; G.deadT = 0; G.overShown = false;
  G.shake = 0; G.t = 0; G.combo = 0; G.fever = 0; G.feverT = 0; G.missionNo = 0; G.missionsDone = 0; G.pinchCool = 0;
  G.boxSeen = false; G.bombSeen = false; G.ev = [];
  G.next = [makePiece(1), makePiece(1)];
  G.mission = null;     // 前のゲームのおだいを消してから選ぶ(残っていると 選びなおしが終わらなかった)
  newMission();
  fxLayer.innerHTML = '';
  banner('スタート！', 'となりに勝って 消していこう', '同じ手が4つ つながっても 消えるよ', 'start', 2.4);
  spawn();
  hud(true);
}
function spawn() {
  var p = G.next.shift();
  G.next.push(makePiece(G.level));
  placeAtTop(p);
  G.piece = p;
  if (!L.fits(G.grid, p.cells, p.x, p.y)) { die(); return; }
  var sp = pieceSpecial(p);
  if (sp === 5 && !G.boxSeen) { G.boxSeen = true; banner('🎁 スペシャルボックス', 'ふれた種類を ぜんぶ消す', '消えるブロックに「!」がつくよ', 'special', 3); }
  if (sp === 6 && !G.bombSeen) { G.bombSeen = true; banner('💣 ばくだん', 'まわり8マスを ドカン！', 'いわ も消せるよ', 'special', 3); }
  G.vis = { x: p.x, y: p.y - 0.8 };
  G.fallT = 0; G.lockT = 0; G.lockResets = 0; G.phase = 'fall';
}
function placeAtTop(p) {
  var minY = 99;
  for (var i = 0; i < p.cells.length; i++) minY = Math.min(minY, p.cells[i].y);
  p.x = Math.floor((COLS - p.n) / 2); p.y = -minY;
}
function canAct() { return G.state === 'play' && G.phase === 'fall' && G.piece; }
function grounded() { var p = G.piece; return p && !L.fits(G.grid, p.cells, p.x, p.y + 1); }
function lockReset() { if (G.lockT > 0 && G.lockResets < CONFIG.LOCK_RESETS) { G.lockT = 0; G.lockResets++; } }
function tryMove(dx, dy, auto) {
  if (!canAct()) return false;
  var p = G.piece;
  if (!L.fits(G.grid, p.cells, p.x + dx, p.y + dy)) return false;
  p.x += dx; p.y += dy;
  if (!auto) { if (dx) SFX.move(); lockReset(); }
  return true;
}
var KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1], [0, 1]];
function tryRotate(dir) {
  if (!canAct()) return false;
  var p = G.piece, nc = rotCells(p, dir);
  for (var i = 0; i < KICKS.length; i++) {
    var kx = KICKS[i][0], ky = KICKS[i][1];
    if (L.fits(G.grid, nc, p.x + kx, p.y + ky)) {
      p.cells = nc; p.x += kx; p.y += ky;
      if (p.n > 1) { G.rotFx = 1; G.rotDir = dir; }
      SFX.rot(); lockReset(); return true;
    }
  }
  return false;
}
function ghostY() {
  var p = G.piece, y = p.y;
  while (L.fits(G.grid, p.cells, p.x, y + 1)) y++;
  return y;
}
function hardDrop() {
  if (!canAct()) return;
  var p = G.piece, y0 = p.y, y = ghostY();
  G.score += (y - y0) * 2;
  p.y = y; G.vis.y = y; G.vis.x = p.x;
  SFX.drop(); G.shake = Math.max(G.shake, 0.2);
  G.ev.push({ t: 'drop', cells: p.cells.map(function (c) { return { x: p.x + c.x, y: y + c.y, y0: y0 + c.y }; }) });
  lock();
}
function sameShape(cells, def) {
  if (cells.length !== def.length) return false;
  for (var i = 0; i < def.length; i++) {
    var ok = false;
    for (var j = 0; j < cells.length; j++) if (cells[j].x === def[i][0] && cells[j].y === def[i][1]) { ok = true; break; }
    if (!ok) return false;
  }
  return true;
}
function doHold() {
  if (!canAct() || G.holdUsed) return;
  var cur = G.piece, S = SHAPES[cur.key], restored = { key: cur.key, n: cur.n, cells: cur.cells, x: 0, y: 0 }, tmp = cur.cells;
  for (var r = 0; r < 4; r++) { if (sameShape(tmp, S.c)) { restored.cells = tmp; break; } tmp = rotCells({ n: cur.n, cells: tmp }, 1); }
  if (G.hold) {
    var h = G.hold; G.hold = restored; placeAtTop(h); G.piece = h;
    if (!L.fits(G.grid, h.cells, h.x, h.y)) { die(); return; }
    G.vis = { x: h.x, y: h.y - 0.8 }; G.fallT = 0; G.lockT = 0; G.lockResets = 0;
  } else { G.hold = restored; spawn(); }
  G.holdUsed = true; G.holdFx = 1; SFX.hold();
}
function lock() {
  var p = G.piece, att = [], out = false;
  for (var i = 0; i < p.cells.length; i++) {
    var x = p.x + p.cells[i].x, y = p.y + p.cells[i].y;
    if (y < 0) { out = true; continue; }
    G.grid[y][x] = { h: p.cells[i].h }; att.push({ x: x, y: y });
  }
  G.piece = null; G.holdUsed = false; G.pieces++;
  SFX.lock(); buzz(8);
  G.land = { cells: att, t: 0 };
  if (out) { die(); return; }
  G.lockSum = { total: 0, chain: 0, kinds: [0, 0, 0, 0, 0, 0, 0], naka: 0, box: 0, bomb: 0 };
  var r = L.resolve(G.grid, att, { fever: G.feverT > 0 });
  if (!r.steps.length) { G.grid = r.grid; afterLock(); return; }
  G.res = { steps: r.steps, final: r.grid, i: 0, ph: 'flash', t: 0 };
  G.phase = 'resolve';
}
function scoreMul() { return (G.feverT > 0 ? 2 : 1) * (1 + Math.min(G.combo, 10) * 0.1); }
function applyStep(st) {
  var n = st.hits.length, cx = 0, cy = 0, S = G.lockSum, i;
  var pts = Math.round(L.points(st) * scoreMul());
  G.score += pts; G.cleared += n;
  G.maxChain = Math.max(G.maxChain, st.chain);
  S.total += n; S.chain = Math.max(S.chain, st.chain);
  if (st.kind === 'nakayoshi') S.naka += st.groups;
  for (i = 0; i < n; i++) {
    var h = st.hits[i];
    S.kinds[h.h]++;
    if (st.kind === 'janken' && !h.self) G.beaten++;
    cx += h.x; cy += h.y;
    G.ev.push({ t: 'burst', x: h.x, y: h.y, h: h.h, n: n > 20 ? 5 : n > 10 ? 8 : 12 });
  }
  cx /= n; cy /= n;
  popup(cx, cy, '+' + pts, st.chain > 1 ? 'gold' : '');
  // フィーバーゲージ
  if (G.feverT <= 0) {
    G.fever = Math.min(CONFIG.FEVER_MAX, G.fever + n + (st.chain - 1) * 2);
    if (G.fever >= CONFIG.FEVER_MAX) startFever();
  }
  if (st.kind === 'nakayoshi') { SFX.nakayoshi(st.chain); popup(cx, cy - 1, 'なかよし！', 'pink'); }
  else SFX.hit(st.chain, n);
  if (st.chain >= 2) { big(st.chain + 'れんさ！', 'chain'); buzz(st.chain >= 3 ? [15, 30, 25] : 15); }
  else buzz(10);
  if (st.chain >= 3 || n >= 6) { G.shake = Math.max(G.shake, 0.35); G.ev.push({ t: 'punch', s: 0.4 }); }
  for (i = 0; i < n; i++) {
    var sh = st.hits[i];
    if (!sh.self) continue;
    if (sh.h === 5) {
      S.box++;
      var names = [];
      for (var kk in sh.kinds) names.push(KIND_NAME[kk]);
      G.ev.push({ t: 'ring', x: sh.x, y: sh.y, c: 0xff9ee0 });
      if (names.length) { big(names.join('と') + ' ぜんぶ消し！', 'box'); SFX.box(); G.shake = Math.max(G.shake, 0.5); G.ev.push({ t: 'punch', s: 0.7 }); buzz([20, 30, 40]); }
      else popup(sh.x, sh.y - 0.6, 'からぶり…', 'gray');
    } else if (sh.h === 6) {
      S.bomb++;
      G.ev.push({ t: 'ring', x: sh.x, y: sh.y, c: 0xff7b54 });
      big('ドカーン！', 'bomb'); SFX.bomb(); G.shake = Math.max(G.shake, 0.6); G.ev.push({ t: 'punch', s: 0.8 }); buzz([40, 20, 40]);
    } else if (sh.h === 3) G.ev.push({ t: 'ring', x: sh.x, y: sh.y, c: 0xffe066 });
  }
  if (st.chain === CONFIG.BOX_REWARD_CHAIN && G.next[1]) {
    giveSpecial(G.next[1], 5);
    popup(COLS / 2 - 0.5, ROWS * 0.4, 'ごほうび 🎁', 'pink big');
  }
}
function startFever() {
  G.feverT = CONFIG.FEVER_TIME; G.fever = CONFIG.FEVER_MAX;
  big('フィーバー！', 'fever');
  banner('フィーバー！', 'あいこ以外 ぜんぶ勝ち！', '点数 2ばい', 'fever', 2.2);
  SFX.fever(); buzz([20, 20, 20, 20, 40]); G.ev.push({ t: 'punch', s: 0.6 });
}
function afterLock() {
  var S = G.lockSum || { total: 0, chain: 0, kinds: [0, 0, 0, 0, 0, 0, 0], naka: 0, box: 0, bomb: 0 };
  // コンボ: 続けて消すと 点数アップ
  if (S.total > 0) {
    G.combo++;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    if (G.combo >= 2) { popup(COLS / 2 - 0.5, 1.5, G.combo + ' コンボ', 'combo'); SFX.combo(G.combo); }
  } else G.combo = 0;
  checkMission(S);
  // レベル
  var nl = levelFor(G.cleared);
  if (nl > G.level) {
    var oldTheme = themeFor(G.level);
    G.level = nl;
    var msg = LEVEL_MSG[nl] || ['スピードアップ！', 'まだまだ いける'];
    var th = themeFor(nl);
    banner('レベル ' + nl, msg[0], th !== oldTheme ? 'ステージ「' + THEMES[th] + '」' : msg[1], 'level', 2.8);
    SFX.level();
    if (nl >= CONFIG.RISE_FROM && G.riseIn <= 0) G.riseIn = riseEvery(nl) + 1;
  }
  // ピンチのときは たすけの💣
  if (G.pinchCool > 0) G.pinchCool--;
  if (G.pinchCool <= 0 && dangerRows(CONFIG.PINCH_ROWS) && G.next[0]) {
    giveSpecial(G.next[0], 6); G.pinchCool = CONFIG.PINCH_COOL;
    popup(COLS / 2 - 0.5, 3, 'ピンチ！ たすけの💣', 'red big');
  }
  if (G.level >= CONFIG.RISE_FROM) {
    if (G.riseIn <= 0) G.riseIn = riseEvery(G.level);
    G.riseIn--;
    if (G.riseIn <= 0) { doRise(); return; }
  }
  spawn();
}
function dangerRows(n) {
  for (var y = 0; y < n; y++) for (var x = 0; x < COLS; x++) if (G.grid[y][x]) return true;
  return false;
}
function doRise() {
  for (var x = 0; x < COLS; x++) if (G.grid[0][x]) { die(); return; }
  var stones = G.level >= 15 ? 3 : G.level >= 12 ? 2 : G.level >= CONFIG.STONE_FROM ? 1 : 0;
  G.grid.shift(); G.grid.push(garbageRow(G.level >= 12 ? 1 : 2, stones));
  breakGroups(G.grid);
  G.rise = { t: 0 }; G.phase = 'rise'; SFX.rise(); G.shake = Math.max(G.shake, 0.2); buzz(20);
  G.riseIn = riseEvery(G.level);
}
function die() {
  if (G.phase === 'dead') return;
  G.phase = 'dead'; G.deadT = 0; G.res = null; G.feverT = 0; SFX.over(); buzz([30, 50, 80]);
}
var RANKS = [[0, 'じゃんけん みならい'], [1500, 'じゃんけん ファイター'], [4000, 'じゃんけん 名人'], [10000, 'じゃんけん 達人'],
  [25000, 'じゃんけん 王'], [60000, 'じゃんけん 神']];
function rankFor(s) { var r = RANKS[0][1]; for (var i = 0; i < RANKS.length; i++) if (s >= RANKS[i][0]) r = RANKS[i][1]; return r; }
function showOver() {
  G.state = 'over'; G.overShown = true;
  var rec = G.score > G.best && G.score > 0;
  if (rec) { G.best = G.score; try { localStorage.setItem(CONFIG.BEST_KEY, String(G.best)); } catch (e) {} }
  $('overScore').textContent = G.score;
  $('overRank').textContent = rankFor(G.score);
  $('stLevel').textContent = G.level;
  $('stChain').textContent = G.maxChain;
  $('stCombo').textContent = G.maxCombo;
  $('stMission').textContent = G.missionsDone;
  $('stBest').textContent = G.best;
  $('stBeat').textContent = G.cleared;
  $('newRec').classList.toggle('hidden', !rec);
  show('over'); setBestLine();
}

/* ---------- おだい(ミッション) ---------- */
var MISSION_TYPES = ['kill', 'chain', 'naka', 'big', 'combo'];
var REWARDS = [[6, '💣'], [5, '🎁'], [3, '⭐']];
function newMission() {
  var n = G.missionNo, last = G.mission ? G.mission.type : '', t;
  if (n === 0) t = 'kill';
  else { var c = MISSION_TYPES.filter(function (x) { return x !== last; }); t = c[rnd(c.length)]; }
  var m = { type: t, prog: 0, goal: 1 };
  if (t === 'kill') { m.h = rnd(3); m.goal = Math.min(40, 6 + n * 3); m.text = KIND_NAME[m.h] + 'を' + m.goal + 'コ消す'; }
  else if (t === 'chain') { m.goal = Math.min(5, 2 + Math.floor(n / 3)); m.text = m.goal + 'れんさを出す'; }
  else if (t === 'naka') { m.goal = 1 + Math.floor(n / 4); m.text = 'なかよし消し' + m.goal + '回'; }
  else if (t === 'big') { m.goal = Math.min(14, 5 + Math.floor(n / 2)); m.text = 'いっぺんに' + m.goal + 'コ消す'; }
  else { m.goal = Math.min(8, 3 + Math.floor(n / 3)); m.text = m.goal + 'コンボする'; }
  m.reward = REWARDS[n % REWARDS.length];
  G.mission = m;
  hud(true);
}
function checkMission(S) {
  var m = G.mission; if (!m) return;
  if (m.type === 'kill') m.prog = Math.min(m.goal, m.prog + S.kinds[m.h]);
  else if (m.type === 'chain') m.prog = Math.max(m.prog, S.chain >= m.goal ? m.goal : 0);
  else if (m.type === 'naka') m.prog = Math.min(m.goal, m.prog + S.naka);
  else if (m.type === 'big') m.prog = Math.max(m.prog, S.total >= m.goal ? m.goal : 0);
  else m.prog = Math.max(m.prog, Math.min(m.goal, G.combo));
  if (m.prog >= m.goal) {
    G.missionsDone++; G.missionNo++;
    var bonus = 200 * G.missionNo;
    G.score += bonus;
    if (G.next[1]) giveSpecial(G.next[1], m.reward[0]);
    if (G.feverT <= 0) { G.fever = Math.min(CONFIG.FEVER_MAX, G.fever + 10); if (G.fever >= CONFIG.FEVER_MAX) startFever(); }
    banner('おだい クリア！', 'ごほうび ' + m.reward[1] + '  ＋' + bonus + '点', m.text, 'mission', 2.4);
    SFX.mission(); buzz([15, 30, 15]);
    G.ev.push({ t: 'confetti' });
    newMission();
  }
}

/* ---------- 文字の演出(HTML) ---------- */
function popup(gx, gy, txt, cls) {
  var p = R ? R.project(gx, gy) : { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
  var d = document.createElement('div');
  d.className = 'pop ' + (cls || ''); d.textContent = txt;
  d.style.left = Math.round(p.x) + 'px'; d.style.top = Math.round(p.y) + 'px';
  fxLayer.appendChild(d);
  setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1300);
}
var bigTimer = 0;
function big(txt, cls) {
  var b = $('big');
  b.className = ''; void b.offsetWidth;
  b.textContent = txt; b.className = 'show ' + (cls ? 'g-' + cls : '');
  clearTimeout(bigTimer); bigTimer = setTimeout(function () { b.className = ''; }, 1300);
}
var bannerTimer = 0;
function banner(title, msg, sub, cls, life) {
  var b = $('banner');
  b.className = ''; void b.offsetWidth;
  b.innerHTML = '';
  var t = document.createElement('div'); t.className = 'bt'; t.textContent = title; b.appendChild(t);
  if (msg) { var m = document.createElement('div'); m.className = 'bm'; m.textContent = msg; b.appendChild(m); }
  if (sub) { var s = document.createElement('div'); s.className = 'bs'; s.textContent = sub; b.appendChild(s); }
  b.className = 'show ' + (cls ? 'b-' + cls : '');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(function () { b.className = ''; }, (life || 2.4) * 1000);
}

/* ---------- 画面の文字(HUD) ---------- */
var HUDC = {};
function setText(id, v) { if (HUDC[id] !== v) { HUDC[id] = v; $(id).textContent = v; } }
function setW(id, v) { v = Math.round(v * 1000) / 10 + '%'; if (HUDC[id + 'w'] !== v) { HUDC[id + 'w'] = v; $(id).style.width = v; } }
function pieceKey(p) { return p ? p.key + p.cells.map(function (c) { return c.x + '' + c.y + c.h; }).join('') : '-'; }
function drawMini(id, p, dim) {
  var key = pieceKey(p) + (dim ? 'd' : '');
  if (HUDC[id] === key) return;
  HUDC[id] = key;
  var c = $(id), d = Math.min(window.devicePixelRatio || 1, 3), w = c.clientWidth || 60, h = c.clientHeight || 60;
  c.width = Math.round(w * d); c.height = Math.round(h * d);
  var g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  if (!p) return;
  var minx = 9, miny = 9, maxx = -9, maxy = -9, i;
  for (i = 0; i < p.cells.length; i++) { var q = p.cells[i]; minx = Math.min(minx, q.x); miny = Math.min(miny, q.y); maxx = Math.max(maxx, q.x); maxy = Math.max(maxy, q.y); }
  var bw = maxx - minx + 1, bh = maxy - miny + 1, s = Math.min((w - 8) / bw, (h - 8) / bh, h * 0.45);
  var ox = (w - bw * s) / 2, oy = (h - bh * s) / 2;
  g.globalAlpha = dim ? 0.45 : 1;
  for (i = 0; i < p.cells.length; i++) g.drawImage(miniSprite(p.cells[i].h, Math.ceil(s * d)), ox + (p.cells[i].x - minx) * s, oy + (p.cells[i].y - miny) * s, s, s);
}
var MINI = {};
function miniSprite(h, px) { var k = h + ':' + px; return MINI[k] || (MINI[k] = makeBlock(h, px, 0)); }
function hud(force) {
  if (force) HUDC = {};
  setText('score', String(Math.round(G.shown)));
  setText('level', String(G.level));
  var ls = levelStart(G.level), le = levelStart(G.level + 1), maxed = G.level >= CONFIG.MAX_LEVEL;
  setW('lvFill', maxed ? 1 : (G.cleared - ls) / (le - ls));
  setText('lvLeft', maxed ? 'さいこう！' : 'あと' + (le - G.cleared));
  var fv = G.feverT > 0 ? G.feverT / CONFIG.FEVER_TIME : G.fever / CONFIG.FEVER_MAX;
  setW('feverFill', fv);
  var fon = G.feverT > 0 ? 'on' : (G.fever >= CONFIG.FEVER_MAX * 0.75 ? 'near' : '');
  if (HUDC.fon !== fon) { HUDC.fon = fon; $('feverBox').className = 'fever ' + fon; }
  setText('feverLabel', G.feverT > 0 ? 'フィーバー中！ ' + Math.ceil(G.feverT) : 'フィーバー');
  var m = G.mission;
  if (m) {
    setText('mText', m.text); setText('mReward', m.reward[1]);
    setText('mProg', m.type === 'kill' || m.type === 'naka' ? m.prog + '/' + m.goal : (m.type === 'combo' ? 'いま ' + G.combo : ''));
    setW('mFill', m.prog / m.goal);
  }
  drawMini('cHold', G.hold, G.holdUsed);
  drawMini('cN1', G.next[0]); drawMini('cN2', G.next[1]);
  var rise = G.level >= CONFIG.RISE_FROM && G.state === 'play' && G.phase !== 'dead';
  var rt = rise ? '⬆ せり上がり ' + Math.max(0, G.riseIn) : '';
  setText('riseTag', rt);
  var rw = rise && G.riseIn <= 2 ? 'warn' : '';
  if (HUDC.rw !== rw) { HUDC.rw = rw; $('riseTag').className = rw; }
  $('holdCard').classList.toggle('used', G.holdUsed);
}
function setBestLine() { $('bestLine').textContent = G.best ? 'ベスト  ' + G.best + '（' + rankFor(G.best) + '）' : ''; }

/* ---------- 描く一覧を作る ---------- */
function ease(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }
function buildFrame() {
  var F = { cells: [], ghost: [], beams: [], danger: false, fever: G.feverT > 0, theme: G.state === 'title' ? 0 : themeFor(G.level),
    shake: G.shake, t: G.t, dead: G.phase === 'dead' ? Math.min(1, G.deadT / 1.1) : 0, title: G.state === 'title', lockA: 0 };
  F.danger = G.state === 'play' && G.phase !== 'dead' && dangerRows(3);
  var map = {};
  if (G.phase === 'resolve' && G.res && G.state !== 'title') frameResolve(F);
  else {
    var off = G.phase === 'rise' && G.rise ? 1 - ease(G.rise.t / 0.3) : 0;
    var land = {};
    if (G.land) for (var i = 0; i < G.land.cells.length; i++) land[G.land.cells[i].x + ',' + G.land.cells[i].y] = 1;
    var lk = G.land ? Math.sin(Math.min(1, G.land.t / 0.25) * Math.PI) : 0;
    var grayRows = G.phase === 'dead' ? Math.floor(F.dead * ROWS) : -1;
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      var c = G.grid[y][x]; if (!c) continue;
      var cmd = { x: x, y: y + off, h: c.h, s: 1, v: y < grayRows ? 3 : 0, rz: 0, sx: 1, sy: 1 };
      if (land[x + ',' + y]) { cmd.sy = 1 - 0.22 * lk; cmd.sx = 1 + 0.12 * lk; }
      map[x + ',' + y] = cmd; F.cells.push(cmd);
    }
  }
  if (G.phase === 'fall' && G.piece && G.state === 'play') framePiece(F, map);
  return F;
}
function framePiece(F, map) {
  var p = G.piece, gy = ghostY(), i, t = G.t;
  // 置いたら消える相手に「!」と ぷるぷる
  var tmp = L.clone(G.grid), att = [];
  for (i = 0; i < p.cells.length; i++) {
    var ax = p.x + p.cells[i].x, ay = gy + p.cells[i].y;
    if (ay >= 0) { tmp[ay][ax] = { h: p.cells[i].h }; att.push({ x: ax, y: ay }); }
  }
  var hits = L.hits(tmp, att, G.feverT > 0);
  if (!hits.length) {        // じゃんけんで消えないときは、なかよし消しになるかを見る
    var gs = L.groups(tmp);
    for (i = 0; i < gs.length; i++) if (!(gs[i].y >= 0 && isPieceAt(p, gs[i].x, gs[i].y - gy))) hits.push(gs[i]);
  }
  for (i = 0; i < hits.length; i++) {
    var c = map[hits[i].x + ',' + hits[i].y];
    if (c) { c.v = 1; c.rz = Math.sin(t * 34 + hits[i].x * 1.7) * 0.09; c.s = 1.02; }
  }
  // かげ(落ちる場所)
  if (gy !== p.y) for (i = 0; i < p.cells.length; i++) {
    if (gy + p.cells[i].y >= 0) F.ghost.push({ x: p.x + p.cells[i].x, y: gy + p.cells[i].y, h: p.cells[i].h });
  }
  // 落ちているブロック(回すときは くるっと回って見える)
  var phi = -G.rotDir * (Math.PI / 2) * ease(G.rotFx);
  var cxp = (p.n - 1) / 2, cyp = (p.n - 1) / 2, cs = Math.cos(phi), sn = Math.sin(phi);
  F.lockA = G.lockT > 0 ? G.lockT / CONFIG.LOCK_DELAY : 0;
  for (i = 0; i < p.cells.length; i++) {
    var q = p.cells[i], dx = q.x - cxp, dy = q.y - cyp;
    var rx = dx * cs - dy * sn + cxp, ry = dx * sn + dy * cs + cyp;
    var yy = G.vis.y + ry;
    if (yy < -1.2) continue;
    F.cells.push({ x: G.vis.x + rx, y: yy, h: q.h, s: 1, v: 0, rz: -phi, sx: 1, sy: 1, piece: true });
  }
}
function isPieceAt(p, x, y) {
  for (var i = 0; i < p.cells.length; i++) if (p.x + p.cells[i].x === x && p.cells[i].y === y) return true;
  return false;
}
function frameResolve(F) {
  var R0 = G.res, st = R0.steps[R0.i], x, y, i;
  if (R0.ph === 'flash') {
    var k = Math.min(1, R0.t / CONFIG.FLASH), hit = {}, att = {};
    for (i = 0; i < st.hits.length; i++) {
      var h = st.hits[i];
      hit[h.x + ',' + h.y] = 1;
      if (st.kind === 'janken') att[h.ax + ',' + h.ay] = 1;
      if (st.kind === 'janken' && !h.self && !h.bomb) F.beams.push({ x1: h.ax, y1: h.ay, x2: h.x, y2: h.y, k: k, c: h.box ? 0xff9ee0 : 0xfff1a0 });
    }
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      var c = st.before[y][x]; if (!c) continue;
      var key = x + ',' + y, cmd = { x: x, y: y, h: c.h, s: 1, v: 0, rz: 0, sx: 1, sy: 1 };
      if (hit[key]) { cmd.v = 2; cmd.s = 1 + 0.16 * k; cmd.rz = Math.sin(R0.t * 60) * 0.14 * k; }
      else if (att[key]) cmd.s = 1 + 0.16 * Math.sin(Math.min(1, k * 1.4) * Math.PI);
      F.cells.push(cmd);
    }
  } else {
    var fk = st.moves.length ? Math.min(1, R0.t / CONFIG.FALL) : 1;
    fk = fk * fk;
    var mv = {};
    for (i = 0; i < st.moves.length; i++) mv[st.moves[i].tx + ',' + st.moves[i].ty] = 1;
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      var cc = st.after[y][x];
      if (cc && !mv[x + ',' + y]) F.cells.push({ x: x, y: y, h: cc.h, s: 1, v: 0, rz: 0, sx: 1, sy: 1 });
    }
    for (i = 0; i < st.moves.length; i++) {
      var m = st.moves[i];
      F.cells.push({ x: m.tx, y: m.fy + (m.ty - m.fy) * fk, h: m.c.h, s: 1, v: 0, rz: 0, sx: 1 - 0.08 * fk, sy: 1 + 0.12 * fk });
    }
  }
}

/* ---------- 描く係(3D が使えないときの 2D) ---------- */
var THEME_2D = [['#5fb8ff', '#c9ecff'], ['#ff7e5f', '#feb47b'], ['#141e5a', '#3b2a7a'], ['#05030f', '#2a0f4f'], ['#0b3d4f', '#6a3093']];
var VIEW2D = {
  name: '2d', parts: [],
  init: function () {
    this.ctx = cv2.getContext('2d'); cv2.style.display = 'block'; cv3.style.display = 'none';
    this.resize(); return true;
  },
  resize: function () {
    var w = stage.clientWidth, h = stage.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
    cv2.width = Math.round(w * d); cv2.height = Math.round(h * d);
    this.d = d; this.w = w; this.h = h;
    this.cs = Math.floor(Math.min((w - 20) / COLS, (h - 20) / ROWS));
    this.bx = Math.round((w - this.cs * COLS) / 2); this.by = Math.round((h - this.cs * ROWS) / 2);
    this.sp = {};
  },
  cellPx: function () { return this.cs; },
  project: function (gx, gy) { return { x: this.bx + (gx + 0.5) * this.cs, y: this.by + (gy + 0.5) * this.cs }; },
  spr: function (h, v) {
    var k = h + ':' + v; if (this.sp[k]) return this.sp[k];
    return (this.sp[k] = makeBlock(h, Math.ceil(this.cs * this.d), v === 1 ? 1 : 0));
  },
  event: function (e) {
    if (e.t === 'burst') {
      var c = this.project(e.x, e.y);
      for (var i = 0; i < e.n; i++) {
        var a = Math.random() * 6.283, v = 80 + Math.random() * 200;
        this.parts.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, t: 0, life: 0.6 + Math.random() * 0.3, s: 3 + Math.random() * 5, c: PAL[e.h].p });
      }
    }
  },
  render: function (F, dt) {
    var g = this.ctx, cs = this.cs, bx = this.bx, by = this.by, i;
    g.setTransform(this.d, 0, 0, this.d, 0, 0);
    var th = THEME_2D[F.theme], gr = g.createLinearGradient(0, 0, 0, this.h);
    gr.addColorStop(0, th[0]); gr.addColorStop(1, th[1]); g.fillStyle = gr; g.fillRect(0, 0, this.w, this.h);
    var sx = F.shake > 0 ? (Math.random() - 0.5) * F.shake * 16 : 0, sy = F.shake > 0 ? (Math.random() - 0.5) * F.shake * 16 : 0;
    g.translate(sx, sy);
    rr(g, bx - 6, by - 6, cs * COLS + 12, cs * ROWS + 12, 14); g.fillStyle = 'rgba(13,8,32,.88)'; g.fill();
    g.strokeStyle = F.danger ? '#ff5a6e' : F.fever ? 'hsl(' + ((F.t * 200) % 360) + ',90%,65%)' : 'rgba(255,255,255,.25)'; g.lineWidth = 3; g.stroke();
    for (i = 0; i < F.ghost.length; i++) {
      var q = F.ghost[i]; rr(g, bx + q.x * cs + 3, by + q.y * cs + 3, cs - 6, cs - 6, cs * 0.2);
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fill(); g.strokeStyle = PAL[q.h].a; g.setLineDash([4, 3]); g.lineWidth = 2; g.stroke(); g.setLineDash([]);
    }
    for (i = 0; i < F.cells.length; i++) {
      var c = F.cells[i], s = cs * c.s;
      g.save(); g.translate(bx + (c.x + 0.5) * cs, by + (c.y + 0.5) * cs); g.rotate(-c.rz); g.scale(c.sx, c.sy);
      g.drawImage(this.spr(c.h, c.v), -s / 2, -s / 2, s, s);
      if (c.v === 2) { g.fillStyle = 'rgba(255,255,255,.7)'; rr(g, -s / 2 + 2, -s / 2 + 2, s - 4, s - 4, s * 0.2); g.fill(); }
      if (c.v === 3) { g.fillStyle = 'rgba(96,90,118,.75)'; g.fillRect(-s / 2, -s / 2, s, s); }
      g.restore();
    }
    g.lineCap = 'round';
    for (i = 0; i < F.beams.length; i++) {
      var b = F.beams[i], a = this.project(b.x1, b.y1), z = this.project(b.x2, b.y2);
      g.strokeStyle = 'rgba(255,240,160,' + (0.9 * (1 - Math.abs(b.k - 0.5) * 1.4)) + ')'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(z.x, z.y); g.stroke();
    }
    for (i = this.parts.length - 1; i >= 0; i--) {
      var p = this.parts[i]; p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = 1 - p.t / p.life; g.fillStyle = p.c; g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    g.globalAlpha = 1;
  }
};

/* ---------- 描く係を決める(3D がだめなら 2D) ---------- */
var R = null;
function useRenderer(r) {
  R = r;
  document.body.classList.toggle('mode3d', r !== VIEW2D);
  r.resize(stage.clientWidth, stage.clientHeight);
}
function pickRenderer() {
  var force2d = /2d/.test(location.hash);
  if (!force2d && window.VIEW3D) {
    try { if (window.VIEW3D.init(stage, cv3)) { cv2.style.display = 'none'; cv3.style.display = 'block'; useRenderer(window.VIEW3D); return; } } catch (e) { console.warn('3D なし', e); }
  }
  VIEW2D.init(); useRenderer(VIEW2D);
}
var waited = 0;
function waitView() {
  if (window.VIEW3D || window.VIEW3D_FAIL || waited > 3000 || /2d/.test(location.hash)) { pickRenderer(); afterRenderer(); return; }
  waited += 50; setTimeout(waitView, 50);
}
setTimeout(waitView, 0);   // このファイルの準備が ぜんぶ終わってから始める
function onResize() { if (R) R.resize(stage.clientWidth, stage.clientHeight); HUDC = {}; }
addEventListener('resize', onResize);

/* ---------- 入力 ---------- */
var BTN = {};
function btnDown(id) {
  audioInit();
  BTN[id] = { t: 0, rep: 0 };
  if (id === 'left') tryMove(-1, 0);
  else if (id === 'right') tryMove(1, 0);
  else if (id === 'rot') tryRotate(1);
  else if (id === 'soft') G.softBtn = true;
  else if (id === 'drop') hardDrop();
}
function btnUp(id) { delete BTN[id]; if (id === 'soft') G.softBtn = false; }
function repeatButtons(dt) {
  ['left', 'right'].forEach(function (id) {
    var b = BTN[id]; if (!b) return;
    b.t += dt;
    if (b.t >= CONFIG.DAS) { b.rep += dt; while (b.rep >= CONFIG.ARR) { b.rep -= CONFIG.ARR; tryMove(id === 'left' ? -1 : 1, 0); } }
  });
}
Array.prototype.forEach.call(document.querySelectorAll('#ctrl button'), function (b) {
  var id = b.getAttribute('data-k');
  b.addEventListener('pointerdown', function (ev) { ev.preventDefault(); b.classList.add('down'); try { b.setPointerCapture(ev.pointerId); } catch (e) {} btnDown(id); });
  function up() { b.classList.remove('down'); btnUp(id); }
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
});
$('holdCard').addEventListener('pointerdown', function (ev) { ev.preventDefault(); audioInit(); doHold(); });
$('btnMute').addEventListener('click', function () { this.blur(); setMute(!AU.muted); });
$('btnPause').addEventListener('click', function () { this.blur(); pauseGame(); });
var PTR = {};
stage.addEventListener('pointerdown', function (ev) {
  audioInit();
  if (G.state !== 'play' || G.phase === 'dead') return;
  PTR[ev.pointerId] = { x0: ev.clientX, y0: ev.clientY, ax: ev.clientX, ay: ev.clientY, t0: performance.now(), moved: false, softed: false };
  try { stage.setPointerCapture(ev.pointerId); } catch (e) {}
});
stage.addEventListener('pointermove', function (ev) {
  var s = PTR[ev.pointerId];
  if (!s || !canAct()) return;
  var cs = R ? R.cellPx() : 30, step = cs * 0.85, dx = ev.clientX - s.ax;
  while (dx >= step) { tryMove(1, 0); s.ax += step; dx -= step; s.moved = true; }
  while (dx <= -step) { tryMove(-1, 0); s.ax -= step; dx += step; s.moved = true; }
  var dy = ev.clientY - s.ay;
  if (dy >= cs && Math.abs(ev.clientY - s.y0) > Math.abs(ev.clientX - s.x0) * 0.8) {
    while (dy >= cs) { if (tryMove(0, 1)) G.score += 1; s.ay += cs; dy -= cs; }
    s.softed = true;
  }
});
function endPtr(ev, cancel) {
  var s = PTR[ev.pointerId]; if (!s) return;
  delete PTR[ev.pointerId];
  if (cancel || !canAct()) return;
  var cs = R ? R.cellPx() : 30, dt = performance.now() - s.t0, tx = ev.clientX - s.x0, ty = ev.clientY - s.y0;
  if (!s.moved && !s.softed && Math.abs(tx) < 12 && Math.abs(ty) < 12 && dt < 400) tryRotate(1);
  else if (ty > cs * 2.2 && dt < 300 && ty > Math.abs(tx) * 1.5) hardDrop();
  else if (ty < -cs * 2 && dt < 350 && -ty > Math.abs(tx) * 1.5 && !s.moved) doHold();
}
stage.addEventListener('pointerup', function (ev) { endPtr(ev, false); });
stage.addEventListener('pointercancel', function (ev) { endPtr(ev, true); });
addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (G.state === 'title' && (k === 'Enter' || k === ' ')) { ev.preventDefault(); start(ev); return; }
  if (G.state === 'over' && k === 'Enter') { ev.preventDefault(); start(ev); return; }
  if (G.state === 'paused' && (k === 'p' || k === 'P' || k === 'Escape')) { resumeGame(); return; }
  if (G.state !== 'play') return;
  audioInit();
  var used = true;
  if (k === 'ArrowLeft') tryMove(-1, 0);
  else if (k === 'ArrowRight') tryMove(1, 0);
  else if (k === 'ArrowDown') G.softKey = true;
  else if (k === 'ArrowUp' || k === 'x' || k === 'X') tryRotate(1);
  else if (k === 'z' || k === 'Z') tryRotate(-1);
  else if (k === ' ') { if (!ev.repeat) hardDrop(); }
  else if (k === 'c' || k === 'C' || k === 'Shift') doHold();
  else if (k === 'p' || k === 'P' || k === 'Escape') pauseGame();
  else if (k === 'm' || k === 'M') setMute(!AU.muted);
  else used = false;
  if (used) ev.preventDefault();
});
addEventListener('keyup', function (ev) { if (ev.key === 'ArrowDown') G.softKey = false; });

/* ---------- 画面の切りかえ ---------- */
var OVL = ['title', 'howto', 'pause', 'over'], howFrom = 'title';
function show(id) { for (var i = 0; i < OVL.length; i++) $(OVL[i]).classList.toggle('hidden', OVL[i] !== id); document.body.classList.toggle('playing', id === ''); }
function start(ev) {
  audioInit();
  show(''); newGame(); G.state = 'play';
  BTN = {}; PTR = {}; G.softBtn = false; G.softKey = false;
  setTimeout(onResize, 30);
  if (ev && ev.isTrusted && ev.type !== 'keydown') try {
    var el = document.documentElement, fs = el.requestFullscreen || el.webkitRequestFullscreen;
    var pr = fs && fs.call(el);
    if (pr && pr.catch) pr.catch(function () {});
  } catch (e) {}
}
function pauseGame() { if (G.state !== 'play' || G.phase === 'dead') return; G.state = 'paused'; BTN = {}; PTR = {}; G.softBtn = false; show('pause'); }
function resumeGame() { if (G.state !== 'paused') return; show(''); G.state = 'play'; setTimeout(onResize, 30); }
function on(id, fn) { $(id).addEventListener('click', function (ev) { this.blur(); fn(ev); }); }
on('btnPlay', start); on('btnAgain', start); on('btnRestart', start); on('btnResume', resumeGame);
on('btnHow', function () { howFrom = 'title'; show('howto'); });
on('btnPauseHow', function () { howFrom = 'pause'; show('howto'); });
on('btnHowBack', function () { show(howFrom); });
on('btnToTitle', function () { G.state = 'title'; demoGrid(); show('title'); });
document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); });
function demoGrid() {
  G.grid = L.empty(); G.piece = null; G.next = [makePiece(4), makePiece(4)]; G.hold = null; G.phase = 'fall'; G.level = 1;
  for (var y = ROWS - 6; y < ROWS; y++) G.grid[y] = garbageRow(y === ROWS - 6 ? 5 : y === ROWS - 5 ? 3 : 1);
  breakGroups(G.grid);
}

/* ---------- 毎フレームの更新 ---------- */
function update(dt) {
  G.t += dt;
  if (G.land) { G.land.t += dt; if (G.land.t > 0.25) G.land = null; }
  G.shake = Math.max(0, G.shake - dt);
  G.rotFx = Math.max(0, G.rotFx - dt * 9); G.holdFx = Math.max(0, G.holdFx - dt * 4);
  G.shown += (G.score - G.shown) * Math.min(1, dt * 10);
  if (Math.abs(G.score - G.shown) < 0.5) G.shown = G.score;
  if (G.feverT > 0 && G.phase !== 'dead') {
    G.feverT -= dt;
    if (G.feverT <= 0) { G.feverT = 0; G.fever = 0; popup(COLS / 2 - 0.5, 2, 'フィーバー おわり', 'gray'); }
  }
  var p = G.piece;
  if (G.phase === 'fall' && p) {
    repeatButtons(dt);
    p = G.piece;
    if (!p) return;
    if (grounded()) {
      G.fallT = 0; G.lockT += dt;
      if (G.lockT >= CONFIG.LOCK_DELAY) lock();
    } else {
      G.lockT = 0;
      var iv = fallInterval(G.level) * (G.feverT > 0 ? 1.4 : 1), soft = G.softBtn || G.softKey;
      if (soft) iv = Math.min(iv, CONFIG.SOFT);
      G.fallT += dt;
      while (G.fallT >= iv) { G.fallT -= iv; if (!tryMove(0, 1, true)) break; if (soft) G.score += 1; }
    }
    if (G.piece) {
      var k = Math.min(1, dt * 26);
      G.vis.x += (G.piece.x - G.vis.x) * k; G.vis.y += (G.piece.y - G.vis.y) * k;
    }
  } else if (G.phase === 'resolve') {
    var R0 = G.res, st = R0.steps[R0.i];
    R0.t += dt;
    if (R0.ph === 'flash') { if (R0.t >= CONFIG.FLASH) { applyStep(st); R0.ph = 'fall'; R0.t = 0; } }
    else {
      var fd = st.moves.length ? CONFIG.FALL : 0.06;
      if (R0.t >= fd) {
        R0.i++; R0.t = 0; R0.ph = 'flash';
        if (R0.i >= R0.steps.length) { G.grid = R0.final; G.res = null; afterLock(); }
      }
    }
  } else if (G.phase === 'rise') {
    G.rise.t += dt;
    if (G.rise.t >= 0.3) { G.rise = null; spawn(); }
  } else if (G.phase === 'dead') {
    G.deadT += dt;
    if (G.deadT > 1.6 && !G.overShown) showOver();
  }
}

var last = 0, acc = 0, titleT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  try {
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (G.state === 'play') { acc += dt; while (acc >= CONFIG.DT) { update(CONFIG.DT); acc -= CONFIG.DT; } }
    else { acc = 0; titleT += dt; G.t = titleT; }
    if (G.state === 'play' || G.state === 'paused') hud();
    if (R) {
      for (var i = 0; i < G.ev.length; i++) R.event(G.ev[i]);
      G.ev.length = 0;
      R.render(buildFrame(), dt);
    }
  } catch (e) { console.error(e); }
}
function afterRenderer() {
  demoGrid(); setBestLine(); setMute(AU.muted);
  requestAnimationFrame(function (t) { last = t; loop(t); });
  if (/play/.test(location.hash)) start();
}
// 確認テスト用
window.TEOTOSI = { L: L, G: G, SHAPES: SHAPES, pool: pool, makePiece: makePiece, rotCells: rotCells,
  tryMove: tryMove, tryRotate: tryRotate, hardDrop: hardDrop, doHold: doHold, newGame: newGame, start: start,
  renderer: function () { return R ? (R.name || '?') : 'none'; },
  step: function (n) { for (var i = 0; i < n; i++) if (G.state === 'play') update(CONFIG.DT); } };

// LINE の中で開いたときだけ、1回だけ案内する
(function () {
  var seenKey = 'teotosi-line-tip', seen = false;
  try { seen = localStorage.getItem(seenKey) === '1'; } catch (e) {}
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (!/\bLine\//i.test(navigator.userAgent) || standalone || seen) return;
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:99999;background:#fffaf0;color:#1b1430;border:3px solid #1b1430;border-radius:14px;padding:10px 40px 10px 12px;font:700 13px/1.5 system-ui,sans-serif';
  bar.textContent = 'LINEの中だと画面が小さめです。右下の「…」(または右上の︙)から「ブラウザで開く」を選ぶと、大きく遊べて、ホーム画面にも入れられます。';
  var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'とじる'); x.textContent = '×';
  x.style.cssText = 'position:absolute;top:4px;right:6px;width:32px;height:32px;border:0;background:none;font:900 20px/1 system-ui;color:#1b1430;cursor:pointer;padding:0';
  x.addEventListener('click', function () { try { localStorage.setItem(seenKey, '1'); } catch (e) {} bar.remove(); });
  bar.appendChild(x); addEventListener('load', function () { document.body.appendChild(bar); });
})();
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
