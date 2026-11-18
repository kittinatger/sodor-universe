// track.js: one shared track network for the whole standard-gauge railway, with real points and
// signals, and engines that drive, shunt and couple on it to a timetable.
//
// Every road is a segment: a run of track between points, block joints or buffer stops. Segments meet
// at nodes; where a node has two roads on one side it is a set of points, lying one way or the other.
// Each vehicle stands at its own place on a segment; vehicles coupled together form a cut, and a cut
// moves as one, every vehicle stepping the same distance along the track through the points as they lie.
// Points can only be thrown when nothing stands on them. Where tracks cross or run too close together
// (a diamond, a scissors crossover, two lines sharing a formation) the crossing is interlocked: only one
// train may hold it at a time.
//
// An engine is sent somewhere by asking for a goal: a place for one end of its cut, or another cut to
// couple to. The planner searches the network for the shortest way there, reversing where the whole cut
// fits clear on one road, keeping to the proper road of a double line, and splits the route into legs,
// one per direction. A leg is driven like a train: the road ahead is set and held a block section at a
// time (the signals clear in front of it), the engine eases away, runs up to the line speed, brakes on
// a smooth curve for signals at danger, speed limits and stops, creeps the last few metres onto the
// buffers, and couples. Running round, changing trains, setting down and picking up wagons, stabling
// coaches and going on shed are all built from these moves.
//
// The railway: the Main Line (double track, left-hand running, block signals every few kilometres, a
// loop off each road and scissors crossovers where trains turn back, goods sidings at the other
// stations), the Ffarquhar branch with its yards, and every other standard-gauge branch: each train has
// its own terminal at each end (a run-round loop and an engine release road), its carriage and engine
// sidings where it is based, and the branches are joined to the Main Line and to each other at their
// junctions. Every train runs to a regular-interval timetable worked out from its run; between trains it
// waits at the terminus for its booked time. The Steam Team drive to the foot of the Tidmouth Sheds lead
// each night, where the turntable crew (ops.js) take them in.
(function(){
'use strict';
const K = window.SODOR_KIT, S = window.SODOR_STD, NWR = window.SODOR_NWR, DUT = window.SODOR_DUTIES || {};
const LF = LINES.ffarquhar, LM = LINES.main;
if(!K || !S || !NWR || !LF || !LF.real || !LM || !LM.real || !NWR.byId.thomas || !NWR.byId.thomas.runner) return;
const t0 = performance.now();
const M = METRE, V3 = THREE.Vector3;
const LEN = line => line.real.len / M;
const Lm = LEN(LF), LmM = LEN(LM);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const mod = (a, n) => ((a % n) + n) % n;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const hash = s => { let h = 7; for(const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h; };

// ================================================================== geometry
const _t = new V3(), _q2 = new V3();
// world point x metres along a line (from its start) and lat metres to its left
function linePoint(line, x, lat, out){
  const L = LEN(line), u = Math.max(0, Math.min(1, x / L));
  realAt(line, u, out); realDir(line, u, _t); _t.y = 0; _t.normalize();
  out.x += _t.z * lat * M; out.z -= _t.x * lat * M;
  return out;
}
function lineDir(line, x, out){ realDir(line, Math.max(0, Math.min(1, x / LEN(line))), out); out.y = 0; return out.normalize(); }
// a world point as (x, lat) on a line, searching near x0
function toLine(line, p, x0, span = 400){
  let bx = x0, bd = Infinity;
  for(const step of [8, 1, 0.1, 0.01]){
    const lo = bx - (step === 8 ? span : step * 12), hi = bx + (step === 8 ? span : step * 12);
    for(let x = lo; x <= hi; x += step){ const q = linePoint(line, x, 0, _q2), d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if(d < bd){ bd = d; bx = x; } }
  }
  bx = Math.max(0, Math.min(LEN(line), bx));
  const q = linePoint(line, bx, 0, _q2); lineDir(line, bx, _t);
  return {x: bx, lat: ((p.x - q.x) * _t.z - (p.z - q.z) * _t.x) / M, d: Math.hypot(p.x - q.x, p.z - q.z) / M};
}

// ================================================================== the network
const DEFS = [], SEGS = [], NODES = [];
// a road along a line: from xa to xb, lat(x) metres to the side
// every road belongs to a railway: the Main Line (which every train may use), or one branch, whose
// roads only that branch's trains use
let OWNER = 'main';
function road(line, name, xa, xb, lat, o = {}){ const d = {kind: 'line', line, name, xa: Math.min(xa, xb), xb: Math.max(xa, xb), lat, o, own: OWNER}; DEFS.push(d); rpAdd(d); return d; }
// a road through given world points (a junction curve); x is the distance along it
function path(line, name, pts, o = {}){
  const Sx = [0]; for(let i = 1; i < pts.length; i++) Sx.push(Sx[i - 1] + pts[i].distanceTo(pts[i - 1]) / M);
  const d = {kind: 'path', line, name, pts, S: Sx, xa: 0, xb: Sx[Sx.length - 1], lat: () => 0, o, own: OWNER}; DEFS.push(d); rpAdd(d); return d;
}
// every road laid so far, as points on a grid, so that new roads keep clear of the old ones
const RP_CELL = 8, RP = new Map();
function rpAdd(def){
  const step = def.o.main ? 4 : 2.5;
  for(let x = def.xa; x <= def.xb + 0.01; x += step){
    const p = def.kind === 'path' ? pathAt(def, Math.min(x, def.xb), new V3()) : linePoint(def.line, Math.min(x, def.xb), def.lat(Math.min(x, def.xb)), new V3());
    const k = Math.floor(p.x / (RP_CELL * M)) + ',' + Math.floor(p.z / (RP_CELL * M));
    if(!RP.has(k)) RP.set(k, []); RP.get(k).push({x: p.x, z: p.z, def});
  }
}
// how far (metres) a point is from the nearest road, looking no further than r; skip(def) leaves roads out
function nearRoad(p, r, skip){
  const cx = Math.floor(p.x / (RP_CELL * M)), cz = Math.floor(p.z / (RP_CELL * M)), n = Math.ceil(r / RP_CELL);
  let best = Infinity;
  for(let i = -n; i <= n; i++) for(let k = -n; k <= n; k++){
    const list = RP.get((cx + i) + ',' + (cz + k)); if(!list) continue;
    for(const q of list){ if(skip && skip(q.def)) continue; const d = Math.hypot(q.x - p.x, q.z - p.z) / M; if(d < best) best = d; }
  }
  return best;
}
function pathAt(def, x, out){
  const Sx = def.S, P = def.pts;
  if(x <= 0) return out.copy(P[0]); if(x >= def.xb) return out.copy(P[P.length - 1]);
  let lo = 1, hi = Sx.length - 1; while(lo < hi){ const m = (lo + hi) >> 1; if(Sx[m] < x) lo = m + 1; else hi = m; }
  return out.lerpVectors(P[lo - 1], P[lo], (x - Sx[lo - 1]) / ((Sx[lo] - Sx[lo - 1]) || 1));
}
const flat = v => () => v;
// leaving `base` at the toe and easing out to `to` over len metres, running in direction dir (+1: up the line)
const turnout = (base, toe, dir, len, to) => x => base + (to - base) * smooth(0, len, (x - toe) * dir);
const loop = (xa, xb, w, ra, rb) => x => w * smooth(xa, xa + ra, x) * (1 - smooth(xb - rb, xb, x));

function sampleSeg(def, xa, xb){
  const line = def.line, L = LEN(line), isPath = def.kind === 'path';
  const step = isPath ? 1.5 : def.o.main ? 4 : 2;
  const n = Math.max(2, Math.ceil((xb - xa) / step)), pts = [], xs = [], lats = [], vis = [];
  for(let i = 0; i <= n; i++){
    const x = xa + (xb - xa) * i / n;
    if(isPath){ pts.push(pathAt(def, x, new V3())); xs.push(x); lats.push(0); vis.push(true); continue; }
    const lat = def.lat(x), p = linePoint(line, x, lat, new V3());
    const base = p.y, al = Math.abs(lat - (def.o.base ? def.o.base(x) : 0));
    if(al > 3){ const g = Math.max(heightAt(p.x, p.z), 0) + 0.55 * M, w = smooth(3, 10, al); p.y = base + Math.max(-1.2 * M, Math.min(1.2 * M, g - base)) * w; }
    pts.push(p); xs.push(x); lats.push(lat);
    vis.push(al > 2.5 || !inTunnel(line, Math.max(0, Math.min(1, x / L))));
  }
  if(!def.o.main && !isPath){                              // smooth the levels along a siding
    const ys = pts.map(p => p.y);
    for(let i = 1; i < n; i++){ let s = 0, c = 0; for(let k = -3; k <= 3; k++){ const j = i + k; if(j >= 0 && j <= n){ s += ys[j]; c++; } } pts[i].y = s / c; }
  }
  const Sc = [0];
  for(let i = 1; i <= n; i++) Sc.push(Sc[i - 1] + pts[i].distanceTo(pts[i - 1]) / M);
  const seg = {id: SEGS.length, name: def.name, def, line, pts, xs, lats, vis, S: Sc, len: Sc[n], node: [null, null], grp: [0, 0],
    main: !!def.o.main, noRev: !!def.o.noRev, dir: def.o.dir || 0, res: null, place: def.o.place || '', conf: [], own: def.own};
  seg.vmax = def.o.vmax || (seg.main ? (seg.len > 700 ? (def.o.vline || 99) : (def.o.vstation || 9)) : 4.5);
  SEGS.push(seg);
  return seg;
}
function buildNetwork(){
  // split each road wherever another road's end lies on it, and at block joints along the open line
  const cuts = DEFS.map(() => new Set());
  DEFS.forEach((d, i) => { if(d.kind !== 'line') return; [d.xa, d.xb].forEach(x => {
    const lat = d.lat(x);
    DEFS.forEach((o, j) => { if(j !== i && o.kind === 'line' && o.line === d.line && x > o.xa + 0.5 && x < o.xb - 0.5 && Math.abs(o.lat(x) - lat) < 0.05) cuts[j].add(x); });
  }); });
  DEFS.forEach(d => [].concat(d.o.on || []).forEach(on => { const j = DEFS.indexOf(on.def); if(j >= 0 && on.x > DEFS[j].xa + 0.5 && on.x < DEFS[j].xb - 0.5) cuts[j].add(on.x); }));
  DEFS.forEach((d, i) => {
    if(!d.o.blocks) return;
    const ex = [d.xa, d.xb, ...cuts[i]];
    for(let x = d.xa + d.o.blocks; x < d.xb - d.o.blocks * 0.5; x += d.o.blocks)
      if(ex.every(e => Math.abs(e - x) > 700) && !(d.o.noBlock && d.o.noBlock(x))) cuts[i].add(x);
  });
  DEFS.forEach((d, i) => {
    const xs = [d.xa, ...[...cuts[i]].sort((a, b) => a - b), d.xb];
    for(let k = 0; k < xs.length - 1; k++) if(xs[k + 1] - xs[k] > 0.2) sampleSeg(d, xs[k], xs[k + 1]);
  });
  // join ends that meet; the roads on each side of a node are told apart by which way they leave it
  const ends = [];
  SEGS.forEach(s => {
    const n = s.pts.length - 1;
    ends.push({seg: s, end: 0, p: s.pts[0], out: s.pts[0].clone().sub(s.pts[1]).setY(0).normalize()});
    ends.push({seg: s, end: 1, p: s.pts[n], out: s.pts[n].clone().sub(s.pts[n - 1]).setY(0).normalize()});
  });
  const cell = 2 * M, grid = new Map(), key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
  ends.forEach(e => { const k = key(e.p.x, e.p.z); if(!grid.has(k)) grid.set(k, []); grid.get(k).push(e); });
  const used = new Set();
  ends.forEach(e => {
    if(used.has(e)) return;
    const cx = Math.floor(e.p.x / cell), cz = Math.floor(e.p.z / cell), near = [];
    for(let i = -1; i <= 1; i++) for(let k = -1; k <= 1; k++) (grid.get((cx + i) + ',' + (cz + k)) || []).forEach(f => { if(!used.has(f) && Math.hypot(f.p.x - e.p.x, f.p.z - e.p.z) < 0.3 * M) near.push(f); });
    near.forEach(f => used.add(f));
    if(near.length < 2) return;                            // a buffer stop
    const node = {id: NODES.length, p: e.p.clone(), ends: near, grp: [[], []], state: [0, 0], lever: null};
    near.forEach(f => { const g = f.out.dot(e.out) > 0 ? 0 : 1; f.g = g; node.grp[g].push(f); f.seg.node[f.end] = node; f.seg.grp[f.end] = g; });
    NODES.push(node);
  });
}
// Interlocking for crossings: wherever two roads that are not joined pass within a vehicle's width of
// each other, each records the stretch of the other it must not share.
function findConflicts(){
  const cell = 5 * M, grid = new Map(), key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
  const share = (a, b) => a.node.some(n => n && b.node.includes(n));
  SEGS.forEach(seg => { for(let i = 0; i < seg.pts.length; i++){ const p = seg.pts[i], k = key(p.x, p.z); if(!grid.has(k)) grid.set(k, []); grid.get(k).push({seg, s: seg.S[i], p}); } });
  const pairs = new Map(), R2 = (3.1 * M) ** 2;
  grid.forEach((list, k) => {
    const [cx, cz] = k.split(',').map(Number);
    list.forEach(a => {
      for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++) (grid.get((cx + i) + ',' + (cz + j)) || []).forEach(b => {
        if(b.seg.id <= a.seg.id || share(a.seg, b.seg)) return;
        const dx = a.p.x - b.p.x, dz = a.p.z - b.p.z;
        if(dx * dx + dz * dz > R2 || Math.abs(a.p.y - b.p.y) > 3.5 * M) return;
        const pk = a.seg.id + '|' + b.seg.id;
        let q = pairs.get(pk); if(!q){ q = {a: a.seg, b: b.seg, hits: []}; pairs.set(pk, q); }
        q.hits.push([a.s, b.s]);
      });
    });
  });
  // each place where the two roads come together is a crossing of its own (two roads may cross twice)
  let n = 0;
  pairs.forEach(q => {
    q.hits.sort((u, v) => u[0] - v[0]);
    let cl = null;
    const flush = () => { if(!cl) return; q.a.conf.push({seg: q.b, a: cl.a0, b: cl.a1, oa: cl.b0, ob: cl.b1}); q.b.conf.push({seg: q.a, a: cl.b0, b: cl.b1, oa: cl.a0, ob: cl.a1}); n++; cl = null; };
    q.hits.forEach(([sa, sb]) => {
      if(cl && sa - cl.a1 > 15) flush();
      if(!cl) cl = {a0: sa, a1: sa, b0: sb, b1: sb};
      cl.a1 = Math.max(cl.a1, sa); cl.b0 = Math.min(cl.b0, sb); cl.b1 = Math.max(cl.b1, sb);
    });
    flush();
  });
  return n;
}

// ================================================================== places on the track
// A place: {seg, s, f}; f is the way it faces (+1: towards the segment's far end).
const flip = p => ({seg: p.seg, s: p.s, f: -p.f});
function across(seg, end){
  const n = seg.node[end]; if(!n) return null;
  const others = n.grp[1 - seg.grp[end]];
  if(!others.length) return null;
  return others.length === 1 ? others[0] : others[n.state[1 - seg.grp[end]] % others.length];
}
// d metres on from p the way it faces, through the points as they lie (stops at a buffer stop)
function walk(p, d){
  let seg = p.seg, s = p.s, f = p.f;
  for(let guard = 0; guard < 64; guard++){
    const ns = s + f * d;
    if(ns >= 0 && ns <= seg.len) return {seg, s: ns, f};
    const edge = f > 0 ? seg.len : 0;
    d -= Math.abs(edge - s);
    const nx = across(seg, f > 0 ? 1 : 0);
    if(!nx) return {seg, s: edge, f, buffer: true};
    seg = nx.seg; f = nx.end === 0 ? 1 : -1; s = nx.end === 0 ? 0 : seg.len;
  }
  return {seg, s, f};
}
function idxAt(seg, s){
  const Sx = seg.S; let lo = 1, hi = Sx.length - 1;
  if(s <= 0) return 1; if(s >= seg.len) return Sx.length - 1;
  while(lo < hi){ const m = (lo + hi) >> 1; if(Sx[m] < s) lo = m + 1; else hi = m; }
  return lo;
}
function pointAt(p, out){
  const seg = p.seg, i = idxAt(seg, p.s), a = seg.pts[i - 1], b = seg.pts[i], t = (p.s - seg.S[i - 1]) / ((seg.S[i] - seg.S[i - 1]) || 1);
  return out.lerpVectors(a, b, Math.max(0, Math.min(1, t)));
}
function xAt(p){ const seg = p.seg, i = idxAt(seg, p.s), t = (p.s - seg.S[i - 1]) / ((seg.S[i] - seg.S[i - 1]) || 1); return seg.xs[i - 1] + (seg.xs[i] - seg.xs[i - 1]) * t; }
function visAt(p){ const seg = p.seg, i = idxAt(seg, p.s); return seg.vis[i] && seg.vis[i - 1]; }
const BYNAME = new Map();
// the place on a named road at x metres along it (facing up the line)
function at(name, x){
  for(const seg of (BYNAME.get(name) || [])){
    const xs = seg.xs, n = xs.length - 1;
    if(x < xs[0] - 1e-6 || x > xs[n] + 1e-6) continue;
    let lo = 1, hi = n; while(lo < hi){ const m = (lo + hi) >> 1; if(xs[m] < x) lo = m + 1; else hi = m; }
    const i = lo, t = (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1);
    return {seg, s: seg.S[i - 1] + (seg.S[i] - seg.S[i - 1]) * Math.max(0, Math.min(1, t)), f: 1};
  }
  return null;
}

// ================================================================== vehicles and cuts
const CUTS = [], VEHS = [];
const GAP = 0.3;                                           // metres between buffers when coupled
let cutId = 0;
function newCut(vs){ const c = {id: ++cutId, vs, away: false}; vs.forEach(v => v.cut = c); CUTS.push(c); occTick = -1; return c; }
const cutLen = c => c.vs.reduce((s, v, i) => s + v.L + (i ? GAP : 0), 0);
// one end of a cut, facing outwards ('A': the first vehicle's end, 'B': the last's)
function endPos(c, e){ const n = c.vs.length - 1; return e === 'A' ? walk(c.vs[0].pos, c.vs[0].L / 2) : walk(flip(c.vs[n].pos), c.vs[n].L / 2); }
// lay a cut out with its A end at place p (p faces out of the cut, the way the A end points)
function layCut(c, p){
  occTick = -1;
  let d = 0; const into = flip(p);
  c.vs.forEach((v, i) => { d += (i ? GAP : 0) + v.L / 2; v.pos = flip(walk(into, d)); d += v.L / 2; v.dirty = true; });
}
function reverseCut(c){ c.vs.reverse(); c.vs.forEach(v => { v.pos = flip(v.pos); v.rev = !v.rev; }); }
// cut a: its aEnd meets cut b's bEnd; b joins a
function merge(a, aEnd, b, bEnd){
  if(aEnd === 'A') reverseCut(a);
  if(bEnd === 'B') reverseCut(b);
  a.vs = a.vs.concat(b.vs); b.vs.forEach(v => v.cut = a);
  CUTS.splice(CUTS.indexOf(b), 1); occTick = -1;
  return a;
}
// the first k vehicles stay; the rest become a cut of their own (returned)
function split(c, k){
  if(k <= 0 || k >= c.vs.length) return null;
  const rest = c.vs.slice(k); c.vs = c.vs.slice(0, k);
  return newCut(rest);
}
function moveCut(c, lead, d){
  if(d <= 0) return;
  c.lead = lead; c.moved = tick;
  c.vs.forEach(v => { v.pos = lead === 'A' ? walk(v.pos, d) : flip(walk(flip(v.pos), d)); v.dirty = true; v.spin += (lead === 'A' ? 1 : -1) * (v.rev ? -1 : 1) * d; v.moving = true; });
}
const engEnd = (c, e) => c.vs[0] === e ? 'A' : c.vs[c.vs.length - 1] === e ? 'B' : (c.vs[1] === e ? 'A' : 'B');
// which end leads: the engine's when it has a train (unless it pushes and pulls); either when it runs light
const lone = e => e.cut.vs.every(v => v.eng || v.tender);
const leadEnd = e => lone(e) || (e.duty && e.duty.pp) ? undefined : engEnd(e.cut, e);
const other = e => e === 'A' ? 'B' : 'A';

// where each vehicle's body lies: [seg, from, to] pieces
function spans(v){
  const out = [], f = walk(v.pos, v.L / 2), b = walk(flip(v.pos), v.L / 2);
  const piece = q => { if(q.seg === v.pos.seg) return; const edge = q.f > 0 ? 0 : q.seg.len; out.push([q.seg, Math.min(edge, q.s), Math.max(edge, q.s)]); };
  const lo = f.seg === v.pos.seg ? f.s : (v.pos.f > 0 ? v.pos.seg.len : 0), hi = b.seg === v.pos.seg ? b.s : (v.pos.f > 0 ? 0 : v.pos.seg.len);
  out.push([v.pos.seg, Math.min(lo, hi), Math.max(lo, hi)]);
  piece(f); piece(b);
  return out;
}
let tick = 0, occTick = -1, OCC = null;
function occupancy(){
  if(occTick === tick && OCC) return OCC;
  OCC = new Map();
  CUTS.forEach(c => { if(c.away) return; c.vs.forEach(v => { if(v.pos) spans(v).forEach(([seg, a, b]) => { if(!OCC.has(seg)) OCC.set(seg, []); OCC.get(seg).push({a, b, cut: c}); }); }); });
  occTick = tick;
  return OCC;
}
function nodeLocked(n){
  const occ = occupancy();
  return n.ends.some(e => (occ.get(e.seg) || []).some(q => e.end === 0 ? q.a < 1.2 : q.b > e.seg.len - 1.2));
}

// ================================================================== the planner
function heapPush(H, st){ H.push(st); let i = H.length - 1; while(i > 0){ const p = (i - 1) >> 1; if(H[p].c <= H[i].c) break; const t = H[p]; H[p] = H[i]; H[i] = t; i = p; } }
function heapPop(H){
  const top = H[0], last = H.pop();
  if(H.length){ H[0] = last; let i = 0; for(;;){ const l = 2 * i + 1, r = l + 1; let m = i; if(l < H.length && H[l].c < H[m].c) m = l; if(r < H.length && H[r].c < H[m].c) m = r; if(m === i) break; const t = H[m]; H[m] = H[i]; H[i] = t; i = m; } }
  return top;
}
// goal: {pos, f, end} a place for one end of the cut ('A', 'B'); or {couple: cut, end, at} to couple
// the cut's `end` (any if not given) to the other cut's end `at` (any if not given). yard: keep off the open line.
function plan(c, goal){
  const L = cutLen(c), occ = occupancy(), tgt = goal.couple || null;
  const T = new Map();
  const addT = (seg, s, f) => { if(!T.has(seg)) T.set(seg, []); T.get(seg).push({s, f}); };
  if(tgt){ (goal.at ? [goal.at] : ['A', 'B']).forEach(e => { const p = endPos(tgt, e); addT(p.seg, p.s, -p.f); }); }
  else if(goal.pos) addT(goal.pos.seg, goal.pos.s, goal.f || 0);
  else if(!goal.clear) return null;
  const lines = goal.lines || ((c.vs.find(v => v.duty) || {}).duty || {}).lines || (c.vs.includes(glynn) ? GLYNN_LINES : null);    // the railways this train may use
  // What stands in the way: wagons and stock left standing block the road outright; a train at work will
  // move on, so the road through it costs as much as a long way round (better to wait for it than to go
  // twenty miles about).
  const SOFT = 3000;
  const working = k => k.vs.some(v => v.duty || v === glynn);
  const blockCost = (seg, a, b) => {
    const iv = occ.get(seg); if(!iv) return 0;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    // on the open line, trains ahead are kept apart by the signals as they run, not by the plan
    if(seg.dir && seg.len > 700) return iv.some(q => q.cut === tgt && q.b > lo + 0.4 && q.a < hi - 0.4) ? Infinity : 0;
    let k = 0;
    for(const q of iv){
      if(q.cut === c) continue;
      if(q.cut === tgt){ if(q.b > lo + 0.4 && q.a < hi - 0.4) return Infinity; continue; }
      if(q.b > lo - 0.3 && q.a < hi + 0.3){ if(!working(q.cut) || q.cut === goal.avoidCut) return Infinity; k = SOFT; }
    }
    return k;
  };
  // running against the traffic on the open line: only a short way, to back into a siding or clear a crossover
  // a yard pilot keeps off the open line, but for a head shunt just beyond the yard points
  const cost = (seg, f, d) => goal.yard && seg.main && seg.len > 300 ? (d > 150 ? Infinity : d * 2 + 30)
    : seg.dir && seg.dir !== f && seg.len > 700 ? (d > 400 ? Infinity : d * 3 + 60) : d;
  const maxD = goal.maxDist || Infinity;
  const best = new Map(), Q = [];
  const kOf = st => st.seg.id + '|' + st.f + '|' + st.lead + '|' + st.tag;
  const push = st => { if(st.d > maxD) return; const k = kOf(st), b = best.get(k); if(b !== undefined && b <= st.c + 1e-9) return; best.set(k, st.c); heapPush(Q, st); };
  ['A', 'B'].forEach(lead => { const p = endPos(c, lead); push({seg: p.seg, f: p.f, s: p.s, lead, c: 0.5, d: 0, rev: 0, tag: 's' + lead, prev: null, act: null}); });
  let sol = null, guard = 0;
  while(Q.length && guard++ < 60000){
    const st = heapPop(Q);
    if(best.get(kOf(st)) < st.c - 1e-9) continue;
    if(sol && st.c >= sol.c) break;
    // getting out of another train's way: anywhere off its road where the whole cut stands clear
    if(goal.clear && st.tag === 'n' && !goal.clear.has(st.seg) && !(st.seg.dir && st.seg.len > 700 && st.seg.dir !== st.f)){
      const sE = st.s + st.f * (L + 6);
      if(sE >= 2 && sE <= st.seg.len - 2 && blockCost(st.seg, st.s, sE) === 0){
        const cc = st.c + L + 6 + (st.seg.main && st.seg.len > 700 ? 400 : 0);
        if(!sol || cc < sol.c) sol = {c: cc, st, s: sE};
      }
    }
    const tl = T.get(st.seg);
    if(tl && (!goal.end || goal.end === st.lead)) for(const t of tl){
      if(t.f && t.f !== st.f) continue;
      const ds = (t.s - st.s) * st.f;
      if(ds < -0.05) continue;
      const bc = blockCost(st.seg, st.s, t.s); if(bc === Infinity) continue;
      const cc = st.c + cost(st.seg, st.f, Math.max(0, ds)) + bc;
      if(cc < Infinity && (!sol || cc < sol.c)) sol = {c: cc, st, s: t.s};
    }
    const exitS = st.f > 0 ? st.seg.len : 0, end = st.f > 0 ? 1 : 0, n = st.seg.node[end];
    const bx = n ? blockCost(st.seg, st.s, exitS) : Infinity;
    if(n && bx < Infinity){
      const g = 1 - st.seg.grp[end], others = n.grp[g], locked = others.length > 1 && nodeLocked(n);
      const dd = Math.abs(exitS - st.s), cc = st.c + cost(st.seg, st.f, dd) + bx + 0.01;
      if(cc < Infinity) others.forEach((e, idx) => {
        if(locked && n.state[g] !== idx) return;
        if(lines && !lines.has(e.seg.own)) return;
        push({seg: e.seg, f: e.end === 0 ? 1 : -1, s: e.end === 0 ? 0 : e.seg.len, lead: st.lead, c: cc, d: st.d + dd, rev: st.rev, tag: 'n', prev: st, act: others.length > 1 ? {node: n, g, idx} : {}});
      });
    }
    // turn back: the whole cut drawn up on this road, just clear of the points behind it
    if(st.rev < 5 && !st.seg.noRev && st.seg.len >= L + 9){
      const sR = st.f > 0 ? Math.max(st.s, L + 6) : Math.min(st.s, st.seg.len - L - 6);
      const tail = sR - st.f * L, dd = Math.abs(sR - st.s);
      if(tail >= 2.5 && tail <= st.seg.len - 2.5){
        const bc = Math.max(blockCost(st.seg, st.s, sR), blockCost(st.seg, tail, sR)), cr = cost(st.seg, st.f, dd);
        if(bc < Infinity && cr < Infinity)
          push({seg: st.seg, f: -st.f, s: tail, lead: other(st.lead), c: st.c + cr + bc + 80, d: st.d + dd, rev: st.rev + 1, tag: 'r' + st.rev, prev: st, act: {rev: true, sR}});
      }
      // or run on past a spot on this road and set back onto it
      if(tl) for(const t of tl){
        if(t.f !== -st.f || (t.s - st.s) * st.f < 0 || (goal.end && goal.end !== other(st.lead))) continue;
        const s2 = t.s + st.f * (L + 1.5), tail2 = s2 - st.f * L, d2 = Math.abs(s2 - st.s);
        if(s2 < 2.5 || s2 > st.seg.len - 2.5 || (s2 - sR) * st.f <= 0.5) continue;
        const bc = Math.max(blockCost(st.seg, st.s, s2), blockCost(st.seg, tail2, s2)), cr = cost(st.seg, st.f, d2);
        if(bc < Infinity && cr < Infinity)
          push({seg: st.seg, f: -st.f, s: tail2, lead: other(st.lead), c: st.c + cr + bc + 80, d: st.d + d2, rev: st.rev + 1, tag: 'q' + st.rev, prev: st, act: {rev: true, sR: s2}});
      }
    }
  }
  if(!sol) return null;
  // back along the chain into legs, one per direction of travel
  const chain = []; for(let s = sol.st; s; s = s.prev) chain.unshift(s);
  const legs = []; let leg = null;
  for(let i = 0; i < chain.length; i++){
    const st = chain[i], nx = chain[i + 1];
    if(!leg) leg = {lead: st.lead, steps: []};
    const sOut = !nx ? sol.s : nx.act && nx.act.rev ? nx.act.sR : (st.f > 0 ? st.seg.len : 0);
    leg.steps.push({seg: st.seg, f: st.f, sIn: st.s, sOut, sw: st.act && st.act.node ? st.act : null});
    if(nx && nx.act && nx.act.rev){ legs.push(leg); leg = null; }
  }
  if(leg) legs.push(leg);
  legs.forEach(l => { let d = 0; l.steps.forEach(s => { s.d0 = d; d += Math.abs(s.sOut - s.sIn); }); l.total = d; });
  if(tgt) legs[legs.length - 1].couple = tgt;
  return legs;
}

// ================================================================== driving a leg
// A leg is driven like a train: the road ahead is taken a block section at a time (a whole station's
// worth of points at once, so two trains never each hold half of the other's way), the speed follows
// the line limits, braking curves and a gentle jerk-limited regulator, and the last metres onto
// buffers or another vehicle are taken at a crawl.
const JERK = 0.35;
function startLeg(c, leg, o = {}){
  const n = c.vs.length, heavy = Math.min(1, Math.max(0, n - 1) / 9);
  return {c, leg, lead: leg.lead, dist: 0, v: 0, a: 0, next: 0, held: new Set(), wait: 0, vmax: o.vmax || 6,
    amax: (o.vmax || 6) <= 8 ? 0.22 : 0.42 - 0.2 * heavy, bmax: 0.55 - 0.15 * heavy, done: false, fail: false};
}
const who = c => { if(!c) return '?'; const e = c.vs.find(v => v.eng); return e ? e.name : `wagons (${c.vs[0].name})`; };
// Can this stretch of route be set and held? Returns '' if so, or why not. Every road it uses must be
// clear of other vehicles (but those it is going to couple to) and not held for another train, the
// points must not be locked the wrong way under a train, and no crossing road may be in use.
let BLOCKER = null;                                        // what routeBlock last found in the way (a leg or a cut)
function routeBlock(m, chunk){
  const occ = occupancy();
  BLOCKER = null;
  for(const st of chunk){
    const r = st.seg.res;
    if(r && r !== m && r.alive){ BLOCKER = r; return `${st.seg.name} held for ${who(r.c)}`; }
    if(st.sw && st.sw.node.state[st.sw.g] !== st.sw.idx && nodeLocked(st.sw.node)){
      const n = st.sw.node, q0 = n.ends.map(e => (occ.get(e.seg) || []).find(q => e.end === 0 ? q.a < 1.2 : q.b > e.seg.len - 1.2)).find(Boolean);
      BLOCKER = q0 ? q0.cut : null; return `points at ${st.seg.name} locked`;
    }
    const lo = Math.min(st.sIn, st.sOut), hi = Math.max(st.sIn, st.sOut);
    const q = (occ.get(st.seg) || []).find(q => q.cut !== m.c && q.cut !== m.leg.couple && q.b > lo - 0.5 && q.a < hi + 0.5);
    if(q){ BLOCKER = q.cut; return `${st.seg.name} occupied by ${who(q.cut)}`; }
    for(const cf of st.seg.conf){
      if(cf.b < lo - 6 || cf.a > hi + 6) continue;          // this route does not reach the crossing
      const o = cf.seg;
      if(o.res && o.res !== m && o.res.alive){ BLOCKER = o.res; return `crossing ${o.name} held for ${who(o.res.c)}`; }
      const q2 = (occ.get(o) || []).find(q => q.cut !== m.c && q.cut !== m.leg.couple && q.b > cf.oa - 6 && q.a < cf.ob + 6);
      if(q2){ BLOCKER = q2.cut; return `crossing ${o.name} occupied by ${who(q2.cut)}`; }
    }
  }
  return '';
}
// Two trains each waiting for the other: the one that has waited less gives up the road it holds ahead of
// it (it has not reached it yet) and stands back a while, so the other can go.
const legOf = x => !x ? null : x.leg ? x : x.mover || null;
function giveWay(m){
  const steps = m.leg.steps, occ = occupancy();
  let first = 0; while(first < m.next && steps[first].d0 <= m.dist + 0.01) first++;
  while(first < m.next && (occ.get(steps[first].seg) || []).some(q => q.cut === m.c)) first++;
  if(first >= m.next) return false;
  const keep = new Set(steps.slice(0, first).map(s => s.seg));
  for(let i = first; i < m.next; i++){ const seg = steps[i].seg; if(!keep.has(seg) && seg.res === m){ seg.res = null; m.held.delete(seg); } }
  m.next = first; m.hold = 120 + rnd() * 180; m.wait = 0;
  return true;
}
function breakDeadlocks(){
  DRIVERS.forEach(r => {
    const m = r.cmd && r.cmd.leg;
    if(!m || !m.alive || m.v > 0.05 || m.wait < 40 || m.hold > 0) return;
    const b = legOf(m.blocker);
    if(!b || b === m || !b.alive || b.v > 0.05 || b.wait < 40) return;
    const bb = legOf(b.blocker);
    if(bb !== m && !(bb && bb !== b && legOf(bb.blocker) === m)) return;       // not waiting on each other (or round a ring of three)
    const [first, second] = m.wait <= b.wait ? [m, b] : [b, m];
    const gw = x => (x.gw || 0) < 2 && giveWay(x) && (x.gw = (x.gw || 0) + 1);
    if(gw(first) || gw(second)) STATS.deadlocks = (STATS.deadlocks || 0) + 1;
    // each standing in the other's way: the one that has waited less backs out of the other's road
    else if(first.wait > 90 && !first.forceFail){ first.forceFail = true; first.retreat = second; STATS.deadlocks = (STATS.deadlocks || 0) + 1; }
  });
}
function stepLeg(m, dt){
  const leg = m.leg, steps = leg.steps, L = cutLen(m.c);
  // set and hold the road ahead, well beyond braking distance
  const look = 500 + m.v * m.v / (2 * m.bmax) * 1.5 + m.v * 10;
  if(m.forceFail){ releaseLeg(m); m.fail = true; return 'fail'; }     // told to give way
  if(m.hold > 0) m.hold -= dt;                             // standing back to let another train by
  else while(m.next < steps.length && steps[m.next].d0 - m.dist < look){
    // a block section at a time: the roads up to and including the next stretch of open line run the proper way
    let j = m.next;
    while(j < steps.length){ const st = steps[j], open = st.seg.len > 700 && (!st.seg.dir || st.seg.dir === st.f); j++; if(open) break; }
    const chunk = steps.slice(m.next, j);
    const why = routeBlock(m, chunk);
    if(why){ m.why = why; m.blocker = BLOCKER; break; }
    m.why = ''; m.blocker = null;
    chunk.forEach(st => {
      if(st.sw && st.sw.node.state[st.sw.g] !== st.sw.idx){ st.sw.node.state[st.sw.g] = st.sw.idx; throwLever(st.sw.node); }
      st.seg.res = m; m.held.add(st.seg);
    });
    m.next += chunk.length;
  }
  m.alive = true;
  const routeEnd = m.next >= steps.length;
  let limit = (routeEnd ? leg.total : steps[m.next].d0 - 8) - m.dist, toObstacle = false;
  // anything standing or moving on the road ahead
  const occ = occupancy();
  for(let k = 0; k < m.next; k++){
    const st = steps[k];
    if(st.d0 - m.dist > limit) break;
    (occ.get(st.seg) || []).forEach(q => {
      if(q.cut === m.c) return;
      const edge = st.f > 0 ? q.a : q.b, dd = st.d0 + (edge - st.sIn) * st.f;
      if(dd < m.dist - 0.3) return;                        // behind the leading end
      const room = dd - m.dist - (q.cut === leg.couple ? 0 : 4);
      if(room < limit){ limit = room; toObstacle = q.cut !== leg.couple; if(toObstacle) m.obst = q.cut; }
    });
  }
  if(toObstacle && m.v < 0.05){ m.why = `${who(m.obst)} in the way on ${m.obst.vs[0].pos.seg.name}`; m.blocker = m.obst; }
  // speed: the slowest road under the train, braking curves for slower roads ahead and for the stopping point
  let vcap = m.vmax;
  for(let k = 0; k < steps.length; k++){
    const st = steps[k], a = st.d0, b = st.d0 + Math.abs(st.sOut - st.sIn);
    if(b < m.dist - L - 1) continue;
    if(a > m.dist + 2000) break;
    vcap = Math.min(vcap, Math.sqrt(st.seg.vmax * st.seg.vmax + 2 * m.bmax * 0.8 * Math.max(0, a - m.dist)));
  }
  const rem = Math.max(0, limit), coupling = routeEnd && !toObstacle && !!leg.couple;
  let vAllow = Math.sqrt((coupling ? 0.09 : 0) + 2 * m.bmax * 0.85 * Math.max(0, rem - 0.25));
  if(rem < 12 && (routeEnd || coupling || toObstacle)) vAllow = Math.min(Math.max(vAllow, 0.25), 0.35 + rem * 0.12);      // creep the last few metres
  const vt = Math.min(vcap, vAllow);
  // the regulator and brake: smooth changes of acceleration, firmer on the brake than on the regulator
  const aWant = Math.max(-m.bmax * 1.4, Math.min(m.amax, (vt - m.v) / 2.5));
  const da = aWant - m.a, jr = (da < 0 ? JERK * 2.5 : JERK) * dt;
  m.a += Math.max(-jr, Math.min(jr, da));
  if(m.v > vAllow + 0.1) m.a = Math.min(m.a, -m.bmax);
  m.v = Math.max(0, m.v + m.a * dt);
  if(m.v > vt + 0.3) m.v = Math.max(vt + 0.3, m.v - m.bmax * 1.4 * dt);
  if(m.v <= 0){ m.a = Math.max(0, m.a); }
  let d = Math.min(rem, m.v * dt);
  if(rem - d < 0.02 && (routeEnd || toObstacle || rem < 0.5)){ d = rem; if(rem < 0.3){ m.v = Math.min(m.v, 0.3); } }
  moveCut(m.c, m.lead, d);
  m.dist += d;
  if(d < 1e-3 && rem < 0.05){ m.v = 0; m.a = 0; }
  // let go of the road behind
  for(const seg of m.held){
    let last = -1; steps.forEach(st => { if(st.seg === seg) last = Math.max(last, st.d0 + Math.abs(st.sOut - st.sIn)); });
    if(last >= 0 && last < m.dist - L - 3 && seg.res === m){ seg.res = null; m.held.delete(seg); }
  }
  // there, or as near as it can come to a spot just short of something standing
  if(leg.total - m.dist < 0.03 || (toObstacle && rem < 0.05 && leg.total - m.dist < 1.5)){ finishLeg(m); return 'done'; }
  m.atSignal = d < 1e-3 && !routeEnd && !toObstacle;
  if(d < 1e-4){ m.wait += dt; if(m.wait > 360){ releaseLeg(m); m.fail = true; return 'fail'; } } else m.wait = 0;
  return 'run';
}
function releaseLeg(m){ m.held.forEach(seg => { if(seg.res === m) seg.res = null; }); m.held.clear(); m.alive = false; }
function finishLeg(m){
  releaseLeg(m); m.done = true; m.v = 0;
  const t = m.leg.couple;
  if(t && CUTS.includes(t) && t !== m.c){
    const me = endPos(m.c, m.lead), pt = pointAt(me, new V3());
    let be = null, bd = Infinity;
    ['A', 'B'].forEach(e => { const q = pointAt(endPos(t, e), new V3()), dd = q.distanceTo(pt); if(dd < bd){ bd = dd; be = e; } });
    if(bd < 2.5 * M){ merge(m.c, m.lead, t, be); m.coupled = true; }
  }
}

// ================================================================== drawing
const TRACK_G = new THREE.Group(); scene.add(TRACK_G);
function drawSeg(seg){
  if(seg.def.o.noDraw) return;
  if(seg.main && seg.lats.every(l => Math.abs(l) < 0.01)) return;        // the line's own track is already drawn
  K.ribbon(seg.line, seg.pts.map(p => p.clone().setY(p.y + 0.03 * M)), 3.6);
}
const BUF_MAT = new THREE.MeshStandardMaterial({color: 0xb3201c, roughness: 0.6}), POST = new THREE.MeshStandardMaterial({color: 0x3a3a3a, roughness: 0.7});
const LEVER_MAT = new THREE.MeshStandardMaterial({color: 0xd8d4c8, roughness: 0.6}), LEVER_RED = new THREE.MeshStandardMaterial({color: 0xc8201e, roughness: 0.5});
function bufferAt(seg, end){
  const i = end ? seg.pts.length - 1 : 0, j = end ? i - 1 : 1, p = seg.pts[i], q = seg.pts[j];
  const g = new THREE.Group(); g.position.copy(p); g.rotation.y = Math.atan2(p.x - q.x, p.z - q.z); g.scale.setScalar(M);
  K.box(g, 3.0, 0.5, 0.45, BUF_MAT, 0, 1.0, -0.2);
  for(const s of [-0.8, 0.8]) K.box(g, 0.28, 1.1, 1.4, POST, s, 0.55, -0.8);
  K.box(g, 0.22, 0.22, 0.12, LEVER_RED, 0, 1.4, -0.1);
  TRACK_G.add(g);
}
// a ground frame lever beside each set of points; it leans over when they are thrown
function leverAt(n){
  const e = n.ends[0], seg = e.seg, i = e.end ? seg.pts.length - 2 : 1, p = n.p, q = seg.pts[i];
  const g = new THREE.Group(); g.position.copy(p); g.rotation.y = Math.atan2(q.x - p.x, q.z - p.z); g.scale.setScalar(M);
  const side = -2.6;
  K.box(g, 0.5, 0.35, 0.9, POST, side, 0.18, 2);
  const piv = new THREE.Group(); piv.position.set(side, 0.35, 2); g.add(piv);
  K.box(piv, 0.08, 1.0, 0.08, LEVER_MAT, 0, 0.5, 0); K.box(piv, 0.1, 0.14, 0.1, LEVER_RED, 0, 1.0, 0);
  n.lever = piv; TRACK_G.add(g);
}
function throwLever(n){ if(n.lever) n.lever.rotation.x = n.state[0] || n.state[1] ? 0.5 : -0.5; }
// Signals: lower-quadrant semaphores on the driver's side at the entrance to each block section and
// station; the arm drops when the section beyond is set and held for a train, and the lamp shows red or
// green after dark.
const SIGNALS = [], SIG_WHITE = new THREE.MeshStandardMaterial({color: 0xeeeeea, roughness: 0.6}), SIG_ARM = new THREE.MeshStandardMaterial({color: 0xc8262b, roughness: 0.5});
const LAMP_R = new THREE.MeshBasicMaterial({color: 0xff3020}), LAMP_G = new THREE.MeshBasicMaterial({color: 0x40ff90});
const LAMP_GEO = new THREE.SphereGeometry(0.16, 8, 6);
function signalAt(name, x, f, side, guard){
  const p = at(name, x); if(!p) return;
  const w = pointAt(p, new V3()), q = pointAt(walk({...p, f}, 3), new V3());
  const g = new THREE.Group(); g.position.copy(w); g.rotation.y = Math.atan2(q.x - w.x, q.z - w.z); g.scale.setScalar(M);
  const sx = side * 3.1;
  K.box(g, 0.22, 7, 0.22, SIG_WHITE, sx, 3.5, 0);
  K.box(g, 0.5, 0.25, 0.5, POST, sx, 0.12, 0);
  const piv = new THREE.Group(); piv.position.set(sx, 6.4, 0.15); g.add(piv);
  K.box(piv, 1.4, 0.28, 0.06, SIG_ARM, side * 0.75, 0, 0);
  K.box(piv, 0.22, 0.29, 0.065, SIG_WHITE, side * 1.15, 0, 0.002);
  const lr = new THREE.Mesh(LAMP_GEO, LAMP_R), lg = new THREE.Mesh(LAMP_GEO, LAMP_G);
  lr.position.set(sx, 6.0, 0.28); lg.position.copy(lr.position); g.add(lr, lg);
  TRACK_G.add(g);
  SIGNALS.push({piv, guard: guard || walk({...p, f}, 10).seg, side, cur: 0, lr, lg});
}
function updateSignals(dt){
  const night = NIGHT_U.value > 0.12;
  SIGNALS.forEach(s => {
    const r = s.guard.res, clear = !!(r && r.alive);
    const want = clear ? -0.7 : 0; s.cur += (want - s.cur) * Math.min(1, dt * 2.5); s.piv.rotation.z = s.side * s.cur;
    s.lr.visible = night && !clear; s.lg.visible = night && clear;
  });
}

// vehicles: placed from two points on the track either side of their middle
const _a = new V3(), _b = new V3(), _c = new V3();
const FAR = 1.35, NEAR = 0.45;
function render(v, cp){
  const g = v.v.group;
  if(v.cut.away || !v.pos) return;
  if(v.dirty){
    pointAt(v.pos, _c);
    const h = Math.max(0.6, v.L * 0.42);
    pointAt(walk(v.pos, h), _a); pointAt(walk(flip(v.pos), h), _b);
    let dx = _a.x - _b.x, dy = _a.y - _b.y, dz = _a.z - _b.z;
    if(v.rev){ dx = -dx; dy = -dy; dz = -dz; }
    g.rotation.order = 'YXZ';
    g.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
    g.position.copy(_c);
    v.vis = visAt(v.pos);
    v.dirty = false;
  }
  const d = cp.distanceTo(g.position);
  g.visible = v.pos.seg.line.userVisible && v.vis && d < FAR;
  const near = d < NEAR;
  if(g.visible && v._lod !== near){ v._lod = near; (v.v.axles || []).forEach(a => a.g.visible = near); (v.v.rods || []).forEach(r => r.mesh.visible = near); }
  if(v.spin){ if(g.visible) K.spin(v.v, v.spin * M, M); v.spin = 0; }
  // steam: more often the harder she works (starting away, climbing)
  if(v.eng && v.moving && !v.diesel && v.v.chimneyAt && g.visible && camDist < 3){
    const mv = v.cut.mover, work = mv ? Math.max(0.15, Math.min(1, mv.a / 0.3 + 0.3)) : 0.4;
    v.puff = (v.puff || 0) - work;
    if(v.puff <= 0){ v.puff = 10 + (mv ? Math.min(20, mv.v) : 6); _a.copy(v.v.chimneyAt); g.localToWorld(_a); K.puff(_a); }
  }
  v.moving = false;
}
// lamps after dark: white at the engine's end of a train, red on the last vehicle
const LAMPS = typeof makeGlow === 'function' ? makeGlow(900, {minPx: 2, maxPx: 20, floor: 0.5}) : null;
const WHITE = new THREE.Color(0xfff0cc), RED = new THREE.Color(0xff2a14);
function updateLamps(){
  if(!LAMPS) return;
  LAMPS.clear();
  if(NIGHT_U.value < 0.02){ LAMPS.pts.visible = false; return; }
  LAMPS.pts.visible = true;
  CUTS.forEach(c => {
    if(c.away || !c.vs.some(v => v.eng) || !c.vs[0].v.group.visible) return;
    const eA = c.vs[0].eng || c.vs[0].tender || (c.vs[1] && c.vs[1].eng), h = 2.3 * M;
    pointAt(endPos(c, 'A'), _a); pointAt(endPos(c, 'B'), _b);
    LAMPS.add(_a.x, _a.y + h, _a.z, eA ? WHITE : RED, 40 * M);
    LAMPS.add(_b.x, _b.y + h, _b.z, eA ? RED : WHITE, 40 * M);
  });
  LAMPS.flush();
}

// ================================================================== the vehicles
const allNWR = S.allNWR;
const entryOf = new Map(allNWR.map(e => [e.v, e]));
function vrec(v, o = {}){
  const r = {v, L: v.len, rev: !!o.rev, pos: null, cut: null, eng: o.eng || null, diesel: !!o.diesel, name: o.name || v.name || '', spin: 0, dirty: true, vis: true};
  const e = entryOf.get(v); if(e) e.parked = false; else allNWR.push({v, parked: false});
  VEHS.push(r); return r;
}
// an engine (and its tender): returns the engine's record, with .unit the engine and tender in order
function engine(id, o = {}){
  const rec = NWR.byId[id]; if(!rec) return null;
  if(rec._trackEng) return rec._trackEng;
  const vs = NWR.engineUnit ? NWR.engineUnit(rec) : [rec.veh];
  if(o.tag && NWR.tagEngine) NWR.tagEngine(rec);
  const rs = vs.map((v, i) => { const r = vrec(v, {eng: i === 0 && (o.works || rec.cat !== 'Former') ? rec : null, diesel: rec.cat === 'Diesel' || !!(rec.run && rec.run.diesel), name: rec.name}); r.tender = i > 0; return r; });
  rs[0].unit = rs; rs[0].id = id; rec._trackEng = rs[0];
  return rs[0];
}
function stock(key, ctx){
  if(!NWR.STOCK_STD[key]) return null;
  const v = NWR.makeStock(key); v.group.scale.setScalar(M); scene.add(v.group);
  if(NWR.tagStock) NWR.tagStock(v, ctx);
  return vrec(v, {name: NWR.STOCK_STD[key].name});
}

// ================================================================== laying out sidings and loops
const roadEnd = (name, which) => { const segs = BYNAME.get(name) || []; const xs = segs.flatMap(s => [s.xs[0], s.xs[s.xs.length - 1]]); return which === 'up' ? Math.max(...xs) : Math.min(...xs); };
const deadUp = name => (BYNAME.get(name) || []).some(s => !s.node[1]);
const bufX = name => deadUp(name) ? roadEnd(name, 'up') - 1.5 : roadEnd(name, 'down') + 1.5;
const ZONES = [];                                          // stretches of line left alone (Knapford's yards, Tidmouth Sheds)
function score(line, xa, xb, lat, base){
  let bad = 0; const L = LEN(line);
  for(let x = xa; x <= xb; x += 6){
    const l = lat(x), b0 = base(x); if(Math.abs(l - b0) < 3.5) continue;
    const p = linePoint(line, x, l, new V3()), ty = linePoint(line, x, b0, new V3()).y, h = heightAt(p.x, p.z);
    if(h < 0.4 * M) bad += 5;
    if(Math.abs(h + 0.55 * M - ty) > 2.4 * M) bad += 2;
    if(K.nearTrack(p.x, p.z, 3.4 * M)) bad += 4;
    if(nearRoad(p, 3.6) < 3.6) bad += 6;                  // another road of ours
    if(S.taken.some(t => (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < t.r * t.r)) bad += 3;
    if(inTunnel(line, x / L)) bad += 6;
    if(ZONES.some(z => z.line === line && x > z.a && x < z.b)) bad += 8;
  }
  return bad;
}
function reserveGround(line, xa, xb, lat){
  for(let x = xa; x <= xb; x += 8){ const p = linePoint(line, x, lat(x), new V3()); S.taken.push({x: p.x, z: p.z, r: 5 * M}); }
}
// A siding off a road: it runs back from its points (dir) towards x0, on one side, len metres of straight.
// Returns {name, toe, endX, serves} or null; serves is the direction of travel that can work it.
function siding(line, name, base, x0, offs, o = {}){
  const len = o.len || 78, ramp = o.ramp || 32, sides = o.sides || [1, -1], Ws = o.W || [5, 6.5];
  let best = null;
  for(const toeOff of offs) for(const side of sides) for(const W of Ws){
    const dir = o.dir || -Math.sign(toeOff), toe = x0 + toeOff, endX = toe + dir * (len + ramp);
    const b = base(side), lat = x => b(x) + side * W * smooth(0, ramp, (x - toe) * dir);
    if(Math.min(toe, endX) < (o.min === undefined ? 200 : o.min) || Math.max(toe, endX) > LEN(line) - (o.max === undefined ? 400 : o.max)) continue;
    const sc = score(line, Math.min(toe, endX), Math.max(toe, endX), lat, b) + Math.abs(toeOff) * 0.002;
    if(!best || sc < best.sc) best = {sc, toe, endX, lat, side, dir, b};
  }
  if(!best || best.sc > (o.tol || 6)) return null;
  road(line, name, best.toe, best.endX, best.lat, {place: o.place, base: best.b});
  reserveGround(line, Math.min(best.toe, best.endX), Math.max(best.toe, best.endX), best.lat);
  return {name, toe: best.toe, endX: best.endX, serves: -best.dir, side: best.side};
}
// a loop beside a road, joined to it at both ends
function sideLoop(line, name, base, xa, xb, o = {}){
  let best = null;
  for(const side of (o.sides || [1, -1])) for(const sh of (o.shifts || [0, 60, -60, 120])){
    const a = xa + sh, b = xb + sh; if(a < 1 || b > LEN(line) - 1) continue;
    const bl = base(side), lat = x => bl(x) + side * 4.6 * smooth(a, a + 40, x) * (1 - smooth(b - 40, b, x));
    const sc = score(line, a, b, lat, bl) + Math.abs(sh) * 0.005;
    if(!best || sc < best.sc) best = {sc, a, b, lat, side, bl, sh};
  }
  if(!best || best.sc > (o.tol || 6)) return null;
  road(line, name, best.a, best.b, best.lat, {place: o.place, base: best.bl, vmax: o.vmax});
  reserveGround(line, best.a, best.b, best.lat);
  return {name, a: best.a, b: best.b, side: best.side, sh: best.sh};
}
// a curve from the end of one road onto another, leaving and joining each along its own line
function bezierPts(P, tP, Q, tQ){
  const k = P.distanceTo(Q) * 0.42, B1 = P.clone().addScaledVector(tP, k), B2 = Q.clone().addScaledVector(tQ, -k);
  const n = Math.max(8, Math.ceil(P.distanceTo(Q) / M / 1.5)), out = [];
  for(let i = 0; i <= n; i++){
    const t = i / n, u = 1 - t, p = new V3(
      u * u * u * P.x + 3 * u * u * t * B1.x + 3 * u * t * t * B2.x + t * t * t * Q.x, 0,
      u * u * u * P.z + 3 * u * u * t * B1.z + 3 * u * t * t * B2.z + t * t * t * Q.z);
    p.y = P.y + (Q.y - P.y) * smooth(0, 1, t);
    out.push(p);
  }
  return out;
}
// The junction from a branch's end onto another road: the curve leaves the branch the way it is heading
// and joins the other road tangentially some way along, onto the road for that direction of travel. On a
// double line (both) a second curve crosses that road on the level to the other one, for trains coming
// the other way into the branch.
function junction(name, fromDef, atStart, toDefs, o = {}){
  const L = fromDef.line, x0 = atStart ? fromDef.xa : fromDef.xb;
  const P = linePoint(L, x0, fromDef.lat(x0), new V3()), tOut = lineDir(L, x0, new V3()).multiplyScalar(atStart ? -1 : 1);
  const tl = toDefs[0].line, q = toLine(tl, P, o.near || 0, o.span || 1500);
  const dirAt = lineDir(tl, q.x, new V3()), s = Math.sign(tOut.dot(dirAt)) || 1;
  const toDef = toDefs.length > 1 ? (s > 0 ? toDefs[0] : toDefs[1]) : toDefs[0];
  const avoid = o.avoid || [];
  let best = null;
  for(const along of [70, 110, 150, 200, 260]){
    const xq = q.x + s * Math.max(along, q.d * 1.6);
    if(xq < toDef.xa + 5 || xq > toDef.xb - 5 || xq + s * 40 < toDef.xa + 5 || xq + s * 40 > toDef.xb - 5) continue;
    const clash = avoid.reduce((m, ax) => Math.min(m, Math.abs(ax - xq), Math.abs(ax - xq - s * 40)), Infinity);
    if(!best || (clash > 30 && best.clash <= 30) || (clash > 30) === (best.clash > 30) && along < best.along) best = {xq, along, clash};
  }
  if(!best) return [];
  const mk = (def, nm, xq) => {
    const Q = linePoint(tl, xq, def.lat(xq), new V3()), tQ = lineDir(tl, xq, new V3()).multiplyScalar(s);
    return path(tl, nm, bezierPts(P, tOut, Q, tQ), {on: {def, x: xq}, vmax: o.vmax || 7, place: o.place});
  };
  const out = [mk(toDef, name, best.xq)];
  if(o.both && toDefs.length > 1) out.push(mk(toDef === toDefs[0] ? toDefs[1] : toDefs[0], name + '_x', best.xq + s * 40));
  return out;
}

// ================================================================== the Ffarquhar branch
const dF = d => Lm - d;                                    // Ffarquhar: d metres back from the buffers
OWNER = 'ffarquhar';
const LFmain = road(LF, 'main', 0.4, Lm - 2.5, flat(0), {main: true});
// Knapford: bay road 5 with Thomas's run-round loop (road 6) beside it
road(LF, 'kLoop', 24, 178, loop(24, 178, 4.6, 28, 28), {place: 'Knapford'});
// Ffarquhar: loop, goods siding through the goods shed, and the yard ladder (the last road is the stone siding)
road(LF, 'fLoop', dF(182), dF(26), loop(dF(182), dF(26), 4.6, 28, 28), {place: 'Ffarquhar'});
road(LF, 'fGoods', dF(218), dF(104), turnout(0, dF(218), 1, 50, -13), {place: 'Ffarquhar goods yard'});
road(LF, 'fLadder', dF(305), dF(100), turnout(0, dF(305), 1, 34, 12), {place: 'Ffarquhar Yards'});
const ladderRoad = (name, toe, to, rampEnd, endD, place) => road(LF, name, dF(toe), dF(endD), turnout(12, dF(toe), 1, toe - rampEnd, to), {place});
ladderRoad('fCoal', 262, 44.5, 207, 150, 'the coal road at Ffarquhar');
ladderRoad('fCar2', 248, 38.2, 195, 98, 'the carriage shed at Ffarquhar');
ladderRoad('fCar1', 234, 33.8, 188, 98, 'the carriage shed at Ffarquhar');
ladderRoad('fShed2', 220, 21.6, 190, 150, 'Ffarquhar engine shed');
ladderRoad('fShed1', 208, 17, 182, 150, 'Ffarquhar engine shed');
const lfBase = () => flat(0);
const BR = {line: LF, own: 'ffarquhar', road: () => 'main', sid: {}, stations: LF.stops.map(k => STATIONS[k].name).filter(n => n !== 'Knapford' && n !== 'Ffarquhar').map(n => ({name: n, x: K.lineU(LF, n) * Lm}))};
BR.stations.forEach(st => {
  const s = siding(LF, 'g_' + st.name, lfBase, st.x, [125, 140, 160, -125, -140, -160], {place: `the goods siding at ${st.name}`});
  if(s) BR.sid[st.name] = {[s.serves]: s.name};
});
const kx = siding(LF, 'kExchange', lfBase, 0, [330, 380, 450, 540, 640], {place: 'the exchange siding outside Knapford'});

// ================================================================== the Main Line
OWNER = 'main';
const KX = KNAP.line ? KNAP.u0 * LmM : -1e9;
const upLat = x => KNAP.line && Math.abs(x - KX) < 400 ? KNAP.mainX('up', x - KX) : MAIN_LANE;
const downLat = x => KNAP.line && Math.abs(x - KX) < 400 ? KNAP.mainX('down', x - KX) : -MAIN_LANE;
const mBase = side => side > 0 ? upLat : downLat;
const MS = LM.stops.map(k => ({name: STATIONS[k].name, x: K.lineU(LM, STATIONS[k].name) * LmM}));
MS.find(s => s.name === 'Tidmouth').x = 0; MS.find(s => s.name === 'Barrow-in-Furness').x = LmM;
const nearStation = x => MS.some(s => Math.abs(s.x - x) < 1100);
const MLup = road(LM, 'up', 0, LmM - 2, upLat, {main: true, dir: 1, noDraw: true, vline: 99, vstation: 13, blocks: 3200, noBlock: nearStation});
const MLdown = road(LM, 'down', 0, LmM - 2, downLat, {main: true, dir: -1, noDraw: true, vline: 99, vstation: 13, blocks: 3200, noBlock: nearStation});
const xover = (name, a, b, from, to, o = {}) => road(LM, name, a, b, x => from(x) + (to(x) - from(x)) * smooth(a, b, x), {vmax: 8, ...o});
const scissors = (tag, a, b) => { xover(tag + 'a', a, b, upLat, downLat); xover(tag + 'b', a, b, downLat, upLat); };
const ML = {line: LM, own: 'main', road: d => d > 0 ? 'up' : 'down', sid: {}, loops: {}, stations: MS.filter(s => s.x > 10 && s.x < LmM - 10)};
ZONES.push({line: LM, a: 0, b: 480}, {line: LM, a: KX - 430, b: KX + 430});

// the main-line trains and the stations where they turn back
const MAIN_IDS = ['gordon', 'rebecca', 'henry', 'james', 'murdoch', 'nia'].filter(id => NWR.RUNS[id] && NWR.byId[id] && NWR.byId[id].runner);
const BASE_OF = {nia: 'Wellsworth'};                       // Nia is based at Wellsworth Sheds
const TURN_OF = {nia: 'Knapford'};                         // and turns her goods back at Knapford, clear of the expresses at Tidmouth
const REV = new Set(['Tidmouth', 'Barrow-in-Furness']);
MAIN_IDS.forEach(id => { REV.add(BASE_OF[id] || NWR.RUNS[id].from); REV.add(TURN_OF[id] || (BASE_OF[id] === NWR.RUNS[id].to ? NWR.RUNS[id].from : NWR.RUNS[id].to)); });
// Tidmouth and Barrow: scissors crossovers to release engines and at the throat
scissors('xTid1', 44, 76); scissors('xTid2', 262, 300);
scissors('xBar1', LmM - 76, LmM - 44); scissors('xBar2', LmM - 300, LmM - 262);
// Knapford: the crossovers in both throats (drawn by knapford.js) and Henry's road 1 beside the down road
if(KNAP.line){
  xover('xKnapN', KX - 245, KX - 205, upLat, downLat, {noDraw: true});
  xover('xKnapS', KX + 205, KX + 245, downLat, upLat, {noDraw: true});
  ML.loops.Knapford = [{name: 'kRoad1', road: 'down'}];
  road(LM, 'kRoad1', KX - 120, KX + 120, x => downLat(x) - 4.6 * smooth(KX - 120, KX - 88, x) * (1 - smooth(KX + 88, KX + 120, x)), {place: 'Knapford', vmax: 6, base: downLat});
  // the branch joins the Main Line in Knapford's south throat, from road 5 across to the up road
  const p = linePoint(LF, 183, 0, new V3()), q = toLine(LM, p, KX + 95, 60), xe = KX + 175;
  road(LM, 'kLink', q.x, xe, x => q.lat + (upLat(x) - q.lat) * smooth(q.x, xe, x), {vmax: 6, on: {def: LFmain, x: 183}, place: 'Knapford'});
}
// the other stations where trains turn back: scissors crossovers either side of the platforms, and a loop off each road
MS.forEach(st => {
  if(!REV.has(st.name) || st.name === 'Knapford' || st.x < 10 || st.x > LmM - 10) return;
  scissors('xS_' + st.name, st.x - 140, st.x - 100); scissors('xN_' + st.name, st.x + 100, st.x + 140);
  ML.loops[st.name] = [];
  [[1, 'up'], [-1, 'down']].forEach(([side, r]) => {
    const nm = `loop${side > 0 ? 'U' : 'D'}_${st.name}`, o = {place: `the loop at ${st.name}`, sides: [side]};
    const lp = sideLoop(LM, nm, mBase, st.x + 190, st.x + 520, o) || sideLoop(LM, nm, mBase, st.x - 520, st.x - 190, o);
    if(lp) ML.loops[st.name].push({name: lp.name, road: r});
  });
});
// a goods siding on each road at the other stations, trailing for trains on that road
ML.stations.forEach(st => {
  if(REV.has(st.name)) return;
  ML.sid[st.name] = {};
  [1, -1].forEach(d => {
    const s = siding(LM, `g${d > 0 ? 'U' : 'D'}_${st.name}`, mBase, st.x, [150, 175, 200, 240].map(o => o * d), {sides: [d], dir: -d, place: `the goods siding at ${st.name}`});
    if(s) ML.sid[st.name][d] = s.name;
  });
});
// The Steam Team hand over to the Tidmouth Sheds crew where the crew's path starts, on the up road south of
// the sheds; a crossover just beyond lets engines from the south step across to it.
const IN = K.roundhouse && K.roundhouse.inPath;
let HAND = null;
if(IN && IN.length > 4){
  const q = toLine(LM, IN[0], 750, 600);
  if(Math.abs(q.lat - MAIN_LANE) < 0.6){ HAND = {k: 0, x: q.x + 1}; xover('xHand', HAND.x + 120, HAND.x + 160, upLat, downLat); }
}
// base sidings for each main-line train: a road for each of its trains and one for each engine
const MAIN = {};
MAIN_IDS.forEach(id => {
  const run = NWR.RUNS[id], dd = (DUT.nwr || {})[id] || {}, A = BASE_OF[id] || run.from, B = TURN_OF[id] || (A === run.from ? run.to : run.from);
  const xA = MS.find(s => s.name === A).x, xB = MS.find(s => s.name === B).x;
  const rakes = ['main', ...Object.keys((DUT.rakes || {})[id] || {})];
  const rota = dd.rota || [id];
  MAIN[id] = {id, A, B, xA, xB, rakes, rota, homes: {}, engHomes: {}};
  const near = [260, 340, 420, 520, 640, 780, 950, 1150, 1400, 1700];
  const offs = xA < 10 ? near.map(o => o + 250) : xA > LmM - 10 ? near.map(o => -o - 250) : near.flatMap(o => [o, -o]);
  const rlen = k => (k === 'main' ? run.consist : ((DUT.rakes || {})[id] || {})[k] || []).length * 20 + 14;
  rakes.forEach(k => { const s = siding(LM, `cs_${id}_${k}`, mBase, xA, offs, {len: Math.min(170, rlen(k)), place: `the carriage sidings at ${A}`, tol: 9}); if(s) MAIN[id].homes[k] = s.name; });
  rota.forEach(e => { const s = siding(LM, `es_${id}_${e}`, mBase, xA, offs, {len: 30, ramp: 26, place: `the engine siding at ${A}`, tol: 9}); if(s) MAIN[id].engHomes[e] = s.name; });
});

// ================================================================== the other branches
// Each standard-gauge branch: its own road the length of the line, a terminal for each train at each end
// of its run (a run-round loop with an engine release road beyond, all its own), goods sidings at the
// stations between, carriage and engine sidings where the train is based, and junctions where it meets
// the Main Line or another branch.
const BRANCH_IDS = Object.keys(NWR.RUNS).filter(id => { const r = NWR.RUNS[id], l = LINES[r.line]; return l && l.real && l.kind === 'standard' && r.line !== 'main' && r.line !== 'ffarquhar' && NWR.byId[id] && NWR.byId[id].runner; });
const TRIM = {ffquarry: [260, 0]};                         // the tramroad starts beyond Ffarquhar's yard
const LINES_B = {};                                        // line id -> {def, LC, stations}
// Tidmouth: the Little Western and Callandale lines leave the north end of the station side by side, from
// the up and down roads, until they part; they are kept at least 4.4 m apart all the way.
let TRUNK = null;
function trunkLats(){
  if(TRUNK) return TRUNK;
  const LW = LINES.littlewest, CL = LINES.callandale;
  let xDiv = 0;
  for(let x = 0; x < Math.min(LEN(LW), 6000); x += 25){ const p = linePoint(LW, x, 0, new V3()), q = toLine(CL, p, x, 200); if(q.d > 8){ xDiv = x; break; } }
  const off = xDiv > 300 ? 2.3 : 0;
  const base = (s, x) => s * (MAIN_LANE * (1 - smooth(0, 120, x)) + off * smooth(0, 120, x) * (1 - smooth(xDiv - 200, xDiv, x)));
  const N = Math.max(2, Math.ceil(xDiv / 10) + 1), push = new Float32Array(N + 1), sm = new Float32Array(N + 1);
  for(let i = 0; i <= N; i++){
    const x = i * 10, a = linePoint(LW, x, base(-1, x), new V3()), q = toLine(CL, a, x, 80);
    push[i] = Math.max(0, 4.4 - (base(1, q.x) - q.lat)) / 2;      // the Callandale road lies to the left of the Little Western one
  }
  for(let i = 0; i <= N; i++){ let m = 0; for(let k = -8; k <= 8; k++){ const j = i + k; if(j >= 0 && j <= N) m = Math.max(m, push[j]); } sm[i] = m; }
  const P = x => { if(x <= 0 || x >= N * 10) return 0; const i = Math.min(N - 1, Math.floor(x / 10)), t = x / 10 - i; return (sm[i] * (1 - t) + sm[i + 1] * t) * smooth(0, 40, x); };
  return TRUNK = {littlewest: x => base(-1, x) - P(x), callandale: x => base(1, x) + P(x)};
}
const bLine = id => {
  if(LINES_B[id]) return LINES_B[id];
  const line = LINES[id], Ll = LEN(line), tr = (TRIM[id] || [0, 0]).slice();
  const trunk = (id === 'littlewest' || id === 'callandale') && LINES.littlewest && LINES.callandale;
  const lat = trunk ? trunkLats()[id] : flat(0);
  // Where a branch shares its formation with another line near either end (it leaves from the other line's
  // station, or runs beside it for a while), its own road begins only where it has parted from it.
  const shared = x => nearRoad(linePoint(line, x, lat(x), _q2), 4.2, d => d.line === line) < 4.2;
  if(!trunk){ let last = -1; for(let x = tr[0]; x < Math.min(Ll - tr[1], tr[0] + 9000); x += 5){ if(shared(x)) last = x; else if(x - Math.max(last, tr[0]) > 1500) break; } if(last >= 0) tr[0] = Math.max(tr[0], last + 25); }
  { let last = -1; for(let x = Ll - tr[1]; x > Math.max(tr[0], Ll - tr[1] - 9000); x -= 5){ if(shared(x)) last = x; else if((last < 0 ? Ll - tr[1] : last) - x > 1500) break; } if(last >= 0) tr[1] = Math.max(tr[1], Ll - last + 25); }
  if(Ll - tr[1] - tr[0] < 600) tr.splice(0, 2, ...(TRIM[id] || [0, 0]));       // too little left: keep the whole line
  OWNER = id;
  const def = road(line, id, tr[0], Ll - tr[1], lat, {main: true, vline: 99, vstation: 10, place: ''});
  OWNER = 'main';
  const stations = (line.stops || []).map(k => STATIONS[k] && STATIONS[k].name).filter(Boolean).map(n => ({name: n, x: K.lineU(line, n) * Ll}));
  return LINES_B[id] = {id, line, Ll, def, lat, tr, stations, LC: {line, own: id, road: () => id, sid: {}, stations}};
};
BRANCH_IDS.forEach(id => bLine(NWR.RUNS[id].line));       // every branch's road first, so that terminals and sidings keep clear of them all
const BRANCH = {};
BRANCH_IDS.forEach(id => {
  const run = NWR.RUNS[id], rec = NWR.byId[id], B = bLine(run.line), Ll = B.Ll, R = rec.runner;
  OWNER = run.line;
  const xOf = (name, u) => { if(name){ const st = B.stations.find(s => s.name === name); if(st) return st.x; } return u * Ll; };
  let xA = xOf(run.from, run.fromU || 0), xB = xOf(run.to, run.toU === undefined ? 1 : run.toU);
  const tr = B.tr;
  // a station within 150 m of the end of the line is at the end of the line
  const snap = x => x < tr[0] + 150 ? tr[0] : x > Ll - tr[1] - 150 ? Ll - tr[1] : x;
  xA = snap(xA); xB = snap(xB);
  const d = Math.sign(xB - xA) || 1, rakeKeys = run.consist.length ? ['main', ...Object.keys((DUT.rakes || {})[id] || {})] : [];
  const pp = !R.runRound || !run.consist.length;           // pushes and pulls (or is a railcar): no running round
  const trainL = Math.max(30, run.consist.length * 10 + 22);
  const cfg = {id, line: B.line, B, xA, xB, d, pp, terms: {}, homes: {}, engHomes: {}, rakes: rakeKeys};
  const nameOf = x => { const st = B.stations.reduce((m, s) => !m || Math.abs(s.x - x) < Math.abs(m.x - x) ? s : m, null); return st && Math.abs(st.x - x) < 400 ? st.name : (B.line.name || run.line); };
  [[xA, d, 'A'], [xB, -d, 'B']].forEach(([E, w, k]) => {
    const tname = nameOf(E), base = x => B.lat(x);
    if(pp){ cfg.terms[k] = {name: tname, x: E, end: 'term', stop: E + w * 12, roads: [], w}; return; }
    const Lloop = Math.max(150, trainL + 90);
    let best = null;
    for(const shift of [0, 60, 140, 260, 420]) for(const side of [1, -1]){
      const a0 = E + w * (34 + shift), b0 = E + w * (34 + shift + Lloop), xa = Math.min(a0, b0), xb = Math.max(a0, b0);
      if(xa < tr[0] + 1 || xb > Ll - tr[1] - 1) continue;
      const lat = x => base(x) + side * 4.6 * smooth(xa, xa + 28, x) * (1 - smooth(xb - 28, xb, x));
      const sc = score(B.line, xa, xb, lat, base) + shift * 0.012;
      if(!best || sc < best.sc) best = {sc, xa, xb, lat, shift, side};
    }
    if(best){
      const nm = `t_${id}_${k}`;
      road(B.line, nm, best.xa, best.xb, best.lat, {place: tname, base, vmax: 5});
      reserveGround(B.line, best.xa, best.xb, best.lat);
      cfg.terms[k] = {name: tname, x: E, end: 'term', stop: E + w * (64 + best.shift), roads: [], loop: nm, w, side: best.side, la: best.xa, lb: best.xb};
    } else cfg.terms[k] = {name: tname, x: E, end: 'term', stop: E + w * 64, roads: [], w};
  });
  // carriage and engine sidings where the train is based, inward of its terminal
  const ldA = cfg.terms.A, inner = Math.abs(ldA.stop - xA) + trainL + 60;
  const offs = [0, 80, 160, 260, 380, 520, 700, 900].map(o => d * (inner + o));
  const base = side => x => B.lat(x);
  const rlen = k => (k === 'main' ? run.consist : ((DUT.rakes || {})[id] || {})[k] || []).length * 11 + 16;
  rakeKeys.forEach(k => { const s = siding(B.line, `cs_${id}_${k}`, base, xA, offs, {len: Math.min(140, rlen(k)), place: `the sidings at ${ldA.name}`, tol: 10, min: 20, max: 20}); if(s) cfg.homes[k] = s.name; });
  ((DUT.nwr[id] || {}).rota || [id]).forEach(e => { const s = siding(B.line, `es_${id}_${e}`, base, xA, offs, {len: 30, ramp: 26, place: `the engine shed at ${ldA.name}`, tol: 10, min: 20, max: 20}); if(s) cfg.engHomes[e] = s.name; });
  // goods sidings at the stations on the way
  B.stations.forEach(st => {
    if((st.x - xA) * d < 300 || (xB - st.x) * d < 300 || B.LC.sid[st.name]) return;
    const s = siding(B.line, `g_${run.line}_${st.name}`, base, st.x, [125, 140, 160, -125, -140, -160], {place: `the goods siding at ${st.name}`, min: 60, max: 60});
    if(s) B.LC.sid[st.name] = {[s.serves]: s.name};
  });
  BRANCH[id] = cfg;
  OWNER = 'main';
});
// junctions: each branch end that meets the Main Line or another branch
const JUNCTIONS = [];
(function(){
  const MAIN_NODES = DEFS.filter(d => d.line === LM && d.kind === 'line' && d !== MLup && d !== MLdown).flatMap(d => [d.xa, d.xb]);
  Object.values(LINES_B).forEach(B => [true, false].forEach(atStart => {
    if((B.id === 'littlewest' || B.id === 'callandale') && atStart) return;          // joined at Tidmouth already
    if(B.id === 'harbour' || B.id === 'ffquarry') return;                              // the harbour crosses Knapford's throat; the tramroad stands alone
    const x0 = atStart ? B.def.xa : B.def.xb, P = linePoint(B.line, x0, B.def.lat(x0), new V3());
    OWNER = B.id;                                          // a junction belongs to its branch
    // joined end to end with another branch? then the roads meet there already
    const endToEnd = Object.values(LINES_B).some(O => O !== B && [O.def.xa, O.def.xb].some(x => linePoint(O.line, x, O.def.lat(x), _q2).distanceTo(P) < 0.3 * M));
    if(endToEnd && !(B.id === 'rescue' && atStart)) return;
    // the Main Line
    const qm = toLine(LM, P, 0, LmM);
    if(qm.d < 90){
      const st = MS.reduce((m, s) => !m || Math.abs(s.x - qm.x) < Math.abs(m.x - qm.x) ? s : m, null);
      JUNCTIONS.push(...junction(`j_${B.id}_${atStart ? 'start' : 'end'}`, B.def, atStart, [MLup, MLdown], {near: qm.x, span: 300, avoid: MAIN_NODES, both: true, place: `the junction at ${st ? st.name : 'the Main Line'}`}));
      return;
    }
    // another branch
    let best = null;
    Object.values(LINES_B).forEach(O => { if(O === B) return; const q = toLine(O.line, P, LEN(O.line) / 2, LEN(O.line) / 2 + 50); if(q.d < 60 && (!best || q.d < best.q.d)) best = {O, q}; });
    if(best) JUNCTIONS.push(...junction(`j_${B.id}_${atStart ? 'start' : 'end'}`, B.def, atStart, [best.O.def], {near: best.q.x, span: 300, place: `the junction with the ${(best.O.line.name || best.O.id).replace(/^The /, '')}`}));
  }));
  OWNER = 'main';
})();

buildNetwork();
SEGS.forEach(s => { if(!BYNAME.has(s.name)) BYNAME.set(s.name, []); BYNAME.get(s.name).push(s); });
const nConf = findConflicts();
SEGS.forEach(drawSeg);
SEGS.forEach(seg => [0, 1].forEach(end => { if(!seg.node[end] && !(seg.line === LF && seg.main && ((end === 0 && seg.xs[0] < 2) || (end === 1 && seg.xs[seg.xs.length - 1] > Lm - 3)))) bufferAt(seg, end); }));
NODES.forEach(n => { if(n.grp[0].length > 1 || n.grp[1].length > 1) leverAt(n); });
SEGS.forEach(seg => { if(seg.main) return; for(let i = 0; i < seg.pts.length; i += 4){ const p = seg.pts[i]; K.clearArea(p.x, p.z, 6 * M); } });
// block and home signals along the Main Line, on the driver's side, at the entrance to each section
['up', 'down'].forEach(name => {
  const f = name === 'up' ? 1 : -1, segs = (BYNAME.get(name) || []).slice().sort((a, b) => (a.xs[0] - b.xs[0]) * f);
  segs.forEach((seg, i) => {
    const prev = segs[i - 1]; if(!prev) return;
    if(!(seg.len > 700 || prev.len > 700)) return;
    const x = f > 0 ? seg.xs[0] : seg.xs[seg.xs.length - 1];
    if(x < 30 || x > LmM - 30) return;
    signalAt(name, x - f * 6, f, f, seg);
  });
});
if(K.trees && K.trees.invalidate) K.trees.invalidate();
// little engine sheds over the engine sidings
const SHED_WALL = K.mat(0x8a4a32, 0.85), SHED_ROOF = K.mat(0x3a3f46, 0.75);
function shedOver(name){
  const segs = BYNAME.get(name); if(!segs) return;
  const up = deadUp(name), x1 = bufX(name), x0 = x1 + (up ? -24 : 24), a = at(name, x1), b = at(name, x0); if(!a || !b) return;
  const pa = pointAt(a, new V3()), pb = pointAt(b, new V3()), c = pa.clone().add(pb).multiplyScalar(0.5), l = pa.distanceTo(pb) / M;
  const g = new THREE.Group(); g.position.set(c.x, Math.min(pa.y, pb.y), c.z); g.rotation.y = Math.atan2(pa.x - pb.x, pa.z - pb.z); g.scale.setScalar(M);
  for(const e of [-1, 1]) K.box(g, 0.4, 5.6, l, SHED_WALL, e * 2.9, 2.8, 0);
  K.box(g, 6.2, 5.6, 0.4, SHED_WALL, 0, 2.8, l / 2);
  K.box(g, 6.2, 1.1, 0.4, SHED_WALL, 0, 5.05, -l / 2);
  S.gable(g, 6.8, l + 0.6, 5.6, SHED_ROOF, 0, 0);
  TRACK_G.add(g);
}
// a plain platform beside each branch terminal, on the side away from its run-round loop
const PLAT = K.mat(0xb8b4aa, 0.85), PLAT_FACE = K.mat(0x9a4a32, 0.85);
function platformBy(name, x0, x1, side){
  if(!BYNAME.get(name)) return;
  for(let x = Math.min(x0, x1); x < Math.max(x0, x1) - 1; x += 10){
    const a = at(name, x), b = at(name, Math.min(x + 10, Math.max(x0, x1))); if(!a || !b) continue;
    const pa = pointAt(a, new V3()), pb = pointAt(b, new V3()), t = pb.clone().sub(pa); t.y = 0; const l = t.length() / M; if(l < 1) continue; t.normalize();
    const n = new V3(t.z, 0, -t.x), c = pa.clone().add(pb).multiplyScalar(0.5).addScaledVector(n, side * 3.3 * M);
    const h = heightAt(c.x, c.z); if(h < 0.3 * M) continue;
    if(nearRoad(c, 3.4, d => d.name === name) < 3.4) continue;          // a siding or loop runs there
    const g = new THREE.Group(); g.position.copy(c); g.rotation.y = Math.atan2(t.x, t.z); g.scale.setScalar(M);
    K.box(g, 3, 0.9, l + 0.1, PLAT_FACE, 0, 0.0, 0); K.box(g, 3.2, 0.12, l + 0.1, PLAT, 0, 0.5, 0);
    TRACK_G.add(g);
  }
}

// ================================================================== stopping places and termini
const KNAP_STOP = 54, FFAR_STOP = dF(56);                  // the engine's buffers, arriving at either end of the Ffarquhar branch
const TID_STOP = 112, BAR_STOP = LmM - 112;
function terminus(LC, name){
  let T;
  if(LC.line === LF) T = name === 'Knapford' ? {name, x: 88, end: 'low', stop: KNAP_STOP} : {name, x: Lm, end: 'high', stop: FFAR_STOP};
  else if(name === 'Tidmouth') T = {name, x: 0, end: 'low', stop: TID_STOP};
  else if(name === 'Barrow-in-Furness') T = {name, x: LmM, end: 'high', stop: BAR_STOP};
  else T = {name, x: MS.find(s => s.name === name).x, end: null};
  // the roads a train can stand on there: both main roads, and the loops off them
  T.roads = [];
  if(LC.line === LM){
    const span = T.end === 'low' ? [2, 300] : T.end === 'high' ? [LmM - 300, LmM - 2] : name === 'Knapford' ? [T.x - 200, T.x + 200] : [T.x - 140, T.x + 140];
    ['up', 'down'].forEach(r => T.roads.push({name: r, a: span[0], b: span[1], kind: 'platform'}));
    (ML.loops[name] || []).forEach(lp => { if(BYNAME.get(lp.name)) T.roads.push({name: lp.name, a: roadEnd(lp.name, 'down'), b: roadEnd(lp.name, 'up'), kind: 'loop', road: lp.road}); });
  }
  return T;
}
// is a stretch of road clear of everything but this cut?
function clear(name, a, b, mine){
  const occ = occupancy();
  return !(BYNAME.get(name) || []).some(seg => {
    const x0 = seg.xs[0], x1 = seg.xs[seg.xs.length - 1]; if(x1 < a || x0 > b) return false;
    if(seg.res && seg.res.alive && seg.res.c !== mine) return true;
    return (occ.get(seg) || []).some(q => { if(q.cut === mine) return false; const xa = x0 + (q.a / seg.len) * (x1 - x0), xb = x0 + (q.b / seg.len) * (x1 - x0); return xb > a && xa < b; });
  });
}
// where to stand at a terminus: a free road, keeping another free for running round. Returns {name, x} for
// the leading end (arriving) or the far end (setting out), or null to wait.
function standAt(D, T, dir, L, mine, departing){
  if(!T.roads.length) return {name: D.LC.road(dir), x: T.end ? T.stop : (departing ? T.x - dir * L / 2 : T.x + dir * L / 2)};
  // at a through station a terminating train goes into the loop, clear of the through roads; at the end of the line, the platforms
  const order = T.end ? ['platform', 'loop'] : ['loop', 'platform'];
  const cands = [];
  order.forEach(kind => T.roads.filter(r => r.kind === kind).sort((a, b) => (a.name === D.LC.road(dir) ? -1 : 0) - (b.name === D.LC.road(dir) ? -1 : 0)).forEach(r => cands.push(r)));
  const claimed = name => DUTIES.some(o => o !== D && o.claim === T.name + ':' + name);
  const free = T.roads.filter(r => clear(r.name, r.a, r.b, mine) && !claimed(r.name));
  const rr = busy(T.name, D);
  for(const r of cands){
    if(!free.includes(r)) continue;
    if(rr && r.kind === 'platform') continue;
    // an arriving train must leave the engine a way round it: the other platform road, beside it
    if(!departing && r.kind === 'platform' && !free.some(o => o !== r && o.kind === 'platform')) continue;
    if(r.kind === 'loop'){
      if(r.b - r.a - 90 < L || r.road !== D.LC.road(dir)) continue;          // the loop off the road it is on
      return {name: r.name, x: departing ? (dir > 0 ? r.a + 45 : r.b - 45) : (dir > 0 ? r.b - 45 : r.a + 45)};
    }
    return {name: r.name, x: departing ? (T.end ? T.stop : T.x - dir * L / 2) : (T.end ? T.stop : T.x + dir * L / 2)};
  }
  return null;
}

// ================================================================== the stock
const ctxY = {home: {label: 'Ffarquhar Yards'}};
function wagonsIn(name, keys, ctx){
  const vs = keys.map(k => stock(k, ctx)).filter(Boolean); if(!vs.length || !BYNAME.get(name)) return null;
  const c = newCut(vs), up = deadUp(name), p = at(name, up ? bufX(name) : bufX(name) + cutLen(c));
  if(p) layCut(c, p);
  return c;
}
// a cut on a road with its A end at x, facing up the line (or down)
function lay(vs, name, x, f = 1){ const c = newCut(vs), p = at(name, x); if(p) layCut(c, f > 0 ? p : flip(p)); return c; }
// put a cut away at a road's buffers (or up to what stands there)
function layHome(vs, name){
  const c = newCut(vs);
  if(!name || !BYNAME.get(name)) return c;
  const up = deadUp(name), L = cutLen(c), p = at(name, up ? bufX(name) : bufX(name) + L);
  if(p) layCut(c, p);
  return c;
}
function runnerStock(rec){
  const R = rec.runner; R.manual = true; R.track = true;
  return R.cars.filter(cv => cv.v && cv.v.key && cv.v.len > 0.5).map(cv => vrec(cv.v, {name: cv.v.name}));
}

// ================================================================== the timetable
function parseShifts(list){ return (list || [['06:00', '20:00', '0']]).map(([on, off, who = '0', days = '1111111']) => ({on: hm(on), off: hm(off), who, days})); }
const whoOn = (s, d) => +s.who[mod(d, s.who.length)];
function onTurn(shifts, t){
  const d = Math.floor(t / 1440), tod = t - d * 1440;
  for(const s of shifts){
    const over = s.off <= s.on; let start;
    if(!over){ if(tod >= s.on && tod < s.off) start = d; else continue; }
    else if(tod >= s.on) start = d; else if(tod < s.off) start = d - 1; else continue;
    if(s.days[mod(start, 7)] !== '1') continue;
    return {idx: whoOn(s, start), s, end: start * 1440 + s.off + (over ? 1440 : 0)};
  }
  return null;
}
function nextTurn(shifts, idx, t){
  let best = null; const d0 = Math.floor(t / 1440);
  for(let d = d0; d < d0 + 15; d++) for(const s of shifts){ const st = d * 1440 + s.on; if(st <= t || s.days[mod(d, 7)] !== '1' || whoOn(s, d) !== idx) continue; if(!best || st < best.t) best = {t: st}; }
  return best;
}
function parseWork(list, goods){ return (list || [['00:00', goods ? 'pickup' : 'stopping', '', 'main']]).map(([t, kind, txt, rake]) => ({t: hm(t), kind, txt: txt || kind, rake: rake || 'main'})).sort((a, b) => a.t - b.t); }
function workAt(W, t){ const tod = mod(t, 1440); let w = W[W.length - 1]; W.forEach(x => { if(x.t <= tod) w = x; }); return w; }
const inHours = (h, t) => { const tod = mod(t, 1440), on = hm(h[0]), off = hm(h[1]); return off > on ? tod >= on && tod < off : tod >= on || tod < off; };
const WORK_KIND = {stopping: {v: 0.92, dwell: 40}, express: {v: 1, dwell: 50}, fast: {v: 1.12, dwell: 35}, market: {v: 0.85, dwell: 110},
  mail: {v: 1, dwell: 120}, pickup: {v: 0.8, dwell: 60}, through: {v: 1.1, dwell: 35}, heavy: {v: 0.75, dwell: 35}};
const STEAM_TEAM = new Set(['thomas', 'gordon', 'james', 'percy', 'emily', 'rebecca', 'nia']);
// A regular-interval timetable: the time for a trip there (running, station stops, shunting at the
// sidings) and for turning round, rounded up to a clockface interval; departures from the base at the
// same minutes past every interval, back from the far end at the booked turn-round time.
function timetable(D){
  const dist = Math.abs(D.B.x - D.A.x), v = D.speed * 0.8;
  const between = D.LC.stations.filter(s => (s.x - D.A.x) * D.d > 30 && (D.B.x - s.x) * D.d > 30);
  const sidings = between.filter(s => D.LC.sid[s.name]).length;
  const goods = !D.passenger;
  D.runMin = Math.ceil(dist / v / 60 + between.length * (goods ? 1 : 1.4) + (goods ? sidings * 7 : 0) + 4);
  D.turnMin = D.pp ? 6 : 16;
  D.interval = Math.max(30, Math.ceil((2 * (D.runMin + D.turnMin) + 4) / 15) * 15);
  D.offset = (hash(D.id) % 6) * 5;
}
function nextDeparture(D, t){
  const day = Math.floor(t / 1440), tod = t - day * 1440;
  const k = Math.max(0, Math.ceil((tod - D.offset) / D.interval));
  const dep = D.offset + k * D.interval;
  return dep < 1440 ? day * 1440 + dep : (day + 1) * 1440 + D.offset;
}

// ================================================================== the duties
const DUTIES = [], BRAKE = /Brake|Toad|Spiteful/;
function makeDuty(o){
  const dd = (DUT.nwr || {})[o.id] || {};
  const D = {id: o.id, name: o.name, LC: o.LC, rota: o.rota, shifts: parseShifts(dd.shifts), work: parseWork((DUT.work || {})[o.id], !o.passenger), note: dd.note || '',
    A: o.termA || terminus(o.LC, o.A), B: o.termB || terminus(o.LC, o.B), rakes: o.rakes, homes: o.homes, engHomes: o.engHomes, coal: o.coal || null,
    speed: o.speed, stopsAt: o.stopsAt || null, passenger: !!o.passenger, runner: o.runner, exchange: o.exchange || {}, label: o.label, pp: !!o.pp,
    doing: 'on shed', rake: null, cur: 0, w: null, faceFixed: o.faceFixed,
    lines: new Set(['main', o.LC.own || 'main'])};
  D.d = Math.sign(D.B.x - D.A.x) || 1;
  D.rakeCut = {}; Object.entries(D.rakes).forEach(([k, r]) => D.rakeCut[k] = r.vs.find(v => BRAKE.test(v.name)) || r.vs[r.vs.length - 1]);
  D.rota.forEach(e => { e.duty = D; });
  timetable(D);
  DUTIES.push(D);
  return D;
}
function rakesFor(id, rec, run, ctx){
  const rakes = {};
  const main = runnerStock(rec);
  if(main.length) rakes.main = {vs: main, label: run.passenger ? 'the coaches' : 'the train'};
  Object.entries((DUT.rakes || {})[id] || {}).forEach(([k, keys]) => { const vs = keys.map(s => stock(s, ctx)).filter(Boolean); if(vs.length) rakes[k] = {vs, label: k === 'local' ? 'the suburban coaches' : `the ${k} train`}; });
  return rakes;
}

// ---- Thomas, Rosie and the Ffarquhar branch stock
const TH = NWR.byId.thomas;
const thomas = engine('thomas'), rosie = engine('rosie');
const [annie, clarabel] = runnerStock(TH);
const ctxT = {rec: TH, run: TH.run};
const tTrucks = ['thomasTruck', 'thomasTruck', 'brakeVan'].map(k => stock(k, ctxT)).filter(Boolean);
const glynn = engine('glynn', {works: true, tag: false});
const coffeepots = ['coffeepot2', 'coffeepot3'].map(id => NWR.byId[id] ? engine(id) : null).filter(Boolean);
makeDuty({id: 'thomas', name: 'Thomas', LC: BR, rota: [thomas].concat(rosie ? [rosie] : []), A: 'Ffarquhar', B: 'Knapford', label: 'the Ffarquhar branch',
  rakes: {main: {vs: [annie, clarabel], label: 'Annie and Clarabel'}, trucks: {vs: tTrucks, label: 'the goods trucks'}},
  homes: {main: 'fCar1', trucks: 'fGoods'}, engHomes: {Thomas: 'fShed1', Rosie: 'fShed2'}, coal: 'fCoal', speed: TH.run.speed || 15,
  passenger: true, runner: TH.runner, exchange: kx ? {Knapford: {name: 'kExchange', dir: 1}} : {}, faceFixed: 1});
// ---- the Main Line trains
MAIN_IDS.forEach(id => {
  const rec = NWR.byId[id], run = NWR.RUNS[id], B = MAIN[id];
  const rota = B.rota.map(r => engine(r)).filter(Boolean);
  const rakes = rakesFor(id, rec, run, {rec, run});
  const anyHome = Object.values(B.homes)[0], anyEng = Object.values(B.engHomes)[0];
  const homes = {}, engHomes = {};
  Object.keys(rakes).forEach(k => homes[k] = B.homes[k] || anyHome);
  rota.forEach(e => engHomes[e.eng.name] = B.engHomes[e.id] || anyEng || anyHome);
  makeDuty({id, name: rec.name, LC: ML, rota, A: B.A, B: B.B, rakes, homes, engHomes, speed: run.speed, stopsAt: run.stopsAt, passenger: !!run.passenger,
    runner: rec.runner, label: `the Main Line, ${B.A} – ${B.B}`});
});
// ---- every other branch train
BRANCH_IDS.forEach(id => {
  const rec = NWR.byId[id], run = NWR.RUNS[id], C = BRANCH[id], dd = (DUT.nwr || {})[id] || {};
  const rota = (dd.rota || [id]).map(r => engine(r)).filter(Boolean);
  if(!rota.length) return;
  const rakes = rakesFor(id, rec, run, {rec, run});
  const homes = {}, engHomes = {}, anyHome = Object.values(C.homes)[0] || C.terms.A.loop || null, anyEng = Object.values(C.engHomes)[0];
  Object.keys(rakes).forEach(k => homes[k] = C.homes[k] || anyHome);
  rota.forEach(e => engHomes[e.eng.name] = C.engHomes[e.id] || anyEng || anyHome);
  const tA = C.terms.A, tB = C.terms.B;
  makeDuty({id, name: rec.name, LC: C.B.LC, rota, termA: tA, termB: tB, rakes, homes, engHomes, speed: run.speed, stopsAt: run.stopsAt, passenger: !!run.passenger,
    runner: rec.runner, pp: C.pp, label: `the ${(LINES[run.line].name || run.line).replace(/^The /, '')}, ${tA.name} – ${tB.name}`});
});
// the platforms and sheds for them
Object.values(BRANCH).forEach(C => ['A', 'B'].forEach(k => { const t = C.terms[k]; if(t && t.loop) platformBy(C.B.id, t.la + 24, t.lb - 24, -(t.side || 1)); }));
DUTIES.forEach(D => Object.values(D.engHomes).forEach(n => { if(n && /^es_/.test(n)) shedOver(n); }));

// ---- lay everything out as it stands at the start
const CUT = {};
CUT.yard1 = wagonsIn('fLadder', ['stoneTruck', 'stoneTruck', 'thomasTruck', 'stoneTruck'], ctxY);
CUT.yard2 = wagonsIn('fCoal', ['truck', 'truckB'], ctxY);
if(coffeepots.length) CUT.museum = layHome(coffeepots.flatMap(e => e.unit), 'fCar2');
if(glynn) lay(glynn.unit, 'fCar2', bufX('fCar2') - (CUT.museum ? cutLen(CUT.museum) + 4 : 0));
let wi = 0;
Object.values(BR.sid).forEach(m => Object.values(m).forEach(name => { if(wi++ % 2 === 0) wagonsIn(name, [wi % 4 ? 'truck' : 'vanGrey'], ctxY); }));
if(kx) wagonsIn('kExchange', ['truck', 'vanGrey', 'truckB'], ctxY);
Object.values(ML.sid).forEach(m => Object.values(m).forEach(name => { if(wi++ % 2 === 0) wagonsIn(name, [['truck', 'vanGrey', 'oilTank', 'truckB'][wi % 4]], ctxY); }));
Object.values(LINES_B).forEach(B => Object.values(B.LC.sid).forEach(m => Object.values(m).forEach(name => { if(wi++ % 2 === 0) wagonsIn(name, [['truck', 'vanGrey', 'truckB', 'vanBrown'][wi % 4]], {home: {label: 'the goods siding'}}); })));
function facing(D, e, towardA){ return D.faceFixed ? (D.faceFixed !== towardA) : true; }
DUTIES.forEach(D => {
  const turn = onTurn(D.shifts, simTime), on = turn ? D.rota[Math.min(turn.idx, D.rota.length - 1)] : null;
  const mainKey = D.rakes.main ? 'main' : null;
  Object.entries(D.rakes).forEach(([k, r]) => {
    if(on && k === mainKey){
      // formed up for the first train: the coaches nearest the buffers, the engine at the departure end
      const vs = r.vs.concat(on.unit.slice().reverse()), c = newCut(vs), sa = standAt(D, D.A, D.d, cutLen(c), c, true);
      const p = sa && at(sa.name, sa.x); if(p) layCut(c, -D.d > 0 ? p : flip(p));
      on.unit.forEach(u => u.rev = facing(D, on, -D.d));
      D.rake = 'main'; D.cur = D.rota.indexOf(on); D.doing = `waiting to leave ${D.A.name}`;
    } else layHome(r.vs, D.homes[k]);
  });
  D.rota.forEach(e => {
    if(e === on && mainKey) return;
    if(e === on && !mainKey){                              // a railcar waits at its terminal
      const c = newCut(e.unit.slice()), p = at(D.LC.road(D.d), D.A.stop); if(p) layCut(c, -D.d > 0 ? p : flip(p)); D.cur = D.rota.indexOf(e); return;
    }
    layHome(e.unit, D.engHomes[e.eng.name]);
  });
});
// anything that found no place to stand is kept out of the way, and reported
const UNPLACED = CUTS.filter(c => c.vs.some(v => !v.pos));
UNPLACED.forEach(c => { c.away = true; c.vs.forEach(v => { v.v.group.visible = false; }); });
if(UNPLACED.length) console.warn('track.js: no room for', UNPLACED.map(c => c.vs.map(v => v.name).join('+')).join(' | '));

// ================================================================== jobs
// Jobs are generators: they yield {leg}, {wait: seconds} or {until: fn} and the driver carries them out.
const STATS = {moves: 0, legs: 0, reversals: 0, noPlan: 0, stuck: 0, couplings: 0, gaveUp: 0, last: ''};
function* go(e, goal, o = {}){
  const tries = o.tries || (e === glynn ? 6 : 60);
  for(let attempt = 0; attempt < tries; attempt++){
    const g = typeof goal === 'function' ? goal() : goal;
    if(g && !g.lines) g.lines = e.duty ? e.duty.lines : e === glynn ? GLYNN_LINES : null;
    const legs = g && plan(e.cut, g);
    if(!legs){ STATS.noPlan++; STATS.np = STATS.np || {}; STATS.np[e.name] = (STATS.np[e.name] || 0) + 1; (STATS.npWhy = STATS.npWhy || {})[e.name] = `${fmtTime(simTime)} ${g && g.pos ? g.pos.seg.name + ' ' + Math.round(xAt(g.pos)) : g && g.couple ? 'couple ' + g.couple.vs[0].name + ' on ' + g.couple.vs[0].pos.seg.name : '?'} from ${e.pos.seg.name}@${Math.round(xAt(e.pos))}`; STATS.last = `${fmtTime(simTime)} ${e.name}: no way to ${g && g.pos ? g.pos.seg.name + ' ' + Math.round(xAt(g.pos)) : 'couple ' + (g && g.couple ? g.couple.vs[0].name : '?')}`; if(e.duty) e.duty.why = STATS.last; yield {wait: 20}; continue; }
    STATS.moves++; STATS.reversals += legs.length - 1;
    let ok = true;
    for(let i = 0; i < legs.length; i++){
      if(i) yield {wait: 25};                              // the driver changes ends
      // long runs go at line speed; shunting moves at walking pace
      const vm = o.vmax || (legs[i].total > 2500 ? (e.duty ? Math.min(22, e.duty.speed) : 15) : 6);
      const m = startLeg(e.cut, legs[i], {vmax: vm});
      e.cut.mover = m;
      STATS.legs++;
      const r = yield {leg: m};
      m.c.mover = null;
      if(r === 'fail'){
        ok = false; STATS.stuck++; STATS.lastStuck = `${fmtTime(simTime)} ${e.name} on ${m.c.vs[0].pos.seg.name}@${Math.round(xAt(m.c.vs[0].pos))}: ${m.why || 'stopped'}`; if(e.duty) e.duty.why = STATS.lastStuck;
        if(m.retreat) yield* retreat(e, m.retreat);
        break;
      }
      if(m.coupled){ STATS.couplings++; yield {wait: 30}; }
    }
    if(ok) return true;
    yield {wait: 15 + rnd() * 120};                        // back off for a while before trying again, so two trains do not keep meeting
  }
  STATS.gaveUp++;
  return false;
}
// out of another train's way: off every road it means to use, and back again when it has gone by
function* retreat(e, w){
  const avoid = new Set(), add = seg => { avoid.add(seg); seg.conf.forEach(cf => avoid.add(cf.seg)); };
  w.leg.steps.forEach(st => add(st.seg));
  w.c.vs.forEach(v => { if(v.pos) add(v.pos.seg); });
  const legs = plan(e.cut, {clear: avoid, avoidCut: w.c, maxDist: 2500, lines: e.duty ? e.duty.lines : null});
  if(!legs){ yield {wait: 60}; return; }
  STATS.retreats = (STATS.retreats || 0) + 1;
  if(e.duty) e.duty.doing = `standing back to let ${who(w.c)} by`;
  for(let i = 0; i < legs.length; i++){
    if(i) yield {wait: 20};
    const m = startLeg(e.cut, legs[i], {vmax: 5});
    e.cut.mover = m;
    const r = yield {leg: m};
    m.c.mover = null;
    if(r === 'fail') break;
  }
  yield {wait: 120 + rnd() * 120};
}
// uncouple the engine (with its tender, and the next k vehicles) from the rest of its cut; returns the rest
function detach(e, k = 0){
  const c = e.cut, n = c.vs.length, u = e.unit.filter(v => v.cut === c).length, end = engEnd(c, e);
  if(end === 'A') return split(c, u + k);
  const rest = split(c, n - u - k);
  if(!rest) return null;
  return e.cut === rest ? c : rest;
}
function nearEndToward(c, x){ const a = xAt(endPos(c, 'A')), b = xAt(endPos(c, 'B')); return Math.abs(a - x) < Math.abs(b - x) ? 'A' : 'B'; }
const hasEngine = c => c.vs.some(v => v.eng);
// how far round a move may go to get somewhere: a good deal more than the distance as the crow flies, but
// never miles about (better to wait for the road than to go round by another line)
const _r1 = new V3(), _r2 = new V3();
const reach = (e, p, extra = 3000) => {
  if(!p) return Infinity;
  const a = endPos(e.cut, 'A');
  if(a.seg.line === p.seg.line && a.seg.def.kind === 'line' && p.seg.def.kind === 'line') return Math.abs(xAt(a) - xAt(p)) * 1.15 + extra;     // along the same line
  return pointAt(a, _r1).distanceTo(pointAt(p, _r2)) / M * 2.2 + extra + 2000;
};
const LOCAL = 6000;                                        // shunting about a station and its yard
// run round a train standing at a station, ending at its other end; keeps at it until it is done
function* runRound(e, D, T){
  if(D.pp) return;
  const train = detach(e);
  if(!train) return;
  D.rr = T ? T.name : where(e.cut);                        // while it runs round, no other train takes the platforms
  D.doing = `running round the train at ${D.rr}`;
  yield {wait: 40};
  const far = nearEndToward(train, xAt(endPos(e.cut, 'A')));
  for(let k = 0; ; k++){ if(yield* go(e, {couple: train, at: other(far), maxDist: 3000}, {tries: 6})) break; D.doing = `waiting to run round the train at ${D.rr}`; yield {wait: 120}; }
  D.rr = null;
  yield {wait: 30};
}
function busy(name, me){ return DUTIES.some(o => o !== me && o.rr === name); }
// the cuts standing on a road, nearest its points first
function cutsOn(name){
  const occ = occupancy(), seen = new Map();
  (BYNAME.get(name) || []).forEach(seg => (occ.get(seg) || []).forEach(q => { const x = seg.xs[0] + (q.a / seg.len) * (seg.xs[seg.xs.length - 1] - seg.xs[0]); if(!seen.has(q.cut) || x < seen.get(q.cut)) seen.set(q.cut, x); }));
  const toeLow = deadUp(name);
  return [...seen.entries()].sort((a, b) => toeLow ? a[1] - b[1] : b[1] - a[1]).map(e => e[0]);
}
// the wagons (no engine) nearest a road's points
function cutOn(name){ const cs = cutsOn(name); return cs.length && !hasEngine(cs[0]) ? cs[0] : null; }
// where an engine entering a road from its points can stop: short of whatever stands there, or at the buffers
function entrySpot(name, except){
  const up = deadUp(name), cs = cutsOn(name).filter(c => !except || c !== except.cut);
  if(!cs.length) return {pos: at(name, up ? bufX(name) - 1 : bufX(name) + 1), f: up ? 1 : -1};
  const ends = ['A', 'B'].map(e => xAt(endPos(cs[0], e)));
  const x = up ? Math.min(...ends) - 5 : Math.max(...ends) + 5;
  return {pos: at(name, x), f: up ? 1 : -1, behind: cs[0]};
}
// at a station with a siding: put the wagon next to the engine in it if it is empty, else bring its wagons out
function* pickUp(e, D, sidingName, dir, where){
  const there = cutOn(sidingName), nv = e.cut.vs.length - e.unit.length;
  const dest = dir < 0 ? -1e9 : 1e9;
  if(there && nv > 0 && !D.pp){
    D.doing = `shunting at ${where}: picking up from the siding`;
    const train = detach(e);
    if(!train) return;
    yield {wait: 30};
    // fetch the wagons, then back onto the train with them, so they ride next to the engine
    if(yield* go(e, {couple: there, maxDist: 2500}, {tries: 4})) yield* go(e, {couple: train, end: other(engEnd(e.cut, e)), at: nearEndToward(train, dest), maxDist: 2500}, {tries: 4});
    yield* rejoin(e, D, train, dest);
  } else if(nv > 1 && !D.pp){
    const atA = engEnd(e.cut, e) === 'A', wagon = e.cut.vs[atA ? e.unit.length : e.cut.vs.length - 1 - e.unit.length];
    if(!wagon || BRAKE.test(wagon.name) || wagon === D.rakeCut[D.rake] || D.passenger && D.rake === 'main'){ yield {wait: 40}; return; }
    D.doing = `shunting at ${where}: putting a wagon off in the siding`;
    const train = detach(e, 1);
    if(!train) return;
    yield {wait: 30};
    const sp = entrySpot(sidingName, e);
    // only let the wagon go once it is in the siding
    if(sp.pos && (yield* go(e, {pos: sp.pos, f: sp.f, end: other(engEnd(e.cut, e)), maxDist: 2500}, {tries: 4}))){ yield {wait: 25}; detach(e); yield {wait: 15}; }
    yield* rejoin(e, D, train, dest);
  } else yield {wait: 40};
}
// back onto the train, however long it takes: a train is never left standing on a running line
function* rejoin(e, D, train, dest){
  const tv = train.vs[0];
  for(let k = 0; tv.cut !== e.cut; k++){
    const t = tv.cut, md = reach(e, endPos(t, 'A'), 2500);
    // onto the front of the train, with any wagons it has brought next to the train; at the back only if that cannot be done
    const g = k < 6 ? {couple: t, at: nearEndToward(t, dest), end: lone(e) ? undefined : other(engEnd(e.cut, e)), maxDist: md} : {couple: t, maxDist: md};
    if(yield* go(e, g, {tries: 4})) continue;
    D.doing = `waiting to get back onto the train at ${where(t)}`;
    yield {wait: 60};
  }
}
// make sure the engine is at the front for the way the train is going, running round it if it is not
function* faceForward(e, D, dir){
  if(D.pp || lone(e)) return;
  const c = e.cut, ee = engEnd(c, e), xe = xAt(endPos(c, ee)), xo = xAt(endPos(c, other(ee)));
  if(c.vs[0] !== e && c.vs[c.vs.length - 1] !== e && !(c.vs[1] === e && c.vs[0].tender) && !(c.vs[c.vs.length - 2] === e && c.vs[c.vs.length - 1].tender)) return;
  if(endPos(c, ee).seg.line === endPos(c, other(ee)).seg.line && (xe - xo) * dir < 0) yield* runRound(e, D, null);
}
function rakeCut(D, name){ const v = D.rakeCut[name]; return v ? v.cut : null; }
// propel the train into its road and leave it there
function* stable(e, D){
  const home = D.homes[D.rake], r = D.rakes[D.rake] || {label: 'the train'};
  D.doing = `putting ${r.label} away`;
  if(!home || !BYNAME.get(home)){ D.rake = null; return; }
  const goal = () => { const w = cutOn(home), sp = entrySpot(home, e); return w ? {couple: w, end: D.pp ? undefined : other(engEnd(e.cut, e)), maxDist: LOCAL} : {pos: sp.pos, f: sp.f, end: D.pp ? undefined : other(engEnd(e.cut, e)), maxDist: LOCAL}; };
  if(!plan(e.cut, goal())) yield* runRound(e, D, D.A);         // the engine has to be at the other end to propel it in
  yield* go(e, goal);
  yield {wait: 25};
  const rest = detach(e);
  if(rest) D.rakeCut[D.rake] = rest.vs.find(v => BRAKE.test(v.name)) || (rest.vs.includes(D.rakeCut[D.rake]) ? D.rakeCut[D.rake] : rest.vs.find(v => !v.eng && !v.tender)) || D.rakeCut[D.rake];
  D.rake = null; D.rr = null; D.claim = null;
  yield {wait: 15};
}
// fetch a rake and set it in the platform, ready to leave
function* fetch(e, D, name){
  const c = rakeCut(D, name), r = D.rakes[name];
  D.doing = `fetching ${r.label}`;
  if(c && c !== e.cut){ yield* go(e, {couple: c, maxDist: reach(e, endPos(c, 'A'), LOCAL)}); }
  D.rake = name;
  D.doing = `setting ${r.label} in the platform at ${D.A.name}`;
  // a free road to set the train out on (the far end leading in, so the engine is at the departure end)
  let sa = null;
  for(let k = 0; !sa; k++){ sa = standAt(D, D.A, D.d, cutLen(e.cut), e.cut, true); if(!sa){ D.doing = `waiting for a free road at ${D.A.name}`; yield {wait: 60}; } }
  D.claim = D.A.name + ':' + sa.name;
  const goal = () => { const s2 = standAt(D, D.A, D.d, cutLen(e.cut), e.cut, true) || sa; return {pos: at(s2.name, s2.x), f: -D.d, end: D.pp ? undefined : other(engEnd(e.cut, e)), maxDist: LOCAL}; };
  if(!plan(e.cut, goal())){                                 // coupled at the wrong end: draw it in and run round
    yield* go(e, {pos: at(sa.name, sa.x), f: -D.d, end: leadEnd(e), maxDist: LOCAL});
    yield* runRound(e, D, D.A);
    return;
  }
  yield* go(e, goal);
  D.rr = null;
  yield {wait: 30};
}
// along the line to the other end, calling at stations; pick-up goods shunt where there is a siding
function* trip(e, D, toB, w){
  const want = D.rakes[w.rake] ? w.rake : 'main';
  const kind = D.rake === want ? w.kind : (D.rake && D.rake !== 'main' && !D.passenger ? 'pickup' : D.rake === 'trucks' ? 'pickup' : (D.passenger ? 'stopping' : 'through'));
  const k = WORK_KIND[kind] || WORK_KIND.stopping;
  const dir = toB ? D.d : -D.d, LC = D.LC, from = toB ? D.A : D.B, to = toB ? D.B : D.A;
  D.rr = null; D.claim = null;
  const between = LC.stations.filter(s => (s.x - from.x) * dir > 30 && (to.x - s.x) * dir > 30 && at(LC.road(dir), s.x)).sort((a, b) => (a.x - b.x) * dir);
  const calls = kind === 'express' ? (D.stopsAt || []) : kind === 'fast' || kind === 'through' || kind === 'heavy' ? [] : between.map(s => s.name);
  const vmax = D.speed * k.v;
  const toward = (p, o = {}) => p ? {pos: p, f: dir, end: leadEnd(e), maxDist: reach(e, p), ...o} : null;
  yield* faceForward(e, D, dir);
  for(const st of between){
    if(!calls.includes(st.name)) continue;
    D.doing = `running to ${st.name}`;
    yield* go(e, () => toward(at(LC.road(dir), st.x + dir * cutLen(e.cut) / 2)), {vmax});
    D.doing = `at ${st.name}`;
    const sid = LC.sid[st.name] && LC.sid[st.name][dir];
    if(kind === 'pickup' && sid){ yield* pickUp(e, D, sid, dir, st.name); yield* faceForward(e, D, dir); }
    else yield {wait: k.dwell};
  }
  D.doing = `running to ${to.name}`;
  // into a free road at the terminus; if there is none, wait at the home signal until there is
  for(let k2 = 0; ; k2++){
    const sa = standAt(D, to, dir, cutLen(e.cut), e.cut, false);
    if(sa){ D.claim = to.name + ':' + sa.name; if(to.roads.length && !/^loop|^kRoad/.test(sa.name)) D.rr = to.name;
      if(yield* go(e, () => { const s2 = standAt(D, to, dir, cutLen(e.cut), e.cut, false) || sa; return toward(at(s2.name, s2.x)); }, {vmax, tries: 8})) break; continue; }
    D.doing = `waiting at the home signal for a road into ${to.name}`;
    const hx = to.x - dir * 700, hp = at(LC.road(dir), to.end === 'low' ? Math.max(700, hx) : to.end === 'high' ? Math.min(LEN(LC.line) - 700, hx) : hx);
    if(hp && (xAt(endPos(e.cut, engEnd(e.cut, e))) - xAt(hp)) * dir < -1) yield* go(e, toward(hp), {vmax, tries: 3});
    yield {wait: 60};
    D.doing = `running to ${to.name}`;
  }
  D.doing = `at ${to.name}`;
  yield {wait: Math.max(60, k.dwell)};
}
function* coalUp(e, D){
  if(!D.coal) return;
  D.doing = 'taking coal and water at the coal road';
  const sp = entrySpot(D.coal, e);
  if(sp.pos && (!sp.behind || !hasEngine(sp.behind))){ yield* go(e, {pos: sp.pos, f: sp.f, end: leadEnd(e), maxDist: LOCAL}, {tries: 10}); yield {wait: 600}; }
}
function* onShed(e, D){
  const road = D.engHomes[e.eng.name];
  D.doing = 'going on shed';
  if(road && BYNAME.get(road)){ const sh = entrySpot(road, e); if(sh.pos) yield* go(e, {pos: sh.pos, f: sh.f, end: leadEnd(e), maxDist: reach(e, sh.pos, LOCAL)}); }
  D.doing = `on shed at ${D.A.name}`;
}

// ------------------------------------------------------------------ the Steam Team's nights at Tidmouth Sheds
function proxyOf(e){
  if(e.proxy) return e.proxy;
  const D = e.duty, i = D.rota.indexOf(e);
  e.proxy = {rota: [{name: e.name, unit: e.unit.map(u => u.v), rec: e.eng, color: e.eng.dot}], cur: 0, R: {line: LM}, rail: 'track', handover: HAND ? HAND.k : undefined,
    shifts: D.shifts.map(s => ({...s, who: s.who.split('').map(c => +c === i ? '0' : '9').join('')}))};
  return e.proxy;
}
const travelMin = D => { if(!HAND) return 60; const p = linePoint(D.LC.line, D.A.x, 0, new V3()), q = linePoint(LM, HAND.x, 0, _q2); return p.distanceTo(q) / M * 1.25 / 16 / 60 + 35; };
function* goHome(e, D){
  const ops = window.SODOR_OPS;
  if(!HAND || !ops || !ops.goTidmouth || !STEAM_TEAM.has(e.id)) return false;
  const P = proxyOf(e), nt = nextTurn(P.shifts, 0, simTime);
  if(!nt || nt.t - simTime < 6 * 60) return false;        // not worth the trip tonight
  D.doing = `running light to Tidmouth Sheds`;
  const L = cutLen(e.cut);
  // up to the signal short of the crossover onto the shed lead, then in when the foot of the lead is clear
  const wp = at('down', HAND.x + 185 + L);
  if(wp) yield* go(e, {pos: wp, f: -1, maxDist: reach(e, wp, LOCAL)}, {tries: 20});
  for(let k = 0; !handFree(e) || HANDSEG_BUSY(e); k++){ D.doing = 'waiting for the road to Tidmouth Sheds'; yield {wait: 30}; }
  HANDQ.by = e; HANDQ.out = false; HANDQ.t = simTime;
  D.doing = `running light to Tidmouth Sheds`;
  const hp = at('up', HAND.x - L);
  if(!(yield* go(e, {pos: hp, f: -1, maxDist: reach(e, hp, LOCAL)}, {tries: 20}))){ HANDQ.by = null; return false; }
  yield {wait: 20};
  // the crew take over from the engine's back end, so it runs on without a jump
  const ends = ['A', 'B'].map(k => endPos(e.cut, k)), rear = xAt(ends[0]) > xAt(ends[1]) ? ends[0] : ends[1];
  P.fromPt = pointAt(rear, new V3());
  ops.goTidmouth(P);
  HANDQ.by = null;
  if(!P.tid || P.tid === 'none'){ P.tid = null; return false; }
  e.cut.away = true; e.away = true;
  return true;
}
// The foot of the shed lead is used by one engine at a time, going in or coming out.
const HANDQ = {by: null, out: false, t: 0};
const handFree = e => !HANDQ.by || HANDQ.by === e || simTime - HANDQ.t > (HANDQ.out ? 180 : 45);
const HANDSEG_BUSY = me => { if(!HAND) return false; const p = at('up', HAND.x); const occ = occupancy(); return (occ.get(p.seg) || []).some(q => (!me || q.cut !== me.cut) && (Math.abs(q.a - p.s) < 60 || Math.abs(q.b - p.s) < 60)); };
// call the engines home from Tidmouth Sheds in good time for their next turn
function callHome(D){
  const ops = window.SODOR_OPS;
  D.rota.forEach(e => {
    if(!e.away || !e.proxy || !e.proxy.tid || e.proxy.tid === 'none') return;
    const nt = nextTurn(e.proxy.shifts, 0, simTime), turn = onTurn(D.shifts, simTime);
    const due = (turn && turn.end !== D.doneEnd && D.rota[Math.min(turn.idx, D.rota.length - 1)] === e) || (nt && nt.t - simTime < travelMin(D) + 60);
    if(due && handFree(null) && !HANDSEG_BUSY()){ ops.leaveTidmouth(e.proxy); HANDQ.by = e; HANDQ.out = true; HANDQ.t = simTime; }
  });
}
function* comeHome(e, D){
  D.doing = `coming back from Tidmouth Sheds`;
  while(e.proxy && e.proxy.tid){ callHome(D); yield {wait: 30}; }
  // back at the foot of the shed lead: pick the engine up again as it stands
  const pos = e.unit.map(u => toLine(LM, u.v.group.position, HAND.x, 120));
  const order = pos[0].x <= pos[pos.length - 1].x ? e.unit.slice() : e.unit.slice().reverse();
  const c = e.cut; c.vs = order; c.away = false; e.away = false;
  const lo = Math.min(...pos.map(q => q.x)) - e.L / 2, p = at('up', lo);
  if(p) layCut(c, flip(p));
  c.vs.forEach(v => { const yaw = v.v.group.rotation.y; pointAt(walk(v.pos, 1), _a); pointAt(walk(flip(v.pos), 1), _b); v.rev = Math.cos(yaw - Math.atan2(_a.x - _b.x, _a.z - _b.z)) < 0; v.dirty = true; });
}
// if a move went wrong and the engine has come away without its train, go back and couple on again
function* ensureTrain(e, D){
  const v = D.rake && D.rakeCut[D.rake];
  if(!v || v.cut === e.cut) return;
  D.doing = `going back for ${D.rakes[D.rake].label}`;
  while(v.cut !== e.cut){ if(yield* go(e, {couple: v.cut, maxDist: reach(e, endPos(v.cut, 'A'), 4000)}, {tries: 10})) break; yield {wait: 120}; }
  yield {wait: 20};
}
const waitTill = function*(D, t, text){ while(simTime < t){ D.doing = text; yield {wait: Math.max(1, Math.min(60, (t - simTime) * 60))}; } };

// ------------------------------------------------------------------ one duty, all day, to the timetable
function* duty(D){
  D.rr = null; D.claim = null;
  for(;;){
    const turn = onTurn(D.shifts, simTime);
    callHome(D);
    if(!turn){
      // an engine called out of Tidmouth Sheds ahead of its turn runs light to its own shed to wait for it
      const out = D.rota.find(x => x.away && x.proxy && !x.proxy.tid);
      if(out){ D.cur = D.rota.indexOf(out); yield* comeHome(out, D); yield* onShed(out, D); continue; }
      const e = D.rota[D.cur]; D.doing = e && e.away ? 'home at Tidmouth Sheds with the Steam Team' : `on shed at ${D.A.name}`; D.nextDep = null; yield {wait: 60}; continue;
    }
    const e = D.rota[Math.min(turn.idx, D.rota.length - 1)];
    D.cur = D.rota.indexOf(e);
    if(e.away) yield* comeHome(e, D);
    let turnedRound = true;
    for(;;){
      const t1 = onTurn(D.shifts, simTime);
      if(!t1 || t1.idx !== turn.idx) break;
      // the next train out, by the timetable
      const dep = nextDeparture(D, simTime + 1);
      if(dep > t1.end - 5) break;                           // the turn is over before the next booked train
      const w = workAt(D.work, dep), want = D.rakes[w.rake] ? w.rake : (D.rakes.main ? 'main' : null);
      D.w = w; D.nextDep = dep;
      if(D.rake !== want){
        if(D.rake) yield* stable(e, D);
        if(want) yield* fetch(e, D, want);
        turnedRound = true;
      } else if(!turnedRound) yield* runRound(e, D, D.A);
      yield* ensureTrain(e, D);
      yield* waitTill(D, dep, `waiting to leave ${D.A.name} at ${fmtTime(dep)}`);
      yield* trip(e, D, true, w);
      yield* runRound(e, D, D.B);
      const xb = D.exchange[D.B.name];
      if(xb && w.kind === 'pickup' && D.rake === want) yield* pickUp(e, D, xb.name, xb.dir, D.B.name);
      const depB = dep + D.runMin + D.turnMin;
      D.nextDep = depB;
      yield* waitTill(D, depB, `waiting to leave ${D.B.name} at ${fmtTime(depB)}`);
      yield* ensureTrain(e, D);
      yield* trip(e, D, false, w);
      turnedRound = false;                                  // runs round before the next train, unless the stock is changed
    }
    // the end of the turn: put the train away, and the engine on shed or home to Tidmouth
    D.w = null; D.nextDep = null; D.doneEnd = turn.end;
    if(D.rake) yield* stable(e, D);
    yield* coalUp(e, D);
    if(!(yield* goHome(e, D))) yield* onShed(e, D);
    // and there for the rest of the turn
    for(let t2 = onTurn(D.shifts, simTime); t2 && t2.end === turn.end; t2 = onTurn(D.shifts, simTime)){
      if(!e.away) D.doing = `on shed at ${D.A.name}`;
      yield {wait: 60};
    }
  }
}

// ------------------------------------------------------------------ Glynn, the Ffarquhar yard pilot
const GLYNN_HOURS = ['08:00', '17:30'], GLYNN_LINES = new Set(['ffarquhar']);
const YARD_ROADS = ['fLadder', 'fCoal', 'fGoods'];
const G = {name: 'Glynn', doing: 'stabled in the carriage shed'};
function* yardPilot(){
  if(!glynn) return;
  const e = glynn;
  for(;;){
    if(!inHours(GLYNN_HOURS, simTime) || mod(Math.floor(simTime / 1440), 7) === 6){
      if(!lone(e)) yield* dropWagons(e);
      if(!G.home && lone(e)){
        G.doing = 'going back to the carriage shed';
        const sp = entrySpot('fCar2', e);
        G.home = yield* go(e, {pos: sp.pos, f: sp.f, end: leadEnd(e), yard: true, maxDist: 3000});
      }
      G.doing = G.home ? 'stabled in the carriage shed' : 'waiting to get back to the carriage shed'; yield {wait: 300}; continue;
    }
    G.home = false;
    // wagons in one yard road to move to another (never Thomas's own trucks)
    const mine = v => !tTrucks.includes(v);
    const from = YARD_ROADS.filter(n => { const c = cutOn(n); if(!c) return false; const near = c.vs[nearEndToward(c, 0) === 'A' ? 0 : c.vs.length - 1]; return mine(near); });
    const src = from[Math.floor(rnd() * from.length)];
    const tos = YARD_ROADS.filter(n => n !== src && clearOfThomas(n)), dst = tos[Math.floor(rnd() * tos.length)];
    if(!src || !dst){ G.doing = 'waiting for work in the yard'; yield {wait: 600}; continue; }
    const c = cutOn(src);
    G.doing = `shunting at Ffarquhar Yards: fetching wagons from ${segName(src)}`;
    if(!(yield* go(e, {couple: c, yard: true, maxDist: 3000}))){ yield {wait: 600}; continue; }
    yield {wait: 20};
    const atA = engEnd(e.cut, e) === 'A', vs = e.cut.vs, order = atA ? vs.slice(1) : vs.slice(0, -1).reverse();
    let free = 0; while(free < order.length && mine(order[free])) free++;
    const k = Math.min(free, 1 + Math.floor(rnd() * 3));
    if(k < order.length){ if(atA) split(e.cut, 1 + k); else split(e.cut, vs.length - 1 - k); }
    yield {wait: 15};
    if(!k){ yield {wait: 300}; continue; }
    G.doing = `shunting at Ffarquhar Yards: taking wagons to ${segName(dst)}`;
    let put = false;
    for(let tries = 0; tries < 8 && !put; tries++){
      const r = tries < 6 || !clearOfThomas(src) ? dst : src, there = cutOn(r), sp = entrySpot(r, e);
      if(!clearOfThomas(r)) break;                          // Thomas has put his trucks there meanwhile
      if(there) put = yield* go(e, {couple: there, end: other(engEnd(e.cut, e)), yard: true, maxDist: 3000});
      else if(!sp.behind) put = yield* go(e, {pos: sp.pos, f: sp.f, end: other(engEnd(e.cut, e)), yard: true, maxDist: 3000});
      if(!put) yield {wait: 240};
    }
    yield {wait: 20};
    if(put){ if(engEnd(e.cut, e) === 'A') split(e.cut, 1); else split(e.cut, e.cut.vs.length - 1); }
    else yield* dropWagons(e);                              // never goes home with wagons on
    yield {wait: 15};
    G.doing = 'drawing back to the carriage shed';
    { const sp = entrySpot('fCar2', e); if(e.pos.seg.name !== 'fCar2') yield* go(e, {pos: sp.pos, f: sp.f, end: leadEnd(e), yard: true, maxDist: 3000}); }
    G.doing = 'waiting between shunts';
    yield {wait: (12 + rnd() * 30) * 60};
  }
}
const segName = n => ({fLadder: 'the stone siding', fCoal: 'the coal road', fGoods: 'the goods siding'})[n] || n;
// leave any wagons on a yard road: where it stands if it is on one, or pushed onto the first that will take them
// (never in front of Thomas's own trucks, which he must be able to fetch)
const clearOfThomas = n => !cutsOn(n).some(c => c.vs.some(v => tTrucks.includes(v)));
function* dropWagons(e){
  const roads = YARD_ROADS.filter(clearOfThomas);
  for(let k = 0; !lone(e) && k < 12 && roads.length; k++){
    const here = e.pos.seg.name, far = endPos(e.cut, other(engEnd(e.cut, e))).seg.name;
    if(roads.includes(here) && roads.includes(far)){ detach(e); break; }
    const r = roads[k % roads.length], there = cutOn(r), sp = entrySpot(r, e);
    G.doing = `shunting at Ffarquhar Yards: putting the wagons away in ${segName(r)}`;
    const ok = there ? yield* go(e, {couple: there, end: other(engEnd(e.cut, e)), yard: true, maxDist: 3000}, {tries: 3})
      : sp.pos && !sp.behind ? yield* go(e, {pos: sp.pos, f: sp.f, end: other(engEnd(e.cut, e)), yard: true, maxDist: 3000}, {tries: 3}) : false;
    if(ok){ yield {wait: 20}; detach(e); break; }
    yield {wait: 120};
  }
  yield {wait: 15};
}

// ------------------------------------------------------------------ the driver
function runner(make){ return {make, it: make(), cmd: null, res: undefined, t: 0}; }
const DRIVERS = DUTIES.map(D => runner(() => duty(D))).concat([runner(yardPilot)]);
function stepDriver(r, dt){
  for(let guard = 0; guard < 8; guard++){
    if(!r.cmd){ const n = r.it.next(r.res); r.res = undefined; if(n.done){ r.cmd = {wait: 1e9}; return; } r.cmd = n.value || {wait: 1}; r.t = 0; }
    const c = r.cmd;
    if(c.wait !== undefined){ r.t += dt; if(r.t < c.wait) return; r.cmd = null; dt = 0; continue; }
    if(c.until){ if(!c.until()) return; r.cmd = null; continue; }
    if(c.leg){
      const s = stepLeg(c.leg, dt);
      if(s === 'done'){ r.res = 'done'; r.cmd = null; return; }
      if(s === 'fail'){ r.res = 'fail'; r.cmd = null; return; }
      return;
    }
    r.cmd = null;
  }
}

// ================================================================== every frame
frameHooks.push(dt => {
  const d = dt * timeScale, n = Math.max(1, Math.min(160, Math.ceil(d / 1.5)));
  for(let k = 0; k < n; k++){
    tick++;
    DRIVERS.forEach(r => { try { stepDriver(r, d / n); } catch(err){ console.error('track.js driver', err); STATS.errors = (STATS.errors || 0) + 1; STATS.lastError = String(err); r.it = r.make(); r.cmd = {wait: 120}; } });
    if(tick % 8 === 0) breakDeadlocks();
  }
  // an engine out of the sheds frees the foot of the lead once it has drawn away from it
  const hq = HANDQ.by;
  if(hq && HANDQ.out && !hq.away && hq.pos && (hq.pos.seg.name !== 'up' || Math.abs(xAt(hq.pos) - HAND.x) > 260)) HANDQ.by = null;
  const cp = camera.position;
  VEHS.forEach(v => render(v, cp));
  updateSignals(dt);
  updateLamps();
  // the old runner's lists follow the engine at work, for the level crossings and the map dot
  DUTIES.forEach(D => {
    const R = D.runner, e = D.rota[D.cur] || D.rota[0]; if(!R || !e) return;
    if(!e.cut.away){ R.engine = e.v; R.unit = [{v: e.v, len: e.L * M}]; const cs = e.cut.vs.filter(v => !e.unit.includes(v)); const fall = D.rakes.main ? D.rakes.main.vs[0] : e; R.cars = (cs.length ? cs : [fall]).map(v => ({v: v.v, len: v.L * M})); }
    R.hideMarker = e.cut.away || /on shed/.test(D.doing);
  });
  TRACK_G.visible = camDist < 9;
});

// ================================================================== what the dashboard shows
const LINE_ST = new Map();
LINE_ST.set(LF, BR.stations.concat([{name: 'Knapford', x: 88}, {name: 'Ffarquhar', x: Lm}])); LINE_ST.set(LM, MS);
Object.values(LINES_B).forEach(B => LINE_ST.set(B.line, B.stations));
function where(c){
  const p = endPos(c, 'A');
  if(p.seg.place) return p.seg.place;
  const x = xAt(p), line = p.seg.line, sts = LINE_ST.get(line) || [];
  const st = sts.reduce((m, s) => !m || Math.abs(s.x - x) < Math.abs(m.x - x) ? s : m, null);
  return st && Math.abs(st.x - x) < 450 ? st.name : `on the ${line === LM ? 'Main Line' : (line.name || 'branch').replace(/^The /, '')}`;
}
const every = D => D.interval % 60 === 0 ? `every ${D.interval / 60 === 1 ? 'hour' : D.interval / 60 + ' hours'}` : `every ${D.interval} minutes`;
function dutyStatus(D, v){
  const on = D.rota[D.cur] === v && onTurn(D.shifts, simTime);
  const w = D.w ? ` Now working ${D.w.txt}.` : '';
  const tt = ` Timetable: ${every(D)} from ${D.A.name}, about ${D.runMin} minutes each way.`;
  const day = ` The day's work: ${D.work.map(x => `${fmtTime(x.t)} ${x.txt}`).join('; ')}.`;
  const m = D.rota[D.cur] && D.rota[D.cur].cut.mover, sig = m && m.atSignal && m.wait > 20 ? ' (stopped at a signal)' : '';
  if(on) return `${v.name} is ${D.doing}${sig}.${w} Works ${D.label} on the new track network.${tt}${day}`;
  if(v.away) return `${v.name} is home at Tidmouth Sheds with the Steam Team, and runs back to ${D.A.name} before the next turn.${day}`;
  const nt = nextTurn(D.shifts, D.rota.indexOf(v), simTime);
  return `${v.name} is on shed at ${D.A.name}. Next turn: ${nt ? DAYS[mod(Math.floor(nt.t / 1440), 7)] + ' ' + fmtTime(nt.t) : 'not soon'}.${tt}${day}`;
}
function statusOf(group){
  const v = VEHS.find(r => r.v.group === group);
  if(!v) return '';
  const D = DUTIES.find(D => D.rota.includes(v));
  if(D) return dutyStatus(D, v);
  if(v === glynn) return `Glynn is ${G.doing}. He shunts the yard at Ffarquhar from ${GLYNN_HOURS[0]} to ${GLYNN_HOURS[1]}, Monday to Saturday, moving wagons between the stone siding, the coal road and the goods siding.`;
  const c = v.cut, eng = c.vs.find(x => x.eng);
  if(eng) return `Coupled to ${eng.name}, ${where(c)}.`;
  const wh = where(c);
  return /^on the/.test(wh) ? `Standing ${wh}.` : `Standing at ${wh}.`;
}
const BOARD = DUTIES.map(D => ({
  railName: 'North Western Railway · new track network',
  color: () => (D.rota[D.cur] || D.rota[0]).eng.dot,
  short: () => { const e = D.rota[D.cur] || D.rota[0], on = onTurn(D.shifts, simTime), m = e.cut.mover; return [`${e.name} · ${D.doing}${m && m.atSignal && m.wait > 20 ? ' (at a signal)' : ''}`, on ? 'on' : 'shed']; },
  sub: () => `${D.label.replace(/^the /, '')} · ${every(D)} · ${D.work.map(w => `${fmtTime(w.t)} ${w.kind}`).join(', ')}`,
  show: () => NWR.show((D.rota[D.cur] || D.rota[0]).eng),
  working: () => !!onTurn(D.shifts, simTime),
}));
if(glynn) BOARD.push({
  railName: 'North Western Railway · new track network',
  color: () => glynn.eng.dot,
  short: () => [`Glynn · ${G.doing}`, inHours(GLYNN_HOURS, simTime) ? 'on' : 'shed'],
  sub: () => `Ffarquhar yard pilot · ${GLYNN_HOURS[0]}–${GLYNN_HOURS[1]}, Mo–Sa`,
  show: () => NWR.show(glynn.eng),
  working: () => inHours(GLYNN_HOURS, simTime),
});

window.SODOR_TRACK = {DRIVERS, STATS, cutsOn, cutOn, entrySpot, SEGS, NODES, CUTS, VEHS, DUTIES, G, plan, at, statusOf, board: BOARD, MAIN, ML, BR, BRANCH, LINES_B, JUNCTIONS, HAND, SIGNALS, manages: v => VEHS.some(r => r.v === v)};
console.log(`Track network: ${SEGS.length} roads, ${NODES.filter(n => n.grp[0].length > 1 || n.grp[1].length > 1).length} sets of points, ${nConf} crossings, ${JUNCTIONS.length} junctions, ${CUTS.length} cuts, ${DUTIES.length} duties, ${SIGNALS.length} signals, built in ${Math.round(performance.now() - t0)} ms`);
})();
