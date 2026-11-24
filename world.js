// The built and farmed island: towns with streets and textured buildings, the roads between them,
// level crossings and road bridges, rail bridges and embankments, harbours with cranes and ships,
// castles, churches, lighthouses, signals, telegraph poles and lamps, and the fields, hedges and
// woods painted onto the ground. Loaded last; everything is at true scale (heights in metres).
(function(){
'use strict';
const t0 = performance.now();
const timing = {}; let tLap = t0;
const lap = name => { const t = performance.now(); timing[name] = Math.round(t - tLap); tLap = t; };
const K = window.SODOR_KIT, S = window.SODOR_STD;
const {mat, add, box, cylY, cylZ, cylX, domeCap, roof, canvasTex, glassMat} = K;
const M = METRE, TAU = Math.PI * 2;
const V3 = THREE.Vector3;

// ------------------------------------------------------------------ helpers
function rng(seed){ let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z){
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}
const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 5.3, z * 2.1 - 1.7) * 0.3 + vnoise(x * 4.3 - 2.1, z * 4.3 + 7.7) * 0.15;
function regionAt(x, z){
  const c = Math.round((x / MAP_SCALE + T.imgW / 2) / T.step), r = Math.round((z / MAP_SCALE + T.imgH / 2) / T.step);
  if(c < 0 || r < 0 || c >= T.cols || r >= T.rows) return 0;
  return REGION[r * T.cols + c];
}
const H = (x, z) => heightAt(x, z);
const wet = (x, z) => H(x, z) < 0.6 * M;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// spatial hash for buildings (oriented boxes) and road segments
let queryStamp = 0;
class Grid {
  constructor(cell){ this.c = cell; this.m = new Map(); }
  add(x0, z0, x1, z1, item){
    const c = this.c;
    for(let i = Math.floor(Math.min(x0, x1) / c); i <= Math.floor(Math.max(x0, x1) / c); i++)
      for(let k = Math.floor(Math.min(z0, z1) / c); k <= Math.floor(Math.max(z0, z1) / c); k++){
        const key = i * 100003 + k; let a = this.m.get(key); if(!a) this.m.set(key, a = []); a.push(item);
      }
  }
  each(x0, z0, x1, z1, fn){
    const c = this.c, stamp = ++queryStamp;            // items seen in this query carry the stamp (no allocation)
    for(let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for(let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++){
      const a = this.m.get(i * 100003 + k); if(!a) continue;
      for(let q = 0; q < a.length; q++){ const it = a[q]; if(it._q === stamp) continue; it._q = stamp; if(fn(it)) return true; }
    }
    return false;
  }
}
const roadGrid = new Grid(40 * M), bldGrid = new Grid(30 * M);
function segDist(px, pz, ax, az, bx, bz){
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
// clearance from the nearest road edge (negative = on a road)
function roadClear(x, z, reach = 30 * M){
  let best = Infinity;
  roadGrid.each(x - reach, z - reach, x + reach, z + reach, s => { const d = segDist(x, z, s.ax, s.az, s.bx, s.bz) - s.hw; if(d < best) best = d; });
  return best;
}
// oriented boxes: centre, half sizes, yaw (local +z = front = (sin yaw, cos yaw))
function obbCorners(o){
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw), out = [];
  for(const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){ const lx = a * o.hx, lz = b * o.hz; out.push([o.x + lx * c + lz * s, o.z - lx * s + lz * c]); }
  return out;
}
function inObb(o, x, z){
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw), dx = x - o.x, dz = z - o.z;
  return Math.abs(dx * c - dz * s) < o.hx && Math.abs(dx * s + dz * c) < o.hz;
}
// two oriented boxes overlap unless some edge direction of one of them separates them (separating axis test),
// which also catches two long buildings crossing like a plus sign with no corner inside the other
function obbHit(a, b){
  const ca = obbCorners(a), cb = obbCorners(b);
  for(const o of [a, b]) for(const [ax, az] of [[Math.cos(o.yaw), -Math.sin(o.yaw)], [Math.sin(o.yaw), Math.cos(o.yaw)]]){
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    ca.forEach(([x, z]) => { const p = x * ax + z * az; a0 = Math.min(a0, p); a1 = Math.max(a1, p); });
    cb.forEach(([x, z]) => { const p = x * ax + z * az; b0 = Math.min(b0, p); b1 = Math.max(b1, p); });
    if(a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}
function obbFree(o){
  const r = Math.hypot(o.hx, o.hz);
  return !bldGrid.each(o.x - r, o.z - r, o.x + r, o.z + r, b => !b.dead && obbHit(o, b));
}
function addObb(o){ const r = Math.hypot(o.hx, o.hz); bldGrid.add(o.x - r, o.z - r, o.x + r, o.z + r, o); }

// stations, depots and cleared ground (docks, works, the viaduct, lakes) in grids for quick tests
const stationGrid = new Grid(200 * M), zoneGrid = new Grid(200 * M);
STATIONS.forEach(s => { if(s.kind !== 'closed') stationGrid.add(s.x, s.z, s.x, s.z, {x: s.x, z: s.z}); });
const nearStation = (x, z, r) => stationGrid.each(x - r, z - r, x + r, z + r, s => (s.x - x) ** 2 + (s.z - z) ** 2 < r * r);
function addZone(x, z, r){ zoneGrid.add(x - r, z - r, x + r, z + r, {x, z, r2: r * r}); }
(K.clearZones || []).forEach(c => addZone(c.x, c.z, Math.sqrt(c.r2)));
S.taken.forEach(t => addZone(t.x, t.z, t.r));
const inZone = (x, z) => zoneGrid.each(x, z, x, z, c => (c.x - x) ** 2 + (c.z - z) ** 2 < c.r2);
const inTaken = inZone;
function clearAreaW(x, z, r){ K.clearArea(x, z, r); addZone(x, z, r); }

// ------------------------------------------------------------------ settlements
// Every open station on Sodor gets a settlement, sized by importance; stations close together share one.
const CITY = new Set(['Tidmouth', 'Knapford', 'Vicarstown', 'Suddery', 'Wellsworth']);
const NOT_TOWN = new Set(['China Clay Works', 'Vicarstown Dieselworks', 'Sodor Search and Rescue Centre', 'Blue Mountain Quarry', 'Culdee Fell Summit',
  "Devil's Back", 'Skarloey Road', 'Sodor Ironworks', 'The Wharf', 'Hawin Tea Room', 'Elephant Park', 'Shiloh', 'Lakeside',
  'Anopha Quarry', 'Ulfstead Castle']);
const towns = [];
(function(){
  const cand = [];
  STATIONS.forEach(st => {
    if(st.kind === 'closed' || !st.name || NOT_TOWN.has(st.name) || regionAt(st.x, st.z) !== 1) return;
    const cls = CITY.has(st.name) ? 3 : MAJOR.has(st.name) ? 2 : 1;
    cand.push({st, cls});
  });
  cand.sort((a, b) => b.cls - a.cls);
  const R_M = {3: 1150, 2: 600, 1: 260}, OFF = {3: 220, 2: 120, 1: 55};
  cand.forEach(({st, cls}) => {
    const R = R_M[cls] * M;
    if(towns.some(t => Math.hypot(t.x - st.x, t.z - st.z) < t.R * 0.75 + R * 0.4)) return;
    const line = LINES[st.lines[0]], d = realDir(line, st.trackU, new V3()); d.y = 0; d.normalize();
    const n = new V3(d.z, 0, -d.x);
    let c = null;
    for(const s of [1, -1]){ const p = new V3(st.x, 0, st.z).addScaledVector(n, s * OFF[cls] * M); if(!wet(p.x, p.z) && !inTaken(p.x, p.z)){ c = p; break; } }
    if(!c) c = new V3(st.x, 0, st.z);
    if(st.name === 'Tidmouth' && window.TIDMOUTH && window.TIDMOUTH.centre) c = window.TIDMOUTH.centre.clone();     // the city sits on the hill between the forecourt and the harbour
    towns.push({name: st.name, st, cls, R, x: c.x, z: c.z, axis: d, n, seed: Math.floor(hash(st.x, st.z) * 1e9), inst: {}, roads: [], group: null});
  });
})();
// Towns and villages on the Sodor map that have no open station of their own (map px on the outline map,
// carried over from the detailed railway map): they get streets, houses and a name on the map like the rest.
const PLACES = [['Kellsthorpe', 810.5, 632.4, 2], ['Killaban', 523.5, 616.9, 1], ['Cabalnoo', 617.7, 715.9, 1],
  ['Ballaswein', 443.2, 47.7, 1], ['Kirkleas', 372.0, 334.6, 1], ['Ballamoddey', 439.6, 291.8, 1], ['Balladwal', 982.1, 719.4, 1],
  ['Strawberry Grove', 570.3, 324.0, 1]];
(function(){
  const R_M = {2: 600, 1: 260};
  PLACES.forEach(([name, px, py, cls]) => {
    const w0 = mapToWorld(px, py), R = R_M[cls] * M;
    let c = null;
    for(let k = 0; k < 40 && !c; k++){                       // the nearest dry, free ground
      const a = k * 2.4, r = k ? (40 + k * 25) * M : 0, x = w0.x + Math.cos(a) * r, z = w0.z + Math.sin(a) * r;
      if(!wet(x, z) && !inTaken(x, z)) c = new V3(x, 0, z);
    }
    if(!c || towns.some(t => Math.hypot(t.x - c.x, t.z - c.z) < t.R * 0.75 + R * 0.4)) return;
    let st = null, bd = Infinity;
    STATIONS.forEach(s => { if(s.kind === 'closed') return; const dd = Math.hypot(s.x - c.x, s.z - c.z); if(dd < bd){ bd = dd; st = s; } });
    const d = new V3(st.x - c.x, 0, st.z - c.z).normalize(), n = new V3(d.z, 0, -d.x);
    towns.push({name, st: {x: c.x, z: c.z}, noStation: true, cls, R, x: c.x, z: c.z, axis: d, n, seed: Math.floor(hash(c.x, c.z) * 1e9), inst: {}, roads: [], group: null});
  });
  towns.filter(t => t.noStation).forEach(t => {
    const y = H(t.x, t.z), label = makeLabelSprite(t.name);
    label.position.set(t.x, y + 2.8, t.z);
    label.userData = {type: 'town', aspect: label.scale.x / label.scale.y, major: t.cls >= 2, baseY: y};
    scene.add(label); labels.push(label);
  });
})();

lap('settlements');
// ------------------------------------------------------------------ roads
// Roads are polylines of points every ~8 m, with a half-width and a class (A, B, street, lane).
const roads = [];
const ROAD_W = {A: 3.6, B: 3.0, street: 3.2, lane: 2.3, M: 7.6};
function polyFrom(ctrl, step = 8 * M){
  const curve = new THREE.CatmullRomCurve3(ctrl.map(p => new V3(p.x, 0, p.z)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n);
}
function cut(pts, bad){                                   // first stretch of a polyline that stays usable
  const out = [];
  for(const p of pts){ if(bad(p)) break; out.push(p); }
  return out;
}
function registerRoad(r){
  r.s = [0];
  for(let i = 1; i < r.pts.length; i++) r.s.push(r.s[i - 1] + r.pts[i].distanceTo(r.pts[i - 1]));
  for(let i = 0; i < r.pts.length - 1; i++){
    const a = r.pts[i], b = r.pts[i + 1], seg = {ax: a.x, az: a.z, bx: b.x, bz: b.z, hw: r.hw, road: r, i};
    roadGrid.add(Math.min(a.x, b.x) - r.hw, Math.min(a.z, b.z) - r.hw, Math.max(a.x, b.x) + r.hw, Math.max(a.z, b.z) + r.hw, seg);
  }
  roads.push(r);
  return r;
}
const obstacle = (p) => inZone(p.x, p.z);
// Is there already a road running alongside this point (overlapping it and roughly parallel)? Crossing is fine.
function alongRoad(p, tx, tz, hw){
  const tl = Math.hypot(tx, tz) || 1, r = hw + 4 * M;
  return roadGrid.each(p.x - r, p.z - r, p.x + r, p.z + r, s => {
    const d = segDist(p.x, p.z, s.ax, s.az, s.bx, s.bz);
    if(d > (hw + s.hw) * 0.95) return false;
    const ux = s.bx - s.ax, uz = s.bz - s.az, ul = Math.hypot(ux, uz) || 1;
    return Math.abs((tx * ux + tz * uz) / (tl * ul)) > 0.75;
  });
}
// The stretches of a new road that do not lie along an existing one (each at least minLen long), so two
// roads never share the same strip of ground: where they would, the new road simply joins the old.
function freeRuns(pts, hw, minLen = 40 * M, extraBad){
  const runs = []; let cur = [];
  for(let i = 0; i < pts.length; i++){
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const bad = alongRoad(pts[i], b.x - a.x, b.z - a.z, hw) || (extraBad && extraBad(pts[i], b.x - a.x, b.z - a.z));
    if(bad){ if(cur.length) runs.push(cur); cur = []; } else cur.push(pts[i]);
  }
  if(cur.length) runs.push(cur);
  return runs.filter(r => r.length > 1 && r[0].distanceTo(r[r.length - 1]) >= minLen);
}

// Motorways: dual carriageways joining the five cities (a spanning tree and one more link), swinging round the
// towns on the way rather than through them. Each ends at a roundabout on the city's edge, with a link road in.
const motorways = [], roundabouts = [];
(function(){
  const C = towns.filter(t => t.cls === 3); if(C.length < 2) return;
  const pairs = []; for(let i = 0; i < C.length; i++) for(let j = i + 1; j < C.length; j++) pairs.push([i, j, Math.hypot(C[i].x - C[j].x, C[i].z - C[j].z)]);
  pairs.sort((a, b) => a[2] - b[2]);
  const par = C.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  const chosen = []; pairs.forEach(p => { const a = find(p[0]), b = find(p[1]); if(a !== b){ par[a] = b; chosen.push(p); } });
  const extra = pairs.find(p => !chosen.includes(p)); if(extra) chosen.push(extra);
  const endOf = (t, toward) => { const L = Math.hypot(toward.x - t.x, toward.z - t.z), dx = (toward.x - t.x) / L, dz = (toward.z - t.z) / L;
    for(let f = 0.75; f < 1.6; f += 0.05){ const p = {x: t.x + dx * t.R * f, z: t.z + dz * t.R * f}; if(!wet(p.x, p.z) && !nearStation(p.x, p.z, 80 * M) && !K.nearTrack(p.x, p.z, 45 * M)) return p; } return null; };
  chosen.forEach(([i, j]) => {
    const a = C[i], b = C[j], A0 = endOf(a, b), B0 = endOf(b, a); if(!A0 || !B0) return;
    const L2 = Math.hypot(B0.x - A0.x, B0.z - A0.z), dx = (B0.x - A0.x) / L2, dz = (B0.z - A0.z) / L2, nx = -dz, nz = dx;
    for(const off of [0.04, -0.04, 0.12, -0.12, 0.2, -0.2, 0.3, -0.3, 0.4, -0.4]){
      const ctrl = [A0, {x: A0.x + dx * 60 * M, z: A0.z + dz * 60 * M}];
      [0.33, 0.66].forEach(f => ctrl.push({x: A0.x + (B0.x - A0.x) * f + nx * L2 * off, z: A0.z + (B0.z - A0.z) * f + nz * L2 * off}));
      ctrl.push({x: B0.x - dx * 60 * M, z: B0.z - dz * 60 * M}, B0);
      const pts = polyFrom(ctrl, 10 * M);
      let wetRun = 0, maxWet = 0, bad = false, along = 0;
      for(let k = 0; k < pts.length && !bad; k++){
        const p = pts[k];
        if(k && k < pts.length - 1 && alongRoad(p, pts[k + 1].x - pts[k - 1].x, pts[k + 1].z - pts[k - 1].z, 7.6 * M) && ++along > 6) bad = true;      // never laid along an older road
        if(wet(p.x, p.z)){ wetRun++; maxWet = Math.max(maxWet, wetRun); } else wetRun = 0;
        if(towns.some(t => t !== a && t !== b && Math.hypot(t.x - p.x, t.z - p.z) < t.R * (t.cls === 1 ? 0.5 : 0.75))) bad = true;
        if(k > 4 && k < pts.length - 5 && nearStation(p.x, p.z, 70 * M)) bad = true;
        if(k && Math.abs(H(p.x, p.z) - H(pts[k - 1].x, pts[k - 1].z)) > 0.08 * pts[k].distanceTo(pts[k - 1])) bad = true;
      }
      if(bad || maxWet * 10 > 700) continue;
      const rd = registerRoad({pts, hw: 7.6 * M, cls: 'M', ends: [a, b], name: `${a.name} – ${b.name}`});
      motorways.push(rd);
      [[a, A0], [b, B0]].forEach(([t, E]) => {
        if(!roundabouts.some(r => Math.hypot(r.x - E.x, r.z - E.z) < 200 * M)) roundabouts.push({x: E.x, z: E.z, t});
        const link = cut(polyFrom([{x: E.x, z: E.z}, {x: (E.x * 2 + t.x) / 3, z: (E.z * 2 + t.z) / 3}, {x: t.x, z: t.z}]), p => wet(p.x, p.z));
        if(link.length > 4 && !t.roads.some(r => r.link === E)) freeRuns(link.slice().reverse(), ROAD_W.A * M).forEach(run => t.roads.push(registerRoad({pts: run, hw: ROAD_W.A * M, cls: 'A', town: t, link: E, ends: [t, t]})));
      });
      break;
    }
  });
})();
// Between towns: each joins its nearest neighbours, plus a spanning tree so the whole island connects.
(function(){
  const edges = new Map(), key = (a, b) => a < b ? a + '-' + b : b + '-' + a;
  const dist = (a, b) => Math.hypot(towns[a].x - towns[b].x, towns[a].z - towns[b].z);
  towns.forEach((t, i) => {
    const near = towns.map((u, j) => [j, dist(i, j)]).filter(([j, d]) => j !== i && d < 17000 * M).sort((a, b) => a[1] - b[1]);
    near.slice(0, t.cls === 3 ? 4 : t.cls === 2 ? 3 : 2).forEach(([j]) => edges.set(key(i, j), [i, j]));
  });
  const inTree = new Set([0]);                            // Prim's spanning tree
  while(inTree.size < towns.length){
    let best = null;
    inTree.forEach(i => towns.forEach((u, j) => { if(inTree.has(j)) return; const d = dist(i, j); if(!best || d < best[2]) best = [i, j, d]; }));
    if(!best || best[2] > 30000 * M) break;
    inTree.add(best[1]); edges.set(key(best[0], best[1]), [best[0], best[1]]);
  }
  edges.forEach(([i, j]) => {
    const a = towns[i], b = towns[j], L = dist(i, j), dx = (b.x - a.x) / L, dz = (b.z - a.z) / L, nx = -dz, nz = dx;
    const r0 = rng(a.seed ^ b.seed);
    const wiggle = [(r0() - 0.5) * 0.1, (r0() - 0.5) * 0.1];
    for(const off of [0, 0.12, -0.12, 0.25, -0.25, 0.4, -0.4]){
      const ctrl = [{x: a.x, z: a.z}];
      [1 / 3, 2 / 3].forEach((f, k) => ctrl.push({x: a.x + dx * L * f + nx * L * (off + wiggle[k]), z: a.z + dz * L * f + nz * L * (off + wiggle[k])}));
      ctrl.push({x: b.x, z: b.z});
      const pts = polyFrom(ctrl);
      let wetRun = 0, maxWet = 0, blocked = false, steep = false;
      for(let k = 0; k < pts.length; k++){
        const p = pts[k];
        if(wet(p.x, p.z)){ wetRun++; maxWet = Math.max(maxWet, wetRun); } else wetRun = 0;
        if(k > 3 && k < pts.length - 4 && (obstacle(p) || nearStation(p.x, p.z, 25 * M))) blocked = true;
        if(k && Math.abs(H(p.x, p.z) - H(pts[k - 1].x, pts[k - 1].z)) > 0.14 * pts[k].distanceTo(pts[k - 1])) steep = true;
      }
      if(maxWet * 8 > 160 || blocked || steep) continue;
      const cls = a.cls >= 2 && b.cls >= 2 ? 'A' : a.cls + b.cls >= 3 ? 'B' : 'lane';
      freeRuns(pts, ROAD_W[cls] * M).forEach(run => {
        const rd = registerRoad({pts: run, hw: ROAD_W[cls] * M, cls, ends: [a, b]});
        a.roads.push(rd); b.roads.push(rd);
      });
      break;
    }
  });
})();

lap('interTownRoads');
// ------------------------------------------------------------------ the character of each place
// Every city has a look of its own, and the smaller towns and villages take theirs from where they stand:
// pastel fishing ports on the coast, grey stone and steep slate on the uplands, whitewashed cottages in the
// west, red brick and red tile in the east. A style sets the wall and roof colours, how many storeys the
// terraces and shops rise to, how steep the roofs are, and how many towers and mills there are.
const PAL = {
  brick: [0xa0523a, 0x8e4532, 0xb5603f, 0x9a4a32, 0xa85a40], buff: [0xc9a46a, 0xd8b878, 0xc8a060, 0xd2b27e], stone: [0x9a958a, 0x8a867c, 0xa8a296, 0x938d80],
  render: [0xf0ece0, 0xe8dcc0, 0xf3efe6, 0xe6e0d2], pastel: [0xf2d6d0, 0xd8e4ec, 0xe8f0d0, 0xf2e2a8, 0xe0d0e8, 0xf6e8d8, 0xcfe4e0], dark: [0x6e3a2c, 0x7a4636, 0x5a4a42, 0x6a5040],
  slate: [0x4a4f58, 0x3e434b, 0x55585c], tile: [0x8a3a2a, 0x9a4a32, 0xa0502e], brown: [0x6b4a3a, 0x5a4232], stoneRoof: [0x6a6a66, 0x5e5e5a],
};
const CITY_STYLE = {
  Tidmouth:   {name: 'harbour city', walls: [...PAL.render, ...PAL.pastel, ...PAL.pastel], roofs: PAL.slate, floors: {terrace: 3, shop: 4}, rh: 0.9, scale: 1.0, tower: 0.3},
  Knapford:   {name: 'Victorian brick capital', walls: [...PAL.brick, ...PAL.brick, ...PAL.buff], roofs: PAL.slate, floors: {terrace: 3, shop: 4, house: 3}, rh: 1.0, scale: 1.05, tower: 0.32},
  Vicarstown: {name: 'grey stone mainland town', walls: [...PAL.stone, ...PAL.stone, ...PAL.render], roofs: [...PAL.slate, ...PAL.stoneRoof], floors: {terrace: 3, shop: 3}, rh: 1.15, scale: 1.0, tower: 0.2},
  Wellsworth: {name: 'buff brick market town', walls: [...PAL.buff, ...PAL.buff, ...PAL.brick], roofs: [...PAL.tile, ...PAL.tile, ...PAL.slate], floors: {terrace: 2, shop: 3}, rh: 0.9, scale: 1.0, tower: 0.22},
  Suddery:    {name: 'industrial brick town', walls: [...PAL.dark, ...PAL.brick], roofs: PAL.slate, floors: {terrace: 2, shop: 3}, rh: 0.95, scale: 0.97, tower: 0.12},
};
const REGION_STYLE = {
  fishing: {name: 'fishing village', walls: [...PAL.pastel, ...PAL.render], roofs: PAL.slate, floors: {terrace: 2, shop: 3}, rh: 0.95, scale: 0.95},
  upland:  {name: 'upland stone village', walls: [...PAL.stone, ...PAL.stone, ...PAL.render], roofs: [...PAL.slate, ...PAL.stoneRoof], floors: {terrace: 2, shop: 2}, rh: 1.3, scale: 0.9, cottage: 0.75},
  west:    {name: 'whitewashed west', walls: [...PAL.render, ...PAL.render, 0xf8f6f0, 0xece4d0], roofs: [...PAL.slate, ...PAL.brown], floors: {terrace: 2, shop: 3}, rh: 1.1, scale: 0.95},
  east:    {name: 'red brick east', walls: [...PAL.brick, ...PAL.buff], roofs: [...PAL.tile, ...PAL.brown, ...PAL.slate], floors: {terrace: 2, shop: 3}, rh: 0.9, scale: 1.0},
};
function townStyle(t){
  if(CITY_STYLE[t.name]) return CITY_STYLE[t.name];
  let coast = false;
  for(let k = 0; k < 12 && !coast; k++){ const a = k / 12 * TAU; if(H(t.x + Math.cos(a) * 650 * M, t.z + Math.sin(a) * 650 * M) < 0) coast = true; }
  if(coast && t.cls <= 2) return REGION_STYLE.fishing;
  if(H(t.x, t.z) > 160 * M) return REGION_STYLE.upland;
  return t.x < 0 ? REGION_STYLE.west : REGION_STYLE.east;
}
// a taller (or shorter-roofed) version of a house type, built once and shared
const BAND = {terrace: 0.5, house: 0.5, shop: 1 / 3, villa: 0.5};
function styledType(type, st){
  const base = /^shop\d/.test(type) ? 'shop' : type, floors = (st.floors && st.floors[base]) || 2, rh = st.rh || 1;
  if(!BAND[base] || (floors === 2 && rh === 1)) return type;
  const key = `${type}_${floors}_${rh}`;
  if(!ARCH[key]){
    const A0 = ARCH[type], extra = base === 'shop' ? floors - 3 : floors - 2;
    const A = Object.assign({}, A0, {h2: A0.h, bandV: BAND[base], h: A0.h + Math.max(0, extra) * A0.h * BAND[base], rh: A0.rh * rh});
    Object.assign(A, archGeo(A)); ARCH[key] = A;
  }
  return key;
}
// A planned grid of streets in the centre of the cities and big towns, laid square to the railway, broken
// where it meets water, the line, a station or depot, or an older road already running that way.
function cityGrid(t, gR, r){
  const ang = Math.atan2(t.axis.z, t.axis.x) + (r() - 0.5) * 0.2;
  const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
  const bw = (t.cls === 3 ? 92 : 118) * M, bd = (t.cls === 3 ? 70 : 86) * M, hw = ROAD_W.street * M, out = [];
  const bad = p => wet(p.x, p.z) || inZone(p.x, p.z) || K.nearTrack(p.x, p.z, 12 * M) || nearStation(p.x, p.z, 30 * M);
  for(const [ax, az, bx, bz, step] of [[ux, uz, vx, vz, bd], [vx, vz, ux, uz, bw]]){
    const n = Math.floor(gR / step);
    for(let k = -n; k <= n; k++){
      const off = k * step, half = Math.sqrt(Math.max(0, gR * gR - off * off));
      if(half < 60 * M) continue;
      const pts = []; for(let s = -half; s <= half + 1e-9; s += 8 * M) pts.push(new V3(t.x + bx * off + ax * s, 0, t.z + bz * off + az * s));
      freeRuns(pts, hw, 50 * M, bad).forEach(run => out.push(registerRoad({pts: run, hw, cls: 'street', town: t, grid: true})));
    }
  }
  return out;
}

// Inside towns: the planned centre, spokes out from its edge, a station road, and side streets branching off.
towns.forEach(t => {
  const r = rng(t.seed), R = t.R;
  t.style = townStyle(t);
  const gR = t.cls === 3 ? R * 0.42 : t.cls === 2 ? R * 0.3 : 0;
  t.gridR = gR;
  const grid = gR ? cityGrid(t, gR, r) : [];
  const want = t.cls === 3 ? 6 : t.cls === 2 ? 4 : 2;
  const angles = t.roads.map(rd => { const far = rd.ends[0] === t ? rd.pts[Math.min(rd.pts.length - 1, 12)] : rd.pts[Math.max(0, rd.pts.length - 13)]; return Math.atan2(far.z - t.z, far.x - t.x); });
  const streetCls = t.cls === 1 ? 'lane' : 'street';
  const badStreet = p => wet(p.x, p.z) || obstacle(p) || Math.hypot(p.x - t.x, p.z - t.z) > R * 1.05;
  const outsideGrid = pts => { if(!gR) return pts; let i = 0; while(i < pts.length && Math.hypot(pts[i].x - t.x, pts[i].z - t.z) < gR * 0.92) i++; return pts.slice(i); };
  for(let k = angles.length; k < want; k++){
    // the widest gap between existing directions
    const sorted = angles.slice().sort((a, b) => a - b);
    let ga = r() * TAU, gw = 0;
    for(let i = 0; i < sorted.length; i++){ const a0 = sorted[i], a1 = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU; if(a1 - a0 > gw){ gw = a1 - a0; ga = (a0 + a1) / 2; } }
    const a = ga + (r() - 0.5) * 0.3, len = R * (0.8 + r() * 0.25), bend = (r() - 0.5) * 0.5;
    const ctrl = [{x: t.x, z: t.z}, {x: t.x + Math.cos(a + bend) * len * 0.5, z: t.z + Math.sin(a + bend) * len * 0.5}, {x: t.x + Math.cos(a) * len, z: t.z + Math.sin(a) * len}];
    const pts = outsideGrid(cut(polyFrom(ctrl), badStreet));
    angles.push(a);
    if(pts.length > 6) freeRuns(pts, ROAD_W[streetCls] * M).forEach(run => t.roads.push(registerRoad({pts: run, hw: ROAD_W[streetCls] * M, cls: streetCls, town: t})));
  }
  // station road: from the station forecourt towards the centre (it stops where it meets the grid)
  const fore = t.name === 'Tidmouth' && window.TIDMOUTH && window.TIDMOUTH.fore ? window.TIDMOUTH.fore.clone() : new V3(t.st.x, 0, t.st.z).addScaledVector(t.n, 22 * M);
  if(!t.noStation && Math.hypot(fore.x - t.x, fore.z - t.z) > 35 * M && !wet(fore.x, fore.z)){
    let pts = cut(polyFrom([{x: fore.x, z: fore.z}, {x: (fore.x + t.x) / 2, z: (fore.z + t.z) / 2}, {x: t.x, z: t.z}]), p => wet(p.x, p.z));
    if(gR){ let i = 0; while(i < pts.length && Math.hypot(pts[i].x - t.x, pts[i].z - t.z) > gR * 0.85) i++; pts = pts.slice(0, Math.min(pts.length, i + 2)); }
    if(pts.length > 3) freeRuns(pts, ROAD_W.street * M, 30 * M).forEach(run => t.roads.push(registerRoad({pts: run, hw: ROAD_W.street * M, cls: 'street', town: t, stationRoad: true})));
  }
  t.mains = t.roads.slice();
  grid.forEach(g => t.roads.push(g));                            // lined with buildings, but no side streets off them
  if(t.cls === 1) return;
  // side streets off every main street outside the grid, both sides; cities get a second level
  const spacing = (t.cls === 3 ? 95 : 120) * M;
  const branch = (parent, level) => {
    for(let s = 50 * M; s < parent.s[parent.s.length - 1] - 30 * M; s += spacing * (0.8 + r() * 0.5)){
      const i = Math.min(parent.pts.length - 2, Math.round(s / (8 * M))), p = parent.pts[i], q = parent.pts[i + 1];
      const dc = Math.hypot(p.x - t.x, p.z - t.z);
      if(dc > R * 0.92 || dc < gR * 1.05) continue;
      const tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
      for(const side of [-1, 1]){
        if(r() < (level ? 0.35 : 0.15)) continue;
        const a = Math.atan2(tx * side, -tz * side) + (r() - 0.5) * 0.35;      // roughly perpendicular
        const q01 = dc / R, len = (70 + r() * 170) * (1 - q01 * 0.5) * M * (level ? 0.8 : 1);
        const start = {x: p.x + Math.cos(a) * (parent.hw + 1 * M), z: p.z + Math.sin(a) * (parent.hw + 1 * M)};
        const bend = (r() - 0.5) * 0.4;
        const ctrl = [start, {x: start.x + Math.cos(a + bend) * len * 0.5, z: start.z + Math.sin(a + bend) * len * 0.5}, {x: start.x + Math.cos(a) * len, z: start.z + Math.sin(a) * len}];
        let pts = polyFrom(ctrl);
        // stop before running into another street, water, the grid, a depot or the edge of town
        const out = [];
        for(let k = 0; k < pts.length; k++){
          const pp = pts[k];
          if(badStreet(pp) || K.nearTrack(pp.x, pp.z, 9 * M) || Math.hypot(pp.x - t.x, pp.z - t.z) < gR) break;
          if(k > 2 && roadClear(pp.x, pp.z) < 6 * M){ out.push(pp); break; }
          out.push(pp);
        }
        if(out.length < 5) continue;
        const rd = registerRoad({pts: out, hw: (level ? ROAD_W.lane : ROAD_W.street) * M, cls: level ? 'lane' : 'street', town: t});
        t.roads.push(rd);
        if(level === 0 && t.cls === 3 && rd.s[rd.s.length - 1] > 140 * M) branch(rd, 1);
      }
    }
  };
  t.mains.slice().forEach(m => branch(m, 0));
});

lap('townStreets');
// ------------------------------------------------------------------ where roads meet railways
const crossings = [];
(function(){
  const rg = new Grid(30 * M);
  RAIL.lines.forEach(line => {
    if(line.kind === 'closed') return;
    const R = line.real;
    for(let j = 0; j < R.n - 1; j++) rg.add(R.x[j], R.z[j], R.x[j + 1], R.z[j + 1], {line, j});
  });
  const inter = (ax, az, bx, bz, cx, cz, dx, dz) => {
    const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if(Math.abs(d) < 1e-14) return null;
    const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
  };
  roads.forEach(rd => {
    rd.mods = [];
    for(let i = 0; i < rd.pts.length - 1; i++){
      const a = rd.pts[i], b = rd.pts[i + 1];
      rg.each(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z), ({line, j}) => {
        const R = line.real, hit = inter(a.x, a.z, b.x, b.z, R.x[j], R.z[j], R.x[j + 1], R.z[j + 1]);
        if(!hit) return false;
        const u = (j + hit[1]) / (R.n - 1);
        if(inTunnel(line, u)) return false;
        const s = rd.s[i] + hit[0] * (rd.s[i + 1] - rd.s[i]);
        if(rd.mods.some(m => Math.abs(m.s - s) < 40 * M)) return false;
        const x = a.x + (b.x - a.x) * hit[0], z = a.z + (b.z - a.z) * hit[0], ty = R.y[j] + (R.y[j + 1] - R.y[j]) * hit[1];
        const gnd = Math.max(0, H(x, z)), tdir = new V3(R.x[j + 1] - R.x[j], 0, R.z[j + 1] - R.z[j]).normalize();
        const rdir = new V3(b.x - a.x, 0, b.z - a.z).normalize();
        let kind;
        if(ty - gnd > 4.5 * M) kind = 'under';                                      // the railway is on a viaduct or bank
        else if((line.id === 'main' && rd.cls !== 'lane') || rd.cls === 'M') kind = 'over';             // road bridge over the double track
        else kind = 'level';
        const c = {kind, line, u, x, z, ty, gnd, tdir, rdir, road: rd, s};
        rd.mods.push(c); crossings.push(c);
        return false;
      });
    }
  });
})();

lap('crossings');
// ------------------------------------------------------------------ road surfaces
// Heights: on the ground, lifted over rail and water bridges, levelled across level crossings.
const roadGroup = new THREE.Group(); scene.add(roadGroup);
const roadBridges = [];
function roadTex(kind){
  // 128 across by 512 along (8 m): worn asphalt with aggregate, darker wheel tracks, tar-sealed cracks and
  // patches, then the markings: edge lines, dashed centre lines, the gutters and drains of town streets
  return canvasTex(128, 512, (g, w, h) => {
    let s = kind.length * 7 + 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const base = kind === 'lane' ? [104, 102, 94] : kind === 'M' ? [60, 61, 64] : [70, 71, 74];
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h);
    for(let k = 0; k < 9000; k++){ const v = rnd(), c = base.map(b => b - 18 + v * 40 | 0); g.fillStyle = `rgba(${c},0.55)`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
    // polished wheel tracks
    if(kind !== 'lane') for(const x of kind === 'M' ? [0.16, 0.34, 0.66, 0.84] : [0.22, 0.38, 0.62, 0.78]){ const gr = g.createLinearGradient(w * x - 8, 0, w * x + 8, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(w * x - 8, 0, 16, h); }
    // patches and sealed cracks
    for(let k = 0; k < (kind === 'lane' ? 2 : 4); k++){ const pw = 14 + rnd() * 30, ph = 30 + rnd() * 90; g.fillStyle = `rgba(${base.map(b => b - 14)},0.75)`; g.fillRect(10 + rnd() * (w - 20 - pw), rnd() * (h - ph), pw, ph); }
    g.strokeStyle = 'rgba(20,20,22,0.55)'; g.lineWidth = 1.2;
    for(let k = 0; k < 6; k++){ g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for(let q = 0; q < 6; q++){ x += (rnd() - 0.5) * 14; y += rnd() * 16; g.lineTo(x, y); } g.stroke(); }
    const line = (x, y0, y1, lw, col) => { g.fillStyle = col; g.fillRect(x - lw / 2, y0, lw, y1 - y0); };
    const W = '#ecebe4', Y = '#e0b83a';
    if(kind === 'lane'){ g.fillStyle = 'rgba(80,110,50,0.75)'; g.fillRect(0, 0, 7, h); g.fillRect(w - 7, 0, 7, h); g.fillStyle = 'rgba(90,120,60,0.55)'; g.fillRect(w / 2 - 3, 0, 6, h); }
    if(kind === 'street' || kind === 'A' || kind === 'B'){
      // the gutter and kerb drainage: a darker strip, with a drain grating once along
      for(const x of [0, w - 7]){ g.fillStyle = 'rgba(40,40,42,0.6)'; g.fillRect(x, 0, 7, h); }
      g.fillStyle = '#2a2a2c'; g.fillRect(2, h * 0.3, 7, 18); g.fillStyle = '#5a5a5e'; for(let q = 0; q < 5; q++) g.fillRect(3, h * 0.3 + 2 + q * 3.2, 5, 1.2);
    }
    if(kind === 'A'){ line(10, 0, h, 2.4, W); line(w - 10, 0, h, 2.4, W); line(w / 2, 0, h * 0.55, 2.6, W); }
    if(kind === 'B'){ line(w / 2, 0, h * 0.4, 2.4, W); }
    if(kind === 'street'){ line(w / 2, 0, h * 0.3, 2.2, W); line(9, h * 0.62, h * 0.98, 1.6, Y); line(12, h * 0.62, h * 0.98, 1.6, Y); }   // double yellows by the kerb
    if(kind === 'M'){
      g.fillStyle = '#4f7a3a'; g.fillRect(w * 0.46, 0, w * 0.08, h);
      for(let k = 0; k < 400; k++){ g.fillStyle = `rgba(${40 + rnd() * 40 | 0},${90 + rnd() * 40 | 0},${30 + rnd() * 30 | 0},0.6)`; g.fillRect(w * 0.46 + rnd() * w * 0.08, rnd() * h, 2, 2); }
      g.fillStyle = '#9a9ea2'; g.fillRect(w * 0.457, 0, 1.6, h); g.fillRect(w * 0.539, 0, 1.6, h);                   // crash barriers
      for(const x of [0.07, 0.43, 0.57, 0.93]) line(w * x, 0, h, 1.8, W);
      for(const x of [0.25, 0.75]) line(w * x, 0, h * 0.3, 1.8, W);
      g.fillStyle = Y; g.fillRect(w * 0.425, 0, 1.2, h); g.fillRect(w * 0.567, 0, 1.2, h);
      for(let y = 0; y < h; y += 64){ g.fillStyle = '#f2f2ee'; g.fillRect(w * 0.07 - 1, y, 2, 3); g.fillRect(w * 0.93 - 1, y, 2, 3); }   // cat's eyes
    }
  });
}
// paving slabs for the town pavements, with the granite kerb along the road side (u = 0)
function paveTex(){
  return canvasTex(64, 256, (g, w, h) => {
    let s = 77; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = '#a9a69e'; g.fillRect(0, 0, w, h);
    for(let y = 0; y < h; y += 32) for(let x = 6; x < w; x += 29){ const v = 150 + rnd() * 30 | 0; g.fillStyle = `rgb(${v},${v - 3},${v - 9})`; g.fillRect(x + 1, y + 1, 27, 30); }
    for(let k = 0; k < 1600; k++){ const v = 120 + rnd() * 70 | 0; g.fillStyle = `rgba(${v},${v},${v - 6},0.5)`; g.fillRect(rnd() * w, rnd() * h, 1, 1); }
    for(let k = 0; k < 10; k++){ g.fillStyle = 'rgba(60,55,50,0.12)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 5, 0, 7); g.fill(); }   // old chewing gum and stains
    g.fillStyle = '#8e8b84'; g.fillRect(0, 0, 6, h); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, 2, h);
    for(let y = 0; y < h; y += 24){ g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y, 6, 1); }
  });
}
// A raised pavement either side of a town street, 1.6 m of paving slabs behind a kerb, broken where another
// road joins or crosses, at level crossings and on bridges.
const PAVE = {p: [], u: [], i: []}, PAVE_W = 1.6 * M;
function pavementsAlong(rd, gy){
  const n = rd.pts.length, t = rd.town;
  for(const sd of [-1, 1]){
    let prev = -1;
    for(let i = 0; i < n; i++){
      const a = rd.pts[Math.max(0, i - 1)], b = rd.pts[Math.min(n - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, nx = tz / tl * sd, nz = -tx / tl * sd;
      const p = rd.pts[i], xi = p.x + nx * rd.hw, zi = p.z + nz * rd.hw, xo = p.x + nx * (rd.hw + PAVE_W), zo = p.z + nz * (rd.hw + PAVE_W);
      const xm = (xi + xo) / 2, zm = (zi + zo) / 2;
      const ok = Math.hypot(p.x - t.x, p.z - t.z) < t.R * 0.95 && rd.ys[i] < gy[i] + 0.2 * M && !rd.mods.some(c => Math.abs(rd.s[i] - c.s) < 28 * M)
        && roadClear(xm, zm, 14 * M) > PAVE_W * 0.5 - 0.15 * M && roadClear(xo, zo, 14 * M) > -0.05 * M && !K.nearTrack(xm, zm, 3 * M) && !inZone(xm, zm) && H(xo, zo) > 0.5 * M;
      if(!ok){ prev = -1; continue; }
      const yr = Math.max(rd.ys[i], H(xi, zi)) + 0.16 * M, top = Math.max(yr, H(xo, zo)) + 0.14 * M, base = PAVE.p.length / 3, v = rd.s[i] / (8 * M);
      PAVE.p.push(xi, yr - 0.02 * M, zi, xi, top, zi, xo, top, zo, xo, top - 0.5 * M, zo);          // kerb face, slabs, back edge
      PAVE.u.push(0, v, 0.02, v, 1, v, 1, v);
      if(prev >= 0){ const q = sd > 0 ? [0, 1, 2] : [2, 1, 0]; for(let k = 0; k < 3; k++){ const a0 = prev + q[k], a1 = prev + q[k] + 1, b0 = base + q[k], b1 = base + q[k] + 1;
        if(sd > 0) PAVE.i.push(a0, b0, a1, a1, b0, b1); else PAVE.i.push(a0, a1, b0, a1, b1, b0); } }
      prev = base;
    }
  }
}
(function(){
  const LAYER = {M: 0.2, A: 0.18, B: 0.17, street: 0.16, lane: 0.15};
  const buf = {};
  roads.forEach(rd => {
    const n = rd.pts.length, ys = new Float32Array(n);
    const gy = rd.pts.map(p => Math.max(0, H(p.x, p.z)));
    // water: a deck 3 m above the water, carried on piers
    let k = 0;
    while(k < n){
      if(!wet(rd.pts[k].x, rd.pts[k].z)){ k++; continue; }
      let e = k; while(e < n - 1 && wet(rd.pts[e + 1].x, rd.pts[e + 1].z)) e++;
      const i0 = Math.max(0, k - 1), i1 = Math.min(n - 1, e + 1), deck = Math.max(gy[i0], gy[i1], 0) + 3 * M;
      roadBridges.push({rd, i0, i1, deck});
      for(let q = i0; q <= i1; q++) gy[q] = Math.max(gy[q], deck);
      k = e + 1;
    }
    for(let i = 0; i < n; i++) ys[i] = gy[i];
    rd.mods.forEach(c => {
      if(c.kind === 'over'){
        const top = c.ty + 6.2 * M, flat = 9 * M;
        c.top = top;
        for(let i = 0; i < n; i++){ const d = Math.max(0, Math.abs(rd.s[i] - c.s) - flat); ys[i] = Math.max(ys[i], top - d * 0.07); }
      } else if(c.kind === 'level'){
        const flat = 5 * M, ramp = 18 * M;
        for(let i = 0; i < n; i++){ const d = Math.abs(rd.s[i] - c.s), w = d < flat ? 1 : d < flat + ramp ? 1 - smooth(flat, flat + ramp, d) : 0; if(w > 0) ys[i] = ys[i] * (1 - w) + (c.ty + 0.03 * M) * w; }
      }
    });
    rd.ys = ys;
    if(rd.town && rd.cls !== 'lane' && rd.cls !== 'M') pavementsAlong(rd, gy);
    // ribbon
    const B = buf[rd.cls] || (buf[rd.cls] = {p: [], u: [], i: []}), lift = LAYER[rd.cls] * M;
    let prev = -1;
    for(let i = 0; i < n; i++){
      const a = rd.pts[Math.max(0, i - 1)], b = rd.pts[Math.min(n - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, nx = tz / tl, nz = -tx / tl;
      const p = rd.pts[i], base = B.p.length / 3;
      for(const sd of [-1, 1]){
        const x = p.x + nx * sd * rd.hw, z = p.z + nz * sd * rd.hw;
        const atRails = rd.mods.some(c => c.kind === 'level' && Math.abs(rd.s[i] - c.s) < 6 * M);    // flush with the rail tops
        const lifted = ys[i] > gy[i] + 0.2 * M || atRails;
        const y = atRails ? ys[i] + 0.02 * M : lifted ? ys[i] + lift : Math.max(ys[i], H(x, z)) + lift;
        B.p.push(x, y, z); B.u.push(sd < 0 ? 0 : 1, rd.s[i] / (8 * M));
      }
      if(prev >= 0) B.i.push(prev, base, prev + 1, prev + 1, base, base + 1);
      prev = base;
    }
  });
  if(PAVE.p.length){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(PAVE.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(PAVE.u, 2));
    g.setIndex(PAVE.i); g.computeVertexNormals();
    const tex = paveTex(); tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({map: tex, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2}));
    m.receiveShadow = true; roadGroup.add(m);
  }
  Object.keys(buf).forEach(cls => {
    const B = buf[cls], g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
    g.setIndex(B.i); g.computeVertexNormals();
    const tex = roadTex(cls); tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({map: tex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1}));
    m.receiveShadow = true; roadGroup.add(m);
  });
})();

// Banks of earth under anything lifted off the ground (road ramps, rail embankments): grassy side slopes.
const bankGroup = new THREE.Group(); scene.add(bankGroup);
const bankBuf = {p: [], i: []};
function bankAlong(pts, ys, hw, minLift = 0.4 * M){
  let prev = -1;
  for(let i = 0; i < pts.length; i++){
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, nx = tz / tl, nz = -tx / tl;
    const p = pts[i], gnd = Math.max(0, H(p.x, p.z)), lift = ys[i] - gnd;
    if(lift < minLift || wet(p.x, p.z)){ prev = -1; continue; }
    const base = bankBuf.p.length / 3, wd = hw + 1.6 * lift;
    for(const sd of [-1, 1]){
      bankBuf.p.push(p.x + nx * sd * hw, ys[i] - 0.05 * M, p.z + nz * sd * hw);
      bankBuf.p.push(p.x + nx * sd * wd, Math.max(0, H(p.x + nx * sd * wd, p.z + nz * sd * wd)) - 0.4 * M, p.z + nz * sd * wd);
    }
    if(prev >= 0) for(const q of [0, 2]) bankBuf.i.push(prev + q, base + q, prev + q + 1, prev + q + 1, base + q, base + q + 1);
    prev = base;
  }
}
// (not under the bridge decks themselves: the railway runs through there)
roads.forEach(rd => bankAlong(rd.pts, Array.from(rd.ys, (y, i) => rd.mods.some(c => c.kind === 'over' && Math.abs(rd.s[i] - c.s) < 11 * M) ? -1e9 : y), rd.hw + 0.3 * M));

// Motorway furniture: steel crash barriers on both verges and the central reserve, lighting columns along the
// reserve, blue overhead direction signs near each end, and the roundabouts where the motorways meet the cities.
const mwayGroup = new THREE.Group(); scene.add(mwayGroup);
(function(){
  if(!motorways.length) return;
  const bars = [], lamps = [];
  motorways.forEach(rd => {
    const n = rd.pts.length, hw = rd.hw / M;
    for(let i = 0; i < n - 1; i++){
      const p = rd.pts[i], q = rd.pts[i + 1], tx = q.x - p.x, tz = q.z - p.z, L = Math.hypot(tx, tz), nx = tz / L, nz = -tx / L, y = (rd.ys[i] + rd.ys[i + 1]) / 2 + 0.2 * M;
      const yaw = Math.atan2(tx, tz), mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      for(const lat of [-(hw - 0.35), hw - 0.35, -0.45, 0.45]) bars.push({x: mx + nx * lat * M, y, z: mz + nz * lat * M, yaw, L: L / M + 0.1});
      if(i % 5 === 0) lamps.push({x: p.x, y: rd.ys[i] + 0.2 * M, z: p.z, yaw});
    }
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new V3(), s = new V3();
  const inst = (geo, material, list, fn) => { const im = new THREE.InstancedMesh(geo, material, list.length); list.forEach((b, i) => { fn(b); im.setMatrixAt(i, m4); }); im.frustumCulled = false; im.castShadow = true; mwayGroup.add(im); return im; };
  inst(new THREE.BoxGeometry(0.12, 0.34, 1).translate(0, 0.62, 0), mat(0xb8bcc0, 0.4, 0.6), bars, b => m4.compose(v.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.yaw, 0)), s.set(M, M, b.L * M)));
  inst(new THREE.BoxGeometry(0.08, 0.6, 1).translate(0, 0.3, 0), mat(0x6a6d70, 0.6, 0.4), bars, b => m4.compose(v.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.yaw, 0)), s.set(M, M, 0.08 * M)));   // posts
  const lampGeo = mergeBox([[0.14, 12, 0.14, 0, 6, 0], [6.4, 0.12, 0.2, 0, 12, 0], [0.5, 0.18, 0.9, 3.1, 11.9, 0], [0.5, 0.18, 0.9, -3.1, 11.9, 0]]);
  inst(lampGeo, mat(0x9a9ea2, 0.5, 0.5), lamps, b => m4.compose(v.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.yaw, 0)), s.setScalar(M)));
  lamps.forEach(b => (mwayGroup.userData.lampPts || (mwayGroup.userData.lampPts = [])).push(b));
  // overhead direction signs 700 m from each end, one board over each carriageway
  const signTex = (no, name) => canvasTex(512, 192, (g, w, h) => { g.fillStyle = '#1f4fa8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f2f2ee'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#f2f2ee'; g.font = 'bold 54px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(name, 40, h * 0.62);
    g.fillStyle = '#f2f2ee'; g.fillRect(w - 150, 26, 110, 56); g.fillStyle = '#1f4fa8'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.fillText(no, w - 95, 56); });
  motorways.forEach((rd, k) => {
    const no = 'M' + (k + 1), n = rd.pts.length, hw = rd.hw / M, step = Math.max(2, Math.min(70, Math.floor(n / 3)));
    [[step, rd.ends[1], 1], [n - 1 - step, rd.ends[0], -1]].forEach(([i, dest, dir]) => {
      const p = rd.pts[i], q2 = rd.pts[Math.min(n - 1, i + 1)], tx = q2.x - p.x, tz = q2.z - p.z, L = Math.hypot(tx, tz) || 1;
      const g = new THREE.Group(); g.position.set(p.x, rd.ys[i] + 0.2 * M, p.z); g.rotation.y = Math.atan2(tx, tz); g.scale.setScalar(M); mwayGroup.add(g);
      for(const sd of [-1, 1]) box(g, 0.4, 8.2, 0.4, mat(0x9a9ea2, 0.5, 0.5), sd * (hw + 0.8), 4.1, 0);
      box(g, 2 * hw + 2, 0.5, 0.5, mat(0x9a9ea2, 0.5, 0.5), 0, 7.9, 0);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(hw * 0.95, hw * 0.36), new THREE.MeshStandardMaterial({map: signTex(no, dest.name.toUpperCase()), roughness: 0.6}));
      board.position.set(dir * hw * 0.5, 6.6, -dir * 0.3); board.rotation.y = dir > 0 ? Math.PI : 0; g.add(board);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(hw * 0.95, hw * 0.36), mat(0x6a6d70, 0.6)); back.position.set(dir * hw * 0.5, 6.6, -dir * 0.32); back.rotation.y = dir > 0 ? 0 : Math.PI; g.add(back);
    });
  });
  // roundabouts: a ring of carriageway round a grassed island with a flower bed and a tree
  roundabouts.forEach(r => {
    const y = Math.max(0, H(r.x, r.z)) + 0.23 * M, g = new THREE.Group(); g.position.set(r.x, y, r.z); g.scale.setScalar(M); mwayGroup.add(g);
    add(g, new THREE.RingGeometry(15, 25, 40).rotateX(-Math.PI / 2), mat(0x3e3f42, 0.92), 0, 0, 0);
    add(g, new THREE.RingGeometry(14.6, 15.2, 40).rotateX(-Math.PI / 2), mat(0xececE6, 0.6), 0, 0.01, 0);
    cylY(g, 14.6, 14.8, 0.5, mat(0x4f7a3a, 0.95), 0, 0.2, 0, 40); cylY(g, 6, 6, 0.6, mat(0x9a4a6a, 0.9), 0, 0.3, 0, 24);
    cylY(g, 0.35, 0.5, 4, mat(0x5a4030, 0.9), 0, 2.4, 0, 8); add(g, new THREE.IcosahedronGeometry(3.2, 1), mat(0x4a7c3a, 0.85), 0, 6.2, 0);
    S.bakeVC(g);
  });
})();
function mergeBox(list){
  const parts = list.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed());
  let n = 0; parts.forEach(p => n += p.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  parts.forEach(p => { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return g;
}
lap('roadMeshes');
// ------------------------------------------------------------------ crossings and road bridges
const crossGroup = new THREE.Group(); scene.add(crossGroup);
const gates = [];
const WHITE = 0xf2f2ee, RED = 0xc8262b, STONE = 0x8a8174, STONE2 = 0x9a948a, STEEL = 0x3f4a42, DARKSTONE = 0x6e675c;
function placeIn(group, g, x, y, z, yaw){ g.position.set(x, y, z); g.rotation.y = yaw; g.scale.setScalar(M); group.add(g); return g; }
crossings.forEach(c => {
  const yawR = Math.atan2(c.rdir.x, c.rdir.z), hw = c.road.hw / M, line = c.line;
  if(c.kind === 'level'){
    const g = new THREE.Group(), bed = (BED_M[line.kind] || 3.6) + (line.id === 'main' ? 3.5 : 0);
    // the crossing deck: asphalt between and beside the rails, flush with the rail tops
    // deck frame: z along the track, x across it (along the road)
    const deck = new THREE.Group(); g.add(deck);
    const tYaw = Math.atan2(c.tdir.x, c.tdir.z) - yawR, gaugeH = (GAUGE_M[line.kind] || 1.435) / 2;
    box(deck, bed + 2.5, 0.12, hw * 2 + 0.6, mat(0x4a4b4e, 0.9), 0, -0.05, 0);
    for(const s of [-1, 1]) box(deck, 0.08, 0.07, hw * 2 + 0.6, mat(0xc9ccd1, 0.3, 0.7), s * gaugeH, 0.035, 0);
    const big = line.kind === 'standard';
    if(big){
      // white gates with red discs, hung at the road edges: swing across the road when a train comes
      for(const side of [-1, 1]) for(const edge of [-1, 1]){
        const post = box(g, 0.3, 1.6, 0.3, mat(WHITE, 0.6), edge * (hw + 0.4), 0.8, side * (bed / 2 + 1.4));
        const pivot = new THREE.Group(); pivot.position.set(edge * (hw + 0.4), 0, side * (bed / 2 + 1.4)); g.add(pivot);
        const len = hw + 0.3, leaf = new THREE.Group(); leaf.position.z = 0; pivot.add(leaf);
        for(const y of [0.45, 1.15]) box(leaf, 0.08, 0.1, len, mat(WHITE, 0.6), 0, y, -side * 0 + len / 2 * 1).position.z = len / 2;
        for(let k = 0; k <= 4; k++) box(leaf, 0.06, 0.8, 0.06, mat(WHITE, 0.6), 0, 0.8, k * len / 4);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.32, 18), mat(RED, 0.5, 0, 'double')); disc.position.set(0.05, 0.8, len * 0.6); disc.rotation.y = Math.PI / 2; leaf.add(disc);
        // open: lying along the road edge (pointing away from the line); closed: across the road
        const openA = side > 0 ? 0 : Math.PI;
        let dA = -edge * Math.PI / 2 - openA; while(dA > Math.PI) dA -= TAU; while(dA < -Math.PI) dA += TAU;
        const closedA = openA + dA;
        leaf.rotation.y = 0; pivot.rotation.y = openA;
        gates.push({pivot, openA, closedA, cur: openA, c});
      }
      // crossing keeper's cottage and warning signs
      const cot = new THREE.Group();
      box(cot, 5, 3.2, 4.5, mat(0xe9e2cf, 0.85), 0, 1.6, 0); K.roof(cot, 5.6, 5.2, 4.6, mat(0x4a4f58, 0.7), 0);
      box(cot, 0.9, 1.9, 0.05, mat(0x3a5a3a, 0.6), 0, 0.95, 2.27); add(cot, new THREE.PlaneGeometry(0.9, 0.8), glassMat(), 1.5, 1.8, 2.27);
      cot.position.set(hw + 7, 0, (bed / 2 + 7) * (hash(c.x, c.z) < 0.5 ? 1 : -1)); cot.rotation.y = Math.PI / 2; g.add(cot);
    }
    for(const side of [-1, 1]){
      const sp = new THREE.Group(); sp.position.set(-(hw + 1.2), 0, side * (bed / 2 + 30)); g.add(sp);
      box(sp, 0.1, 2.2, 0.1, mat(0x777777, 0.5, 0.5), 0, 1.1, 0);
      const tri = new THREE.Mesh(new THREE.CircleGeometry(0.55, 3), mat(RED, 0.5, 0, 'double')); tri.position.set(0, 2.3, side * -0.06); tri.rotation.z = Math.PI / 2; tri.rotation.y = side > 0 ? 0 : Math.PI; sp.add(tri);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.38, 3), mat(WHITE, 0.5, 0, 'double')); inner.position.set(0, 2.3, side * -0.07); inner.rotation.z = Math.PI / 2; inner.rotation.y = side > 0 ? 0 : Math.PI; sp.add(inner);
    }
    placeIn(crossGroup, g, c.x, c.ty, c.z, yawR);
    // the road runs along the group's z; the deck sits along the track
    deck.rotation.y = tYaw;
    gates.filter(gt => gt.c === c).forEach(gt => { S.bakeVC(gt.pivot); gt.pivot.userData.keep = true; });
    S.bakeSite(g);
  } else if(c.kind === 'over'){
    // a stone road bridge over the double track: abutments either side, a deck and parapets
    const g = new THREE.Group(), span = 13, top = (c.top - c.ty) / M, wdt = hw * 2 + 1.2, ST = mat(STONE, 0.9);
    const inner = new THREE.Group(); g.add(inner);
    box(inner, wdt, 1.1, span + 6, ST, 0, top - 0.6, 0);
    for(const e of [1, -1]) box(inner, wdt + 0.6, top - 0.6, 3, ST, 0, (top - 0.6) / 2 - 0.6, e * (span / 2 + 1.5));
    for(const s of [-1, 1]) box(inner, 0.45, 1.0, span + 8, mat(DARKSTONE, 0.9), s * (wdt / 2 + 0.1), top + 0.3, 0);
    // the arch soffit seen from the line
    placeIn(crossGroup, g, c.x, c.ty, c.z, yawR);             // the deck runs along the road, abutments either side of the line
    S.bakeVC(g); c.bridge = g;
  } else if(c.kind === 'under'){
    // the railway on its bank or viaduct crosses the road on a small girder bridge
    if(c.line.real.viaduct) { const V = c.line.real.viaduct, j = c.u * (c.line.real.n - 1); if(j > V.j0 - 3 && j < V.j1 + 3) return; }
    const g = new THREE.Group(), h = (c.ty - c.gnd) / M, span = hw * 2 + 3;
    for(const e of [1, -1]) box(g, 4.5, h, 2.0, mat(STONE, 0.9), 0, h / 2 - 0.5, e * (span / 2 + 1));
    box(g, 4.2, 0.9, span + 2, mat(STEEL, 0.6, 0.3), 0, h - 0.95, 0);
    for(const s of [-1, 1]) box(g, 0.3, 1.2, span + 2, mat(STEEL, 0.6, 0.3), s * 2.1, h - 0.4, 0);
    placeIn(crossGroup, g, c.x, c.gnd, c.z, Math.atan2(c.rdir.x, c.rdir.z)); S.bakeVC(g);
  }
});
// road bridges over water
roadBridges.forEach(b => {
  const g = new THREE.Group(); g.scale.setScalar(1);
  const ST = mat(STONE2, 0.9);
  for(let i = b.i0; i < b.i1; i++){
    const p = b.rd.pts[i], q = b.rd.pts[i + 1], len = p.distanceTo(q) / M, yaw = Math.atan2(q.x - p.x, q.z - p.z), cx = (p.x + q.x) / 2, cz = (p.z + q.z) / 2;
    const seg = new THREE.Group(); placeIn(g, seg, cx, b.deck, cz, yaw);
    const wdt = b.rd.hw / M * 2 + 1;
    box(seg, wdt, 1.0, len + 0.05, ST, 0, -0.55, 0);
    for(const s of [-1, 1]) box(seg, 0.4, 0.9, len + 0.05, mat(DARKSTONE, 0.9), s * (wdt / 2 - 0.1), 0.45, 0);
    if(i % 2 === 0){ const sea = Math.min(-2 * M, H(cx, cz)), ph = (b.deck - sea) / M; box(seg, wdt - 0.6, ph, 2.2, ST, 0, -ph / 2 - 1, 0); }
  }
  crossGroup.add(g); S.bakeVC(g);
});

