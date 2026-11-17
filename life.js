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
function makeVehicle(rd, kind){
  const colors = BODY, color = colors[Math.floor(rnd() * colors.length) % colors.length];
  let g, trailer = null;
  if(kind === 'bus') g = busModel(0x2a6a4a);
  else if(kind === 'van') g = carModel(color, true);
  else if(kind === 'tractor'){ g = tractorModel(0x3a6b2a); if(rnd() < 0.5){ trailer = trailerModel(); scene.add(trailer); trailer.scale.setScalar(M); } }
  else g = carModel(color, false);
  scene.add(g); g.scale.setScalar(M); g.frustumCulled = false; if(trailer) trailer.frustumCulled = false;
  const len = g.userData.len * M, dir = rnd() < 0.5 ? 1 : -1, span = rd.s[rd.s.length - 1];
  const v = {g, trailer, rd, kind, dir, len, _i: 0, s: Math.max(len, Math.min(span - len, rnd() * span)),
    v: 0, vmax: (kind === 'bus' ? 7.5 : kind === 'tractor' ? 4.5 : 8.5 + rnd() * 3) * M, pause: 0, lane: rd.hw * 0.42};
  stepVehicle(v, 0);                   // place it at its spawn point now, not wherever (0,0,0) happens to be
  VEHICLES.push(v);
  return v;
}
function stepVehicle(v, dt){
  const rd = v.rd, span = rd.s[rd.s.length - 1];
  if(v.pause > 0){ v.pause -= dt; v.v = Math.max(0, v.v - 3 * M * dt); }
  else {
    const stopAt = laneBusy(rd, v.s, v.dir);
    let target = v.vmax;
    if(stopAt >= 0){ const d = Math.abs(stopAt - v.s) - 7 * M; target = d < 0 ? 0 : Math.min(v.vmax, Math.sqrt(Math.max(0, 2 * 2.5 * M * d))); }
    const distToEnd = v.dir > 0 ? span - v.s : v.s;
    if(distToEnd < 18 * M) target = Math.min(target, Math.max(0.3 * M, distToEnd / 18 * v.vmax));
    v.v += Math.sign(target - v.v) * Math.min(Math.abs(target - v.v), 2.5 * M * dt);
  }
  v.s += v.dir * v.v * dt;
  if(v.s <= v.len || v.s >= span - v.len){ v.s = Math.max(v.len, Math.min(span - v.len, v.s)); v.dir = -v.dir; v.v = 0; v.pause = 2 + rnd() * 5; }
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

// A light scatter of traffic on the arterial roads — enough to feel alive without crowding the
// island (over a thousand road segments exist; only a couple of hundred ever carry a vehicle).
const CAP = 220;
const arterial = (W.roads || []).filter(rd => rd.s[rd.s.length - 1] > 90 * M && (rd.cls === 'A' || rd.cls === 'B' || (rd.cls === 'street' && rd.town && rd.town.cls === 3)));
arterial.forEach(rd => {
  if(VEHICLES.length >= CAP) return;
  const chance = rd.cls === 'A' ? 0.85 : rd.cls === 'B' ? 0.45 : 0.1;
  if(rnd() > chance) return;                                        // most side streets stay quiet
  const roll = rnd(), busRoute = rd.cls === 'A' && rd.town;
  const kind = busRoute && roll < 0.1 ? 'bus' : roll < 0.16 ? 'van' : roll < 0.2 ? 'tractor' : 'car';
  makeVehicle(rd, kind);
});
// a few tractors working the farm lanes, for variety
(W.roads || []).filter(rd => rd.cls === 'lane' && rd.s[rd.s.length - 1] > 50 * M).forEach(rd => { if(VEHICLES.length < CAP && rnd() < 0.06) makeVehicle(rd, 'tractor'); });

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
  VEHICLES.forEach(v => {
    const near = vOn && cp.distanceTo(v.g.position) < 1.0;
    v.g.visible = vOn && camDist < 2.2 && v.g.position.distanceTo(cp) < 1.4;
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
