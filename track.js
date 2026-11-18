// track.js: one shared track network with real points, and engines that shunt on it.
//
// Every road is a segment: a run of track between points or buffer stops. Segments meet at nodes; where
// a node has two roads on one side it is a set of points, lying one way or the other. Each vehicle
// stands at its own place on a segment; vehicles coupled together form a cut, and a cut moves as one,
// every vehicle stepping the same distance along the track through the points as they lie. Points
// can only be thrown when nothing stands on them.
//
// An engine is sent somewhere by asking for a goal: a place for one end of its cut, or another cut to
// couple to. The planner searches the network for the shortest way there, reversing where the whole
// cut fits clear on one road (a headshunt, a loop, a long siding), keeping to the proper road of a
// double line, and splits the route into legs, one per direction. Each leg reserves the road ahead as
// it goes (the block sections between stations, guarded by home signals), throws the points, and stops
// short of anything in the way, or buffers up and couples when that is the goal. Running round,
// changing trains, setting down and picking up wagons, stabling coaches and going on shed are all built
// from these moves.
//
// On the network so far:
//  - the Ffarquhar branch: Knapford's bay and run-round loop, a goods siding at each station, the
//    exchange siding outside Knapford, and Ffarquhar with its loop, goods siding, carriage shed, engine
//    shed, coal road and yard ladder; Thomas (Rosie on Sundays) and Glynn, the yard pilot;
//  - the Main Line, Tidmouth to Barrow: double track with left-hand running, scissors crossovers and
//    loops where trains turn back, Knapford's own roads (Henry's road 1, the crossovers in both
//    throats) joined to the branch, goods sidings at the other stations, and carriage and engine
//    sidings where each train is based; Gordon and Hank, Rebecca, Henry, James and Donald, Murdoch and
//    Douglas, and Nia. The Steam Team drive themselves to the foot of the Tidmouth Sheds lead, where the
//    turntable crew (ops.js) take them in.
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

// ================================================================== geometry
const _t = new V3();
// world point x metres along a line (from its start) and lat metres to its left
function linePoint(line, x, lat, out){
  const L = LEN(line), u = Math.max(0, Math.min(1, x / L));
  realAt(line, u, out); realDir(line, u, _t); _t.y = 0; _t.normalize();
  out.x += _t.z * lat * M; out.z -= _t.x * lat * M;
  return out;
}
// a world point as (x, lat) on a line, searching near x0
function toLine(line, p, x0, span = 400){
  let bx = x0, bd = Infinity;
  for(let step of [8, 1, 0.1, 0.01]){
    const lo = bx - (step === 8 ? span : step * 12), hi = bx + (step === 8 ? span : step * 12);
    for(let x = lo; x <= hi; x += step){ const q = linePoint(line, x, 0, _q2), d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if(d < bd){ bd = d; bx = x; } }
  }
  const q = linePoint(line, bx, 0, _q2), u = Math.max(0, Math.min(1, bx / LEN(line))); realDir(line, u, _t); _t.y = 0; _t.normalize();
  return {x: bx, lat: ((p.x - q.x) * _t.z - (p.z - q.z) * _t.x) / M};
}
const _q2 = new V3();

// ================================================================== the network
const DEFS = [], SEGS = [], NODES = [];
// a road: from xa to xb along a line, lat(x) metres to the side
function road(line, name, xa, xb, lat, o = {}){ const d = {line, name, xa: Math.min(xa, xb), xb: Math.max(xa, xb), lat, o}; DEFS.push(d); return d; }
const flat = v => () => v;
// leaving `base` at the toe and easing out to `to` over len metres, running in direction dir (+1: up the line)
const turnout = (base, toe, dir, len, to) => x => base + (to - base) * smooth(0, len, (x - toe) * dir);
const loop = (xa, xb, w, ra, rb) => x => w * smooth(xa, xa + ra, x) * (1 - smooth(xb - rb, xb, x));

function sampleSeg(def, xa, xb){
  const line = def.line, L = LEN(line);
  const n = Math.max(2, Math.ceil((xb - xa) / (def.o.main ? 4 : 2))), pts = [], xs = [], lats = [], vis = [];
  for(let i = 0; i <= n; i++){
    const x = xa + (xb - xa) * i / n, lat = def.lat(x), p = linePoint(line, x, lat, new V3());
    const base = p.y, al = Math.abs(lat - (def.o.base ? def.o.base(x) : 0));
    if(al > 3){ const g = Math.max(heightAt(p.x, p.z), 0) + 0.55 * M, w = smooth(3, 10, al); p.y = base + Math.max(-1.2 * M, Math.min(1.2 * M, g - base)) * w; }
    pts.push(p); xs.push(x); lats.push(lat);
    vis.push(al > 2.5 || !inTunnel(line, Math.max(0, Math.min(1, x / L))));
  }
  if(!def.o.main){                                         // smooth the levels along a siding
    const ys = pts.map(p => p.y);
    for(let i = 1; i < n; i++){ let s = 0, c = 0; for(let k = -3; k <= 3; k++){ const j = i + k; if(j >= 0 && j <= n){ s += ys[j]; c++; } } pts[i].y = s / c; }
  }
  const Sc = [0];
  for(let i = 1; i <= n; i++) Sc.push(Sc[i - 1] + pts[i].distanceTo(pts[i - 1]) / M);
  const seg = {id: SEGS.length, name: def.name, def, line, pts, xs, lats, vis, S: Sc, len: Sc[n], node: [null, null], grp: [0, 0],
    main: !!def.o.main, noRev: !!def.o.noRev, dir: def.o.dir || 0, res: null, place: def.o.place || ''};
  seg.vmax = seg.main ? (seg.len > 700 ? (def.o.vline || 99) : (def.o.vstation || 9)) : (def.o.vmax || 4.5);
  SEGS.push(seg);
  return seg;
}
function buildNetwork(){
  // split each road wherever another road's end lies on it
  const cuts = DEFS.map(() => new Set());
  DEFS.forEach((d, i) => [d.xa, d.xb].forEach(x => {
    const lat = d.lat(x);
    DEFS.forEach((o, j) => { if(j !== i && o.line === d.line && x > o.xa + 0.5 && x < o.xb - 0.5 && Math.abs(o.lat(x) - lat) < 0.05) cuts[j].add(x); });
  }));
  DEFS.forEach(d => { if(d.o.on){ const j = DEFS.indexOf(d.o.on.def); if(j >= 0) cuts[j].add(d.o.on.x); } });
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
    for(let i = -1; i <= 1; i++) for(let k = -1; k <= 1; k++) (grid.get((cx + i) + ',' + (cz + k)) || []).forEach(f => { if(!used.has(f) && Math.hypot(f.p.x - e.p.x, f.p.z - e.p.z) < 0.25 * M) near.push(f); });
    near.forEach(f => used.add(f));
    if(near.length < 2) return;                            // a buffer stop
    const node = {id: NODES.length, p: e.p.clone(), ends: near, grp: [[], []], state: [0, 0], lever: null};
    near.forEach(f => { const g = f.out.dot(e.out) > 0 ? 0 : 1; f.g = g; node.grp[g].push(f); f.seg.node[f.end] = node; f.seg.grp[f.end] = g; });
    NODES.push(node);
  });
}