lap('crossingModels');
// ------------------------------------------------------------------ buildings: facade atlas and archetypes
// One painted atlas for every wall and roof; instance colours tint it (brick, render, stone, slate, tile).
const ATLAS = 1024, AW = 2048, CELL = 256;          // 8 cells across, 4 down
const SHOP_KINDS = [
  {name: 'BAKERY', fascia: '#7a3a24', ink: '#f2e2b0', frame: '#5a2a18', awning: '#c8a040', goods: ['#d8a860', '#c88a40', '#f0d8a0'], glow: '#ffd890'},
  {name: 'GROCER', fascia: '#2e5a32', ink: '#f2ecd0', frame: '#24482a', awning: '#3a7a3a', goods: ['#4a9a3a', '#d84a2a', '#e8b030', '#8ac040'], glow: '#ffe0a0'},
  {name: 'POST OFFICE', fascia: '#b3201c', ink: '#f8e080', frame: '#8a1814', goods: ['#e8e4d8', '#c8b890'], glow: '#ffe8b0', sign: 'POST'},
  {name: 'BANK', fascia: '#1f2f4a', ink: '#e8d080', frame: '#2a3a52', goods: ['#3a4a5a'], glow: '#fff0c8'},
  {name: 'TEA ROOMS', fascia: '#e8dcc0', ink: '#5a3a2a', frame: '#6a8a9a', awning: '#5a8aaa', goods: ['#f0e8e0', '#c87060', '#e0c0a0'], glow: '#ffd8a0'},
  {name: 'CHEMIST', fascia: '#2a6a6a', ink: '#f0f0e8', frame: '#1a4a4a', goods: ['#e04a4a', '#4a8ae0', '#f0f0f0', '#40b080'], glow: '#e8fff0', sign: '+'},
  {name: 'THE RAILWAY ARMS', fascia: '#3a2a1a', ink: '#e8c060', frame: '#2a1a10', goods: ['#8a5a2a', '#c89040'], glow: '#ffb860', sign: 'INN'},
  {name: 'BUTCHER', fascia: '#8a1c2a', ink: '#f2f0ea', frame: '#6a1420', awning: '#b02a3a', goods: ['#d86a6a', '#f0c0b0', '#c84a4a'], glow: '#fff0e0'},
];
// The same layout is painted twice: the facades by day, and a night map where only the window panes
// glow (some rooms lit, some dark), used as the emissive map once the sun goes down.
function paintAtlas(g, lit){
  g.fillStyle = lit ? '#000000' : '#e6e3dc'; g.fillRect(0, 0, AW, ATLAS);
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let ls = 5; const lrnd = () => (ls = (ls * 48271) % 2147483647) / 2147483647;
  if(!lit){
    // brickwork under every wall: courses of bricks, each a shade of its own, with mortar joints and weathering
    for(let y = 0; y < ATLAS * 0.75; y += 5){
      const off = (y / 5) % 2 ? 6 : 0;
      for(let x = -off; x < AW; x += 12){ const v = rnd(); g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.02 + v * 0.06})` : `rgba(255,255,255,${(v - 0.5) * 0.12})`; g.fillRect(x, y, 11, 4); }
      g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, y + 4, AW, 1);
      for(let x = 11 - off; x < AW; x += 12) g.fillRect(x, y, 1, 4);
    }
    for(let k = 0; k < 40000; k++){ const v = 205 + rnd() * 40 | 0; g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.35)`; g.fillRect(rnd() * AW, rnd() * ATLAS, 2 + rnd() * 3, 1); }
    // rain streaks and grime
    for(let k = 0; k < 900; k++){ g.fillStyle = 'rgba(40,36,30,0.05)'; g.fillRect(rnd() * AW, rnd() * ATLAS * 0.75, 1 + rnd() * 2, 10 + rnd() * 40); }
  }
  const cell = (cx, cy, cw, ch, W, Hm, draw) => { g.save(); g.translate(cx * CELL, cy * CELL); g.scale(cw * CELL / W, ch * CELL / Hm); draw(Hm); g.restore(); };
  const glow = () => { const r = lrnd(); if(r < 0.38) return '#0a0806'; const k = 0.65 + lrnd() * 0.35; return `rgb(${255 * k | 0},${(200 + lrnd() * 40) * k | 0},${(120 + lrnd() * 50) * k | 0})`; };
  const win = (x, y, w, h) => {
    if(lit){ g.fillStyle = glow(); g.fillRect(x, y, w, h); g.fillStyle = '#000'; g.fillRect(x + w / 2 - 0.05, y, 0.1, h); g.fillRect(x, y + h / 2 - 0.05, w, 0.1); return; }
    g.fillStyle = '#c8c2b4'; g.fillRect(x - 0.22, y - 0.32, w + 0.44, 0.2);                 // stone lintel
    g.fillStyle = '#f4f4f0'; g.fillRect(x - 0.12, y - 0.15, w + 0.24, h + 0.27);
    const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#3a4c5a'); gr.addColorStop(0.55, '#1e2a33'); gr.addColorStop(1, '#2c3c48');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    const cur = rnd();                                                                       // curtains, drawn back or half closed
    if(cur < 0.75){ const cc = ['#b8463a', '#e8dcc0', '#5a6e8a', '#8a7a4a', '#f0ece0', '#6a8a5a'][Math.floor(rnd() * 6)], cw = w * (cur < 0.3 ? 0.42 : 0.18);
      g.fillStyle = cc; g.fillRect(x, y, cw, h); g.fillRect(x + w - cw, y, cw, h); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + cw - 0.05, y, 0.05, h); g.fillRect(x + w - cw, y, 0.05, h); }
    g.fillStyle = '#f4f4f0'; g.fillRect(x + w / 2 - 0.04, y, 0.08, h); g.fillRect(x, y + h / 2 - 0.04, w, 0.08);
    g.fillStyle = 'rgba(190,220,235,0.28)'; g.beginPath(); g.moveTo(x + 0.05, y + 0.05); g.lineTo(x + w * 0.45, y + 0.05); g.lineTo(x + 0.05, y + h * 0.45); g.fill();
    g.fillStyle = '#d8d2c6'; g.fillRect(x - 0.2, y + h, w + 0.4, 0.16); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 0.2, y + h + 0.16, w + 0.4, 0.05); };
  const door = (x, y, w, h, col) => { if(lit) return; g.fillStyle = '#efefea'; g.fillRect(x - 0.14, y - 0.5, w + 0.28, h + 0.5);
    g.fillStyle = '#3a4c5a'; g.fillRect(x, y - 0.4, w, 0.32);                               // fanlight
    g.fillStyle = col; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 0.1, y + 0.15, w * 0.36, h * 0.35); g.fillRect(x + w * 0.54, y + 0.15, w * 0.36, h * 0.35); g.fillRect(x + 0.1, y + h * 0.58, w * 0.36, h * 0.34); g.fillRect(x + w * 0.54, y + h * 0.58, w * 0.36, h * 0.34);
    g.fillStyle = '#d8b440'; g.fillRect(x + w * 0.8, y + h * 0.5, 0.07, 0.07);              // brass knob
    g.fillStyle = '#b8b2a6'; g.fillRect(x - 0.3, y + h - 0.02, w + 0.6, 0.12); };
  const Y = (Hm, y) => Hm - y;                              // metres up from the ground to canvas y
  // row 0: terrace front, terrace back, house front, house back
  cell(0, 0, 1, 1, 5.4, 6.2, Hm => { door(0.6, Y(Hm, 2.2), 0.95, 2.2, '#2f3d52'); win(2.4, Y(Hm, 2.4), 2.2, 1.5); win(0.8, Y(Hm, 5.3), 1.1, 1.4); win(3.0, Y(Hm, 5.3), 1.4, 1.4); });
  cell(1, 0, 1, 1, 5.4, 6.2, Hm => { door(0.7, Y(Hm, 2.1), 0.9, 2.1, '#5a3a2a'); win(3.0, Y(Hm, 2.2), 1.2, 1.2); win(0.9, Y(Hm, 5.2), 1.0, 1.2); win(3.0, Y(Hm, 5.2), 1.2, 1.2); });
  cell(2, 0, 1, 1, 7.6, 5.8, Hm => { door(3.3, Y(Hm, 2.2), 1.0, 2.2, '#7a2a24'); win(0.9, Y(Hm, 2.3), 1.7, 1.4); win(5.0, Y(Hm, 2.3), 1.7, 1.4); win(0.9, Y(Hm, 5.0), 1.5, 1.3); win(3.2, Y(Hm, 5.0), 1.2, 1.2); win(5.2, Y(Hm, 5.0), 1.5, 1.3); });
  cell(3, 0, 1, 1, 7.6, 5.8, Hm => { door(1.0, Y(Hm, 2.1), 0.9, 2.1, '#4a4a3a'); win(4.4, Y(Hm, 2.2), 1.6, 1.2); win(1.0, Y(Hm, 5.0), 1.3, 1.2); win(4.6, Y(Hm, 5.0), 1.3, 1.2); });
  // row 1: cottage front, shop front, villa front, side wall
  cell(0, 1, 1, 1, 7.0, 3.6, Hm => { door(3.0, Y(Hm, 2.0), 0.95, 2.0, '#2f5a3a'); win(1.0, Y(Hm, 2.0), 1.3, 1.1); win(4.7, Y(Hm, 2.0), 1.3, 1.1); });
  cell(1, 1, 1, 1, 5.4, 9.0, Hm => {
    if(lit){ g.fillStyle = '#ffd890'; g.fillRect(0.4, Y(Hm, 2.75), 3.6, 2.2); g.fillStyle = '#000'; g.fillRect(1.6, Y(Hm, 2.75), 0.06, 2.2); g.fillRect(2.8, Y(Hm, 2.75), 0.06, 2.2); }
    else {
      g.fillStyle = '#2a3a2e'; g.fillRect(0, Y(Hm, 3.5), 5.4, 0.65);
      g.fillStyle = '#e8d9a8'; g.font = 'bold 0.36px Georgia'; g.fillText('SHOP', 1.7, Y(Hm, 3.08));
      g.fillStyle = '#f2f0ea'; g.fillRect(0.25, Y(Hm, 2.85), 3.9, 2.6); g.fillStyle = '#1f2a33'; g.fillRect(0.4, Y(Hm, 2.75), 3.6, 2.2);
      g.fillStyle = '#f2f0ea'; g.fillRect(1.6, Y(Hm, 2.75), 0.06, 2.2); g.fillRect(2.8, Y(Hm, 2.75), 0.06, 2.2);
    }
    door(4.4, Y(Hm, 2.4), 0.8, 2.4, '#2a3a2e');
    for(const y of [5.9, 8.4]) { win(0.8, Y(Hm, y), 1.2, 1.5); win(3.2, Y(Hm, y), 1.2, 1.5); }
  });
  cell(2, 1, 1, 1, 9.5, 5.8, Hm => { if(!lit){ g.fillStyle = '#d8d4cc'; g.fillRect(3.9, Y(Hm, 2.8), 1.7, 0.2); } door(4.25, Y(Hm, 2.3), 1.0, 2.3, '#1f3a5a');
    for(const x of [0.8, 2.3, 6.2, 7.7]) win(x, Y(Hm, 2.4), 1.0, 1.6); for(const x of [0.8, 2.3, 4.3, 6.2, 7.7]) win(x, Y(Hm, 5.1), 1.0, 1.4); });
  cell(3, 1, 1, 1, 9.0, 9.2, Hm => { win(3.9, Y(Hm, 5.0), 0.9, 1.0); });
  // row 2: warehouse front (two cells wide), barn front, civic front
  cell(0, 2, 2, 1, 20, 8, Hm => {
    if(!lit){
      g.fillStyle = 'rgba(0,0,0,0.08)'; for(let x = 0; x <= 20; x += 4) g.fillRect(x - 0.2, 0, 0.4, Hm);
      g.fillStyle = '#5a4a3a'; g.fillRect(7.5, Y(Hm, 5.2), 5, 5.2); g.fillStyle = 'rgba(0,0,0,0.25)'; for(let x = 7.5; x < 12.5; x += 0.5) g.fillRect(x, Y(Hm, 5.2), 0.05, 5.2);
    }
    for(let x = 1; x < 20; x += 2.4) if(x < 7 || x > 12.6) win(x, Y(Hm, 7.2), 1.1, 1.2);
    for(let x = 1; x < 7; x += 2.4) win(x, Y(Hm, 3.6), 1.1, 1.8); for(let x = 13.4; x < 19.5; x += 2.4) win(x, Y(Hm, 3.6), 1.1, 1.8);
  });
  if(!lit) cell(2, 2, 1, 1, 14, 5.5, Hm => { g.fillStyle = 'rgba(0,0,0,0.2)'; for(let x = 0; x < 14; x += 0.4) g.fillRect(x, 0, 0.04, Hm);
    g.fillStyle = '#4a3a2a'; g.fillRect(5, Y(Hm, 4.2), 4, 4.2); g.fillStyle = '#e8e4d8'; g.fillRect(5, Y(Hm, 4.2), 0.15, 4.2); g.fillRect(8.85, Y(Hm, 4.2), 0.15, 4.2);
    g.beginPath(); g.moveTo(5, Y(Hm, 4.2)); g.lineTo(9, Y(Hm, 0)); g.moveTo(9, Y(Hm, 4.2)); g.lineTo(5, Y(Hm, 0)); g.strokeStyle = '#e8e4d8'; g.lineWidth = 0.12; g.stroke(); });
  cell(3, 2, 1, 1, 18, 9, Hm => { door(8.2, Y(Hm, 3.2), 1.6, 3.2, '#3a2a1a');
    for(const x of [1.2, 4.2, 12.2, 15.2]){
      if(!lit){ g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(x + 0.8, Y(Hm, 6.4), 0.95, Math.PI, 0); g.fill(); g.fillRect(x - 0.15, Y(Hm, 6.4), 1.9, 4.6); }
      g.fillStyle = lit ? glow() : '#26323b'; g.beginPath(); g.arc(x + 0.8, Y(Hm, 6.4), 0.8, Math.PI, 0); g.fill(); g.fillRect(x, Y(Hm, 6.4), 1.6, 4.4); }
    win(7.6, Y(Hm, 7.4), 2.8, 1.6); });
  // the shop variants: a fascia with the shop's name, a striped awning, a display window, the door, flats above
  SHOP_KINDS.forEach((k, i) => cell(4 + i % 4, Math.floor(i / 4), 1, 1, 5.4, 9.0, Hm => {
    if(lit){ g.fillStyle = k.glow; g.fillRect(0.35, Y(Hm, 2.8), 3.7, 2.35); g.fillStyle = '#000'; g.fillRect(2.15, Y(Hm, 2.8), 0.08, 2.35); }
    else {
      g.fillStyle = k.fascia; g.fillRect(0, Y(Hm, 3.65), 5.4, 0.75); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, Y(Hm, 3.65), 5.4, 0.06); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, Y(Hm, 2.95), 5.4, 0.06);
      g.fillStyle = k.ink; g.font = `bold ${k.name.length > 10 ? 0.3 : 0.4}px Georgia`; g.textAlign = 'center'; g.fillText(k.name, 2.7, Y(Hm, 3.14)); g.textAlign = 'left';
      g.fillStyle = k.frame; g.fillRect(0.2, Y(Hm, 2.95), 3.95, 2.95); g.fillRect(0, Y(Hm, 0.45), 5.4, 0.45);      // window frame and stallriser
      const gr = g.createLinearGradient(0, Y(Hm, 2.8), 0, Y(Hm, 0.5)); gr.addColorStop(0, '#2a3640'); gr.addColorStop(1, '#141c22');
      g.fillStyle = gr; g.fillRect(0.35, Y(Hm, 2.8), 3.7, 2.3);
      for(let q = 0; q < 9; q++){ g.fillStyle = k.goods[q % k.goods.length]; const gx = 0.5 + (q % 3) * 1.2 + rnd() * 0.2, gy = Y(Hm, 0.95 + Math.floor(q / 3) * 0.6); g.fillRect(gx, gy, 0.55 + rnd() * 0.3, 0.32); }
      g.fillStyle = k.frame; g.fillRect(2.15, Y(Hm, 2.8), 0.08, 2.3);
      g.fillStyle = 'rgba(200,230,240,0.18)'; g.fillRect(0.45, Y(Hm, 2.7), 1.2, 0.9);
      if(k.awning){
        for(let q = 0; q < 9; q++){ g.fillStyle = q % 2 ? '#f2f0ea' : k.awning; g.fillRect(q * 0.6, Y(Hm, 2.95), 0.6, 0.4); }
        for(let q = 0; q < 9; q++){ g.fillStyle = q % 2 ? '#f2f0ea' : k.awning; g.beginPath(); g.arc(q * 0.6 + 0.3, Y(Hm, 2.55), 0.3, 0, Math.PI); g.fill(); }
      }
      if(k.sign){ g.fillStyle = k.fascia; g.fillRect(4.55, Y(Hm, 5.1), 0.8, 0.9); g.fillStyle = k.ink; g.font = 'bold 0.26px Georgia'; g.textAlign = 'center'; g.fillText(k.sign, 4.95, Y(Hm, 4.5)); g.textAlign = 'left'; }
    }
    door(4.4, Y(Hm, 2.4), 0.8, 2.4, k.frame);
    for(const y of [5.9, 8.4]) { win(0.8, Y(Hm, y), 1.2, 1.5); win(3.2, Y(Hm, y), 1.2, 1.5); }
  }));
  if(lit) return;
  // row 3: roof tiles (two cells), plain stone, corrugated metal
  cell(0, 3, 2, 1, 10, 5, Hm => { g.fillStyle = '#d8d8d4'; g.fillRect(0, 0, 10, 5);
    for(let y = 0; y < 5; y += 0.32){ g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, 10, 0.05); for(let x = (y * 3.1) % 0.5; x < 10; x += 0.5) g.fillRect(x, y, 0.03, 0.32); } });
  cell(2, 3, 1, 1, 6, 6, Hm => { g.fillStyle = '#d6d2c8'; g.fillRect(0, 0, 6, 6); for(let y = 0; y < 6; y += 0.45) for(let x = (y * 1.7) % 0.9; x < 6; x += 0.9){ g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.04; g.strokeRect(x, y, 0.9, 0.45); } });
  cell(3, 3, 1, 1, 6, 6, Hm => { g.fillStyle = '#dcdcd8'; g.fillRect(0, 0, 6, 6); for(let x = 0; x < 6; x += 0.3){ g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, 0, 0.1, 6); } });
}
const atlasTex = canvasTex(AW, ATLAS, g => paintAtlas(g, false)), litTex = canvasTex(AW, ATLAS, g => paintAtlas(g, true));
atlasTex.anisotropy = 8;
// Lit windows come on at dusk; a hash of each building's position keeps some houses dark all night.
const winU = {value: 0};
const atlasMat = new THREE.MeshStandardMaterial({map: atlasTex, roughness: 0.9, emissive: 0xffc27a, emissiveMap: litTex, emissiveIntensity: 1});
atlasMat.onBeforeCompile = sh => {
  sh.uniforms.uWin = winU;
  sh.vertexShader = 'varying float vLit;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vLit = step(0.22, fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453));
  #else
    vLit = 1.0;
  #endif`);
  sh.fragmentShader = 'uniform float uWin; varying float vLit;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= uWin * vLit;');
};
const UVC = (cx, cy, cw = 1, ch = 1) => [cx / 8, 1 - (cy + ch) / 4, (cx + cw) / 8, 1 - cy / 4];
const CELLS = {terraceF: UVC(0, 0), terraceB: UVC(1, 0), houseF: UVC(2, 0), houseB: UVC(3, 0), cottageF: UVC(0, 1), shopF: UVC(1, 1), villaF: UVC(2, 1), side: UVC(3, 1),
  wareF: UVC(0, 2, 2, 1), barnF: UVC(2, 2), civicF: UVC(3, 2), roof: UVC(0, 3, 2, 1), stone: UVC(2, 3), metal: UVC(3, 3)};
