// vehicles.js: the road vehicles and boats of the island, as shaped models rather than boxes.
//   Cars come in seven bodies (saloon, hatchback, estate, Mini, Land Rover, sports car, black cab), each an
//   extruded side profile with rounded edges, glazed windows and windscreens, wheels with hubs under dark arches,
//   head and tail lights, grille, bumpers, number plates and mirrors. Vans, single- and double-deck buses,
//   lorries (box, curtain-sider, tanker, flatbed; rigid or articulated) and tractors are built the same way.
//   Boats have a real lofted hull (keel, flare, sheer and a pointed bow) painted in antifouling, a boot stripe and
//   topsides; fishing boats carry a wheelhouse, mast, gantry and net drum, yachts a keel, mast, mainsail and jib,
//   launches a cabin and windscreen, and cargo ships a forecastle, holds and containers, a bridge and a funnel.
// All models are in metres, front (bow) towards +z, ground (waterline) at y = 0, built once per kind and colour
// and cloned (geometry shared) for each vehicle. Loaded after nwr.js (bakeVC) and before world.js and life.js.
(function(){
'use strict';
const K = window.SODOR_KIT, S = window.SODOR_STD;
if(!K || !S) return;
const {mat, add, box, cylX, cylY, cylZ} = K, bake = S.bakeVC, PI = Math.PI;
const GLASS = () => new THREE.MeshStandardMaterial({color: 0x1d2a33, roughness: 0.12, metalness: 0.55, side: THREE.DoubleSide});
const DARK = () => mat(0x161616, 0.85), CHROME = () => mat(0xc9ccd0, 0.25, 0.7), TYRE = () => mat(0x111111, 0.9), RUBBER = () => mat(0x222222, 0.8);
const HEAD = () => mat(0xfff7dc, 0.15, 0.1), TAIL = () => mat(0xc0141a, 0.3), AMBER = () => mat(0xff9a1e, 0.3), PLATE_F = () => mat(0xf2f2ee, 0.5), PLATE_R = () => mat(0xf2c83a, 0.5);
let seed = 4242; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ------------------------------------------------------------------ geometry helpers
// a side profile [[z, y], ...] extruded across the width w, with rounded edges
function profile(g, pts, w, m, bevel = 0.06, x = 0){
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for(let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
  const d = Math.max(0.01, w - 2 * bevel), geo = new THREE.ExtrudeGeometry(sh, {depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 2});
  geo.rotateY(-PI / 2); geo.translate(d / 2 + x, 0, 0);
  return add(g, geo, m, 0, 0, 0);
}
// a flat polygon [[z, y], ...] lying in the plane x (both sides visible)
function sidePoly(g, pts, x, m){
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for(let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
  const geo = new THREE.ShapeGeometry(sh); geo.rotateY(-PI / 2); geo.translate(x, 0, 0);
  return add(g, geo, m, 0, 0, 0);
}
// a quad through four points [x, y, z]
function quad(g, a, b, c, d, m){
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); geo.computeVertexNormals();
  return add(g, geo, m, 0, 0, 0);
}
const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
// a wheel: tyre, rim and hub cap, its axle across x
function wheel(g, x, y, z, r, wdt, rim = 0xc9ccd0){
  cylX(g, r, r, wdt, TYRE(), x, y, z, 16);
  const s = Math.sign(x) || 1;
  cylX(g, r * 0.62, r * 0.62, 0.02, mat(rim, 0.3, 0.6), x + s * wdt / 2, y, z, 14);
  cylX(g, r * 0.2, r * 0.2, 0.03, mat(0x8a8d91, 0.3, 0.6), x + s * (wdt / 2 + 0.01), y, z, 8);
  for(let k = 0; k < 5; k++){ const a = k / 5 * 2 * PI; box(g, 0.025, r * 0.07, r * 0.07, mat(0x8a8d91, 0.3, 0.6), x + s * (wdt / 2 + 0.012), y + Math.cos(a) * r * 0.38, z + Math.sin(a) * r * 0.38); }
}
// the dark wheel arch painted on the body side over a wheel
function arch(g, hw, y, z, r){ for(const s of [-1, 1]){ const m = add(g, new THREE.CircleGeometry(r, 14, 0, PI), mat(0x101010, 0.9, 0, 'double'), s * (hw + 0.012), y, z); m.rotation.y = PI / 2; } }
const proto = new Map();
function cached(key, build){ if(!proto.has(key)){ const g = build(); bake(g); proto.set(key, g); } const c = proto.get(key).clone(true); c.userData = Object.assign({}, proto.get(key).userData); return c; }

// ------------------------------------------------------------------ cars
const CARS = {
  saloon: {L: 4.45, W: 1.76, r: 0.32, wb: [1.36, -1.36], hl: 0.68, prof: [[-2.22, 0.32], [-2.24, 0.78], [-2.0, 0.97], [-1.3, 1.0], [-0.8, 1.42], [0.45, 1.44], [1.05, 1.0], [2.1, 0.86], [2.23, 0.62], [2.22, 0.32]],
    win: [[-1.22, 1.02], [-0.78, 1.37], [0.42, 1.39], [0.97, 1.02]], pillar: -0.18},
  hatch: {L: 3.95, W: 1.72, r: 0.31, wb: [1.22, -1.25], hl: 0.7, prof: [[-1.95, 0.32], [-1.98, 0.95], [-1.72, 1.4], [0.3, 1.44], [0.92, 1.0], [1.92, 0.84], [1.98, 0.6], [1.96, 0.32]],
    win: [[-1.66, 1.02], [-1.58, 1.35], [0.28, 1.39], [0.86, 1.02]], pillar: -0.45},
  estate: {L: 4.6, W: 1.78, r: 0.33, wb: [1.38, -1.42], hl: 0.68, prof: [[-2.28, 0.32], [-2.3, 0.95], [-2.15, 1.42], [0.42, 1.45], [1.05, 1.0], [2.15, 0.86], [2.28, 0.6], [2.27, 0.32]],
    win: [[-2.07, 1.02], [-2.0, 1.37], [0.4, 1.4], [0.98, 1.02]], pillar: -0.3, rack: true},
  mini: {L: 3.05, W: 1.42, r: 0.25, wb: [1.0, -1.0], hl: 0.66, prof: [[-1.52, 0.3], [-1.53, 0.88], [-1.42, 1.32], [0.62, 1.33], [0.85, 0.92], [1.5, 0.82], [1.53, 0.3]],
    win: [[-1.36, 0.95], [-1.33, 1.28], [0.6, 1.29], [0.8, 0.95]], pillar: -0.35, roundLights: true, whiteRoof: true},
  suv: {L: 4.05, W: 1.8, r: 0.4, wb: [1.25, -1.3], hl: 0.95, prof: [[-2.0, 0.45], [-2.02, 1.95], [1.0, 1.97], [1.15, 1.3], [2.0, 1.18], [2.03, 0.45]],
    win: [[-1.9, 1.35], [-1.9, 1.85], [0.95, 1.87], [1.08, 1.35]], pillar: -0.4, spare: true, roundLights: true},
  sports: {L: 4.2, W: 1.8, r: 0.32, wb: [1.3, -1.3], hl: 0.6, prof: [[-2.08, 0.3], [-2.1, 0.75], [-1.6, 0.95], [-0.6, 1.22], [0.25, 1.24], [0.75, 0.92], [2.05, 0.66], [2.1, 0.32]],
    win: [[-1.45, 0.97], [-0.6, 1.18], [0.22, 1.2], [0.7, 0.95]], pillar: -0.25},
  taxi: {L: 4.55, W: 1.75, r: 0.34, wb: [1.45, -1.45], hl: 0.75, prof: [[-2.25, 0.35], [-2.27, 0.95], [-2.05, 1.1], [-1.5, 1.12], [-1.35, 1.75], [0.55, 1.77], [0.95, 1.15], [2.15, 0.95], [2.27, 0.65], [2.26, 0.35]],
    win: [[-1.3, 1.15], [-1.28, 1.7], [0.52, 1.72], [0.9, 1.15]], pillar: -0.35, roundLights: true, sign: true},
};
function buildCar(kind, color){
  const C = CARS[kind], g = new THREE.Group(), hw = C.W / 2, body = mat(color, 0.32, 0.25), GL = GLASS();
  profile(g, C.prof, C.W, body, 0.07);
  const zs = C.prof.map(p => p[0]), zf = Math.max(...zs) + 0.07, zr = Math.min(...zs) - 0.07;
  // side windows, split by the door pillar
  const [b0, t0, t1, b1] = C.win, fr = (C.pillar - t0[0]) / (t1[0] - t0[0]), fb = (C.pillar - b0[0]) / (b1[0] - b0[0]);
  const tp = lerp2(t0, t1, fr), bp = lerp2(b0, b1, fb);
  for(const s of [-1, 1]){
    const x = s * (hw + 0.075);
    sidePoly(g, [b0, t0, [tp[0] - 0.05, tp[1]], [bp[0] - 0.05, bp[1]]], x, GL);
    sidePoly(g, [[bp[0] + 0.05, bp[1]], [tp[0] + 0.05, tp[1]], t1, b1], x, GL);
    box(g, 0.02, 0.02, C.L * 0.5, mat(0x0a0a0a, 0.6), x, (b0[1] + 0.5) / 2 + 0.05, (C.pillar + b1[0]) / 2 - 0.4);      // door shut line
    box(g, 0.03, 0.03, 0.16, CHROME(), x + s * 0.01, b0[1] - 0.12, C.pillar + 0.35); box(g, 0.03, 0.03, 0.16, CHROME(), x + s * 0.01, b0[1] - 0.12, C.pillar - 0.55);   // handles
    box(g, 0.14, 0.1, 0.06, mat(color, 0.3), s * (hw + 0.13), b1[1] + 0.05, b1[0] - 0.12);                                  // mirrors
  }
  // windscreen and rear screen
  const iw = hw - 0.12;
  quad(g, [-iw, b1[1] + 0.02, b1[0] + 0.07], [iw, b1[1] + 0.02, b1[0] + 0.07], [iw, t1[1] + 0.05, t1[0] + 0.05], [-iw, t1[1] + 0.05, t1[0] + 0.05], GL);
  quad(g, [iw, b0[1] + 0.02, b0[0] - 0.07], [-iw, b0[1] + 0.02, b0[0] - 0.07], [-iw, t0[1] + 0.05, t0[0] - 0.05], [iw, t0[1] + 0.05, t0[0] - 0.05], GL);
  if(C.whiteRoof) box(g, C.W - 0.12, 0.04, t1[0] - t0[0], mat(0xf2f0ea, 0.4), 0, Math.max(t0[1], t1[1]) + 0.07, (t0[0] + t1[0]) / 2);
  // front: grille, headlights, indicators, bumper, plate
  const y = C.hl;
  box(g, C.W * 0.42, 0.18, 0.04, mat(0x1a1a1a, 0.5, 0.4), 0, y - 0.04, zf - 0.01);
  for(const s of [-1, 1]){
    if(C.roundLights) cylZ(g, 0.1, 0.1, 0.04, HEAD(), s * (hw - 0.28), y, zf - 0.005, 12); else box(g, 0.34, 0.13, 0.04, HEAD(), s * (hw - 0.3), y, zf - 0.01);
    box(g, 0.1, 0.06, 0.04, AMBER(), s * (hw - 0.08), y - 0.08, zf - 0.02);
    box(g, 0.3, 0.16, 0.04, TAIL(), s * (hw - 0.22), y + 0.12, zr + 0.01);
  }
  box(g, C.W + 0.04, 0.14, 0.12, kind === 'mini' || kind === 'taxi' ? CHROME() : RUBBER(), 0, 0.42, zf - 0.02);
  box(g, C.W + 0.04, 0.14, 0.12, kind === 'mini' || kind === 'taxi' ? CHROME() : RUBBER(), 0, 0.42, zr + 0.02);
  box(g, 0.52, 0.12, 0.02, PLATE_F(), 0, 0.42, zf + 0.05); box(g, 0.52, 0.12, 0.02, PLATE_R(), 0, 0.62, zr - 0.02);
  if(C.rack && rnd() < 0.6){ for(const s of [-1, 1]) box(g, 0.05, 0.05, 1.6, mat(0x2a2a2a, 0.5), s * 0.6, 1.5, -0.7); for(let k = 0; k < 3; k++) box(g, 1.25, 0.04, 0.05, mat(0x2a2a2a, 0.5), 0, 1.5, -1.4 + k * 0.7); }
  if(C.spare) cylZ(g, 0.36, 0.36, 0.22, TYRE(), 0, 1.15, zr - 0.13, 14);
  if(C.sign){ box(g, 0.5, 0.18, 0.2, mat(0xf2c83a, 0.3), 0, 1.86, 0.3); }
  // wheels
  C.wb.forEach(z => { arch(g, hw, C.r, z, C.r + 0.07); for(const s of [-1, 1]) wheel(g, s * (hw - 0.1), C.r, z, C.r, 0.22); });
  g.userData.len = C.L; g.userData.h = Math.max(...C.prof.map(p => p[1]));
  return g;
}

// ------------------------------------------------------------------ vans, buses, lorries, tractors
function buildVan(color){
  const g = new THREE.Group(), L = 4.95, W = 1.95, hw = W / 2, body = mat(color, 0.35, 0.2), GL = GLASS();
  profile(g, [[-2.45, 0.38], [-2.47, 2.05], [0.95, 2.08], [1.55, 1.45], [2.42, 1.12], [2.47, 0.38]], W, body, 0.08);
  for(const s of [-1, 1]){ sidePoly(g, [[0.98, 1.22], [0.98, 1.9], [1.12, 1.92], [1.5, 1.42], [1.5, 1.22]], s * (hw + 0.085), GL); box(g, 0.02, 0.4, 3.0, mat(0xf2f0ea, 0.5), s * (hw + 0.09), 1.0, -0.9);
    box(g, 0.14, 0.12, 0.06, mat(0x1a1a1a, 0.4), s * (hw + 0.14), 1.55, 1.3); }
  quad(g, [-hw + 0.12, 1.45, 1.6], [hw - 0.12, 1.45, 1.6], [hw - 0.12, 2.02, 0.99], [-hw + 0.12, 2.02, 0.99], GL);
  box(g, 0.02, 1.5, 0.02, mat(0x0a0a0a, 0.6), 0, 1.25, -2.56);                                                  // rear doors
  box(g, W * 0.5, 0.25, 0.04, mat(0x1a1a1a, 0.5, 0.4), 0, 0.82, 2.55);
  for(const s of [-1, 1]){ box(g, 0.32, 0.16, 0.05, HEAD(), s * (hw - 0.3), 0.98, 2.53); box(g, 0.12, 0.4, 0.05, TAIL(), s * (hw - 0.1), 1.0, -2.55); }
  box(g, W + 0.05, 0.2, 0.14, RUBBER(), 0, 0.5, 2.55); box(g, W + 0.05, 0.2, 0.14, RUBBER(), 0, 0.5, -2.55);
  box(g, 0.52, 0.12, 0.02, PLATE_F(), 0, 0.5, 2.63); box(g, 0.52, 0.12, 0.02, PLATE_R(), 0, 0.5, -2.63);
  [1.62, -1.55].forEach(z => { arch(g, hw, 0.36, z, 0.44); for(const s of [-1, 1]) wheel(g, s * (hw - 0.12), 0.36, z, 0.36, 0.24); });
  g.userData.len = L; g.userData.h = 2.1; return g;
}
function windowBand(g, hw, z0, z1, y0, y1, pane, GL, frameCol){
  for(let z = z0; z < z1 - 0.3; z += pane){ const ze = Math.min(z1, z + pane - 0.12); for(const s of [-1, 1]) sidePoly(g, [[z, y0], [z, y1], [ze, y1], [ze, y0]], s * (hw + 0.075), GL); }
}
function buildBus(color){
  const g = new THREE.Group(), L = 11, W = 2.5, hw = W / 2, body = mat(color, 0.35, 0.2), GL = GLASS();
  profile(g, [[-5.5, 0.35], [-5.5, 2.95], [-5.28, 3.12], [5.15, 3.12], [5.5, 2.85], [5.5, 0.35]], W, body, 0.1);
  windowBand(g, hw, -5.0, 3.6, 1.35, 2.65, 1.5, GL);
  for(const s of [-1, 1]) box(g, 0.02, 0.22, L - 0.4, mat(0xf2e8c8, 0.5), s * (hw + 0.1), 1.15, 0);
  sidePoly(g, [[3.9, 0.5], [3.9, 2.7], [5.0, 2.7], [5.0, 0.5]], hw + 0.08, GL);                                  // doors on the near side
  quad(g, [-hw + 0.1, 1.0, 5.58], [hw - 0.1, 1.0, 5.58], [hw - 0.1, 2.75, 5.52], [-hw + 0.1, 2.75, 5.52], GL);
  box(g, W * 0.7, 0.3, 0.05, mat(0x111111, 0.4), 0, 2.92, 5.52); box(g, W * 0.55, 0.16, 0.06, mat(0xffb12a, 0.3), 0, 2.92, 5.53);
  quad(g, [hw - 0.15, 1.7, -5.59], [-hw + 0.15, 1.7, -5.59], [-hw + 0.15, 2.7, -5.59], [hw - 0.15, 2.7, -5.59], GL);
  for(const s of [-1, 1]){ box(g, 0.3, 0.16, 0.05, HEAD(), s * (hw - 0.3), 0.7, 5.6); box(g, 0.14, 0.4, 0.05, TAIL(), s * (hw - 0.15), 0.9, -5.6); box(g, 0.08, 0.5, 0.2, mat(0x1a1a1a, 0.5), s * (hw + 0.1), 2.3, 5.3); }
  box(g, W + 0.04, 0.3, 0.14, RUBBER(), 0, 0.5, 5.56); box(g, W + 0.04, 0.3, 0.14, RUBBER(), 0, 0.5, -5.56);
  [3.4, -3.0].forEach(z => { arch(g, hw, 0.5, z, 0.6); for(const s of [-1, 1]) wheel(g, s * (hw - 0.16), 0.5, z, 0.5, 0.3); });
  g.userData.len = L; g.userData.h = 3.1; return g;
}
function buildDecker(color){
  const g = new THREE.Group(), L = 10.2, W = 2.5, hw = W / 2, body = mat(color, 0.35, 0.2), GL = GLASS();
  profile(g, [[-5.1, 0.35], [-5.1, 4.2], [-4.85, 4.42], [4.8, 4.42], [5.1, 4.12], [5.1, 0.35]], W, body, 0.1);
  windowBand(g, hw, -4.6, 3.6, 1.3, 2.25, 1.35, GL);
  windowBand(g, hw, -4.8, 4.6, 2.85, 3.95, 1.3, GL);
  for(const s of [-1, 1]) box(g, 0.02, 0.24, L - 0.3, mat(0xf2e8c8, 0.5), s * (hw + 0.1), 2.55, 0);              // the cream band between the decks
  box(g, W + 0.1, 0.24, 0.02, mat(0xf2e8c8, 0.5), 0, 2.55, 5.12);
  sidePoly(g, [[3.85, 0.5], [3.85, 2.25], [4.85, 2.25], [4.85, 0.5]], hw + 0.08, GL);
  quad(g, [-hw + 0.1, 1.1, 5.18], [hw - 0.1, 1.1, 5.18], [hw - 0.1, 2.3, 5.14], [-hw + 0.1, 2.3, 5.14], GL);
  quad(g, [-hw + 0.15, 2.85, 5.13], [hw - 0.15, 2.85, 5.13], [hw - 0.15, 3.95, 5.0], [-hw + 0.15, 3.95, 5.0], GL);
  box(g, 0.04, 1.1, 0.03, mat(color, 0.35), 0, 3.4, 5.08);                                                     // the upper-deck centre pillar
  box(g, W * 0.7, 0.32, 0.05, mat(0x111111, 0.4), 0, 4.2, 5.0); box(g, W * 0.55, 0.18, 0.06, mat(0xffb12a, 0.3), 0, 4.2, 5.01);
  quad(g, [hw - 0.2, 2.9, -5.19], [-hw + 0.2, 2.9, -5.19], [-hw + 0.2, 3.9, -5.19], [hw - 0.2, 3.9, -5.19], GL);
  for(const s of [-1, 1]){ box(g, 0.28, 0.16, 0.05, HEAD(), s * (hw - 0.3), 0.75, 5.18); box(g, 0.14, 0.4, 0.05, TAIL(), s * (hw - 0.15), 1.0, -5.18); box(g, 0.08, 0.5, 0.2, mat(0x1a1a1a, 0.5), s * (hw + 0.1), 2.1, 4.95); }
  box(g, W + 0.04, 0.3, 0.14, RUBBER(), 0, 0.5, 5.16); box(g, W + 0.04, 0.3, 0.14, RUBBER(), 0, 0.5, -5.16);
  [3.1, -2.6].forEach(z => { arch(g, hw, 0.5, z, 0.6); for(const s of [-1, 1]) wheel(g, s * (hw - 0.16), 0.5, z, 0.5, 0.3, 0xb0302a); });
  g.userData.len = L; g.userData.h = 4.4; return g;
}
const LORRY_BODIES = ['box', 'curtain', 'tanker', 'flatbed'];
function buildLorry(color, artic, kind){
  const g = new THREE.Group(), W = 2.5, hw = W / 2, cab = mat(color, 0.35, 0.2), GL = GLASS(), bodyL = artic ? 13.2 : 6.8, L = 2.6 + bodyL + 0.5;
  const zc = L / 2 - 1.25;                                                                                    // cab centre
  const cg = new THREE.Group(); cg.position.z = zc; g.add(cg);
  profile(cg, [[-1.2, 0.6], [-1.22, 3.0], [-1.0, 3.15], [0.95, 3.15], [1.18, 2.65], [1.25, 1.5], [1.25, 0.6]], W, cab, 0.09);
  for(const s of [-1, 1]){ sidePoly(cg, [[0.1, 1.75], [0.1, 2.55], [0.95, 2.55], [1.12, 2.3], [1.12, 1.75]], s * (hw + 0.09), GL);
    box(cg, 0.05, 0.6, 0.05, mat(0x1a1a1a, 0.4), s * (hw + 0.35), 2.3, 1.05); box(cg, 0.08, 0.45, 0.22, mat(0x1a1a1a, 0.4), s * (hw + 0.38), 2.25, 1.12);   // mirrors
    for(const y of [0.75, 1.15]) box(cg, 0.4, 0.06, 0.3, mat(0x3a3a3a, 0.6, 0.4), s * (hw - 0.25), y, 1.0); }            // steps
  quad(cg, [-hw + 0.12, 1.85, 1.33], [hw - 0.12, 1.85, 1.33], [hw - 0.12, 2.6, 1.22], [-hw + 0.12, 2.6, 1.22], GL);
  box(cg, W * 0.62, 0.7, 0.05, mat(0x161616, 0.4, 0.5), 0, 1.25, 1.34); for(let k = 0; k < 5; k++) box(cg, W * 0.6, 0.04, 0.06, CHROME(), 0, 0.98 + k * 0.13, 1.36);
  for(const s of [-1, 1]){ box(cg, 0.32, 0.18, 0.05, HEAD(), s * (hw - 0.3), 0.82, 1.35); box(cg, 0.1, 0.08, 0.05, AMBER(), s * (hw - 0.08), 0.82, 1.35); }
  box(cg, W + 0.05, 0.32, 0.16, mat(0x2a2a2a, 0.6), 0, 0.5, 1.34); box(cg, 0.52, 0.12, 0.02, PLATE_F(), 0, 0.5, 1.43);
  box(cg, W - 0.2, 0.35, 0.4, cab, 0, 3.32, -0.4);                                                         // sun visor / roof pod
  cylY(cg, 0.08, 0.08, 1.4, CHROME(), hw - 0.15, 3.3, -1.25, 8);                                            // exhaust stack
  // chassis, tank, the body behind
  const zb = zc - 1.25 - 0.25 - bodyL / 2;
  box(g, 1.0, 0.3, L - 0.5, mat(0x1c1c1c, 0.7), 0, 0.75, -0.1);
  cylZ(g, 0.32, 0.32, 1.1, mat(0xc9ccd0, 0.3, 0.6), -hw + 0.35, 0.8, zc - 1.9, 12);
  const bodyM = mat([0xf2f0ea, 0xd8dcdf, 0x2a4a7a, 0xb3201c, 0x3a6a3a, 0xe2a91f][Math.floor(rnd() * 6)], 0.55);
  if(kind === 'tanker'){
    cylZ(g, 1.15, 1.15, bodyL - 0.6, mat(0xd8dcdf, 0.25, 0.6), 0, 2.15, zb, 20);
    for(const e of [-1, 1]) add(g, new THREE.SphereGeometry(1.15, 18, 8, 0, 2 * PI, 0, PI / 2).rotateX(e * PI / 2), mat(0xd8dcdf, 0.25, 0.6), 0, 2.15, zb + e * (bodyL / 2 - 0.3));
    box(g, 0.5, 0.06, bodyL - 1.5, mat(0x3a3a3a, 0.6), 0, 3.32, zb); for(let k = 0; k < 3; k++) cylY(g, 0.25, 0.25, 0.12, mat(0x3a3a3a, 0.6), 0, 3.32, zb - bodyL / 3 + k * bodyL / 3, 10);
    box(g, 0.03, 2.0, 0.03, mat(0x8a8d91, 0.5), hw - 0.2, 2.2, zb + bodyL / 2 - 0.2);
  } else if(kind === 'flatbed'){
    box(g, W, 0.18, bodyL, mat(0x5a4632, 0.8), 0, 1.15, zb);
    for(let k = 0; k < Math.floor(bodyL / 2.6); k++) box(g, W * 0.85, 1.0 + rnd() * 0.6, 2.1, mat([0xa58a5a, 0x7a6048, 0x6f8a9a, 0x3a5a3a][k % 4], 0.85), 0, 1.75, zb - bodyL / 2 + 1.4 + k * 2.6);
  } else {
    box(g, W, 2.75, bodyL, bodyM, 0, 2.55, zb);
    if(kind === 'curtain') for(let z = zb - bodyL / 2 + 0.6; z < zb + bodyL / 2; z += 0.75) for(const s of [-1, 1]) box(g, 0.02, 2.5, 0.05, mat(0x2a2a2a, 0.6), s * (hw + 0.012), 2.5, z);
    else for(const s of [-1, 1]){ box(g, 0.02, 0.5, bodyL * 0.7, mat([0xb3201c, 0x2a4a7a, 0x2e8b6e][Math.floor(rnd() * 3)], 0.4), s * (hw + 0.012), 2.6, zb); }
    box(g, W + 0.04, 0.12, bodyL + 0.04, mat(0x9a9ea2, 0.4, 0.4), 0, 3.93, zb); box(g, 0.02, 2.6, 0.02, mat(0x2a2a2a, 0.6), 0, 2.5, zb - bodyL / 2 - 0.01);
  }
  for(const s of [-1, 1]) box(g, 0.14, 0.3, 0.05, TAIL(), s * (hw - 0.2), 1.0, zb - bodyL / 2 - 0.02);
  box(g, 0.52, 0.14, 0.02, PLATE_R(), 0, 0.9, zb - bodyL / 2 - 0.03);
  if(artic) for(const s of [-1, 1]) box(g, 0.12, 0.9, 0.12, mat(0x3a3a3a, 0.6), s * 0.8, 0.45, zb + bodyL / 2 - 2.6);      // landing legs
  const axles = artic ? [zc + 0.1, zc - 2.0, zc - 3.3, zb - bodyL / 2 + 3.4, zb - bodyL / 2 + 2.1, zb - bodyL / 2 + 0.8] : [zc + 0.1, zb - bodyL / 2 + 1.7];
  axles.forEach((z, i) => { const twin = i > 0, r = 0.52; arch(g, hw, r, z, r + 0.08); for(const s of [-1, 1]){ wheel(g, s * (hw - (twin ? 0.28 : 0.18)), r, z, r, twin ? 0.5 : 0.3); }
    if(i > 0) for(const s of [-1, 1]) box(g, 0.45, 0.06, 0.9, mat(0x1a1a1a, 0.7), s * (hw - 0.28), r * 2 + 0.12, z); });
  g.userData.len = L; g.userData.h = 4.0; return g;
}
function buildTractor(color){
  const g = new THREE.Group(), C = mat(color, 0.4, 0.15);
  profile(g, [[-0.5, 0.75], [-0.5, 1.45], [1.6, 1.35], [1.75, 1.2], [1.75, 0.75]], 0.78, C, 0.05);       // bonnet
  box(g, 0.6, 0.5, 1.9, mat(0x4a4a4a, 0.6, 0.4), 0, 0.55, 0.7);                                                // engine and sump
  box(g, 0.6, 0.6, 0.05, mat(0x2a2a2a, 0.5), 0, 1.05, 1.78); for(let k = 0; k < 4; k++) box(g, 0.62, 0.03, 0.06, CHROME(), 0, 0.82 + k * 0.13, 1.8);
  for(const s of [-1, 1]) cylZ(g, 0.08, 0.08, 0.04, HEAD(), s * 0.22, 1.3, 1.78, 10);
  box(g, 0.9, 0.5, 0.9, C, 0, 0.95, -0.8);                                                                       // gearbox and seat base
  box(g, 0.5, 0.08, 0.45, mat(0x1a1a1a, 0.7), 0, 1.45, -0.95); box(g, 0.5, 0.45, 0.08, mat(0x1a1a1a, 0.7), 0, 1.7, -1.2);   // seat
  cylY(g, 0.03, 0.03, 0.55, mat(0x1a1a1a, 0.5), 0, 1.6, -0.35, 6); const sw = add(g, new THREE.TorusGeometry(0.2, 0.025, 6, 16), mat(0x1a1a1a, 0.5), 0, 1.9, -0.32); sw.rotation.x = PI / 2.6;
  cylY(g, 0.05, 0.06, 1.1, mat(0x2a2a2a, 0.5, 0.4), 0.22, 1.9, 1.25, 8);                                   // exhaust
  // big rear wheels with tread lugs and mudguards, small front wheels
  for(const s of [-1, 1]){
    cylX(g, 0.78, 0.78, 0.42, TYRE(), s * 0.78, 0.78, -0.75, 20); cylX(g, 0.45, 0.45, 0.02, mat(color, 0.4), s * 0.995, 0.78, -0.75, 16); cylX(g, 0.12, 0.12, 0.04, mat(0x8a8d91, 0.3, 0.6), s * 1.0, 0.78, -0.75, 8);
    for(let k = 0; k < 16; k++){ const a = k / 16 * 2 * PI; const lug = box(g, 0.44, 0.08, 0.16, TYRE(), s * 0.78, 0.78 + Math.cos(a) * 0.8, -0.75 + Math.sin(a) * 0.8); lug.rotation.x = -a; }
    const mg = add(g, new THREE.CylinderGeometry(0.9, 0.9, 0.5, 16, 1, true, -PI / 2, PI).rotateZ(PI / 2), mat(color, 0.4, 0, 'double'), s * 0.78, 0.8, -0.75); mg.rotation.y = 0;
    cylX(g, 0.38, 0.38, 0.22, TYRE(), s * 0.55, 0.38, 1.35, 14); cylX(g, 0.2, 0.2, 0.02, mat(color, 0.4), s * 0.67, 0.38, 1.35, 12);
  }
  if(rnd() < 0.5){ for(const s of [-1, 1]) for(const t of [-1, 1]) box(g, 0.05, 1.3, 0.05, mat(0x2a2a2a, 0.5), s * 0.55, 2.0, -0.75 + t * 0.55); box(g, 1.25, 0.06, 1.3, mat(color, 0.4), 0, 2.65, -0.75);
    for(const s of [-1, 1]) sidePoly(g, [[-1.25, 1.5], [-1.25, 2.55], [-0.25, 2.55], [-0.25, 1.5]], s * 0.56, GLASS()); }
  g.userData.len = 3.6; g.userData.h = 2.2; return g;
}
function buildTrailer(){
  const g = new THREE.Group(), len = 3.8, W = 1.9;
  box(g, W, 0.12, len, mat(0x6a4a30, 0.85), 0, 0.95, 0);
  for(const s of [-1, 1]) box(g, 0.06, 0.6, len, mat(0x8a2a1e, 0.8), s * W / 2, 1.3, 0);
  box(g, W, 0.6, 0.06, mat(0x8a2a1e, 0.8), 0, 1.3, -len / 2); box(g, 0.1, 0.1, 1.2, mat(0x2a2a2a, 0.6), 0, 0.8, len / 2 + 0.5);
  for(let k = 0; k < 3; k++) cylX(g, 0.55, 0.55, 1.1, mat(0xd8c070, 0.9), 0, 1.6, -1.1 + k * 1.1, 14);          // round bales
  for(const s of [-1, 1]) wheel(g, s * (W / 2 + 0.05), 0.42, -0.3, 0.42, 0.22);
  g.userData.len = len + 0.8; g.userData.h = 2.2; return g;
}

// ------------------------------------------------------------------ boats
// A lofted hull: stations along the length (transom at the stern, a fine bow), each a curved section from the
// keel up to the sheer, painted by height: antifouling below the waterline, a boot stripe, then the topsides.
function hull(g, L, B, D, T, top, o = {}){
  // each section is sampled in three bands (keel to waterline, the boot stripe, up to the sheer), so every
  // triangle lies wholly in one colour and the paint lines run clean along the hull
  const NS = 26, N0 = 4, N1 = 1, N2 = 6, NA = N0 + N1 + N2, sections = [], yWL = -0.02 * D, yST = 0.18 * D;
  for(let i = 0; i <= NS; i++){
    const u = i / NS, z = -L / 2 + u * L;
    const hb = B / 2 * (u < 0.55 ? 0.78 + 0.22 * Math.sin(u / 0.55 * PI / 2) : Math.pow(Math.max(0, Math.cos((u - 0.55) / 0.45 * PI / 2)), 0.8)) * (u < 0.04 ? 0.92 : 1);
    const sheer = D + (o.sheer || 0.06) * L * Math.pow(u, 2.2) + (o.sheerAft || 0.02) * L * Math.pow(1 - u, 3);
    const keel = -T * (u > 0.8 ? Math.max(0.05, (1 - u) / 0.2) : u < 0.06 ? 0.55 + u / 0.06 * 0.45 : 1);
    const at = s => { const a = s * PI / 2; return [hb * Math.pow(Math.sin(a), o.vee || 0.55), keel + (sheer - keel) * Math.pow(1 - Math.cos(a), o.flare || 0.9), z]; };
    const sAt = y => { if(at(0)[1] >= y) return 0; let lo = 0, hi = 1; for(let it = 0; it < 30; it++){ const m = (lo + hi) / 2; if(at(m)[1] < y) lo = m; else hi = m; } return (lo + hi) / 2; };
    const s1 = sAt(yWL), s2 = Math.max(s1, sAt(yST)), sec = [];
    for(let k = 0; k <= N0; k++) sec.push(at(s1 * k / N0));
    for(let k = 1; k <= N1; k++) sec.push(at(s1 + (s2 - s1) * k / N1));
    for(let k = 1; k <= N2; k++) sec.push(at(s2 + (1 - s2) * k / N2));
    sections.push(sec);
  }
  const parts = {bottom: [], stripe: [], top: [], deck: [], transom: []};
  let band = 0;
  const tri = (a, b, c) => { const list = band < N0 ? parts.bottom : band < N0 + N1 ? parts.stripe : parts.top; list.push(...a, ...b, ...c); };
  for(let i = 0; i < NS; i++) for(let k = 0; k < NA; k++) for(const s of [-1, 1]){
    band = k;
    const p = (ii, kk) => { const v = sections[ii][kk]; return [v[0] * s, v[1], v[2]]; };
    const a = p(i, k), b = p(i + 1, k), c = p(i + 1, k + 1), d = p(i, k + 1);
    if(s > 0){ tri(a, b, c); tri(a, c, d); } else { tri(a, c, b); tri(a, d, c); }
  }
  for(let i = 0; i < NS; i++){                                                    // the deck, across from sheer to sheer
    const a = sections[i][NA], b = sections[i + 1][NA];
    parts.deck.push(-a[0], a[1], a[2], b[0], b[1], b[2], a[0], a[1], a[2], -a[0], a[1], a[2], -b[0], b[1], b[2], b[0], b[1], b[2]);
  }
  const st = sections[0];                                                           // the transom
  for(let k = 0; k < NA; k++){ const a = st[k], b = st[k + 1]; parts.transom.push(a[0], a[1], a[2], -b[0], b[1], b[2], b[0], b[1], b[2], a[0], a[1], a[2], -a[0], a[1], a[2], -b[0], b[1], b[2]); }
  const mk = (arr, m) => { if(!arr.length) return; const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); geo.computeVertexNormals(); add(g, geo, m, 0, 0, 0); };
  mk(parts.bottom, mat(o.bottom || 0x8a2a22, 0.7, 0, 'double')); mk(parts.stripe, mat(o.stripe || 0xf2f0ea, 0.5, 0, 'double')); mk(parts.top, mat(top, 0.45, 0.1, 'double'));
  mk(parts.deck, mat(o.deck || 0xb8a888, 0.85, 0, 'double')); mk(parts.transom, mat(top, 0.45, 0, 'double'));
  // rubbing strake along the sheer
  for(let i = 0; i < NS; i++){ const a = sections[i][NA], b = sections[i + 1][NA], len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    for(const s of [-1, 1]){ const m = box(g, 0.06, 0.08, len + 0.02, mat(o.strake || 0x2a2a2a, 0.6), s * (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.02, (a[2] + b[2]) / 2); m.rotation.y = Math.atan2(s * (b[0] - a[0]), b[2] - a[2]); } }
  return {sheerAt: u => sections[Math.round(u * NS)][NA]};
}
function rail(g, x0, z0, x1, z1, y, h = 0.7){ const L = Math.hypot(x1 - x0, z1 - z0), m = box(g, 0.03, 0.03, L, CHROME(), (x0 + x1) / 2, y + h, (z0 + z1) / 2); m.rotation.y = Math.atan2(x1 - x0, z1 - z0);
  for(let f = 0; f <= 1.001; f += 0.25) cylY(g, 0.015, 0.015, h, CHROME(), x0 + (x1 - x0) * f, y + h / 2, z0 + (z1 - z0) * f, 4); }
function lifebuoy(g, x, y, z, ry){ const t = add(g, new THREE.TorusGeometry(0.28, 0.07, 6, 14), mat(0xf26a1e, 0.6), x, y, z); t.rotation.y = ry; }
function buildFishing(len, col){
  const g = new THREE.Group(), B = len * 0.32, D = len * 0.1, T = len * 0.11;
  const H = hull(g, len, B, D, T, col, {sheer: 0.07, deck: 0x9a8a70});
  const dk = D + 0.05;
  // wheelhouse forward of midships, with its windows all round, a radar mast and lifebuoys
  const wz = len * 0.1, ww = B * 0.6, wl = len * 0.2, wh = 2.0;
  box(g, ww, wh, wl, mat(0xf2f0ea, 0.5), 0, dk + wh / 2, wz); box(g, ww + 0.2, 0.15, wl + 0.3, mat(col, 0.45), 0, dk + wh + 0.07, wz);
  for(const s of [-1, 1]) sidePoly(g, [[wz - wl * 0.4, dk + 1.15], [wz - wl * 0.4, dk + 1.75], [wz + wl * 0.42, dk + 1.75], [wz + wl * 0.42, dk + 1.15]], s * (ww / 2 + 0.01), GLASS());
  quad(g, [-ww / 2 + 0.1, dk + 1.15, wz + wl / 2 + 0.01], [ww / 2 - 0.1, dk + 1.15, wz + wl / 2 + 0.01], [ww / 2 - 0.1, dk + 1.8, wz + wl / 2 + 0.01], [-ww / 2 + 0.1, dk + 1.8, wz + wl / 2 + 0.01], GLASS());
  for(const s of [-1, 1]) lifebuoy(g, s * (ww / 2 + 0.03), dk + 0.9, wz, PI / 2);
  cylY(g, 0.06, 0.06, 1.4, mat(0x2a2a2a, 0.5), 0, dk + wh + 0.8, wz - wl * 0.2, 6); box(g, 1.0, 0.08, 0.2, mat(0x2a2a2a, 0.5), 0, dk + wh + 1.4, wz - wl * 0.2);
  // foremast with a derrick, and the stern gantry with the net drum below it
  cylY(g, 0.09, 0.11, len * 0.55, mat(0x5a4632, 0.8), 0, dk + len * 0.27, len * 0.3, 8);
  const der = box(g, 0.08, 0.08, len * 0.35, mat(0x5a4632, 0.8), 0, dk + 1.2, len * 0.17); der.rotation.x = 0.35;
  for(const s of [-1, 1]){ const leg = box(g, 0.14, 3.2, 0.14, mat(0x3a3a3a, 0.5, 0.4), s * B * 0.36, dk + 1.6, -len * 0.42); leg.rotation.x = -0.18; }
  box(g, B * 0.75, 0.16, 0.16, mat(0x3a3a3a, 0.5, 0.4), 0, dk + 3.1, -len * 0.46);
  cylX(g, 0.55, 0.55, B * 0.55, mat(0x2a4a7a, 0.7), 0, dk + 0.6, -len * 0.28, 14); for(const s of [-1, 1]) cylX(g, 0.75, 0.75, 0.06, mat(0xd8a020, 0.5), s * B * 0.28, dk + 0.6, -len * 0.28, 14);
  for(let k = 0; k < 4; k++) box(g, 0.6, 0.35, 0.45, mat([0x2a6aa0, 0xe8e4d8, 0xf2a01e][k % 3], 0.7), (k % 2 - 0.5) * 0.7, dk + 0.18, -len * 0.12 - Math.floor(k / 2) * 0.5);
  const fz = H.sheerAt(0.92); rail(g, -fz[0] * 0.8, fz[2] - 1.2, fz[0] * 0.8, fz[2] - 1.2, fz[1], 0.6);
  g.userData.len = len; return g;
}
function buildYacht(len, col){
  const g = new THREE.Group(), B = len * 0.3, D = len * 0.08, T = len * 0.05;
  hull(g, len, B, D, T, col, {sheer: 0.03, bottom: 0x1f2f4a, stripe: 0x2a6aa0, deck: 0xe8dcc0, vee: 0.5});
  const dk = D + 0.04;
  box(g, 0.14, len * 0.16, len * 0.18, mat(0x1f2f4a, 0.6), 0, -T - len * 0.07, 0);                             // fin keel and its bulb
  cylZ(g, 0.2, 0.2, len * 0.2, mat(0x2a2a2a, 0.6, 0.4), 0, -T - len * 0.15, -0.1, 10);
  box(g, B * 0.62, 0.55, len * 0.36, mat(0xf2f0ea, 0.45), 0, dk + 0.27, len * 0.02);                            // the coachroof
  for(const s of [-1, 1]) sidePoly(g, [[-len * 0.12, dk + 0.25], [-len * 0.12, dk + 0.45], [len * 0.14, dk + 0.45], [len * 0.14, dk + 0.25]], s * (B * 0.31 + 0.01), GLASS());
  const mh = len * 1.25, mz = len * 0.08;
  cylY(g, 0.07, 0.09, mh, mat(0xdedede, 0.3, 0.5), 0, dk + mh / 2, mz, 8);
  cylZ(g, 0.06, 0.06, len * 0.42, mat(0xdedede, 0.3, 0.5), 0, dk + 1.3, mz - len * 0.21, 6);              // boom
  const sail = (pts, m) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); geo.computeVertexNormals(); add(g, geo, m, 0, 0, 0); };
  const SAIL = mat(0xf6f4ee, 0.85, 0, 'double');
  const tack = [0, dk + 1.35, mz - 0.05], head = [0, dk + mh - 0.3, mz - 0.05], clew = [0, dk + 1.35, mz - len * 0.42], belly = [0.35, dk + mh * 0.45, mz - len * 0.18];
  sail([tack, head, belly, tack, belly, clew], SAIL);
  sail([[0, dk + mh * 0.85, mz + 0.05], [0, dk + 0.3, len * 0.45], [0.3, dk + 0.6, mz + len * 0.08]], SAIL);  // jib
  const stay = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = cylY(g, 0.012, 0.012, L, mat(0x9a9ea2, 0.4, 0.6), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 3);
    m.lookAt(new THREE.Vector3(b[0], b[1], b[2])); m.rotateX(PI / 2); };
  stay([0, dk + mh, mz], [0, dk + 0.2, len * 0.47]); stay([0, dk + mh, mz], [0, dk + 0.2, -len * 0.48]);
  for(const s of [-1, 1]) stay([0, dk + mh * 0.9, mz], [s * B * 0.46, dk + 0.1, mz - 0.2]);
  rail(g, -B * 0.4, -len * 0.4, B * 0.4, -len * 0.4, dk, 0.6);
  g.userData.len = len; return g;
}
function buildLaunch(len, col){
  const g = new THREE.Group(), B = len * 0.34, D = len * 0.1, T = len * 0.06;
  hull(g, len, B, D, T, col, {sheer: 0.05, vee: 0.45, flare: 1.1, deck: 0xc8b48a, stripe: 0xf2f0ea});
  const dk = D + 0.04, cz = len * 0.05;
  box(g, B * 0.7, 1.2, len * 0.32, mat(0xf2f0ea, 0.45), 0, dk + 0.6, cz);
  for(const s of [-1, 1]) sidePoly(g, [[cz - len * 0.13, dk + 0.6], [cz - len * 0.13, dk + 1.0], [cz + len * 0.12, dk + 1.0], [cz + len * 0.15, dk + 0.6]], s * (B * 0.35 + 0.01), GLASS());
  quad(g, [-B * 0.33, dk + 1.2, cz + len * 0.16], [B * 0.33, dk + 1.2, cz + len * 0.16], [B * 0.3, dk + 1.75, cz + len * 0.1], [-B * 0.3, dk + 1.75, cz + len * 0.1], GLASS());
  box(g, B * 0.72, 0.08, len * 0.38, mat(col, 0.45), 0, dk + 1.22, cz - len * 0.03);
  cylY(g, 0.04, 0.04, 1.6, mat(0xdedede, 0.4, 0.5), 0, dk + 2.0, cz - len * 0.05, 6); box(g, 0.5, 0.3, 0.02, mat(0xb3201c, 0.6, 0, 'double'), 0.25, dk + 2.6, cz - len * 0.05);
  lifebuoy(g, 0, dk + 0.6, -len * 0.44, 0);
  rail(g, -B * 0.3, len * 0.25, 0, len * 0.46, dk, 0.5); rail(g, B * 0.3, len * 0.25, 0, len * 0.46, dk, 0.5);
  g.userData.len = len; return g;
}
const FUNNELS = [[0xc8262b, 0x1a1a1a], [0xe2a91f, 0x1a1a1a], [0x2a4a7a, 0xf2f0ea], [0x1a1a1a, 0xc8262b]];
function buildShip(len, hullCol, deckCol){
  const g = new THREE.Group(), B = len * 0.16, D = len * 0.07, T = len * 0.05;
  const H = hull(g, len, B, D, T, hullCol, {sheer: 0.03, sheerAft: 0.01, vee: 0.35, flare: 1.4, deck: deckCol, stripe: 0xf2f0ea, bottom: 0x8a2a22});
  const dk = D + len * 0.003, s1 = len / 60;
  // forecastle and its windlass
  box(g, B * 0.85, 2.2 * s1, len * 0.12, mat(hullCol, 0.45), 0, dk + 1.1 * s1, len * 0.38);
  cylX(g, 0.5 * s1, 0.5 * s1, B * 0.5, mat(0x3a3a3a, 0.5, 0.4), 0, dk + 2.6 * s1, len * 0.4, 10);
  // the holds: hatch covers, and containers stacked on them
  for(let k = 0; k < 4; k++){
    const z = len * 0.24 - k * len * 0.13;
    box(g, B * 0.72, 1.0 * s1, len * 0.11, mat(0x5a5f66, 0.6), 0, dk + 0.5 * s1, z);
    const tiers = 1 + Math.floor(rnd() * 3);
    for(let tr = 0; tr < tiers; tr++) for(let c = -1; c <= 1; c++) box(g, B * 0.22, 2.4 * s1, len * 0.1, mat([0x2a6aa0, 0xc8601e, 0x3a8a4a, 0xb0302a, 0xe2a91f, 0x8a8d91][(k * 3 + c + tr * 2 + 6) % 6], 0.6), c * B * 0.235, dk + (1.0 + 1.2 + tr * 2.4) * s1, z);
  }
  // derrick masts between the holds
  for(const z of [len * 0.31, len * 0.04]){ cylY(g, 0.35 * s1, 0.4 * s1, 12 * s1, mat(0xe2a91f, 0.5), 0, dk + 6 * s1, z, 10); box(g, B * 0.6, 0.3 * s1, 0.3 * s1, mat(0xe2a91f, 0.5), 0, dk + 10 * s1, z);
    for(const s of [-1, 1]){ const d = box(g, 0.2 * s1, 0.2 * s1, 9 * s1, mat(0xe2a91f, 0.5), s * B * 0.25, dk + 6 * s1, z - 3.5 * s1); d.rotation.x = 0.55; } }
  // the bridge block aft: three decks of windows, bridge wings, the funnel and lifeboats
  const az = -len * 0.36, bw = B * 0.82, bl = len * 0.14;
  for(let dkk = 0; dkk < 3; dkk++){ const y = dk + dkk * 2.6 * s1, w = bw * (1 - dkk * 0.06);
    box(g, w, 2.5 * s1, bl * (1 - dkk * 0.12), mat(0xf2f0ea, 0.45), 0, y + 1.25 * s1, az);
    for(const s of [-1, 1]) sidePoly(g, [[az - bl * 0.42, y + 1.0 * s1], [az - bl * 0.42, y + 1.7 * s1], [az + bl * 0.4, y + 1.7 * s1], [az + bl * 0.4, y + 1.0 * s1]], s * (w / 2 + 0.02), GLASS()); }
  const by = dk + 7.8 * s1;
  box(g, B * 1.0, 2.2 * s1, bl * 0.45, mat(0xf2f0ea, 0.45), 0, by + 1.1 * s1, az + bl * 0.2);
  quad(g, [-B * 0.48, by + 0.9 * s1, az + bl * 0.43], [B * 0.48, by + 0.9 * s1, az + bl * 0.43], [B * 0.48, by + 1.8 * s1, az + bl * 0.43], [-B * 0.48, by + 1.8 * s1, az + bl * 0.43], GLASS());
  box(g, B * 1.02, 0.25 * s1, bl * 0.5, mat(0x3a3a3a, 0.5), 0, by + 2.3 * s1, az + bl * 0.2);
  cylY(g, 0.12 * s1, 0.12 * s1, 5 * s1, mat(0xdedede, 0.4, 0.5), 0, by + 4.8 * s1, az + bl * 0.15, 6); box(g, 2.2 * s1, 0.2 * s1, 0.4 * s1, mat(0x3a3a3a, 0.5), 0, by + 6 * s1, az + bl * 0.15);
  const [fc, band] = FUNNELS[Math.floor(rnd() * FUNNELS.length)];
  cylY(g, 1.5 * s1, 1.8 * s1, 6 * s1, mat(fc, 0.5), 0, by + 4 * s1, az - bl * 0.3, 16); cylY(g, 1.52 * s1, 1.52 * s1, 1.2 * s1, mat(band, 0.5), 0, by + 6.4 * s1, az - bl * 0.3, 16);
  for(const s of [-1, 1]){ const lb = new THREE.Group(); lb.position.set(s * (bw / 2 + 0.6 * s1), dk + 6.2 * s1, az - bl * 0.1); g.add(lb);
    box(lb, 1.6 * s1, 1.0 * s1, 5.5 * s1, mat(0xf26a1e, 0.6), 0, 0, 0); box(lb, 1.4 * s1, 0.4 * s1, 4.5 * s1, mat(0xf2f0ea, 0.5), 0, 0.6 * s1, 0); }
  const fz = H.sheerAt(0.97); rail(g, -fz[0] * 0.7, fz[2] - 2 * s1, fz[0] * 0.7, fz[2] - 2 * s1, dk + 2.2 * s1, 1.0 * s1);
  g.userData.len = len; return g;
}