// ================================================================== places on the track
// A place: {seg, s, f}; f is the way it faces (+1: towards the segment's far end, which is up the line).
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
  const S = seg.S; let lo = 1, hi = S.length - 1;
  if(s <= 0) return 1; if(s >= seg.len) return S.length - 1;
  while(lo < hi){ const m = (lo + hi) >> 1; if(S[m] < s) lo = m + 1; else hi = m; }
  return lo;
}
function pointAt(p, out){
  const seg = p.seg, i = idxAt(seg, p.s), a = seg.pts[i - 1], b = seg.pts[i], t = (p.s - seg.S[i - 1]) / ((seg.S[i] - seg.S[i - 1]) || 1);
  return out.lerpVectors(a, b, Math.max(0, Math.min(1, t)));
}
function xAt(p){ const seg = p.seg, i = idxAt(seg, p.s), t = (p.s - seg.S[i - 1]) / ((seg.S[i] - seg.S[i - 1]) || 1); return seg.xs[i - 1] + (seg.xs[i] - seg.xs[i - 1]) * t; }
function visAt(p){ const seg = p.seg, i = idxAt(seg, p.s); return seg.vis[i] && seg.vis[i - 1]; }
const BYNAME = new Map();
// the place on a named road at x metres along its line (facing up the line)
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
function newCut(vs){ const c = {id: ++cutId, vs, away: false}; vs.forEach(v => v.cut = c); CUTS.push(c); return c; }
const cutLen = c => c.vs.reduce((s, v, i) => s + v.L + (i ? GAP : 0), 0);
// one end of a cut, facing outwards ('A': the first vehicle's end, 'B': the last's)
function endPos(c, e){ const n = c.vs.length - 1; return e === 'A' ? walk(c.vs[0].pos, c.vs[0].L / 2) : walk(flip(c.vs[n].pos), c.vs[n].L / 2); }
// lay a cut out with its A end at place p (p faces out of the cut, the way the A end points)
function layCut(c, p){
  let d = 0; const into = flip(p);
  c.vs.forEach((v, i) => { d += (i ? GAP : 0) + v.L / 2; v.pos = flip(walk(into, d)); d += v.L / 2; v.dirty = true; });
}
function reverseCut(c){ c.vs.reverse(); c.vs.forEach(v => { v.pos = flip(v.pos); v.rev = !v.rev; }); }
// cut a: its aEnd meets cut b's bEnd; b joins a
function merge(a, aEnd, b, bEnd){
  if(aEnd === 'A') reverseCut(a);
  if(bEnd === 'B') reverseCut(b);
  a.vs = a.vs.concat(b.vs); b.vs.forEach(v => v.cut = a);
  CUTS.splice(CUTS.indexOf(b), 1);
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
  c.vs.forEach(v => { v.pos = lead === 'A' ? walk(v.pos, d) : flip(walk(flip(v.pos), d)); v.dirty = true; v.spin += (lead === 'A' ? 1 : -1) * (v.rev ? -1 : 1) * d; v.moving = true; });
}
const engEnd = (c, e) => c.vs[0] === e ? 'A' : c.vs[c.vs.length - 1] === e ? 'B' : (c.vs[1] === e ? 'A' : 'B');
// which end leads: the engine's when it has a train; either when it runs light
const lone = e => e.cut.vs.every(v => v.eng || v.tender);
const leadEnd = e => lone(e) ? undefined : engEnd(e.cut, e);
const other = e => e === 'A' ? 'B' : 'A';
// the engine and its tender count as one when coupling and uncoupling
const unitLen = e => e.unit.length;

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
  CUTS.forEach(c => { if(c.away) return; c.vs.forEach(v => spans(v).forEach(([seg, a, b]) => { if(!OCC.has(seg)) OCC.set(seg, []); OCC.get(seg).push({a, b, cut: c}); })); });
  occTick = tick;
  return OCC;
}
function nodeLocked(n){
  const occ = occupancy();
  return n.ends.some(e => (occ.get(e.seg) || []).some(q => e.end === 0 ? q.a < 1.2 : q.b > e.seg.len - 1.2));
}