for(let i = 0; i < 8; i++) CELLS['shop' + (i + 1)] = UVC(4 + i % 4, Math.floor(i / 4));
// Walls (with gable ends on the left and right) and a pitched roof, ridge along the street.
function archGeo(A){
  const {w, h, d, rh} = A, hw = w / 2, hd = d / 2, P = [], U = [], N = [], I = [];
  const poly = (pts, uvs, n) => { const b = P.length / 3; pts.forEach(p => P.push(...p)); uvs.forEach(u => U.push(...u)); pts.forEach(() => N.push(...n)); for(let k = 1; k < pts.length - 1; k++) I.push(b, b + k, b + k + 1); };
  const rect = (uv, fx0, fy0, fx1, fy1) => [[uv[0] + (uv[2] - uv[0]) * fx0, uv[1] + (uv[3] - uv[1]) * fy0], [uv[0] + (uv[2] - uv[0]) * fx1, uv[1] + (uv[3] - uv[1]) * fy0], [uv[0] + (uv[2] - uv[0]) * fx1, uv[1] + (uv[3] - uv[1]) * fy1], [uv[0] + (uv[2] - uv[0]) * fx0, uv[1] + (uv[3] - uv[1]) * fy1]];
  // the front and back: the painted two storeys, then any extra storeys as repeats of the top floor of the cell
  const h2 = A.h2 || h, bv = A.bandV || 0.5, hb = h2 * bv;
  const faceBands = (cell, z, sgn) => {
    const xs = sgn > 0 ? [-hw, hw] : [hw, -hw];
    poly([[xs[0], 0, z], [xs[1], 0, z], [xs[1], h2, z], [xs[0], h2, z]], rect(CELLS[cell], 0, 0, 1, 1), [0, 0, sgn]);
    for(let y = h2; y < h - 1e-3; y += hb){ const y1 = Math.min(h, y + hb); poly([[xs[0], y, z], [xs[1], y, z], [xs[1], y1, z], [xs[0], y1, z]], rect(CELLS[cell], 0, 1 - bv * (y1 - y) / hb, 1, 1), [0, 0, sgn]); }
  };
  faceBands(A.front, hd, 1); faceBands(A.back || A.front, -hd, -1);
  const sv = (z, y) => { const c = CELLS[A.side || 'side']; return [c[0] + (c[2] - c[0]) * z, c[1] + (c[3] - c[1]) * y]; };
  const top = h + rh, f = y => y / top;
  poly([[hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], [hw, top, 0], [hw, h, hd]], [sv(0, 0), sv(1, 0), sv(1, f(h)), sv(0.5, 1), sv(0, f(h))], [1, 0, 0]);
  poly([[-hw, 0, -hd], [-hw, 0, hd], [-hw, h, hd], [-hw, top, 0], [-hw, h, -hd]], [sv(0, 0), sv(1, 0), sv(1, f(h)), sv(0.5, 1), sv(0, f(h))], [-1, 0, 0]);
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); body.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); body.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); body.setIndex(I);
  // roof
  const P2 = [], U2 = [], N2 = [], I2 = [];
  const poly2 = (pts, uvs, n) => { const b = P2.length / 3; pts.forEach(p => P2.push(...p)); uvs.forEach(u => U2.push(...u)); pts.forEach(() => N2.push(...n)); for(let k = 1; k < pts.length - 1; k++) I2.push(b, b + k, b + k + 1); };
  const ov = 0.35, yE = h - ov * rh / hd, nl = Math.hypot(hd, rh), rc = CELLS[A.roofCell || 'roof'];
  const ruv = rect(rc, 0, 0, Math.min(1, (w + 2 * ov) / 10), Math.min(1, (hd + ov) * 1.1 / 5));
  poly2([[-hw - ov, yE, hd + ov], [hw + ov, yE, hd + ov], [hw + ov, top, 0], [-hw - ov, top, 0]], ruv, [0, hd / nl, rh / nl]);
  poly2([[hw + ov, yE, -hd - ov], [-hw - ov, yE, -hd - ov], [-hw - ov, top, 0], [hw + ov, top, 0]], ruv, [0, hd / nl, -rh / nl]);
  if(A.chimney){                                                         // a chimney stack on the ridge
    const cx = hw * 0.55, cw = 0.7, cd = 0.9, ch = 1.3, sc = rect(CELLS.stone, 0, 0, 0.3, 0.3);
    for(const [n, pts] of [[[0, 0, 1], [[cx - cw / 2, top - 0.5, cd / 2], [cx + cw / 2, top - 0.5, cd / 2], [cx + cw / 2, top + ch, cd / 2], [cx - cw / 2, top + ch, cd / 2]]],
      [[0, 0, -1], [[cx + cw / 2, top - 0.5, -cd / 2], [cx - cw / 2, top - 0.5, -cd / 2], [cx - cw / 2, top + ch, -cd / 2], [cx + cw / 2, top + ch, -cd / 2]]],
      [[1, 0, 0], [[cx + cw / 2, top - 0.5, cd / 2], [cx + cw / 2, top - 0.5, -cd / 2], [cx + cw / 2, top + ch, -cd / 2], [cx + cw / 2, top + ch, cd / 2]]],
      [[-1, 0, 0], [[cx - cw / 2, top - 0.5, -cd / 2], [cx - cw / 2, top - 0.5, cd / 2], [cx - cw / 2, top + ch, cd / 2], [cx - cw / 2, top + ch, -cd / 2]]],
      [[0, 1, 0], [[cx - cw / 2, top + ch, cd / 2], [cx + cw / 2, top + ch, cd / 2], [cx + cw / 2, top + ch, -cd / 2], [cx - cw / 2, top + ch, -cd / 2]]]]) poly2(pts, sc, n);
  }
  const rf = new THREE.BufferGeometry();
  rf.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); rf.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2)); rf.setAttribute('normal', new THREE.Float32BufferAttribute(N2, 3)); rf.setIndex(I2);
  return {body, roof: rf};
}
const ARCH = {
  terrace:  {w: 5.4, h: 6.2, d: 9.0, rh: 2.6, front: 'terraceF', back: 'terraceB', chimney: true, setback: 1.6, gap: 0,
    walls: [0xa0523a, 0x8e4532, 0xb5603f, 0xc9a46a, 0xe8dcc0, 0xf0ece0, 0x9a958a], roofs: [0x4a4f58, 0x3e434b, 0x55585c]},
  shop:     {w: 5.4, h: 9.0, d: 11, rh: 2.8, front: 'shopF', back: 'terraceB', chimney: true, setback: 1.6, gap: 0,
    walls: [0xe8dcc0, 0xf0ece0, 0xd8e4ec, 0xe8d0c8, 0xd8e8d0, 0xf2e2a8, 0xa0523a], roofs: [0x4a4f58, 0x3e434b]},
  house:    {w: 7.6, h: 5.8, d: 8.5, rh: 3.0, front: 'houseF', back: 'houseB', chimney: true, setback: 5, gap: 3.5,
    walls: [0xa0523a, 0xe8dcc0, 0xf0ece0, 0xc9a46a, 0x9a958a, 0xe6d39a], roofs: [0x4a4f58, 0x8a3a2a, 0x6b4a3a, 0x3e434b]},
  villa:    {w: 9.5, h: 5.8, d: 9.0, rh: 3.2, front: 'villaF', back: 'houseB', chimney: true, setback: 8, gap: 7,
    walls: [0xf0ece0, 0xe8dcc0, 0xa0523a, 0x9a958a], roofs: [0x4a4f58, 0x8a3a2a, 0x3e434b]},
  cottage:  {w: 7.0, h: 3.6, d: 6.0, rh: 3.0, front: 'cottageF', back: 'cottageF', chimney: true, setback: 3, gap: 4,
    walls: [0xf3efe6, 0xe8dcc0, 0x9a958a, 0xe6d39a], roofs: [0x4a4f58, 0x3e434b, 0x6b4a3a]},
  warehouse:{w: 20, h: 8, d: 14, rh: 3.5, front: 'wareF', back: 'wareF', side: 'side', setback: 3, gap: 6,
    walls: [0x8e4532, 0xa0523a, 0x8a8d91, 0x9a958a], roofs: [0x5a5f66, 0x4a4f58]},
  barn:     {w: 14, h: 5.5, d: 9, rh: 3.0, front: 'barnF', back: 'barnF', side: 'metal', roofCell: 'metal', setback: 6, gap: 8,
    walls: [0x8a3a2a, 0x6a6d70, 0x7a5a3a], roofs: [0x5a5f66, 0x6a4a3a]},
  civic:    {w: 18, h: 9, d: 14, rh: 4.0, front: 'civicF', back: 'houseB', side: 'side', setback: 6, gap: 10,
    walls: [0x9a958a, 0xc9a46a, 0xa0523a], roofs: [0x4a4f58]},
};
for(let i = 1; i <= 8; i++) ARCH['shop' + i] = Object.assign({}, ARCH.shop, {front: 'shop' + i});
const SHOPS = ['shop', 'shop1', 'shop2', 'shop3', 'shop4', 'shop5', 'shop6', 'shop7', 'shop8'];
Object.values(ARCH).forEach(A => Object.assign(A, archGeo(A)));
// Office towers and skyscrapers for the city centres: their own facade tile (4 bays by 4 floors of glazing between
// concrete bands), repeated up the walls by UV, a flat roof with a plant room, and windows lit at random after dark.
const TW = 12, TH = 14.4;
function paintTower(g, w, h, lit){
  let s = lit ? 41 : 17; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = lit ? '#000' : '#e4e2dc'; g.fillRect(0, 0, w, h);
  const bx = w / 4, fy = h / 4;
  for(let f = 0; f < 4; f++) for(let b = 0; b < 4; b++){
    const x = b * bx + bx * 0.08, y = f * fy + fy * 0.18, ww = bx * 0.84, hh = fy * 0.66;
    if(lit){ if(rnd() < 0.45){ const k = 0.6 + rnd() * 0.4; g.fillStyle = `rgb(${255 * k | 0},${232 * k | 0},${180 * k | 0})`; g.fillRect(x, y, ww, hh); } continue; }
    const gr = g.createLinearGradient(x, y, x + ww, y + hh); gr.addColorStop(0, '#5f7f96'); gr.addColorStop(0.5, '#2c4558'); gr.addColorStop(1, '#3c5a70');
    g.fillStyle = gr; g.fillRect(x, y, ww, hh);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + ww * 0.1, y + hh * 0.08, ww * 0.18, hh * 0.84);
    g.fillStyle = '#bdbab2'; g.fillRect(x + ww / 2 - 1, y, 2, hh);
  }
  if(!lit){ g.fillStyle = 'rgba(0,0,0,0.08)'; for(let f = 0; f <= 4; f++) g.fillRect(0, f * fy - 1, w, 3); }
}
const towerTex = canvasTex(256, 308, (g, w, h) => paintTower(g, w, h, false)), towerLit = canvasTex(256, 308, (g, w, h) => paintTower(g, w, h, true));
[towerTex, towerLit].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; });
const towerMat = new THREE.MeshStandardMaterial({map: towerTex, roughness: 0.35, metalness: 0.25, emissive: 0xffd9a0, emissiveMap: towerLit, emissiveIntensity: 1});
towerMat.onBeforeCompile = atlasMat.onBeforeCompile;
const roofTopMat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.85});
function towerGeo(A){
  const {w, h, d} = A, hw = w / 2, hd = d / 2, P = [], U = [], N = [], I = [];
  const face = (pts, n, len) => { const b = P.length / 3; pts.forEach(p => P.push(...p)); [[0, 0], [len / TW, 0], [len / TW, h / TH], [0, h / TH]].forEach(u => U.push(...u)); pts.forEach(() => N.push(...n)); I.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  face([[-hw, 0, hd], [hw, 0, hd], [hw, h, hd], [-hw, h, hd]], [0, 0, 1], w);
  face([[hw, 0, -hd], [-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd]], [0, 0, -1], w);
  face([[hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], [hw, h, hd]], [1, 0, 0], d);
  face([[-hw, 0, -hd], [-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd]], [-1, 0, 0], d);
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); body.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); body.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); body.setIndex(I);
  const roof = mergeBox([[w + 0.4, 0.6, d + 0.4, 0, h + 0.3, 0], [w * 0.42, 3.4, d * 0.42, 0, h + 2.3, 0], [1.2, 6, 1.2, w * 0.3, h + 3, -d * 0.3], [w + 0.4, 1.1, 0.3, 0, h + 1.1, hd + 0.05], [w + 0.4, 1.1, 0.3, 0, h + 1.1, -hd - 0.05]]);
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(roof.attributes.position.count * 2), 2));
  return {body, roof};
}
const TOWERS = {towerA: {w: 20, d: 18, h: TH * 2, shade: 1}, towerB: {w: 22, d: 22, h: TH * 3.5, shade: 1}, towerC: {w: 18, d: 18, h: TH * 5.5, shade: 1}, towerD: {w: 26, d: 20, h: TH * 1.5, shade: 1}};
Object.entries(TOWERS).forEach(([k, A]) => { Object.assign(A, {rh: 0, setback: 4, gap: 7, mat: towerMat, roofMat: roofTopMat,
  walls: [0xffffff, 0xe8eef2, 0xf2e2c8, 0xd6e4ee, 0xc8d4dc, 0xe6d2c0, 0xb8c8d8], roofs: [0x8a8d91, 0x9a9ea2, 0x7a7d80]}, towerGeo(A)); ARCH[k] = A; });