// ------------------------------------------------------------------ the public kit
const CAR_KINDS = Object.keys(CARS), CAR_WEIGHT = {saloon: 3, hatch: 4, estate: 2, mini: 1.5, suv: 1.2, sports: 0.6, taxi: 0};
function pickCar(){ const tot = CAR_KINDS.reduce((s, k) => s + CAR_WEIGHT[k], 0); let x = rnd() * tot; for(const k of CAR_KINDS){ x -= CAR_WEIGHT[k]; if(x <= 0) return k; } return 'hatch'; }
const q = c => (c >>> 0).toString(16);
window.SODOR_VEH = {
  car: (color, kind = pickCar()) => cached(`car_${kind}_${q(color)}`, () => buildCar(kind, kind === 'taxi' ? 0x1a1a1c : color)),
  taxi: () => cached('car_taxi', () => buildCar('taxi', 0x1a1a1c)),
  van: color => cached(`van_${q(color)}`, () => buildVan(color)),
  bus: color => cached(`bus_${q(color)}`, () => buildBus(color)),
  decker: color => cached(`decker_${q(color)}`, () => buildDecker(color)),
  lorry: (color, artic, kind = LORRY_BODIES[Math.floor(rnd() * LORRY_BODIES.length)]) => cached(`lorry_${q(color)}_${artic ? 1 : 0}_${kind}`, () => buildLorry(color, artic, kind)),
  tractor: color => cached(`tractor_${q(color)}`, () => buildTractor(color)),
  trailer: () => cached('trailer', buildTrailer),
  boat: (kind, color, len) => { len = Math.round(len || (kind === 'yacht' ? 10 : kind === 'launch' ? 8 : 13));
    return cached(`boat_${kind}_${q(color)}_${len}`, () => kind === 'yacht' ? buildYacht(len, color) : kind === 'launch' ? buildLaunch(len, color) : buildFishing(len, color)); },
  ship: (len, hullCol, deckCol) => cached(`ship_${Math.round(len)}_${q(hullCol)}_${q(deckCol)}`, () => buildShip(len, hullCol, deckCol)),
  CAR_KINDS,
};
})();
