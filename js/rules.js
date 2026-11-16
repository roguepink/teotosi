'use strict';
/* =========================================================
   テオトシ 3D — 遊びの決まり(絵と分けた 純粋な関数。確認テストでも使う)
   ・落ちてきたブロックが着地したら、となり(上下左右)と じゃんけん。勝った相手は消える。落ちてきたほうは消えない
   ・同じ手が 4つ以上つながると「なかよし消し」で消える
   ・消えて落ちたブロックは、各列で いちばん下に着地したものが また勝負 → れんさ
   ・⭐ まわりを全部消して自分も消える / 🎁 ふれた種類を盤から全部消す / 💣 まわり8マスをドカン
   ・いわ: じゃんけんでも なかよしでも消えない。⭐・🎁・💣 で消える
   ・フィーバー中は、あいこ以外の 全部に勝つ
   ========================================================= */
var CONFIG = {
  COLS: 8, ROWS: 14, DT: 1 / 60,
  BEST_KEY: 'teotosi-best', MUTE_KEY: 'teotosi-mute', BGM_KEY: 'teotosi-bgm',
  LEVEL_BASE: 16, LEVEL_ADD: 3, MAX_LEVEL: 20,
  LOCK_DELAY: 0.5, LOCK_RESETS: 15,
  DAS: 0.17, ARR: 0.05, SOFT: 0.035,
  FLASH: 0.30, FALL: 0.17,
  GROUP_MIN: 4,                         // なかよし消し: 同じ手が この数つながると消える
  STAR_RATE: 0.04,                      // レベル2から ⭐(形ごと)
  BOX_FROM: 3, BOX_RATE: 0.012,         // レベル3から 🎁
  BOMB_FROM: 4, BOMB_RATE: 0.018,       // レベル4から 💣
  BOX_REWARD_CHAIN: 5,                  // この れんさ で 🎁 のごほうび
  RISE_FROM: 7, STONE_FROM: 10,         // せり上がり・いわ の始まり
  FEVER_MAX: 40, FEVER_TIME: 12,        // フィーバーゲージ と 続く秒数
  PINCH_ROWS: 4, PINCH_COOL: 14         // 上から何段目まで積んだら たすけの💣 / 次まで何手あける
};
var COLS = CONFIG.COLS, ROWS = CONFIG.ROWS;
var K = { GU: 0, CHOKI: 1, PA: 2, STAR: 3, ROCK: 4, BOX: 5, BOMB: 6 };
var HANDS = ['✊', '✌️', '✋', '⭐', '🪨', '🎁', '💣'];
var KIND_NAME = ['グー', 'チョキ', 'パー', 'スター', 'いわ', 'ボックス', 'ばくだん'];
var PAL = [
  { a: '#ff9a9a', b: '#e8384f', e: '#8a1530', p: '#ff6b81', hex: 0xe8384f },   // グー
  { a: '#8fd3ff', b: '#2f80ed', e: '#123f80', p: '#5aa9ff', hex: 0x2f80ed },   // チョキ
  { a: '#9ff0a8', b: '#2fb350', e: '#11602a', p: '#51d06f', hex: 0x2fb350 },   // パー
  { a: '#ffe8a3', b: '#b45cf0', e: '#5a1f80', p: '#ffd43b', hex: 0xb45cf0 },   // スター
  { a: '#c4bfd4', b: '#6c6585', e: '#2e2a3d', p: '#9a94b0', hex: 0x6c6585 },   // いわ
  { a: '#fff3a0', b: '#ff5fc8', e: '#7a1f5f', p: '#ffe066', hex: 0xff5fc8 },   // ボックス
  { a: '#ffb199', b: '#3a3550', e: '#16131f', p: '#ff7b54', hex: 0x3a3550 }    // ばくだん
];
var DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