lap('atlas');
// ------------------------------------------------------------------ laying out the buildings
const countryside = new Map();                  // farms, cottages and keepers' houses, in 6 km tiles
function bucketFor(x, z){
  const k = Math.floor(x / (6000 * M)) + ',' + Math.floor(z / (6000 * M));
  if(!countryside.has(k)) countryside.set(k, {inst: {}, x: (Math.floor(x / (6000 * M)) + 0.5) * 6000 * M, z: (Math.floor(z / (6000 * M)) + 0.5) * 6000 * M, R: 4300 * M});
  return countryside.get(k);
}
// Can a building of this archetype stand here, facing yaw? Records it if so.
function tryPlace(owner, type, x, z, yaw, scale, r, extraOk){
  const A = ARCH[type], hx = A.w * scale * M / 2 + 0.3 * M, hz = A.d * scale * M / 2 + 0.3 * M;
  const o = {x, z, hx, hz, yaw};                                          // padded, to keep a gap between buildings
  // cheapest and likeliest refusals first: another building, a road, the railway
  if(!obbFree(o)) return false;
  if(roadClear(x, z) < 1 * M) return false;
  const walls = obbCorners({x, z, hx: hx - 0.3 * M, hz: hz - 0.3 * M, yaw});
  for(let k = 0; k < 4; k++){ const [x0, z0] = walls[k], [x1, z1] = walls[(k + 1) % 4];
    for(let f = 0; f < 1; f += 0.2) if(roadClear(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f) < 0.4 * M) return false; }
  if(K.nearTrack(x, z, Math.max(hx, hz) + 8 * M) || nearStation(x, z, 40 * M)) return false;
  let lo = Infinity, hi = -Infinity;
  for(const [cx, cz] of walls.concat([[x, z]])){
    const h = H(cx, cz); lo = Math.min(lo, h); hi = Math.max(hi, h);
    if(h < 1.2 * M || inZone(cx, cz)) return false;
  }
  if(hi - lo > 3.0 * M) return false;
  if(extraOk && !extraOk(o)) return false;
  addObb(o);
  const list = owner.inst[type] || (owner.inst[type] = []);
  const st = owner.style, own = st && !A.mat && type.indexOf('warehouse') < 0 && type.indexOf('barn') < 0;
  const W_ = own ? st.walls : A.walls, R_ = own ? st.roofs : A.roofs;
  const rec = {x, y: lo - 0.25 * M, z, yaw, s: scale, wall: W_[Math.floor(r() * W_.length)], roof: R_[Math.floor(r() * R_.length)], obb: o};
  list.push(rec);
  return rec;
}
// Walk along a street placing buildings on both sides, terraces in the centre, detached houses further out.
function lineStreet(t, rd, r){
  const n = rd.pts.length;
  for(const side of [-1, 1]){
    let s = 4 * M + r() * 6 * M, row = null, i = 0;
    while(s < rd.s[n - 1] - 4 * M){
      while(i < n - 2 && rd.s[i + 1] < s) i++;
      const f = (s - rd.s[i]) / Math.max(1e-9, rd.s[i + 1] - rd.s[i]), p = rd.pts[i], q = rd.pts[i + 1];
      const x0 = p.x + (q.x - p.x) * f, z0 = p.z + (q.z - p.z) * f, tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
      const nx = tz / tl * side, nz = -tx / tl * side;                       // away from the street on this side
      const dc = Math.hypot(x0 - t.x, z0 - t.z), qd = dc / t.R;
      if(qd > 1.0 + (fbm(x0 * 3, z0 * 3) - 0.5) * 0.3){ s += (qd > 1.6 ? 120 : 12) * M; row = null; continue; }
      let type;
      if(t.cls === 1) type = r() < ((t.style && t.style.cottage) || 0.6) ? 'cottage' : 'house';
      else if(t.cls === 3 && qd < 0.14 && rd.cls !== 'lane' && r() < ((t.style && t.style.tower) || 0.2)) type = ['towerA', 'towerB', 'towerC', 'towerD'][Math.floor(r() * (qd < 0.08 ? 4 : 2)) + (qd < 0.08 ? 0 : 0)];       // the business district
      else if(qd < 0.22) type = rd.cls !== 'lane' && r() < 0.65 ? 'shop' : 'terrace';
      else if(qd < 0.55) type = r() < 0.7 ? 'terrace' : 'house';
      else type = r() < 0.55 ? 'house' : r() < 0.7 ? 'villa' : 'cottage';
      if(row && (row.type === 'terrace' || row.type === 'shop') && row.left > 0 && (type === 'terrace' || type === 'shop')) type = row.type === 'shop' && qd < 0.22 ? 'shop' : 'terrace';
      const base = type;
      if(type === 'shop') type = SHOPS[Math.floor(r() * SHOPS.length)];       // the baker, the grocer, the post office, the pub
      if(t.style && !ARCH[type].mat) type = styledType(type, t.style);
      const A = ARCH[type], ss = (t.style && t.style.scale) || 1, sc = (A.front === 'terraceF' || /^shop/.test(A.front) || A.mat ? 1 : 0.9 + r() * 0.2) * (A.mat ? 1 : ss);
      const back = rd.hw + A.setback * M + A.d * sc * M / 2;
      const x = x0 + nx * back, z = z0 + nz * back, yaw = Math.atan2(-nx, -nz);
      const rec = tryPlace(t, type, x, z, yaw, sc, r);
      if(rec){
        if(base === 'terrace' || base === 'shop'){
          if(!row || row.type !== base || row.left <= 0) row = {type: base, left: 4 + Math.floor(r() * 7), wall: rec.wall, roof: rec.roof};
          rec.wall = row.wall; rec.roof = row.roof; row.left--;
        } else row = null;
        s += A.w * sc * M + A.gap * M * (0.6 + r() * 0.8);
      } else { s += 5 * M; row = null; }
    }
  }
}
// Each town's streets are lined with houses the first time you come near it (see ensureTown), which keeps
// loading quick; everything that must claim its ground first (churches, harbours, schools) is placed now.
lap('townBuildings');
// Industry by the railway in the cities and towns: warehouses and mills with chimneys.
const landmarkFns = [];
towns.forEach(t => {
  if(t.cls < 2 || t.noStation) return;
  const r = rng(t.seed + 11), line = LINES[t.st.lines[0]];
  const tries = t.cls === 3 ? 26 : 10;
  for(let k = 0; k < tries; k++){
    const du = (r() - 0.5) * t.R * 1.6 / line.real.len, u = Math.max(0, Math.min(1, t.st.trackU + du));
    const p = realAt(line, u, new V3()), d = realDir(line, u, new V3()); d.y = 0; d.normalize();
    const side = r() < 0.5 ? -1 : 1, nx = d.z * side, nz = -d.x * side, off = (24 + r() * 50) * M;
    const x = p.x + nx * off, z = p.z + nz * off;
    const rec = tryPlace(t, 'warehouse', x, z, Math.atan2(-nx, -nz), 0.9 + r() * 0.3, r);
    if(rec && r() < 0.45) landmarkFns.push({owner: t, fn: g => { const c = cylY(g, 1.1, 1.5, 26, mat(0x8e4532, 0.85), 0, 13, 0, 14); }, x: x + d.x * 9 * M, z: z + d.z * 9 * M, y: rec.y});
  }
});
// Farms along the roads between towns: a farmhouse and a barn or two.
roads.forEach(rd => {
  if(rd.town) return;
  const r = rng(Math.floor(rd.pts[0].x * 1e5) ^ Math.floor(rd.pts[0].z * 1e5)), L = rd.s[rd.s.length - 1];
  for(let s = 300 * M + r() * 600 * M; s < L - 300 * M; s += (700 + r() * 900) * M){
    const i = Math.min(rd.pts.length - 2, Math.round(s / (8 * M))), p = rd.pts[i], q = rd.pts[i + 1];
    if(towns.some(t => Math.hypot(t.x - p.x, t.z - p.z) < t.R * 1.15)) continue;
    const tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1, side = r() < 0.5 ? -1 : 1, nx = tz / tl * side, nz = -tx / tl * side;
    const owner = bucketFor(p.x, p.z), yaw = Math.atan2(-nx, -nz), back = rd.hw + 12 * M;
    const house = tryPlace(owner, r() < 0.5 ? 'house' : 'cottage', p.x + nx * back, p.z + nz * back, yaw, 1, r);
    if(!house) continue;
    const bx = p.x + nx * (back + 22 * M) + tx / tl * 14 * M, bz = p.z + nz * (back + 22 * M) + tz / tl * 14 * M;
    tryPlace(owner, 'barn', bx, bz, yaw + Math.PI / 2, 1, r);
    if(r() < 0.5) tryPlace(owner, 'barn', bx - tx / tl * 26 * M, bz - tz / tl * 26 * M, yaw, 0.8, r);
  }
});
// A school or chapel in each town
towns.forEach(t => {
  if(t.cls < 2) return;
  const r = rng(t.seed + 19);
  for(let k = 0, n = 0; k < 60 && n < (t.cls === 3 ? 3 : 1); k++){
    const a = r() * TAU, d = (60 + r() * t.R * 0.6) * M, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
    if(tryPlace(t, 'civic', x, z, r() * TAU, 1, r)) n++;
  }
});

