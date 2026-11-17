// knapford.js: Knapford station, its throats and yard, and the town's edge around them, built on
// the track plan in index.html (KNAP). Loaded after nwr.js and cfr.js (the trains and Knapford
// Yards exist) and before ops.js and world.js, so engine sheds and the town keep off its ground.
//
// The station: a four-span glazed overall roof on green iron columns over six roads, a side
// platform (1) and two islands (2/3, 4/5), the brick frontage on the town side with its forecourt,
// signal gantries at both throats whose arms clear for each train, ground signals at the points,
// signal boxes, water columns and a water tower, a coal stage and a goods shed in the yard, and
// arcaded retaining walls with terraces above them.
(function(){
'use strict';
if(typeof KNAP === 'undefined' || !KNAP.line) return;          // KNAP is a top-level const in index.html, not a window property
const t0 = performance.now();
const K = window.SODOR_KIT, S = window.SODOR_STD, NWR = window.SODOR_NWR;
const {mat, add, box, cylY, cylX, cylZ, canvasTex, glassMat} = K;
const M = METRE, V3 = THREE.Vector3, RD = KNAP.ROAD;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ frames along the Main Line
const G = new THREE.Group();            // static parts, baked into a handful of meshes at the end
const GLASS_G = new THREE.Group();      // the roof glazing (no shadows)
// A local frame (metres) at (s, x) on the Main Line, at rail level plus dy, turned to the line.
function seg(s, x = 0, dy = 0, parent = G){
  const g = new THREE.Group(), p = KNAP.at(s, x), t = KNAP.tangent(s);
  g.position.set(p.x, p.y + dy * M, p.z); g.rotation.y = Math.atan2(t.x, t.z); g.scale.setScalar(M); parent.add(g); return g;
}
const railY = s => KNAP.y(s);

// ------------------------------------------------------------------ textures
function tiled(tex, w, h){ tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.userData = {w, h}; return tex; }
const brickTex = tiled(canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#6e5a4e'; g.fillRect(0, 0, w, h);
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for(let row = 0; row < 16; row++) for(let k = -1; k < 9; k++){
    const x = k * 32 + (row % 2 ? 16 : 0), y = row * 8, v = r();
    g.fillStyle = `rgb(${150 + v * 40 | 0},${70 + v * 22 | 0},${52 + v * 16 | 0})`; g.fillRect(x + 1, y + 1, 30, 6);
  }
}), 4, 2);                                          // one tile = 4 m x 2 m of brickwork
const pavingTex = tiled(canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#b9b2a4'; g.fillRect(0, 0, w, h);
  let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for(let y = 0; y < 4; y++) for(let x = 0; x < 4; x++){ const v = r(); g.fillStyle = `rgb(${178 + v * 26 | 0},${172 + v * 24 | 0},${158 + v * 20 | 0})`; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); }
}), 2.4, 2.4);
const arcadeTex = tiled(canvasTex(256, 192, (g, w, h) => {      // retaining wall: one blind arch per tile
  g.fillStyle = '#6e5a4e'; g.fillRect(0, 0, w, h);
  let s = 9; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for(let row = 0; row < 24; row++) for(let k = -1; k < 9; k++){
    const x = k * 32 + (row % 2 ? 16 : 0), y = row * 8, v = r();
    g.fillStyle = `rgb(${140 + v * 36 | 0},${66 + v * 20 | 0},${50 + v * 14 | 0})`; g.fillRect(x + 1, y + 1, 30, 6);
  }
  g.fillStyle = 'rgba(30,18,14,0.55)'; g.beginPath(); g.moveTo(40, h); g.lineTo(40, 80); g.arc(128, 80, 88, Math.PI, 0); g.lineTo(216, h); g.closePath(); g.fill();
  g.strokeStyle = '#a89a86'; g.lineWidth = 8; g.beginPath(); g.moveTo(40, h); g.lineTo(40, 80); g.arc(128, 80, 88, Math.PI, 0); g.lineTo(216, h); g.stroke();
  g.fillStyle = '#a89a86'; g.fillRect(0, 0, w, 10);
}), 8, 6);                                          // one arch every 8 m, 6 m tall
const glazeTex = tiled(canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#b8dbe2'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2f6a3a'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
  g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
}), 1.6, 1.6);
// UVs in metres so a tiled material repeats at its true size on any box
function uvBox(geo, tw, th){
  const uv = geo.attributes.uv, n = geo.attributes.normal, p = geo.attributes.position;
  for(let i = 0; i < uv.count; i++){
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const u = ax > 0.5 ? p.getZ(i) : p.getX(i), v = ay > 0.5 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u / tw, v / th);
  }
  return geo;
}
function tbox(p, w, h, d, m, x, y, z){
  const geo = new THREE.BoxGeometry(w, h, d); geo.translate(x, y, z);
  uvBox(geo, m.map.userData.w, m.map.userData.h);
  const me = new THREE.Mesh(geo, m); p.add(me); return me;
}
const BRICK = new THREE.MeshStandardMaterial({map: brickTex, roughness: 0.9});
const PAVING = new THREE.MeshStandardMaterial({map: pavingTex, roughness: 0.92});
const ARCADE = new THREE.MeshStandardMaterial({map: arcadeTex, roughness: 0.9});
const GLAZE = new THREE.MeshStandardMaterial({map: glazeTex, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false});
const IRON = mat(0x2f5f3c, 0.5, 0.3), IRON_DK = mat(0x24442c, 0.55, 0.3), COPING = mat(0xd8d2c2, 0.8), STONE = mat(0xa89a86, 0.85);
const SLATE = mat(0x3f444b, 0.8), WOOD = mat(0x6b4a30, 0.85), CREAM = mat(0xe9e2cc, 0.7), BLACK = mat(0x1d1d1f, 0.7);

