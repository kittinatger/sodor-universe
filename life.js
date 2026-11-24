// life.js: everything that moves about the island besides the trains — cars, buses, vans and
// tractors on the roads, fishing boats rocking at their moorings, dockside cranes slewing at work,
// and a few people about the towns. Loaded last, after world.js (roads, harbours) and nwr.js (K, S).
(function(){
'use strict';
const t0 = performance.now();
const K = window.SODOR_KIT, S = window.SODOR_STD, W = window.SODOR_WORLD;
const {mat, add, box, cylX, cylY, cylZ, glassMat} = K, bakeVC = S.bakeVC;
const M = METRE;
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ road vehicles
const BODY = [0xb3201c, 0x1f4fbf, 0x2e8b6e, 0xe2a91f, 0x8a8d91, 0x3a3a3a, 0xeeece2, 0x6a3a92, 0xc46a2a, 0x1a1a1a];
const rndOf = seed => { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const rnd = rndOf(7331);
const WHEEL = () => mat(0x161616, 0.85), CHROME = () => mat(0xc9ccd0, 0.3, 0.55);

function carModel(color, van){
  const g = new THREE.Group(), C = mat(color, 0.45);
  const len = van ? 4.6 : 4.1, w = van ? 1.85 : 1.76, h = van ? 1.9 : 1.42;
  box(g, w, h * 0.46, len, C, 0, h * 0.46, 0);
  if(van){ box(g, w * 0.96, h * 0.52, len * 0.78, C, 0, h * 0.72, -len * 0.06); }
  else { box(g, w * 0.86, h * 0.4, len * 0.52, C, 0, h * 0.72, -len * 0.04); box(g, w * 0.82, h * 0.35, len * 0.48, glassMat(), 0, h * 0.73, -len * 0.04); }
  box(g, w * 1.02, 0.16, 0.14, CHROME(), 0, h * 0.3, len / 2 - 0.08);
  box(g, w * 1.02, 0.16, 0.14, CHROME(), 0, h * 0.3, -len / 2 + 0.08);
  for(const sx of [-1, 1]) for(const sz of [len * 0.3, -len * 0.3]) cylX(g, 0.34, 0.34, 0.26, WHEEL(), sx * w * 0.47, 0.34, sz, 10);
  box(g, w * 0.3, 0.1, 0.06, mat(0xfff2c0, 0.5), 0, h * 0.4, len / 2 - 0.02);
  box(g, w * 0.3, 0.1, 0.06, mat(0xc01818, 0.5), 0, h * 0.4, -len / 2 + 0.02);
  bakeVC(g);
  g.userData.len = len; g.userData.h = h;
  return g;
}
function busModel(color){
  const g = new THREE.Group(), C = mat(color, 0.4), len = 9.6, w = 2.45, h = 3.0;
  box(g, w, h, len, C, 0, h / 2, 0);
  for(let k = 0; k < 6; k++) box(g, w * 0.98, h * 0.42, 1.0, glassMat(), 0, h * 0.64, -len / 2 + 1.1 + k * 1.45);
  box(g, w * 0.98, h * 0.3, len * 0.94, glassMat(), 0, h * 0.18, 0);
  for(const sx of [-1, 1]) for(const sz of [len * 0.36, -len * 0.36]) cylX(g, 0.47, 0.47, 0.3, WHEEL(), sx * w * 0.5, 0.47, sz, 12);
  box(g, w * 0.4, 0.14, 0.06, mat(0xfff2c0, 0.5), 0, h * 0.42, len / 2 - 0.02);
  bakeVC(g);
  g.userData.len = len; g.userData.h = h;
  return g;
}
// a red double-decker: two decks of windows, a destination blind, the stairs window at the back
function deckerModel(color){
  const g = new THREE.Group(), C = mat(color, 0.4), len = 10.2, w = 2.5, h = 4.3;
  box(g, w, h - 0.5, len, C, 0, 0.5 + (h - 0.5) / 2, 0);
  box(g, w * 1.01, 0.18, len * 1.0, mat(0xf2e8c8, 0.6), 0, 2.45, 0);                    // the cream band between the decks
  for(const y of [1.75, 3.35]) box(g, w * 1.01, 0.85, len * 0.92, glassMat(), 0, y, -0.1);
  box(g, w * 0.98, 0.95, 0.06, glassMat(), 0, 1.75, len / 2 + 0.01); box(g, w * 0.98, 0.8, 0.06, glassMat(), 0, 3.35, len / 2 + 0.01);
  box(g, w * 0.7, 0.32, 0.07, mat(0x1a1a1a, 0.5), 0, 4.0, len / 2 + 0.02); box(g, w * 0.6, 0.2, 0.08, mat(0xf2d860, 0.4), 0, 4.0, len / 2 + 0.03);
  for(const sx of [-1, 1]) for(const sz of [len * 0.33, -len * 0.3]) cylX(g, 0.5, 0.5, 0.32, WHEEL(), sx * w * 0.5, 0.5, sz, 12);
  box(g, w * 0.4, 0.14, 0.06, mat(0xfff2c0, 0.5), 0, 0.9, len / 2 - 0.02);
  bakeVC(g); g.userData.len = len; g.userData.h = h; return g;
}
// a lorry: cab and a box body (rigid), or a tractor unit hauling a long trailer
function lorryModel(color, artic){
  const g = new THREE.Group(), C = mat(color, 0.45), cabL = 2.4, bodyL = artic ? 12.5 : 6.5, len = cabL + bodyL + 0.4, w = 2.5;
  const zc = len / 2 - cabL / 2;
  box(g, w, 2.6, cabL, C, 0, 1.75, zc); box(g, w * 0.96, 0.9, 0.06, glassMat(), 0, 2.4, zc + cabL / 2 + 0.01);
  box(g, w * 0.9, 0.3, 0.1, CHROME(), 0, 0.75, zc + cabL / 2 + 0.03);
  const zb = zc - cabL / 2 - 0.2 - bodyL / 2, bodyC = mat([0xeeece2, 0xc8ccd0, 0x2a4a7a, 0xb3201c, 0x3a6a3a][Math.floor(rnd() * 5)], 0.6);
  box(g, w, 3.0, bodyL, bodyC, 0, 2.3, zb); box(g, w * 0.9, 0.35, len - 0.6, mat(0x222222, 0.7), 0, 0.7, 0);
  const axles = artic ? [zc, zc - 1.6, zb - bodyL * 0.3, zb - bodyL * 0.42] : [zc, zb - bodyL * 0.3];
  for(const sx of [-1, 1]) axles.forEach(z => cylX(g, 0.5, 0.5, 0.34, WHEEL(), sx * w * 0.47, 0.5, z, 12));
  box(g, w * 0.3, 0.12, 0.06, mat(0xfff2c0, 0.5), 0, 0.95, len / 2 + 0.02);
  bakeVC(g); g.userData.len = len; g.userData.h = 3.8; return g;
}
function tractorModel(color){
  const g = new THREE.Group(), C = mat(color, 0.5), len = 3.6, h = 2.1;
  box(g, 1.1, 1.0, 1.9, C, 0, 1.1, 0.1);
  box(g, 0.9, 0.85, 1.1, glassMat(), 0, 1.75, -0.1);
  box(g, 1.3, 0.3, 0.6, mat(0x1c1c1c, 0.7), 0, 0.55, 1.3);
  for(const sx of [-1, 1]) cylX(g, 0.72, 0.72, 0.42, mat(0x161616, 0.85), sx * 0.75, 0.72, -0.3, 14);
  for(const sx of [-1, 1]) cylX(g, 0.36, 0.36, 0.2, mat(0x161616, 0.85), sx * 0.65, 0.5, 1.25, 10);
  cylY(g, 0.05, 0.05, 1.6, mat(0x2a2a2a, 0.6), 0.55, 1.7, 0.8, 8);
  bakeVC(g);
  g.userData.len = len; g.userData.h = h;
  return g;
}
function trailerModel(){
  const g = new THREE.Group(), len = 3.4;
  box(g, 1.7, 1.1, len, mat(0x5a4a3a, 0.8), 0, 0.95, 0);
  for(const sx of [-1, 1]) cylX(g, 0.42, 0.42, 0.18, mat(0x161616, 0.85), sx * 0.85, 0.42, -len * 0.25, 10);
  bakeVC(g);
  g.userData.len = len + 0.6; g.userData.h = 1.1;
  return g;
}

// A road vehicle travels along one road's arclength `s`, bouncing between the two ends, keeping to
// its side, and slowing for a train at a level crossing. Updated only while near the camera.
const VEHICLES = [];
function roadFrame(rd, s, out){
  const n = rd.pts.length, S_ = rd.s, arr = rd.pts, ys = rd.ys;
  let i = Math.min(n - 2, Math.max(0, out._i || 0));
  if(S_[i] > s) while(i > 0 && S_[i] > s) i--;
  else while(i < n - 2 && S_[i + 1] < s) i++;
  out._i = i;
  const f = clamp01((s - S_[i]) / Math.max(1e-6, S_[i + 1] - S_[i]));
  const a = arr[i], b = arr[i + 1];
  out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f; out.y = ys[i] + (ys[i + 1] - ys[i]) * f;
  let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
  out.tx = tx; out.tz = tz; out.nx = tz; out.nz = -tx;
  return out;
}
function laneBusy(rd, s, dir){
  // slow for a train crossing just ahead
  for(const c of rd.mods){
    if(c.kind !== 'level') continue;
    const ahead = (c.s - s) * dir;
    if(ahead < -4 * M || ahead > 55 * M) continue;
    let busy = false;
    for(const R of K.RUNNERS){
      if(busy || R.line !== c.line) continue;
      for(const m of R.unit.concat(R.cars)) if(Math.hypot(m.v.group.position.x - c.x, m.v.group.position.z - c.z) < 150 * M){ busy = true; break; }
    }
    if(busy) return c.s;
  }
  return -1;
}
// ---- the road network: where one road's end meets another road, vehicles can turn from one onto the other
// (both ways). Motorways only join other roads at their ends, never where they pass over or beside them.
(function(){
  const RS = W.roads || [], cell = 60 * M, grid = new Map(), key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
  RS.forEach(rd => { rd.jn = []; rd.pts.forEach((p, i) => { const k = key(p.x, p.z); if(!grid.has(k)) grid.set(k, []); grid.get(k).push({rd, i}); }); });
  const link = (A, sA, Bd, sB) => { if(A.jn.some(j => j.to === Bd && Math.abs(j.s - sA) < 20 * M)) return; A.jn.push({s: sA, to: Bd, sTo: sB}); };
  RS.forEach(A => {
    const n = A.pts.length;
    [0, n - 1].forEach(ia => {
      const p = A.pts[ia], sA = A.s[ia], cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
      let best = new Map();
      for(let dx = -1; dx <= 1; dx++) for(let dz = -1; dz <= 1; dz++) (grid.get((cx + dx) + ',' + (cz + dz)) || []).forEach(({rd: B, i}) => {
        if(B === A) return;
        const q = B.pts[i], d = Math.hypot(q.x - p.x, q.z - p.z);
        if(d > A.hw + B.hw + 10 * M) return;
        const sB = B.s[i], endB = sB < 25 * M || sB > B.s[B.s.length - 1] - 25 * M;
        if(B.cls === 'M' && !endB) return;                          // no turning onto a motorway part way along
        const b = best.get(B); if(!b || d < b.d) best.set(B, {d, sB});
      });
      best.forEach(({sB}, B) => { link(A, sA, B, sB); link(B, sB, A, sA); });
    });
  });
  RS.forEach(rd => rd.jn.sort((a, b) => a.s - b.s));
})();
const speedFor = (rd, kind) => (rd.cls === 'M' ? (kind === 'lorry' || kind === 'bus' ? 22 : 27 + rnd() * 6) : rd.cls === 'A' ? (kind === 'tractor' ? 4.5 : kind === 'lorry' || kind === 'bus' ? 11 : 13 + rnd() * 3)
  : rd.cls === 'B' ? (kind === 'tractor' ? 4.5 : 10 + rnd() * 2) : rd.cls === 'lane' ? (kind === 'tractor' ? 4 : 6 + rnd() * 2) : (kind === 'tractor' ? 4 : 7.5 + rnd() * 2)) * M;
const laneFor = (rd, kind) => rd.cls === 'M' ? rd.hw * (kind === 'lorry' || rnd() < 0.5 ? 0.68 : 0.32) : rd.hw * 0.42;
function onto(v, rd, s, dir){
  v.rd = rd; v.s = s; v._i = 0; v.dir = dir; v.vmax = speedFor(rd, v.kind); v.lane = laneFor(rd, v.kind); v.cool = 30 * M;
}
function makeVehicle(rd, kind){
  const colors = BODY, color = colors[Math.floor(rnd() * colors.length) % colors.length];
  let g, trailer = null;
  const V = window.SODOR_VEH;
  if(V){                                    // the shaped models from vehicles.js
    if(kind === 'bus') g = rnd() < 0.6 ? V.decker(0xc8262b) : V.bus([0x2a6a4a, 0x2a4a7a, 0xe2a91f][Math.floor(rnd() * 3)]);
    else if(kind === 'lorry') g = V.lorry(BODY[Math.floor(rnd() * BODY.length)], rd.cls === 'M' ? rnd() < 0.7 : rnd() < 0.3);
    else if(kind === 'van') g = V.van([0xf2f0ea, 0xf2f0ea, 0xc8262b, 0x2a4a7a, 0x2e8b6e, 0xe2a91f][Math.floor(rnd() * 6)]);
    else if(kind === 'tractor'){ g = V.tractor([0xb3201c, 0x2e7a3a, 0x2a5aa0, 0x8a8d91][Math.floor(rnd() * 4)]); if(rnd() < 0.5){ trailer = V.trailer(); scene.add(trailer); trailer.scale.setScalar(M); } }
    else g = rnd() < 0.05 ? V.taxi() : V.car(color);
  }
  else if(kind === 'bus') g = rnd() < 0.6 ? deckerModel(0xc8262b) : busModel(0x2a6a4a);
  else if(kind === 'lorry') g = lorryModel(BODY[Math.floor(rnd() * BODY.length)], rd.cls === 'M' ? rnd() < 0.7 : rnd() < 0.3);
  else if(kind === 'van') g = carModel(color, true);
  else if(kind === 'tractor'){ g = tractorModel(0x3a6b2a); if(rnd() < 0.5){ trailer = trailerModel(); scene.add(trailer); trailer.scale.setScalar(M); } }
  else g = carModel(color, false);
  scene.add(g); g.scale.setScalar(M); g.frustumCulled = false; if(trailer) trailer.frustumCulled = false;
  const len = g.userData.len * M, span = rd.s[rd.s.length - 1];
  const v = {g, trailer, kind, len, v: 0, pause: 0, cool: 0};
  onto(v, rd, Math.max(len, Math.min(span - len, rnd() * span)), rnd() < 0.5 ? 1 : -1);
  stepVehicle(v, 0);                   // place it at its spawn point now, not wherever (0,0,0) happens to be
  VEHICLES.push(v);
  return v;
}
// pick a way on at a junction: most of the time carry straight on along this road, sometimes turn off
function turnAt(v, j, atEnd){
  if(!atEnd && rnd() > 0.3) return false;
  const B = j.to, spanB = B.s[B.s.length - 1];
  if(spanB < Math.max(40 * M, 4 * v.len) || (v.kind === 'tractor' && B.cls === 'M') || ((v.kind === 'bus' || v.kind === 'lorry') && B.cls === 'lane')) return false;
  const nearStart = j.sTo < 25 * M, nearEnd = j.sTo > spanB - 25 * M;
  const dir = nearStart ? 1 : nearEnd ? -1 : rnd() < 0.5 ? 1 : -1;
  onto(v, B, Math.max(v.len, Math.min(spanB - v.len, j.sTo + dir * 6 * M)), dir);
  v.v = Math.min(v.v, 4 * M);
  return true;
}
// the bus stops each town laid out along its through roads (world.js)
const STOPS = new Map();
(W.towns || []).forEach(t => (t.busStops || []).forEach(b => { if(!STOPS.has(b.rd)) STOPS.set(b.rd, []); STOPS.get(b.rd).push(b); }));
function stepVehicle(v, dt){
  let rd = v.rd, span = rd.s[rd.s.length - 1];
  if(v.pause > 0){ v.pause -= dt; v.v = Math.max(0, v.v - 3 * M * dt); }
  else {
    const stopAt = laneBusy(rd, v.s, v.dir);
    let target = v.vmax;
    if(stopAt >= 0){ const d = Math.abs(stopAt - v.s) - 7 * M; target = d < 0 ? 0 : Math.min(v.vmax, Math.sqrt(Math.max(0, 2 * 2.5 * M * d))); }
    const distToEnd = v.dir > 0 ? span - v.s : v.s;
    const way = rd.jn.some(j => Math.abs(j.s - (v.dir > 0 ? span : 0)) < 30 * M);
    if(distToEnd < 18 * M) target = Math.min(target, Math.max(way ? 3 * M : 0.3 * M, distToEnd / 18 * v.vmax));
    // buses call at the stops on their side of the road: draw up by the shelter, wait, pull away
    if(v.kind === 'bus'){ const st = STOPS.get(rd); if(st) for(const b of st){
      if(b === v.lastStop || b.side !== (v.dir > 0 ? 1 : -1)) continue;
      const d = (b.s - v.s) * v.dir;
      if(d > -1 * M && d < 45 * M){ target = Math.min(target, Math.sqrt(Math.max(0, 2 * 1.4 * M * Math.max(0, d - 0.5 * M)))); if(d < 1.5 * M && v.v < 1 * M){ v.pause = 10 + rnd() * 18; v.lastStop = b; } }
    } }
    v.v += Math.sign(target - v.v) * Math.min(Math.abs(target - v.v), 2.5 * M * dt);
  }
  const s0 = v.s, step = v.dir * v.v * dt;
  v.s += step; v.cool -= Math.abs(step);
  // junctions passed this step: maybe turn off here
  let turned = false;
  if(v.cool <= 0) for(const j of rd.jn){ if((j.s - s0) * v.dir > 0 && (j.s - v.s) * v.dir <= 0 && turnAt(v, j, false)){ turned = true; break; } }
  if(!turned && ((v.dir < 0 && v.s <= v.len) || (v.dir > 0 && v.s >= span - v.len))){        // only when heading into the end
    // at the end of the road: take any road that meets it here, else turn round
    const endS = v.s <= v.len ? 0 : span, ways = rd.jn.filter(j => Math.abs(j.s - endS) < 30 * M);
    if(ways.length && turnAt(v, ways[Math.floor(rnd() * ways.length)], true)) turned = true;
    else { v.s = Math.max(v.len, Math.min(span - v.len, v.s)); v.dir = -v.dir; v.v = 0; v.pause = 2 + rnd() * 5; }
  }
  rd = v.rd;
  const fr = roadFrame(rd, v.s, {_i: v._i});
  v._i = fr._i;
  const side = v.dir > 0 ? 1 : -1;                     // keep left, relative to travel direction
  const lx = fr.x + fr.nx * v.lane * side, lz = fr.z + fr.nz * v.lane * side;
  v.g.position.set(lx, fr.y, lz);
  v.g.rotation.y = Math.atan2(v.dir * fr.tx, v.dir * fr.tz);
  if(v.trailer){
    const back = roadFrame(rd, v.s - v.dir * (v.len + 0.4 * M), {_i: v._i});
    const tlx = back.x + back.nx * v.lane * side, tlz = back.z + back.nz * v.lane * side;
    v.trailer.position.set(tlx, back.y, tlz);
    v.trailer.rotation.y = Math.atan2(v.dir * back.tx, v.dir * back.tz);
  }
}
// ---- traffic follows you: vehicles left far behind are moved onto the roads round wherever you are looking,
// so close up the streets and lanes are always busy, wherever on the island that is
const ROADBOX = (W.roads || []).map(rd => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; rd.pts.forEach(p => { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }); return {rd, x0, z0, x1, z1}; });
let nearRoads = [], nearAt = null, nearLen = 0, nearReal = 0;
function refreshNear(cx, cz, R){
  nearRoads = []; nearLen = 0; nearReal = 0;
  ROADBOX.forEach(b => { if(cx > b.x0 - R && cx < b.x1 + R && cz > b.z0 - R && cz < b.z1 + R && b.rd.s[b.rd.s.length - 1] > 40 * M){
    const pts = b.rd.pts; let ok = false; for(let i = 0; i < pts.length && !ok; i += 3) if(Math.hypot(pts[i].x - cx, pts[i].z - cz) < R) ok = true;
    if(ok){ const w = b.rd.s[b.rd.s.length - 1] * (b.rd.cls === 'M' ? 2.5 : b.rd.cls === 'A' ? 1.6 : b.rd.cls === 'lane' ? 0.35 : 1); nearRoads.push({rd: b.rd, w}); nearLen += w; nearReal += Math.min(b.rd.s[b.rd.s.length - 1], 2 * R) * (b.rd.cls === 'M' ? 2 : 1); } } });
  nearAt = {x: cx, z: cz};
}
function relocate(v, cx, cz, R){
  if(!nearRoads.length) return false;
  for(let tries = 0; tries < 6; tries++){
    let pick = rnd() * nearLen, r = nearRoads[0];
    for(const n of nearRoads){ pick -= n.w; if(pick <= 0){ r = n; break; } }
    const rd = r.rd; if(rd.s[rd.s.length - 1] < 4 * v.len || (v.kind === 'tractor' && rd.cls === 'M') || ((v.kind === 'bus' || v.kind === 'lorry') && rd.cls === 'lane')) continue;
    const span = rd.s[rd.s.length - 1], s = v.len + rnd() * (span - 2 * v.len), fr = roadFrame(rd, s, {_i: 0});
    const d = Math.hypot(fr.x - cx, fr.z - cz);
    if(d > R || d < R * 0.25 && camDist < 0.6) continue;             // not popping up right under your nose
    onto(v, rd, s, rnd() < 0.5 ? 1 : -1); v.v = v.vmax * 0.6; v.cool = 0; stepVehicle(v, 0); return true;
  }
  return false;
}
let relocT = 0;
// A light scatter of traffic on the arterial roads — enough to feel alive without crowding the
// island (over a thousand road segments exist; only a couple of hundred ever carry a vehicle).
const CAP = 420;
const arterial = (W.roads || []).filter(rd => rd.s[rd.s.length - 1] > 90 * M && (rd.cls === 'A' || rd.cls === 'B' || (rd.cls === 'street' && rd.town && rd.town.cls === 3)));
arterial.forEach(rd => {
  if(VEHICLES.length >= CAP) return;
  const chance = rd.cls === 'A' ? 0.9 : rd.cls === 'B' ? 0.5 : 0.22;
  if(rnd() > chance) return;                                        // most side streets stay quiet
  const roll = rnd(), busRoute = rd.cls === 'A' && rd.town;
  const kind = (busRoute || STOPS.has(rd)) && roll < 0.14 ? 'bus' : roll < 0.18 ? 'van' : roll < 0.24 ? 'lorry' : roll < 0.27 && rd.cls !== 'street' ? 'tractor' : 'car';
  makeVehicle(rd, kind);
});
// motorway traffic: a vehicle every few hundred metres each way, lorries keeping to the inside lane
(W.motorways || []).forEach(rd => {
  const n = Math.min(40, Math.round(rd.s[rd.s.length - 1] / (450 * M)));
  for(let k = 0; k < n; k++){ const roll = rnd(); makeVehicle(rd, roll < 0.25 ? 'lorry' : roll < 0.32 ? 'van' : roll < 0.36 ? 'bus' : 'car'); }
});
// a few tractors working the farm lanes, for variety
(W.roads || []).filter(rd => rd.cls === 'lane' && rd.s[rd.s.length - 1] > 50 * M).forEach(rd => { if(VEHICLES.length < CAP && rnd() < 0.06) makeVehicle(rd, 'tractor'); });
// a reserve of traffic that gathers round the camera (see relocate): cars mostly, some vans, lorries and buses
for(let k = 0; k < 380 && arterial.length; k++){ const roll = rnd(); makeVehicle(arterial[Math.floor(rnd() * arterial.length)], roll < 0.1 ? 'van' : roll < 0.16 ? 'lorry' : roll < 0.2 ? 'bus' : roll < 0.23 ? 'tractor' : 'car'); }

// ------------------------------------------------------------------ moored boats rocking, cranes at work
(W.harbours || []).forEach(h => { if(h.boats) h.boats.forEach(b => { b.userData.bob = Math.random() * 10; b.userData.base = b.position.clone(); }); });
const CRANES = (window.SODOR_CRANES || []).filter(c => c.userData.crane).map(c => ({top: c.userData.crane, base: 0, target: 0, wait: Math.random() * 8, phase: Math.random() * 6}));

// ------------------------------------------------------------------ people about the towns
// Small capsule figures that stroll a short stretch of pavement near the station or high street.
const PEOPLE = [];
const skin = [0xe8b98c, 0xc48a5e, 0x8a5a3a, 0xf0d2b0], wear = [0xb3201c, 0x1f4fbf, 0x2e8b6e, 0x3a3a3a, 0x8a5ab2, 0xe2a91f, 0xeeece2];
function personModel(){
  // three r128 has no CapsuleGeometry, so the body is a rounded cylinder (domed ends)
  const g = new THREE.Group();
  const body = mat(wear[Math.floor(rnd() * wear.length)], 0.8), head = mat(skin[Math.floor(rnd() * skin.length)], 0.75);
  add(g, new THREE.CylinderGeometry(0.17, 0.22, 0.6, 8), body, 0, 0.42, 0);
  add(g, new THREE.SphereGeometry(0.19, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.72, 0);
  add(g, new THREE.SphereGeometry(0.15, 10, 8), head, 0, 1.0, 0);
  bakeVC(g);
  return g;
}
function spawnWalkers(cx, cz, yaw, n, half){
  for(let k = 0; k < n; k++){
    const g = personModel(); scene.add(g); g.scale.setScalar(M); g.frustumCulled = false; g.visible = false;
    const tx = Math.sin(yaw), tz = Math.cos(yaw), off = (Math.random() * 2 - 1) * 2.2 * M;
    const p = Math.random() * half * 2 - half;
    const x = cx + tx * p + tz * off, z = cz + tz * p + -tx * off;
    g.position.set(x, heightAt(x, z), z);                   // placed now, not left sitting at the origin
    PEOPLE.push({g, cx, cz, tx, tz, nx: tz, nz: -tx, off, half: half * M, p, dir: Math.random() < 0.5 ? 1 : -1, v: (0.7 + Math.random() * 0.6) * M, phase: Math.random() * 10});
  }
}
STATIONS.forEach(st => {
  if(st.kind === 'closed') return;
  const line = LINES[st.lines[0]]; if(!line) return;
  const yaw = Math.random() * Math.PI;
  spawnWalkers(st.x, st.z, yaw, line.kind === 'standard' ? 3 : 2, 18);
});
(W.towns || []).filter(t => t.cls >= 2).forEach(t => spawnWalkers(t.x, t.z, Math.random() * Math.PI, t.cls === 3 ? 5 : 3, 25));

// ------------------------------------------------------------------ frame updates, all distance-gated
const _cp = new THREE.Vector3();
frameHooks.push(dt => {
  const cp = camera.position, d = dt * Math.min(timeScale, 40);
  const vOn = camDist < 2.2, pOn = camDist < 1.1, bOn = camDist < 9;
  // keep the roads round the view busy: about one vehicle to every 28 m of road in sight
  if(vOn && (relocT -= dt) <= 0){
    relocT = 0.35;
    const R = Math.min(1.0, Math.max(0.3, camDist * 0.9)), cx = camCenter.x, cz = camCenter.z;
    if(!nearAt || Math.hypot(cx - nearAt.x, cz - nearAt.z) > R * 0.3 || Math.abs(R - (nearAt.R || 0)) > R * 0.3){ refreshNear(cx, cz, R); nearAt.R = R; }
    const inView = VEHICLES.filter(v => Math.hypot(v.g.position.x - cx, v.g.position.z - cz) < R * 1.3).length;
    let want = Math.min(VEHICLES.length, Math.round(nearReal / (28 * M))) - inView, moved = 0;
    for(const v of VEHICLES){ if(want <= 0 || moved > 24) break; if(Math.hypot(v.g.position.x - cx, v.g.position.z - cz) > R * 1.8 && relocate(v, cx, cz, R)){ want--; moved++; } }
  }
  VEHICLES.forEach(v => {
    const near = vOn && cp.distanceTo(v.g.position) < 1.0;
    v.g.visible = vOn && Math.hypot(v.g.position.x - camCenter.x, v.g.position.z - camCenter.z) < Math.max(0.6, Math.min(1.4, camDist * 1.3));
    if(v.trailer) v.trailer.visible = v.g.visible;
    if(v.g.visible || near) stepVehicle(v, d);
  });
  if(bOn){
    const t = performance.now() * 0.001;
    (W.harbours || []).forEach(h => { if(!h.boats) return; h.boats.forEach(b => {
      if(!b.userData.base) return;
      const ph = t * 0.9 + b.userData.bob;
      b.position.y = b.userData.base.y + Math.sin(ph) * 0.12 * M;
      b.rotation.z = Math.sin(ph * 0.8) * 0.035; b.rotation.x = Math.cos(ph * 0.7) * 0.02;
    }); });
    // dockside cranes idle between lifts, then slew round to a new target and pause again
    CRANES.forEach(c => {
      if(c.wait > 0){ c.wait -= dt; return; }
      if(Math.abs(c.target - c.base) < 0.01){ c.target = (Math.random() * 2 - 1) * 0.9; c.wait = 2 + Math.random() * 5; return; }
      c.base += Math.sign(c.target - c.base) * Math.min(Math.abs(c.target - c.base), dt * 0.35);
      c.top.rotation.y = c.base;
    });
  }
  if(pOn){
    PEOPLE.forEach(p => {
      const near2 = cp.distanceTo(p.g.position) < 0.6;
      p.g.visible = near2;
      if(!near2) return;
      p.p += p.dir * p.v * d;
      if(p.p > p.half || p.p < -p.half){ p.p = Math.max(-p.half, Math.min(p.half, p.p)); p.dir = -p.dir; }
      const x = p.cx + p.tx * p.p + p.nx * p.off, z = p.cz + p.tz * p.p + p.nz * p.off;
      p.g.position.set(x, heightAt(x, z), z);
      p.g.rotation.y = Math.atan2(p.dir * p.tx, p.dir * p.tz);
    });
  } else PEOPLE.forEach(p => { p.g.visible = false; });
});

window.SODOR_LIFE = {VEHICLES, PEOPLE, CRANES};
console.log(`Life: ${VEHICLES.length} road vehicles, ${PEOPLE.length} people, built in ${Math.round(performance.now() - t0)} ms`);
})();