/* ---------- 形 ---------- n は 回すときの箱の大きさ */
var SHAPES = {
  mono: { n: 1, c: [[0, 0]] },
  duo: { n: 2, c: [[0, 0], [1, 0]] },
  tri: { n: 3, c: [[0, 1], [1, 1], [2, 1]] },
  vee: { n: 2, c: [[0, 0], [0, 1], [1, 1]] },
  I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  X: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
  U: { n: 3, c: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
  P: { n: 3, c: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] }
};
var TET = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'], PEN = ['X', 'U', 'P'];
function pool(lv) {
  var p = [];
  function add(k, w) { p.push([k, w]); }
  function addAll(ks, w) { for (var i = 0; i < ks.length; i++) add(ks[i], w / ks.length); }
  if (lv <= 1) add('mono', 1);
  else if (lv === 2) { add('mono', 5); add('duo', 5); }
  else if (lv === 3) { add('mono', 2); add('duo', 4); add('tri', 2); add('vee', 2); }
  else if (lv === 4) { add('mono', 1); add('duo', 3); add('tri', 2); add('vee', 2); addAll(TET, 3); }
  else if (lv < 8) { add('duo', 1.5); add('tri', 1.5); add('vee', 1.5); addAll(TET, 6); }
  else { add('duo', 1); add('tri', 1); add('vee', 1); addAll(TET, 6); addAll(PEN, 1.6); }
  return p;
}
var LEVEL_MSG = {
  2: ['ブロックが 2コに！', '回すと 手の場所が 入れかわるよ'],
  3: ['3コの形と 🎁 が登場！', '🎁は ふれた種類を ぜんぶ消す'],
  4: ['4コの形と 💣 が登場！', '💣は まわりを ドカンと消す'],
  5: ['スピードアップ！', 'ゲージをためて フィーバーを ねらおう'],
  7: ['下から せり上がる！', 'あと何手かは 盤の上に出るよ'],
  8: ['5コの形が 登場！', 'なかよし消しで のりきろう'],
  10: ['いわ が まざる！', 'いわは ⭐ 🎁 💣 でしか消えない']
};
var THEMES = ['ひるの空', 'ゆうやけ', 'よぞら', 'うちゅう', 'オーロラ'];
function themeFor(lv) { return lv <= 3 ? 0 : lv <= 6 ? 1 : lv <= 9 ? 2 : lv <= 13 ? 3 : 4; }
function fallInterval(lv) { return Math.max(0.08, 0.9 * Math.pow(0.88, lv - 1)); }
function riseEvery(lv) { return Math.max(3, 10 - (lv - CONFIG.RISE_FROM)); }
function levelStart(lv) { var n = 0; for (var i = 1; i < lv; i++) n += CONFIG.LEVEL_BASE + CONFIG.LEVEL_ADD * (i - 1); return n; }
function levelFor(cleared) { var lv = 1; while (lv < CONFIG.MAX_LEVEL && cleared >= levelStart(lv + 1)) lv++; return lv; }
function isHand(h) { return h === 0 || h === 1 || h === 2; }