lap('farmsIndustry');
// ------------------------------------------------------------------ landmarks: churches, town halls, castles, abbeys
const lmGroups = [];
function landmarkGroup(owner, x, y, z, yaw){ const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; g.scale.setScalar(M); (owner.lm || (owner.lm = [])).push(g); return g; }
function church(g, big){
  const ST = mat(STONE2, 0.9), SL = mat(0x4a4f58, 0.75);
  const L = big ? 24 : 16, W = big ? 10 : 8, Hh = big ? 8 : 6;
  box(g, W, Hh, L, ST, 0, Hh / 2, 0);
  const rf = add(g, new THREE.CylinderGeometry(W * 0.62, W * 0.62, L + 0.6, 3).rotateX(-Math.PI / 2), SL, 0, Hh + W * 0.31 * 0.75, 0); rf.scale.y = 0.75;
  for(let k = 0; k < (big ? 5 : 3); k++) for(const s of [-1, 1]){ const w = add(g, new THREE.PlaneGeometry(1.0, 3.0), glassMat(), s * (W / 2 + 0.02), Hh * 0.55, -L / 2 + 3 + k * (L - 6) / Math.max(1, (big ? 4 : 2))); w.rotation.y = s * Math.PI / 2; }
  const tw = big ? 6 : 4.5, th = big ? 20 : 13;
  box(g, tw, th, tw, ST, 0, th / 2, L / 2 + tw / 2 - 0.5);
  for(let k = 0; k < 4; k++) box(g, 0.9, 0.9, 0.5, ST, (k % 2 ? 1 : -1) * (tw / 2 - 0.45), th + 0.45, L / 2 + tw / 2 - 0.5 + (k < 2 ? 1 : -1) * (tw / 2 - 0.25));
  if(big){ add(g, new THREE.ConeGeometry(tw * 0.55, 14, 8), SL, 0, th + 7, L / 2 + tw / 2 - 0.5); }
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), mat(0xf2f0e6, 0.5)); clock.position.set(0, th - 3, L / 2 + tw - 0.48); g.add(clock);
  box(g, 1.6, 3.2, 0.2, mat(0x3a2a1a, 0.7), 0, 1.6, L / 2 + tw - 0.45);
}
function townHall(g){
  const ST = mat(0xc9b38a, 0.85), SL = mat(0x4a4f58, 0.75);
  box(g, 28, 12, 16, ST, 0, 6, 0);
  for(let row = 0; row < 2; row++) for(let k = 0; k < 9; k++){ const w = add(g, new THREE.PlaneGeometry(1.4, 2.4), glassMat(), -12 + k * 3, 3 + row * 5, 8.02); }
  box(g, 29, 0.8, 17, mat(0xb8a27a, 0.8), 0, 12.4, 0);
  const rf = add(g, new THREE.CylinderGeometry(9.6, 9.6, 28.6, 4).rotateY(Math.PI / 4).rotateZ(Math.PI / 2), SL, 0, 15.4, 0); rf.scale.set(1, 0.45, 0.95);
  box(g, 5, 9, 5, ST, 0, 17, 0);
  for(const s of [-1, 1]){ const c = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), mat(0xf2f0e6, 0.5)); c.position.set(0, 18.5, s * 2.52); if(s < 0) c.rotation.y = Math.PI; g.add(c); }
  add(g, new THREE.ConeGeometry(3.4, 5, 4).rotateY(Math.PI / 4), mat(0x3f6f5a, 0.6, 0.3), 0, 24, 0);
  for(let k = 0; k < 4; k++) cylY(g, 0.5, 0.5, 6, mat(0xe8e2cf, 0.7), -4.5 + k * 3, 3, 9.2, 10);
  box(g, 12, 0.8, 3, mat(0xe8e2cf, 0.7), 0, 6.4, 9.2);
}
function castle(g){
  const ST = mat(0x8a8478, 0.92), DK = mat(0x6e675c, 0.92);
  const S2 = 34;
  for(const [x, z, rot] of [[0, S2, 0], [0, -S2, 0], [S2, 0, 1], [-S2, 0, 1]]){
    const wl = box(g, rot ? 3 : 2 * S2, 10, rot ? 2 * S2 : 3, ST, x, 5, z);
    for(let k = -S2 + 3; k < S2; k += 3) box(g, rot ? 3.4 : 1.4, 1.2, rot ? 1.4 : 3.4, ST, rot ? x : k, 10.6, rot ? k : z);
  }
  for(const [x, z] of [[S2, S2], [S2, -S2], [-S2, S2], [-S2, -S2]]){ cylY(g, 5, 5.6, 15, ST, x, 7.5, z, 18); for(let k = 0; k < 10; k++){ const a = k / 10 * TAU; box(g, 1.3, 1.3, 1.3, ST, x + Math.cos(a) * 4.8, 15.6, z + Math.sin(a) * 4.8); } }
  box(g, 18, 26, 18, ST, -6, 13, -6);
  for(let k = 0; k < 6; k++) for(const s of [-1, 1]) box(g, 1.6, 1.6, 1.6, ST, -6 + (k - 2.5) * 3.2, 26.8, -6 + s * 8.6);
  box(g, 7, 7, 1.0, DK, 0, 3.5, S2 + 1.6);
  for(let k = 0; k < 3; k++) for(const s of [-1, 1]){ const w = add(g, new THREE.PlaneGeometry(1.2, 2.4), mat(0x1a1a1a, 0.9), -6 + (k - 1) * 5, 12 + (k % 2) * 6, -6 + s * 9.02); if(s < 0) w.rotation.y = Math.PI; }
}
function abbey(g){
  const ST = mat(0x9a948a, 0.95);
  box(g, 1.4, 12, 34, ST, -6, 6, 0); box(g, 1.4, 9, 26, ST, 6, 4.5, -4);
  box(g, 13.4, 14, 1.4, ST, 0, 7, 17);
  const arch = add(g, new THREE.PlaneGeometry(4.5, 8.5), mat(0x2a2a2a, 0.9), 0, 5, 17.72);
  for(let k = 0; k < 4; k++) box(g, 1.6, 6 + (k % 2) * 3, 1.6, ST, 0, 3 + (k % 2) * 1.5, -12 + k * 6);
  box(g, 6, 3, 1.4, ST, 3, 1.5, -17);
}
towns.forEach(t => {
  const r = rng(t.seed + 23);
  // the church: near the centre, facing a street
  for(let k = 0; k < 40; k++){
    const a = r() * TAU, d = (t.cls === 1 ? 40 + r() * 80 : 80 + r() * t.R * 0.35) * M, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
    const yaw = r() * TAU, o = {x, z, hx: 9 * M, hz: 18 * M, yaw};
    if(H(x, z) < 2 * M || K.nearTrack(x, z, 28 * M) || roadClear(x, z) < 12 * M || !obbFree(o) || inZone(x, z)) continue;
    addObb(o);
    const g = landmarkGroup(t, x, H(x, z) - 0.4 * M, z, yaw); church(g, t.cls >= 2);
    break;
  }
  if(t.cls === 3) for(let k = 0; k < 40; k++){
    const a = r() * TAU, d = (30 + r() * 120) * M, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d, yaw = Math.atan2(t.x - x, t.z - z);
    const o = {x, z, hx: 15 * M, hz: 11 * M, yaw};
    if(H(x, z) < 2 * M || K.nearTrack(x, z, 30 * M) || roadClear(x, z) < 10 * M || !obbFree(o) || inZone(x, z)) continue;
    addObb(o); townHall(landmarkGroup(t, x, H(x, z) - 0.4 * M, z, yaw)); break;
  }
});
const extraSites = [];                    // castles and abbeys beside the stations named after them
STATIONS.forEach(st => {
  const isC = /Castle/.test(st.name || ''), isA = /Abbey/.test(st.name || '');
  if(!isC && !isA) return;
  const r = rng(Math.floor(hash(st.x, st.z) * 1e9));
  let best = null;
  for(let k = 0; k < 24; k++){
    const a = k / 24 * TAU, d = (isC ? 220 : 140) * M, x = st.x + Math.cos(a) * d, z = st.z + Math.sin(a) * d, h = H(x, z);
    if(h < 2 * M || K.nearTrack(x, z, 60 * M) || roadClear(x, z) < 30 * M || inZone(x, z)) continue;
    if(!best || h > best.h) best = {x, z, h};
  }
  if(!best) return;
  const owner = {inst: {}, x: best.x, z: best.z, R: 300 * M, lm: []};
  const g = landmarkGroup(owner, best.x, best.h - 0.6 * M, best.z, r() * TAU);
  (isC ? castle : abbey)(g);
  addObb({x: best.x, z: best.z, hx: 45 * M, hz: 45 * M, yaw: 0});
  clearAreaW(best.x, best.z, 50 * M);
  extraSites.push({owner, name: isC ? st.name.replace(/ Castle$/, '') + ' Castle' : st.name, kind: isC ? 'castle' : 'abbey', x: best.x, z: best.z, y: best.h});
});

