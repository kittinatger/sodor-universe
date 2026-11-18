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
// cut fits clear on one road (a headshunt, a loop, a long siding), and splits the route into legs, one
// per direction. Each leg reserves the road ahead as it goes, throws the points, and stops short of
// anything in the way, or buffers up and couples when that is the goal. Running round, setting down
// and picking up wagons, stabling coaches and going on shed are all built from these moves.
//
// The pilot is the Ffarquhar branch: Knapford's bay and run-round loop, a goods siding at each
// station, the exchange siding outside Knapford, and Ffarquhar rebuilt with its loop, goods siding,
// carriage shed, engine shed, coal road and yard ladder. Thomas (and Rosie on Sundays) work it to the
// timetable in duties.js, and Glynn shunts the yard at Ffarquhar.
(function(){
'use strict';
const K = window.SODOR_KIT, S = window.SODOR_STD, NWR = window.SODOR_NWR, DUT = window.SODOR_DUTIES || {};
const LF = LINES.ffarquhar;
if(!K || !S || !NWR || !LF || !LF.real || !NWR.byId.thomas || !NWR.byId.thomas.runner) return;
const t0 = performance.now();
const M = METRE, V3 = THREE.Vector3;
const Lm = LF.real.len / M;                                // the branch's length in metres
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const mod = (a, n) => ((a % n) + n) % n;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ================================================================== geometry
const _p = new V3(), _t = new V3();
// world point x metres along a line (from its start) and lat metres to its left
function linePoint(line, x, lat, out){
  const L = line.real.len / M, u = Math.max(0, Math.min(1, x / L));
  realAt(line, u, out); realDir(line, u, _t); _t.y = 0; _t.normalize();
  out.x += _t.z * lat * M; out.z -= _t.x * lat * M;
  return out;
}

// ================================================================== the network
const DEFS = [], SEGS = [], NODES = [];
// a road: from xa to xb along the branch, lat(x) metres to the side
function road(name, xa, xb, lat, o = {}){ const d = {name, xa: Math.min(xa, xb), xb: Math.max(xa, xb), lat, o}; DEFS.push(d); return d; }
const flat = v => () => v;
// leaving `base` at the toe and easing out to `to` over len metres, running in direction dir (+1: up the line)
const turnout = (base, toe, dir, len, to) => x => base + (to - base) * smooth(0, len, (x - toe) * dir);
const loop = (xa, xb, w, ra, rb) => x => w * smooth(xa, xa + ra, x) * (1 - smooth(xb - rb, xb, x));

function sampleSeg(def, xa, xb){
  const n = Math.max(2, Math.ceil((xb - xa) / 2)), pts = [], xs = [], lats = [], vis = [];
  for(let i = 0; i <= n; i++){
    const x = xa + (xb - xa) * i / n, lat = def.lat(x), p = linePoint(LF, x, lat, new V3());
    const base = p.y, al = Math.abs(lat);
    if(al > 3){ const g = Math.max(heightAt(p.x, p.z), 0) + 0.55 * M, w = smooth(3, 10, al); p.y = base + Math.max(-1.2 * M, Math.min(1.2 * M, g - base)) * w; }
    pts.push(p); xs.push(x); lats.push(lat);
    const u = x / Lm; vis.push(al > 2.5 || !inTunnel(LF, Math.max(0, Math.min(1, u))));
  }
  if(!def.o.main){                                         // smooth the levels along a siding
    const ys = pts.map(p => p.y);
    for(let i = 1; i < n; i++){ let s = 0, c = 0; for(let k = -3; k <= 3; k++){ const j = i + k; if(j >= 0 && j <= n){ s += ys[j]; c++; } } pts[i].y = s / c; }
  }
  const Sc = [0];
  for(let i = 1; i <= n; i++) Sc.push(Sc[i - 1] + pts[i].distanceTo(pts[i - 1]) / M);
  const seg = {id: SEGS.length, name: def.name, def, pts, xs, lats, vis, S: Sc, len: Sc[n], node: [null, null], grp: [0, 0],
    main: !!def.o.main, noRev: !!def.o.noRev, res: null, place: def.o.place || ''};
  seg.vmax = seg.main ? (seg.len > 600 ? 99 : 7) : 4.5;
  SEGS.push(seg);
  return seg;
}
function buildNetwork(){
  // split each road wherever another road's end lies on it
  const cuts = DEFS.map(() => new Set());
  DEFS.forEach((d, i) => [d.xa, d.xb].forEach(x => {
    const lat = d.lat(x);
    DEFS.forEach((o, j) => { if(j !== i && x > o.xa + 0.5 && x < o.xb - 0.5 && Math.abs(o.lat(x) - lat) < 0.05) cuts[j].add(x); });
  }));
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
  const used = new Set();
  ends.forEach(e => {
    if(used.has(e)) return;
    const near = ends.filter(f => !used.has(f) && Math.hypot(f.p.x - e.p.x, f.p.z - e.p.z) < 0.15 * M);
    near.forEach(f => used.add(f));
    if(near.length < 2) return;                            // a buffer stop
    const node = {id: NODES.length, p: e.p.clone(), ends: near, grp: [[], []], state: [0, 0], lever: null};
    near.forEach(f => { const g = f.out.dot(e.out) > 0 ? 0 : 1; f.g = g; node.grp[g].push(f); f.seg.node[f.end] = node; f.seg.grp[f.end] = g; });
    NODES.push(node);
  });
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
// the place on a named road at x metres along the branch (facing up the line, towards Ffarquhar)
function at(name, x){
  for(const seg of SEGS){
    if(seg.name !== name) continue;
    const xs = seg.xs, n = xs.length - 1;
    if(x < xs[0] - 1e-6 || x > xs[n] + 1e-6) continue;
    let i = 1; while(i < n && xs[i] < x) i++;
    const t = (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1);
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
const engEnd = (c, e) => c.vs[0] === e ? 'A' : c.vs[c.vs.length - 1] === e ? 'B' : null;
// which end leads: the engine's when it has a train; either when it runs light
const leadEnd = e => e.cut.vs.every(v => v.eng || v.tender) ? undefined : engEnd(e.cut, e);
const other = e => e === 'A' ? 'B' : 'A';

// where each vehicle's body lies: [seg, from, to] pieces
function spans(v){
  const out = [], f = walk(v.pos, v.L / 2), b = walk(flip(v.pos), v.L / 2);
  const piece = (q, toward) => { if(q.seg === v.pos.seg) return; const edge = q.f > 0 ? 0 : q.seg.len; out.push([q.seg, Math.min(edge, q.s), Math.max(edge, q.s)]); };
  const lo = f.seg === v.pos.seg ? f.s : (v.pos.f > 0 ? v.pos.seg.len : 0), hi = b.seg === v.pos.seg ? b.s : (v.pos.f > 0 ? 0 : v.pos.seg.len);
  out.push([v.pos.seg, Math.min(lo, hi), Math.max(lo, hi)]);
  piece(f); piece(b);
  return out;
}
let occTick = -1, OCC = null;
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
  else addT(goal.pos.seg, goal.pos.s, goal.f || 0);
  const blocked = (seg, a, b) => {
    const iv = occ.get(seg); if(!iv) return false;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return iv.some(q => q.cut !== c && (q.cut === tgt ? q.b > lo + 0.4 && q.a < hi - 0.4 : q.b > lo - 0.3 && q.a < hi + 0.3));
  };
  const best = new Map(), Q = [];
  const push = st => { const k = st.seg.id + '|' + st.f + '|' + st.lead + '|' + st.tag; if(best.has(k) && best.get(k) <= st.c + 1e-9) return; best.set(k, st.c); Q.push(st); };
  ['A', 'B'].forEach(lead => { const p = endPos(c, lead); push({seg: p.seg, f: p.f, s: p.s, lead, c: lead === goal.prefer ? 0 : 0.5, rev: 0, tag: 's' + lead, prev: null, act: null}); });
  let sol = null, guard = 0;
  while(Q.length && guard++ < 6000){
    let bi = 0; for(let i = 1; i < Q.length; i++) if(Q[i].c < Q[bi].c) bi = i;
    const st = Q[bi]; Q[bi] = Q[Q.length - 1]; Q.pop();
    if(sol && st.c >= sol.c) break;
    const tl = T.get(st.seg);
    if(tl && (!goal.end || goal.end === st.lead)) for(const t of tl){
      if(t.f && t.f !== st.f) continue;
      const ds = (t.s - st.s) * st.f;
      if(ds < -0.05 || blocked(st.seg, st.s, t.s)) continue;
      const cc = st.c + Math.max(0, ds);
      if(!sol || cc < sol.c) sol = {c: cc, st, s: t.s};
    }
    const exitS = st.f > 0 ? st.seg.len : 0, end = st.f > 0 ? 1 : 0, n = st.seg.node[end];
    if(n && !blocked(st.seg, st.s, exitS)){
      const g = 1 - st.seg.grp[end], others = n.grp[g], locked = others.length > 1 && nodeLocked(n);
      others.forEach((e, idx) => {
        if(locked && n.state[g] !== idx) return;
        push({seg: e.seg, f: e.end === 0 ? 1 : -1, s: e.end === 0 ? 0 : e.seg.len, lead: st.lead, c: st.c + Math.abs(exitS - st.s) + 0.01, rev: st.rev, tag: 'n', prev: st, act: others.length > 1 ? {node: n, g, idx} : {}});
      });
    }
    // turn back: the whole cut drawn up on this road, clear of the points at both ends
    if(st.rev < 5 && !st.seg.noRev && st.seg.len >= L + 9){
      // only as far as it takes for the whole cut to stand clear of the points behind it
      const sR = st.f > 0 ? Math.max(st.s, L + 6) : Math.min(st.s, st.seg.len - L - 6);
      const tail = sR - st.f * L;
      if(tail >= 2.5 && tail <= st.seg.len - 2.5 && !blocked(st.seg, st.s, sR) && !blocked(st.seg, tail, sR))
        push({seg: st.seg, f: -st.f, s: tail, lead: other(st.lead), c: st.c + Math.abs(sR - st.s) + 80, rev: st.rev + 1, tag: 'r' + st.rev, prev: st, act: {rev: true, sR}});
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
function startLeg(c, leg, o = {}){ return {c, leg, lead: leg.lead, dist: 0, v: 0, next: 0, held: new Set(), wait: 0, vmax: o.vmax || 6, stops: o.stops || [], stopAt: 0, done: false, fail: false}; }
function stepLeg(m, dt){
  const leg = m.leg, steps = leg.steps, L = cutLen(m.c);
  // reserve the road ahead and set the points, up to 600 m ahead
  while(m.next < steps.length && steps[m.next].d0 - m.dist < 600){
    const st = steps[m.next];
    if(st.seg.res && st.seg.res !== m && st.seg.res.alive) break;
    if(st.sw && st.sw.node.state[st.sw.g] !== st.sw.idx){
      if(nodeLocked(st.sw.node)) break;
      st.sw.node.state[st.sw.g] = st.sw.idx; throwLever(st.sw.node);
    }
    st.seg.res = m; m.held.add(st.seg); m.next++;
  }
  m.alive = true;
  let limit = (m.next < steps.length ? steps[m.next].d0 - 4 : leg.total) - m.dist;
  // anything standing or moving on the road ahead
  const occ = occupancy();
  for(let k = 0; k < m.next; k++){
    const st = steps[k];
    (occ.get(st.seg) || []).forEach(q => {
      if(q.cut === m.c) return;
      const edge = st.f > 0 ? q.a : q.b, dd = st.d0 + (edge - st.sIn) * st.f;
      if(dd < m.dist - 0.3) return;                        // behind the leading end
      const room = dd - m.dist - (q.cut === leg.couple ? 0 : 3);
      if(room < limit) limit = room;
    });
  }
  // a station stop on the way
  while(m.stopAt < m.stops.length && m.stops[m.stopAt].d < m.dist - 0.5) m.stopAt++;
  const stop = m.stops[m.stopAt];
  if(stop && stop.d - m.dist < limit) limit = stop.d - m.dist;
  // speed: the slowest road under the cut, and braking for slower roads ahead
  let vcap = m.vmax;
  for(let k = 0; k < steps.length; k++){
    const st = steps[k], a = st.d0, b = st.d0 + Math.abs(st.sOut - st.sIn);
    if(b < m.dist - L - 1) continue;
    if(a > m.dist + 900) break;
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
  if(stop && Math.abs(stop.d - m.dist) < 0.05 && m.v < 0.05){ m.atStop = stop; return 'stop'; }
  if(leg.total - m.dist < 0.03){ finishLeg(m); return 'done'; }
  if(d < 1e-4){ m.wait += dt; if(m.wait > 240){ releaseLeg(m); m.fail = true; return 'fail'; } } else m.wait = 0;
  return 'run';
}
function releaseLeg(m){ m.held.forEach(seg => { if(seg.res === m) seg.res = null; }); m.held.clear(); m.alive = false; }
function finishLeg(m){
  releaseLeg(m); m.done = true; m.v = 0;
  const t = m.leg.couple;
  if(t && CUTS.includes(t) && t !== m.c){
    // the two ends that now meet
    const me = endPos(m.c, m.lead), pt = pointAt(me, new V3());
    let be = null, bd = Infinity;
    ['A', 'B'].forEach(e => { const q = pointAt(endPos(t, e), new V3()), dd = q.distanceTo(pt); if(dd < bd){ bd = dd; be = e; } });
    if(bd < 2.5 * M){ merge(m.c, m.lead, t, be); m.coupled = true; }
  }
}

// ================================================================== drawing
const TRACK_G = new THREE.Group(); scene.add(TRACK_G);
const trackMat = LF.realMesh ? LF.realMesh.material : new THREE.MeshStandardMaterial({color: 0x6a5a4a});
function drawSeg(seg){
  if(seg.main && seg.lats.every(l => Math.abs(l) < 0.01)) return;        // the branch's own track is already drawn
  K.ribbon(LF, seg.pts.map(p => p.clone().setY(p.y + 0.03 * M)), 3.6);
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
  g.visible = LF.userVisible && v.vis && d < FAR;
  const near = d < NEAR;
  if(g.visible && v._lod !== near){ v._lod = near; (v.v.axles || []).forEach(a => a.g.visible = near); (v.v.rods || []).forEach(r => r.mesh.visible = near); }
  if(v.spin){ K.spin(v.v, v.spin * M, M); v.spin = 0; }
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
  const r = {v, L: v.len, rev: !!o.rev, pos: null, cut: null, eng: o.eng || null, diesel: !!o.diesel, name: o.name || v.name || '', spin: 0, dirty: true, vis: true, home: o.home || null};
  const e = entryOf.get(v); if(e) e.parked = false; else allNWR.push({v, parked: false});
  VEHS.push(r); return r;
}
function engine(id, works){
  const rec = NWR.byId[id]; if(!rec) return null;
  const vs = NWR.engineUnit ? NWR.engineUnit(rec) : [rec.veh];
  if(!rec.relief && NWR.tagEngine) NWR.tagEngine(rec);
  if(!rec.relief && !rec.runner) rec.home = rec.home || {label: 'Ffarquhar Yards'};
  return vs.map((v, i) => { const r = vrec(v, {eng: i === 0 && (works || rec.cat !== 'Former') ? rec : null, diesel: rec.cat === 'Diesel', name: rec.name}); r.tender = i > 0; return r; });
}
function stock(key, ctx){
  if(!NWR.STOCK_STD[key]) return null;
  const v = NWR.makeStock(key); v.group.scale.setScalar(M); scene.add(v.group);
  if(NWR.tagStock) NWR.tagStock(v, ctx);
  return vrec(v, {name: NWR.STOCK_STD[key].name});
}

// ================================================================== the layout
const LQ = LINES.ffquarry;
const dF = d => Lm - d;                                    // Ffarquhar: d metres back from the buffers
const stationX = name => K.lineU(LF, name) * Lm;
const PLACES = {};

road('main', 0.4, Lm - 2.5, flat(0), {main: true});

// ---- Knapford: bay road 5 with Thomas's run-round loop (road 6) beside it
const KN = {buf: 0.4, inToe: 24, outToe: 178};
road('kLoop', KN.inToe, KN.outToe, loop(KN.inToe, KN.outToe, 4.6, 28, 28), {place: 'Knapford'});

// ---- Ffarquhar
const FF = {inToe: dF(26), outToe: dF(182), goodsToe: dF(218), yardToe: dF(305)};
road('fLoop', FF.outToe, FF.inToe, loop(FF.outToe, FF.inToe, 4.6, 28, 28), {place: 'Ffarquhar'});
// the goods siding through the goods shed, past the cattle dock, on the south side
road('fGoods', dF(218), dF(104), turnout(0, dF(218), 1, 50, -13), {place: 'Ffarquhar goods yard'});
// the yard lead and its ladder on the north side; the last road is the stone siding
road('fLadder', dF(305), dF(100), turnout(0, dF(305), 1, 34, 12), {place: 'Ffarquhar Yards', noRev: false});
const ladderRoad = (name, toe, to, rampEnd, endD, place) => road(name, dF(toe), dF(endD), turnout(12, dF(toe), 1, toe - rampEnd, to), {place});
ladderRoad('fCoal', 262, 44.5, 207, 150, 'the coal road at Ffarquhar');
ladderRoad('fCar2', 248, 38.2, 195, 98, 'the carriage shed at Ffarquhar');
ladderRoad('fCar1', 234, 33.8, 188, 98, 'the carriage shed at Ffarquhar');
ladderRoad('fShed2', 220, 21.6, 190, 150, 'Ffarquhar engine shed');
ladderRoad('fShed1', 208, 17, 182, 150, 'Ffarquhar engine shed');

// ---- a goods siding at each station on the way, and the exchange siding outside Knapford
function score(xa, xb, lat){
  let bad = 0;
  for(let x = xa; x <= xb; x += 6){
    const l = lat(x); if(Math.abs(l) < 3.5) continue;
    const p = linePoint(LF, x, l, new V3()), base = linePoint(LF, x, 0, new V3()).y, h = heightAt(p.x, p.z);
    if(h < 0.4 * M) bad += 5;
    if(Math.abs(h + 0.55 * M - base) > 2.4 * M) bad += 2;
    if(K.nearTrack(p.x, p.z, 3.4 * M)) bad += 4;
    if(S.taken.some(t => (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < t.r * t.r)) bad += 3;
    if(inTunnel(LF, x / Lm)) bad += 6;
  }
  return bad;
}
// Each siding runs back from its points towards the station, so it trails for trains leaving in the
// direction of its points: the engine runs past, backs in, and draws the wagons out behind it.
function siding(name, x0, x1s, place){
  let best = null;
  for(const toeOff of x1s) for(const dir of [-Math.sign(toeOff)]) for(const side of [1, -1]) for(const W of [5, 6.5]){
    const toe = x0 + toeOff, endX = toe + dir * 78, lat = turnout(0, toe, dir, 32, side * W);
    if(Math.min(toe, endX) < 200 || Math.max(toe, endX) > Lm - 400) continue;
    const sc = score(Math.min(toe, endX), Math.max(toe, endX), lat) + Math.abs(toeOff) * 0.002;
    if(!best || sc < best.sc) best = {sc, toe, endX, lat};
  }
  if(!best || best.sc > 6) return null;
  road(name, best.toe, best.endX, best.lat, {place});
  best.serves = -Math.sign(best.endX - best.toe);          // the direction of travel it is worked in
  return best;
}
const STATIONS_ON = LF.stops.map(k => STATIONS[k].name).filter(n => n !== 'Knapford' && n !== 'Ffarquhar');
const SIDINGS = {};
const SERVES = {};
STATIONS_ON.forEach(name => {
  const x = stationX(name), s = siding('g_' + name, x, [125, 140, 160, -125, -140, -160], `the goods siding at ${name}`);
  if(s){ SIDINGS[name] = 'g_' + name; SERVES[name] = s.serves; }
});
const kx = siding('kExchange', 0, [330, 380, 450, 540, 640], 'the exchange siding outside Knapford');

buildNetwork();
SEGS.forEach(drawSeg);
SEGS.forEach(seg => [0, 1].forEach(end => { if(!seg.node[end] && !(seg.main && ((end === 0 && seg.xs[0] < 2) || (end === 1 && seg.xs[seg.xs.length - 1] > Lm - 3)))) bufferAt(seg, end); }));
NODES.forEach(n => { if(n.grp[0].length > 1 || n.grp[1].length > 1) leverAt(n); });
// keep trees and buildings off the new roads
SEGS.forEach(seg => { if(seg.main) return; for(let i = 0; i < seg.pts.length; i += 4){ const p = seg.pts[i]; K.clearArea(p.x, p.z, 6 * M); S.taken.push({x: p.x, z: p.z, r: 5 * M}); } });
if(K.trees && K.trees.invalidate) K.trees.invalidate();

// stopping places (metres along the branch for the train's leading end)
const KNAP_STOP = 54;                                      // the engine's buffers, arriving at Knapford
const FFAR_STOP = dF(56);                                  // the engine's buffers, arriving at Ffarquhar
const mainAt = x => at('main', x);
const DEPART = dF(345);                                    // where an engine leaves the branch for Tidmouth

// ================================================================== the stock
const TH = NWR.byId.thomas, TR = TH.runner;
TR.manual = true; TR.track = true;                         // the old runner stands aside: this network drives Thomas
const thomas = vrec(TR.unit[0].v, {eng: TH, name: 'Thomas'});
const annie = vrec(TR.cars[0].v, {name: 'Annie'}), clarabel = vrec(TR.cars[1].v, {name: 'Clarabel'});
const rosieU = engine('rosie');
const glynnU = engine('glynn', true);
const ctxT = {rec: TH, run: TH.run}, ctxY = {home: {label: 'Ffarquhar Yards'}};
const tTrucks = ['thomasTruck', 'thomasTruck', 'brakeVan'].map(k => stock(k, ctxT)).filter(Boolean);
const yardTrucks = ['stoneTruck', 'stoneTruck', 'thomasTruck', 'stoneTruck', 'truck', 'truckB'].map(k => stock(k, ctxY)).filter(Boolean);
const coffeepots = ['coffeepot2', 'coffeepot3'].map(id => NWR.byId[id] ? engine(id) : [stock(id, ctxY)]).flat().filter(Boolean);
const wayTrucks = {};
Object.keys(SIDINGS).forEach((n, i) => { wayTrucks[n] = i % 2 ? [] : [stock(i % 4 ? 'truck' : 'vanGrey', ctxY)].filter(Boolean); });
const exTrucks = kx ? ['truck', 'vanGrey', 'truckB'].map(k => stock(k, ctxY)).filter(Boolean) : [];
[thomas].concat(rosieU || [], glynnU || []).forEach(v => { if(v.eng){ v.eng.yard = true; } });
if(glynnU) glynnU[0].eng.home = {label: 'Ffarquhar Yards'};

// lay a cut on a road with its A end at x (the cut runs back down the line from there unless up is set)
function lay(vs, road, x, down = true){
  const c = newCut(vs), p = at(road, x);
  if(!p) return c;
  layCut(c, down ? p : flip(p));
  return c;
}
const roadEnd = (name, which) => { const segs = SEGS.filter(s => s.name === name); const xs = segs.flatMap(s => [s.xs[0], s.xs[s.xs.length - 1]]); return which === 'up' ? Math.max(...xs) : Math.min(...xs); };
const bufX = name => roadEnd(name, 'up') - 1.5;            // the buffers of a road that ends up the line

// the facing of each engine: Thomas faces up the line (towards Ffarquhar), as he always has
thomas.rev = false;
const CUT = {};
CUT.trucks = lay(tTrucks, 'fGoods', bufX('fGoods'));
CUT.yard1 = lay(yardTrucks.slice(0, 4), 'fLadder', bufX('fLadder'));
CUT.yard2 = lay(yardTrucks.slice(4), 'fCoal', bufX('fCoal'));
if(coffeepots.length) CUT.museum = lay(coffeepots, 'fCar2', bufX('fCar2'));
if(glynnU) CUT.glynn = lay(glynnU, 'fCar2', bufX('fCar2') - (CUT.museum ? cutLen(CUT.museum) + 4 : 0));
if(rosieU) CUT.rosie = lay(rosieU, 'fShed2', bufX('fShed2') - 2);
Object.entries(wayTrucks).forEach(([n, vs]) => { if(vs.length){ const segs = SEGS.filter(s => s.name === SIDINGS[n]); const deadUp = segs.some(s => !s.node[1]); lay(vs, SIDINGS[n], deadUp ? roadEnd(SIDINGS[n], 'up') - 1.5 : roadEnd(SIDINGS[n], 'down') + 1.5 + vs[0].L, true); } });
if(exTrucks.length){ const segs = SEGS.filter(s => s.name === 'kExchange'); const deadUp = segs.some(s => !s.node[1]); lay(exTrucks, 'kExchange', deadUp ? roadEnd('kExchange', 'up') - 1.5 : roadEnd('kExchange', 'down') + 1.5 + cutLen({vs: exTrucks}), true); }

// ================================================================== jobs
// Jobs are generators: they yield {leg}, {wait: seconds} or {until: fn} and the driver carries them out.
const STATS = {moves: 0, legs: 0, reversals: 0, noPlan: 0, stuck: 0, couplings: 0, gaveUp: 0, last: ''};
function* go(e, goal, o = {}){
  const tries = o.tries || (e.eng && e.eng.id === 'glynn' ? 6 : 40);
  for(let attempt = 0; attempt < tries; attempt++){
    const legs = plan(e.cut, goal);
    if(!legs){ STATS.noPlan++; STATS.last = `${e.name}: no way to ${JSON.stringify(goal.pos ? {road: goal.pos.seg.name, x: Math.round(xAt(goal.pos))} : 'couple')}`; STATS.goal = goal; STATS.who = e; yield {wait: 20}; continue; }
    STATS.moves++; STATS.reversals += legs.length - 1;
    let ok = true;
    for(let i = 0; i < legs.length; i++){
      if(i) yield {wait: 12};                              // the driver changes ends
      const m = startLeg(e.cut, legs[i], i === legs.length - 1 ? o : {vmax: o.vmax});
      STATS.legs++;
      const r = yield {leg: m};
      if(r === 'fail'){ ok = false; STATS.stuck++; STATS.lastStuck = `${fmtTime(simTime)} ${e.name} on ${m.c.vs[0].pos.seg.name} → ${goal.pos ? goal.pos.seg.name : 'couple ' + goal.couple.vs[0].name}; next road held by ${legs[i].steps[m.next] && legs[i].steps[m.next].seg.res ? 'another move' : 'nobody'}`; break; }
      if(m.coupled) STATS.couplings++;
    }
    if(ok) return true;
    yield {wait: 15};
  }
  STATS.gaveUp++;
  return false;
}
// uncouple the engine (and the next k vehicles) from the rest of its cut; returns the rest
function detach(e, k = 0){
  const c = e.cut, end = engEnd(c, e);
  if(end === 'A') return split(c, 1 + k);
  const n = c.vs.length; const rest = split(c, n - 1 - k);
  // split keeps the first part: the engine is in the new cut, so swap them round
  if(!rest) return null;
  const front = c; return front === e.cut ? rest : front;
}
const trainOf = e => e.cut;
function nearEndToward(c, x){ const a = xAt(endPos(c, 'A')), b = xAt(endPos(c, 'B')); return Math.abs(a - x) < Math.abs(b - x) ? 'A' : 'B'; }
// run round a train standing at a terminus, ending at its other end
function* runRound(e, D){
  const train = detach(e);
  if(!train) return;
  if(D) D.doing = `running round the train at ${where(e.cut)}`;
  yield {wait: 25};
  const far = nearEndToward(train, xAt(endPos(e.cut, 'A')));       // the end the engine is at now
  yield* go(e, {couple: train, at: other(far)});
  yield {wait: 30};
}
const WORK_KIND = {stopping: {v: 0.92, dwell: 40}, express: {v: 1, dwell: 40}, fast: {v: 1.12, dwell: 35}, market: {v: 0.85, dwell: 110},
  mail: {v: 1, dwell: 120}, pickup: {v: 0.8, dwell: 60}, through: {v: 1.1, dwell: 35}, heavy: {v: 0.75, dwell: 35}};
const LINE_V = (TH.run.speed || 15);
// along the branch to the other end, calling at stations; pick-up goods shunt where there is a siding
function* trip(e, toKnapford, w, D){
  // until the stock is changed at Ffarquhar, the train works as it is
  const kind = D.rake === w.rake ? w.kind : (D.rake === 'trucks' ? 'pickup' : 'stopping');
  const k = WORK_KIND[kind] || WORK_KIND.stopping, calls = kind !== 'fast' && kind !== 'through' && kind !== 'heavy';
  const dir = toKnapford ? -1 : 1;
  const names = toKnapford ? STATIONS_ON.slice().reverse() : STATIONS_ON.slice();
  for(const name of (calls ? names : [])){
    const L = cutLen(e.cut), x = stationX(name), lead = x + (toKnapford ? -1 : 1) * L / 2;
    D.doing = `running to ${name}`;
    yield* go(e, {pos: mainAt(lead), f: toKnapford ? -1 : 1, end: leadEnd(e)}, {vmax: LINE_V * k.v});
    D.doing = `at ${name}`;
    if(kind === 'pickup' && SIDINGS[name] && SERVES[name] === dir) yield* pickUp(e, SIDINGS[name], dir, D, name);
    else yield {wait: k.dwell};
  }
  const stopX = toKnapford ? KNAP_STOP : FFAR_STOP;
  D.doing = `running to ${toKnapford ? 'Knapford' : 'Ffarquhar'}`;
  yield* go(e, {pos: mainAt(stopX), f: toKnapford ? -1 : 1, end: leadEnd(e)}, {vmax: LINE_V * k.v});
  D.doing = `at ${toKnapford ? 'Knapford' : 'Ffarquhar'}`;
  yield {wait: Math.max(60, k.dwell)};
}
// the cuts standing on a road, nearest its points first
function cutsOn(name){
  const occ = occupancy(), seen = new Map();
  SEGS.forEach(seg => { if(seg.name !== name) return; (occ.get(seg) || []).forEach(q => { const x = seg.xs[0] + (q.a / seg.len) * (seg.xs[seg.xs.length - 1] - seg.xs[0]); if(!seen.has(q.cut) || x < seen.get(q.cut)) seen.set(q.cut, x); }); });
  const toeLow = SEGS.some(s => s.name === name && !s.node[1]);
  return [...seen.entries()].sort((a, b) => toeLow ? a[1] - b[1] : b[1] - a[1]).map(e => e[0]);
}
// the wagons (no engine) nearest a road's points
function cutOn(name){ const cs = cutsOn(name); return cs.length && !cs[0].vs.some(v => v.eng) ? cs[0] : null; }
// where an engine entering a road from its points can stop: short of whatever stands there, or at the buffers
function entrySpot(name, except){
  const up = SEGS.some(s => s.name === name && !s.node[1]), cs = cutsOn(name).filter(c => !except || c !== except.cut);
  if(!cs.length) return {pos: at(name, up ? bufX(name) - 1 : roadEnd(name, 'down') + 2), f: up ? 1 : -1};
  const ends = ['A', 'B'].map(e => xAt(endPos(cs[0], e)));
  const x = up ? Math.min(...ends) - 4 : Math.max(...ends) + 4;
  return {pos: at(name, x), f: up ? 1 : -1, behind: cs[0]};
}
// at a station with a siding: put the wagon next to the engine in the siding if it is empty, else bring its wagons out
function* pickUp(e, sidingName, dir, D, where){
  const there = cutOn(sidingName), trainLen = e.cut.vs.length;
  const dest = dir < 0 ? 0 : Lm;
  if(there && !there.vs.some(v => v.eng)){
    D.doing = `shunting at ${where}: picking up from the siding`;
    const train = detach(e);
    yield {wait: 20};
    if(!(yield* go(e, {couple: there}))){ yield* go(e, {couple: train, at: nearEndToward(train, dest)}); return; }
    yield {wait: 25};
    // back onto the train with the wagons, so they ride next to the engine
    yield* go(e, {couple: train, end: other(engEnd(e.cut, e)), at: nearEndToward(train, dest)});
    yield {wait: 25};
  } else if(trainLen > 2){
    const wagon = e.cut.vs[engEnd(e.cut, e) === 'A' ? 1 : trainLen - 2];
    if(wagon.name === 'Brake van') { yield {wait: 40}; return; }
    D.doing = `shunting at ${where}: putting a wagon off in the siding`;
    const train = detach(e, 1);
    yield {wait: 20};
    const segs = SEGS.filter(s => s.name === sidingName), deadUp = segs.some(s => !s.node[1]);
    const bx = deadUp ? roadEnd(sidingName, 'up') - 1.5 : roadEnd(sidingName, 'down') + 1.5;
    yield* go(e, {pos: at(sidingName, bx), f: deadUp ? 1 : -1, end: other(engEnd(e.cut, e))});
    yield {wait: 20};
    detach(e);
    yield {wait: 15};
    yield* go(e, {couple: train, at: nearEndToward(train, dest)});
    yield {wait: 25};
  } else yield {wait: 40};
}
// the rakes and where each is put away
const RAKES = {main: {home: 'fCar1', name: 'Annie and Clarabel'}, trucks: {home: 'fGoods', name: 'the goods trucks'}};
function rakeCut(name){ if(name === 'main') return annie.cut; return CUT.trucks && CUTS.includes(CUT.trucks) ? CUT.trucks : (tTrucks[0] && tTrucks[0].cut); }
// propel the train into its road and leave it there
function* stable(e, D){
  const r = RAKES[D.rake] || RAKES.main, home = r.home;
  D.doing = `putting ${r.name} away`;
  // propel it in to the buffers, or up to the wagons already standing there and couple to them
  const goal = () => { const w = cutOn(home), sp = entrySpot(home, e); return w ? {couple: w, end: other(engEnd(e.cut, e))} : {pos: sp.pos, f: sp.f, end: other(engEnd(e.cut, e))}; };
  if(!plan(e.cut, goal())) yield* runRound(e, D);              // the engine has to be at the other end to propel it in
  yield* go(e, goal());
  yield {wait: 25};
  const rest = detach(e);
  if(D.rake === 'trucks' && rest) CUT.trucks = rest;
  D.rake = null;
  yield {wait: 15};
}
// fetch a rake and set it in the platform at Ffarquhar, ready to leave for Knapford
function* fetch(e, D, name){
  const c = rakeCut(name), r = RAKES[name];
  D.doing = `fetching ${r.name}`;
  if(c && c !== e.cut){ yield* go(e, {couple: c}); yield {wait: 25}; }
  D.rake = name;
  D.doing = `setting ${r.name} in the platform`;
  const goal = () => ({pos: mainAt(FFAR_STOP), f: 1, end: other(engEnd(e.cut, e))});
  if(!plan(e.cut, goal())){                                 // coupled at the wrong end: draw it in and run round
    yield* go(e, {pos: mainAt(FFAR_STOP), f: 1, end: leadEnd(e)});
    yield* runRound(e, D);
    return;
  }
  yield* go(e, goal());
  yield {wait: 30};
}
function* onShed(e, D, road, home){
  D.doing = 'taking coal and water at the coal road';
  const sp = entrySpot('fCoal', e);
  if(sp.pos && (!sp.behind || !sp.behind.vs.some(v => v.eng))){ yield* go(e, {pos: sp.pos, f: sp.f, end: leadEnd(e)}); yield {wait: 600}; }
  if(home && (yield* goHome())) return;
  D.doing = 'going on shed';
  const sh = entrySpot(road, e);
  yield* go(e, {pos: sh.pos, f: sh.f, end: leadEnd(e)});
  D.doing = 'on shed at Ffarquhar';
}

// ------------------------------------------------------------------ the branch duty
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
const dd = (DUT.nwr || {}).thomas || {};
const D = {id: 'thomas', name: 'Thomas', rota: [thomas].concat(rosieU ? [rosieU[0]] : []), shifts: parseShifts(dd.shifts), work: parseWork((DUT.work || {}).thomas),
  note: dd.note || '', doing: 'on shed at Ffarquhar', rake: null, cur: 0, away: false};
const SHED_ROAD = {Thomas: 'fShed1', Rosie: 'fShed2'};
const STEAM_TEAM = true;                                   // Thomas lives at Tidmouth Sheds with the Steam Team when he can get home

function* branch(){
  for(;;){
    const turn = onTurn(D.shifts, simTime);
    if(!turn){ D.doing = D.away ? 'home at Tidmouth Sheds with the Steam Team' : 'on shed at Ffarquhar'; yield {wait: 60}; continue; }
    const e = D.rota[Math.min(turn.idx, D.rota.length - 1)];
    D.cur = D.rota.indexOf(e);
    if(e === thomas && D.away){ yield* comeHome(); }
    while(onTurn(D.shifts, simTime) && onTurn(D.shifts, simTime).idx === turn.idx){
      const w = workAt(D.work, simTime);
      D.w = w;
      if(D.rake !== w.rake){
        if(D.rake) yield* stable(e, D);
        yield* fetch(e, D, w.rake);
      }
      yield* trip(e, true, w, D);
      yield* runRound(e, D);
      // the exchange siding outside Knapford, worked on the way out
      if(w.kind === 'pickup' && D.rake === w.rake && kx) yield* pickUp(e, 'kExchange', 1, D, 'Knapford');
      D.w = workAt(D.work, simTime);
      yield* trip(e, false, D.w, D);
      // end of the turn, or a different train next: put this one away; otherwise run round and go again
      const still = onTurn(D.shifts, simTime), wn = workAt(D.work, simTime);
      if(!still || still.idx !== turn.idx || wn.rake !== D.rake){ yield* stable(e, D); if(still && still.idx === turn.idx) continue; break; }
      yield* runRound(e, D);
    }
    D.w = null;
    yield* onShed(e, D, SHED_ROAD[e.name] || 'fShed1', e === thomas);
  }
}
// The Steam Team trip: from the branch to Tidmouth Sheds and back, driven by ops.js
const proxy = {rota: [{name: 'Thomas', unit: [thomas.v], rec: TH, color: TH.dot}], cur: 0, R: {line: LF}, shifts: null, rail: 'track'};
function* goHome(){
  const ops = window.SODOR_OPS;
  if(!STEAM_TEAM || !ops || !ops.goTidmouth) return;
  proxy.shifts = D.shifts.map(s => ({...s, who: s.who.split('').map(c => c === '0' ? '0' : '9').join('')}));
  const nt = nextTurn(proxy.shifts, 0, simTime);
  if(!nt || nt.t - simTime < 6 * 60) return false;        // not worth the trip tonight
  D.doing = 'leaving for Tidmouth Sheds';
  if(!(yield* go(thomas, {pos: mainAt(DEPART), f: -1, end: leadEnd(thomas)}))) return false;
  yield {wait: 20};
  ops.goTidmouth(proxy);
  if(!proxy.tid || proxy.tid === 'none'){ proxy.tid = null; return false; }
  thomas.cut.away = true; D.away = true;
  D.doing = 'running home to Tidmouth Sheds';
  return true;
}
function* comeHome(){
  const ops = window.SODOR_OPS;
  D.doing = 'coming back from Tidmouth Sheds';
  for(;;){
    const nt = onTurn(D.shifts, simTime) ? {t: simTime} : nextTurn(proxy.shifts, 0, simTime);
    if(proxy.tid && proxy.tid !== 'none' && (!nt || nt.t - simTime < 140)) ops.leaveTidmouth(proxy);
    if(!proxy.tid) break;
    yield {wait: 30};
  }
  // back where it left the branch: pick the engine up again facing the way it now stands
  const c = thomas.cut, gp = thomas.v.group.position;
  let bx = DEPART, bd = Infinity;
  for(let x = DEPART - 60; x <= DEPART + 60; x += 0.25){ const q = linePoint(LF, x, 0, _c), dd = Math.hypot(q.x - gp.x, q.z - gp.z); if(dd < bd){ bd = dd; bx = x; } }
  c.away = false; D.away = false;
  layCut(c, mainAt(bx + thomas.L / 2));
  const yaw = thomas.v.group.rotation.y; pointAt(walk(thomas.pos, 1), _a); pointAt(walk(flip(thomas.pos), 1), _b);
  const toward = Math.atan2(_a.x - _b.x, _a.z - _b.z);
  thomas.rev = Math.cos(yaw - toward) < 0;
  thomas.dirty = true;
}

// ------------------------------------------------------------------ Glynn, the Ffarquhar yard pilot
const GLYNN_HOURS = ['08:00', '17:30'];
const YARD_ROADS = ['fLadder', 'fCoal', 'fGoods'];
const G = {name: 'Glynn', doing: 'stabled in the carriage shed'};
function* yardPilot(){
  if(!glynnU) return;
  const e = glynnU[0];
  for(;;){
    if(!inHours(GLYNN_HOURS, simTime) || mod(Math.floor(simTime / 1440), 7) === 6){
      if(!G.home){
        G.doing = 'going back to the carriage shed';
        const sp = entrySpot('fCar2', e);
        G.home = yield* go(e, {pos: sp.pos, f: sp.f, end: leadEnd(e)});
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
    if(!(yield* go(e, {couple: c}))){ yield {wait: 600}; continue; }
    yield {wait: 20};
    // keep one to three of the wagons next to him (none of Thomas's), leave the rest
    const atA = engEnd(e.cut, e) === 'A', vs = e.cut.vs, order = atA ? vs.slice(1) : vs.slice(0, -1).reverse();
    let free = 0; while(free < order.length && mine(order[free])) free++;
    const k = Math.min(free, 1 + Math.floor(rnd() * 3));
    if(k < order.length){ if(atA) split(e.cut, 1 + k); else split(e.cut, vs.length - 1 - k); }
    yield {wait: 15};
    if(!k){ yield {wait: 300}; continue; }
    G.doing = `shunting at Ffarquhar Yards: taking wagons to ${segName(dst)}`;
    // never leave wagons out on the running roads: wait for room, or take them back where they came from
    let put = false;
    for(let tries = 0; tries < 8 && !put; tries++){
      const road = tries < 6 ? dst : src, there = cutOn(road), sp = entrySpot(road, e);
      if(there) put = yield* go(e, {couple: there, end: other(engEnd(e.cut, e))});
      else if(!sp.behind) put = yield* go(e, {pos: sp.pos, f: sp.f, end: other(engEnd(e.cut, e))});
      if(!put) yield {wait: 240};
    }
    yield {wait: 20};
    const end = engEnd(e.cut, e);
    if(put){ if(end === 'A') split(e.cut, 1); else split(e.cut, e.cut.vs.length - 1); }
    // back to his spot by the carriage shed, out of the way, until the next job
    yield {wait: 15};
    G.doing = 'drawing back to the carriage shed';
    { const sp = entrySpot('fCar2', e); if(e.pos.seg.name !== 'fCar2') yield* go(e, {pos: sp.pos, f: sp.f, end: leadEnd(e)}); }
    G.doing = 'waiting between shunts';
    yield {wait: (12 + rnd() * 30) * 60};
  }
}
const segName = n => ({fLadder: 'the stone siding', fCoal: 'the coal road', fGoods: 'the goods siding'})[n] || n;

// ------------------------------------------------------------------ the driver
function runner(gen){ return {it: gen, cmd: null, res: undefined, t: 0}; }
const DRIVERS = [runner(branch()), runner(yardPilot())];
function stepDriver(r, dt){
  for(let guard = 0; guard < 8; guard++){
    if(!r.cmd){ const n = r.it.next(r.res); r.res = undefined; if(n.done){ r.cmd = {wait: 1e9}; return; } r.cmd = n.value || {wait: 1}; r.t = 0; }
    const c = r.cmd;
    if(c.wait !== undefined){ r.t += dt; if(r.t < c.wait) return; r.cmd = null; dt = 0; continue; }
    if(c.until){ if(!c.until()) return; r.cmd = null; continue; }
    if(c.leg){
      const s = stepLeg(c.leg, dt);
      if(s === 'stop'){ c.leg.stopAt++; return; }
      if(s === 'done'){ r.res = 'done'; r.cmd = null; return; }
      if(s === 'fail'){ r.res = 'fail'; r.cmd = null; return; }
      return;
    }
    r.cmd = null;
  }
}

// lay the day out as it stands at the start: Thomas in the platform with Annie and Clarabel if he is on duty
{
  const turn = onTurn(D.shifts, simTime);
  CUT.coaches = lay([annie, clarabel], 'fCar1', bufX('fCar1'));
  lay([thomas], 'fShed1', bufX('fShed1') - 2);
  if(turn && turn.idx === 0){
    // formed up in the platform: Annie and Clarabel nearest the buffers, Thomas at the Knapford end
    CUTS.splice(CUTS.indexOf(annie.cut), 1); CUTS.splice(CUTS.indexOf(thomas.cut), 1);
    const c = newCut([annie, clarabel, thomas]);
    layCut(c, mainAt(FFAR_STOP));
    D.rake = 'main'; D.doing = 'waiting to leave Ffarquhar';
  }
}

// ================================================================== every frame
let tick = 0;
const _cp = new V3();
frameHooks.push(dt => {
  const d = dt * timeScale, n = Math.max(1, Math.min(240, Math.ceil(d / 1.5)));
  for(let k = 0; k < n; k++){ tick++; DRIVERS.forEach(r => stepDriver(r, d / n)); }
  const cp = camera.position;
  VEHS.forEach(v => render(v, cp));
  // the old runner's lists follow the engine at work, for the level crossings and the map dot
  const e = D.rota[D.cur] || thomas;
  if(!e.cut.away){ TR.engine = e.v; TR.unit = [{v: e.v, len: e.L * M}]; TR.cars = e.cut.vs.filter(v => v !== e).map(v => ({v: v.v, len: v.L * M})); if(!TR.cars.length) TR.cars = [{v: annie.v, len: annie.L * M}]; }
  TR.hideMarker = e.cut.away || /on shed|stabled/.test(D.doing);
  TRACK_G.visible = camDist < 9;
});

// ================================================================== what the dashboard shows
function where(c){
  const p = endPos(c, 'A');
  if(p.seg.place) return p.seg.place;
  const x = xAt(p);
  if(x < 500) return 'Knapford'; if(x > Lm - 500) return 'Ffarquhar';
  const st = STATIONS_ON.find(n => Math.abs(stationX(n) - x) < 300);
  return st || 'on the branch';
}
function statusOf(group){
  const v = VEHS.find(r => r.v.group === group);
  if(!v) return '';
  if(v === thomas || (rosieU && v === rosieU[0])){
    const on = D.rota[D.cur] === v && onTurn(D.shifts, simTime);
    const w = D.w ? ` Now working ${D.w.txt}.` : '';
    const day = ` The day's work: ${D.work.map(x => `${fmtTime(x.t)} ${x.txt}`).join('; ')}.`;
    if(on) return `${v.name} is ${D.doing}.${w} Works the Ffarquhar branch on the new track network: running round at both ends, picking up and setting down wagons at the station sidings, stabling the coaches in the carriage shed at night.${day}`;
    if(v === thomas && D.away) return `Thomas is ${D.doing}. He comes back down the branch before his first train.${day}`;
    const nt = nextTurn(D.shifts, D.rota.indexOf(v), simTime);
    return `${v.name} is on shed at Ffarquhar. Next turn: ${nt ? DAYS[mod(Math.floor(nt.t / 1440), 7)] + ' ' + fmtTime(nt.t) : 'not soon'}.${day}`;
  }
  if(glynnU && v === glynnU[0]) return `Glynn is ${G.doing}. He shunts the yard at Ffarquhar from ${GLYNN_HOURS[0]} to ${GLYNN_HOURS[1]}, Monday to Saturday, moving wagons between the stone siding, the coal road and the goods siding.`;
  const c = v.cut, eng = c.vs.find(x => x.eng);
  if(eng) return `Coupled to ${eng.name}, ${where(c)}.`;
  return `Standing ${where(c) === 'on the branch' ? 'on the branch' : 'in ' + where(c)}.`;
}
const BOARD = [{
  railName: 'North Western Railway · new track network',
  color: () => (D.rota[D.cur] || thomas).eng ? (D.rota[D.cur] || thomas).eng.dot : 0x2a5fb0,
  short: () => { const e = D.rota[D.cur] || thomas, on = onTurn(D.shifts, simTime); return [`${e.name} · ${D.doing}`, on ? 'on' : 'shed']; },
  sub: () => `Ffarquhar branch · ${D.work.map(w => `${fmtTime(w.t)} ${w.kind}`).join(', ')}`,
  show: () => NWR.show(D.rota[D.cur] ? (D.rota[D.cur].eng || TH) : TH),
  working: () => !!onTurn(D.shifts, simTime),
}, {
  railName: 'North Western Railway · new track network',
  color: () => glynnU ? glynnU[0].eng.dot : 0x888888,
  short: () => [`Glynn · ${G.doing}`, inHours(GLYNN_HOURS, simTime) ? 'on' : 'shed'],
  sub: () => `Ffarquhar yard pilot · ${GLYNN_HOURS[0]}–${GLYNN_HOURS[1]}, Mo–Sa`,
  show: () => glynnU && NWR.show(glynnU[0].eng),
  working: () => inHours(GLYNN_HOURS, simTime),
}];
if(!glynnU) BOARD.pop();

window.SODOR_TRACK = {STATS, cutsOn, cutOn, entrySpot, SEGS, NODES, CUTS, VEHS, D, G, plan, at, statusOf, board: BOARD, sidings: SIDINGS, exchange: !!kx, manages: v => VEHS.some(r => r.v === v)};
console.log(`Track network: ${SEGS.length} roads, ${NODES.filter(n => n.grp[0].length > 1 || n.grp[1].length > 1).length} sets of points, ${CUTS.length} cuts, goods sidings at ${Object.keys(SIDINGS).join(', ') || 'none'}${kx ? ', exchange siding at Knapford' : ''}, built in ${Math.round(performance.now() - t0)} ms`);
})();