// ================================================================== the planner
// goal: {pos, f, end} a place for one end of the cut ('A', 'B'); or {couple: cut, end, at} to couple
// the cut's `end` (any if not given) to the other cut's end `at` (any if not given).
function plan(c, goal){
  const L = cutLen(c), occ = occupancy(), tgt = goal.couple || null;
  const T = new Map();
  const addT = (seg, s, f) => { if(!T.has(seg)) T.set(seg, []); T.get(seg).push({s, f}); };
  if(tgt){ (goal.at ? [goal.at] : ['A', 'B']).forEach(e => { const p = endPos(tgt, e); addT(p.seg, p.s, -p.f); }); }
  else { if(!goal.pos) return null; addT(goal.pos.seg, goal.pos.s, goal.f || 0); }
  const blocked = (seg, a, b) => {
    if(goal.yard && seg.main && seg.len > 300) return true;          // a yard pilot keeps off the open line
    const iv = occ.get(seg); if(!iv) return false;
    // on the open line, trains ahead are kept apart by the signals as they run, not by the plan
    if(seg.dir && seg.len > 700) return iv.some(q => q.cut === tgt && q.b > Math.min(a, b) + 0.4 && q.a < Math.max(a, b) - 0.4);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return iv.some(q => q.cut !== c && (q.cut === tgt ? q.b > lo + 0.4 && q.a < hi - 0.4 : q.b > lo - 0.3 && q.a < hi + 0.3));
  };
  // running against the traffic on the open line costs dear: only within station limits
  // (a short way only, to back into a siding or clear a crossover; never along the open line)
  const cost = (seg, f, d) => seg.dir && seg.dir !== f && seg.len > 700 ? (d > 400 ? Infinity : d * 3 + 60) : d;
  const best = new Map(), Q = [];
  const push = st => { const k = st.seg.id + '|' + st.f + '|' + st.lead + '|' + st.tag; if(best.has(k) && best.get(k) <= st.c + 1e-9) return; best.set(k, st.c); Q.push(st); };
  ['A', 'B'].forEach(lead => { const p = endPos(c, lead); push({seg: p.seg, f: p.f, s: p.s, lead, c: 0.5, rev: 0, tag: 's' + lead, prev: null, act: null}); });
  let sol = null, guard = 0;
  while(Q.length && guard++ < 20000){
    let bi = 0; for(let i = 1; i < Q.length; i++) if(Q[i].c < Q[bi].c) bi = i;
    const st = Q[bi]; Q[bi] = Q[Q.length - 1]; Q.pop();
    if(sol && st.c >= sol.c) break;
    const tl = T.get(st.seg);
    if(tl && (!goal.end || goal.end === st.lead)) for(const t of tl){
      if(t.f && t.f !== st.f) continue;
      const ds = (t.s - st.s) * st.f;
      if(ds < -0.05 || blocked(st.seg, st.s, t.s)) continue;
      const cc = st.c + cost(st.seg, st.f, Math.max(0, ds));
      if(cc < Infinity && (!sol || cc < sol.c)) sol = {c: cc, st, s: t.s};
    }
    const exitS = st.f > 0 ? st.seg.len : 0, end = st.f > 0 ? 1 : 0, n = st.seg.node[end];
    if(n && !blocked(st.seg, st.s, exitS)){
      const g = 1 - st.seg.grp[end], others = n.grp[g], locked = others.length > 1 && nodeLocked(n);
      const cc = st.c + cost(st.seg, st.f, Math.abs(exitS - st.s)) + 0.01;
      if(cc < Infinity) others.forEach((e, idx) => {
        if(locked && n.state[g] !== idx) return;
        push({seg: e.seg, f: e.end === 0 ? 1 : -1, s: e.end === 0 ? 0 : e.seg.len, lead: st.lead, c: cc, rev: st.rev, tag: 'n', prev: st, act: others.length > 1 ? {node: n, g, idx} : {}});
      });
    }
    // turn back: the whole cut drawn up on this road, just clear of the points behind it
    if(st.rev < 5 && !st.seg.noRev && st.seg.len >= L + 9){
      const sR = st.f > 0 ? Math.max(st.s, L + 6) : Math.min(st.s, st.seg.len - L - 6);
      const tail = sR - st.f * L;
      if(tail >= 2.5 && tail <= st.seg.len - 2.5 && !blocked(st.seg, st.s, sR) && !blocked(st.seg, tail, sR) && cost(st.seg, st.f, Math.abs(sR - st.s)) < Infinity)
        push({seg: st.seg, f: -st.f, s: tail, lead: other(st.lead), c: st.c + cost(st.seg, st.f, Math.abs(sR - st.s)) + 80, rev: st.rev + 1, tag: 'r' + st.rev, prev: st, act: {rev: true, sR}});
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
const ACC = 0.3, DEC = 0.45;
function startLeg(c, leg, o = {}){ return {c, leg, lead: leg.lead, dist: 0, v: 0, next: 0, held: new Set(), wait: 0, vmax: o.vmax || 6, done: false, fail: false}; }
function stepLeg(m, dt){
  const leg = m.leg, steps = leg.steps, L = cutLen(m.c);
  // reserve the road ahead (beyond braking distance) and set the points
  // Routes are set a whole station at a time: every road up to the next stretch of open line is
  // taken together or not at all, so two trains never each hold half of the other's way.
  const look = 500 + m.v * m.v / (2 * DEC) * 1.3;
  while(m.next < steps.length && steps[m.next].d0 - m.dist < look){
    let j = m.next;
    // a move against the traffic (into a siding, across to a loop) takes its whole way at once
    if(leg.wrong === undefined) leg.wrong = steps.some(st => st.seg.dir && st.seg.dir !== st.f);
    if(leg.wrong) j = steps.length;
    else while(j < steps.length){ const long = steps[j].seg.len > 700; j++; if(long) break; }
    const chunk = steps.slice(m.next, j);
    // never reserve road beyond a train standing in front: wait behind it instead
    const occN = occupancy();
    if(chunk.some(st => st.seg.len > 700 && st.seg.dir && (occN.get(st.seg) || []).some(q => q.cut !== m.c && q.cut !== leg.couple))) break;
    const ok = chunk.every(st => !(st.seg.res && st.seg.res !== m && st.seg.res.alive) && !(st.sw && st.sw.node.state[st.sw.g] !== st.sw.idx && nodeLocked(st.sw.node)));
    if(!ok) break;
    chunk.forEach(st => {
      if(st.sw && st.sw.node.state[st.sw.g] !== st.sw.idx){ st.sw.node.state[st.sw.g] = st.sw.idx; throwLever(st.sw.node); }
      st.seg.res = m; m.held.add(st.seg);
    });
    m.next += chunk.length;
  }
  m.alive = true;
  let limit = (m.next < steps.length ? steps[m.next].d0 - 4 : leg.total) - m.dist;
  // anything standing or moving on the road ahead
  const occ = occupancy();
  for(let k = 0; k < m.next; k++){
    const st = steps[k];
    if(st.d0 - m.dist > limit) break;
    (occ.get(st.seg) || []).forEach(q => {
      if(q.cut === m.c) return;
      const edge = st.f > 0 ? q.a : q.b, dd = st.d0 + (edge - st.sIn) * st.f;
      if(dd < m.dist - 0.3) return;                        // behind the leading end
      const room = dd - m.dist - (q.cut === leg.couple ? 0 : 3);
      if(room < limit) limit = room;
    });
  }
  // speed: the slowest road under the cut, and braking for slower roads ahead
  let vcap = m.vmax;
  for(let k = 0; k < steps.length; k++){
    const st = steps[k], a = st.d0, b = st.d0 + Math.abs(st.sOut - st.sIn);
    if(b < m.dist - L - 1) continue;
    if(a > m.dist + 1500) break;
    const ahead = Math.max(0, a - m.dist);
    vcap = Math.min(vcap, Math.sqrt(st.seg.vmax * st.seg.vmax + 2 * DEC * ahead));
  }
  limit = Math.max(0, limit);
  m.v = Math.min(vcap, Math.sqrt(2 * DEC * limit), m.v + ACC * dt);
  const d = Math.min(limit, m.v * dt);
  moveCut(m.c, m.lead, d);
  m.dist += d;
  // let go of the road behind
  for(const seg of m.held){
    let last = -1; steps.forEach(st => { if(st.seg === seg) last = Math.max(last, st.d0 + Math.abs(st.sOut - st.sIn)); });
    if(last >= 0 && last < m.dist - L - 3 && seg.res === m){ seg.res = null; m.held.delete(seg); }
  }
  if(leg.total - m.dist < 0.03){ finishLeg(m); return 'done'; }
  if(d < 1e-4){ m.wait += dt; if(m.wait > 300){ releaseLeg(m); m.fail = true; return 'fail'; } } else m.wait = 0;
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
// home signals: a lower-quadrant arm that drops when the road beyond is set and held for a train
const SIGNALS = [], SIG_WHITE = new THREE.MeshStandardMaterial({color: 0xeeeeea, roughness: 0.6}), SIG_ARM = new THREE.MeshStandardMaterial({color: 0xc8262b, roughness: 0.5});
function signalAt(name, x, f, side){
  const p = at(name, x); if(!p) return;
  const w = pointAt(p, new V3()), q = pointAt(walk({...p, f}, 3), new V3());
  const g = new THREE.Group(); g.position.copy(w); g.rotation.y = Math.atan2(q.x - w.x, q.z - w.z); g.scale.setScalar(M);
  K.box(g, 0.22, 7, 0.22, SIG_WHITE, side * 2.9, 3.5, 0);
  const piv = new THREE.Group(); piv.position.set(side * 2.9, 6.4, -0.15); g.add(piv);
  K.box(piv, 1.4, 0.28, 0.06, SIG_ARM, side * 0.75, 0, 0);
  TRACK_G.add(g);
  SIGNALS.push({piv, at: walk({...p, f}, 6), side, cur: 0});
}
function updateSignals(dt){
  SIGNALS.forEach(s => { const r = s.at.seg.res, want = r && r.alive ? -0.7 : 0; s.cur += (want - s.cur) * Math.min(1, dt * 3); s.piv.rotation.z = s.side * s.cur; });
}

// vehicles: placed from two points on the track either side of their middle
const _a = new V3(), _b = new V3(), _c = new V3();
const FAR = 1.35, NEAR = 0.45;
function render(v, cp){
  const g = v.v.group;
  if(v.cut.away) return;
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
  if(v.eng && v.moving && !v.diesel && v.v.chimneyAt && g.visible && camDist < 3){
    v.puff = (v.puff || 0) - 1;
    if(v.puff <= 0){ v.puff = 18; _a.copy(v.v.chimneyAt); g.localToWorld(_a); K.puff(_a); }
  }
  v.moving = false;
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
  const vs = NWR.engineUnit ? NWR.engineUnit(rec) : [rec.veh];
  if(o.tag && NWR.tagEngine) NWR.tagEngine(rec);
  const rs = vs.map((v, i) => { const r = vrec(v, {eng: i === 0 && (o.works || rec.cat !== 'Former') ? rec : null, diesel: rec.cat === 'Diesel' || !!(rec.run && rec.run.diesel), name: rec.name}); r.tender = i > 0; return r; });
  rs[0].unit = rs; rs[0].id = id;
  return rs[0];
}
function stock(key, ctx){
  if(!NWR.STOCK_STD[key]) return null;
  const v = NWR.makeStock(key); v.group.scale.setScalar(M); scene.add(v.group);
  if(NWR.tagStock) NWR.tagStock(v, ctx);
  return vrec(v, {name: NWR.STOCK_STD[key].name});
}

// ================================================================== laying out sidings
const roadEnd = (name, which) => { const segs = BYNAME.get(name) || []; const xs = segs.flatMap(s => [s.xs[0], s.xs[s.xs.length - 1]]); return which === 'up' ? Math.max(...xs) : Math.min(...xs); };
const deadUp = name => (BYNAME.get(name) || []).some(s => !s.node[1]);
const bufX = name => deadUp(name) ? roadEnd(name, 'up') - 1.5 : roadEnd(name, 'down') + 1.5;
const ZONES = [];                                          // stretches of line left alone (Knapford's yards, Tidmouth Sheds)
function score(line, xa, xb, lat, base){
  let bad = 0; const L = LEN(line);
  for(let x = xa; x <= xb; x += 6){
    const l = lat(x), b0 = base(x); if(Math.abs(l - b0) < 3.5) continue;
    const p = linePoint(line, x, l, new V3()), ty = linePoint(line, x, 0, new V3()).y, h = heightAt(p.x, p.z);
    if(h < 0.4 * M) bad += 5;
    if(Math.abs(h + 0.55 * M - ty) > 2.4 * M) bad += 2;
    if(K.nearTrack(p.x, p.z, 3.4 * M)) bad += 4;
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
    if(Math.min(toe, endX) < (o.min || 200) || Math.max(toe, endX) > LEN(line) - (o.max || 400)) continue;
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
  for(const side of (o.sides || [1, -1])) for(const sh of [0, 60, -60, 120]){
    const a = xa + sh, b = xb + sh, bl = base(side), lat = x => bl(x) + side * 4.6 * smooth(a, a + 40, x) * (1 - smooth(b - 40, b, x));
    const sc = score(line, a, b, lat, bl) + Math.abs(sh) * 0.005;
    if(!best || sc < best.sc) best = {sc, a, b, lat, side, bl};
  }
  if(!best || best.sc > 6) return null;
  road(line, name, best.a, best.b, best.lat, {place: o.place, base: best.bl});
  reserveGround(line, best.a, best.b, best.lat);
  return {name, a: best.a, b: best.b, side: best.side};
}

// ================================================================== the Ffarquhar branch
const dF = d => Lm - d;                                    // Ffarquhar: d metres back from the buffers
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
const BR = {line: LF, road: () => 'main', sid: {}, stations: LF.stops.map(k => STATIONS[k].name).filter(n => n !== 'Knapford' && n !== 'Ffarquhar').map(n => ({name: n, x: K.lineU(LF, n) * Lm}))};
BR.stations.forEach(st => {
  const s = siding(LF, 'g_' + st.name, lfBase, st.x, [125, 140, 160, -125, -140, -160], {place: `the goods siding at ${st.name}`});
  if(s) BR.sid[st.name] = {[s.serves]: s.name};
});
const kx = siding(LF, 'kExchange', lfBase, 0, [330, 380, 450, 540, 640], {place: 'the exchange siding outside Knapford'});

// ================================================================== the Main Line
const KX = KNAP.line ? KNAP.u0 * LmM : -1e9;
const upLat = x => KNAP.line && Math.abs(x - KX) < 400 ? KNAP.mainX('up', x - KX) : MAIN_LANE;
const downLat = x => KNAP.line && Math.abs(x - KX) < 400 ? KNAP.mainX('down', x - KX) : -MAIN_LANE;
const mBase = side => side > 0 ? upLat : downLat;
const MLup = road(LM, 'up', 2, LmM - 2, upLat, {main: true, dir: 1, noDraw: true, vline: 99, vstation: 11});
const MLdown = road(LM, 'down', 2, LmM - 2, downLat, {main: true, dir: -1, noDraw: true, vline: 99, vstation: 11});
const xover = (name, a, b, from, to, o = {}) => road(LM, name, a, b, x => from(x) + (to(x) - from(x)) * smooth(a, b, x), {vmax: 8, ...o});
const scissors = (tag, a, b) => { xover(tag + 'a', a, b, upLat, downLat); xover(tag + 'b', a, b, downLat, upLat); };
const MS = LM.stops.map(k => ({name: STATIONS[k].name, x: K.lineU(LM, STATIONS[k].name) * LmM}));
MS.find(s => s.name === 'Tidmouth').x = 0; MS.find(s => s.name === 'Barrow-in-Furness').x = LmM;
const ML = {line: LM, road: d => d > 0 ? 'up' : 'down', sid: {}, loops: {}, stations: MS.filter(s => s.x > 10 && s.x < LmM - 10)};
ZONES.push({line: LM, a: 0, b: 480}, {line: LM, a: KX - 430, b: KX + 430});

// the main-line trains and the stations where they turn back
const MAIN_IDS = ['gordon', 'rebecca', 'henry', 'james', 'murdoch', 'nia'].filter(id => NWR.RUNS[id] && NWR.byId[id] && NWR.byId[id].runner);
const BASE_OF = {nia: 'Wellsworth'};                       // Nia is based at Wellsworth Sheds
const TURN_OF = {nia: 'Knapford'};                         // and turns her goods back at Knapford, clear of the expresses at Tidmouth
const REV = new Set(['Tidmouth', 'Barrow-in-Furness']);
MAIN_IDS.forEach(id => { REV.add(BASE_OF[id] || NWR.RUNS[id].from); REV.add(TURN_OF[id] || (BASE_OF[id] === NWR.RUNS[id].to ? NWR.RUNS[id].from : NWR.RUNS[id].to)); });
// Tidmouth and Barrow: two roads to the buffers, scissors crossovers to release the engine and at the throat
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
// the other stations where trains turn back: scissors crossovers either side of the platforms, and a loop
MS.forEach(st => {
  if(!REV.has(st.name) || st.name === 'Knapford' || st.x < 10 || st.x > LmM - 10) return;
  scissors('xS_' + st.name, st.x - 140, st.x - 100); scissors('xN_' + st.name, st.x + 100, st.x + 140);
  // a loop off each road, so a train on either road can turn back clear of the through traffic
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
// where the Steam Team hand over to the Tidmouth Sheds crew: the up road at the foot of the shed lead
const IN = window.SODOR_KIT.roundhouse && window.SODOR_KIT.roundhouse.inPath;
// The crew take engines over where their path starts, on the up road south of the sheds; a crossover
// just beyond lets engines from the south step across to it without going through Tidmouth's platforms.
let HAND = null;
if(IN && IN.length > 4){
  const q = toLine(LM, IN[0], 750, 600);
  if(Math.abs(q.lat - MAIN_LANE) < 0.6){
    HAND = {k: 0, x: q.x + 1};
    xover('xHand', HAND.x + 120, HAND.x + 160, upLat, downLat);
  }
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

buildNetwork();
SEGS.forEach(s => { if(!BYNAME.has(s.name)) BYNAME.set(s.name, []); BYNAME.get(s.name).push(s); });
SEGS.forEach(drawSeg);
SEGS.forEach(seg => [0, 1].forEach(end => { if(!seg.node[end] && !(seg.line === LF && seg.main && ((end === 0 && seg.xs[0] < 2) || (end === 1 && seg.xs[seg.xs.length - 1] > Lm - 3)))) bufferAt(seg, end); }));
NODES.forEach(n => { if(n.grp[0].length > 1 || n.grp[1].length > 1) leverAt(n); });
SEGS.forEach(seg => { if(seg.main) return; for(let i = 0; i < seg.pts.length; i += 4){ const p = seg.pts[i]; K.clearArea(p.x, p.z, 6 * M); } });
// home signals on the approach to each station where trains turn back
MS.forEach(st => {
  if(!REV.has(st.name) || st.name === 'Knapford') return;
  if(st.x > 600) signalAt('up', st.x - 420, 1, 1);
  if(st.x < LmM - 600) signalAt('down', st.x + 420, -1, -1);
});
if(KNAP.line){ signalAt('up', KX - 380, 1, 1); signalAt('down', KX + 380, -1, -1); }
if(K.trees && K.trees.invalidate) K.trees.invalidate();
// little engine sheds over the engine sidings on the Main Line
const SHED_WALL = K.mat(0x8a4a32, 0.85), SHED_ROOF = K.mat(0x3a3f46, 0.75);
Object.values(MAIN).forEach(B => Object.values(B.engHomes).forEach(name => {
  const segs = BYNAME.get(name); if(!segs) return;
  const up = deadUp(name), x1 = bufX(name), x0 = x1 + (up ? -24 : 24), a = at(name, x1), b = at(name, x0); if(!a || !b) return;
  const pa = pointAt(a, new V3()), pb = pointAt(b, new V3()), c = pa.clone().add(pb).multiplyScalar(0.5), l = pa.distanceTo(pb) / M;
  const g = new THREE.Group(); g.position.set(c.x, Math.min(pa.y, pb.y), c.z); g.rotation.y = Math.atan2(pa.x - pb.x, pa.z - pb.z); g.scale.setScalar(M);
  for(const e of [-1, 1]) K.box(g, 0.4, 5.6, l, SHED_WALL, e * 2.9, 2.8, 0);
  K.box(g, 6.2, 5.6, 0.4, SHED_WALL, 0, 2.8, l / 2);
  K.box(g, 6.2, 1.1, 0.4, SHED_WALL, 0, 5.05, -l / 2);
  S.gable(g, 6.8, l + 0.6, 5.6, SHED_ROOF, 0, 0);
  TRACK_G.add(g);
}));

// ================================================================== stopping places
const KNAP_STOP = 54, FFAR_STOP = dF(56);                  // the engine's buffers, arriving at either end of the branch
const TID_STOP = 112, BAR_STOP = LmM - 112;
// the stations at the ends of a train's run: where it stands, and which way the buffers are
function terminus(LC, name){
  let T;
  if(LC.line === LF) T = name === 'Knapford' ? {name, x: 88, end: 'low', stop: KNAP_STOP} : {name, x: Lm, end: 'high', stop: FFAR_STOP};
  else if(name === 'Tidmouth') T = {name, x: 0, end: 'low', stop: TID_STOP};
  else if(name === 'Barrow-in-Furness') T = {name, x: LmM, end: 'high', stop: BAR_STOP};
  else T = {name, x: MS.find(s => s.name === name).x, end: null};
  // the roads a train can stand on there: both main roads, and the loop for goods trains
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
  if(!T.roads.length) return {name: D.LC.road(dir), x: departing ? (T.end ? T.stop : T.x - dir * L / 2) : (T.end ? T.stop : T.x + dir * L / 2)};
  // at a through station a terminating train goes into the loop, clear of the through roads; at the end of the line, the platforms
  const order = T.end ? ['platform', 'loop'] : ['loop', 'platform'];
  const cands = [];
  order.forEach(kind => T.roads.filter(r => r.kind === kind).sort((a, b) => (a.name === D.LC.road(dir) ? -1 : 0) - (b.name === D.LC.road(dir) ? -1 : 0)).forEach(r => cands.push(r)));
  const claimed = name => DUTIES.some(o => o !== D && o.claim === name);
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
  const vs = keys.map(k => stock(k, ctx)).filter(Boolean); if(!vs.length) return null;
  const c = newCut(vs), up = deadUp(name), p = at(name, up ? bufX(name) : bufX(name) + cutLen(c));
  if(p) layCut(c, p);
  return c;
}
// a cut on a road with its A end at x, facing up the line (or down)
function lay(vs, name, x, f = 1){ const c = newCut(vs), p = at(name, x); if(p) layCut(c, f > 0 ? p : flip(p)); return c; }
// put a cut away at a road's buffers (or up to what stands there)
function layHome(vs, name){
  const up = deadUp(name), c = newCut(vs), L = cutLen(c);
  const p = at(name, up ? bufX(name) : bufX(name) + L);
  if(p) layCut(c, p);
  return c;
}
function runnerStock(rec){
  const R = rec.runner; R.manual = true; R.track = true;
  return R.cars.map(cv => vrec(cv.v, {name: cv.v.name}));
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
function parseWork(list){ return (list || [['00:00', 'stopping', '', 'main']]).map(([t, kind, txt, rake]) => ({t: hm(t), kind, txt: txt || kind, rake: rake || 'main'})).sort((a, b) => a.t - b.t); }
function workAt(W, t){ const tod = mod(t, 1440); let w = W[W.length - 1]; W.forEach(x => { if(x.t <= tod) w = x; }); return w; }
const inHours = (h, t) => { const tod = mod(t, 1440), on = hm(h[0]), off = hm(h[1]); return off > on ? tod >= on && tod < off : tod >= on || tod < off; };
const WORK_KIND = {stopping: {v: 0.92, dwell: 40}, express: {v: 1, dwell: 50}, fast: {v: 1.12, dwell: 35}, market: {v: 0.85, dwell: 110},
  mail: {v: 1, dwell: 120}, pickup: {v: 0.8, dwell: 60}, through: {v: 1.1, dwell: 35}, heavy: {v: 0.75, dwell: 35}};
const STEAM_TEAM = new Set(['thomas', 'gordon', 'james', 'percy', 'emily', 'rebecca', 'nia']);

// ================================================================== the duties
const DUTIES = [], BRAKE = /Brake|Toad|Spiteful/;
function makeDuty(o){
  const dd = (DUT.nwr || {})[o.id] || {};
  const D = {id: o.id, name: o.name, LC: o.LC, rota: o.rota, shifts: parseShifts(dd.shifts), work: parseWork((DUT.work || {})[o.id]), note: dd.note || '',
    A: terminus(o.LC, o.A), B: terminus(o.LC, o.B), rakes: o.rakes, homes: o.homes, engHomes: o.engHomes, coal: o.coal || null,
    speed: o.speed, stopsAt: o.stopsAt || null, passenger: !!o.passenger, runner: o.runner, exchange: o.exchange || {}, label: o.label,
    doing: 'on shed', rake: null, cur: 0, w: null, faceFixed: o.faceFixed};
  D.d = Math.sign(D.B.x - D.A.x);
  D.rakeCut = {}; Object.entries(D.rakes).forEach(([k, r]) => D.rakeCut[k] = r.vs.find(v => BRAKE.test(v.name)) || r.vs[r.vs.length - 1]);
  D.rota.forEach(e => { e.duty = D; });
  DUTIES.push(D);
  return D;
}

// ---- Thomas, Rosie and the branch stock
const TH = NWR.byId.thomas;
const thomas = engine('thomas'), rosie = engine('rosie');
const [annie, clarabel] = runnerStock(TH);
const ctxT = {rec: TH, run: TH.run};
const tTrucks = ['thomasTruck', 'thomasTruck', 'brakeVan'].map(k => stock(k, ctxT)).filter(Boolean);
const glynn = engine('glynn', {works: true, tag: false});
const coffeepots = ['coffeepot2', 'coffeepot3'].map(id => NWR.byId[id] ? engine(id) : null).filter(Boolean);
const DB = makeDuty({id: 'thomas', name: 'Thomas', LC: BR, rota: [thomas].concat(rosie ? [rosie] : []), A: 'Ffarquhar', B: 'Knapford', label: 'Ffarquhar branch',
  rakes: {main: {vs: [annie, clarabel], label: 'Annie and Clarabel'}, trucks: {vs: tTrucks, label: 'the goods trucks'}},
  homes: {main: 'fCar1', trucks: 'fGoods'}, engHomes: {Thomas: 'fShed1', Rosie: 'fShed2'}, coal: 'fCoal', speed: TH.run.speed || 15,
  passenger: true, runner: TH.runner, exchange: kx ? {Knapford: {name: 'kExchange', dir: 1}} : {}, faceFixed: 1});
// ---- the Main Line trains
MAIN_IDS.forEach(id => {
  const rec = NWR.byId[id], run = NWR.RUNS[id], B = MAIN[id];
  const rota = B.rota.map(r => engine(r)).filter(Boolean);
  const ctx = {rec, run};
  const rakes = {main: {vs: runnerStock(rec), label: run.passenger ? 'the coaches' : 'the train'}};
  Object.entries((DUT.rakes || {})[id] || {}).forEach(([k, keys]) => { const vs = keys.map(s => stock(s, ctx)).filter(Boolean); if(vs.length) rakes[k] = {vs, label: k === 'local' ? 'the suburban coaches' : `the ${k} train`}; });
  // a rake or engine with no siding of its own shares the first one found
  const anyHome = Object.values(B.homes)[0], anyEng = Object.values(B.engHomes)[0];
  const homes = {}, engHomes = {};
  Object.keys(rakes).forEach(k => homes[k] = B.homes[k] || anyHome);
  rota.forEach(e => engHomes[e.eng.name] = B.engHomes[e.id] || anyEng || anyHome);
  makeDuty({id, name: rec.name, LC: ML, rota, A: B.A, B: B.B, rakes, homes, engHomes, speed: run.speed, stopsAt: run.stopsAt, passenger: !!run.passenger,
    runner: rec.runner, label: `${B.A} – ${B.B}`});
});

// ---- lay everything out as it stands at the start
// Ffarquhar yard and the branch sidings
const CUT = {};
CUT.yard1 = wagonsIn('fLadder', ['stoneTruck', 'stoneTruck', 'thomasTruck', 'stoneTruck'], ctxY);
CUT.yard2 = wagonsIn('fCoal', ['truck', 'truckB'], ctxY);
if(coffeepots.length) CUT.museum = layHome(coffeepots.flatMap(e => e.unit), 'fCar2');
if(glynn) lay(glynn.unit, 'fCar2', bufX('fCar2') - (CUT.museum ? cutLen(CUT.museum) + 4 : 0));
let wi = 0;
Object.values(BR.sid).forEach(m => Object.values(m).forEach(name => { if(wi++ % 2 === 0) wagonsIn(name, [wi % 4 ? 'truck' : 'vanGrey'], ctxY); }));
if(kx) wagonsIn('kExchange', ['truck', 'vanGrey', 'truckB'], ctxY);
Object.values(ML.sid).forEach(m => Object.values(m).forEach(name => { if(wi++ % 2 === 0) wagonsIn(name, [['truck', 'vanGrey', 'oilTank', 'truckB'][wi % 4]], ctxY); }));
// each duty: its rakes and engines at home, the train formed up in the platform if it is at work
function facing(D, e, towardA){ return D.faceFixed ? (D.faceFixed !== towardA) : true; }
function departSpot(D, L){
  const A = D.A, d = D.d, name = D.LC.road(d);
  const x = A.end ? A.stop : A.x - d * L / 2;
  return {pos: at(name, x), f: -d};
}
DUTIES.forEach(D => {
  const turn = onTurn(D.shifts, simTime), on = turn ? D.rota[Math.min(turn.idx, D.rota.length - 1)] : null;
  Object.entries(D.rakes).forEach(([k, r]) => {
    if(on && k === 'main'){
      // formed up for the first train: the coaches nearest the buffers, the engine at the departure end
      const vs = r.vs.concat(on.unit.slice().reverse()), c = newCut(vs), sp = departSpot(D, cutLen(c));
      if(sp.pos) layCut(c, sp.f > 0 ? sp.pos : flip(sp.pos));
      on.unit.forEach(u => u.rev = facing(D, on, -D.d));
      D.rake = 'main'; D.cur = D.rota.indexOf(on); D.doing = `waiting to leave ${D.A.name}`;
    } else layHome(r.vs, D.homes[k]);
  });
  D.rota.forEach(e => { if(e !== on){ const c = layHome(e.unit, D.engHomes[e.eng.name]); } });
});

// ================================================================== jobs
// Jobs are generators: they yield {leg}, {wait: seconds} or {until: fn} and the driver carries them out.
const STATS = {moves: 0, legs: 0, reversals: 0, noPlan: 0, stuck: 0, couplings: 0, gaveUp: 0, last: ''};
function* go(e, goal, o = {}){
  const tries = o.tries || (e === glynn ? 6 : 60);
  for(let attempt = 0; attempt < tries; attempt++){
    const g = typeof goal === 'function' ? goal() : goal;
    const legs = g && plan(e.cut, g);
    if(!legs){ STATS.noPlan++; STATS.last = `${fmtTime(simTime)} ${e.name}: no way to ${g && g.pos ? g.pos.seg.name + ' ' + Math.round(xAt(g.pos)) : 'couple ' + (g && g.couple ? g.couple.vs[0].name : '?')}`; if(e.duty) e.duty.why = STATS.last; yield {wait: 20}; continue; }
    STATS.moves++; STATS.reversals += legs.length - 1;
    let ok = true;
    for(let i = 0; i < legs.length; i++){
      if(i) yield {wait: 12};                              // the driver changes ends
      // long runs go at line speed; shunting moves at walking pace
      const vm = o.vmax || (legs[i].total > 2500 ? (e.duty ? Math.min(22, e.duty.speed) : 15) : 6);
      const m = startLeg(e.cut, legs[i], {vmax: vm});
      STATS.legs++;
      const r = yield {leg: m};
      if(r === 'fail'){ ok = false; STATS.stuck++; const ns = m.leg.steps[m.next]; STATS.lastStuck = `${fmtTime(simTime)} ${e.name} on ${m.c.vs[0].pos.seg.name}, waiting for ${ns ? ns.seg.name + '@' + Math.round(ns.seg.xs[0]) + (ns.seg.res && ns.seg.res.alive ? ' held by ' + ((ns.seg.res.c.vs.find(v => v.eng) || {}).name || 'wagons') : ns.sw && nodeLocked(ns.sw.node) ? ' points locked' : '') : 'something in the way'}`; if(e.duty) e.duty.why = STATS.lastStuck; break; }
      if(m.coupled) STATS.couplings++;
    }
    if(ok) return true;
    yield {wait: 15};
  }
  STATS.gaveUp++;
  return false;
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
// run round a train standing at a station, ending at its other end; keeps trying until it is done
function* runRound(e, D, T){
  const train = detach(e);
  if(!train) return;
  D.rr = T ? T.name : where(e.cut);                        // while it runs round, no other train takes the platforms
  D.doing = `running round the train at ${D.rr}`;
  yield {wait: 25};
  const far = nearEndToward(train, xAt(endPos(e.cut, 'A')));
  // keep at it until the way round is clear: never go off without the train
  for(let k = 0; ; k++){ if(yield* go(e, {couple: train, at: other(far)}, {tries: 6})) break; D.doing = `waiting to run round the train at ${D.rr}`; yield {wait: 120}; }
  D.rr = null;
  yield {wait: 30};
}
const busy = (name, me) => DUTIES.some(o => o !== me && o.rr === name);
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
  const x = up ? Math.min(...ends) - 4 : Math.max(...ends) + 4;
  return {pos: at(name, x), f: up ? 1 : -1, behind: cs[0]};
}
// at a station with a siding: put the wagon next to the engine in it if it is empty, else bring its wagons out
function* pickUp(e, D, sidingName, dir, where){
  const there = cutOn(sidingName), nv = e.cut.vs.length - e.unit.length;
  const dest = dir < 0 ? -1e9 : 1e9;
  if(there && nv > 0){
    D.doing = `shunting at ${where}: picking up from the siding`;
    const train = detach(e);
    if(!train) return;
    yield {wait: 20};
    if(!(yield* go(e, {couple: there}))){ yield* go(e, {couple: train, at: nearEndToward(train, dest)}, {tries: 200}); return; }
    yield {wait: 25};
    // back onto the train with the wagons, so they ride next to the engine
    if(!(yield* go(e, {couple: train, end: other(engEnd(e.cut, e)), at: nearEndToward(train, dest)}))) yield* go(e, {couple: train}, {tries: 200});
    yield {wait: 25};
  } else if(nv > 1){
    const atA = engEnd(e.cut, e) === 'A', wagon = e.cut.vs[atA ? e.unit.length : e.cut.vs.length - 1 - e.unit.length];
    if(!wagon || BRAKE.test(wagon.name) || wagon === D.rakeCut[D.rake] || D.passenger && D.rake === 'main'){ yield {wait: 40}; return; }
    D.doing = `shunting at ${where}: putting a wagon off in the siding`;
    const train = detach(e, 1);
    if(!train) return;
    yield {wait: 20};
    const sp = entrySpot(sidingName, e);
    yield* go(e, {pos: sp.pos, f: sp.f, end: other(engEnd(e.cut, e))});
    yield {wait: 20};
    detach(e);
    yield {wait: 15};
    yield* go(e, {couple: train, at: nearEndToward(train, dest)}, {tries: 200});
    yield {wait: 25};
  } else yield {wait: 40};
}
function rakeCut(D, name){ const v = D.rakeCut[name]; return v ? v.cut : null; }
// propel the train into its road and leave it there
function* stable(e, D){
  const home = D.homes[D.rake], r = D.rakes[D.rake] || {label: 'the train'};
  D.doing = `putting ${r.label} away`;
  const goal = () => { const w = cutOn(home), sp = entrySpot(home, e); return w ? {couple: w, end: other(engEnd(e.cut, e))} : {pos: sp.pos, f: sp.f, end: other(engEnd(e.cut, e))}; };
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
  if(c && c !== e.cut){ yield* go(e, {couple: c}); yield {wait: 25}; }
  D.rake = name;
  D.doing = `setting ${r.label} in the platform at ${D.A.name}`;
  // a free road to set the train out on (the far end leading in, so the engine is at the departure end)
  let sa = null;
  for(let k = 0; !sa; k++){ sa = standAt(D, D.A, D.d, cutLen(e.cut), e.cut, true); if(!sa){ D.doing = `waiting for a free road at ${D.A.name}`; yield {wait: 60}; } }
  D.claim = sa.name;
  const goal = () => { const s2 = standAt(D, D.A, D.d, cutLen(e.cut), e.cut, true) || sa; return {pos: at(s2.name, s2.x), f: -D.d, end: other(engEnd(e.cut, e))}; };
  if(!sa) return;
  if(!plan(e.cut, goal())){                                 // coupled at the wrong end: draw it in and run round
    yield* go(e, {pos: at(sa.name, sa.x), f: -D.d, end: leadEnd(e)});
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
  const between = LC.stations.filter(s => (s.x - from.x) * dir > 30 && (to.x - s.x) * dir > 30).sort((a, b) => (a.x - b.x) * dir);
  const calls = kind === 'express' ? (D.stopsAt || []) : kind === 'fast' || kind === 'through' || kind === 'heavy' ? [] : between.map(s => s.name);
  const vmax = D.speed * k.v;
  for(const st of between){
    if(!calls.includes(st.name)) continue;
    D.doing = `running to ${st.name}`;
    yield* go(e, () => ({pos: at(LC.road(dir), st.x + dir * cutLen(e.cut) / 2), f: dir, end: leadEnd(e)}), {vmax});
    D.doing = `at ${st.name}`;
    const sid = LC.sid[st.name] && LC.sid[st.name][dir];
    if(kind === 'pickup' && sid) yield* pickUp(e, D, sid, dir, st.name);
    else yield {wait: k.dwell};
  }
  D.doing = `running to ${to.name}`;
  // into a free road at the terminus; if there is none, wait at the home signal until there is
  for(let k2 = 0; ; k2++){
    const sa = standAt(D, to, dir, cutLen(e.cut), e.cut, false);
    if(sa){ D.claim = sa.name; if(to.roads.length && !/^loop|^kRoad/.test(sa.name)) D.rr = to.name;          // claim its road, and the platforms until it has run round
      if(yield* go(e, () => { const s2 = standAt(D, to, dir, cutLen(e.cut), e.cut, false) || sa; return {pos: at(s2.name, s2.x), f: dir, end: leadEnd(e)}; }, {vmax, tries: 8})) break; continue; }
    D.doing = `waiting at the home signal for a road into ${to.name}`;
    const hx = to.x - dir * (to.end ? -1 : 1) * 0 - dir * 700, hp = at(LC.road(dir), to.end === 'low' ? Math.max(700, hx) : to.end === 'high' ? Math.min(LmM - 700, hx) : hx);
    if(hp && (xAt(endPos(e.cut, engEnd(e.cut, e))) - xAt(hp)) * dir < -1) yield* go(e, {pos: hp, f: dir, end: leadEnd(e)}, {vmax, tries: 3});
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
  if(sp.pos && (!sp.behind || !hasEngine(sp.behind))){ yield* go(e, {pos: sp.pos, f: sp.f, end: leadEnd(e)}); yield {wait: 600}; }
}
function* onShed(e, D){
  const road = D.engHomes[e.eng.name];
  D.doing = 'going on shed';
  const sh = entrySpot(road, e);
  yield* go(e, {pos: sh.pos, f: sh.f, end: leadEnd(e)});
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
const travelMin = D => (Math.abs((D.LC === BR ? KX + 4000 : D.A.x) - (HAND ? HAND.x : 0)) + (D.LC === BR ? Lm : 0)) / 18 / 60 + 30;
function* goHome(e, D){
  const ops = window.SODOR_OPS;
  if(!HAND || !ops || !ops.goTidmouth || !STEAM_TEAM.has(e.id)) return false;
  const P = proxyOf(e), nt = nextTurn(P.shifts, 0, simTime);
  if(!nt || nt.t - simTime < 6 * 60) return false;        // not worth the trip tonight
  D.doing = `running light to Tidmouth Sheds`;
  const L = cutLen(e.cut);
  if(!(yield* go(e, {pos: at('up', HAND.x - L), f: -1}))) return false;
  yield {wait: 20};
  // the crew take over from the engine's back end, so it runs on without a jump
  const ends = ['A', 'B'].map(k => endPos(e.cut, k)), rear = xAt(ends[0]) > xAt(ends[1]) ? ends[0] : ends[1];
  P.fromPt = pointAt(rear, new V3());
  ops.goTidmouth(P);
  if(!P.tid || P.tid === 'none'){ P.tid = null; return false; }
  e.cut.away = true; e.away = true;
  return true;
}
// call the engines home from Tidmouth Sheds in good time for their next turn
function callHome(D){
  const ops = window.SODOR_OPS;
  D.rota.forEach(e => {
    if(!e.away || !e.proxy || !e.proxy.tid || e.proxy.tid === 'none') return;
    const nt = nextTurn(e.proxy.shifts, 0, simTime), turn = onTurn(D.shifts, simTime);
    const due = (turn && D.rota[Math.min(turn.idx, D.rota.length - 1)] === e) || (nt && nt.t - simTime < travelMin(D) + 60);
    if(due && !HANDSEG_BUSY()) ops.leaveTidmouth(e.proxy);
  });
}
const HANDSEG_BUSY = () => { if(!HAND) return false; const p = at('up', HAND.x); const occ = occupancy(); return (occ.get(p.seg) || []).some(q => Math.abs(q.a - p.s) < 60 || Math.abs(q.b - p.s) < 60); };
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
  while(v.cut !== e.cut){ if(yield* go(e, {couple: v.cut}, {tries: 10})) break; yield {wait: 120}; }
  yield {wait: 20};
}
// ------------------------------------------------------------------ one duty, all day
function* duty(D){
  D.rr = null; D.claim = null;
  for(;;){
    const turn = onTurn(D.shifts, simTime);
    callHome(D);
    if(!turn){ const e = D.rota[D.cur]; D.doing = e && e.away ? 'home at Tidmouth Sheds with the Steam Team' : `on shed at ${D.A.name}`; yield {wait: 60}; continue; }
    const e = D.rota[Math.min(turn.idx, D.rota.length - 1)];
    D.cur = D.rota.indexOf(e);
    if(e.away) yield* comeHome(e, D);
    while(onTurn(D.shifts, simTime) && onTurn(D.shifts, simTime).idx === turn.idx){
      const w = workAt(D.work, simTime), want = D.rakes[w.rake] ? w.rake : 'main';
      D.w = w;
      if(D.rake !== want){
        if(D.rake) yield* stable(e, D);
        yield* fetch(e, D, want);
      }
      yield* ensureTrain(e, D);
      yield* trip(e, D, true, w);
      yield* runRound(e, D, D.B);
      const xb = D.exchange[D.B.name];
      if(xb && w.kind === 'pickup' && D.rake === want) yield* pickUp(e, D, xb.name, xb.dir, D.B.name);
      D.w = workAt(D.work, simTime);
      yield* ensureTrain(e, D);
      yield* trip(e, D, false, D.w);
      // end of the turn, or a different train next: put this one away; otherwise run round and go again
      const still = onTurn(D.shifts, simTime), wn = workAt(D.work, simTime), wantN = D.rakes[wn.rake] ? wn.rake : 'main';
      if(!still || still.idx !== turn.idx || wantN !== D.rake){ yield* stable(e, D); if(still && still.idx === turn.idx) continue; break; }
      yield* runRound(e, D, D.A);
    }
    D.w = null;
    yield* coalUp(e, D);
    if(!(yield* goHome(e, D))) yield* onShed(e, D);
  }
}

// ------------------------------------------------------------------ Glynn, the Ffarquhar yard pilot
const GLYNN_HOURS = ['08:00', '17:30'];
const YARD_ROADS = ['fLadder', 'fCoal', 'fGoods'];
const G = {name: 'Glynn', doing: 'stabled in the carriage shed'};
function* yardPilot(){
  if(!glynn) return;
  const e = glynn;
  for(;;){
    if(!inHours(GLYNN_HOURS, simTime) || mod(Math.floor(simTime / 1440), 7) === 6){
      if(!G.home){
        G.doing = 'going back to the carriage shed';
        const sp = entrySpot('fCar2', e);
        G.home = yield* go(e, {pos: sp.pos, f: sp.f, end: leadEnd(e), yard: true});
      }
      G.doing = G.home ? 'stabled in the carriage shed' : 'waiting to get back to the carriage shed'; yield {wait: 300}; continue;
    }
    G.home = false;
    // wagons in one yard road to move to another (never Thomas's own trucks)
    const mine = v => !tTrucks.includes(v);
    const from = YARD_ROADS.filter(n => { const c = cutOn(n); if(!c) return false; const near = c.vs[nearEndToward(c, 0) === 'A' ? 0 : c.vs.length - 1]; return mine(near); });
    const src = from[Math.floor(rnd() * from.length)];
    const dst = YARD_ROADS.filter(n => n !== src)[Math.floor(rnd() * 2)];
    if(!src || !dst){ G.doing = 'waiting for work in the yard'; yield {wait: 600}; continue; }
    const c = cutOn(src);
    G.doing = `shunting at Ffarquhar Yards: fetching wagons from ${segName(src)}`;
    if(!(yield* go(e, {couple: c, yard: true}))){ yield {wait: 600}; continue; }
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
      const r = tries < 6 ? dst : src, there = cutOn(r), sp = entrySpot(r, e);
      if(there) put = yield* go(e, {couple: there, end: other(engEnd(e.cut, e)), yard: true});
      else if(!sp.behind) put = yield* go(e, {pos: sp.pos, f: sp.f, end: other(engEnd(e.cut, e)), yard: true});
      if(!put) yield {wait: 240};
    }
    yield {wait: 20};
    if(put){ if(engEnd(e.cut, e) === 'A') split(e.cut, 1); else split(e.cut, e.cut.vs.length - 1); }
    yield {wait: 15};
    G.doing = 'drawing back to the carriage shed';
    { const sp = entrySpot('fCar2', e); if(e.pos.seg.name !== 'fCar2') yield* go(e, {pos: sp.pos, f: sp.f, end: leadEnd(e), yard: true}); }
    G.doing = 'waiting between shunts';
    yield {wait: (12 + rnd() * 30) * 60};
  }
}
const segName = n => ({fLadder: 'the stone siding', fCoal: 'the coal road', fGoods: 'the goods siding'})[n] || n;

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
  const d = dt * timeScale, n = Math.max(1, Math.min(160, Math.ceil(d / 2)));
  for(let k = 0; k < n; k++){ tick++; DRIVERS.forEach(r => { try { stepDriver(r, d / n); } catch(err){ console.error('track.js driver', err); STATS.errors = (STATS.errors || 0) + 1; STATS.lastError = String(err); r.it = r.make(); r.cmd = {wait: 120}; } }); }
  const cp = camera.position;
  VEHS.forEach(v => render(v, cp));
  updateSignals(dt);
  // the old runner's lists follow the engine at work, for the level crossings and the map dot
  DUTIES.forEach(D => {
    const R = D.runner, e = D.rota[D.cur] || D.rota[0]; if(!R || !e) return;
    if(!e.cut.away){ R.engine = e.v; R.unit = [{v: e.v, len: e.L * M}]; const cs = e.cut.vs.filter(v => !e.unit.includes(v)); R.cars = (cs.length ? cs : [D.rakes.main.vs[0]]).map(v => ({v: v.v, len: v.L * M})); }
    R.hideMarker = e.cut.away || /on shed/.test(D.doing);
  });
  TRACK_G.visible = camDist < 9;
});

// ================================================================== what the dashboard shows
function where(c){
  const p = endPos(c, 'A');
  if(p.seg.place) return p.seg.place;
  const x = xAt(p), line = p.seg.line;
  if(line === LF){ if(x < 500) return 'Knapford'; if(x > Lm - 500) return 'Ffarquhar'; const st = BR.stations.find(s => Math.abs(s.x - x) < 300); return st ? st.name : 'on the Ffarquhar branch'; }
  const st = MS.find(s => Math.abs(s.x - x) < 450);
  return st ? st.name : 'on the Main Line';
}
function dutyStatus(D, v){
  const on = D.rota[D.cur] === v && onTurn(D.shifts, simTime);
  const w = D.w ? ` Now working ${D.w.txt}.` : '';
  const day = ` The day's work: ${D.work.map(x => `${fmtTime(x.t)} ${x.txt}`).join('; ')}.`;
  if(on) return `${v.name} is ${D.doing}.${w} Works ${D.label} on the new track network: running round where the train turns back, changing trains in the sidings, picking up and setting down wagons on the way.${day}`;
  if(v.away) return `${v.name} is home at Tidmouth Sheds with the Steam Team, and runs back to ${D.A.name} before the next turn.${day}`;
  const nt = nextTurn(D.shifts, D.rota.indexOf(v), simTime);
  return `${v.name} is on shed at ${D.A.name}. Next turn: ${nt ? DAYS[mod(Math.floor(nt.t / 1440), 7)] + ' ' + fmtTime(nt.t) : 'not soon'}.${day}`;
}
function statusOf(group){
  const v = VEHS.find(r => r.v.group === group);
  if(!v) return '';
  const D = DUTIES.find(D => D.rota.includes(v));
  if(D) return dutyStatus(D, v);
  if(v === glynn) return `Glynn is ${G.doing}. He shunts the yard at Ffarquhar from ${GLYNN_HOURS[0]} to ${GLYNN_HOURS[1]}, Monday to Saturday, moving wagons between the stone siding, the coal road and the goods siding.`;
  const c = v.cut, eng = c.vs.find(x => x.eng);
  if(eng) return `Coupled to ${eng.name}, ${where(c)}.`;
  const w = where(c);
  return /^on the/.test(w) ? `Standing ${w}.` : `Standing at ${w}.`;
}
const BOARD = DUTIES.map(D => ({
  railName: 'North Western Railway · new track network',
  color: () => (D.rota[D.cur] || D.rota[0]).eng.dot,
  short: () => { const e = D.rota[D.cur] || D.rota[0], on = onTurn(D.shifts, simTime); return [`${e.name} · ${D.doing}`, on ? 'on' : 'shed']; },
  sub: () => `${D.label} · ${D.work.map(w => `${fmtTime(w.t)} ${w.kind}`).join(', ')}`,
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

window.SODOR_TRACK = {DRIVERS, STATS, cutsOn, cutOn, entrySpot, SEGS, NODES, CUTS, VEHS, DUTIES, G, plan, at, statusOf, board: BOARD, MAIN, ML, BR, HAND, SIGNALS, manages: v => VEHS.some(r => r.v === v)};
console.log(`Track network: ${SEGS.length} roads, ${NODES.filter(n => n.grp[0].length > 1 || n.grp[1].length > 1).length} sets of points, ${CUTS.length} cuts, ${DUTIES.length} duties, ${SIGNALS.length} signals, built in ${Math.round(performance.now() - t0)} ms`);
})();