lap('landmarks');
// ------------------------------------------------------------------ station canopies, footbridges, train sheds
const stationGroup = new THREE.Group(); scene.add(stationGroup);
(function(){
  STATIONS.forEach(st => {
    if(st.kind === 'closed' || !MAJOR.has(st.name)) return;
    if(BESPOKE.has(st.name)) return;                  // Knapford and Ffarquhar are bespoke models, built separately
    const line = LINES[st.lines[0]]; if(!line || line.kind !== 'standard') return;
    const p = realAt(line, st.trackU, new V3()), d = realDir(line, st.trackU, new V3()); d.y = 0; d.normalize();
    const n = new V3(d.z, 0, -d.x), main = line.id === 'main', off = (3.6 / 2 + 0.6 + 2 + (main ? MAIN_LANE : 0)) * M;
    const g = new THREE.Group(); g.position.set(p.x, p.y - 0.55 * M, p.z); g.rotation.y = Math.atan2(d.x, d.z); g.scale.setScalar(M); stationGroup.add(g);
    const lx = off / M, len = 60, GR = mat(0x2f5a3a, 0.6), RF = mat(0x5a5f66, 0.7);
    // platform canopy on posts, with a valance
    for(let k = 0; k <= 6; k++) cylY(g, 0.12, 0.12, 3.6, GR, lx, 2.3, -len / 2 + k * len / 6, 8);
    const cr = box(g, 4.6, 0.25, len + 2, RF, lx + 0.4, 4.2, 0); cr.rotation.z = -0.08;
    for(let k = 0; k < len; k += 0.6) box(g, 0.05, 0.35, 0.3, mat(0xe8e2cf, 0.7), lx - 1.95, 3.95, -len / 2 + k);
    if(main){
      // a lattice footbridge over both roads
      const fz = len / 2 - 6, LAT = S.lattice(0x2f5a3a);
      for(const s of [-1, 1]) box(g, 2.2, 6.4, 2.2, GR, s * (lx), 3.2, fz);
      S.latticeBox(g, 2.0, 1.6, 2 * lx, LAT, 0, 6.6, fz).rotation.y = Math.PI / 2;
      box(g, 2 * lx + 2, 0.15, 2.2, mat(0x5a5a58, 0.8), 0, 5.8, fz);
      box(g, 2.4, 0.15, 2 * lx + 2, RF, 0, 7.5, fz).rotation.y = Math.PI / 2;
    }
    if(CITY.has(st.name) && main){
      // an arched train shed over the station: iron ribs and a glazed roof
      const span = 2 * lx + 6, shedLen = len + 30, rib = mat(0x3a4a52, 0.5, 0.4), IRON = mat(0x2f3a40, 0.45, 0.35);
      const glass = new THREE.MeshStandardMaterial({color: 0x9fb8c4, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.45, side: THREE.DoubleSide});
      for(let k = 0; k <= 10; k++){
        const z = -len / 2 - 15 + k * shedLen / 10, ring = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 0.25, 6, 24, Math.PI), rib);
        ring.position.set(0, 4, z); g.add(ring);
      }
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(span / 2, span / 2, shedLen, 24, 1, true, -Math.PI / 2, Math.PI), glass);
      shell.rotation.x = -Math.PI / 2; shell.position.y = 4; g.add(shell);
      for(const s of [-1, 1]) box(g, 1.2, 4, shedLen, mat(0x8e4532, 0.85), s * (span / 2 + 0.6), 2, 0);
      // a row of slender iron columns down each platform, carrying the roof ribs
      const colX = [-lx, lx];
      for(let k = 1; k < 10; k++){ const z = -len / 2 - 15 + k * shedLen / 10; colX.forEach(cx => {
        cylY(g, 0.14, 0.17, 4, IRON, cx, 2, z, 10);
        box(g, 0.5, 0.12, 0.5, IRON, cx, 4.02, z);                     // a small capital where it meets the rib
      }); }
      // numbered platform signs (green-and-cream enamel discs) hung between the columns, platforms
      // numbered in order across the station from the down side to the up
      const plats = [{x: -lx, face: 1, no: 1}, {x: -lx, face: -1, no: 2}, {x: lx, face: 1, no: 3}, {x: lx, face: -1, no: 4}];
      plats.forEach(pl => {
        const tex = canvasTex(96, 96, (ctx, w, h) => {
          ctx.fillStyle = '#eee9d8'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#1f5c34'; ctx.lineWidth = 6; ctx.stroke();
          ctx.fillStyle = '#1f5c34'; ctx.font = 'bold 52px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(pl.no), w / 2, h / 2 + 2);
        });
        const sign = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshStandardMaterial({map: tex, roughness: 0.6}));
        sign.position.set(pl.x, 3.35, 2); sign.rotation.y = pl.face > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(sign);
        const back = sign.clone(); back.rotation.y += Math.PI; g.add(back);
        box(g, 0.08, 1.1, 0.08, IRON, pl.x, 2.8, 2);                   // the little bracket it hangs from
      });
      // a brick station clock tower rising beside the forecourt, in the style of the market towns
      const twX = -(span / 2 + 7), th = 15, tw = 4.2;
      box(g, tw, th, tw, mat(0x9a4a32, 0.85), twX, th / 2, -len / 2 - 5);
      box(g, tw + 0.6, 0.6, tw + 0.6, mat(0x7a7a74, 0.7), twX, th + 0.3, -len / 2 - 5);
      add(g, new THREE.ConeGeometry(tw * 0.78, 5, 4).rotateY(Math.PI / 4), mat(0x3a3f46, 0.7), twX, th + 3, -len / 2 - 5);
      for(const s of [0, 1, 2, 3]){
        const ang = s * Math.PI / 2, cx = twX + Math.sin(ang) * (tw / 2 + 0.05), cz = -len / 2 - 5 + Math.cos(ang) * (tw / 2 + 0.05);
        const face = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), mat(0xf2f0e6, 0.5)); face.position.set(cx, th - 3.2, cz); face.rotation.y = ang; g.add(face);
      }
      for(let row = 0; row < 2; row++) box(g, tw * 0.9, 1.8, 0.1, glassMat(), twX, 4 + row * 4, -len / 2 - 5 + tw / 2 + 0.06);
    }
    S.bakeVC(g);
  });
})();

// Knapford is built by knapford.js (its station, throats and yard).

lap('stations');
// ------------------------------------------------------------------ rail bridges over water, and embankments
const railStruct = new THREE.Group(); scene.add(railStruct);
const vicarstownBridge = {};
(function(){
  RAIL.lines.forEach(line => {
    if(line.kind === 'closed') return;
    const R = line.real, wetAt = j => H(R.x[j], R.z[j]) < 0.4 * M;
    const lanes = line.id === 'main' ? 2 : 1, half = ((BED_M[line.kind] || 3.6) / 2 + (line.id === 'main' ? MAIN_LANE : 0) + 0.4);
    let j = 0;
    while(j < R.n){
      if(!wetAt(j) || line.real.tun.some(([a, b]) => j / (R.n - 1) > a && j / (R.n - 1) < b)){ j++; continue; }
      let e = j; while(e < R.n - 1 && (wetAt(e + 1) || (e + 3 < R.n && wetAt(e + 3)))) e++;
      const j0 = Math.max(0, j - 1), j1 = Math.min(R.n - 1, e + 1), lenM = (j1 - j0) * 6;
      const vic = line.id === 'main' && lenM > 250 && STATIONS.some(s => s.name === 'Vicarstown' && Math.hypot(s.x - R.x[j0], s.z - R.z[j0]) < 6000 * M);
      const steel = vic ? mat(0x6b2a20, 0.6, 0.3) : mat(STEEL, 0.6, 0.3), stone = mat(STONE, 0.9);
      const g = new THREE.Group();
      for(let q = j0; q < j1; q++){
        const ax = R.x[q], az = R.z[q], bx = R.x[q + 1], bz = R.z[q + 1], yaw = Math.atan2(bx - ax, bz - az), len = Math.hypot(bx - ax, bz - az) / M;
        const seg = new THREE.Group(); seg.position.set((ax + bx) / 2, (R.y[q] + R.y[q + 1]) / 2, (az + bz) / 2); seg.rotation.y = yaw; seg.scale.setScalar(M); g.add(seg);
        box(seg, half * 2, 0.9, len + 0.05, steel, 0, -0.95, 0);
        for(const s of [-1, 1]) box(seg, 0.35, vic ? 0.6 : 1.5, len + 0.05, steel, s * half, vic ? -0.2 : 0.15, 0);
        if(vic){                                                           // through truss
          for(const s of [-1, 1]){ box(seg, 0.4, 0.5, len + 0.05, steel, s * half, 7.5, 0); const dg = box(seg, 0.3, 8.6, 0.3, steel, s * half, 3.6, 0); dg.rotation.x = (q % 2 ? 1 : -1) * 0.62; box(seg, 0.35, 7.8, 0.35, steel, s * half, 3.6, len / 2); }
          if(q % 2 === 0) box(seg, half * 2, 0.35, 0.35, steel, 0, 7.6, 0);
        }
        if((q - j0) % (vic ? 6 : 4) === 0){
          const sea = Math.min(-3 * M, H(seg.position.x, seg.position.z)), ph = (seg.position.y - sea) / M - 1.4;
          box(seg, half * 2 + 1.4, ph, 2.6, stone, 0, -1.4 - ph / 2, 0);
        }
      }
      if(vic){
        // the rolling lift span in the middle: towers, a raised deck and counterweights
        const qm = Math.round((j0 + j1) / 2), x = R.x[qm], z = R.z[qm], yaw = Math.atan2(R.x[qm + 1] - R.x[qm - 1], R.z[qm + 1] - R.z[qm - 1]);
        const span = new THREE.Group(); span.position.set(x, R.y[qm], z); span.rotation.y = yaw; span.scale.setScalar(M); g.add(span);
        for(const e of [1, -1]) for(const s of [-1, 1]){ box(span, 2.6, 22, 2.6, steel, s * (half + 1.6), 9, e * 16); }
        for(const e of [1, -1]) box(span, 2 * half + 6, 2.2, 2.6, steel, 0, 20.5, e * 16);
        for(const e of [1, -1]) box(span, 2 * half + 4, 3.5, 4, mat(0x5a5d62, 0.8), 0, 16, e * 20);
        const cab = box(span, 4, 3, 4, mat(0xe8e2cf, 0.7), half + 4.6, 3, 16);
        Object.assign(vicarstownBridge, {x, z, y: R.y[qm]});
      }
      railStruct.add(g); S.bakeVC(g);
      j = e + 1;
    }
    // embankments where the line is lifted well clear of the ground (dips, viaduct approaches)
    const pts = [], ys = [], V = R.viaduct, rampN = V ? Math.round(V.ramp / 6) + 4 : 0;
    for(let q = 0; q < R.n; q++){
      pts.push(new V3(R.x[q], 0, R.z[q]));
      ys.push(V && q > V.j0 - rampN && q < V.j1 + rampN ? -1e9 : R.y[q] - 0.5 * M);   // the Culdee Fell viaduct has its own banks
    }
    bankAlong(pts, ys, half * M, 1.2 * M);
  });
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bankBuf.p, 3)); bg.setIndex(bankBuf.i); bg.computeVertexNormals();
  const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({color: 0x5f7f3e, roughness: 0.97, side: THREE.DoubleSide})); bm.receiveShadow = true; bankGroup.add(bm);
})();

lap('railBridgesBanks');
// ------------------------------------------------------------------ harbours, lighthouses and ships
const harbours = [];
const boatGroup = new THREE.Group(); scene.add(boatGroup);
function boat(g, len, col){
  if(window.SODOR_VEH){ const m = window.SODOR_VEH.boat(len > 11 ? 'fishing' : hash(len, col) < 0.5 ? 'launch' : 'yacht', col, len); m.rotation.y = Math.PI / 2; g.add(m); return; }   // bows along +x here
  const hull = new THREE.Shape(); hull.moveTo(-len / 2, -len * 0.11); hull.lineTo(len * 0.32, -len * 0.11); hull.lineTo(len / 2, 0); hull.lineTo(len * 0.32, len * 0.11); hull.lineTo(-len / 2, len * 0.11); hull.closePath();
  const hg = new THREE.ExtrudeGeometry(hull, {depth: len * 0.12, bevelEnabled: false}); hg.rotateX(-Math.PI / 2); hg.translate(0, -len * 0.05, 0);
  add(g, hg, mat(col, 0.6)); box(g, len * 0.8, len * 0.01, len * 0.2, mat(0xb4b0a4, 0.8), -len * 0.04, len * 0.07, 0);
  box(g, len * 0.18, len * 0.1, len * 0.14, mat(0xf2f0ea, 0.6), -len * 0.18, len * 0.12, 0);
  cylY(g, len * 0.012, len * 0.012, len * 0.3, mat(0x5a4a3a, 0.7), len * 0.15, len * 0.2, 0, 6);
}
function ship(g, len, hullCol, deckCol){
  if(window.SODOR_VEH){ const m = window.SODOR_VEH.ship(len, hullCol, deckCol); m.rotation.y = Math.PI / 2; g.add(m); return; }
  const hull = new THREE.Shape(); hull.moveTo(-len / 2, -len * 0.08); hull.lineTo(len * 0.36, -len * 0.08); hull.lineTo(len / 2, 0); hull.lineTo(len * 0.36, len * 0.08); hull.lineTo(-len / 2, len * 0.08); hull.closePath();
  const hg = new THREE.ExtrudeGeometry(hull, {depth: len * 0.09, bevelEnabled: false}); hg.rotateX(-Math.PI / 2); hg.translate(0, -len * 0.035, 0);
  add(g, hg, mat(hullCol, 0.6)); box(g, len * 0.86, len * 0.006, len * 0.155, mat(deckCol, 0.7), -len * 0.02, len * 0.058, 0);
  box(g, len * 0.13, len * 0.1, len * 0.14, mat(0xf2f0ea, 0.6), -len * 0.38, len * 0.11, 0);
  cylY(g, len * 0.022, len * 0.026, len * 0.08, mat(0xc8262b, 0.5), -len * 0.4, len * 0.2, 0, 12);
  for(let k = 0; k < 4; k++) box(g, len * 0.09, len * 0.045, len * 0.12, mat([0x2a6aa0, 0xc8601e, 0x3a8a4a, 0xb0302a][k], 0.6), -len * 0.18 + k * len * 0.13, len * 0.085, 0);
}
function lighthouse(g, tall, col = 0xf2f0ea){
  cylY(g, tall * 0.11, tall * 0.15, tall, mat(col, 0.6), 0, tall / 2, 0, 18);
  for(let k = 0; k < 3; k++) cylY(g, tall * 0.112 + (2 - k) * tall * 0.013, tall * 0.112 + (2 - k) * tall * 0.013, tall * 0.08, mat(RED, 0.5), 0, tall * (0.25 + k * 0.25), 0, 18);
  cylY(g, tall * 0.13, tall * 0.13, tall * 0.04, mat(0x2a2a2a, 0.6), 0, tall + tall * 0.02, 0, 18);
  cylY(g, tall * 0.08, tall * 0.08, tall * 0.1, new THREE.MeshStandardMaterial({color: 0xfff1b0, emissive: 0xffe08a, emissiveIntensity: 0.9, roughness: 0.3}), 0, tall * 1.09, 0, 14);
  add(g, new THREE.ConeGeometry(tall * 0.1, tall * 0.08, 14), mat(RED, 0.5), 0, tall * 1.18, 0);
}
(function(){
  const skip = new Set(['Brendam Docks']);
  towns.forEach(t => {
    if(skip.has(t.name)) return;
    let best = null;
    for(let k = 0; k < 48; k++){
      const a = k / 48 * TAU;
      for(let d = 30; d < (t.cls === 3 ? 1600 : t.cls === 2 ? 1100 : 600); d += 15){
        const x = t.x + Math.cos(a) * d * M, z = t.z + Math.sin(a) * d * M;
        if(H(x, z) < -0.8 * M){ if(!best || d < best.d) best = {a, d}; break; }
      }
    }
    if(!best) return;
    const dir = new V3(Math.cos(best.a), 0, Math.sin(best.a)), perp = new V3(-dir.z, 0, dir.x);
    const q = new V3(t.x, 0, t.z).addScaledVector(dir, (best.d - 10) * M);
    if(inZone(q.x, q.z) || inTaken(q.x, q.z) || K.nearTrack(q.x, q.z, 40 * M)) return;
    const big = t.cls >= 2, Lq = t.cls === 3 ? 200 : t.cls === 2 ? 130 : 55, gy = Math.max(1.4 * M, H(q.x, q.z)) + 0.3 * M;
    // clear any houses already standing on the quayside
    Object.values(t.inst).forEach(list => { for(let k = list.length - 1; k >= 0; k--){ const b = list[k], dx = b.x - q.x, dz = b.z - q.z;
      if(Math.hypot(dx, dz) < (Lq / 2 + 25) * M && dx * dir.x + dz * dir.z > -40 * M){ b.obb.dead = true; list.splice(k, 1); } } });
    const g = new THREE.Group(); g.position.set(q.x, gy, q.z); g.rotation.y = Math.atan2(dir.x, dir.z); g.scale.setScalar(M);
    // local +z is out to sea, x runs along the quay
    const top = gy / M, STN = mat(STONE, 0.9);
    box(g, Lq, top + 6, 26, mat(0x8a857a, 0.92), 0, -(top + 6) / 2 + 0.02, -6);
    box(g, Lq, 0.5, 0.5, mat(0x3a3a3a, 0.7), 0, 0.25, 6.7);
    for(let k = -Lq / 2 + 4; k < Lq / 2; k += 9) cylY(g, 0.25, 0.3, 0.6, mat(0x2a2a2a, 0.6), k, 0.3, 6.2, 8);
    // breakwaters curling round to the harbour mouth, a light at the end of one
    for(const s of [-1, 1]){
      const arm = new THREE.Group(); arm.position.set(s * Lq / 2, 0, 6); arm.rotation.y = -s * 0.5; g.add(arm);
      const al = Lq * (big ? 0.7 : 0.9);
      box(arm, 9, top + 8, al, STN, 0, -(top + 8) / 2 + 1.0, al / 2);
      if(s > 0){ const lh = new THREE.Group(); lh.position.set(0, 1, al - 3); arm.add(lh); lighthouse(lh, big ? 14 : 9); }
    }
    // working cranes along the quay
    const nCr = t.cls === 3 ? 3 : t.cls === 2 ? 2 : 0;
    for(let k = 0; k < nCr; k++){
      const cr = S.portalCrane({color: [0x2f6a9a, 0xd8a020, 0x9a3a2a][k % 3], counter: 0x8a8d91, legH: 7, span: 6, jib: 18, jibUp: 0.7, animate: true});
      cr.position.set(-Lq / 2 + (k + 1) * Lq / (nCr + 1), 0, 2); g.add(cr); window.SODOR_CRANES.push(cr);
    }
    if(!big){ const jc = new THREE.Group(); jc.position.set(Lq * 0.25, 0, 3); g.add(jc); cylY(jc, 0.3, 0.4, 5, mat(0x2a5a7a, 0.6), 0, 2.5, 0, 10); const jb = box(jc, 0.3, 0.3, 6, mat(0x2a5a7a, 0.6), 0, 5, 2.5); jb.rotation.x = -0.4; }
    // boats along the quay, a ship alongside in the bigger ports
    const r = rng(t.seed + 31), boats = [];
    const nb = t.cls === 3 ? 6 : t.cls === 2 ? 4 : 3;
    // fishing boats moored bow-in; a ship lying alongside in the bigger ports (models point their bows along +x)
    for(let k = 0; k < nb; k++){ const bg = new THREE.Group(); bg.position.set(-Lq / 2 + 6 + k * (Lq - 12) / Math.max(1, nb - 1), -top, 12 + r() * 4); bg.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.3; g.add(bg); boat(bg, 9 + r() * 7, [0x2a4a7a, 0xc8262b, 0x2f6a4a, 0xe8d8a8, 0x1a1a1a][k % 5]); boats.push(bg); }
    if(big){ const sg = new THREE.Group(); sg.position.set(0, -top, 26); g.add(sg); ship(sg, t.cls === 3 ? 80 : 55, 0x2a3a5a, 0x8a2a1e); }
    // warehouses behind the quay
    const r2 = rng(t.seed + 37);
    for(let k = 0; k < (big ? 3 : 1); k++){
      const lx = -Lq / 2 + (k + 0.5) * Lq / (big ? 3 : 1), wp = new V3(lx, 0, -26).applyAxisAngle(new V3(0, 1, 0), g.rotation.y).multiplyScalar(M).add(q);
      tryPlace(t, 'warehouse', wp.x, wp.z, g.rotation.y, 0.9, r2);
    }
    clearAreaW(q.x, q.z, Lq * 0.6 * M);
    // bake the quay and sheds, but keep each moored boat as its own small baked group so it can rock at anchor
    boats.forEach(bg => g.remove(bg));
    S.bakeVC(g);
    boats.forEach(bg => { S.bakeVC(bg); g.add(bg); });
    harbours.push({t, g, x: q.x, z: q.z, y: gy, dir, mouth: q.clone().addScaledVector(dir, 140 * M), boats});
  });
})();
// Lighthouses on the island's outermost headlands, looking out to sea.
const headlands = [];
(function(){
  let cx = 0, cz = 0, n = 0;
  for(let r = 0; r < T.rows; r += 2) for(let c = 0; c < T.cols; c += 2){ const i = r * T.cols + c; if(REGION[i] === 1 && HEIGHTS[i] > 0){ const w = mapToWorld(c * T.step, r * T.step); cx += w.x; cz += w.z; n++; } }
  cx /= n; cz /= n;
  for(let k = 0; k < 9; k++){
    const a = k / 9 * TAU + 0.2, dx = Math.cos(a), dz = Math.sin(a);
    let last = null;
    for(let d = 2; d < 150; d += 0.25){ const x = cx + dx * d, z = cz + dz * d; if(regionAt(x, z) === 1 && H(x, z) > 4 * M) last = {x, z}; }
    if(!last || harbours.some(h => Math.hypot(h.x - last.x, h.z - last.z) < 3) || K.nearTrack(last.x, last.z, 60 * M)) continue;
    const x = last.x - dx * 25 * M, z = last.z - dz * 25 * M;
    const g = new THREE.Group(); g.position.set(x, H(x, z) - 0.3 * M, z); g.scale.setScalar(M);
    lighthouse(g, 24);
    box(g, 9, 4, 6, mat(0xf2f0ea, 0.7), -8, 2, 0); K.roof(g, 9.5, 6.4, 5.2, mat(0x4a4f58, 0.75), 0).position.x = -8;
    S.bakeVC(g); headlands.push({g, x, z});
    clearAreaW(x, z, 30 * M);
  }
})();
// Ships under way between the harbours, where the straight course is open water.
const sailing = [];
(function(){
  for(let a = 0; a < harbours.length; a++) for(let b = a + 1; b < harbours.length; b++){
    if(sailing.length >= 5) break;
    const A = harbours[a].mouth, B = harbours[b].mouth, L = A.distanceTo(B);
    if(L < 6 || L > 70) continue;
    let ok = true;
    for(let f = 0.04; f <= 0.96 && ok; f += 0.02){ const x = A.x + (B.x - A.x) * f, z = A.z + (B.z - A.z) * f; if(H(x, z) > -3 * M) ok = false; }
    if(!ok) continue;
    const g = new THREE.Group(); g.scale.setScalar(M); boatGroup.add(g);
    if(sailing.length % 2) ship(g, 60, 0x1f2f4a, 0xb0302a); else ship(g, 45, 0xf2f0ea, 0x2a6a9a);
    sailing.push({g, A, B, L, f: Math.random(), dir: 1, wait: 0});
  }
})();