// ------------------------------------------------------------------ track: the station's own roads
// The Main Line's two roads through the station and both throats (the plain Main Line ribbon is
// cut here), the yard ladder, and a pair of crossovers between the Main Line roads.
const trackMat = LINES.main.realMesh.material;
const TRACK_G = new THREE.Group(); scene.add(TRACK_G);
let lift = 0;
function road(fnX, s0, s1, step = 3){
  lift += 0.004;
  const half = 1.8 * M, vp = [], vu = [], vn = [], ix = [];
  let along = 0, prev = null;
  const n = Math.max(2, Math.ceil((s1 - s0) / step));
  for(let k = 0; k <= n; k++){
    const s = s0 + (s1 - s0) * k / n, x = fnX(s), a = KNAP.at(s, x), b = KNAP.at(s + 0.5, fnX(s + 0.5));
    let dx = b.x - a.x, dz = b.z - a.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const nx = dz, nz = -dx, y = a.y + (0.01 + lift) * M;
    if(prev) along += Math.hypot(a.x - prev.x, a.z - prev.z);
    const bI = vp.length / 3;
    vp.push(a.x + nx * half, y, a.z + nz * half, a.x - nx * half, y, a.z - nz * half);
    vu.push(0, along / (0.75 * M), 1, along / (0.75 * M)); vn.push(0, 1, 0, 0, 1, 0);
    if(prev) ix.push(bI - 2, bI - 1, bI, bI - 1, bI + 1, bI);
    prev = a;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(vu, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(vn, 3));
  geo.setIndex(ix);
  const m = new THREE.Mesh(geo, trackMat); m.receiveShadow = true; TRACK_G.add(m);
}
const C = KNAP.CUT;
road(s => KNAP.mainX('down', s), -C - 2, C + 2);
road(s => KNAP.mainX('up', s), -C - 2, C + 2);
// crossovers between the two Main Line roads, one in each throat
const xover = (sA, sB, from, to) => road(s => { const a = KNAP.mainX(from, s), b = KNAP.mainX(to, s); return a + (b - a) * smooth(sA, sB, s); }, sA, sB);
xover(-245, -205, 'up', 'down'); xover(205, 245, 'down', 'up');
// the yard ladder: each yard road leaves the down Main Line by its own turnout
const YARD_X = [0, 1, 2, 3, 4, 5].map(i => -29 - 5 * i), YARD_S0 = -265;
const ladder = YARD_X.map((xi, i) => { const s0 = -305 - 18 * i; road(s => -MAIN_LANE + (xi + MAIN_LANE) * smooth(s0, YARD_S0, s), s0, YARD_S0 + 1); return s0; });

// ------------------------------------------------------------------ buffer stops at the head of the bays
for(const x of [RD.T4, RD.T5]){
  const g = seg(KNAP.BUF, x);
  S.buffers(g, -0.2, 1, 1.06, true);
  box(g, 2.6, 0.5, 0.4, mat(0x8a2a1e, 0.7), 0, 0.9, -0.6);                                   // the buffer beam
  for(const s of [-1, 1]) box(g, 0.3, 1.3, 0.3, WOOD, s * 1.0, 0.45, -1.0);
  box(g, 0.22, 0.22, 0.12, mat(0xff2a1a, 0.5), 0, 1.35, -0.55);                              // red lamp
}

// ------------------------------------------------------------------ platforms
// Henry runs round his train on road 1, platform 1's face: the platform follows his loop.
const henryR = NWR.byId.henry && NWR.byId.henry.runner, thomasR = NWR.byId.thomas && NWR.byId.thomas.runner;
const sOfMain = (R, x) => ((R.o.uA + R.sgn * x / R.L) - KNAP.u0) * R.L / M;
// Platform 1 runs the length of the roof; road 1 is Henry's run-round loop in the middle and a
// dead-end siding at each end, so the whole face has track beside it.
const p1lo = -62, p1hi = 62;
if(henryR && henryR.loops){
  const lp = henryR.loops[1], a = sOfMain(henryR, lp.lo), b = sOfMain(henryR, lp.hi), k = lp.k / M;
  const lo = Math.min(a, b) + k, hi = Math.max(a, b) - k;
  // buffer stops face the incoming track: the north stub's open end is to the south, the south stub's to the north
  if(lo > p1lo + 4){ road(() => RD.T1, p1lo - 2, lo + 1); const g = seg(p1lo - 2, RD.T1); S.buffers(g, -0.2, 1, 1.06, true); box(g, 2.6, 0.5, 0.4, mat(0x8a2a1e, 0.7), 0, 0.9, -0.6); }
  if(hi < p1hi - 4){ road(() => RD.T1, hi - 1, p1hi + 2); const g = seg(p1hi + 2, RD.T1); g.rotation.y += Math.PI; S.buffers(g, -0.2, 1, 1.06, true); box(g, 2.6, 0.5, 0.4, mat(0x8a2a1e, 0.7), 0, 0.9, -0.6); }
}

// ------------------------------------------------------------------ gravel and weeds under the whole station and yard
{
  const gravel = tiled(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8478'; g.fillRect(0, 0, w, h);
    let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for(let k = 0; k < 7000; k++){ const v = 95 + r() * 80 | 0; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    for(let k = 0; k < 9; k++){                               // patches of weed and moss
      const cx = r() * w, cy = r() * h, rad = 10 + r() * 26;
      for(let q = 0; q < 220; q++){ const a = r() * 6.28, d = Math.sqrt(r()) * rad; g.fillStyle = `rgba(${90 + r() * 50 | 0},${110 + r() * 40 | 0},${40 + r() * 20 | 0},0.7)`; g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 2.5, 2.5); }
    }
  }), 9, 9);
  const XS = [], SS = [];
  for(let x = -64; x <= 29; x += 3.1) XS.push(x);
  for(let s = -430; s <= 250; s += 5) SS.push(s);
  const pos = [], uv = [], idx = [], nx = XS.length;
  SS.forEach((s, j) => XS.forEach((x, i) => {
    const p = KNAP.at(s, x), y = Math.max(railY(s) - 0.32 * M, heightAt(p.x, p.z) + 0.06 * M);
    pos.push(p.x, y, p.z); uv.push(x / 9, s / 9);
    if(i && j){ const a = j * nx + i, b = a - 1, c = a - nx, d = c - 1; idx.push(d, b, c, b, a, c); }
  }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const apron = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({map: gravel, roughness: 1}));
  apron.receiveShadow = true; TRACK_G.add(apron);
}
const PLAT_TOP = 0.75;
function platform(x0, x1, s0, s1, faces){
  const w = x1 - x0, xm = (x0 + x1) / 2, step = 6;
  for(let s = s0; s < s1 - 0.01; s += step){
    const ds = Math.min(step, s1 - s), g = seg(s + ds / 2, xm);
    tbox(g, w - 0.5, PLAT_TOP + 0.6, ds + 0.04, BRICK, 0, (PLAT_TOP - 0.6) / 2, 0);              // brick body
    tbox(g, w - 0.9, 0.06, ds + 0.04, PAVING, 0, PLAT_TOP + 0.03, 0);                          // flagstones
    for(const side of [-1, 1]){
      const face = side < 0 ? faces.w : faces.e;
      box(g, 0.45, 0.12, ds + 0.04, face ? COPING : STONE, side * (w / 2 - 0.22), PLAT_TOP + 0.02, 0);
      if(face) box(g, 0.08, 0.02, ds + 0.04, mat(0xf2f0ea, 0.6), side * (w / 2 - 0.62), PLAT_TOP + 0.07, 0);
    }
  }
  // sloping ramps down to the ballast at each end
  for(const [s, dir] of [[s0, -1], [s1, 1]]){
    const g = seg(s + dir * 2.5, xm), r = box(g, w - 0.5, 0.12, 5.4, STONE, 0, PLAT_TOP / 2 - 0.1, 0); r.rotation.x = dir * Math.atan2(PLAT_TOP + 0.3, 5);
  }
}
const P1 = {x0: -26.6, x1: RD.T1 - 1.6}, I23 = {x0: RD.T2 + 1.6, x1: RD.T3 - 1.6}, I45 = {x0: RD.T4 + 1.6, x1: RD.T5 - 1.6};
platform(P1.x0, P1.x1, p1lo, p1hi, {w: false, e: true});
platform(I23.x0, I23.x1, KNAP.LO, KNAP.HI, {w: true, e: true});
platform(I45.x0, I45.x1, KNAP.BUF + 2, KNAP.HI, {w: true, e: true});
// the concourse along the frontage, at platform height, behind a railing on road 6
const CONC = {x0: RD.T6 + 1.7, x1: 32.0};
platform(CONC.x0, CONC.x1, -58, 58, {w: false, e: false});
for(let s = -56; s <= 56; s += 4){ const g = seg(s, CONC.x0 + 0.4, PLAT_TOP); box(g, 0.06, 1.0, 4, IRON, 0, 0.5, 0); box(g, 0.08, 0.08, 4, IRON, 0, 1.0, 0); }