var L = {
  // a が b に勝つか(ふつうの じゃんけん)。いわ は ⭐ にだけ負ける。🎁 💣 は勝ち負けの外
  beats: function (a, b) {
    if (a === 4 || a === 5 || a === 6 || b === 5 || b === 6) return false;
    if (b === 4) return a === 3;
    if (a === 3) return b !== 3;
    return (b - a + 3) % 3 === 1;
  },
  empty: function () {
    var g = [];
    for (var y = 0; y < ROWS; y++) { var r = []; for (var x = 0; x < COLS; x++) r.push(null); g.push(r); }
    return g;
  },
  clone: function (g) { var o = []; for (var y = 0; y < g.length; y++) o.push(g[y].slice()); return o; },
  inside: function (x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; },
  fits: function (g, cells, px, py) {
    for (var i = 0; i < cells.length; i++) {
      var x = px + cells[i].x, y = py + cells[i].y;
      if (x < 0 || x >= COLS || y >= ROWS || y < -3) return false;
      if (y >= 0 && g[y][x]) return false;
    }
    return true;
  },
  // 攻める側(att)が 消す相手の一覧。攻める側どうしは戦わない。fever: あいこ以外 全部に勝つ
  hits: function (g, att, fever) {
    var mark = {}, seen = {}, out = [], i, k;
    function add(x, y, h, p, extra) {
      var key = x + ',' + y;
      if (seen[key]) return;
      seen[key] = 1;
      var o = { x: x, y: y, h: h, ax: p.x, ay: p.y };
      if (extra) for (var e in extra) o[e] = extra[e];
      out.push(o);
    }
    for (i = 0; i < att.length; i++) mark[att[i].x + ',' + att[i].y] = 1;
    for (i = 0; i < att.length; i++) {
      var p = att[i], a = g[p.y] && g[p.y][p.x];
      if (!a) continue;
      if (a.h === 5) {                                     // 🎁 ふれた種類を 盤から ぜんぶ
        var kinds = {}, any = false;
        for (k = 0; k < 4; k++) {
          var bx = p.x + DX[k], by = p.y + DY[k];
          if (!L.inside(bx, by) || mark[bx + ',' + by]) continue;
          var nb = g[by][bx];
          if (nb && nb.h !== 5 && nb.h !== 6) { kinds[nb.h] = 1; any = true; }
        }
        add(p.x, p.y, 5, p, { self: true, box: true, kinds: kinds });
        if (any) for (var yy = 0; yy < ROWS; yy++) for (var xx = 0; xx < COLS; xx++) {
          var cc = g[yy][xx];
          if (cc && kinds[cc.h] && !mark[xx + ',' + yy]) add(xx, yy, cc.h, p, { box: true });
        }
        continue;
      }
      if (a.h === 6) {                                     // 💣 まわり8マス
        add(p.x, p.y, 6, p, { self: true, bomb: true });
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var mx = p.x + dx, my = p.y + dy;
          if ((dx || dy) && L.inside(mx, my) && !mark[mx + ',' + my] && g[my][mx]) add(mx, my, g[my][mx].h, p, { bomb: true });
        }
        continue;
      }
      if (a.h === 3) add(p.x, p.y, 3, p, { self: true });  // ⭐ は自分も消える
      for (k = 0; k < 4; k++) {
        var nx = p.x + DX[k], ny = p.y + DY[k];
        if (!L.inside(nx, ny) || mark[nx + ',' + ny]) continue;
        var b = g[ny][nx];
        if (!b) continue;
        if (L.beats(a.h, b.h) || (fever && isHand(a.h) && isHand(b.h) && a.h !== b.h)) add(nx, ny, b.h, p);
      }
    }
    return out;
  },
  // なかよし消し: 同じ手が GROUP_MIN 以上つながったところ
  groups: function (g) {
    var seen = {}, out = [], count = 0;
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      var c = g[y][x];
      if (!c || !isHand(c.h) || seen[x + ',' + y]) continue;
      var q = [[x, y]], grp = [];
      seen[x + ',' + y] = 1;
      while (q.length) {
        var t = q.pop(); grp.push(t);
        for (var k = 0; k < 4; k++) {
          var nx = t[0] + DX[k], ny = t[1] + DY[k];
          if (!L.inside(nx, ny) || seen[nx + ',' + ny]) continue;
          var d = g[ny][nx];
          if (d && d.h === c.h) { seen[nx + ',' + ny] = 1; q.push([nx, ny]); }
        }
      }
      if (grp.length >= CONFIG.GROUP_MIN) {
        count++;
        for (var i = 0; i < grp.length; i++) out.push({ x: grp[i][0], y: grp[i][1], h: c.h, group: count });
      }
    }
    out.groupCount = count;
    return out;
  },
  gravity: function (g) {
    var moves = [];
    for (var x = 0; x < COLS; x++) {
      var w = ROWS - 1;
      for (var y = ROWS - 1; y >= 0; y--) {
        var c = g[y][x];
        if (!c) continue;
        if (y !== w) { g[w][x] = c; g[y][x] = null; moves.push({ fx: x, fy: y, tx: x, ty: w, c: c }); }
        w--;
      }
    }
    return moves;
  },
  // 着地してからの流れを ぜんぶ先に計算する(絵はこの手順どおりに見せる)
  resolve: function (g0, att, opts) {
    opts = opts || {};
    var g = L.clone(g0), steps = [], chain = 0;
    for (var guard = 0; guard < 300; guard++) {
      var hits = L.hits(g, att, opts.fever), kind = 'janken', groups = 0;
      if (!hits.length) {
        hits = L.groups(g);
        groups = hits.groupCount;
        if (!hits.length) break;
        kind = 'nakayoshi';
      }
      chain++;
      var before = L.clone(g);
      for (var j = 0; j < hits.length; j++) g[hits[j].y][hits[j].x] = null;
      var moves = L.gravity(g);
      steps.push({ kind: kind, chain: chain, before: before, hits: hits, groups: groups, moves: moves, after: L.clone(g) });
      // つぎに勝負するのは、各列で いちばん下に着地したブロックだけ
      att = [];
      var low = {};
      for (var m = 0; m < moves.length; m++) { var mm = moves[m]; if (!low[mm.tx] || mm.ty > low[mm.tx].y) low[mm.tx] = { x: mm.tx, y: mm.ty }; }
      for (var lx in low) att.push(low[lx]);
    }
    return { grid: g, steps: steps };
  },
  points: function (st) {
    var n = st.hits.length;
    if (st.kind === 'nakayoshi') return n * 15 * st.chain + (n >= 6 ? 50 : 0);
    return n * 10 * st.chain + (n >= 3 ? n * 5 : 0);
  }
};