lap('harbours');
// ------------------------------------------------------------------ signals, telegraph poles, lamps
const propChunks = [];
function instanced(geo, material, list, castShadow = true){
  const m = new THREE.InstancedMesh(geo, material, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new V3(M, M, M);
  list.forEach((p, i) => { q.setFromEuler(e.set(0, p.yaw, 0)); m4.compose(new V3(p.x, p.y, p.z), q, s); m.setMatrixAt(i, m4); });
  m.castShadow = castShadow; m.frustumCulled = false;                 // instances spread far beyond the geometry's own bounds
  return m;
}
function mergeGeos(parts){
  const geos = parts.map(([g, x, y, z, rx = 0, ry = 0, rz = 0]) => { const c = (g.index ? g.toNonIndexed() : g.clone()); c.applyMatrix4(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(1, 1, 1))); return c; });
  let n = 0; geos.forEach(g => n += g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  geos.forEach(g => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out;
}
const poleGeo = mergeGeos([[new THREE.CylinderGeometry(0.12, 0.16, 8, 6), 0, 4, 0], [new THREE.BoxGeometry(2.2, 0.12, 0.12), 0, 7.5, 0], [new THREE.BoxGeometry(1.6, 0.12, 0.12), 0, 6.9, 0]]);
const sigPostGeo = mergeGeos([[new THREE.BoxGeometry(0.25, 7, 0.25), 0, 3.5, 0], [new THREE.ConeGeometry(0.2, 0.5, 6), 0, 7.25, 0], [new THREE.BoxGeometry(0.6, 0.1, 0.6), 0, 0.05, 0], [new THREE.BoxGeometry(0.1, 5, 0.1), 0.35, 2.5, 0]]);
const sigArmGeo = mergeGeos([[new THREE.BoxGeometry(0.06, 0.28, 1.4), 0.17, 6.2, 0.75], [new THREE.BoxGeometry(0.07, 0.28, 0.12), 0.17, 6.2, 1.2]]);
// a Victorian street lamp: a moulded base, a fluted column, a scroll bracket and a lantern with a cap
const lampGeo = mergeGeos([[new THREE.CylinderGeometry(0.2, 0.26, 0.7, 8), 0, 0.35, 0], [new THREE.CylinderGeometry(0.15, 0.2, 0.25, 8), 0, 0.82, 0],
  [new THREE.CylinderGeometry(0.07, 0.11, 4.2, 8), 0, 3.0, 0], [new THREE.TorusGeometry(0.22, 0.025, 4, 10, Math.PI), 0, 4.75, 0.22, 0, Math.PI / 2, 0],
  [new THREE.BoxGeometry(0.05, 0.05, 0.95), 0, 5.0, 0.45], [new THREE.CylinderGeometry(0.2, 0.13, 0.5, 6), 0, 4.82, 0.92], [new THREE.ConeGeometry(0.27, 0.25, 6), 0, 5.2, 0.92], [new THREE.SphereGeometry(0.06, 6, 4), 0, 5.36, 0.92]]);
// coloured props: each part carries its own colour in the vertex colours, so one draw does them all
function mergeColored(parts){
  const geos = parts.map(([g, col, x, y, z, rx = 0, ry = 0, rz = 0]) => { const c = (g.index ? g.toNonIndexed() : g.clone()); c.applyMatrix4(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(1, 1, 1))); c.userData.col = new THREE.Color(col); return c; });
  let n = 0; geos.forEach(g => n += g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), colr = new Float32Array(n * 3); let o = 0;
  geos.forEach(g => { const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); for(let i = 0; i < k; i++) colr.set([g.userData.col.r, g.userData.col.g, g.userData.col.b], (o + i) * 3); o += k; });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(colr, 3)); return out;
}
const B_ = (w, h, d) => new THREE.BoxGeometry(w, h, d), C_ = (r0, r1, h, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n);
const PROP_GEO = {
  // a bus shelter: green steel frame, glass back and sides, a roof, a bench inside, a timetable panel; the stop flag beside it
  shelter: mergeColored([[B_(3.2, 0.12, 1.5), 0x2e4a3a, 0, 2.45, 0], [B_(3.3, 0.06, 1.6), 0xd8d8d0, 0, 2.53, 0],
    ...[-1.55, 1.55].flatMap(x => [[B_(0.08, 2.45, 0.08), 0x2e4a3a, x, 1.22, -0.65], [B_(0.08, 2.45, 0.08), 0x2e4a3a, x, 1.22, 0.65]]),
    [B_(3.1, 2.0, 0.04), 0x9ab8c4, 0, 1.25, -0.68], [B_(0.04, 2.0, 1.2), 0x9ab8c4, -1.55, 1.25, -0.05], [B_(0.04, 2.0, 1.2), 0x9ab8c4, 1.55, 1.25, -0.05],
    [B_(2.4, 0.08, 0.38), 0x6a4a2a, 0, 0.48, -0.42], [B_(0.06, 0.45, 0.3), 0x2e4a3a, -1.0, 0.24, -0.42], [B_(0.06, 0.45, 0.3), 0x2e4a3a, 1.0, 0.24, -0.42],
    [B_(0.9, 1.2, 0.06), 0xf2f2ee, 1.0, 1.4, -0.64], [B_(3.2, 0.25, 0.08), 0xb3201c, 0, 2.3, 0.72],
    [C_(0.05, 0.05, 2.8), 0x3a3a3a, 2.2, 1.4, 0.7], [C_(0.32, 0.32, 0.06, 16), 0xb3201c, 2.2, 2.75, 0.7, Math.PI / 2, 0, 0], [C_(0.25, 0.25, 0.07, 16), 0xf2f2ee, 2.2, 2.75, 0.7, Math.PI / 2, 0, 0],
    [B_(0.5, 0.35, 0.05), 0xe8c030, 2.2, 2.25, 0.7]]),
  bench: mergeColored([[B_(1.8, 0.06, 0.45), 0x7a5230, 0, 0.45, 0], [B_(1.8, 0.4, 0.05), 0x7a5230, 0, 0.72, -0.22], ...[-0.8, 0.8].flatMap(x => [[B_(0.06, 0.45, 0.45), 0x2a2a2a, x, 0.22, 0], [B_(0.06, 0.5, 0.06), 0x2a2a2a, x, 0.7, -0.22]])]),
  bin: mergeColored([[C_(0.24, 0.2, 0.85, 10), 0x2e3a32, 0, 0.42, 0], [C_(0.27, 0.27, 0.08, 10), 0xc8a040, 0, 0.88, 0], [C_(0.06, 0.06, 0.05), 0x2e3a32, 0, 0.95, 0]]),
  pillar: mergeColored([[C_(0.27, 0.29, 1.3, 12), 0xc4161c, 0, 0.65, 0], [new THREE.SphereGeometry(0.29, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xc4161c, 0, 1.3, 0], [B_(0.32, 0.05, 0.06), 0x1a1a1a, 0, 1.05, 0.27], [C_(0.31, 0.31, 0.06, 12), 0x1a1a1a, 0, 0.03, 0], [B_(0.2, 0.14, 0.04), 0xf2f2ee, 0, 0.8, 0.27]]),
  phone: mergeColored([[B_(1.0, 2.4, 1.0), 0xc4161c, 0, 1.2, 0], [B_(1.08, 0.12, 1.08), 0xc4161c, 0, 2.46, 0], [new THREE.SphereGeometry(0.62, 8, 4, 0, Math.PI * 2, 0, 0.6), 0xc4161c, 0, 2.18, 0],
    [B_(0.8, 1.5, 0.02), 0x2a3a40, 0, 1.25, 0.51], [B_(0.8, 1.5, 0.02), 0x2a3a40, 0, 1.25, -0.51], [B_(0.02, 1.5, 0.8), 0x2a3a40, 0.51, 1.25, 0], [B_(0.7, 0.14, 0.02), 0xf2f2ee, 0, 2.27, 0.53]]),
  bollard: mergeColored([[C_(0.09, 0.11, 0.9, 8), 0x1a1a1a, 0, 0.45, 0], [C_(0.1, 0.1, 0.06, 8), 0xd8b440, 0, 0.8, 0]]),
  planter: mergeColored([[B_(1.2, 0.5, 0.6), 0x8a7a6a, 0, 0.25, 0], [new THREE.SphereGeometry(0.45, 8, 6), 0x3a6a2a, -0.25, 0.62, 0], [new THREE.SphereGeometry(0.35, 8, 6), 0xd84a6a, 0.3, 0.6, 0.05]]),
  tree: mergeColored([[C_(0.12, 0.16, 2.6, 6), 0x5a4030, 0, 1.3, 0], [new THREE.IcosahedronGeometry(1.5, 1), 0x3e6e2e, 0, 3.4, 0], [new THREE.IcosahedronGeometry(1.0, 1), 0x4a7a36, 0.6, 4.2, 0.2], [C_(0.6, 0.6, 0.05, 10), 0x2a2a2a, 0, 0.02, 0]]),
  sign: mergeColored([[C_(0.04, 0.04, 2.4), 0x8a8d91, 0, 1.2, 0], [B_(0.9, 0.6, 0.04), 0x1f4fa8, 0, 2.2, 0], [B_(0.8, 0.5, 0.045), 0xf2f2ee, 0, 2.2, 0.002], [B_(0.7, 0.36, 0.05), 0x1f4fa8, 0, 2.2, 0.004]]),
};
const PROP_MAT = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.75, metalness: 0.1});
(function(){
  const poles = [], posts = [], arms = [];
  RAIL.lines.forEach(line => {
    if(line.kind === 'closed' || line.kind === 'miniature') return;
    const R = line.real, every = Math.max(1, Math.round(55 / 6)), half = ((BED_M[line.kind] || 3.6) / 2 + (line.id === 'main' ? MAIN_LANE : 0)) * M;
    for(let j = 2; j < R.n - 2; j += every){
      const u = j / (R.n - 1); if(inTunnel(line, u)) continue;
      const tx = R.x[j + 1] - R.x[j - 1], tz = R.z[j + 1] - R.z[j - 1], tl = Math.hypot(tx, tz) || 1, nx = tz / tl, nz = -tx / tl;
      const x = R.x[j] - nx * (half + 4 * M), z = R.z[j] - nz * (half + 4 * M);
      if(wet(x, z) || roadClear(x, z) < 1 * M || (KNAP.inside && KNAP.inside(x, z))) continue;
      poles.push({x, y: H(x, z) - 0.2 * M, z, yaw: Math.atan2(tx, tz)});
    }
    // semaphore signals guarding each station, one each way
    line.stops.forEach(k => {
      const st = STATIONS[k]; if(st.kind === 'closed' || BESPOKE.has(st.name)) return;      // these have their own signals
      const u0 = realU(line, st);
      for(const e of [-1, 1]){
        const u = u0 + e * 110 * M / R.len; if(u <= 0.002 || u >= 0.998 || inTunnel(line, u)) continue;
        const p = realAt(line, u, new V3()), d = realDir(line, u, new V3()); d.y = 0; d.normalize();
        const nx = d.z, nz = -d.x, side = -e, x = p.x + nx * side * (half + 1.6 * M), z = p.z + nz * side * (half + 1.6 * M);
        const yaw = Math.atan2(d.x * -e, d.z * -e);                          // facing the trains coming in
        posts.push({x, y: p.y - 0.55 * M, z, yaw}); arms.push({x, y: p.y - 0.55 * M, z, yaw});
      }
    });
  });
  // chunk the poles so only those near the camera draw
  const byChunk = new Map();
  poles.forEach(p => { const k = Math.floor(p.x / 3) + ',' + Math.floor(p.z / 3); if(!byChunk.has(k)) byChunk.set(k, []); byChunk.get(k).push(p); });
  const PM = mat(0x5a4632, 0.85);
  byChunk.forEach(list => { const m = instanced(poleGeo, PM, list); const c = list[Math.floor(list.length / 2)]; propChunks.push({m, x: c.x, z: c.z, r: 2.6}); scene.add(m); });
  const sp = instanced(sigPostGeo, mat(0xe8e8e2, 0.6), posts), sa = instanced(sigArmGeo, mat(RED, 0.5), arms);
  scene.add(sp, sa); propChunks.push({m: sp, all: true}, {m: sa, all: true});
})();
// lamps along the busier streets of each town
towns.forEach(t => {
  if(t.cls < 2) return;
  const list = [];
  t.roads.forEach(rd => {
    if(rd.cls === 'lane') return;
    for(let i = 2; i < rd.pts.length - 2; i += 4){
      const p = rd.pts[i], q = rd.pts[i + 1], tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1, side = i % 8 < 4 ? 1 : -1, nx = tz / tl * side, nz = -tx / tl * side;
      if(Math.hypot(p.x - t.x, p.z - t.z) > t.R * 0.8 || rd.mods.length && rd.mods.some(c => Math.abs(rd.s[i] - c.s) < 30 * M)) continue;
      const x = p.x + nx * (rd.hw + 0.6 * M), z = p.z + nz * (rd.hw + 0.6 * M);
      if(K.nearTrack(x, z, 6 * M)) continue;
      list.push({x, y: Math.max(rd.ys ? rd.ys[i] : 0, H(x, z)) - 0.1 * M, z, yaw: Math.atan2(-nx, -nz)});
    }
  });
  if(list.length){ t.lamps = instanced(lampGeo, mat(0x1f2a24, 0.45, 0.5), list, false); t.lampList = list; }
  // the furniture of the pavements: bus shelters on the through roads, benches, bins, pillar boxes and phone
  // boxes along the shopping streets, bollards and planters and young trees in the middle of town
  const r = rng(t.seed + 91), props = {}, stops = [];
  const put = (k, x, z, yaw, y) => (props[k] || (props[k] = [])).push({x, y: y === undefined ? H(x, z) : y, z, yaw});
  t.roads.forEach(rd => {
    if(rd.cls === 'lane' || rd.cls === 'M') return;
    const n = rd.pts.length, busRoad = rd.cls === 'A' || rd.cls === 'B' || (rd.cls === 'street' && !rd.grid);
    let nextStop = 60 * M + r() * 120 * M;
    for(let i = 1; i < n - 1; i++){
      const p = rd.pts[i], q = rd.pts[i + 1] || p, tx = q.x - rd.pts[i - 1].x, tz = q.z - rd.pts[i - 1].z, tl = Math.hypot(tx, tz) || 1;
      const qd = Math.hypot(p.x - t.x, p.z - t.z) / t.R; if(qd > 0.85) continue;
      if(rd.mods.some(c => Math.abs(rd.s[i] - c.s) < 35 * M)) continue;
      const side = r() < 0.5 ? 1 : -1, nx = tz / tl * side, nz = -tx / tl * side, yaw = Math.atan2(-nx, -nz);
      const at = off => { const x = p.x + nx * (rd.hw + off), z = p.z + nz * (rd.hw + off); return roadClear(x, z, 12 * M) > off - 0.4 * M - 0.01 && !K.nearTrack(x, z, 5 * M) && !inZone(x, z) && H(x, z) > 0.5 * M ? [x, z] : null; };
      const y = Math.max(rd.ys ? rd.ys[i] : 0, 0) + 0.3 * M;
      if(busRoad && rd.s[i] > nextStop && t.cls >= 2){
        const c = at(1.0 * M); if(c){ put('shelter', c[0], c[1], yaw, y); stops.push({rd, s: rd.s[i], side, x: c[0], z: c[1]}); nextStop = rd.s[i] + 230 * M + r() * 150 * M; continue; }
      }
      const roll = r(), c = at(1.1 * M); if(!c) continue;
      if(qd < 0.3 && t.cls >= 2){
        if(roll < 0.08) put('bench', c[0], c[1], yaw, y); else if(roll < 0.16) put('bin', c[0], c[1], yaw, y); else if(roll < 0.19) put('pillar', c[0], c[1], yaw, y);
        else if(roll < 0.21) put('phone', c[0], c[1], yaw, y); else if(roll < 0.28 && t.cls === 3) put('bollard', c[0], c[1], yaw, y); else if(roll < 0.36 && t.cls === 3) put('tree', c[0], c[1], yaw, y);
        else if(roll < 0.4) put('planter', c[0], c[1], yaw, y);
      } else if(qd < 0.6){ if(roll < 0.05) put('bin', c[0], c[1], yaw, y); else if(roll < 0.07) put('pillar', c[0], c[1], yaw, y); else if(roll < 0.1 && t.cls >= 2) put('tree', c[0], c[1], yaw, y); else if(roll < 0.11) put('sign', c[0], c[1], yaw, y); }
      else if(roll < 0.02) put('pillar', c[0], c[1], yaw, y);
    }
  });
  t.props = Object.keys(props).map(k => instanced(PROP_GEO[k], PROP_MAT, props[k], k === 'shelter' || k === 'tree'));
  t.busStops = stops;
});

lap('props');
// ------------------------------------------------------------------ towns and countryside into instanced meshes
function buildOwner(owner){
  const g = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), v = new V3(), s = new V3();
  Object.keys(owner.inst).forEach(type => {
    const list = owner.inst[type], A = ARCH[type]; if(!list.length) return;
    const body = new THREE.InstancedMesh(A.body, A.mat || atlasMat, list.length), rf = new THREE.InstancedMesh(A.roof, A.roofMat || atlasMat, list.length);
    list.forEach((b, i) => {
      q.setFromEuler(e.set(0, b.yaw, 0)); m4.compose(v.set(b.x, b.y, b.z), q, s.setScalar(b.s * M));
      body.setMatrixAt(i, m4); rf.setMatrixAt(i, m4);
      body.setColorAt(i, col.setHex(b.wall)); rf.setColorAt(i, col.setHex(b.roof));
    });
    [body, rf].forEach(m => { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; g.add(m); });
  });
  if(owner.lm){ owner.lm.forEach(l => g.add(l)); }
  if(owner.lamps) g.add(owner.lamps);
  (owner.props || []).forEach(m => g.add(m));
  scene.add(g); g.visible = false;
  owner.group = g;
  return g;
}
landmarkFns.forEach(f => { const g = landmarkGroup(f.owner, f.x, f.y, f.z, 0); f.fn(g); });
[...towns, ...countryside.values(), ...extraSites.map(s => s.owner)].forEach(o => { if(o.lm) o.lm.forEach(g => S.bakeVC(g)); });
countryside.forEach(buildOwner);
extraSites.forEach(s => buildOwner(s.owner));
function ensureTown(t){
  if(t.built) return;
  t.built = true;
  const r = rng(t.seed + 7);
  t.roads.forEach(rd => lineStreet(t, rd, r));
  buildOwner(t);
  if(K.trees && K.trees.invalidate) K.trees.invalidate();          // replant round the new houses
}