// ------------------------------------------------------------------ the overall roof
// Four glazed arched spans on columns in the six-foot ways, ribs every 11 m, glazed end screens.
const NAVES = [-26.9, -12.1, 2.7, 17.5, 32.3], SPRING = 6.2, ROOF_S = 55, RIB_STEP = 11;
const ribS = []; for(let s = -ROOF_S; s <= ROOF_S + 0.01; s += RIB_STEP) ribS.push(s);
const ellipse = (a, rise, n, out = []) => { for(let k = 0; k <= n; k++){ const th = Math.PI * k / n; out.push([-a * Math.cos(th), rise * Math.sin(th)]); } return out; };
function arcBars(g, a, rise, m, t, y0, zOff = 0){             // a lattice rib: two elliptical chords with zigzag struts
  const outer = ellipse(a, rise, 18), inner = ellipse(a - 0.55, rise - 0.5, 18);
  const bar = (p, q, th) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); const b = box(g, L + th, th, th, m, (p[0] + q[0]) / 2, y0 + (p[1] + q[1]) / 2, zOff); b.rotation.z = Math.atan2(dy, dx); };
  for(let k = 0; k < 18; k++){ bar(outer[k], outer[k + 1], t); bar(inner[k], inner[k + 1], t * 0.8); bar(k % 2 ? outer[k] : inner[k], k % 2 ? inner[k + 1] : outer[k + 1], t * 0.6); }
}
for(let q = 0; q < 4; q++){
  const xa = NAVES[q], xb = NAVES[q + 1], xc = (xa + xb) / 2, a = (xb - xa) / 2, rise = a * 0.82;
  ribS.forEach(s => { const g = seg(s, xc, SPRING); arcBars(g, a, rise, IRON, 0.22, 0); });
  // purlins and glazing between ribs, each bay in the frame of its own middle so it follows the curve
  for(let k = 0; k < ribS.length - 1; k++){
    const sm = (ribS[k] + ribS[k + 1]) / 2, L = RIB_STEP, g = seg(sm, xc, SPRING), gg = seg(sm, xc, SPRING, GLASS_G);
    for(const th of [0.18, 0.5, 0.82]){ const ang = Math.PI * th; box(g, 0.14, 0.14, L, IRON_DK, -a * Math.cos(ang), rise * Math.sin(ang), 0); }
    const geo = new THREE.CylinderGeometry(a, a, L + 0.05, 20, 1, true, -Math.PI / 2, Math.PI);
    geo.rotateX(-Math.PI / 2); geo.scale(1, rise / a, 1);                 // axis along the track, arched upwards
    const uv = geo.attributes.uv; for(let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * a / 1.6, uv.getY(i) * L / 1.6);
    gg.add(new THREE.Mesh(geo, GLAZE));
  }
  // glazed end screens with radial bars, and a valance of boarding along their foot
  for(const s of [-ROOF_S, ROOF_S]){
    const g = seg(s, xc, SPRING), gg = seg(s, xc, SPRING, GLASS_G);
    const geo = new THREE.CircleGeometry(a, 24, 0, Math.PI); geo.scale(1, rise / a, 1);
    gg.add(new THREE.Mesh(geo, GLAZE));
    for(let k = 1; k < 8; k++){ const th = Math.PI * k / 8, L = Math.hypot(a * Math.cos(th), rise * Math.sin(th)); const b = box(g, L, 0.1, 0.1, IRON, -a * Math.cos(th) / 2, rise * Math.sin(th) / 2, 0); b.rotation.z = Math.atan2(rise * Math.sin(th), -a * Math.cos(th)); }
    for(let k = -6; k <= 6; k++){ const v = box(g, 0.08, 0.6 + Math.random() * 0.01, 0.04, mat(0x2f5f3c, 0.6), k * a / 7, -0.3, 0); }
    box(g, 2 * a, 0.12, 0.12, IRON, 0, 0, 0);
  }
}
// columns: green iron with a moulded base, a capital and brackets, in each six-foot way
NAVES.slice(1, 4).forEach(x => ribS.forEach(s => {
  const g = seg(s, x);
  box(g, 0.7, 0.5, 0.7, IRON_DK, 0, 0.25, 0);
  cylY(g, 0.18, 0.22, SPRING, IRON, 0, SPRING / 2, 0, 12);
  box(g, 0.75, 0.35, 0.75, IRON_DK, 0, SPRING - 0.1, 0);
  for(const e of [-1, 1]){ const b = box(g, 1.6, 0.12, 0.12, IRON, e * 0.7, SPRING - 0.75, 0); b.rotation.z = -e * 0.6; }
}));
// the west wall: brick, with tall arched windows, carrying the outer span
for(let s = -ROOF_S; s < ROOF_S; s += 11){
  const g = seg(s + 5.5, NAVES[0] - 0.4);
  tbox(g, 0.8, SPRING + 0.9, 11.02, BRICK, 0, (SPRING + 0.9) / 2 - 0.5, 0);
  box(g, 1.0, 0.4, 11.02, STONE, 0, SPRING + 0.2, 0);
  for(const z of [-2.8, 2.8]){ const w = add(g, new THREE.PlaneGeometry(1.4, 2.6), glassMat(), 0.42, 3.4, z); w.rotation.y = Math.PI / 2; box(g, 0.1, 0.25, 1.7, STONE, 0.45, 4.8, z); }
}

