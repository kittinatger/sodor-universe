// ops.js: the railway's working day.
// Every train works to the timetable in duties.js. When its turn ends the train finishes its trip, the
// engine uncouples and runs into the engine shed beside the terminus, and the train stands at the
// platform; when the next turn starts the engine due on the rota comes out and couples on. Engines in
// the depots shunt their roads during working hours and are put away for the night; at Tidmouth they
// take turns on the turntable. Nothing jumps: every movement is driven along the track.
(function(){
const t0 = performance.now();
const K = window.SODOR_KIT, S = window.SODOR_STD, NWR = window.SODOR_NWR, CFR = window.SODOR_CFR, SR = window.SODOR_SR;
const DUT = window.SODOR_DUTIES || {nwr: {}, sr: {}, cfr: {}, rex: {}, yards: {}};
const M = METRE, V3 = THREE.Vector3;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const mod = (a, n) => ((a % n) + n) % n;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = c => '#' + c.toString(16).padStart(6, '0');

// ------------------------------------------------------------------ the timetable
function parseShifts(list){ return (list || [['06:00', '20:00', '0']]).map(([on, off, who = '0', days = '1111111']) => ({on: hm(on), off: hm(off), who, days})); }
const whoOn = (s, d) => +s.who[mod(d, s.who.length)];
// Who should be at work at sim minute t: the rota index, the shift and when it ends; null if nobody.
function onTurn(shifts, t){
  const d = Math.floor(t / 1440), tod = t - d * 1440;
  for(const s of shifts){
    const over = s.off <= s.on;
    let start;
    if(!over){ if(tod >= s.on && tod < s.off) start = d; else continue; }
    else if(tod >= s.on) start = d; else if(tod < s.off) start = d - 1; else continue;
    if(s.days[mod(start, 7)] !== '1') continue;
    return {idx: whoOn(s, start), s, end: start * 1440 + s.off + (over ? 1440 : 0)};
  }
  return null;
}
// The next turn for rota index idx starting after t.
function nextTurn(shifts, idx, t){
  let best = null;
  const d0 = Math.floor(t / 1440);
  for(let d = d0; d < d0 + 15; d++) for(const s of shifts){
    const st = d * 1440 + s.on;
    if(st <= t || s.days[mod(d, 7)] !== '1' || whoOn(s, d) !== idx) continue;
    if(!best || st < best.t) best = {t: st, d};
  }
  return best;
}
function inHours(h, t){
  const tod = mod(t, 1440), on = hm(h[0]), off = hm(h[1]);
  return off > on ? tod >= on && tod < off : tod >= on || tod < off;
}
const when = (t, now) => {
  const d = Math.floor(t / 1440), d0 = Math.floor(now / 1440);
  return (d === d0 ? '' : d === d0 + 1 ? 'tomorrow ' : DAYS[mod(d, 7)] + ' ') + fmtTime(t);
};
const shiftText = shifts => shifts.map(s => `${fmtTime(s.on)}–${fmtTime(s.off)}${s.days === '1111111' ? '' : ' (' + s.days.split('').map((c, i) => c === '1' ? DAYS[i].slice(0, 2) : '').filter(Boolean).join(' ') + ')'}`).join(', ');

// ------------------------------------------------------------------ geometry along a train's track
const _a = new V3(), _b = new V3(), _c = new V3(), _q = new V3();
// A point beside the running line: x along the train's stretch, lat to the side (plus the line's lane).
function pathPoint(R, x, lat, out){
  K.trackFrame(R, x);
  const t = K._t, nl = Math.hypot(t.x, t.z) || 1, L = lat + (R.o.lane || 0) + (R.o.latFn ? R.o.latFn(x) : 0);
  return out.set(K._p.x + t.z / nl * L, K._p.y, K._p.z - t.x / nl * L);
}
// Put a vehicle on a curve that leaves the line sideways (a siding), turned to follow it.
function placeOn(R, veh, x, latFn){
  const h = Math.max(0.6 * M, veh.len * R.o.scale * 0.4);
  pathPoint(R, x + h, latFn(x + h), _a); pathPoint(R, x - h, latFn(x - h), _b); pathPoint(R, x, latFn(x), _c);
  const g = veh.group, dx = _a.x - _b.x, dz = _a.z - _b.z;
  g.rotation.order = 'YXZ';
  g.rotation.set(-Math.atan2(_a.y - _b.y, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
  g.position.copy(_c);
  g.visible = R.line.userVisible;
}
const _sp = new V3();
function smoke(veh, moving, dt, st){
  if(!moving || !veh.chimneyAt || !veh.group.visible || camDist > 3) return;
  st.puff = (st.puff || 0) - dt * 0.8;
  if(st.puff > 0) return;
  st.puff = 1.4;
  [veh.chimneyAt, veh.chimneyAt2].forEach(c => { if(c){ _sp.copy(c); veh.group.localToWorld(_sp); K.puff(_sp); } });
}

// ------------------------------------------------------------------ the workings through the day
const WORK_KIND = {
  express:  {stops: 'run',  v: 1,    dwell: 40,  txt: 'the Express'},
  fast:     {stops: 'none', v: 1.12, dwell: 35,  txt: 'a fast train, non-stop'},
  stopping: {stops: 'all',  v: 0.92, dwell: 40,  txt: 'a stopping train, calling at every station'},
  market:   {stops: 'all',  v: 0.85, dwell: 110, txt: 'a market train, with long stops'},
  mail:     {stops: 'all',  v: 1,    dwell: 120, txt: 'the mail, loading bags at every station'},
  pickup:   {stops: 'all',  v: 0.8,  dwell: 300, txt: 'a pick-up goods, shunting trucks at every station'},
  through:  {stops: 'none', v: 1.1,  dwell: 35,  txt: 'a through goods, non-stop'},
  heavy:    {stops: 'none', v: 0.75, dwell: 35,  txt: 'a heavy goods, slow and steady'},
};
const WORK_SHORT = {express: 'Express', fast: 'fast train', stopping: 'stopping train', market: 'market train', mail: 'mail', pickup: 'pick-up goods', through: 'through goods', heavy: 'heavy goods'};
function parseWork(list){
  if(!list || !list.length) return null;
  return list.map(([t, kind, txt]) => ({t: hm(t), kind, k: WORK_KIND[kind] || WORK_KIND.stopping, txt: txt || (WORK_KIND[kind] || WORK_KIND.stopping).txt})).sort((a, b) => a.t - b.t);
}
// the working in force at sim minute t (the last one carries on past midnight)
function workAt(W, t){
  const tod = mod(t, 1440);
  let w = W[W.length - 1];
  W.forEach(x => { if(x.t <= tod) w = x; });
  return w;
}
function applyWork(D, w){
  const R = D.R, k = w.k, std = R.o.passenger ? (R.o.stopsAt || 'all') : 'none';
  R.stops = K.stopsFor(R, k.stops === 'run' ? std : k.stops);
  R.o.vmax = R.vBase * k.v;
  R.stopDwell = k.dwell;
  D.w = w;
}
const jobNow = D => D.w ? D.w.txt : D.job;

// ------------------------------------------------------------------ the duties
const DUTIES = [], byGroup = new Map();
const entryOf = new Map(S.allNWR.map(e => [e.v, e]));
const lc = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
function member(name, unit, color, show, rec, diesel){ return {name, unit, color, show, rec, diesel}; }

NWR.NWR_RUNNERS.forEach(R => {
  const rec = R.rec, dd = DUT.nwr[rec.id] || {};
  const first = member(rec.name, R.unit.map(m => m.v), rec.dot, () => NWR.show(rec), rec, rec.cat === 'Diesel' || !!rec.run.diesel);
  const rota = (dd.rota || [rec.id]).map((id, i) => {
    const r = NWR.byId[id];
    if(i === 0 || !r || !r.relief) return first;
    return member(r.name, r.tenderVeh ? [r.veh, r.tenderVeh] : [r.veh], r.dot, () => NWR.show(r), r, r.cat === 'Diesel');
  });
  addDuty({id: rec.id, rail: 'nwr', R, rota: [...new Set(rota)], dd, job: rec.run.job, railName: 'North Western Railway'});
});
SR.ENGINES.forEach(E => {
  if(!E.train) return;
  const R = E.train;
  const ar = E.rail === 'ar', dd = (ar ? DUT.ar : DUT.sr)[E.id] || {};
  // relief engines on the Arlesdale Railway (characters.js) join the rota of the train they cover
  const rota = [member(E.name, R.unit.map(m => m.v), SR.COLORS[E.id], () => SR.show(E), E, !!E.diesel)]
    .concat(SR.ENGINES.filter(o => o.relief === E.id && o.unit).map(o => member(o.name, o.unit, SR.COLORS[o.id], () => SR.show(o), o, !!o.diesel)));
  addDuty({id: E.id, rail: ar ? 'ar' : 'sr', R, rota, dd, job: lc(E.job), railName: ar ? 'Arlesdale Railway' : 'Skarloey Railway'});
});
if(CFR) CFR.ENG.forEach(e => {
  if(!e.runner) return;
  addDuty({id: e.id, rail: 'cfr', R: e.runner, rota: [member(e.name, [e.veh], e.dot, () => CFR.show(e), e, false)], dd: DUT.cfr[e.id] || {}, job: e.run.job, railName: 'Culdee Fell Railway'});
});
K.RUNNERS.filter(R => R.nwr).forEach(R => {
  const tr = R.nwr;
  const show = () => { openPanel('Engine', tr.name, tr.desc, `Line: ${LINES[tr.line].name}`); flyTo(tr.mesh.position.x, tr.mesh.position.y, tr.mesh.position.z, 0.14, undefined, 1.1); };
  addDuty({id: 'rex', rail: 'rex', R, rota: [member(tr.name, R.unit.map(m => m.v), tr.color, show, tr, true)], dd: DUT.rex || {}, job: 'passenger trains on the Arlesdale Railway', railName: 'Arlesdale Railway', keepPick: true});
});


function addDuty(o){
  const R = o.R, D = {id: o.id, rail: o.rail, railName: o.railName, R, rota: o.rota, shifts: parseShifts(o.dd.shifts), note: o.dd.note || '', job: o.job,
    work: o.rail === 'nwr' ? parseWork((DUT.work || {})[o.id]) : null, w: null,
    cur: 0, state: 'run', mover: null, timer: 0, want: 0, turn: null, gauge: R.line.kind === 'standard' ? 'std' : R.line.kind === 'miniature' ? 'mini' : 'ng'};
  DUTIES.push(D);
  o.rota.forEach((m, i) => byGroup.set(m.unit[0].group, {D, i}));
  if(!o.keepPick && R.marker) R.marker.userData.onPick = () => D.rota[D.cur].show();
}

// ------------------------------------------------------------------ an engine shed beside each terminus
// The engine leaves its train at the shed end, runs on past the platform and swings off on its own
// siding into the shed; every engine on the rota has a road of its own.
const GEO = {std: {sp: 4.8, W: [9, 13], H: 6.2, ramp: 24, end: 6, wall: 0x8a4a32},
             ng: {sp: 3.6, W: [6.5, 9.5], H: 4.4, ramp: 15, end: 3, wall: 0x7d6a58},
             mini: {sp: 2.4, W: [4.2, 6], H: 2.8, ramp: 9, end: 2, wall: 0x8a7a6a}};
const SHEDS = [], shedGroup = new THREE.Group(); scene.add(shedGroup);
const shedWinMat = new THREE.MeshStandardMaterial({color: 0x1d262c, emissive: 0xffc46a, emissiveIntensity: 0, roughness: 0.4});
const unitLen = (R, unit) => unit.reduce((s, v, i) => s + v.len * R.o.scale + (i ? R.gap : 0), 0);
const lens = (R, unit) => unit.map(v => ({len: v.len * R.o.scale}));
function stationAt(line, u){
  let best = null, bd = 45 * M;
  line.stops.forEach(k => { const st = STATIONS[k], d = Math.abs(K.lineU(line, st.name) - u) * line.real.len; if(d < bd){ bd = d; best = st; } });
  return best;
}
function platHalf(line, st){
  if(!st) return 0;
  const k = line.kind;
  return (k === 'standard' ? (MAJOR.has(st.name) ? 140 : 90) : k === 'miniature' ? 22 : k === 'industrial' ? 20 : 40) / 2 * M;
}
const latAt = (g, i, x) => g.lat[i] * smooth(0, g.ramp[i], (x - g.xDiv) * g.s);

function shedGeom(D, T, gapX, W, side){
  const R = D.R, G = GEO[D.gauge], s = T === 'A' ? -1 : 1, aT = T === 'A' ? R.aA : R.aB;
  let edge = s < 0 ? Infinity : -Infinity;              // outer end of the longest engine standing on the train
  D.rota.forEach(m => { const un = lens(R, m.unit); R.unitX(aT, T, un).forEach((x, k) => { const e = x + s * un[k].len / 2; edge = s < 0 ? Math.min(edge, e) : Math.max(edge, e); }); });
  const uEnd = T === 'A' ? R.o.uA : R.o.uB, st = stationAt(R.line, uEnd), xSt = (uEnd - R.o.uA) * R.sgn * R.L;
  const xPlat = xSt + s * platHalf(R.line, st);
  const xDiv = s < 0 ? Math.min(edge - 3 * M, xPlat - gapX * M) : Math.max(edge + 3 * M, xPlat + gapX * M);
  const n = D.rota.length, lat = [], ramp = [];
  for(let i = 0; i < n; i++){ lat.push(side * (W + i * G.sp) * M); ramp.push(G.ramp * (1 + i * 0.4) * M); }
  const len = Math.max(...D.rota.map(m => unitLen(R, m.unit))) + G.end * M;
  const xIn = xDiv + s * (ramp[n - 1] + 3 * M), xBack = xIn + s * len;
  return {T, s, aT, xDiv, xIn, xBack, lat, ramp, n, len, side, sp: G.sp * M, H: G.H, st};
}
function scoreShed(D, g){
  const R = D.R, line = R.line, near = (D.gauge === 'std' ? 4.5 : 3) * M;
  let bad = 0;
  const probe = (x, lat, body) => {
    const p = pathPoint(R, x, lat, _q), ty = K._p.y, u = R.o.uA + R.sgn * x / R.L;
    if(u > 0 && u < 1 && inTunnel(line, u)) bad += 3;
    const h = heightAt(p.x, p.z);
    if(h < 0.3 * M) bad += 3;
    if(body && h > ty + 1.6 * M) bad += 1;                // dug into a hillside
    if(body && h < ty - 7 * M) bad += 1;                  // high above the ground
    if(Math.abs(lat) > 3 * M && K.nearTrack(p.x, p.z, near)) bad += 2;
    if(S.taken.some(t => (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < t.r * t.r)) bad += 2;
    if(SHEDS.some(o => (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < o.r * o.r)) bad += 2;
  };
  const lo = g.lat[0] - g.side * g.sp * 0.6, hi = g.lat[g.n - 1] + g.side * g.sp * 0.6;
  for(let x = g.xIn; (x - g.xBack) * g.s <= 1e-9; x += g.s * 4 * M) for(let f = 0; f <= 1.0001; f += 0.25) probe(x, lo + (hi - lo) * f, true);
  for(let x = g.xDiv; (x - g.xIn) * g.s < 0; x += g.s * 4 * M) for(let i = 0; i < g.n; i++) probe(x, latAt(g, i, x), false);
  return bad;
}
function placeShed(D){
  const R = D.R, G = GEO[D.gauge], lane = R.o.lane || 0;
  const ends = R.o.shedEnd ? [R.o.shedEnd] : R.runRound ? ['A', 'B'] : [R.side];
  const sides = lane ? [Math.sign(lane)] : R.o.shedSide ? [R.o.shedSide] : [-R.sgn, R.sgn];      // double track: always on the outside
  let best = null;
  for(const T of ends) for(const gapX of [6, 30, 70]) for(const W of G.W) for(const side of sides){
    const g = shedGeom(D, T, gapX, W, side), sc = scoreShed(D, g);
    if(!best || sc < best.sc){ best = {g, sc}; if(sc === 0) return best; }
  }
  return best;
}
// a strip of sleepers and rails along a siding (built low x to high x so it faces up)
function strip(R, xa, xb, latFn){
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), half = (R.o.bedM || 2.3) * M / 2;
  const n = Math.max(2, Math.ceil((x1 - x0) / (2 * M))), vp = [], vu = [], vn = [], ix = [];
  let along = 0, prev = null;
  for(let k = 0; k <= n; k++){
    const x = x0 + (x1 - x0) * k / n, a = pathPoint(R, x, latFn(x), new V3()), y = K._p.y + 0.03 * M;
    const b = pathPoint(R, x + 0.5 * M, latFn(x + 0.5 * M), new V3());
    let dx = b.x - a.x, dz = b.z - a.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const nx = dz, nz = -dx;
    if(prev) along += Math.hypot(a.x - prev.x, a.z - prev.z);
    const bI = vp.length / 3;
    vp.push(a.x + nx * half, y, a.z + nz * half, a.x - nx * half, y, a.z - nz * half);
    vu.push(0, along / (0.9 * M), 1, along / (0.9 * M)); vn.push(0, 1, 0, 0, 1, 0);
    if(prev) ix.push(bI - 2, bI - 1, bI, bI - 1, bI + 1, bI);
    prev = a;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(vu, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(vn, 3));
  geo.setIndex(ix);
  const m = new THREE.Mesh(geo, R.line.realMesh.material); m.receiveShadow = true;
  shedGroup.add(m);
}
function buildShed(D){
  const g = D.shed, R = D.R, G = GEO[D.gauge];
  for(let i = 0; i < g.n; i++) strip(R, g.xDiv - g.s * 2 * M, g.xBack - g.s * 0.4 * M, x => latAt(g, i, x));
  // where the line ends short of the points, carry the track on to them
  const uBound = g.s * R.sgn > 0 ? 1 : 0, xEnd = (uBound - R.o.uA) * R.sgn * R.L;
  if((g.xDiv - xEnd) * g.s > 0) strip(R, xEnd - g.s * 1 * M, g.xDiv, () => 0);
  const xm = (g.xIn + g.xBack) / 2, latm = (g.lat[0] + g.lat[g.n - 1]) / 2;
  const c = pathPoint(R, xm, latm, new V3()), ty = K._p.y, t = K._t.clone(); t.y = 0; t.normalize();
  const grp = new THREE.Group(); grp.position.set(c.x, ty, c.z); grp.rotation.y = Math.atan2(t.x, t.z); grp.scale.setScalar(M);
  const w = (g.n * g.sp) / M + (D.gauge === 'std' ? 2.6 : 1.6), l = g.len / M, H = G.H, s = g.s;
  const WALL = K.mat(G.wall, 0.85), ROOF = K.mat(0x3a3f46, 0.75), PAD = K.mat(0x5e5a52, 0.95);
  // side and back walls; the front is open between brick piers under a lintel
  for(const e of [-1, 1]) K.box(grp, 0.4, H + 0.3, l, WALL, e * w / 2, H / 2 - 0.15, 0);
  K.box(grp, w, H + 0.3, 0.4, WALL, 0, H / 2 - 0.15, s * l / 2);
  K.box(grp, w, 1.0, 0.4, WALL, 0, H - 0.5, -s * l / 2);
  for(let k = 0; k <= g.n; k++){
    const lx = (g.lat[0] - g.side * g.sp / 2 + g.side * k * g.sp - latm) / M;
    K.box(grp, 0.5, H + 0.3, 0.5, WALL, Math.max(-w / 2, Math.min(w / 2, lx)), H / 2 - 0.15, -s * l / 2);
  }
  S.gable(grp, w + 0.6, l + 0.6, H, ROOF, 0, 0);
  const r = (w + 0.6) / 1.732 * 1.08;
  K.box(grp, 1.0, 0.6, Math.max(1, l - 3), ROOF, 0, H + r * 0.45 * 1.5 + 0.1, 0);       // smoke vent along the ridge
  // windows down both sides, lit at night
  for(let z = -l / 2 + 2.5; z < l / 2 - 1.5; z += 4) for(const e of [-1, 1]){
    const win = K.add(grp, new THREE.PlaneGeometry(1.3, 1.1), shedWinMat, e * (w / 2 + 0.22), H * 0.58, z); win.rotation.y = e * Math.PI / 2;
  }
  // a cinder pad levelling the ground under it
  let hmin = Infinity;
  for(let a = -l / 2; a <= l / 2; a += 4) for(let b = -w / 2; b <= w / 2; b += 3){
    const px = c.x + (t.x * a + t.z * b) * M, pz = c.z + (t.z * a - t.x * b) * M; hmin = Math.min(hmin, heightAt(px, pz));
  }
  const padH = Math.max(0.6, (ty - hmin) / M + 0.8);
  K.box(grp, w + 3, padH, l + 4 + (g.ramp[g.n - 1] / M) * 0.5, PAD, 0, -padH / 2 - 0.05, -s * (g.ramp[g.n - 1] / M) * 0.25);
  S.bakeVC(grp);
  shedGroup.add(grp);
  const rad = (Math.hypot(w, l) / 2 + 5) * M;
  SHEDS.push({x: c.x, z: c.z, r: rad});
  S.taken.push({x: c.x, z: c.z, r: rad});
  K.clearArea(c.x, c.z, rad + 4 * M);
  const sidingMid = pathPoint(R, (g.xDiv + g.xIn) / 2, latm * 0.5, new V3());
  K.clearArea(sidingMid.x, sidingMid.z, g.ramp[g.n - 1] * 0.6 + 6 * M);
  D.shedCenter = c;
}

// berth of rota engine i in its road, as a distance moved out from where it couples to the train
function parkQ(D, i){
  const R = D.R, g = D.shed, un = lens(R, D.rota[i].unit), xs = R.unitX(g.aT, g.T, un);
  let edge = g.s < 0 ? Infinity : -Infinity;
  xs.forEach((x, k) => { const e = x + g.s * un[k].len / 2; edge = g.s < 0 ? Math.min(edge, e) : Math.max(edge, e); });
  return Math.abs((g.xBack - g.s * 1.5 * M) - edge);
}
function placeUnit(D, i, q){
  const R = D.R, g = D.shed, m = D.rota[i], xs = R.unitX(g.aT, g.T, lens(R, m.unit));
  m.unit.forEach((v, k) => placeOn(R, v, xs[k] + g.s * q, x => latAt(g, i, x)));
}
function moveTo(D, i, from, to){ D.mover = {i, q: from, q1: to, v: 0}; }
function stepMover(D, dt){
  const mv = D.mover, R = D.R, vmax = (D.gauge === 'std' ? 3 : 2) * M, acc = 0.3 * M;
  const d = mv.q1 - mv.q, ad = Math.abs(d);
  mv.v = Math.min(Math.min(vmax, Math.sqrt(2 * acc * ad) + 0.05 * M), mv.v + acc * dt);
  const step = Math.min(ad, mv.v * dt), dq = Math.sign(d) * step;
  mv.q += dq;
  placeUnit(D, mv.i, mv.q);
  D.rota[mv.i].unit.forEach(v => K.spin(v, D.shed.s * dq, R.o.scale));
  if(!D.rota[mv.i].diesel) smoke(D.rota[mv.i].unit[0], step > 0, dt, mv);
  return Math.abs(mv.q1 - mv.q) < 1e-7;
}

const markerMats = new Map();
const markerFor = c => { if(!markerMats.has(c)) markerMats.set(c, K.markerMat(c)); return markerMats.get(c); };
function syncCulling(D){
  // engines off the train are culled like parked stock (only drawn close up)
  D.rota.forEach((m, i) => m.unit.forEach(v => { const e = entryOf.get(v); if(e) e.parked = i !== D.cur; }));
  if(D.R.marker && D.rail !== 'rex') D.R.marker.material = markerFor(D.rota[D.cur].color);
}

let built = 0, tq = performance.now();
DUTIES.forEach(D => {
  const best = placeShed(D);
  D.shed = best.g; D.shedScore = best.sc;
  D.endName = best.g.st ? best.g.st.name : null;
  buildShed(D); built++;
  D.rota.forEach((m, i) => { if(i > 0) placeUnit(D, i, parkQ(D, i)); });
  syncCulling(D);
});
if(K.trees && K.trees.invalidate) K.trees.invalidate();
const tSheds = performance.now() - tq;

function atShedEnd(D){
  const R = D.R, g = D.shed;
  return R.phase === 'dwell' && R.a === g.aT && R.side === g.T && (R.next === 'rr' || R.next === 'turn');
}
// One small step of the timetable, run between the runner's own steps so no arrival is missed.
function stepDuty(D, dt){
  const R = D.R, turn = onTurn(D.shifts, simTime), want = turn ? turn.idx : -1;
  D.turn = turn; D.want = want;
  if(D.work){ const w = workAt(D.work, simTime); if(w !== D.w) applyWork(D, w); }
  switch(D.state){
    case 'run':
      if(want !== D.cur && atShedEnd(D)){ R.hold = true; D.state = 'uncouple'; D.timer = 50; }
      break;
    case 'uncouple':
      if((D.timer -= dt) <= 0){ R.attached = false; moveTo(D, D.cur, 0, parkQ(D, D.cur)); D.state = 'toShed'; }
      break;
    case 'toShed':
      if(stepMover(D, dt)){ D.mover = null; D.state = 'shed'; D.since = simTime; }
      break;
    case 'shed':
      if(want < 0 && !D.tid && simTime - D.since > 60 && nextAny(D) - simTime > 180) goTidmouth(D);
      if(D.tid && (want >= 0 || nextAny(D) - simTime < (D.tid.route ? tripMin(D.tid.route.L) + 5 : 45))) leaveTidmouth(D);         // set off home in good time for the next turn
      if(want >= 0 && !D.tid){ D.coming = want; moveTo(D, want, parkQ(D, want), 0); D.state = 'fromShed'; if(want !== D.cur){ D.rota[want].unit.forEach(v => { const e = entryOf.get(v); if(e) e.parked = true; }); } }
      break;
    case 'fromShed':
      if(stepMover(D, dt)){
        D.mover = null;
        if(D.coming !== D.cur){ K.swapUnit(R, D.rota[D.coming].unit); D.cur = D.coming; syncCulling(D); }
        R.attached = true; D.state = 'couple'; D.timer = 45;
      }
      break;
    case 'couple':
      if((D.timer -= dt) <= 0){ R.hold = false; D.state = 'run'; }
      break;
  }
  R.hideMarker = D.state === 'shed';
}

// ------------------------------------------------------------------ depots: shunting by day, the shed by night
const YARDS = [];
const yardHours = (id, rail, rec) => {
  const Y = DUT.yards || {};
  return Y[id + rail] || Y[id] || (rec && rec.cat === 'Diesel' ? Y.diesels : null) || Y.default || ['06:00', '19:00'];
};
K.yards.forEach(Y => {
  const rakes = [];
  let cur = null, s = Y.origin !== undefined ? Y.origin : 4;
  Y.units.forEach((vehs, k) => {
    const id = Y.ids[k], rec = Y.rail === 'nwr' ? NWR.byId[id] : (Y.recs ? Y.recs[k] : null), engine = !!rec && !rec.former;
    if(engine || !cur){ cur = {vehs: [], off: [], L: 0, s, rec: engine ? rec : null, id, v: 0, target: s, wait: Math.random() * 1500}; rakes.push(cur); }
    vehs.forEach(v => { cur.vehs.push(v); cur.off.push(cur.L + v.len / 2); cur.L += v.len + 0.15; s += v.len + 0.15; });
  });
  rakes.forEach(r => { r.L -= 0.15; if(r.rec){ r.hours = yardHours(r.id, Y.rail, r.rec); r.rec.yard = true; byGroup.set(r.vehs[0].group, {Y, rake: r}); } });
  // night berths: packed into the shed at the far end of the road
  let edge = Y.sMax;
  for(let k = rakes.length - 1; k >= 0; k--){ rakes[k].nightS = edge - rakes[k].L; edge = rakes[k].nightS - 1.2; }
  Y.rakes = rakes;
  Y.rnd = (Math.sin(YARDS.length * 91.7 + 3.3) * 43758.5) % 1;
  if(rakes.some(r => r.rec)) YARDS.push(Y);
});
const _yp = new V3();
function placeRake(Y, r){
  r.vehs.forEach((v, j) => { Y.at(r.s + r.off[j], _yp); v.group.position.copy(_yp); v.group.rotation.set(0, Y.yaw, 0); });
}
function stepYards(dt){
  const GAP = 1.2, VMAX = 2, ACC = 0.2;
  YARDS.forEach(Y => {
    const n = Y.rakes.length;
    Y.rakes.forEach((r, k) => {
      if(!r.rec) return;
      const working = inHours(r.hours, simTime);
      const lo = k > 0 ? Y.rakes[k - 1].s + Y.rakes[k - 1].L + GAP : Y.sMin;
      const hi = k < n - 1 ? Y.rakes[k + 1].s - GAP - r.L : Y.sMax - r.L;
      r.working = working;
      if(!working){ if(Y.shed) r.target = r.nightS; }
      else if(Math.abs(r.target - r.s) < 0.05){
        r.wait -= dt;
        if(r.wait <= 0){
          const a = Math.min(lo, r.s), b = Math.max(hi, r.s);
          if(b - a > 4) r.target = a + Math.random() * (b - a);
          r.wait = (6 + Math.random() * 30) * 60;                 // a pause between shunting moves
        }
      }
      const d = r.target - r.s;
      if(Math.abs(d) < 1e-4){ r.v = 0; return; }
      const room = d > 0 ? Math.max(0, hi - r.s) : Math.max(0, r.s - lo);
      r.v = Math.min(VMAX, Math.sqrt(2 * ACC * Math.min(Math.abs(d), room)) + 0.05, r.v + ACC * dt);
      const step = Math.min(Math.abs(d), room, r.v * dt);
      if(step <= 1e-5){ r.v = 0; if(working) r.target = r.s; return; }        // blocked by a neighbour: give up this move
      r.s += Math.sign(d) * step;
      placeRake(Y, r);
      r.vehs.forEach(v => K.spin(v, Math.sign(d) * step * Y.face * M, Y.scale || M));
      if(r.rec.cat !== 'Diesel') smoke(r.vehs[0], true, dt, r);
    });
  });
}

// Tidmouth Sheds: by day the engines stand at the front of their stalls and take turns on the
// turntable; at night they draw right back inside.
const RH = K.roundhouse;
if(RH){
  RH.phiB = Math.PI / 2;                                  // the bridge starts lying along the yard
  RH.hours = (DUT.yards || {}).tidmouth || ['05:00', '23:00'];
  RH.wait = 4 * 60; RH.job = null; RH.queue = []; RH.travel = [];
  RH.stalls.forEach(st => {
    st.off = []; st.L = 0;
    st.vehs.forEach(v => { st.off.push(st.L + v.len / 2); st.L += v.len + 0.15; });
    st.L -= 0.15; st.flip = false; st.v = 0;
    st.dayRho = st.door ? Math.max(RH.R0 + 1, st.door - 3) : RH.R0 + 1;          // nose at the doorway by day
    st.nightRho = Math.max(st.dayRho, (st.end || RH.R1) - 1 - st.L); st.rho = st.dayRho;
    st.engine = !!st.rec;
    if(st.rec){ st.rec.yard = true; byGroup.set(st.vehs[0].group, {RH, st}); }
  });
}
const dirW = (phi, out) => { const p0 = RH.kit.pt(RH.ca, RH.cb), p1 = RH.kit.pt(RH.ca + Math.sin(phi), RH.cb + Math.cos(phi)); return out.subVectors(p1, p0).normalize(); };
const _dw = new V3();
const _pw = new V3();
function placeStall(st, phi){
  const sf = st.flip ? 1 : -1;                             // facing out of the stall or in towards the table
  st.vehs.forEach((v, j) => {
    const r = st.rho + (st.flip ? st.L - st.off[j] : st.off[j]);
    if(RH.stallPt){
      // the stall road curves from the table into its doorway (nwr.js stallPt)
      const q = RH.stallPt(st, r, phi === st.phi ? undefined : phi);
      v.group.position.copy(RH.kit.pt(q.a, q.b));
      _dw.copy(RH.kit.pt(q.a + q.ta, q.b + q.tb)).sub(v.group.position).normalize();
    } else {
      dirW(phi, _dw);
      v.group.position.copy(RH.kit.pt(RH.ca + Math.sin(phi) * r, RH.cb + Math.cos(phi) * r));
    }
    v.group.rotation.set(0, Math.atan2(sf * _dw.x, sf * _dw.z), 0);
  });
}
function approach(st, target, dt, vmax = 1.3, acc = 0.15){
  const d = target - st.rho;
  if(Math.abs(d) < 1e-4){ st.v = 0; return true; }
  st.v = Math.min(vmax, Math.sqrt(2 * acc * Math.abs(d)) + 0.04, st.v + acc * dt);
  const step = Math.min(Math.abs(d), st.v * dt);
  st.rho += Math.sign(d) * step;
  const sf = st.flip ? 1 : -1;
  st.vehs.forEach(v => K.spin(v, Math.sign(d) * step * -sf * M, M));
  if(st.rec && st.rec.cat !== 'Diesel') smoke(st.vehs[0], true, dt, st);
  return Math.abs(target - st.rho) < 1e-4;
}
// The Steam Team live at Tidmouth Sheds. Once an engine has been on shed a while it runs home: up the
// Main Line from the south, through the points onto the shed road, along the lead onto the turntable,
// round to a stall of its own and back in. When its next turn begins it comes out the same way, onto the
// table, round to face the lead, off along the shed road and away down the line to its duty's shed.
const STEAM_TEAM = new Set(['thomas', 'gordon', 'james', 'percy', 'emily', 'rebecca', 'nia']);
const BERTH = {thomas: 0, gordon: 1, james: 2, percy: 3, emily: 4, rebecca: 5, nia: 6};        // each engine's own stall, left to right
const mkRoute = pts => { const P = [pts[0]], S = [0]; for(let i = 1; i < pts.length; i++){ const d = pts[i].distanceTo(P[P.length - 1]) / M; if(d < 0.3) continue; P.push(pts[i]); S.push(S[S.length - 1] + d); } return {P, S, L: S[S.length - 1]}; };
const IN = RH && RH.inPath && RH.inPath.length > 2 ? mkRoute(RH.inPath) : null;       // Main Line south of the sheds to the turntable
// The standard-gauge network: lines join where one ends beside another (a branch at its junction station).
let NET = null;
function nearOn(line, x, z){ const R = line.real; let bj = 0, bd = Infinity; for(let j = 0; j < R.n; j++){ const d = (R.x[j] - x) ** 2 + (R.z[j] - z) ** 2; if(d < bd){ bd = d; bj = j; } } return {u: bj / (R.n - 1), d: Math.sqrt(bd)}; }
function net(){
  if(NET) return NET;
  const ids = Object.keys(LINES).filter(k => LINES[k].kind === 'standard' && LINES[k].real && LINES[k].real.n > 1), E = [];
  ids.forEach(a => { const RA = LINES[a].real; [0, RA.n - 1].forEach(j => ids.forEach(b => {
    if(b === a) return; const q = nearOn(LINES[b], RA.x[j], RA.z[j]);
    if(q.d < 60 * M){ const ua = j / (RA.n - 1); E.push({a, ua, b, ub: q.u}, {a: b, ua: q.u, b: a, ub: ua}); }
  })); });
  return NET = {ids, E};
}
function hopsTo(src, dst){                                       // fewest junctions from one line to another
  const prev = {[src]: null}, Q = [src];
  while(Q.length){ const a = Q.shift(); if(a === dst) break; net().E.forEach(e => { if(e.a === a && !(e.b in prev)){ prev[e.b] = e; Q.push(e.b); } }); }
  if(!(dst in prev)) return null;
  const out = []; for(let c = dst; prev[c]; c = prev[c].a) out.unshift(prev[c].b);
  return out;                                                    // the lines passed onto, in order
}
const _lp = new V3(), _lt = new V3();
function linePts(line, u0, u1, lat, out){
  const n = Math.max(1, Math.ceil(Math.abs(u1 - u0) * line.real.len / (6 * M)));
  for(let i = 0; i <= n; i++){
    const u = u0 + (u1 - u0) * i / n; realAt(line, u, _lp);
    if(lat){ realDir(line, u, _lt); _lt.y = 0; _lt.normalize(); _lp.x += _lt.z * lat * M; _lp.z -= _lt.x * lat * M; }
    out.push(_lp.clone());
  }
}
// From an engine's own shed to the Tidmouth turntable: along its line, over each junction, up the Main Line.
function homeRoute(D, from){
  const line = D.R.line, lid = Object.keys(LINES).find(k => LINES[k] === line), P = [from.clone()];
  const hops = lid === 'main' ? [] : lid ? hopsTo(lid, 'main') : null;
  if(!hops) return mkRoute(IN.P);                                  // not joined to the Main Line: start south of Tidmouth
  let cur = lid, u = nearOn(line, from.x, from.z).u;
  hops.forEach(b => {
    let best = null; net().E.forEach(e => { if(e.a === cur && e.b === b && (!best || Math.abs(e.ua - u) < Math.abs(best.ua - u))) best = e; });
    linePts(LINES[cur], u, best.ua, cur === 'main' ? MAIN_LANE : 0, P); cur = b; u = best.ub;
  });
  linePts(LINES.main, u, nearOn(LINES.main, IN.P[0].x, IN.P[0].z).u, MAIN_LANE, P);
  IN.P.forEach(p => P.push(p));
  return mkRoute(P);
}
const _rp = new V3(), _rt = new V3();
function routeAt(R, s, out, tan){                                 // s metres along the route, straight on past either end
  const {P, S, L} = R;
  let lo = 1, hi = P.length - 1;
  if(s > 0 && s < L){ while(lo < hi){ const mid = (lo + hi) >> 1; if(S[mid] < s) lo = mid + 1; else hi = mid; } } else lo = s <= 0 ? 1 : P.length - 1;
  const a = P[lo - 1], b = P[lo], t = (s - S[lo - 1]) / ((S[lo] - S[lo - 1]) || 1);
  out.lerpVectors(a, b, t); tan.subVectors(b, a).normalize(); return out;
}
function placeRoute(st, R, sF, dir){                              // engine front at sF, running with (+1) or against (-1) the route
  st.vehs.forEach((v, j) => { routeAt(R, sF - dir * st.off[j], _rp, _rt); v.group.position.copy(_rp); v.group.rotation.set(0, Math.atan2(dir * _rt.x, dir * _rt.z), 0); });
}
function driveRoute(J, st, dt, toward){                           // move the front towards `toward`, easing to a stand
  const R = J.route, d = toward - J.s, yard = J.s > R.L - IN.L + 40, ACC = 0.4;
  J.v = Math.min(yard ? 6 : 25, Math.sqrt(2 * ACC * Math.abs(d)) + 0.3, (J.v || 0) + ACC * dt);   // slower through the junction and the yard
  const step = Math.min(Math.abs(d), J.v * dt);
  J.s += Math.sign(d) * step;
  placeRoute(st, R, J.s, J.dir);
  st.vehs.forEach(v => K.spin(v, -step * M, M));
  smoke(st.vehs[0], step > 0, dt, st);
  return Math.abs(toward - J.s) < 1e-3;
}
const tripMin = L => L / 21 / 60 + 8;                          // minutes to run light engine L metres, with the turntable
function nextAny(D){ let t = Infinity; D.rota.forEach((m, i) => { const n = nextTurn(D.shifts, i, simTime); if(n) t = Math.min(t, n.t); }); return t; }
function goTidmouth(D){
  const m = D.rota[D.cur];
  D.tid = 'none';
  if(!RH || !IN || !m.rec || !STEAM_TEAM.has(m.rec.id)) return;
  const own = RH.stalls[BERTH[m.rec.id]], st = own && !own.vehs.length && !own.guest ? own : RH.stalls.find(s => !s.vehs.length && !s.guest);
  if(!st) return;
  st.guest = D; st.vehs = m.unit; st.off = []; st.L = 0;
  st.vehs.forEach(v => { st.off.push(st.L + v.len / 2); st.L += v.len + 0.15; });
  st.L -= 0.15; st.flip = false; st.v = 0;
  st.homeRho = Math.max(RH.R0 + 1, (st.end || RH.R1) - 1 - st.L);
  D.tid = st;
  m.unit.forEach(v => { const e = entryOf.get(v); if(e) e.parked = true; });      // drawn like the other engines on shed while it is away
  const route = homeRoute(D, m.unit[0].group.position);
  if(nextAny(D) - simTime < 2 * tripMin(route.L) + 90){ st.vehs = []; st.guest = null; D.tid = 'none'; syncCulling(D); return; }   // too far to go home tonight
  st.route = route;
  RH.travel.push({kind: 'arrive', st, D, route, phase: 'drive', s: st.L, dir: 1, v: 0});
}
// returns once the engine is back at its own shed; until then the duty waits on shed
function leaveTidmouth(D){
  const st = D.tid;
  if(st && st !== 'none'){
    if(D.leaving) return;
    D.leaving = true;
    const J = RH.travel.find(j => j.st === st);
    if(J && !J.table){ J.kind = 'back'; return; }                  // still on the way: run straight back
    RH.queue.push({kind: 'leave', st, D, route: st.route});
    return;
  }
  D.tid = null;
}
function homeAgain(J){ const st = J.st; st.vehs = []; st.guest = null; J.D.tid = null; J.D.leaving = false; syncCulling(J.D); }
// the journeys along the line, which need no turntable until the last few metres
function stepTravel(dt){
  for(let k = RH.travel.length - 1; k >= 0; k--){
    const J = RH.travel[k], st = J.st, R = J.route;
    if(J.kind === 'back' || J.kind === 'leave'){                    // back to the engine's own shed (`back`: never got here, so tender first)
      if(driveRoute(J, st, dt, J.kind === 'back' ? st.L : 0)){ RH.travel.splice(k, 1); homeAgain(J); }
      continue;
    }
    if(!J.table && J.s >= R.L - 30 - 1e-3 && !RH.job){ RH.job = J; J.table = true; }
    const there = driveRoute(J, st, dt, J.table ? R.L : R.L - 30);
    const aligned = J.table && alignBridge(RH.phiL, dt, true);
    if(there && aligned){ RH.phiB = RH.phiL; setBridge(); st.rho = RH.R0; J.phase = 'onto'; RH.travel.splice(k, 1); }
  }
}
const angTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
// turn the bridge towards phi (either end will do when `either`); true once it lines up
function alignBridge(phi, dt, either){
  const OMEGA = Math.PI / 60, dA = angTo(RH.phiB, phi), dB = angTo(RH.phiB, phi + Math.PI), d = either && Math.abs(dB) < Math.abs(dA) ? dB : dA;
  RH.phiB += Math.sign(d) * Math.min(Math.abs(d), OMEGA * dt); setBridge();
  return Math.abs(d) < 1e-4;
}
// the bridge turning with an engine on it, from its present angle to phi
function turnWith(st, phi, dt){
  const OMEGA = Math.PI / 60, d = angTo(RH.phiB, phi);
  RH.phiB += Math.sign(d) * Math.min(Math.abs(d), OMEGA * dt); setBridge(); placeStall(st, RH.phiB);
  return Math.abs(d) < 1e-4;
}
function stepVisit(J, dt){                                          // the turntable part of a visit; true when the table is free again
  const st = J.st;
  if(J.kind === 'arrive'){
    if(J.phase === 'onto'){
      if(approach(st, -st.L / 2, dt, 1.0)) J.phase = 'turn';
      placeStall(st, RH.phiL);
    } else if(J.phase === 'turn'){
      if(turnWith(st, st.phi, dt)){ RH.phiB = st.phi; J.phase = 'in'; }
    } else if(J.phase === 'in'){
      const done = approach(st, RH.working ? st.dayRho : st.homeRho, dt, 1.0);
      placeStall(st, st.phi);                                    // place before finishing: a fast clock can finish in one step
      if(done) return true;
    }
    return false;
  }
  if(!J.phase) J.phase = 'align';
  if(J.phase === 'align'){ if(alignBridge(st.phi, dt, true)){ RH.phiB = st.phi; setBridge(); J.phase = 'out'; } }
  else if(J.phase === 'out'){
    if(approach(st, -st.L / 2, dt, 1.0)) J.phase = 'turn';
    placeStall(st, st.phi);
  } else if(J.phase === 'turn'){
    if(turnWith(st, RH.phiL + Math.PI, dt)){ RH.phiB = RH.phiL + Math.PI; J.phase = 'off'; }
  } else if(J.phase === 'off'){
    placeStall(st, RH.phiL + Math.PI);
    if(approach(st, -RH.R0, dt, 1.0)){
      if(!J.route) J.route = mkRoute(IN.P.slice());               // no record of its way here: away down the Main Line
      J.phase = 'drive'; J.s = J.route.L; J.dir = -1; J.v = 1; RH.travel.push(J); return true;
    }
  }
  return false;
}
const setBridge = () => { RH.bridge.rotation.y = RH.sx * (Math.PI / 2 - RH.phiB); };
function stepRoundhouse(dt){
  if(!RH) return;
  const working = inHours(RH.hours, simTime), OMEGA = Math.PI / 60;
  RH.working = working;
  RH.stalls.forEach((st, k) => {
    if(!st.engine || (RH.job && RH.job.st === st)) return;
    // put away one after another in the evening, out one after another in the morning
    const stagger = k * 6;
    const want = working ? (mod(simTime, 1440) - hm(RH.hours[0]) > stagger || mod(simTime, 1440) < hm(RH.hours[0]) ? st.dayRho : st.rho)
                         : (mod(simTime - hm(RH.hours[1]), 1440) > stagger ? st.nightRho : st.rho);
    if(Math.abs(want - st.rho) > 1e-4){ approach(st, want, dt); placeStall(st, st.phi); }
  });
  if(!RH.job && RH.queue.length) RH.job = RH.queue.shift();
  stepTravel(dt);
  if(RH.job && RH.job.kind){ if(RH.job.phase !== 'drive' && stepVisit(RH.job, dt)){ RH.job = null; RH.wait = 10 * 60; } return; }
  if(!RH.job && RH.travel.some(j => j.kind === 'arrive' && j.s > j.route.L - 400)) return;      // keep the table free for an engine coming in
  if(!RH.job){
    if(!working) return;
    if((RH.wait -= dt) > 0) return;
    const ready = RH.stalls.filter(st => st.engine && Math.abs(st.rho - st.dayRho) < 1e-3 && st.L < 2 * RH.R0 - 1);
    if(!ready.length){ RH.wait = 600; return; }
    RH.job = {st: ready[Math.floor(Math.random() * ready.length)], phase: 'align'};
  }
  const J = RH.job, st = J.st;
  if(J.phase === 'align'){
    // the bridge is symmetric: line up whichever end is nearer
    let target = st.phi;
    const dA = Math.atan2(Math.sin(target - RH.phiB), Math.cos(target - RH.phiB));
    const dB = Math.atan2(Math.sin(target + Math.PI - RH.phiB), Math.cos(target + Math.PI - RH.phiB));
    const d = Math.abs(dA) < Math.abs(dB) ? dA : dB, step = Math.sign(d) * Math.min(Math.abs(d), OMEGA * dt);
    RH.phiB += step; setBridge();
    if(Math.abs(d) < 1e-4){ RH.phiB = st.phi; setBridge(); J.phase = 'out'; }
  } else if(J.phase === 'out'){
    if(approach(st, -st.L / 2, dt, 1.0)){ J.phase = 'turn'; J.turned = 0; }
    placeStall(st, st.phi);
  } else if(J.phase === 'turn'){
    const step = Math.min(Math.PI - J.turned, OMEGA * dt);
    J.turned += step; RH.phiB = st.phi + J.turned; setBridge();
    placeStall(st, RH.phiB);
    if(J.turned >= Math.PI - 1e-6){ st.flip = !st.flip; RH.phiB = st.phi; placeStall(st, st.phi); J.phase = 'in'; }
  } else if(J.phase === 'in'){
    if(approach(st, working ? st.dayRho : st.nightRho, dt, 1.0)){ RH.job = null; RH.wait = (12 + Math.random() * 30) * 60; }
    placeStall(st, st.phi);
  }
}

// ------------------------------------------------------------------ what each engine is doing
function dutyStatus(D, i){
  const at = D.endName ? ` at ${D.endName}` : '', now = simTime;
  const nt = nextTurn(D.shifts, i, now), next = nt ? when(nt.t, now) : 'not in the next fortnight';
  const job = jobNow(D);
  if(D.state === 'fromShed' && D.coming === i) return `Coming off shed${at} to work ${job}.`;
  if(i === D.cur){
    if(D.state === 'run'){
      if(D.want === i){
        let later = '';
        if(D.work && D.work.length > 1){ const k = D.work.indexOf(D.w), nx = D.work[(k + 1) % D.work.length]; if(nx !== D.w) later = ` From ${fmtTime(nx.t)}: ${nx.txt}.`; }
        return `On duty until ${fmtTime(D.turn.end)}, now working ${job}.${later}`;
      }
      return `Finishing ${job}: the last trip back${at}, then on shed.`;
    }
    if(D.state === 'uncouple') return `Uncoupling from the train${at} to go on shed.`;
    if(D.state === 'toShed') return `Running into the engine shed${at}.`;
    if(D.state === 'couple') return `Coupled on${at}, about to start ${job}.`;
    if(D.state === 'shed' && D.tid && D.tid !== 'none'){
      const J = RH.job && RH.job.st === D.tid ? RH.job : null;
      if(D.leaving) return J || RH.travel.some(q => q.st === D.tid) ? `Leaving Tidmouth Sheds, running back light engine to work ${job}.` : `Waiting for the turntable at Tidmouth Sheds before ${job}.`;
      const T = RH.travel.find(q => q.st === D.tid);
      if(T && T.kind === 'arrive') return `Running home light engine to Tidmouth Sheds, along the line and up the Main Line.`;
      if(J && J.kind === 'arrive' && J.phase !== 'in') return `Coming onto the turntable at Tidmouth Sheds.`;
      return `Home at Tidmouth Sheds with the Steam Team until ${next}.`;
    }
  }
  return `On shed${at}. Next turn: ${next}.`;
}
function statusOf(group){
  const e = byGroup.get(group);
  if(!e) return '';
  if(e.D){
    const D = e.D, base = dutyStatus(D, e.i);
    const day = D.work ? ` The day's work: ${D.work.map(w => `${fmtTime(w.t)} ${w.txt}`).join('; ')}.` : '';
    return `${base} Rota: ${D.rota.map(m => m.name).join(' and ')} · ${shiftText(D.shifts)}.${day}${D.note ? ' ' + D.note : ''}`;
  }
  if(e.Y){
    const r = e.rake, Y = e.Y;
    if(r.working) return `Shunting at ${Y.label} until ${fmtTime(hm(r.hours[1]))} (works ${r.hours[0]}–${r.hours[1]}).`;
    return `${Y.shed ? 'Put away in the shed' : 'Stabled'} at ${Y.label} until ${r.hours[0]}.`;
  }
  if(e.RH){
    if(RH.job && RH.job.st === e.st) return 'On the turntable at Tidmouth Sheds, being turned.';
    if(RH.working) return `At the front of a stall at Tidmouth Sheds; the engines take turns on the turntable until ${RH.hours[1]}.`;
    return `Drawn back inside a stall at Tidmouth Sheds for the night, until ${RH.hours[0]}.`;
  }
  return '';
}

// ------------------------------------------------------------------ the duties board
const list = document.getElementById('dutyList');
const rows = [];
if(list){
  const head = document.createElement('div'); head.className = 'duty-head'; list.appendChild(head);
  let lastRail = null;
  DUTIES.forEach(D => {
    if(D.railName !== lastRail){ lastRail = D.railName; const h = document.createElement('div'); h.className = 'leg-group'; h.textContent = D.railName; list.appendChild(h); }
    const d = document.createElement('div'); d.className = 'ros-item duty-row';
    d.innerHTML = '<span class="ros-dot"></span><div class="duty-txt"><div class="duty-main"></div><div class="duty-sub"></div></div>';
    d.querySelector('.duty-sub').textContent = D.work ? `${shiftText(D.shifts)} · ${D.work.map(w => `${fmtTime(w.t)} ${WORK_SHORT[w.kind]}`).join(', ')}`
      : `${D.job.charAt(0).toUpperCase() + D.job.slice(1)} · ${shiftText(D.shifts)}`;
    d.onclick = () => { const i = D.state === 'fromShed' ? D.coming : D.want >= 0 ? D.want : D.cur; D.rota[i].show(); };
    list.appendChild(d);
    rows.push({D, d, dot: d.querySelector('.ros-dot'), main: d.querySelector('.duty-main')});
  });
  rows.head = head;
}
function shortState(D){
  const m = D.rota[D.cur];
  switch(D.state){
    case 'run': return D.want === D.cur ? [m, `${m.name} · ${D.w ? WORK_SHORT[D.w.kind] + ' to ' + fmtTime(D.turn.end) : 'on duty to ' + fmtTime(D.turn.end)}`, 'on'] : [m, `${m.name} · last trip, then on shed`, 'off'];
    case 'uncouple': case 'toShed': return [m, `${m.name} · going on shed`, 'off'];
    case 'fromShed': { const c = D.rota[D.coming]; return [c, `${c.name} · coming off shed`, 'on']; }
    case 'couple': return [m, `${m.name} · coupling on`, 'on'];
    default: {
      let best = null;
      D.rota.forEach((r, i) => { const nt = nextTurn(D.shifts, i, simTime); if(nt && (!best || nt.t < best.t)) best = {t: nt.t, r}; });
      return best ? [best.r, `On shed · ${best.r.name} out ${when(best.t, simTime)}`, 'shed'] : [m, 'On shed', 'shed'];
    }
  }
}
const statEl = document.getElementById('statTrains');
let boardT = 0;
function updateBoard(){
  let running = 0, shed = 0, moving = 0;
  DUTIES.forEach(D => { if(D.state === 'run') running++; else if(D.state === 'shed') shed++; else moving++; });
  const shunting = YARDS.reduce((n, Y) => n + Y.rakes.filter(r => r.rec && r.working).length, 0) + (RH && RH.working ? RH.stalls.filter(s => s.engine).length : 0);
  if(statEl) statEl.textContent = `${running} of ${DUTIES.length}`;
  if(!list || list.style.display === 'none') return;
  const d = Math.floor(simTime / 1440);
  rows.head.innerHTML = `<b>${DAYS[mod(d, 7)]} ${fmtTime(simTime)}</b><span>${running} trains working · ${moving} going on or off shed · ${shed} on shed · ${shunting} engines at work in the depots</span>`;
  rows.forEach(r => {
    const [m, text, cls] = shortState(r.D);
    r.dot.style.background = hex(m.color);
    if(r.main.textContent !== text) r.main.textContent = text;
    r.d.dataset.state = cls;
  });
}

// ------------------------------------------------------------------ lamps
// White lamps lead each moving train and a red one trails it; they show from dusk to dawn.
const lamps = typeof makeGlow === 'function' ? makeGlow(600, {minPx: 2, maxPx: 22, floor: 0.5}) : null;
const WHITE = new THREE.Color(0xfff0cc), RED = new THREE.Color(0xff2a14);
function lampAt(R, x, h, c){ pathPoint(R, x, 0, _q); lamps.add(_q.x, _q.y + h, _q.z, c, 40 * M); }
function updateLamps(){
  if(!lamps) return;
  lamps.clear();
  if(NIGHT_U.value < 0.02){ lamps.pts.visible = false; return; }
  lamps.pts.visible = true;
  DUTIES.forEach(D => {
    const R = D.R; if(!R.line.userVisible) return;
    const h = D.gauge === 'std' ? 2.4 * M : 0.6 * R.o.scale;
    if(D.mover){ const g = D.rota[D.mover.i].unit[0].group; lamps.add(g.position.x, g.position.y + h, g.position.z, WHITE, 40 * M); return; }
    if(R.hold || R.phase === 'rr'){ if(R.phase === 'rr' || D.state === 'couple'){ const g = R.engine.group; lamps.add(g.position.x, g.position.y + h, g.position.z, WHITE, 40 * M); } return; }
    if(!R.engine.group.visible) return;
    const xs = R.unitX(R.a, R.side), last = R.cars.length - 1, nU = R.unit.length - 1;
    const hi = Math.max(xs[0] + R.unit[0].len / 2, R.a + R.cars[0].len / 2), lo = Math.min(xs[nU] - R.unit[nU].len / 2, R.a - R.off[last] - R.cars[last].len / 2);
    lampAt(R, R.dir > 0 ? hi : lo, h, WHITE);
    lampAt(R, R.dir > 0 ? lo : hi, h * 0.8, RED);
  });
  lamps.flush();
}

// ------------------------------------------------------------------ every frame
const stat = () => ({sheds: SHEDS.length, duties: DUTIES.length, yards: YARDS.length});
frameHooks.push(dt => {
  const d = dt * timeScale;
  stepYards(d);
  stepRoundhouse(d);
  shedGroup.visible = camDist < 9;
  shedWinMat.emissiveIntensity = NIGHT_U.value * 1.2;
  updateLamps();
  boardT -= dt;
  if(boardT <= 0){ boardT = 0.5; updateBoard(); }
});
// the duties are stepped by the train runner itself, before each of its sub-steps
const step = dt => DUTIES.forEach(D => { stepDuty(D, dt); if(D.mover && D.state !== 'toShed' && D.state !== 'fromShed') D.mover = null; });

window.SODOR_OPS = {DUTIES, YARDS, RH, SHEDS, statusOf, step, onTurn, nextTurn, stat, updateBoard};
console.log(`Operations: ${DUTIES.length} duties with ${SHEDS.length} engine sheds (${DUTIES.filter(D => D.shedScore > 0).length} on imperfect ground), ${YARDS.length} depot roads, built in ${Math.round(performance.now() - t0)} ms (sheds ${Math.round(tSheds)} ms)`);
})();