function rnd(n) { return (Math.random() * n) | 0; }
function makePiece(lv) {
  var pl = pool(lv), tot = 0, i;
  for (i = 0; i < pl.length; i++) tot += pl[i][1];
  var r = Math.random() * tot, key = pl[pl.length - 1][0];
  for (i = 0; i < pl.length; i++) { r -= pl[i][1]; if (r <= 0) { key = pl[i][0]; break; } }
  var S = SHAPES[key], cells = [];
  for (i = 0; i < S.c.length; i++) cells.push({ x: S.c[i][0], y: S.c[i][1], h: rnd(3) });
  var u = Math.random();
  var star = lv >= 2 ? CONFIG.STAR_RATE * cells.length / 2 : 0;
  var box = lv >= CONFIG.BOX_FROM ? CONFIG.BOX_RATE : 0;
  var bomb = lv >= CONFIG.BOMB_FROM ? CONFIG.BOMB_RATE : 0;
  if (u < star) cells[rnd(cells.length)].h = 3;
  else if (u < star + box) cells[rnd(cells.length)].h = 5;
  else if (u < star + box + bomb) cells[rnd(cells.length)].h = 6;
  return { key: key, n: S.n, cells: cells, x: 0, y: 0 };
}
function pieceSpecial(p) { for (var i = 0; i < p.cells.length; i++) if (p.cells[i].h >= 3) return p.cells[i].h; return 0; }
function giveSpecial(p, h) {         // 形の1つを スペシャルにする(すでにあれば そこを置きかえ)
  for (var i = 0; i < p.cells.length; i++) if (p.cells[i].h >= 3) { p.cells[i].h = h; return; }
  p.cells[rnd(p.cells.length)].h = h;
}
function rotCells(p, dir) {
  var n = p.n, out = [];
  for (var i = 0; i < p.cells.length; i++) {
    var c = p.cells[i];
    out.push(dir > 0 ? { x: n - 1 - c.y, y: c.x, h: c.h } : { x: c.y, y: n - 1 - c.x, h: c.h });
  }
  return out;
}
function garbageRow(holes, stones) {
  var r = [], x, n = 0;
  for (x = 0; x < COLS; x++) r.push({ h: rnd(3) });
  // そのままで なかよし消しにならないよう、横に3つ並ばないようにする
  for (x = 2; x < COLS; x++) if (r[x].h === r[x - 1].h && r[x].h === r[x - 2].h) r[x].h = (r[x].h + 1 + rnd(2)) % 3;
  while (n < holes) { x = rnd(COLS); if (r[x]) { r[x] = null; n++; } }
  n = 0;
  while (n < (stones || 0)) { x = rnd(COLS); if (r[x] && r[x].h !== 4) { r[x] = { h: 4 }; n++; } }
  return r;
}
// はじめの盤や せり上がりで、いきなり なかよし消しにならないように ばらす
function breakGroups(g) {
  for (var t = 0; t < 30; t++) {
    var gs = L.groups(g);
    if (!gs.length) return g;
    var c = gs[rnd(gs.length)];
    g[c.y][c.x] = { h: (c.h + 1 + rnd(2)) % 3 };
  }
  return g;
}