// ------------------------------------------------------------------ the frontage, concourse and forecourt
// A long brick front on the town side: arched windows, a three-arched entrance under a pediment,
// and the name across it; inside, the booking hall, refreshment room and kiosk on the concourse.
const FX = 32.3;
for(let s = -ROOF_S; s < ROOF_S; s += 11){
  const g = seg(s + 5.5, FX + 0.4);
  tbox(g, 0.8, 7.4, 11.02, BRICK, 0, 3.2, 0);
  box(g, 1.1, 0.5, 11.02, STONE, 0, 7.1, 0);
  box(g, 1.0, 0.3, 11.02, STONE, 0, 1.2, 0);
  if(Math.abs(s + 5.5) > 8) for(const z of [-2.8, 2.8]){ const w = add(g, new THREE.PlaneGeometry(1.5, 2.8), glassMat(), 0.42, 3.6, z); w.rotation.y = Math.PI / 2; box(g, 0.12, 0.3, 1.9, STONE, 0.47, 5.15, z); }
}
{
  const g = seg(0, FX + 0.9);
  tbox(g, 1.6, 9.6, 16, BRICK, 0, 4.3, 0);
  const tri = new THREE.Shape(); tri.moveTo(-8.6, 0); tri.lineTo(8.6, 0); tri.lineTo(0, 2.9); tri.closePath();
  const ped = new THREE.ExtrudeGeometry(tri, {depth: 1.8, bevelEnabled: false}); ped.rotateY(Math.PI / 2); ped.translate(-0.9, 9.1, 0);
  add(g, ped, STONE, 0, 0, 0);
  for(const z of [-4.2, 0, 4.2]){
    const d = add(g, new THREE.PlaneGeometry(3.0, 4.2), mat(0x24302a, 0.8), 0.82, 2.6, z); d.rotation.y = Math.PI / 2;
    const arch = add(g, new THREE.CircleGeometry(1.5, 16, 0, Math.PI), mat(0x24302a, 0.8), 0.82, 4.7, z); arch.rotation.y = Math.PI / 2;
  }
  const name = canvasTex(1024, 96, (c, w, h) => {
    c.fillStyle = '#7a3b2c'; c.fillRect(0, 0, w, h); c.fillStyle = '#efe6cc'; c.font = 'bold 64px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('KNAPFORD RAILWAY STATION', w / 2, h / 2 + 3);
  });
  const nb = add(g, new THREE.PlaneGeometry(15, 1.4), new THREE.MeshStandardMaterial({map: name, roughness: 0.7}), 0.83, 7.6, 0); nb.rotation.y = Math.PI / 2;
}
// booking hall and refreshment room on the concourse, under the east span
{
  const g = seg(-26, 29, PLAT_TOP);
  tbox(g, 5.4, 4.2, 22, BRICK, 0, 2.1, 0); box(g, 5.8, 0.3, 22.4, STONE, 0, 4.3, 0);
  for(let k = 0; k < 4; k++){ const w = add(g, new THREE.PlaneGeometry(1.6, 2.0), glassMat(), -2.72, 2.0, -8 + k * 5.4); w.rotation.y = -Math.PI / 2; }
  const kiosk = seg(18, 29.5, PLAT_TOP);
  box(kiosk, 3.6, 3.0, 8, mat(0x2f5f3c, 0.6), 0, 1.5, 0); box(kiosk, 4.2, 0.3, 8.6, mat(0x24442c, 0.6), 0, 3.15, 0);
  const sign = canvasTex(512, 96, (c, w, h) => { c.fillStyle = '#24442c'; c.fillRect(0, 0, w, h); c.fillStyle = '#f0e6c8'; c.font = 'bold 58px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BUNN  Refreshments', w / 2, h / 2 + 3); });
  const sb = add(kiosk, new THREE.PlaneGeometry(6.5, 1.2), new THREE.MeshStandardMaterial({map: sign, roughness: 0.7}), -1.85, 3.0, 0); sb.rotation.y = -Math.PI / 2;
  for(let k = 0; k < 3; k++){ const w = add(kiosk, new THREE.PlaneGeometry(1.8, 1.4), glassMat(), -1.82, 1.7, -2.6 + k * 2.6); w.rotation.y = -Math.PI / 2; }
}
// the forecourt: paving, railings, lamps and a gilded lion on a plinth in a ring of flower beds
const FC = {x0: FX + 0.8, x1: 60, s0: -30, s1: 30};
const fcY = Math.max(PLAT_TOP, ...[-30, 0, 30].map(s => (heightAt(KNAP.at(s, 46).x, KNAP.at(s, 46).z) - railY(s)) / M + 0.1));
for(let s = FC.s0; s < FC.s1; s += 10){ const g = seg(s + 5, (FC.x0 + FC.x1) / 2); tbox(g, FC.x1 - FC.x0, fcY + 1.2, 10.04, PAVING, 0, (fcY - 1.2) / 2, 0); }
{
  const g = seg(0, 46, fcY);
  cylY(g, 5.2, 5.2, 0.25, mat(0x4a7a3a, 0.9), 0, 0.12, 0, 28);
  cylY(g, 1.4, 1.6, 2.4, STONE, 0, 1.2, 0, 16);
  const gold = mat(0xc9a23a, 0.35, 0.6);
  box(g, 0.9, 0.9, 2.0, gold, 0, 2.9, 0); add(g, new THREE.SphereGeometry(0.55, 12, 10), gold, 0, 3.6, 0.85); box(g, 0.9, 1.2, 0.5, gold, 0, 3.2, -0.9);
  for(const [x, z] of [[-0.3, 0.7], [0.3, 0.7], [-0.3, -0.7], [0.3, -0.7]]) box(g, 0.22, 0.6, 0.22, gold, x, 2.4, z);
}
for(let s = FC.s0; s <= FC.s1; s += 3){ for(const x of [FC.x1]){ const g = seg(s, x, fcY); box(g, 0.06, 1.1, 3, BLACK, 0, 0.55, 0); box(g, 0.08, 0.08, 3, BLACK, 0, 1.1, 0); } }