lap('instancing');
// ------------------------------------------------------------------ the land itself: fields, hedgerows, woods, towns, beaches
// A low-resolution land-use map (fields / woods / built-up / sand) drives a terrain shader that draws a
// patchwork of fields with hedgerows at any zoom; trees are planted from the same map.
const LW = 768, LH = Math.round(LW * MAP_D / MAP_W);
const land = new Uint8ClampedArray(LW * LH * 4), seaD = new Uint8Array(LW * LH * 4);      // seaD: water depth, for the surf
(function(){
  // built-up ground: each town paints its own patch first
  const urban = new Float32Array(LW * LH), pxOf = x => (x + MAP_W / 2) / MAP_W * LW, pyOf = z => (z + MAP_D / 2) / MAP_D * LH;
  towns.forEach(t => {
    const rx = t.R * 1.2 / MAP_W * LW, ry = t.R * 1.2 / MAP_D * LH, cx = pxOf(t.x), cy = pyOf(t.z);
    for(let py = Math.max(0, Math.floor(cy - ry)); py <= Math.min(LH - 1, Math.ceil(cy + ry)); py++) for(let px = Math.max(0, Math.floor(cx - rx)); px <= Math.min(LW - 1, Math.ceil(cx + rx)); px++){
      const x = (px + 0.5) / LW * MAP_W - MAP_W / 2, z = (py + 0.5) / LH * MAP_D - MAP_D / 2, d = Math.hypot(t.x - x, t.z - z) / t.R;
      const u = 1 - smooth(0.6, 1.05, d + (fbm(x * 2, z * 2) - 0.5) * 0.3), i = py * LW + px;
      if(u > urban[i]) urban[i] = u * (t.cls === 1 ? 0.6 : 1);
    }
  });
  // heights once per pixel; slopes and the shoreline come from neighbouring pixels
  const hp = new Float32Array(LW * LH), sx = MAP_W / LW, sz = MAP_D / LH;
  for(let py = 0; py < LH; py++) for(let px = 0; px < LW; px++) hp[py * LW + px] = H((px + 0.5) * sx - MAP_W / 2, (py + 0.5) * sz - MAP_D / 2);
  const hAt = (px, py) => hp[Math.max(0, Math.min(LH - 1, py)) * LW + Math.max(0, Math.min(LW - 1, px))];
  for(let py = 0; py < LH; py++) for(let px = 0; px < LW; px++){
    const x = (px + 0.5) * sx - MAP_W / 2, z = (py + 0.5) * sz - MAP_D / 2, h = hp[py * LW + px] / M, i = (py * LW + px) * 4;
    if(h < 0.3){ land[i] = land[i + 1] = land[i + 2] = land[i + 3] = 0; seaD[i] = Math.min(255, Math.max(0, (0.3 - h) / 30 * 255)); seaD[i + 3] = 255; continue; }
    const reg = regionAt(x, z), dx = (hAt(px + 1, py) - hAt(px - 1, py)) / (2 * sx), dz = (hAt(px, py + 1) - hAt(px, py - 1)) / (2 * sz), slope = Math.hypot(dx, dz);
    const sea = hAt(px + 1, py) < 0 || hAt(px - 1, py) < 0 || hAt(px, py + 1) < 0 || hAt(px, py - 1) < 0;
    const beach = sea && h < 5 ? 1 : 0;
    const urb = reg === 1 ? urban[py * LW + px] : 0;
    const wn = fbm(x * 0.9 + 3.1, z * 0.9 - 7.3), woodBase = smooth(0.58, 0.66, wn + (slope > 0.12 ? 0.08 : 0) - (h > 420 ? 0.2 : 0));
    const wood = woodBase * (1 - urb) * (1 - beach);
    const fieldOk = (1 - smooth(230, 330, h + (vnoise(x * 1.7, z * 1.7) - 0.5) * 120)) * (1 - smooth(0.16, 0.26, slope));
    const field = fieldOk * (1 - wood) * (1 - urb) * (1 - beach) * (reg === 1 ? 1 : 0.55);
    land[i] = field * 255; land[i + 1] = wood * 255; land[i + 2] = urb * 255; land[i + 3] = beach * 255;
  }
})();
// a data texture, not a canvas: a canvas would premultiply and lose the channels where the sand mask is zero
const landTex = new THREE.DataTexture(land, LW, LH, THREE.RGBAFormat);
landTex.magFilter = landTex.minFilter = THREE.LinearFilter; landTex.generateMipmaps = false; landTex.needsUpdate = true;
const landAt = (x, z, ch) => { const px = Math.floor((x + MAP_W / 2) / MAP_W * LW), py = Math.floor((z + MAP_D / 2) / MAP_D * LH); if(px < 0 || py < 0 || px >= LW || py >= LH) return 0; return land[(py * LW + px) * 4 + ch] / 255; };
if(terrainMesh){
  const tm = terrainMesh.material;
  tm.onBeforeCompile = (sh) => {
    sh.uniforms.uLand = {value: landTex};
    sh.uniforms.uLandRect = {value: new THREE.Vector4(-MAP_W / 2, -MAP_D / 2, MAP_W, MAP_D)};
    sh.uniforms.uMetre = {value: M};
    sh.vertexShader = 'varying vec2 vLandXZ; varying float vLandY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vec4 lw = modelMatrix * vec4(transformed, 1.0); vLandXZ = lw.xz; vLandY = lw.y;');
    sh.fragmentShader = `uniform sampler2D uLand; uniform vec4 uLandRect; uniform float uMetre; varying vec2 vLandXZ; varying float vLandY;
      vec2 lhash(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      float lh1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float lnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(lh1(i), lh1(i + vec2(1.0, 0.0)), f.x), mix(lh1(i + vec2(0.0, 1.0)), lh1(i + vec2(1.0, 1.0)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec4 land = texture2D(uLand, (vLandXZ - uLandRect.xy) / uLandRect.zw);
    #ifdef USE_MAP
      vec3 detail = texelColor.rgb;
    #else
      vec3 detail = vec3(1.0);
    #endif
    float distM = length(vViewPosition) / uMetre;
    vec2 pm = vLandXZ / uMetre;
    float nearF = clamp(1.0 - distM / 1800.0, 0.0, 1.0);
    // meadow grass: never one flat green, but drifts of lighter and darker turf, and buttercups up close
    {
      float g1 = lnoise(pm / 23.0), g2 = lnoise(pm / 5.0 + 9.1), g3 = lnoise(pm / 140.0 - 4.0);
      diffuseColor.rgb *= 0.86 + 0.18 * g1 + 0.08 * g2 * nearF + 0.1 * (g3 - 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.04, 0.82), smoothstep(0.62, 0.9, g3) * 0.5);
      float fl = step(0.97, lh1(floor(pm * 3.0))) * (1.0 - step(0.18, length(fract(pm * 3.0) - 0.5))) * clamp(1.0 - distM / 45.0, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.85, 0.25), fl * 0.6);
    }
    // fields: an irregular patchwork, longer than wide, gently bent so no two districts line up
    vec2 pw = pm + 160.0 * vec2(lnoise(pm / 900.0), lnoise(pm / 900.0 + 17.3)) + 60.0 * vec2(lnoise(pm / 260.0 + 5.1), lnoise(pm / 260.0 - 3.7));
    pw = vec2(0.8776 * pw.x - 0.4794 * pw.y, 0.4794 * pw.x + 0.8776 * pw.y); pw.x *= 0.62;
    vec2 gp = pw / 190.0; vec2 ip = floor(gp); vec2 fp = fract(gp);
    float d1 = 8.0; float d2 = 8.0; vec2 id = vec2(0.0);
    for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
      vec2 b = vec2(float(i), float(j)); vec2 o = lhash(ip + b);
      vec2 r = b + 0.15 + o * 0.7 - fp; float d = dot(r, r);
      if(d < d1){ d2 = d1; d1 = d; id = ip + b; } else if(d < d2){ d2 = d; }
    }
    float edgeM = (sqrt(d2) - sqrt(d1)) * 190.0 * 0.5;
    float hv = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 fc = hv < 0.30 ? vec3(0.40, 0.55, 0.28) : hv < 0.50 ? vec3(0.47, 0.60, 0.32) : hv < 0.62 ? vec3(0.34, 0.48, 0.24) : hv < 0.76 ? vec3(0.66, 0.62, 0.38) : hv < 0.88 ? vec3(0.52, 0.60, 0.33) : vec3(0.47, 0.39, 0.29);
    fc = mix(fc, diffuseColor.rgb, 0.2);
    float ang = hv * 6.2831; vec2 rd = vec2(cos(ang), sin(ang));
    float arable = (hv > 0.62 && hv < 0.76) || hv >= 0.88 ? 1.0 : 0.0;
    fc *= 1.0 + arable * 0.07 * sin(dot(pm, rd) * 1.6) * clamp(1.0 - distM / 900.0, 0.0, 1.0);
    float hw = 2.2 + distM * 0.0016;
    float hedge = (1.0 - smoothstep(hw * 0.55, hw, edgeM)) * clamp(1.2 - distM / 3500.0, 0.15, 1.0);
    vec3 fieldCol = mix(fc * detail, vec3(0.17, 0.29, 0.13) * detail, hedge);
    diffuseColor.rgb = mix(diffuseColor.rgb, fieldCol, land.r);
    // woodland: a dappled canopy of crowns rather than a flat dark patch
    float crowns = 0.78 + 0.22 * lnoise(pm / 9.0) + 0.14 * lnoise(pm / 41.0 + 3.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.36, 0.17) * crowns * detail, land.g * 0.9);
    // built-up ground: back gardens and allotments, yards and paved squares in plots behind the houses,
    // more of it paved towards the middle of town; blended to a plain tone at a distance
    {
      vec2 gq = pm / vec2(11.0, 15.0) + 0.37 * vec2(lnoise(pm / 70.0), lnoise(pm / 70.0 + 5.0));
      vec2 iq = floor(gq); vec2 fq = fract(gq);
      float h1 = lh1(iq), h2 = lh1(iq + 7.3), centre = smoothstep(0.55, 0.97, land.b);
      vec3 lawn = vec3(0.36, 0.53, 0.26) * (0.86 + 0.22 * lnoise(pm / 2.5) + 0.1 * h2);
      vec3 beds = mix(vec3(0.33, 0.27, 0.19), vec3(0.30, 0.42, 0.20), step(0.5, fract(pm.x / 0.9 + h2 * 3.0)));
      vec3 paved = vec3(0.62, 0.60, 0.56) * (0.92 + 0.08 * h2) * (1.0 - 0.12 * (step(fract(pm.x / 0.6), 0.05) + step(fract(pm.y / 0.6), 0.05)));
      vec3 gravel = vec3(0.58, 0.53, 0.45) * (0.88 + 0.2 * lh1(floor(pm * 7.0)));
      vec3 plot = h1 < 0.55 - 0.4 * centre ? lawn : h1 < 0.66 - 0.3 * centre ? beds : h1 < 0.88 ? paved : gravel;
      float edge = min(min(fq.x, 1.0 - fq.x), min(fq.y, 1.0 - fq.y));
      plot = mix(plot, vec3(0.20, 0.27, 0.14), (1.0 - smoothstep(0.0, 0.05, edge)) * 0.7);          // hedges and fences between plots
      float shrub = step(0.86, lh1(floor(pm / 2.3) + iq)) * (1.0 - smoothstep(0.25, 0.45, length(fract(pm / 2.3) - 0.5)));
      plot = mix(plot, vec3(0.18, 0.30, 0.14), shrub * 0.8 * (1.0 - centre));
      plot = mix(plot, vec3(0.47, 0.51, 0.40), clamp(distM / 2200.0, 0.0, 1.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, plot * detail, land.b * 0.9);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.80, 0.60) * detail, land.a * 0.5);
    // the true shoreline from the height itself: dry sand with wind ripples, wet darker sand at the water's edge, and
    // marram dunes behind; on steep ground grass gives way to grey rock and scree
    float hM = vLandY / uMetre;
    vec3 wp = vec3(vLandXZ.x, vLandY, vLandXZ.y);
    vec3 fn = normalize(cross(dFdx(wp), dFdy(wp)));
    float slope = 1.0 - abs(fn.y);
    float coast = max(land.a, smoothstep(0.0, 1.0, land.a * 3.0));
    float sandH = 2.4 + 1.6 * lnoise(pm / 60.0);
    float sand = (1.0 - smoothstep(sandH - 0.8, sandH, hM)) * step(-2.0, hM) * (1.0 - land.b * 0.8) * (1.0 - smoothstep(0.25, 0.45, slope));
    float ripple = 0.94 + 0.06 * sin(dot(pm, vec2(0.83, 0.55)) * 3.1 + lnoise(pm / 3.0) * 4.0) * clamp(1.0 - distM / 300.0, 0.0, 1.0);
    vec3 sandCol = vec3(0.88, 0.81, 0.62) * ripple * (0.93 + 0.1 * lnoise(pm / 11.0));
    sandCol = mix(sandCol, vec3(0.62, 0.56, 0.42), 1.0 - smoothstep(0.15, 0.75, hM));             // wet sand
    float dune = smoothstep(sandH - 0.4, sandH + 1.5, hM) * (1.0 - smoothstep(sandH + 1.5, sandH + 4.0, hM)) * coast;
    diffuseColor.rgb = mix(diffuseColor.rgb, sandCol, sand);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.70, 0.68, 0.45), vec3(0.52, 0.60, 0.34), lnoise(pm / 4.0)), dune * 0.55);
    float rock = smoothstep(0.32, 0.5, slope + 0.08 * (lnoise(pm / 17.0) - 0.5)) * (1.0 - sand);
    vec3 rockCol = vec3(0.50, 0.49, 0.46) * (0.75 + 0.35 * lnoise(pm / 6.0) + 0.15 * lnoise(pm / 1.7) * nearF);
    diffuseColor.rgb = mix(diffuseColor.rgb, rockCol * detail, rock * 0.9);
  }`);
  };
  tm.needsUpdate = true;
}
window.SODOR_LAND = {
  trees: (x, z) => { const w = landAt(x, z, 1), u = landAt(x, z, 2), f = landAt(x, z, 0); return w * 0.95 + u * 0.05 + f * 0.035 + 0.01; },
  blocked: (x, z) => roadClear(x, z, 12 * M) < 2.5 * M || bldGrid.each(x - 0.02, z - 0.02, x + 0.02, z + 0.02, b => inObb(b, x, z)),
  land: landAt,
};

lap('landMap');
// ------------------------------------------------------------------ the sea: rolling swell, breakers cycling in onto the beaches
// The water plane is one quad, so the waves live in its shader: sea normals from a few travelling swells,
// colour from the depth map (turquoise in the shallows, deep blue offshore), and bands of surf that form
// over the shallows and roll in to break in a line of foam at the water's edge, over and over.
// The island's own height grid (16-bit, -60..+20 m), read in the shader with the same triangle interpolation as
// heightAt(), so the line of foam lies exactly where the land meets the sea.
const hgData = new Uint8Array(T.cols * T.rows * 4);
for(let i = 0; i < T.cols * T.rows; i++){ const v = Math.round(Math.max(0, Math.min(1, (HEIGHTS[i] / M + 60) / 80)) * 65535); hgData[i * 4] = v >> 8; hgData[i * 4 + 1] = v & 255; hgData[i * 4 + 3] = 255; }
const hgTex = new THREE.DataTexture(hgData, T.cols, T.rows, THREE.RGBAFormat);
hgTex.magFilter = hgTex.minFilter = THREE.NearestFilter; hgTex.generateMipmaps = false; hgTex.needsUpdate = true;
const seaU = {uTime: {value: 0}, uSea: {value: hgTex}, uGrid: {value: new THREE.Vector4(MAP_SCALE, T.imgW / 2, T.imgH / 2, T.step)}, uGridN: {value: new THREE.Vector2(T.cols, T.rows)}, uMetreW: {value: M}};
if(typeof water !== 'undefined' && water && water.material){
  const wm = water.material;
  wm.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, seaU);
    sh.vertexShader = 'varying vec2 vSeaXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSeaXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = `uniform float uTime; uniform sampler2D uSea; uniform vec4 uGrid; uniform vec2 uGridN; uniform float uMetreW; varying vec2 vSeaXZ;
      float sh1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float snoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(sh1(i), sh1(i + vec2(1, 0)), f.x), mix(sh1(i + vec2(0, 1)), sh1(i + vec2(1, 1)), f.x), f.y); }
      float hgAt(vec2 ij){ vec4 t = texture2D(uSea, (ij + 0.5) / uGridN); return (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0 * 80.0 - 60.0; }
      float seaDepth(){                                   // metres of water here (negative on land), as heightAt() has it
        vec2 cr = clamp(vec2(vSeaXZ.x / uGrid.x + uGrid.y, vSeaXZ.y / uGrid.x + uGrid.z) / uGrid.w, vec2(0.0), uGridN - 1.001);
        vec2 i0 = floor(cr), f = cr - i0;
        float a = hgAt(i0), b = hgAt(i0 + vec2(1, 0)), d = hgAt(i0 + vec2(0, 1)), e = hgAt(i0 + vec2(1, 1));
        float h = f.x + f.y <= 1.0 ? a + (b - a) * f.x + (d - a) * f.y : e + (d - e) * (1.0 - f.x) + (b - e) * (1.0 - f.y);
        return -h;
      }
      // travelling swells: height gradient of a sum of sine waves (metres)
      vec2 swellGrad(vec2 p, float t){
        vec2 g = vec2(0.0);
        vec3 W[5]; W[0] = vec3(0.8, 0.6, 31.0); W[1] = vec3(-0.3, 0.95, 17.0); W[2] = vec3(0.95, -0.2, 9.0); W[3] = vec3(-0.7, -0.7, 5.3); W[4] = vec3(0.2, -0.98, 3.1);
        for(int k = 0; k < 5; k++){ vec2 d = normalize(W[k].xy); float L = W[k].z, kk = 6.2831 / L, c = sqrt(9.8 / kk);
          g += d * kk * cos(dot(d, p) * kk - c * kk * t) * (0.012 * L); }
        return g;
      }
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float seaD = seaDepth();
  vec2 seaP = vSeaXZ / uMetreW;
  float seaDist = length(vViewPosition) / uMetreW;
  // shallows show turquoise over sand, the deep stays dark blue
  vec3 shallow = vec3(0.20, 0.62, 0.66), deep = vec3(0.07, 0.24, 0.42);
  float sd = smoothstep(0.0, 14.0, seaD);
  diffuseColor.rgb *= mix(shallow, deep, sd) / vec3(0.18, 0.52, 0.75);
  // surf: breakers form where it shoals and roll in (crests move to shallower water) to break on the beach
  float wob = snoise(seaP / 40.0) * 0.9 + snoise(seaP / 9.0) * 0.25;
  float phase = seaD / 0.8 + wob + uTime * 0.18;
  float band = pow(0.5 + 0.5 * sin(phase * 6.2831), 5.0) * smoothstep(0.1, 0.6, seaD);
  float surfZone = 1.0 - smoothstep(1.2, 3.5, seaD);
  // the swash: foam rushing up the beach and draining back, in time with the breakers
  float swash = 0.4 + 0.3 * sin(uTime * 0.18 * 6.2831 + wob * 6.2831);
  float edge = 1.0 - smoothstep(swash * 0.6, swash, seaD);
  float lace = smoothstep(0.45, 0.8, snoise(seaP / 2.2 + uTime * 0.3));
  float foam = clamp(band * surfZone * (0.75 + 0.25 * lace) * 1.2 + edge * (0.55 + 0.45 * lace), 0.0, 1.0) * clamp(1.4 - seaDist / 3000.0, 0.25, 1.0);
  // whitecaps offshore, here and there
  foam = max(foam, smoothstep(0.82, 0.95, snoise(seaP / 14.0 + vec2(uTime * 0.08, 0.0))) * smoothstep(8.0, 20.0, seaD) * 0.35 * clamp(1.0 - seaDist / 1500.0, 0.0, 1.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.97), foam);
  diffuseColor.a = mix(diffuseColor.a, 0.5, 1.0 - sd) ;
  diffuseColor.a = max(diffuseColor.a, foam);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float fadeN = clamp(1.0 - seaDist / 2500.0, 0.0, 1.0);
    vec2 gW = swellGrad(seaP, uTime) * fadeN * (0.35 + 0.65 * sd);
    vec3 nW = normalize(vec3(-gW.x, 1.0, -gW.y));
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.9, foam);');
  };
  wm.needsUpdate = true;
  frameHooks.push(() => { seaU.uTime.value = performance.now() * 0.001; });
}
// ------------------------------------------------------------------ lights after dark
// From afar each town is a scatter of lit windows along its streets; closer in, the street lamps and
// station lamps glow, and the lighthouses sweep their beams over the sea.
const NIGHT = typeof NIGHT_U !== 'undefined' ? NIGHT_U : {value: 0};
const glowOK = typeof makeGlow === 'function';
const lights = {};
if(glowOK){
  const WINDOW = new THREE.Color(0xffb35a), SODIUM = new THREE.Color(0xffa24a), LAMP = new THREE.Color(0xffd28a), BEACON = new THREE.Color(0xfff0c0);
  lights.town = makeGlow(12000, {minPx: 1.6, maxPx: 16, floor: 0.45});
  towns.forEach(t => {
    const r = rng(t.seed + 91), share = t.cls === 3 ? 1 : t.cls === 2 ? 0.7 : 0.4;
    t.roads.forEach(rd => {
      for(let i = 1; i < rd.pts.length - 1; i++){
        if(r() > share) continue;
        const p = rd.pts[i], q = rd.pts[i + 1], tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1, side = r() < 0.5 ? 1 : -1;
        const o = rd.hw + (6 + r() * 10) * M, x = p.x + tz / tl * o * side, z = p.z - tx / tl * o * side;
        if(Math.hypot(x - t.x, z - t.z) > t.R * 1.05 || wet(x, z)) continue;
        lights.town.add(x, H(x, z) + 4 * M, z, WINDOW, (14 + r() * 16) * M);
      }
    });
  });
  lights.town.flush();
  lights.lamps = makeGlow(9000, {minPx: 1.2, maxPx: 26});
  towns.forEach(t => (t.lampList || []).forEach(p => lights.lamps.add(p.x + Math.sin(p.yaw) * 0.9 * M, p.y + 4.7 * M, p.z + Math.cos(p.yaw) * 0.9 * M, SODIUM, 9 * M)));
  // platform lamps at every open station
  const _a = new V3(), _d = new V3();
  STATIONS.forEach(st => {
    const line = LINES[st.lines[0]]; if(!line || st.kind === 'closed' || BESPOKE.has(st.name)) return;
    const std = line.kind === 'standard', lenM = std ? (MAJOR.has(st.name) ? 140 : 90) : line.kind === 'miniature' ? 22 : 40;
    const wM = std ? 4 : 2.8, off = ((std ? 3.6 : 2.3) / 2 + 0.6 + wM - 0.4 + (line.id === 'main' ? MAIN_LANE : 0)) * M;
    for(let s = -lenM / 2 + 6; s <= lenM / 2 - 6; s += 18){
      const u = st.trackU + s * M / line.real.len; if(u <= 0 || u >= 1) continue;
      realAt(line, u, _a); realDir(line, u, _d);
      const nl = Math.hypot(_d.x, _d.z) || 1;
      lights.lamps.add(_a.x + _d.z / nl * off, _a.y + 4.2 * M, _a.z - _d.x / nl * off, LAMP, 8 * M);
    }
  });
  // lamps along each quay
  harbours.forEach(h => {
    h.g.updateMatrixWorld(true);
    const Lq = h.t.cls === 3 ? 200 : h.t.cls === 2 ? 130 : 55;
    for(let x = -Lq / 2 + 5; x < Lq / 2; x += 14){ const p = new V3(x, 5, 3.5).applyMatrix4(h.g.matrixWorld); lights.lamps.add(p.x, p.y, p.z, LAMP, 9 * M); }
  });
  lights.lamps.flush();
  // lighthouses: a bright lantern and two beams turning
  lights.beacons = makeGlow(64, {minPx: 2.5, maxPx: 34, floor: 0.8});
  const beamGeo = (() => {
    const L = 1800 * M, r = 70 * M, seg = 12, pos = [0, 0, 0], col = [1, 0.95, 0.8], idx = [];
    for(let k = 0; k <= seg; k++){ const a = k / seg * TAU; pos.push(L, Math.cos(a) * r * 0.45, Math.sin(a) * r); col.push(0, 0, 0); }
    for(let k = 1; k <= seg; k++) idx.push(0, k, k + 1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
  })();
  lights.beamMat = new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false});
  lights.beams = [];
  headlands.forEach((h, k) => {
    const y = h.g.position.y + 26.3 * M;
    lights.beacons.add(h.x, y, h.z, BEACON, 160 * M);
    const rot = new THREE.Group(); rot.position.set(h.x, y, h.z); rot.rotation.y = k * 1.3;
    for(const s of [0, Math.PI]){ const b = new THREE.Mesh(beamGeo, lights.beamMat); b.rotation.y = s; b.renderOrder = 7; rot.add(b); }
    relief.add(rot); lights.beams.push(rot);
  });
  // the harbour light at the end of each breakwater (see the harbour builder: arm turned -0.5, light 3 m from its end)
  harbours.forEach(h => {
    const big = h.t.cls >= 2, Lq = h.t.cls === 3 ? 200 : h.t.cls === 2 ? 130 : 55, al = Lq * (big ? 0.7 : 0.9), d = al - 3;
    const p = new V3(Lq / 2 + d * Math.sin(-0.5), 1 + (big ? 14 : 9) * 1.09, 6 + d * Math.cos(0.5)).applyMatrix4(h.g.matrixWorld);
    lights.beacons.add(p.x, p.y, p.z, new THREE.Color(0xff6a4a), 50 * M);
  });
  lights.beacons.flush();
}

// ------------------------------------------------------------------ level of detail and the moving parts
const owners = [...towns, ...countryside.values(), ...extraSites.map(s => s.owner)];
const harbourGroup = new THREE.Group(); scene.add(harbourGroup);
harbours.forEach(h => harbourGroup.add(h.g));
headlands.forEach(h => harbourGroup.add(h.g));
const _cp = new V3();
frameHooks.push(dt => {
  const cp = camera.position, near = camDist < 6;
  roadGroup.visible = camDist < 12; mwayGroup.visible = camDist < 6; bankGroup.visible = camDist < 12; crossGroup.visible = camDist < 5; stationGroup.visible = camDist < 5;
  railStruct.visible = camDist < 14; harbourGroup.visible = camDist < 9; boatGroup.visible = camDist < 12;
  let builtOne = false;
  owners.forEach(o => {
    const close = near && Math.hypot(cp.x - o.x, cp.z - o.z) < o.R + 2.4;
    if(close && !o.group && !builtOne && o.roads){ ensureTown(o); builtOne = true; }       // at most one new town per frame
    if(o.group) o.group.visible = close;
  });
  propChunks.forEach(p => { p.m.visible = camDist < 2.6 && (p.all || Math.hypot(cp.x - p.x, cp.z - p.z) < p.r); });
  // after dark: windows, lamps and lighthouses
  winU.value = NIGHT.value * 1.15;
  if(glowOK){
    const on = NIGHT.value > 0.01;
    lights.town.pts.visible = on && camDist > 1.6; lights.town.u.uFade.value = smooth(1.6, 4.5, camDist);
    lights.lamps.pts.visible = on && camDist < 9; lights.lamps.u.uFade.value = 1 - smooth(6, 9, camDist);
    lights.beacons.pts.visible = on;
    lights.beamMat.opacity = NIGHT.value * 0.2;
    lights.beams.forEach(b => { b.visible = on && camDist < 60; b.rotation.y += dt * 0.55; });
  }
  // crossing gates swing shut across the road when a train is near
  if(camDist < 3){
    gates.forEach(gt => {
      const c = gt.c; if(Math.hypot(cp.x - c.x, cp.z - c.z) > 2.5) return;
      let busy = false;
      K.RUNNERS.forEach(R => { if(busy || R.line !== c.line) return; R.unit.concat(R.cars).forEach(m => { if(!busy && Math.hypot(m.v.group.position.x - c.x, m.v.group.position.z - c.z) < 170 * M) busy = true; }); });
      const target = busy ? gt.closedA : gt.openA, step = dt * Math.min(8, Math.max(1, timeScale)) * 0.8;
      gt.cur += Math.max(-step, Math.min(step, target - gt.cur)); gt.pivot.rotation.y = gt.cur;
    });
  }
  // ships plying between harbours
  const sdt = dt * timeScale;
  sailing.forEach(s => {
    if(s.wait > 0){ s.wait -= sdt; return; }
    s.f += s.dir * sdt * 6 * M / s.L;
    if(s.f >= 1 || s.f <= 0){ s.f = Math.max(0, Math.min(1, s.f)); s.dir = -s.dir; s.wait = 240; }
    const x = s.A.x + (s.B.x - s.A.x) * s.f, z = s.A.z + (s.B.z - s.A.z) * s.f;
    s.g.position.set(x, 0, z); s.g.rotation.y = Math.atan2(-(s.B.z - s.A.z) * s.dir, (s.B.x - s.A.x) * s.dir);   // bow (+x) along the course
    s.g.visible = Math.hypot(cp.x - x, cp.z - z) < 7;
  });
});

let nb = 0; owners.forEach(o => Object.values(o.inst).forEach(l => nb += l.length));
const statTowns = document.getElementById('statTowns');
if(statTowns) statTowns.textContent = `${towns.length} · ${crossings.filter(c => c.kind === 'level').length}`;
window.SODOR_WORLD = {towns, roads, motorways, roundabouts, countryside: [...countryside.values()], wet, roadClear, crossings, harbours, headlands, sailing, extraSites, vicarstownBridge, buildings: nb, timing, ensureTown, lights, atlasMat,
  buildAll: () => towns.forEach(ensureTown), count: () => { let n = 0; owners.forEach(o => Object.values(o.inst).forEach(l => n += l.length)); return n; }};
console.log(`World: ${towns.length} towns, ${roads.length} roads, ${crossings.length} crossings (${crossings.filter(c => c.kind === 'level').length} level), ${nb} buildings, ${harbours.length} harbours, ${headlands.length} lighthouses, ${sailing.length} ships — ${Math.round(performance.now() - t0)} ms`);
})();
