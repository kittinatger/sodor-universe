// tidmouth.js: Tidmouth, planned from the station outwards, after the Thomas wiki and the TV series.
// Plan (a runs south along the Main Line from the station's zero point, b runs east across it):
//   1. the station: two side platforms under a glazed overall roof (a -6..94), the brick frontage with its
//      clock tower and porte-cochere on the harbour (west) side, the parcels office and goods shed behind,
//      a footbridge and signal gantry at the south throat;
//   2. Tidmouth Sheds on the hill to the south east (built in nwr.js), joined to the Main Line beyond the platforms;
//   3. the city: a paved forecourt with its fountain, the Grand Hotel and Town Hall either side, Station Road
//      running down the hill to Tidmouth Harbour (quay, warehouses, cranes, pier, lighthouse, fishing boats).
// world.js reads window.TIDMOUTH to centre the town on that road and to keep its streets off all of this.
(function(){
'use strict';
const K = window.SODOR_KIT, S = window.SODOR_STD, LM = LINES.main;
if(!K || !S || !LM || !LM.real) return;
const {mat, box, add, cylY, glassMat, canvasTex} = K;
const M = METRE, V3 = THREE.Vector3, PI = Math.PI;
const ROOT = new THREE.Group(); scene.add(ROOT);
const Lm = LM.real.len;
const P0 = realAt(LM, 0, new V3()), T0 = realDir(LM, 0, new V3()); T0.y = 0; T0.normalize();
const N0 = new V3(T0.z, 0, -T0.x);
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ------------------------------------------------------------------ frames
function frame(a){                                         // a point a metres along the Main Line (straight on past the start)
  const p = new V3(), t = new V3();
  if(a >= 0){ const u = Math.min(1, a * M / Lm); realAt(LM, u, p); realDir(LM, u, t); t.y = 0; t.normalize(); }
  else { p.copy(P0).addScaledVector(T0, a * M); t.copy(T0); }
  return {p, t, n: new V3(t.z, 0, -t.x)};
}
// a group at (a, b) beside the Main Line, y = rail level + dy (default: ground), local x across (+east), z along (+south)
function seg(a, b, dy = -0.55, parent = ROOT){
  const f = frame(a), g = new THREE.Group();
  g.position.set(f.p.x + f.n.x * b * M, f.p.y + dy * M, f.p.z + f.n.z * b * M);
  g.rotation.y = Math.atan2(f.t.x, f.t.z); g.scale.setScalar(M); parent.add(g); return g;
}
const W = (a, b) => new V3(P0.x + T0.x * a * M + N0.x * b * M, 0, P0.z + T0.z * a * M + N0.z * b * M);   // straight frame, for the city
function wseg(a, b, y, rot = 0){                                          // a group on the straight frame at world height y (metres)
  const p = W(a, b), g = new THREE.Group(); g.position.set(p.x, y * M, p.z);
  g.rotation.y = Math.atan2(T0.x, T0.z) + rot; g.scale.setScalar(M); ROOT.add(g); return g;
}
const taken = (a, b, r) => { const p = W(a, b); S.taken.push({x: p.x, z: p.z, r: r * M}); K.clearArea(p.x, p.z, r * M); };
const railY = a => frame(a).p.y / M;
function run(a0, a1, step, fn){ for(let a = a0; a < a1 - 0.01; a += step){ const l = Math.min(step, a1 - a); fn(a + l / 2, l + 0.5); } }

// ------------------------------------------------------------------ facade tiles
const TILES = {};
function tile(key, tw, th, draw){
  if(TILES[key]) return TILES[key];
  const px = 32, tex = canvasTex(tw * px, th * px, (g, w, h) => draw(g, w, h, px));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return TILES[key] = {tw, th, m: new THREE.MeshStandardMaterial({map: tex, roughness: 0.9})};
}
function coursing(g, w, h, style, seedv){
  let s = seedv; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  if(style === 'brick'){
    g.fillStyle = '#5b4a40'; g.fillRect(0, 0, w, h);
    for(let row = 0; row < h / 6; row++) for(let k = -1; k < w / 16 + 1; k++){ const v = r(); g.fillStyle = `rgb(${138 + v * 32 | 0},${64 + v * 18 | 0},${48 + v * 12 | 0})`; g.fillRect(k * 16 + (row % 2 ? 8 : 0) + 1, row * 6 + 1, 14, 4); }
  } else {
    g.fillStyle = '#b9b19c'; g.fillRect(0, 0, w, h);
    for(let row = 0; row < h / 16; row++) for(let k = -1; k < w / 40 + 1; k++){ const v = r(); g.fillStyle = `rgb(${212 + v * 18 | 0},${204 + v * 16 | 0},${184 + v * 14 | 0})`; g.fillRect(k * 40 + (row % 2 ? 20 : 0) + 1, row * 16 + 1, 38, 14); }
  }
}
function wallTile(style, kind){
  const th = kind === 'arch' ? 4.4 : 3.4;
  return tile(style + kind, 4, th, (g, w, h, px) => {
    coursing(g, w, h, style, kind === 'arch' ? 5 : 9);
    const trim = style === 'brick' ? '#e6dcc2' : '#f6f0de', gl = g.createLinearGradient(0, 0, 0, h); gl.addColorStop(0, '#4a6072'); gl.addColorStop(1, '#1d2a36');
    if(kind === 'up'){
      const x = 1.2 * px, y = 0.7 * px, ww = 1.6 * px, hh = 2.0 * px;
      g.fillStyle = trim; g.fillRect(x - 5, y - 5, ww + 10, hh + 10); g.fillStyle = gl; g.fillRect(x, y, ww, hh);
      g.fillStyle = trim; g.fillRect(x + ww / 2 - 2, y, 4, hh); g.fillRect(x, y + hh * 0.42, ww, 4); g.fillRect(x - 9, y + hh + 5, ww + 18, 7); g.fillRect(x - 7, y - 12, ww + 14, 7);
    } else if(kind === 'arch'){
      const cx = 2 * px, r = 0.95 * px, y0 = 1.9 * px, y1 = 3.85 * px;
      for(const [rr, col] of [[r + 5, trim], [r, gl]]){ g.fillStyle = col; g.beginPath(); g.moveTo(cx - rr, y1 + (rr > r ? 5 : 0)); g.lineTo(cx - rr, y0); g.arc(cx, y0, rr, PI, 0); g.lineTo(cx + rr, y1 + (rr > r ? 5 : 0)); g.closePath(); g.fill(); }
      g.fillStyle = trim; g.fillRect(cx - 2, y0 - r, 4, y1 - y0 + r); g.fillRect(cx - r, y0 + 6, 2 * r, 4);
      g.fillRect(cx - 7, y0 - r - 12, 14, 12);
      g.fillStyle = style === 'brick' ? '#cfc5ac' : '#e4dcc6'; g.fillRect(0, h - 0.55 * px, w, 0.55 * px);          // plinth
    }
  });
}
function facade(g, w, h, t, x, y, z, ry){
  const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
  for(let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / t.tw, uv.getY(i) * h / t.th);
  const m = new THREE.Mesh(geo, t.m); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m;
}
// a building: coloured body, a ground stage of arched windows and `up` floors of sash windows on the chosen faces
function bld(g, o){
  const {x = 0, z = 0, w, d, y0 = 0, gH = 4.4, up = 2, style = 'brick', faces = 'nsew', cornice = true} = o;
  const h = gH + up * 3.4, body = style === 'brick' ? 0x8a4a38 : 0xd8cfb8, TG = wallTile(style, 'arch'), TU = wallTile(style, 'up');
  box(g, w, h, d, mat(body, 0.9), x, y0 + h / 2, z);
  const F = [['s', w, d / 2 + 0.03, 0, 'z'], ['n', w, -d / 2 - 0.03, PI, 'z'], ['e', d, w / 2 + 0.03, PI / 2, 'x'], ['w', d, -w / 2 - 0.03, -PI / 2, 'x']];
  F.forEach(([k, len, off, ry, ax]) => {
    if(!faces.includes(k === 's' ? 's' : k === 'n' ? 'n' : k === 'e' ? 'e' : 'w')) return;
    const px = ax === 'z' ? x : x + off, pz = ax === 'z' ? z + off : z;
    if(gH) facade(g, len, gH, TG, px, y0 + gH / 2, pz, ry);
    if(up) facade(g, len, up * 3.4, TU, px, y0 + gH + up * 1.7, pz, ry);
  });
  if(cornice){ box(g, w + 0.7, 0.4, d + 0.7, mat(0xd8cfb8, 0.85), x, y0 + h + 0.15, z); box(g, w + 0.5, 0.22, d + 0.5, mat(0xd8cfb8, 0.85), x, y0 + gH + 0.05, z); }
  return y0 + h;
}
const SLATE = 0x474c56, STONE = 0xd8cfb8, GREEN = 0x2f5a3a, CREAM = 0xe8dcc0, IRON = 0x2f3a40;
function roofOn(g, w, d, top, color, x, z, ry = 0, pitch = 0.5){ return S.gable(g, w + 0.8, d + 0.8, top, mat(color, 0.75), x, z, ry, pitch); }
function sign(g, text, w, h, x, y, z, ry, bg = '#2f5a3a', fg = '#f2eedc'){
  const tex = canvasTex(512, Math.max(48, Math.round(512 * h / w)), (c, cw, ch) => { c.fillStyle = bg; c.fillRect(0, 0, cw, ch); c.strokeStyle = fg; c.lineWidth = 5; c.strokeRect(5, 5, cw - 10, ch - 10);
    c.fillStyle = fg; c.font = `bold ${Math.round(ch * 0.62)}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cw / 2, ch / 2 + 2); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map: tex, roughness: 0.6, side: THREE.DoubleSide}));
  m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m;
}
function clockFace(g, x, y, z, ry, r = 1.2){
  const tex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#f4f1e4'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.strokeStyle = '#1c2a30'; c.lineWidth = 6; c.stroke();
    for(let k = 0; k < 12; k++){ const a = k * PI / 6; c.beginPath(); c.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); c.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); c.lineWidth = 4; c.stroke(); }
    c.lineWidth = 7; c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.sin(2.1) * 28, 64 - Math.cos(2.1) * 28); c.stroke(); c.lineWidth = 4; c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.sin(0.3) * 46, 64 - Math.cos(0.3) * 46); c.stroke(); });
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshStandardMaterial({map: tex, roughness: 0.5})); m.position.set(x, y, z); m.rotation.y = ry; g.add(m);
}
const lampPost = (g, x, z, h = 3.6) => { cylY(g, 0.07, 0.1, h, mat(GREEN, 0.6), x, h / 2, z, 6); box(g, 0.38, 0.5, 0.38, mat(0xf2e8c0, 0.3, 0, 'double'), x, h + 0.15, z); box(g, 0.5, 0.08, 0.5, mat(GREEN, 0.6), x, h + 0.46, z); };
const bench = (g, x, z, ry = 0) => { const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = ry; g.add(b); box(b, 1.8, 0.06, 0.5, mat(0x7a5a3a, 0.8), 0, 0.5, 0); box(b, 1.8, 0.45, 0.06, mat(0x7a5a3a, 0.8), 0, 0.78, -0.22); for(const s of [-0.8, 0.8]) box(b, 0.06, 0.5, 0.5, mat(0x2a2a2a, 0.6), s, 0.25, 0); };
const tree = (g, x, z, s = 1) => { cylY(g, 0.18 * s, 0.26 * s, 3 * s, mat(0x5a4030, 0.9), x, 1.5 * s, z, 6); add(g, new THREE.IcosahedronGeometry(2.1 * s, 1), mat(0x4a7c3a, 0.85), x, 4.2 * s, z); add(g, new THREE.IcosahedronGeometry(1.5 * s, 1), mat(0x5a8c44, 0.85), x + 0.8 * s, 5.2 * s, z - 0.4 * s); };
function semaphore(g, x, z, face){
  cylY(g, 0.1, 0.12, 6.5, mat(0xe8e8e2, 0.6), x, 3.25, z, 6); box(g, 0.08, 0.3, 1.4, mat(0xc8201e, 0.5), x + 0.12, 5.8, z + 0.6 * face, 0);
  box(g, 0.09, 0.3, 0.25, mat(0xf2f2f2, 0.5), x + 0.13, 5.8, z + 1.0 * face); cylY(g, 0.1, 0.1, 0.25, mat(0x1a1a1a, 0.6), x, 6.6, z, 6);
}

// ======================================================================= 1. THE STATION
const A0 = -6, A1 = 94, R = 10.6, SPRING = 5.2;
const BRICKR = mat(0x9a4a32, 0.85), SLAB = mat(0xb0aca0, 0.85), IRONM = mat(IRON, 0.5, 0.35);
const GLASS = new THREE.MeshStandardMaterial({color: 0xa8c4d0, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false});
{
  // platforms: 1 on the harbour side (west), 2 on the hill side, each 5.6 m wide; brick faces, slab tops, white coping
  for(const [b, side] of [[-6.8, -1], [6.8, 1]]) run(A0, 116, 10, (a, l) => {
    const g = seg(a, b);
    box(g, 5.6, 1.0, l, BRICKR, 0, 0.5, 0); box(g, 5.7, 0.12, l, SLAB, 0, 1.0, 0);
    box(g, 0.3, 0.03, l, mat(0xf2f2ea, 0.6), -side * 2.45, 1.07, 0); box(g, 0.5, 0.03, l, mat(0xe0b020, 0.6), -side * 2.0, 1.07, 0);
  });
  // the Main Line's two roads run under the roof; the pad beneath the whole station keeps the ground level
  // overall roof: iron ribs, glazed barrel shells, brick side walls, glazed gable ends with their mullions
  run(A0, A1, 10, (a, l) => {
    const g = seg(a, 0);
    add(g, new THREE.CylinderGeometry(R, R, l, 24, 1, true, -PI / 2, PI).rotateX(-PI / 2), GLASS, 0, SPRING, 0);
    for(const k of [-3, -1.5, 0, 1.5, 3]) box(g, 0.1, 0.1, l, IRONM, 0, SPRING + Math.sqrt(R * R - (k * 3.2) ** 2) * 1 + 0.05, 0);
    box(g, 4.4, 0.9, l, mat(0x2c4a34, 0.7), 0, SPRING + R + 0.35, 0);                       // ridge lantern
    box(g, 0.1, 0.6, l, GLASS, 2.2, SPRING + R + 0.4, 0); box(g, 0.1, 0.6, l, GLASS, -2.2, SPRING + R + 0.4, 0);
    for(const s of [-1, 1]){
      box(g, 0.7, SPRING, l, mat(0x8a4a38, 0.9), s * (R + 0.35), SPRING / 2, 0);                       // side walls
      box(g, 1.0, 0.4, l, mat(STONE, 0.85), s * (R + 0.35), SPRING + 0.1, 0);
      for(let q = -3; q <= 3; q += 3) if(Math.abs(q) < l / 2) box(g, 0.1, 2.4, 1.6, GLASS, s * (R - 0.02), 3.2, q);
    }
  });
  for(let k = 0; k <= 10; k++){ const g = seg(A0 + k * 10, 0); add(g, new THREE.TorusGeometry(R, 0.22, 6, 26, PI), IRONM, 0, SPRING, 0); for(const s of [-1, 1]) box(g, 0.5, SPRING, 0.5, IRONM, s * R, SPRING / 2, 0); }
  // outer face of the hill-side wall in brick with arched windows
  run(A0, A1, 10, (a, l) => { const g = seg(a, R + 0.75); facade(g, l, 4.4, wallTile('brick', 'arch'), 0.02, 2.2, 0, PI / 2); });
  for(const [a, ry] of [[A0, PI], [A1, 0]]){                                   // glazed gable ends
    const g = seg(a, 0), o = ry ? 0.05 : -0.05;
    add(g, new THREE.CircleGeometry(R, 26, 0, PI), GLASS, 0, SPRING, o);
    for(let x = -R + 3.5; x < R - 1; x += 3.5){ const hh = Math.sqrt(R * R - x * x); box(g, 0.12, hh, 0.14, IRONM, x, SPRING + hh / 2, o); }
    box(g, 2 * R, 0.14, 0.14, IRONM, 0, SPRING + 4.6, o); add(g, new THREE.TorusGeometry(R - 0.1, 0.16, 5, 26, PI), IRONM, 0, SPRING, o);
    sign(g, 'TIDMOUTH', 8.6, 1.0, 0, SPRING + 2.0, o * 2, 0); sign(g, 'TIDMOUTH', 8.6, 1.0, 0, SPRING + 2.0, -o * 2, 0);
  }

  // on the platforms: numbered signs, nameboards, benches, clocks, hanging lamps, a refreshment kiosk
  for(const [b, no, side] of [[-6.8, 1, -1], [6.8, 2, 1]]){
    for(const a of [12, 44, 76]){
      const g = seg(a, b); bench(g, side * 0.4, 0, PI / 2); bench(g, side * 0.4, 5, PI / 2);
      cylY(g, 0.06, 0.06, 4.2, IRONM, -side * 2.1, 3.1, 0, 6);
      add(g, new THREE.CylinderGeometry(0.5, 0.5, 0.08, 20).rotateX(PI / 2), mat(0xeee9d8, 0.5), -side * 2.1, 5.0, 0.0);
      for(const rot of [PI / 2, -PI / 2]) clockFace(g, -side * 2.1 + (rot > 0 ? 0 : 0), 5.0, 0.07 * (rot > 0 ? 1 : -1), rot > 0 ? 0 : PI, 0.46);
      sign(g, String(no), 0.9, 0.9, -side * 2.1, 2.7, 0.5, side * PI / 2, '#eee9d8', '#1f5c34');
    }
    for(const a of [18, 38, 58, 78]){ const g = seg(a, b); cylY(g, 0.04, 0.04, 2.2, IRONM, -side * 1.9, SPRING + 7.2, 0, 4); box(g, 0.4, 0.4, 0.4, mat(0xf2e8c0, 0.3, 0, 'double'), -side * 1.9, SPRING + 6.0, 0); }
    [24, 74].forEach(a => { const g = seg(a, b); sign(g, 'TIDMOUTH', 3.4, 0.7, side * 1.4, 2.4, 0, side * PI / 2, '#2f5a3a'); for(const s of [-1.5, 1.5]) box(g, 0.1, 2.0, 0.1, mat(GREEN, 0.6), side * 1.4, 1.1, s); });
  }
  { const g = seg(88, 6.8); box(g, 2.4, 2.6, 4, mat(0x8a4a38, 0.85), 1.2, 1.3, 0); box(g, 2.6, 0.2, 4.2, mat(SLATE, 0.7), 1.2, 2.7, 0); box(g, 0.1, 1.0, 3, glassMat(), -0.02, 1.6, 0); sign(g, 'TEA', 1.4, 0.4, 0.05, 2.35, 0, -PI / 2, '#c8201e'); }
  // beyond the roof: platform canopies, ramps, the footbridge, the signal gantry
  for(const [b, side] of [[-6.8, -1], [6.8, 1]]){
    run(94, 110, 8, (a, l) => { const g = seg(a, b); box(g, 4.6, 0.2, l, mat(0x5a5f66, 0.7), 0, 4.2, 0); box(g, 0.08, 0.5, l, mat(GREEN, 0.6), -side * 2.3, 3.9, 0); for(const s of [-1, 1]) cylY(g, 0.12, 0.12, 3.8, mat(GREEN, 0.6), side * 1.5, 2.1, s * l / 2 - s * 0.4, 8); });
    const r = seg(118, b); const rp = box(r, 5.6, 0.12, 6, SLAB, 0, 0.55, 0); rp.rotation.x = 0.17;
  }
  {
    const g = seg(104, 0);
    for(const s of [-1, 1]){
      bld(g, {x: s * 6.8, z: 0, w: 3.6, d: 4.6, gH: 0, up: 2, faces: s > 0 ? 'ns' + 'w' : 'nse', style: 'brick', cornice: false});
      roofOn(g, 3.6, 4.6, 6.8, SLATE, s * 6.8, 0, 0, 0.5);
      box(g, 1.4, 2.2, 0.12, mat(0x3a2a24, 0.8), s * 6.8, 1.1, 2.35);
    }
    box(g, 14.6, 2.6, 2.4, mat(0x5a7a8a, 0.75), 0, 7.2, 0); box(g, 14.8, 0.3, 2.8, mat(0x30333a, 0.7), 0, 8.65, 0);
    for(let x = -6; x <= 6; x += 2) for(const s of [-1, 1]) box(g, 1.3, 1.1, 0.1, GLASS, x, 7.5, s * 1.22);
    box(g, 14.6, 0.5, 2.4, mat(GREEN, 0.6), 0, 5.9, 0);
  }
  {
    const g = seg(126, 0);                                                              // signal gantry over the two roads
    for(const s of [-1, 1]) for(const t of [-0.4, 0.4]) box(g, 0.2, 8.2, 0.2, IRONM, s * 9.2 + t, 4.1, 0);
    box(g, 19.2, 0.5, 0.7, IRONM, 0, 7.9, 0); box(g, 19.2, 0.08, 0.7, IRONM, 0, 8.3, 0);
    for(let x = -9; x < 9; x += 1.2) box(g, 0.08, 0.6, 0.08, IRONM, x, 8.0, 0.25);
    for(const x of [-2.4, 1.0]){ cylY(g, 0.07, 0.07, 3.4, mat(0xe8e8e2, 0.6), x, 9.4, 0, 6); box(g, 0.08, 0.3, 1.3, mat(0xc8201e, 0.5), x + 0.15, 10.6, 0.6); cylY(g, 0.12, 0.12, 0.3, mat(0x1a1a1a, 0.6), x, 10.9, 0, 6); }
    for(const x of [-8, 8]){ box(g, 0.5, 0.9, 0.5, mat(0x1a1a1a, 0.6), x, 1.0, 1.6); box(g, 0.2, 0.2, 0.1, mat(0xd8201e, 0.4), x, 1.3, 1.9); }
  }

  // ---- the frontage on the harbour side: wings, end pavilions and the central clock tower
  const FZ = -17.2, FW = 12;
  run(A0, 30, 12, (a, l) => { const g = seg(a, FZ); bld(g, {w: FW, d: l, up: 2, faces: 'w', cornice: true}); roofOn(g, FW, l, 4.4 + 6.8 + 0.4, SLATE, 0, 0, 0, 0.38); });
  run(58, A1, 12, (a, l) => { const g = seg(a, FZ); bld(g, {w: FW, d: l, up: 2, faces: 'w', cornice: true}); roofOn(g, FW, l, 4.4 + 6.8 + 0.4, SLATE, 0, 0, 0, 0.38); });
  for(const a of [A0 + 5.5, A1 - 5.5]){                                              // end pavilions, taller, with mansard caps
    const g = seg(a, FZ - 0.4); const top = bld(g, {w: 13, d: 12, up: 3, faces: 'swen'}); box(g, 11.5, 2.4, 10.5, mat(SLATE, 0.75), 0, top + 1.4, 0); box(g, 8, 1.2, 7, mat(SLATE, 0.75), 0, top + 3.2, 0);
    for(const s of [-1, 1]) box(g, 1.6, 1.8, 0.2, glassMat(), s * 2.6, top + 1.4, -5.3);
    box(g, 0.14, 2.6, 0.14, IRONM, 0, top + 4.8, 0);
  }
  { // the central block and its tower
    const g = seg(44, FZ - 0.4);
    const top = bld(g, {w: 13, d: 28, up: 2, faces: 'we', cornice: true}); roofOn(g, 13, 28, top, SLATE, 0, 0, 0, 0.55);
    const tt = bld(g, {x: -4, z: 0, w: 9, d: 9, y0: 0, gH: 4.4, up: 6, faces: 'swen', cornice: true});
    box(g, 9.8, 0.5, 9.8, mat(STONE, 0.85), -4, tt + 0.25, 0); box(g, 8.2, 4.6, 8.2, mat(0xd8cfb8, 0.85), -4, tt + 2.8, 0);
    for(const [dx, dz, ry] of [[0, 4.15, 0], [0, -4.15, PI], [4.15, 0, PI / 2], [-4.15, 0, -PI / 2]]) clockFace(g, -4 + dx, tt + 2.8, dz, ry, 1.6);
    box(g, 9.0, 0.4, 9.0, mat(STONE, 0.85), -4, tt + 5.3, 0);
    add(g, new THREE.ConeGeometry(6.4, 7.5, 4).rotateY(PI / 4), mat(SLATE, 0.7), -4, tt + 9.2, 0); cylY(g, 0.07, 0.1, 2.8, IRONM, -4, tt + 14, 0, 5);
    for(const [dx, dz] of [[-5.5, -5.5], [5.5, 5.5], [-5.5, 5.5], [5.5, -5.5]]) box(g, 0.9, 1.4, 0.9, mat(STONE, 0.85), -4 + dx * 0.9, tt + 0.9, dz * 0.9);
    // entrance: a tall arched doorway facing the forecourt and the stone name panel
    box(g, 0.3, 3.6, 4.4, mat(0x1d2a36, 0.4), -8.6, 1.8, 0); const arch = add(g, new THREE.CircleGeometry(2.2, 20, 0, PI), mat(0x1d2a36, 0.4, 0, 'double'), -8.7, 3.6, 0); arch.rotation.y = -PI / 2;
    sign(g, 'TIDMOUTH STATION', 10, 1.1, -8.75, 8.2, 0, -PI / 2, '#d8cfb8', '#4a3626');
    // porte-cochere: a glazed iron canopy on slender columns over the carriage drive
    box(g, 6.8, 0.25, 22, mat(0x5a5f66, 0.7), -11.4, 4.6, 0); box(g, 6.6, 0.1, 21.6, GLASS, -11.4, 4.75, 0); box(g, 0.2, 0.7, 22, mat(GREEN, 0.6), -14.7, 4.3, 0);
    for(let z = -10; z <= 10; z += 5) cylY(g, 0.14, 0.17, 4.4, mat(GREEN, 0.6), -14.4, 2.2, z, 8);
  }
  // the hill-side buildings: parcels office, goods shed with its dock
  { const g = seg(16, 16); const top = bld(g, {w: 9, d: 22, up: 1, gH: 4.4, faces: 'swen', style: 'brick'}); roofOn(g, 9, 22, top, SLATE, 0, 0, 0, 0.5); sign(g, 'PARCELS', 4, 0.6, -4.55, 3.3, 0, -PI / 2, '#2f5a3a'); }
  { const g = seg(66, 20); box(g, 12, 6.2, 34, mat(0x8a4a38, 0.9), 0, 3.1, 0); roofOn(g, 12, 34, 6.2, SLATE, 0, 0, 0, 0.5);
    for(const z of [-10, 0, 10]){ box(g, 0.3, 4, 3.6, mat(0x3a2a24, 0.8), -6.1, 2.0, z); const ar = add(g, new THREE.CircleGeometry(1.8, 14, 0, PI), mat(0x3a2a24, 0.8, 0, 'double'), -6.16, 4, z); ar.rotation.y = -PI / 2; }
    box(g, 2.6, 1.2, 34, mat(0x9a8a72, 0.9), -7.6, 0.6, 0); sign(g, 'GOODS', 4, 0.6, -6.2, 5.2, 0, -PI / 2, '#2f5a3a');
    for(let k = 0; k < 6; k++) box(g, 1.1, 1.0, 1.1, mat(0xa58a5a, 0.9), -7.6, 1.5, -12 + k * 5); }
  // signal box and its steps, by the south throat on the hill side
  { const g = seg(112, 16); box(g, 5.2, 3.2, 4.4, mat(0x8a4a38, 0.9), 0, 1.6, 0); box(g, 5.6, 2.4, 4.8, mat(0xe8e8e2, 0.8), 0, 4.4, 0);
    for(const s of [-1, 1]) box(g, 0.1, 1.4, 4.0, GLASS, s * 2.82, 4.6, 0); box(g, 4.6, 1.4, 0.1, GLASS, 0, 4.6, -2.45); box(g, 4.6, 1.4, 0.1, GLASS, 0, 4.6, 2.45);
    add(g, new THREE.ConeGeometry(4.4, 1.9, 4).rotateY(PI / 4), mat(SLATE, 0.75), 0, 6.6, 0).scale.set(1, 1, 0.9); box(g, 1.2, 2.4, 0.4, mat(0x3a2a24, 0.8), -2.4, 1.2, 2.5); }
  // lamps along the hill side; buffer stop plates at the throats are the lines' own
  [10, 34, 58, 82].forEach(a => lampPost(seg(a, 12.4), 0, 0, 4.2));
  taken(-6, -4, 34); taken(24, -4, 34); taken(54, -4, 34); taken(86, -4, 34); taken(112, 0, 30);
}

// ======================================================================= 2. THE CITY'S HEART: forecourt, hotel, town hall
const FORE = {a: 44, b: -48};
{
  // the paved forecourt, level with the platforms along the station frontage, in pieces that follow the rail
  const paving = tile('paving', 2.4, 2.4, (g, w, h) => { g.fillStyle = '#9a9488'; g.fillRect(0, 0, w, h); for(let y = 0; y < 4; y++) for(let x = 0; x < 4; x++){ const v = rnd(); g.fillStyle = `rgb(${176 + v * 26 | 0},${170 + v * 24 | 0},${156 + v * 20 | 0})`; g.fillRect(x * w / 4 + 2, y * h / 4 + 2, w / 4 - 4, h / 4 - 4); } });
  const flat = (g, w, d, t, x, y, z) => { const geo = new THREE.PlaneGeometry(w, d).rotateX(-PI / 2), uv = geo.attributes.uv; for(let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / t.tw, uv.getY(i) * d / t.th); const m = new THREE.Mesh(geo, t.m); m.position.set(x, y, z); g.add(m); return m; };
  run(A0, 106, 10, (a, l) => {
    const g = seg(a, -45.5), sub = 3.5;
    box(g, 43, sub, l, mat(0x6a655a, 0.95), 0, -sub / 2 + 0.02, 0);                       // the made ground under the forecourt
    flat(g, 43, l, paving, 0, 0.05, 0);
    box(g, 1.0, 1.7, l, mat(0xcfc6b2, 0.9), -21.6, 0.85, 0); box(g, 1.5, 0.3, l, mat(0xb8af9c, 0.9), -21.6, 1.8, 0);                       // balustrade wall on the harbour edge
    for(let z = -l / 2 + 1; z < l / 2 - 0.5; z += 2.4) box(g, 0.5, 0.9, 0.5, mat(0xe0d8c4, 0.85), -21.6, 2.1, z);
  });
  // lawns, the fountain, planting, lamps, benches
  { const g = seg(44, -45.5);
    for(const z of [-24, 24]) for(const x of [-13, 2]) box(g, 12, 0.12, 14, mat(0x5f8a45, 0.95), x, 0.1, z);
    cylY(g, 6, 6, 0.9, mat(0xcfc6b2, 0.9), 0, 0.5, 0, 28); cylY(g, 5.3, 5.3, 0.1, mat(0x4a8aa8, 0.15, 0.2), 0, 0.92, 0, 28);
    cylY(g, 0.6, 0.9, 2.2, mat(0xcfc6b2, 0.9), 0, 1.9, 0, 12); cylY(g, 2.1, 0.5, 0.35, mat(0xcfc6b2, 0.9), 0, 3.0, 0, 16); cylY(g, 0.3, 0.45, 1.8, mat(0xcfc6b2, 0.9), 0, 3.4, 0, 10);
    for(let k = 0; k < 8; k++){ const ang = k * PI / 4; add(g, new THREE.ConeGeometry(0.13, 1.8, 5), mat(0xbfe6f4, 0.1, 0, 'double'), Math.cos(ang) * 3.4, 1.9, Math.sin(ang) * 3.4).rotation.set(Math.sin(ang) * 0.5, 0, -Math.cos(ang) * 0.5); }
    [[-6, -34], [-6, -14], [-6, 14], [-6, 34], [-19, -40], [-19, -20], [-19, 0], [-19, 20], [-19, 40], [6, -42], [6, 42]].forEach(([x, z]) => tree(g, x, z, 0.9 + rnd() * 0.3));
    for(let z = -42; z <= 42; z += 14) lampPost(g, 20.8, z, 4.2);
    for(const z of [-30, -20, 20, 30]) bench(g, -4, z, PI / 2);
    // Sodor Roadways bus stands and a taxi rank along the harbour edge
    for(const z of [-30, 6]){ const b = new THREE.Group(); b.position.set(-18.5, 0, z); g.add(b);
      box(b, 2.7, 3.0, 9, mat(0xc8201e, 0.5), 0, 1.7, 0); box(b, 2.74, 1.0, 8.2, GLASS, 0, 2.3, 0); box(b, 2.8, 0.25, 9.1, mat(0xe8e2cf, 0.7), 0, 3.3, 0); for(const s of [-3, 3]) for(const t of [-1.3, 1.3]) cylY(b, 0.45, 0.45, 0.3, mat(0x1a1a1a, 0.8), t, 0.5, s, 10).rotation.z = PI / 2; sign(b, 'SODOR ROADWAYS', 5, 0.4, 1.38, 1.1, 0, PI / 2, '#c8201e', '#f2eedc'); }
    for(const z of [14, 17.5, 21]){ const c = new THREE.Group(); c.position.set(-16.6, 0, z); g.add(c); box(c, 1.8, 0.8, 4.2, mat(0x1a1a1c, 0.4), 0, 0.75, 0); box(c, 1.6, 0.7, 2.2, mat(0x1a1a1c, 0.4), 0, 1.45, -0.2); box(c, 1.62, 0.5, 2.0, GLASS, 0, 1.5, -0.2); for(const s of [-1.3, 1.3]) for(const t of [-0.8, 0.8]) cylY(c, 0.3, 0.3, 0.2, mat(0x111111, 0.8), t, 0.3, s, 8).rotation.z = PI / 2; }
  }
  // the Grand Hotel on the north flank: stone, five storeys, a mansard roof and a pedimented entrance
  { const a = -32, b = -50, y = railY(-6) - 0.55;
    const g = wseg(a, b, y);
    box(g, 38, 3.5, 30, mat(0x6a655a, 0.95), 0, -1.75 + 0.02, 0);
    const top = bld(g, {w: 34, d: 24, up: 4, gH: 4.4, style: 'stone', faces: 'swen'});
    box(g, 32, 2.8, 22, mat(SLATE, 0.75), 0, top + 1.6, 0); box(g, 26, 1.4, 16, mat(SLATE, 0.75), 0, top + 3.8, 0);
    for(let x = -12; x <= 12; x += 6) for(const z of [-6, 6]) { box(g, 1.4, 1.6, 0.6, mat(SLATE, 0.75), x, top + 1.6, z > 0 ? 11.2 : -11.2); }
    for(let x = -14; x <= 14; x += 7) box(g, 1.3, 1.9, 0.5, GLASS, x, top + 1.4, 11.15);
    box(g, 9, 2.6, 1.4, mat(STONE, 0.85), 0, top - 3.6, 12.4); add(g, new THREE.ConeGeometry(5.2, 2.2, 3).rotateX(PI / 2), mat(STONE, 0.85), 0, top - 1.5, 12.5).scale.set(1, 0.5, 0.4);
    for(const x of [-3.6, 3.6]) cylY(g, 0.4, 0.45, 4.4, mat(0xf0e9d6, 0.8), x, 2.2, 13.2, 10); box(g, 9.4, 0.4, 2.2, mat(STONE, 0.85), 0, 4.55, 13.0);
    sign(g, 'GRAND HOTEL', 8, 0.9, 0, 5.4, 13.9, 0, '#2c3a52', '#e8d890'); sign(g, 'TIDMOUTH GRAND HOTEL', 14, 1.0, 0, top + 0.6, 12.1, 0, '#2c3a52', '#e8d890');
    taken(a, b, 24); }
  // the Town Hall on the south flank, with a tall clock tower over its portico
  { const a = 128, b = -50, y = railY(94) - 0.55 + 0.4;
    const g = wseg(a, b, y, PI);
    box(g, 38, 3.5, 28, mat(0x6a655a, 0.95), 0, -1.75 + 0.02, 0);
    const top = bld(g, {w: 34, d: 22, up: 3, gH: 4.4, style: 'stone', faces: 'swen'});
    roofOn(g, 22, 34, top, SLATE, 0, 0, PI / 2, 0.5);
    const t2 = bld(g, {x: 0, z: 8.5, w: 11, d: 9, y0: 0, gH: 4.4, up: 6, style: 'stone', faces: 'swen'});
    box(g, 12, 0.5, 10, mat(STONE, 0.85), 0, t2 + 0.25, 8.5); box(g, 9, 5, 9, mat(STONE, 0.85), 0, t2 + 3.0, 8.5);
    for(const [dx, dz, ry] of [[0, 4.55, 0], [0, -4.55, PI], [4.55, 0, PI / 2], [-4.55, 0, -PI / 2]]) clockFace(g, dx, t2 + 3.0, 8.5 + dz, ry, 1.8);
    add(g, new THREE.ConeGeometry(7, 9, 4).rotateY(PI / 4), mat(0x3a5a48, 0.7, 0.2), 0, t2 + 10, 8.5); cylY(g, 0.08, 0.12, 3, IRONM, 0, t2 + 15.8, 8.5, 5);
    for(let x = -3; x <= 3; x += 2) cylY(g, 0.35, 0.4, 4.4, mat(0xf0e9d6, 0.8), x * 1.2, 2.2, 11.6, 10); box(g, 10, 0.4, 2.4, mat(STONE, 0.85), 0, 4.6, 11.8);
    sign(g, 'TOWN HALL', 9, 0.9, 0, 6.2, 13.1, 0, '#d8cfb8', '#4a3626');
    taken(a, b, 24); }
  // a terrace of shops and a post office closing the forecourt's far ends
  [[-14, -74, 0x8a4a38], [-2, -74, 0xa5805a], [10, -74, 0x7a4a5a], [22, -74, 0x8a4a38]].forEach(([a, b, c], i) => { const g = wseg(a + 0, b, railY(30) - 0.55 - 1.2); g.userData.shop = 1;
    box(g, 11, 2.6, 10, mat(0x6a655a, 0.95), 0, -1.3, 0); const t = bld(g, {w: 10.4, d: 9, up: 2, gH: 4.4, faces: 'swen'}); roofOn(g, 10.4, 9, t, [SLATE, 0x6a4a3a][i % 2], 0, 0, 0, 0.5); });
  taken(FORE.a, FORE.b, 38); taken(-6, -50, 26); taken(130, -50, 26); taken(8, -76, 30);
}

// ======================================================================= 3. TIDMOUTH HARBOUR
const D = (() => { const d = N0.clone().multiplyScalar(-1).addScaledVector(T0, -0.28); d.y = 0; return d.normalize(); })();
const foreW = W(FORE.a, -78);
let shoreR = 0;
for(let r = 40; r < 1800; r += 6){ if(heightAt(foreW.x + D.x * r * M, foreW.z + D.z * r * M) < 0.3 * M){ shoreR = r; break; } }
const QP = foreW.clone().addScaledVector(D, shoreR * M);
{
  const Gq = new THREE.Group(); ROOT.add(Gq);
  const yaw = Math.atan2(D.x, D.z), base = Math.max(1.6 * M, heightAt(QP.x - D.x * 20 * M, QP.z - D.z * 20 * M) + 0.4 * M);
  Gq.position.set(QP.x, base, QP.z); Gq.rotation.y = yaw; Gq.scale.setScalar(M);
  const by = base / M, QS = mat(0x8a857a, 0.9), sea = -by;
  box(Gq, 180, by + 4, 38, QS, 0, -(by + 4) / 2 + 0.02, -17);                               // the quay
  box(Gq, 180, 1.2, 0.8, mat(0xa39f95, 0.9), 0, 0.5, 2.1);                                   // coping along the edge
  for(let x = -80; x <= 80; x += 8){ cylY(Gq, 0.28, 0.3, 0.9, mat(0x2a2c30, 0.6), x, 0.5, 1.2, 8); }
  for(let x = -84; x <= 84; x += 12) box(Gq, 0.3, by + 2, 0.5, mat(0x6a5a3a, 0.9), x, -(by + 2) / 2 + 0.3, 2.6);   // fender piles
  // warehouses along the back of the quay, with hoist doors
  const WALL = mat(0x8a4a38, 0.9);
  for(const [x, w] of [[-62, 30], [-24, 34], [58, 36]]){
    box(Gq, w, 8, 14, WALL, x, 4, -28); roofOn(Gq, 14, w, 8, SLATE, x, -28, PI / 2, 0.45);
    for(let k = -w / 2 + 4; k < w / 2 - 2; k += 7){ box(Gq, 3.2, 4.4, 0.2, mat(0x3a2a24, 0.8), x + k, 2.4, -20.9); box(Gq, 1.4, 1.2, 0.2, GLASS, x + k, 6.6, -20.9); }
    box(Gq, w - 2, 0.4, 3, mat(0x4a4f58, 0.7), x, 5.4, -19.8);
  }
  // the Customs House with its clock, at the head of Harbour Road
  { const g = new THREE.Group(); g.position.set(10, 0, -20); Gq.add(g);
    const top = bld(g, {w: 22, d: 14, up: 2, gH: 4.4, style: 'stone', faces: 'swen'}); roofOn(g, 14, 22, top, SLATE, 0, 0, PI / 2, 0.5);
    const tt = bld(g, {x: 0, z: 2, w: 6, d: 6, up: 5, gH: 4.4, style: 'stone', faces: 'swen'}); clockFace(g, 0, tt - 1.8, 5.07, 0, 1.2); add(g, new THREE.ConeGeometry(4.6, 5, 4).rotateY(PI / 4), mat(0x3a5a48, 0.7, 0.2), 0, tt + 2.5, 2);
    sign(g, 'CUSTOMS HOUSE', 8, 0.8, 0, 6.4, 7.1, 0, '#d8cfb8', '#4a3626'); }
  // portal cranes on the quay edge, crates, barrels, bollards
  for(const x of [-44, 38]){
    const g = new THREE.Group(); g.position.set(x, 0, -4); Gq.add(g);
    for(const s of [-1, 1]) for(const t of [-1, 1]) box(g, 0.4, 7.5, 0.4, mat(0xc8201e, 0.55), s * 3.2, 3.75, t * 2.2);
    box(g, 7.6, 0.7, 5.4, mat(0xc8201e, 0.55), 0, 7.6, 0); box(g, 2.2, 2.4, 2.2, mat(0xe8e2cf, 0.7), 2.4, 9, 0);
    const jib = box(g, 0.6, 0.6, 16, mat(0xc8201e, 0.55), 0, 10.2, 5); jib.rotation.x = -0.12; box(g, 0.05, 6, 0.05, mat(0x2a2a2a, 0.6), 0, 7.2, 12);
  }
  for(let k = 0; k < 18; k++) box(Gq, 1.4, 1.2 + (k % 3) * 0.4, 1.4, mat([0xa58a5a, 0x7a6048, 0x6f8a9a][k % 3], 0.9), -30 + (k % 6) * 1.6, 0.6, -8 - Math.floor(k / 6) * 1.7);
  for(let k = 0; k < 8; k++) cylY(Gq, 0.45, 0.45, 1.0, mat(0x5a3a22, 0.8), 54 + (k % 4) * 1.1, 0.5, -7 - Math.floor(k / 4) * 1.1, 10);
  for(let x = -70; x <= 70; x += 20) lampPost(Gq, x, -3.5, 4.4);
  // the pier, its lighthouse and the fishing boats
  const PX = -38, PL = 84;
  box(Gq, 7.4, 0.7, PL, mat(0x7a6a52, 0.9), PX, -0.4, 2 + PL / 2);
  for(let z = 6; z < PL + 2; z += 6) for(const s of [-3.2, 3.2]) cylY(Gq, 0.3, 0.3, by + 4, mat(0x5a4630, 0.9), PX + s, -(by + 4) / 2 - 0.4, z, 8);
  for(let z = 8; z < PL; z += 10) lampPost(Gq, PX - 3.4, z + 2, 3.6);
  const LH = [PX, 2 + PL]; cylY(Gq, 3.4, 3.6, 3.2, mat(0x8a857a, 0.9), LH[0], 1.2, LH[1], 14);
  cylY(Gq, 1.6, 2.6, 15, mat(0xf0eee6, 0.75), LH[0], 10.5, LH[1], 16); cylY(Gq, 1.65, 1.65, 1.2, mat(0xc8201e, 0.65), LH[0], 12, LH[1], 16); cylY(Gq, 1.75, 1.75, 1.2, mat(0xc8201e, 0.65), LH[0], 6.8, LH[1], 16);
  cylY(Gq, 2.3, 2.1, 0.4, mat(0x2a2c30, 0.6), LH[0], 18.2, LH[1], 16); cylY(Gq, 1.4, 1.4, 1.8, new THREE.MeshStandardMaterial({color: 0xfff2b0, emissive: 0xffe58a, emissiveIntensity: 0.9, roughness: 0.3}), LH[0], 19.3, LH[1], 12);
  add(Gq, new THREE.ConeGeometry(2.0, 1.6, 12), mat(0xc8201e, 0.6), LH[0], 21.0, LH[1]);
  [[PX + 8.5, 22, 0xe8e2cf, 0x2f5a3a], [PX + 8.5, 52, 0x1e5a7a, 0xe8e2cf], [PX - 8.5, 34, 0xc8201e, 0xe8e2cf], [PX - 8.5, 64, 0x2f5a3a, 0xe8e2cf], [PX + 22, 40, 0xe8e2cf, 0x1e3a5a]].forEach(([x, z, hull, cab], i) => {
    const bt = new THREE.Group(); bt.position.set(x, sea + 0.25, z); bt.rotation.y = (i % 2 ? 0.08 : -0.06); Gq.add(bt);
    box(bt, 3.2, 1.4, 10, mat(hull, 0.6), 0, 0.6, 0); add(bt, new THREE.ConeGeometry(1.6, 3.4, 4).rotateX(PI / 2).rotateY(PI / 4), mat(hull, 0.6), 0, 0.6, 6.4).scale.set(1, 0.42, 1);
    box(bt, 3.3, 0.25, 10.2, mat(0xe8e2cf, 0.7), 0, 1.4, 0); box(bt, 2.3, 1.8, 3, mat(cab, 0.65), 0, 2.3, -1.6); box(bt, 2.4, 0.5, 2.2, GLASS, 0, 2.7, -0.4);
    cylY(bt, 0.1, 0.12, 5, mat(0x5a4630, 0.9), 0, 3.4, 1.8, 6); cylY(bt, 0.05, 0.05, 3, mat(0x5a4630, 0.9), 0, 3.8, -1.8, 5);
  });
  window.TIDMOUTH = window.TIDMOUTH || {};
  Object.assign(window.TIDMOUTH, {quay: Gq.position.clone(), quayDir: D});
  K.clearArea(QP.x, QP.z, 110 * M); S.taken.push({x: QP.x, z: QP.z, r: 90 * M});
}

// ------------------------------------------------------------------ hand-over to world.js
// the town sits on the hillside between the forecourt and the harbour; its station road starts below the forecourt wall
const centre = foreW.clone().addScaledVector(D, Math.max(150, shoreR * 0.42) * M);
window.TIDMOUTH = Object.assign(window.TIDMOUTH || {}, {fore: foreW.clone(), centre, shoreR, W, N0, T0});
S.bakeVC(ROOT);
console.log('tidmouth.js built, harbour at ' + shoreR + ' m');
})();