// ------------------------------------------------------------------ platform furniture
const LAMPS = [];
function lampPost(s, x, y = PLAT_TOP){
  const g = seg(s, x, y);
  cylY(g, 0.08, 0.12, 3.8, IRON, 0, 1.9, 0, 8); box(g, 0.22, 0.3, 0.22, IRON_DK, 0, 0.15, 0);
  for(const e of [-1, 1]){ const arm = box(g, 0.9, 0.06, 0.06, IRON, e * 0.42, 3.6, 0); cylY(g, 0.22, 0.12, 0.3, IRON_DK, e * 0.85, 3.55, 0, 10); }
  const p = KNAP.at(s, x); LAMPS.push([p.x, railY(s) + (y + 3.4) * M, p.z]);
}
function bench(s, x, face){ const g = seg(s, x, PLAT_TOP); box(g, 0.45, 0.06, 1.8, WOOD, 0, 0.45, 0); const back = box(g, 0.06, 0.45, 1.8, WOOD, -face * 0.2, 0.72, 0); for(const z of [-0.8, 0.8]) box(g, 0.45, 0.45, 0.06, IRON_DK, 0, 0.22, z); }
const signTex = (text, w = 256, h = 160, font = 'bold 110px Arial') => canvasTex(w, h, (c, W, H) => {
  c.fillStyle = '#e9e2cc'; c.fillRect(0, 0, W, H); c.fillStyle = '#1f5c34'; c.fillRect(8, 8, W - 16, H - 16);
  c.fillStyle = '#f2ecd8'; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, W / 2, H / 2 + 6);
});
const signMats = {};
const signMat = (text, w, h, font) => signMats[text] || (signMats[text] = new THREE.MeshStandardMaterial({map: signTex(text, w, h, font), roughness: 0.6}));
// big green platform numbers hanging from the roof, seen down the platform
function numberBoard(s, x, text){
  const g = seg(s, x, SPRING - 1.4), w = text.length > 1 ? 2.6 : 1.3, m = signMat(text, text.length > 1 ? 384 : 192, 192, 'bold 150px Arial');
  for(const ry of [0, Math.PI]){ const pl = add(g, new THREE.PlaneGeometry(w, 1.3), m, 0, 0, ry ? -0.03 : 0.03); pl.rotation.y = ry; }
  for(const e of [-1, 1]) box(g, 0.04, 1.4, 0.04, IRON_DK, e * (w / 2 - 0.2), 1.35, 0);
}
// KNAPFORD running-in boards: green ovals with cream letters, beside the track
const nameMat = new THREE.MeshStandardMaterial({map: canvasTex(512, 160, (c, W, H) => {
  c.fillStyle = '#e9e2cc'; c.beginPath(); c.ellipse(W / 2, H / 2, W / 2 - 4, H / 2 - 4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1f5c34'; c.beginPath(); c.ellipse(W / 2, H / 2, W / 2 - 14, H / 2 - 14, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f2ecd8'; c.font = 'bold 82px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('KNAPFORD', W / 2, H / 2 + 5);
}), roughness: 0.6, transparent: true, alphaTest: 0.5});
function nameBoard(s, x, face){
  const g = seg(s, x, PLAT_TOP);
  for(const z of [-1.3, 1.3]) cylY(g, 0.06, 0.06, 2.6, IRON, 0, 1.3, z, 8);
  const pl = add(g, new THREE.PlaneGeometry(3.4, 1.06), nameMat, face * 0.05, 2.2, 0); pl.rotation.y = face * Math.PI / 2;
  const back = add(g, new THREE.PlaneGeometry(3.4, 1.06), nameMat, -face * 0.05, 2.2, 0); back.rotation.y = -face * Math.PI / 2;
}
const isles = [{x0: P1.x0, x1: P1.x1, s0: p1lo, s1: p1hi, label: '1', face: [1]}, {x0: I23.x0, x1: I23.x1, s0: KNAP.LO, s1: KNAP.HI, label: '2 3', face: [-1, 1]},
  {x0: I45.x0, x1: I45.x1, s0: KNAP.BUF + 2, s1: KNAP.HI, label: '4 5', face: [-1, 1]}];
isles.forEach((P, i) => {
  const xm = (P.x0 + P.x1) / 2;
  for(let s = P.s0 + 6; s < P.s1 - 4; s += 14) lampPost(s, i === 0 ? P.x1 - 2.2 : xm);
  for(let s = P.s0 + 13; s < P.s1 - 8; s += 18){ if(i === 0) bench(s, P.x0 + 1.4, 1); else { bench(s, xm - 1.1, -1); bench(s, xm + 1.1, 1); } }
  for(const s of [-30, 30]) if(s > P.s0 && s < P.s1) numberBoard(s, i === 0 ? -19.4 : xm, P.label);
  for(const s of [P.s0 + 12, P.s1 - 12]) nameBoard(s, i === 0 ? P.x1 - 0.9 : xm, i === 0 ? 1 : 1);
});
// a hanging clock over platforms 2 and 3, a telephone box and a news stand on platform 1
{
  const g = seg(0, (I23.x0 + I23.x1) / 2, SPRING - 2.2);
  box(g, 0.5, 1.2, 0.5, IRON_DK, 0, 0.6, 0);
  for(const e of [-1, 1]){ const f = add(g, new THREE.CircleGeometry(0.55, 24), CREAM, 0, 0, e * 0.26); if(e < 0) f.rotation.y = Math.PI; const r = add(g, new THREE.RingGeometry(0.55, 0.66, 24), IRON_DK, 0, 0, e * 0.27); if(e < 0) r.rotation.y = Math.PI; }
  const tb = seg(p1lo + 18, P1.x0 + 1.4, PLAT_TOP);
  box(tb, 1.0, 2.5, 1.0, mat(0xc8201e, 0.5), 0, 1.25, 0); box(tb, 1.1, 0.25, 1.1, mat(0xc8201e, 0.5), 0, 2.6, 0);
  for(const e of [-1, 1]) box(tb, 0.02, 1.5, 0.7, glassMat(), e * 0.51, 1.4, 0);
  const ns = seg(p1lo + 34, P1.x0 + 2.0, PLAT_TOP);
  box(ns, 2.0, 2.4, 3.4, mat(0x2f5f3c, 0.6), 0, 1.2, 0); box(ns, 2.6, 0.2, 3.8, mat(0x24442c, 0.6), 0.3, 2.5, 0);
  box(ns, 0.4, 0.6, 3.0, mat(0xd8c89a, 0.7), 1.1, 1.0, 0);
}
// water columns at the platform ends, for engines taking water
function waterColumn(s, x){
  const g = seg(s, x, PLAT_TOP);
  cylY(g, 0.2, 0.28, 3.0, IRON_DK, 0, 1.5, 0, 10); box(g, 0.6, 0.3, 0.6, IRON_DK, 0, 0.15, 0);
  const arm = box(g, 0.18, 0.18, 2.6, IRON_DK, 0, 3.05, 1.2); cylY(g, 0.12, 0.12, 1.0, mat(0x3a2a1e, 0.9), 0, 2.5, 2.45, 8);
}
waterColumn(KNAP.HI - 3, (I23.x0 + I23.x1) / 2 - 1.6); waterColumn(KNAP.LO + 3, (I23.x0 + I23.x1) / 2 + 1.6); waterColumn(KNAP.HI - 3, (I45.x0 + I45.x1) / 2 + 1.6);

// ------------------------------------------------------------------ signals
// Lower-quadrant semaphores on lattice gantries at both throats, one arm per road each way;
// an arm drops to clear when a train is about to pass it on that road. Ground discs at the
// crossovers of the run-round loops turn when an engine runs round.
const SIG = [], SIG_G = new THREE.Group(); scene.add(SIG_G);
const LAT = S.lattice(0xd8d8d2);
const sOfBranch = (R, x) => KNAP.BUF + (R.o.uA + R.sgn * x / R.L) * R.L / M;
const engineX = R => R.phase === 'rr' && R.rr ? R.rr.last : R.unitX(R.a, R.side)[0];
const roadRunner = {
  T2: henryR && {R: henryR, sAt: x => sOfMain(henryR, x)},
  T3: NWR.byId.gordon && NWR.byId.gordon.runner && {R: NWR.byId.gordon.runner, sAt: x => sOfMain(NWR.byId.gordon.runner, x)},
  T4: NWR.byId.salty && NWR.byId.salty.runner && {R: NWR.byId.salty.runner, sAt: x => sOfBranch(NWR.byId.salty.runner, x)},
  T5: thomasR && {R: thomasR, sAt: x => sOfBranch(thomasR, x)},
};
function gantry(s, posts, h, dolls){
  const g = seg(s, 0);
  posts.forEach(x => { S.latticeBox(g, 0.6, h, 0.6, LAT, x, h / 2, 0); box(g, 0.9, 0.3, 0.9, mat(0x5a5a58, 0.8), x, 0.15, 0); });
  const x0 = Math.min(...posts), x1 = Math.max(...posts);
  S.latticeBox(g, x1 - x0 + 0.6, 0.8, 0.8, LAT, (x0 + x1) / 2, h, 0);
  box(g, x1 - x0 + 1.4, 0.06, 1.4, mat(0x4a4a48, 0.7), (x0 + x1) / 2, h + 0.43, 0);       // walkway
  for(let x = x0; x <= x1; x += 1.2) box(g, 0.04, 0.9, 0.04, mat(0xd8d8d2, 0.6), x, h + 0.9, 0.68);
  dolls.forEach(d => {
    const xd = d.x;
    cylY(g, 0.07, 0.07, 3.2, mat(0xeeeeea, 0.6), xd, h + 2.0, 0, 8);
    add(g, new THREE.ConeGeometry(0.12, 0.3, 8), mat(0x1d1d1f, 0.7), xd, h + 3.75, 0);
    for(const face of [-1, 1]){                       // face -1: facing trains coming from the south (s decreasing)
      const pivot = new THREE.Group(); const pw = KNAP.at(s, xd); const t = KNAP.tangent(s);
      pivot.position.set(pw.x, railY(s) + (h + 2.8) * M, pw.z); pivot.rotation.y = Math.atan2(t.x, t.z) + (face < 0 ? Math.PI : 0); pivot.scale.setScalar(M);
      const arm = new THREE.Group(); pivot.add(arm);
      box(arm, 1.3, 0.26, 0.05, mat(0xc8262b, 0.5), -0.72, 0, -0.06); box(arm, 0.22, 0.27, 0.055, mat(0xf2f0ea, 0.5), -1.05, 0, -0.061);
      box(arm, 0.32, 0.32, 0.04, mat(0x1d1d1f, 0.6), -0.08, -0.12, -0.04);
      SIG_G.add(pivot);
      SIG.push({arm, road: d.road, s, face, cur: 0, lamp: [pw.x, railY(s) + (h + 2.68) * M, pw.z]});
    }
  });
}
gantry(KNAP.HI + 14, [-17, -12.1, 2.7, 10.1, 21], 7.2,
  [{x: KNAP.mainX('down', KNAP.HI + 14), road: 'T2'}, {x: KNAP.mainX('up', KNAP.HI + 14), road: 'T3'}, {x: RD.T4, road: 'T4'}, {x: RD.T5, road: 'T5'}]);
gantry(KNAP.LO - 14, [-16, -4.7, 6], 7.2,
  [{x: KNAP.mainX('down', KNAP.LO - 14), road: 'T2'}, {x: KNAP.mainX('up', KNAP.LO - 14), road: 'T3'}]);
// ground discs at the run-round crossovers
const DISCS = [];
function disc(s, x, runner){
  const g = new THREE.Group(), p = KNAP.at(s, x); g.position.set(p.x, railY(s), p.z); g.rotation.y = Math.atan2(KNAP.tangent(s).x, KNAP.tangent(s).z); g.scale.setScalar(M);
  box(g, 0.5, 0.5, 0.3, mat(0x2a2a2a, 0.8), 0, 0.25, 0);
  const face = new THREE.Group(); face.position.set(0, 0.62, 0.16); g.add(face);
  add(face, new THREE.CircleGeometry(0.28, 16), mat(0xf2f0ea, 0.6), 0, 0, 0); box(face, 0.46, 0.1, 0.02, mat(0xc8262b, 0.5), 0, 0, 0.01);
  SIG_G.add(g); DISCS.push({face, runner, cur: 0, lamp: [p.x, railY(s) + 0.62 * M, p.z]});
}
if(henryR && henryR.loops){ const lp = henryR.loops[1]; disc(sOfMain(henryR, lp.lo) - 4, RD.T2 - 2.4, henryR); disc(sOfMain(henryR, lp.hi) + 4, RD.T2 - 2.4, henryR); }
if(thomasR && thomasR.loops){ const lp = thomasR.loops[1]; disc(sOfBranch(thomasR, lp.lo) - 4, RD.T5 + 2.4, thomasR); disc(sOfBranch(thomasR, lp.hi) + 4, RD.T5 + 2.4, thomasR); }
ladder.forEach((s0, i) => disc(s0 - 3, -MAIN_LANE - 2.6 - i * 0.01, null));

// ------------------------------------------------------------------ signal boxes
function signalBox(s, x, faceE){
  const g = seg(s, x, Math.max(0, (heightAt(KNAP.at(s, x).x, KNAP.at(s, x).z) - railY(s)) / M));
  tbox(g, 4.0, 2.6, 9, BRICK, 0, 1.3, 0);
  box(g, 4.3, 2.2, 9.3, mat(0xe4e0d2, 0.7), 0, 3.7, 0);
  for(let k = 0; k < 5; k++){ const w = add(g, new THREE.PlaneGeometry(1.5, 1.4), glassMat(), faceE * 2.17, 3.8, -3.6 + k * 1.8); w.rotation.y = faceE * Math.PI / 2; }
  box(g, 4.5, 0.1, 9.5, mat(0x2f5f3c, 0.6), 0, 4.85, 0);
  add(g, new THREE.CylinderGeometry(3.4, 3.4, 9.8, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2), SLATE, 0, 5.7, 0).scale.set(0.85, 0.4, 1);
  for(let k = 0; k < 6; k++) box(g, 0.9, 0.12, 0.3, WOOD, -faceE * 2.4, 0.3 + k * 0.45, 3.0 - k * 0.5);        // the steps
  const nm = new THREE.MeshStandardMaterial({map: canvasTex(512, 80, (c, w, h) => { c.fillStyle = '#e9e2cc'; c.fillRect(0, 0, w, h); c.fillStyle = '#1d1d1f'; c.font = 'bold 50px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('KNAPFORD', w / 2, h / 2 + 2); }), roughness: 0.7});
  const nb = add(g, new THREE.PlaneGeometry(4.6, 0.7), nm, faceE * 2.2, 2.85, 0); nb.rotation.y = faceE * Math.PI / 2;
}
signalBox(KNAP.HI + 42, -25, 1);
signalBox(KNAP.LO - 70, 14, -1);

// ------------------------------------------------------------------ the yard: water tower, coal stage, goods shed
{
  const g = seg(-108, -22.5);
  tbox(g, 5, 6, 5, BRICK, 0, 3, 0);
  box(g, 6.2, 3.0, 6.2, mat(0x2a2c30, 0.55, 0.4), 0, 7.5, 0);
  box(g, 6.4, 0.3, 6.4, mat(0x1d1f22, 0.6), 0, 9.1, 0);
  for(let k = 0; k < 6; k++) box(g, 0.08, 0.08, 0.6, IRON_DK, 3.2, 1 + k * 1.1, 0);                   // a ladder up the side
  cylZ(g, 0.15, 0.15, 3.0, IRON_DK, 0, 6.2, 3.6, 8);
}
{
  const s = -125, x = YARD_X[4], g = seg(s, x);                                                        // coal stage straddling road 5
  for(const [ex, ez] of [[-2.6, -3], [2.6, -3], [-2.6, 3], [2.6, 3]]){ const leg = box(g, 0.45, 6.6, 0.45, WOOD, ex, 3.3, ez); }
  for(const e of [-1, 1]){ const br = box(g, 0.25, 7.6, 0.25, WOOD, e * 2.6, 3.3, 0); br.rotation.x = 0.8; }
  const hop = add(g, new THREE.CylinderGeometry(3.6, 1.0, 3.4, 4).rotateY(Math.PI / 4), mat(0x5a4632, 0.9), 0, 6.9, 0); hop.scale.set(1, 1, 1.4);
  box(g, 6.4, 0.5, 8.6, mat(0x4a3a2a, 0.9), 0, 8.8, 0);
  box(g, 6.0, 0.4, 8.2, mat(0x141414, 0.95), 0, 9.2, 0);                                               // the coal heaped in it
}
{
  const g = seg(-185, YARD_X[5]);                                                                       // goods shed, road 6 running through
  for(const e of [-1, 1]) tbox(g, 0.6, 5.5, 46, BRICK, e * 3.0, 2.75, 0);
  for(const e of [-1, 1]) for(let z = -20; z <= 20; z += 8){ const w = add(g, new THREE.PlaneGeometry(2.2, 2.4), mat(0x2a2014, 0.8), e * 3.32, 2.0, z); w.rotation.y = e * Math.PI / 2; }
  add(g, new THREE.CylinderGeometry(4.0, 4.0, 47, 3).rotateX(-Math.PI / 2), SLATE, 0, 6.6, 0).scale.y = 0.5;
  for(const z of [-23.2, 23.2]) box(g, 6.6, 1.3, 0.5, BRICK, 0, 5.0, z);                                // the gable ends over the doorways
}
// odds and ends of a busy yard: cable drums, oil drums, sleepers, a coal wagon on blocks
for(const [s, x] of [[-150, -24], [-90, -26], [-210, -24.5]]){ const g = seg(s, x); for(let k = 0; k < 3; k++) cylX(g, 0.55, 0.55, 0.5, WOOD, (k - 1) * 0.6, 0.55, 0, 14); }
for(const [s, x] of [[-70, -24.5], [-232, -24]]){ const g = seg(s, x); for(let k = 0; k < 6; k++) cylY(g, 0.3, 0.3, 0.9, mat([0x2a4a7a, 0x8a2a1e, 0x3a3a3a][k % 3], 0.6), (k % 3) * 0.7 - 0.7, 0.45, Math.floor(k / 3) * 0.7, 10); }
{ const g = seg(-160, -61); for(let k = 0; k < 5; k++) box(g, 2.6, 0.25, 0.25, WOOD, 0, 0.15 + k * 0.26, -1 + (k % 2) * 0.3); }
for(let s = -255; s < -70; s += 30) lampPost(s, -26.5, 0);

// ------------------------------------------------------------------ retaining walls and the terraces above
// Arcaded brick walls hold the town back on both sides; rows of terraced houses look down on the line.
function arcadeWall(x, s0, s1, h, faceDir){
  for(let s = s0; s < s1 - 0.01; s += 8){
    const ds = Math.min(8, s1 - s), g = seg(s + ds / 2, x);
    const me = tbox(g, 1.0, h, ds + 0.02, ARCADE, 0, h / 2 - 0.4, 0);
    box(g, 1.3, 0.4, ds + 0.02, STONE, 0, h - 0.2, 0);
  }
}
arcadeWall(28, -330, -ROOF_S, 6.0, -1);
arcadeWall(-62, -330, 70, 5.2, 1);
arcadeWall(FX + 0.4, ROOF_S, 105, 6.0, -1);
// Rows of terraced houses above the walls, in short blocks with alleys between: each house its own
// brick or render, a sash window pair on each floor, a door, and chimney stacks on the party walls.
function terrace(x, s0, s1, faceDir, seed){
  let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const walls = [0x8a4a32, 0x9a5a3e, 0x7a3e2a, 0xa36a4a, 0x8e5236, 0xd8cfb8, 0xc9b896], roofs = [0x3a3e44, 0x434850, 0x4e4842];
  const SASH = mat(0xf2efe6, 0.6), DOOR = [0x2f3d52, 0x5a2a24, 0x2f5a3a, 0x3a3a3a];
  let s = s0;
  while(s < s1 - 12){
    const n = 4 + Math.floor(rnd() * 3), hw = 5.4, D = 8.5, H = 6.4 + rnd() * 1.4, wall = walls[Math.floor(rnd() * walls.length)], roofC = mat(roofs[Math.floor(rnd() * roofs.length)], 0.8);
    const len = n * hw; if(s + len > s1) break;
    const p = KNAP.at(s + len / 2, x), gy = Math.max(heightAt(p.x, p.z), railY(s) - 3 * M) - railY(s + len / 2);
    const g = seg(s + len / 2, x, gy / M);
    box(g, D, H, len, mat(wall, 0.85), 0, H / 2, 0);
    box(g, D + 0.2, 0.25, len + 0.1, mat(0x8a8478, 0.8), 0, H + 0.05, 0);
    add(g, new THREE.CylinderGeometry(D * 0.6, D * 0.6, len + 0.4, 3).rotateX(-Math.PI / 2), roofC, 0, H + 1.25, 0).scale.y = 0.48;
    for(let k = 0; k <= n; k++){                                   // chimney stacks on the party walls, with pots
      const z = -len / 2 + k * hw;
      box(g, 1.0, 1.7, 0.7, mat(0x7a3e2a, 0.85), 0, H + 2.8, z);
      for(const e of [-0.25, 0.25]) cylY(g, 0.12, 0.14, 0.45, mat(0xa0563a, 0.8), e, H + 3.85, z, 8);
    }
    for(let k = 0; k < n; k++){
      const zc = -len / 2 + (k + 0.5) * hw;
      for(const side of [faceDir, -faceDir]){
        for(const yy of [1.7, 4.6]){ const w = add(g, new THREE.PlaneGeometry(1.0, 1.4), glassMat(), side * (D / 2 + 0.02), yy, zc + 1.0); w.rotation.y = side * Math.PI / 2; const f = add(g, new THREE.PlaneGeometry(1.2, 0.12), SASH, side * (D / 2 + 0.025), yy - 0.76, zc + 1.0); f.rotation.y = side * Math.PI / 2; }
        const w2 = add(g, new THREE.PlaneGeometry(1.0, 1.4), glassMat(), side * (D / 2 + 0.02), 4.6, zc - 1.2); w2.rotation.y = side * Math.PI / 2;
      }
      const door = add(g, new THREE.PlaneGeometry(0.95, 2.1), mat(DOOR[k % DOOR.length], 0.7), -faceDir * (D / 2 + 0.02), 1.05, zc - 1.2); door.rotation.y = -faceDir * Math.PI / 2;
      box(g, 0.25, 1.6, hw - 0.3, mat(wall, 0.85), faceDir * (D / 2 + 2.6), 0.8, zc);        // back-yard walls toward the railway
      box(g, 2.6, 1.6, 0.25, mat(wall, 0.85), faceDir * (D / 2 + 1.3), 0.8, zc + hw / 2 - 0.12);
    }
    s += len + 3 + rnd() * 3;                                        // an alley between blocks
  }
}
terrace(36, -325, -70, -1, 11);
terrace(-71, -325, 60, 1, 23);

// ------------------------------------------------------------------ the church with its clock tower and spire
{
  const s = 74, x = 64, p = KNAP.at(s, x), gy = (heightAt(p.x, p.z) - railY(s)) / M, g = seg(s, x, gy - 0.3);
  const ST = mat(0x9a6a4e, 0.88);
  box(g, 10, 8, 24, ST, 0, 4, 0);
  add(g, new THREE.CylinderGeometry(6.4, 6.4, 24.6, 3).rotateX(-Math.PI / 2), SLATE, 0, 9.6, 0).scale.y = 0.62;
  for(let k = 0; k < 4; k++) for(const e of [-1, 1]){ const w = add(g, new THREE.PlaneGeometry(1.0, 3.2), glassMat(), e * 5.02, 4.2, -8 + k * 5.3); w.rotation.y = e * Math.PI / 2; }
  const tz = -14.5, tw = 6.4, th = 21;
  box(g, tw, th, tw, ST, 0, th / 2, tz);
  for(let k = 0; k < 4; k++) box(g, 1.0, 1.0, 0.6, ST, (k % 2 ? 1 : -1) * (tw / 2 - 0.5), th + 0.5, tz + (k < 2 ? 1 : -1) * (tw / 2 - 0.3));
  for(let k = 0; k < 4; k++) box(g, 0.6, 1.0, 1.0, ST, (k % 2 ? 1 : -1) * (tw / 2 - 0.3), th + 0.5, tz + (k < 2 ? 1 : -1) * (tw / 2 - 1.0));
  add(g, new THREE.ConeGeometry(tw * 0.55, 15, 8), SLATE, 0, th + 7.5, tz);
  for(const [ax, az, ry] of [[0, tw / 2 + 0.03, 0], [0, -tw / 2 - 0.03, Math.PI], [tw / 2 + 0.03, 0, Math.PI / 2], [-tw / 2 - 0.03, 0, -Math.PI / 2]]){
    const f = add(g, new THREE.CircleGeometry(1.3, 24), CREAM, ax, th - 4, tz + az); f.rotation.y = ry;
    const ring = add(g, new THREE.RingGeometry(1.3, 1.5, 24), mat(0xc9a23a, 0.4, 0.5), ax * 1.01, th - 4, tz + az * 1.01); ring.rotation.y = ry;
    for(const [hl, hr] of [[0.9, 0.4], [0.6, 2.1]]){ const hand = box(g, 0.08, hl, 0.04, BLACK, ax * 1.02, th - 4 + hl / 2 * Math.cos(hr), tz + az * 1.02); hand.rotation.set(0, ry, hr); }
  }
  for(let k = 0; k < 2; k++){ const w = add(g, new THREE.PlaneGeometry(1.1, 2.8), glassMat(), 0, 8 + k * 6, tz - tw / 2 - 0.03); w.rotation.y = Math.PI; }
}

// ------------------------------------------------------------------ bake, keep clear of the town, and per-frame life
S.bakeVC(G); S.bakeVC(GLASS_G, false);
G.children.forEach(m => { m.receiveShadow = true; });
const STATION = new THREE.Group(); STATION.add(G, GLASS_G); scene.add(STATION);
// the whole footprint: engine sheds (ops.js) and the town (world.js) keep off it
const FOOT = [];
for(let s = -430; s <= 250; s += 40) for(let x = -80; x <= 75; x += 40){
  const p = KNAP.at(s, x); FOOT.push({x: p.x, z: p.z, r: 32 * M});
}
FOOT.forEach(f => { S.taken.push(f); K.clearArea(f.x, f.z, f.r); });
KNAP.inside = (x, z) => FOOT.some(f => (f.x - x) ** 2 + (f.z - z) ** 2 < f.r * f.r);
if(K.trees && K.trees.invalidate) K.trees.invalidate();

// lamps and signal lights after dark
const lampGlow = typeof makeGlow === 'function' ? makeGlow(LAMPS.length + 4, {minPx: 1.4, maxPx: 22}) : null;
if(lampGlow){ const c = new THREE.Color(0xffd28a); LAMPS.forEach(([x, y, z]) => lampGlow.add(x, y, z, c, 7 * M)); lampGlow.flush(); }
const sigGlow = typeof makeGlow === 'function' ? makeGlow(SIG.length + DISCS.length + 4, {minPx: 1.4, maxPx: 16}) : null;
const RED = new THREE.Color(0xff3a22), GREEN = new THREE.Color(0x4aff8a), WHITE_D = new THREE.Color(0xfff2d8);

// is a road's train about to pass this signal, in the direction it controls?
function cleared(sg){
  const rr = roadRunner[sg.road]; if(!rr) return false;
  const R = rr.R; if(R.phase !== 'run' || R.hold) return false;
  const sE = rr.sAt(engineX(R)), dirS = R.dir * R.sgn;
  if(sg.face > 0) return dirS > 0 && sE < sg.s && sE > sg.s - 420;        // southbound, still short of the signal
  return dirS < 0 && sE > sg.s && sE < sg.s + 420;                          // northbound
}
frameHooks.push(dt => {
  const near = camDist < 7;
  STATION.visible = near; TRACK_G.visible = camDist < 9; SIG_G.visible = near;
  if(lampGlow) lampGlow.pts.visible = near && NIGHT_U.value > 0.02;
  const d = Math.min(1, dt * 2.5);
  SIG.forEach(sg => { const want = cleared(sg) ? 0.7 : 0; sg.cur += (want - sg.cur) * d; sg.arm.rotation.z = sg.cur; });     // lower quadrant: the arm drops to clear
  DISCS.forEach(ds => { const want = ds.runner && ds.runner.phase === 'rr' ? Math.PI / 4 : 0; ds.cur += (want - ds.cur) * d; ds.face.rotation.z = ds.cur; });
  if(sigGlow){
    sigGlow.clear();
    if(near && NIGHT_U.value > 0.02){
      SIG.forEach(sg => sigGlow.add(sg.lamp[0], sg.lamp[1], sg.lamp[2], sg.cur > 0.35 ? GREEN : RED, 3 * M));
      DISCS.forEach(ds => sigGlow.add(ds.lamp[0], ds.lamp[1], ds.lamp[2], ds.cur > 0.4 ? WHITE_D : RED, 1.6 * M));
    }
    sigGlow.flush(); sigGlow.pts.visible = near;
  }
});

window.SODOR_KNAPFORD = {SIG, DISCS, FOOT, p1: [p1lo, p1hi], roadRunner};
console.log(`Knapford: ${SIG.length} signal arms, ${DISCS.length} ground signals, ${LAMPS.length} lamps, built in ${Math.round(performance.now() - t0)} ms`);
})();
