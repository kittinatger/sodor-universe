// crew.js: the island's named road, air and sea characters, each doing the job they do in the series.
//   Road: Bertie runs the bus service along Thomas' Branch Line; Bulgy, now a green vegetable bus, sells
//   produce in the villages along Duck's line; Butch, the Search and Rescue Team's breakdown lorry, goes out
//   to breakdowns; Elizabeth delivers round Knapford, Crosby and Wellsworth; Max and Monty haul stone for the
//   Sodor Construction Company; Terence ploughs Farmer Finney's field by Thomas' branch; Trevor works the
//   Wellsworth Vicarage Orchard; George rolls the road by the Skarloey Railway.
//   Air: Harold patrols the skies from his hangar at the Search and Rescue Centre; Jeremy flies from Sodor
//   Airport, south-east of Maron. Sea: Captain, the lifeboat, patrols off the Centre; Skiff gives railboat
//   tours round Arlesburgh Harbour. Bulstrode, his barging days over, is a children's play boat on a beach.
// Loaded after vehicles.js and before world.js, so the airport, orchard, field and beach claim their ground
// before the towns and trees are laid out; everything else starts on the first frame after life.js.
(function(){
'use strict';
const K = window.SODOR_KIT, S = window.SODOR_STD, VEH = window.SODOR_VEH;
if(!K || !S) return;
const {mat, add, box, cylX, cylY, cylZ, glassMat} = K;
const M = METRE, V3 = THREE.Vector3, PI = Math.PI, TAU = PI * 2;
const H = (x, z) => heightAt(x, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const rngOf = seed => { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const stn = name => STATIONS.find(s => s.name === name);
const angWrap = a => { while(a > PI) a -= TAU; while(a < -PI) a += TAU; return a; };

// ================================================================== ground claimed before the towns
// Sodor Airport, south-east of Maron on the Sam Wilkinson map (the flattest strip there runs 150 degrees).
const AP = (() => {
  const c0 = mapToWorld(464.8, 586.6), a = 150 * PI / 180, L = 1400 * M, WID = 45 * M;
  const t = new V3(Math.sin(a), 0, Math.cos(a)), n = new V3(t.z, 0, -t.x), c = new V3(c0.x, 0, c0.z);
  const at = (s, q) => c.clone().addScaledVector(t, s * M).addScaledVector(n, q * M);
  // the terminal side: the one away from the railway
  let side = 1, best = -1;
  for(const sd of [1, -1]){ let ok = 0; for(let s = -600; s <= 600; s += 100){ const p = at(s, sd * 200); if(!K.nearTrack(p.x, p.z, 90 * M) && H(p.x, p.z) > 3 * M) ok++; } if(ok > best){ best = ok; side = sd; } }
  for(let s = -L / M / 2 - 250; s <= L / M / 2 + 250; s += 90){ const p = at(s, 0); K.clearArea(p.x, p.z, 95 * M); const q = at(s, side * 80); K.clearArea(q.x, q.z, 60 * M); }
  for(let s = 0; s <= 420; s += 70) for(const q of [150, 230]){ const p = at(s, side * q); K.clearArea(p.x, p.z, 75 * M); }
  return {c, t, n, L, WID, side, at, yaw: Math.atan2(t.x, t.z)};
})();
// A search for a quiet, level patch of ground round a station: dry, away from the track and other stations.
const CLAIMED = [];
function findPatch(name, r0, r1, half, rangeMax){
  const st = stn(name); if(!st) return null;
  let best = null;
  for(let r = r0; r <= r1; r += 150) for(let k = 0; k < 24; k++){
    const a = k / 24 * TAU + r * 0.001, x = st.x + Math.cos(a) * r * M, z = st.z + Math.sin(a) * r * M;
    let lo = Infinity, hi = -Infinity, ok = true;
    for(let i = -2; i <= 2 && ok; i++) for(let j = -2; j <= 2; j++){
      const px = x + i * half * M / 2, pz = z + j * half * M / 2, h = H(px, pz);
      if(h < 2 * M || K.nearTrack(px, pz, 70 * M)){ ok = false; break; }
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if(!ok || hi - lo > rangeMax * M) continue;
    if(STATIONS.some(s => s.kind !== 'closed' && s !== st && Math.hypot(s.x - x, s.z - z) < 700 * M)) continue;
    if(CLAIMED.some(p => Math.hypot(p.x - x, p.z - z) < 500 * M)) continue;
    const sc = (hi - lo) / M + r * 0.004;
    if(!best || sc < best.sc) best = {x, z, sc};
  }
  return best;
}
// Wellsworth Vicarage Orchard, where Trevor lives (just outside the town); Farmer Finney's field by
// Thomas' Branch Line, near Maithwaite, where Terence ploughs.
const ORCHARD = findPatch('Wellsworth', 1500, 2700, 140, 6);
if(ORCHARD){ K.clearArea(ORCHARD.x, ORCHARD.z, 115 * M); CLAIMED.push(ORCHARD); }
const FIELD = findPatch('Maithwaite', 650, 1800, 230, 7);
if(FIELD){ K.clearArea(FIELD.x, FIELD.z, 150 * M); CLAIMED.push(FIELD); }
// a beach near Knapford for Bulstrode: dry sand right at the water's edge, away from the line
const BEACH = (() => {
  const st = stn('Knapford'); if(!st) return null;
  for(let r = 900; r <= 5000; r += 120) for(let k = 0; k < 36; k++){
    const a = k / 36 * TAU, x = st.x + Math.cos(a) * r * M, z = st.z + Math.sin(a) * r * M, h = H(x, z);
    if(h < 0.7 * M || h > 2.6 * M || K.nearTrack(x, z, 120 * M)) continue;
    let sea = null;
    for(let q = 0; q < 12; q++){ const b = q / 12 * TAU, wx = x + Math.cos(b) * 45 * M, wz = z + Math.sin(b) * 45 * M; if(H(wx, wz) < -0.5 * M){ sea = b; break; } }
    if(sea === null) continue;
    return {x, z, yaw: Math.atan2(Math.cos(sea), Math.sin(sea))};
  }
  return null;
})();
if(BEACH) K.clearArea(BEACH.x, BEACH.z, 40 * M);
// the Sodor Construction Company's building site, on the edge of Elsbridge
const SITE = findPatch('Elsbridge', 1000, 2600, 180, 9);
if(SITE){ SITE.ang = 0.3; K.clearArea(SITE.x, SITE.z, 130 * M); CLAIMED.push(SITE); }

// ================================================================== models (metres, front towards +z)
const face = (g, r, f, x, y, z, rotY = 0) => { const me = add(g, new THREE.CircleGeometry(r, 28), K.faceMat(f), x, y, z); me.rotation.y = rotY; return me; };
const BLK = () => mat(0x161616, 0.8), GREY = () => mat(0x8a8d91, 0.55), BRASSM = () => mat(0xc9a23a, 0.3, 0.65), REDM = c => mat(c || 0xb3201c, 0.45);
function wheel(g, r, w, x, y, z, hub, spokes){
  const wg = new THREE.Group(); wg.position.set(x, y, z); g.add(wg);
  cylX(wg, r, r, w, BLK(), 0, 0, 0, 18);
  if(hub) cylX(wg, r * 0.55, r * 0.55, w + 0.02, mat(hub, 0.45), 0, 0, 0, 14);
  if(spokes) for(let k = 0; k < spokes; k++){ const s = box(wg, w + 0.03, r * 1.8, 0.07, mat(hub || 0xb3201c, 0.45), 0, 0, 0); s.rotation.x = k * PI / spokes; }
  return wg;
}
function partsBake(g){ const parts = g.userData.parts || []; parts.forEach(p => { g.remove(p); partsBake(p); }); S.bakeVC(g); parts.forEach(p => g.add(p)); }
function finish(g){ partsBake(g); g.scale.setScalar(M * (g.userData.sc || 1)); scene.add(g); g.traverse(o => { if(o.isMesh) o.castShadow = true; }); return g; }
// Bertie: a red single-decker; Bulgy: a double-decker, green and cream since he became a vegetable bus
function bertieModel(){ const g = VEH.bus(0xc8262b); face(g, 0.58, {smile: 0.75, skin: '#cfd2d4'}, 0, 1.05, 5.64); return g; }
function bulgyModel(){
  const g = VEH.decker(0x3e8a3a); face(g, 0.56, {smile: 0.3, brow: 0.6, skin: '#cfd2d4'}, 0, 1.15, 5.24);
  const crate = mat(0xa0743e, 0.8), veg = [0x3c8a2a, 0xe08a2a, 0xc8262b, 0x6a8a2a];
  for(let k = 0; k < 6; k++){ box(g, 0.9, 0.45, 0.7, crate, (k % 2 ? 0.55 : -0.55), 4.78, -3.3 + Math.floor(k / 2) * 1.5); box(g, 0.8, 0.12, 0.6, mat(veg[k % 4], 0.8), (k % 2 ? 0.55 : -0.55), 5.06, -3.3 + Math.floor(k / 2) * 1.5); }
  return g;
}
// Butch: yellow breakdown lorry with a navy recovery bed and boom
function butchModel(){
  const g = VEH.lorry(0xf2c419, false, 'flatbed'), NAVY = mat(0x1f2f5a, 0.5);
  face(g, 0.55, {smile: 0.6, brow: 0.2, skin: '#cfd2d4'}, 0, 1.25, 5.16);
  box(g, 2.5, 0.3, 5.6, NAVY, 0, 1.45, -1.9);
  const boom = box(g, 0.32, 0.32, 4.2, NAVY, 0, 3.0, -2.6); boom.rotation.x = -0.45;
  box(g, 0.9, 1.2, 0.9, NAVY, 0, 2.1, -0.6); cylY(g, 0.05, 0.05, 1.4, mat(0x333333), 0, 3.2, -4.4, 6); box(g, 0.3, 0.3, 0.12, REDM(), 0, 2.45, -4.4);
  return g;
}
// Elizabeth: a vintage Sentinel steam waggon, cranberry with gold lining and an orange-brown tipper
function sentinelModel(body, lining, load, f){
  const g = new THREE.Group(), CR = mat(body, 0.45), GOLD = mat(lining, 0.35, 0.3);
  box(g, 1.9, 0.25, 6.0, BLK(), 0, 0.75, 0);
  box(g, 2.2, 2.0, 1.8, CR, 0, 1.95, 2.0); box(g, 2.3, 0.12, 2.0, CR, 0, 3.0, 2.0);
  for(const s of [-1, 1]){ add(g, new THREE.PlaneGeometry(0.9, 0.7), glassMat(), s * 1.11, 2.35, 2.1).rotation.y = s * PI / 2; box(g, 0.03, 0.06, 1.7, GOLD, s * 1.115, 1.45, 2.0); }
  add(g, new THREE.PlaneGeometry(1.6, 0.6), glassMat(), 0, 2.45, 2.91);
  box(g, 2.0, 0.05, 0.03, GOLD, 0, 2.05, 2.915);
  face(g, 0.42, f, 0, 1.45, 2.92);
  cylY(g, 0.14, 0.16, 0.9, BLK(), 0.6, 3.45, 1.7, 10); cylY(g, 0.18, 0.15, 0.12, BRASSM(), 0.6, 3.95, 1.7, 10);
  if(load === 'tipper') box(g, 2.2, 0.9, 3.6, mat(0xa0562a, 0.6), 0, 1.45, -1.1);
  else { box(g, 2.2, 0.15, 3.8, CR, 0, 1.0, -1.1); for(const s of [-1, 1]) box(g, 0.06, 0.4, 3.8, CR, s * 1.08, 1.25, -1.1);
    for(let k = 0; k < 5; k++) cylZ(g, 0.32, 0.32, 3.5, mat(0x8a8d91, 0.6), -0.7 + (k % 3) * 0.7 + (k > 2 ? 0.35 : 0), 1.42 + (k > 2 ? 0.56 : 0), -1.1, 12); }
  for(const z of [2.0, -1.9]) for(const s of [-1, 1]) wheel(g, 0.52, 0.3, s * 0.95, 0.52, z, lining, 8);
  g.userData.custom = true; g.userData.len = 6;
  return g;
}
const elizabethModel = () => sentinelModel(0x8a1c2e, 0xd4a640, 'tipper', {smile: 0.6, lashes: true, lips: '#a0343c', skin: '#d9d2c8'});
// Max and Monty: vermilion dump trucks with grey dumpers
function dumpModel(silverCap){
  const g = new THREE.Group(), RD = mat(0xd23a1e, 0.45), GR = mat(0x8a8d91, 0.6);
  box(g, 2.0, 0.35, 6.4, BLK(), 0, 0.85, 0);
  box(g, 2.4, 1.7, 1.9, RD, 0, 1.95, 2.3); box(g, 2.2, 0.8, 0.9, RD, 0, 1.5, 3.55);
  add(g, new THREE.PlaneGeometry(1.9, 0.7), glassMat(), 0, 2.4, 3.26);
  cylY(g, 0.1, 0.1, 0.12, silverCap ? mat(0xd0d2d6, 0.3, 0.6) : BLK(), 0, 1.96, 3.7, 10);
  face(g, 0.45, {smile: 0.4, brow: 0.5, skin: '#cfd2d4'}, 0, 1.45, 4.01);
  const d = new THREE.Group(); d.position.set(0, 1.2, -0.9); g.add(d);
  box(d, 2.5, 0.15, 4.2, GR, 0, 0.1, 0); for(const s of [-1, 1]) box(d, 0.12, 1.2, 4.2, GR, s * 1.2, 0.7, 0); box(d, 2.5, 1.4, 0.12, GR, 0, 0.75, 2.05); box(d, 2.3, 0.6, 3.8, mat(0x8e8172, 0.95), 0, 0.85, -0.1);
  for(const z of [2.6, -1.4, -2.6]) for(const s of [-1, 1]) wheel(g, 0.6, 0.45, s * 1.0, 0.6, z, 0x8a8d91);
  g.userData.custom = true; g.userData.len = 7.4;
  return g;
}
// Terence: an orange caterpillar tractor with a plough behind
function terenceModel(){
  const g = new THREE.Group(), OR = mat(0xe8731e, 0.45);
  box(g, 1.5, 1.0, 2.2, OR, 0, 1.2, 0.3); box(g, 1.3, 0.8, 1.0, OR, 0, 1.05, 1.5);
  for(const z of [1.0, -0.4]) box(g, 1.52, 0.1, 0.1, BLK(), 0, 1.72, z);
  cylY(g, 0.07, 0.07, 1.0, BLK(), 0.35, 2.1, 1.3, 8);
  box(g, 0.5, 0.12, 0.5, BLK(), 0, 1.95, -0.6); box(g, 0.08, 0.6, 0.08, BLK(), 0, 2.2, -0.1);
  face(g, 0.4, {smile: 0.8, skin: '#d0c6b6'}, 0, 1.05, 2.01);
  for(const s of [-1, 1]){ box(g, 0.45, 0.65, 3.0, BLK(), s * 0.95, 0.33, 0.3); for(let k = 0; k < 5; k++) cylX(g, 0.2, 0.2, 0.47, GREY(), s * 0.95, 0.25, -0.8 + k * 0.55, 10); }
  const pl = new THREE.Group(); pl.position.set(0, 0.25, -1.9); g.add(pl);
  box(pl, 0.12, 0.12, 1.6, GREY(), 0, 0.2, -0.6); for(let k = 0; k < 3; k++){ const b = box(pl, 0.1, 0.5, 0.6, mat(0x5a5d61, 0.4, 0.4), -0.5 + k * 0.5, 0, -0.8 - k * 0.35); b.rotation.y = 0.5; }
  return g;
}
// a traction engine (Trevor) or a steamroller (George): boiler, smokebox, chimney, canopy, big rear wheels
function steamRoadModel(color, roller, faceOpt){
  const g = new THREE.Group(), C = mat(color, 0.45), RL = mat(0xb3201c, 0.45);
  cylZ(g, 0.55, 0.55, 2.4, C, 0, 1.6, 0.2, 20);
  for(const z of [-0.7, 0.2, 1.1]) add(g, new THREE.TorusGeometry(0.56, 0.035, 6, 24), BRASSM(), 0, 1.6, z);
  cylZ(g, 0.58, 0.58, 0.45, BLK(), 0, 1.6, 1.55, 20);
  face(g, 0.45, faceOpt || (roller ? {smile: -0.2, brow: 0.8, thick: true, skin: '#c4c7ca'} : {smile: 0.8, skin: '#c4c7ca'}), 0, 1.6, 1.79);
  cylY(g, 0.13, 0.16, 1.5, BLK(), 0, 2.85, 1.45, 12); cylY(g, 0.2, 0.14, 0.18, BRASSM(), 0, 3.65, 1.45, 12);
  box(g, 1.3, 1.5, 1.0, C, 0, 1.45, -1.3); box(g, 1.32, 0.05, 1.02, RL, 0, 2.2, -1.3);
  for(const [x, z] of [[-0.6, -1.7], [0.6, -1.7], [-0.6, 0.9], [0.6, 0.9]]) box(g, 0.06, 1.4, 0.06, BLK(), x, 2.9, z);
  box(g, 1.6, 0.06, 3.0, C, 0, 3.6, -0.4);
  for(const s of [-1, 1]) wheel(g, roller ? 0.95 : 1.0, roller ? 0.55 : 0.35, s * 0.95, roller ? 0.95 : 1.0, -1.25, 0xb3201c, roller ? 0 : 10);
  if(roller){ const fk = new THREE.Group(); fk.position.set(0, 0, 2.15); g.add(fk); cylX(fk, 0.72, 0.72, 1.7, mat(0x2a2c2e, 0.5, 0.4), 0, 0.72, 0, 20); box(fk, 1.9, 0.18, 0.3, RL, 0, 1.55, 0); for(const s of [-1, 1]) box(fk, 0.1, 1.0, 0.25, RL, s * 0.92, 1.1, 0); }
  else for(const s of [-1, 1]) wheel(g, 0.6, 0.25, s * 0.75, 0.6, 1.25, 0xb3201c, 8);
  const fly = new THREE.Group(); fly.position.set(0.8, 2.0, -0.5); g.add(fly);
  cylX(fly, 0.55, 0.55, 0.1, BLK(), 0, 0, 0, 20); for(let k = 0; k < 6; k++){ const s = box(fly, 0.11, 1.0, 0.06, RL, 0, 0, 0); s.rotation.x = k * PI / 6; }
  g.userData.fly = fly; g.userData.parts = [fly]; g.userData.chimney = new V3(0, 3.8, 1.45); g.userData.custom = true;
  return g;
}
// Jeremy: a white jet plane with a blue drop on top of his cockpit
function jeremyModel(){
  const g = new THREE.Group(), WH = mat(0xf2f4f6, 0.35), BL = mat(0x2a6ad8, 0.4), DG = mat(0x6a6e74, 0.4, 0.4), y0 = 3.3;
  cylZ(g, 1.95, 1.95, 22, WH, 0, y0, 0, 22);
  const nose = add(g, new THREE.SphereGeometry(1.95, 22, 14, 0, TAU, 0, PI / 2), WH, 0, y0, 11); nose.rotation.x = PI / 2; nose.scale.set(1, 1.9, 1);
  cylZ(g, 0.45, 1.95, 7, WH, 0, y0 + 0.5, -14.5, 22);
  add(g, new THREE.SphereGeometry(1.0, 12, 8, 0, TAU, 0, PI / 2), BL, 0, y0 + 1.25, 9.6).scale.set(1, 0.5, 2.6);
  add(g, new THREE.PlaneGeometry(2.3, 0.6), glassMat(), 0, y0 + 1.1, 13.0).rotation.x = -0.9;
  for(const s of [-1, 1]){
    for(let k = 0; k < 14; k++) add(g, new THREE.PlaneGeometry(0.32, 0.4), glassMat(), s * 1.96, y0 + 0.55, 8 - k * 1.3).rotation.y = s * PI / 2;
    const wing = box(g, 13, 0.32, 4.2, WH, s * 7.6, y0 - 0.9, -0.5); wing.rotation.y = -s * 0.32;
    cylZ(g, 0.85, 0.75, 3.6, DG, s * 5.4, y0 - 1.9, 1.4, 16); cylZ(g, 0.86, 0.86, 0.3, BL, s * 5.4, y0 - 1.9, 3.1, 16);
    const tp = box(g, 4.6, 0.22, 2.2, WH, s * 2.6, y0 + 0.6, -16.4); tp.rotation.y = -s * 0.3;
    box(g, 0.16, 0.16, 0.16, mat(s > 0 ? 0x1aa040 : 0xc8262b, 0.3), s * 14.0, y0 - 0.85, -2.2);
  }
  const fin = box(g, 0.28, 5.2, 3.6, WH, 0, y0 + 3.4, -16.2); fin.rotation.x = -0.42; box(g, 0.3, 1.6, 2.2, BL, 0, y0 + 4.9, -17.0).rotation.x = -0.42;
  for(const [x, z] of [[0, 9.5], [-2.3, -1.2], [2.3, -1.2]]){ cylY(g, 0.12, 0.12, y0 - 1.2, DG, x, (y0 - 1.2) / 2 + 0.45, z, 8); cylX(g, 0.45, 0.45, 0.35, BLK(), x, 0.45, z, 12); }
  face(g, 1.05, {smile: 0.75, skin: '#e8eaec'}, 0, y0 - 0.25, 14.66);
  return g;
}
// Skiff: a little railboat, his woodwork blue and turquoise, red wheels and a white sail with yellow stripes
function skiffModel(){
  const g = new THREE.Group(), WH = mat(0xf2f0ea, 0.45), BLU = mat(0x2a5aa8, 0.5), TQ = mat(0x2aa0b0, 0.5);
  const hull = add(g, new THREE.CylinderGeometry(0.9, 0.55, 5.2, 12, 1, false, 0, PI), WH, 0, 0.55, 0); hull.rotation.set(PI / 2, 0, PI); hull.material = mat(0xf2f0ea, 0.45, 0, 'double');
  add(g, new THREE.ConeGeometry(0.9, 1.2, 12, 1, false, 0, PI), mat(0xf2f0ea, 0.45, 0, 'double'), 0, 0.55, 3.2).rotation.set(PI / 2, 0, PI);
  box(g, 1.7, 0.12, 5.0, BLU, 0, 0.58, 0); box(g, 1.76, 0.12, 5.1, TQ, 0, 0.7, 0);
  for(const z of [1.8, -1.6]) for(const s of [-1, 1]) wheel(g, 0.32, 0.12, s * 0.86, 0.15, z, 0xc8262b);
  cylY(g, 0.06, 0.07, 5.5, mat(0x7a5a3a, 0.7), 0, 3.4, 0.6, 8);
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, 4.6); sh.lineTo(-2.6, 0.2); sh.closePath();
  const sail = add(g, new THREE.ShapeGeometry(sh), mat(0xf6f4ee, 0.6, 0, 'double'), 0, 1.0, 0.55); sail.rotation.y = PI / 2;
  for(let k = 0; k < 3; k++){ const st = add(g, new THREE.PlaneGeometry(0.06, 2.4 - k * 0.6), mat(0xf2c419, 0.6, 0, 'double'), 0.01, 1.9 + k * 0.4, -0.2 - k * 0.6); st.rotation.y = PI / 2; st.rotation.x = 0.5; }
  face(g, 0.36, {smile: 0.8, skin: '#e2ded4'}, 0, 0.6, 3.62);
  return g;
}
// Bulstrode: a 1920s motor barge, black hull and red keel, light brown deck, cream cab at the stern
function bulstrodeModel(){
  const g = new THREE.Group(), BH = mat(0x1a1a1a, 0.7), RK = mat(0xb3201c, 0.6), DK = mat(0xa8865a, 0.8), CR = mat(0xe9e1c4, 0.55);
  box(g, 5.4, 2.2, 18, BH, 0, 1.1, -1); box(g, 5.4, 2.2, 4.2, BH, 0, 1.1, 9.6);
  box(g, 5.5, 0.35, 22.2, RK, 0, 0.12, 1.0);
  box(g, 5.0, 0.1, 21, DK, 0, 2.22, 0.6); box(g, 3.8, 0.5, 11, mat(0x3a3530, 0.9), 0, 2.0, 2.0);
  box(g, 3.2, 2.3, 3.0, CR, 0, 3.4, -7.8); box(g, 3.5, 0.15, 3.3, mat(0x7a2a1e, 0.6), 0, 4.6, -7.8);
  add(g, new THREE.PlaneGeometry(2.6, 0.8), glassMat(), 0, 3.8, -6.29);
  cylY(g, 0.25, 0.25, 1.6, BH, 0.9, 5.3, -8.4, 10);
  face(g, 0.95, {smile: -0.35, brow: 0.9, thick: true, skin: '#c4c7ca'}, 0, 1.25, 11.71);
  for(let k = 0; k < 4; k++) cylX(g, 0.35, 0.35, 0.3, mat(0x2a2a2a, 0.8), (k % 2 ? 2.85 : -2.85), 1.5, -5 + k * 3, 10);
  return g;
}
// tracks under a digger or a bulldozer
function tracks(g, w, len, col){ for(const s of [-1, 1]){ box(g, 0.6, 0.75, len, BLK(), s * w, 0.38, 0); for(let k = 0; k < 5; k++) cylX(g, 0.2, 0.2, 0.62, mat(col || 0x5a5d61, 0.5), s * w, 0.3, -len / 2 + 0.4 + k * (len - 0.8) / 4, 8); } }
// Jack: a red front loader, white upper cab
function jackModel(){
  const g = new THREE.Group(), R = mat(0xc8262b, 0.45), WH = mat(0xf2f0ea, 0.5);
  box(g, 1.9, 0.9, 3.0, R, 0, 1.05, -0.6); box(g, 1.6, 0.9, 1.4, R, 0, 1.95, 0.1); box(g, 1.6, 0.75, 1.4, WH, 0, 2.78, 0.1); box(g, 1.7, 0.08, 1.5, R, 0, 3.18, 0.1);
  add(g, new THREE.PlaneGeometry(1.3, 0.55), glassMat(), 0, 2.8, 0.81);
  face(g, 0.36, {smile: 0.8, skin: '#d9d2c8'}, 0, 1.95, 0.81);
  for(const z of [0.9, -1.4]) for(const s of [-1, 1]) wheel(g, 0.62, 0.45, s * 1.05, 0.62, z, 0xf2f0ea);
  const arm = new THREE.Group(); arm.position.set(0, 1.35, 0.6); g.add(arm);
  for(const s of [-1, 1]) box(arm, 0.18, 0.25, 2.4, R, s * 0.75, 0, 1.2);
  box(arm, 2.1, 0.75, 0.8, mat(0x8a8d91, 0.5), 0, -0.25, 2.55);
  g.userData.parts = [arm]; g.userData.arm = arm; g.userData.len = 6;
  return g;
}
// an excavator (Alfie, Oliver) or a steam shovel (Ned): the upper works slew, the boom digs
function diggerModel(col, o = {}){
  const g = new THREE.Group(), C = mat(col, 0.45);
  tracks(g, 1.05, 3.6); box(g, 1.6, 0.4, 2.4, GREY(), 0, 0.85, 0); cylY(g, 0.7, 0.7, 0.2, BLK(), 0, 1.1, 0, 14);
  const up = new THREE.Group(); up.position.y = 1.2; g.add(up);
  box(up, 2.4, 1.1, 2.6, C, 0, 0.55, -0.4);
  if(o.panel) box(up, 2.44, 0.6, 1.0, mat(o.panel, 0.5), 0, 0.6, -1.35);
  if(o.steam){ box(up, 2.4, 1.6, 2.6, C, 0, 1.9, -0.4); box(up, 2.6, 0.12, 2.9, mat(0x8a8d91, 0.6), 0, 2.75, -0.4); cylY(up, 0.16, 0.2, 1.6, BLK(), -0.7, 3.4, -1.2, 10);
    face(up, 0.42, o.face || {}, 0, 1.6, 0.92); }
  else { box(up, 1.0, 1.4, 1.2, C, 0.65, 1.25, 0.6); add(up, new THREE.PlaneGeometry(0.8, 0.6), glassMat(), 0.65, 1.6, 1.21); box(up, 1.1, 0.08, 1.3, C, 0.65, 1.98, 0.6);
    if(o.hat) box(up, 1.1, 0.12, 0.25, mat(o.hat, 0.5), 0.65, 1.95, 1.25);
    face(up, 0.33, o.face || {}, 0.65, 0.9, 1.21); }
  const boom = new THREE.Group(); boom.position.set(o.steam ? 0 : -0.4, o.steam ? 0.5 : 0.9, o.steam ? 1.0 : 0.9); up.add(boom);
  const L = o.steam ? 5.2 : 3.4, ba = o.steam ? 0.75 : 0.55;
  box(boom, 0.4, 0.5, L, C, 0, Math.sin(ba) * L / 2, Math.cos(ba) * L / 2).rotation.x = -ba;
  const ex = Math.cos(ba) * L, ey = Math.sin(ba) * L;
  box(boom, 0.3, 0.35, 2.6, C, 0, ey - 1.1, ex + 0.4).rotation.x = 1.25;
  box(boom, 0.95, 0.75, 0.8, mat(o.bucket || 0x8a8d91, 0.5), 0, ey - 2.3, ex + 0.75);
  up.userData.parts = [boom]; g.userData.parts = [up]; g.userData.up = up; g.userData.boom = boom; g.userData.sc = o.sc || 1;
  if(o.steam) g.userData.chimney = new V3(-0.7, 4.4, -1.2);
  return g;
}
// Byron: a yellow bulldozer with a black cab
function byronModel(){
  const g = new THREE.Group(), Y = mat(0xf2c419, 0.45), K2 = mat(0x1a1a1a, 0.5);
  tracks(g, 0.95, 3.2); box(g, 1.7, 0.9, 2.8, Y, 0, 1.15, 0.1);
  box(g, 1.4, 1.2, 1.3, K2, 0, 2.2, -0.6); for(const s of [-1, 1]) add(g, new THREE.PlaneGeometry(1.0, 0.8), glassMat(), s * 0.71, 2.3, -0.6).rotation.y = s * PI / 2;
  add(g, new THREE.PlaneGeometry(1.1, 0.8), glassMat(), 0, 2.3, 0.06); box(g, 1.5, 0.1, 1.4, K2, 0, 2.85, -0.6);
  cylY(g, 0.07, 0.07, 1.0, BLK(), 0.5, 2.1, 1.1, 8);
  face(g, 0.36, {smile: 0.3, brow: 0.4, skin: '#d0c6b6'}, 0, 1.2, 1.51);
  box(g, 2.9, 1.0, 0.25, Y, 0, 0.6, 2.35); for(const s of [-1, 1]) box(g, 0.15, 0.2, 1.1, Y, s * 1.0, 0.75, 1.85);
  g.userData.len = 5;
  return g;
}
// Kelly: a blue and cream mobile crane lorry
function kellyModel(){
  const g = VEH.lorry(0x1f3fa8, false, 'flatbed'), CR = mat(0xe9e1c4, 0.5);
  face(g, 0.55, {smile: 0.5, brow: 0.3, skin: '#cfd2d4'}, 0, 1.25, 5.16);
  const top = new THREE.Group(); top.position.set(0, 1.7, -2.6); g.add(top);
  cylY(top, 0.9, 0.9, 0.4, mat(0x1f3fa8, 0.5), 0, 0.2, 0, 14); box(top, 1.2, 1.0, 1.6, mat(0x1f3fa8, 0.5), 0, 0.9, -0.4);
  const jb = box(top, 0.45, 0.45, 9, CR, 0, 3.0, 3.4); jb.rotation.x = -0.55;
  cylY(top, 0.03, 0.03, 4, BLK(), 0, 3.2, 7.2, 4); box(top, 0.4, 0.4, 0.3, REDM(), 0, 1.2, 7.2);
  S.bakeVC(top); g.userData.top = top; g.userData.len = 9.9;
  return g;
}
// Nelson: a black ballast tractor with a low loader
function nelsonModel(){
  const g = new THREE.Group(), BK = mat(0x1c1c1e, 0.45), CR = mat(0xe9e1c4, 0.5), RD = mat(0xc8262b, 0.45);
  box(g, 2.0, 0.35, 15, BK, 0, 0.8, -2.5);
  box(g, 2.5, 2.0, 2.0, BK, 0, 2.2, 3.6); box(g, 2.2, 1.1, 1.7, BK, 0, 1.5, 5.4); box(g, 2.5, 0.35, 0.2, RD, 0, 0.8, 6.3);
  for(const s of [-1, 1]){ box(g, 0.03, 0.06, 1.9, CR, s * 1.26, 1.5, 3.6); box(g, 0.03, 0.06, 1.9, RD, s * 1.26, 1.38, 3.6); add(g, new THREE.PlaneGeometry(1.2, 0.7), glassMat(), s * 1.26, 2.6, 3.6).rotation.y = s * PI / 2; }
  add(g, new THREE.PlaneGeometry(2.0, 0.7), glassMat(), 0, 2.65, 4.61);
  face(g, 0.48, {smile: 0.6, brow: 0.1, skin: '#cfd2d4'}, 0, 1.5, 6.26);
  box(g, 2.6, 1.0, 1.2, BK, 0, 1.4, 1.6); box(g, 2.7, 0.25, 8.5, BK, 0, 0.75, -4.6); box(g, 2.7, 0.15, 1.6, mat(0x5a5d61, 0.6), 0, 0.6, -9.6);
  for(const z of [5.2]) for(const s of [-1, 1]) wheel(g, 0.55, 0.4, s * 1.05, 0.55, z, 0xc8262b);
  for(const z of [2.4, 1.1]) for(const s of [-1, 1]) wheel(g, 0.55, 0.45, s * 1.05, 0.55, z, 0xc8262b);
  for(const z of [-6.6, -7.6, -8.6]) for(const s of [-1, 1]) wheel(g, 0.4, 0.35, s * 1.15, 0.4, z, 0xc8262b);
  g.userData.custom = true; g.userData.len = 16;
  return g;
}
// Patrick: a cement mixer, purple-brown and cream, his drum always turning
function patrickModel(){
  const g = new THREE.Group(), PB = mat(0x5a2a3a, 0.45), CR = mat(0xe9e1c4, 0.5);
  box(g, 2.0, 0.35, 7.4, BLK(), 0, 0.8, 0);
  box(g, 2.4, 1.0, 1.8, CR, 0, 1.5, 2.8); box(g, 2.4, 0.9, 1.8, PB, 0, 2.45, 2.8); add(g, new THREE.PlaneGeometry(2.0, 0.6), glassMat(), 0, 2.5, 3.71);
  face(g, 0.45, {smile: 0.7, skin: '#cfd2d4'}, 0, 1.45, 3.71);
  const drum = new THREE.Group(); drum.position.set(0, 2.35, -1.1); g.add(drum);
  cylZ(drum, 0.6, 1.25, 1.2, PB, 0, 0, 1.6, 16); cylZ(drum, 1.25, 1.25, 1.6, CR, 0, 0, 0.2, 16); cylZ(drum, 1.25, 0.45, 1.6, PB, 0, 0, -1.4, 16);
  for(let k = 0; k < 3; k++){ const f = box(drum, 0.12, 2.56, 0.12, PB, 0, 0, 0.2); f.rotation.z = k * PI / 3; }
  for(const z of [2.6, -1.6, -2.8]) for(const s of [-1, 1]) wheel(g, 0.55, 0.42, s * 1.05, 0.55, z, 0xe9e1c4);
  g.userData.parts = [drum]; g.userData.drum = drum; g.userData.custom = true; g.userData.len = 7.6;
  return g;
}
function personModel(coat, hat){ const g = new THREE.Group(); cylY(g, 0.2, 0.25, 1.2, mat(coat, 0.8), 0, 0.75, 0, 10); add(g, new THREE.SphereGeometry(0.17, 12, 10), mat(0xe8c4a0, 0.7), 0, 1.5, 0);
  if(hat) add(g, new THREE.SphereGeometry(0.2, 12, 8, 0, TAU, 0, PI / 2), mat(hat, 0.4), 0, 1.58, 0); else add(g, new THREE.SphereGeometry(0.18, 12, 8, 0, TAU, 0, PI / 2), mat(0x8a4a2a, 0.8), 0, 1.55, 0);
  for(const s of [-1, 1]) cylY(g, 0.07, 0.07, 0.7, mat(coat, 0.8), s * 0.27, 0.95, 0, 6); return g; }
function childModel(c){ const g = new THREE.Group(); cylY(g, 0.13, 0.17, 0.5, mat(c, 0.8), 0, 0.35, 0, 8); add(g, new THREE.SphereGeometry(0.13, 10, 8), mat(0xe8b98c, 0.75), 0, 0.75, 0); return g; }

// ================================================================== the working day
const tod = () => ((simTime % 1440) + 1440) % 1440;
const dayIdx = () => ((Math.floor(simTime / 1440) % 7) + 7) % 7;      // 0 is Monday
const shift = (on, off, days = '1111111') => ({on: hm(on), off: hm(off), days});
const onShift = sh => sh.days[dayIdx()] === '1' && tod() >= sh.on && tod() < sh.off;
function nextOn(sh){ const d0 = Math.floor(simTime / 1440); for(let k = 0; k < 9; k++){ const d = d0 + k, t = d * 1440 + sh.on; if(t > simTime && sh.days[((d % 7) + 7) % 7] === '1') return t; } return simTime + 1440; }
const ACTORS = [];
let READY = false, W = null, LIFE = null;

// ------------------------------------------------------------------ roads: a graph of junctions, and routes over it
const SPEED = {M: 24, A: 13, B: 10, street: 8, lane: 6};
const speedOf = rd => (SPEED[rd.cls] || 8) * M;
let NODES = null;
function buildGraph(){
  NODES = [];
  W.roads.forEach(rd => {
    const span = rd.s[rd.s.length - 1], ss = [0, span, ...rd.jn.map(j => j.s)].sort((a, b) => a - b), u = [];
    ss.forEach(s => { if(!u.length || s - u[u.length - 1] > 0.5 * M) u.push(s); });
    rd._ns = u.map(s => { NODES.push({rd, s, e: []}); return NODES.length - 1; });
  });
  const nodeAt = (rd, s) => { let b = rd._ns[0], bd = Infinity; for(const id of rd._ns){ const d = Math.abs(NODES[id].s - s); if(d < bd){ bd = d; b = id; } } return b; };
  W.roads.forEach(rd => {
    const ns = rd._ns, v = speedOf(rd) * (rd.cls === 'lane' ? 0.4 : 1);
    for(let k = 0; k + 1 < ns.length; k++){ const a = ns[k], b = ns[k + 1], c = (NODES[b].s - NODES[a].s) / v; NODES[a].e.push({to: b, c}); NODES[b].e.push({to: a, c}); }
    rd.jn.forEach(j => NODES[nodeAt(rd, j.s)].e.push({to: nodeAt(j.to, j.sTo), c: 5, turn: true}));
  });
  // which roads join up with which: stops are only ever put on the island's main network
  const comp = new Int32Array(NODES.length).fill(-1), size = []; let nc = 0;
  for(let i = 0; i < NODES.length; i++){ if(comp[i] >= 0) continue; let n = 0; const q = [i]; comp[i] = nc;
    while(q.length){ const u = q.pop(); n++; for(const e of NODES[u].e) if(comp[e.to] < 0){ comp[e.to] = nc; q.push(e.to); } }
    size.push(n); nc++; }
  const main = size.indexOf(Math.max(...size));
  W.roads.forEach(rd => { rd._main = comp[rd._ns[0]] === main; });
}
function route(from, to){
  const N = NODES.length, SRC = N, DST = N + 1, dist = new Float64Array(N + 2).fill(Infinity), prev = new Int32Array(N + 2).fill(-1);
  const pt = id => id === SRC ? from : id === DST ? to : NODES[id];
  const extra = id => {                                    // the start and end points join the nodes either side of them on their roads
    const out = [];
    if(id === SRC){ const v = speedOf(from.rd); from.rd._ns.forEach(n => { const d = NODES[n].s - from.s; out.push({to: n, c: Math.abs(d) / v, d}); });
      if(from.rd === to.rd) out.push({to: DST, c: Math.abs(to.s - from.s) / v}); }
    else if(id < N && NODES[id].rd === to.rd) out.push({to: DST, c: Math.abs(to.s - NODES[id].s) / speedOf(to.rd)});
    return out;
  };
  const heap = [], push = (d, id) => { heap.push([d, id]); let i = heap.length - 1; while(i){ const p = (i - 1) >> 1; if(heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if(heap.length){ heap[0] = last; let i = 0; for(;;){ const l = i * 2 + 1, r = l + 1; let m = i; if(l < heap.length && heap[l][0] < heap[m][0]) m = l; if(r < heap.length && heap[r][0] < heap[m][0]) m = r; if(m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  dist[SRC] = 0; push(0, SRC);
  while(heap.length){
    const [d, id] = pop(); if(d > dist[id]) continue; if(id === DST) break;
    const es = id === SRC ? extra(id) : NODES[id].e.concat(extra(id));
    if(id === SRC){ // only the nearest node each way along the start road
      const fw = es.filter(e => e.d > 0).sort((a, b) => a.d - b.d)[0], bw = es.filter(e => e.d <= 0).sort((a, b) => b.d - a.d)[0];
      for(const e of [fw, bw, ...es.filter(e => e.to === DST)]) if(e && d + e.c < dist[e.to]){ dist[e.to] = d + e.c; prev[e.to] = id; push(dist[e.to], e.to); }
      continue;
    }
    for(const e of es) if(d + e.c < dist[e.to]){ dist[e.to] = d + e.c; prev[e.to] = id; push(dist[e.to], e.to); }
  }
  if(!isFinite(dist[DST])) return null;
  const ids = []; for(let id = DST; id !== -1; id = prev[id]) ids.push(id); ids.reverse();
  const legs = []; let cur = null;
  ids.forEach(id => { const p = pt(id); if(cur && cur.rd === p.rd){ cur.s1 = p.s; return; } cur = {rd: p.rd, s0: p.s, s1: p.s}; legs.push(cur); });
  return legs.filter((l, i) => i === legs.length - 1 || Math.abs(l.s1 - l.s0) > 0.1 * M || i === 0);
}
function nearestRoad(x, z, ok){
  let best = null;
  for(const rd of W.roads){ if(ok && !ok(rd)) continue; const p = rd.pts; for(let i = 0; i < p.length; i++){ const d = (p[i].x - x) ** 2 + (p[i].z - z) ** 2; if(!best || d < best.d) best = {rd, s: rd.s[i], d}; } }
  if(best){ const span = best.rd.s[best.rd.s.length - 1]; best.s = clamp(best.s, Math.min(12 * M, span / 2), Math.max(span - 12 * M, span / 2)); }
  return best;
}
const roadOK = rd => rd._main && rd.cls !== 'lane' && rd.cls !== 'M' && rd.s[rd.s.length - 1] > 50 * M && rd._ns && rd._ns.length > 1;
function spotAt(name){
  const t = W.towns.find(t => t.name === name);
  const b = t && (t.busStops || []).find(b => b.rd._main); if(b) return {rd: b.rd, s: b.s, name};
  const p = t || stn(name); if(!p) return null;
  const r = nearestRoad(p.x, p.z, roadOK); return r && {rd: r.rd, s: r.s, name};
}
const spotNear = (x, z, name) => { const r = nearestRoad(x, z, roadOK); return r && {rd: r.rd, s: r.s, name}; };

// ------------------------------------------------------------------ commands a job yields
//   {drive: legs}  {wait: seconds}  {until: sim minute}  {follow: path}  each consumes simulated time
function* goTo(a, spot){
  if(!spot) { yield {wait: 600}; return; }
  const legs = route({rd: a.rd, s: a.s}, spot);
  if(!legs){ a.lost = true; a.status = `Cannot find a road to ${spot.name}`; console.warn('crew.js: no road for', a.name, 'to', spot.name); yield {wait: 900}; return; }
  a.lost = false; yield {drive: legs};
}
function* restUntil(a, sh, home, where){
  if(home && (a.rd !== home.rd || Math.abs(a.s - home.s) > 30 * M)){ a.status = `Going back to ${where}`; yield* goTo(a, home); }
  const t = nextOn(sh); a.status = `Resting at ${where} until ${fmtTime(t)}`; a.parked = true;
  yield {until: t}; a.parked = false;
}
function* serviceJob(a, o){
  const sp_ = s => typeof s === 'string' ? spotAt(s) : s, spots = o.stops.map(sp_).filter(Boolean), home = sp_(o.home) || spots[0], homeName = typeof o.home === 'string' ? o.home : (o.home && o.home.name);
  const seq = o.loop ? spots : spots.concat(spots.slice(1, -1).reverse());
  for(let i = 0; ; i = (i + 1) % seq.length){
    if(!onShift(o.shift)){ yield* restUntil(a, o.shift, home, homeName); i = -1; continue; }
    const sp = seq[i];
    a.status = typeof o.verb === 'function' ? o.verb(sp.name) : `${o.verb || 'On the way to'} ${sp.name}`; yield* goTo(a, sp); if(a.lost) continue;
    const end = i === 0 || i === seq.length - 1 && !o.loop || spots.length < 3;
    a.status = (o.at || (n => `At ${n}`))(sp.name); a.parked = (end ? o.endWait : o.dwell) >= 100;
    yield {wait: end ? o.endWait : o.dwell}; a.parked = false;
  }
}
function step(a, cmd, b){
  if(cmd.wait !== undefined){ if(cmd.left === undefined) cmd.left = cmd.wait; const u = Math.min(b, cmd.left); cmd.left -= u; if(cmd.left <= 1e-6) cmd.done = true; a.v = 0; return b - u; }
  if(cmd.until !== undefined){ a.v = 0; if(simTime >= cmd.until){ cmd.done = true; return b; } return 0; }
  if(cmd.fn){ cmd.fn(); cmd.done = true; return b; }
  if(cmd.drive) return driveStep(a, cmd, b);
  if(cmd.follow) return followStep(a, cmd, b);
  cmd.done = true; return b;
}
// along the roads: cruise for the class of road, slow for the corners, stop at the end; keep a gap to the
// traffic ahead and stop for a train at a level crossing
function driveStep(a, cmd, b){
  const legs = cmd.drive;
  if(cmd.li === undefined){ cmd.li = 0; setRoad(a, legs[0].rd, legs[0].s0, legs[0]); }
  while(b > 1e-6 && cmd.li < legs.length){
    const L = legs[cmd.li], dir = Math.sign(L.s1 - L.s0) || a.dir, last = cmd.li === legs.length - 1;
    a.dir = dir;
    const remain = Math.max(0, (L.s1 - a.s) * dir), cruise = (a.fixedSpeed || speedOf(L.rd) * (a.speedK || 1));
    if(remain < 0.02 * M){ cmd.li++; if(cmd.li < legs.length){ startBlend(a); setRoad(a, legs[cmd.li].rd, legs[cmd.li].s0, legs[cmd.li]); } continue; }
    if(b > 2){ const t = remain / cruise; if(t <= b){ b -= t; a.s = L.s1; a.v = cruise; continue; } a.s += dir * cruise * b; a.v = cruise; b = 0; break; }
    const h = Math.min(b, 0.25), endV = last ? 0 : 4 * M;
    let target = Math.min(cruise, Math.sqrt(endV * endV + 2 * 1.6 * M * Math.max(0, remain - 0.3 * M)));
    if(LIFE.gapAhead && !a.ghost){ const g = LIFE.gapAhead(a); if(g < Infinity) target = Math.min(target, Math.sqrt(2 * 2.2 * M * Math.max(0, g - 3 * M - a.v * 1.2))); }
    if(LIFE.laneBusy){ const c = LIFE.laneBusy(L.rd, a.s, dir); if(c >= 0) target = Math.min(target, Math.sqrt(2 * 2.2 * M * Math.max(0, Math.abs(c - a.s) - 8 * M))); }
    a.v += clamp(target - a.v, -3.5 * M * h, 1.3 * M * h);
    const ds = Math.min(remain, Math.max(0, a.v) * h); a.s += dir * ds; b -= h;
    if(last && remain - ds < 0.05 * M && a.v < 0.6 * M){ a.s = L.s1; cmd.li++; }
  }
  if(cmd.li >= legs.length){ cmd.done = true; a.v = 0; }
  return b;
}
function setRoad(a, rd, s, L){ a.rd = rd; a.s = s; a.fr = {_i: 0}; if(L) a.dir = Math.sign(L.s1 - L.s0) || a.dir; }
function startBlend(a){ a.blend = {x: a.g.position.x, y: a.g.position.y, z: a.g.position.z, yaw: a.g.rotation.y, t: 0, d: 2.2}; }
function poseRoad(a, simDt){
  const fr = LIFE.roadFrame(a.rd, a.s, a.fr); a.fr._i = fr._i;
  const side = a.dir > 0 ? 1 : -1, lane = a.rd.hw * (a.parked ? 0.8 : 0.42) * (a.laneK || 1);
  a.lane = a.rd.hw * 0.42;
  let x = fr.x + fr.nx * lane * side, z = fr.z + fr.nz * lane * side, y = fr.y, yaw = Math.atan2(a.dir * fr.tx, a.dir * fr.tz);
  if(a.blend){ const B = a.blend; B.t += simDt; const k = B.t >= B.d ? 1 : smooth(0, 1, B.t / B.d); const dy = angWrap(yaw - B.yaw);
    x = B.x + (x - B.x) * k; z = B.z + (z - B.z) * k; y = B.y + (y - B.y) * k; yaw = B.yaw + dy * k; if(k >= 1) a.blend = null; }
  a.g.position.set(x, y, z); a.g.rotation.set(0, yaw, 0);
}
// off the roads: along a polyline of world points (with heights), at a speed that may vary along it
function followStep(a, cmd, b){
  const P = cmd.follow;
  if(!P.cum){ P.cum = [0]; for(let i = 1; i < P.pts.length; i++) P.cum.push(P.cum[i - 1] + P.pts[i].distanceTo(P.pts[i - 1])); P.len = P.cum[P.cum.length - 1]; P.d = 0; }
  const spAt = d => { if(!P.sp) return P.speed; let i = 1; while(i < P.cum.length - 1 && P.cum[i] < d) i++; const f = clamp((d - P.cum[i - 1]) / Math.max(1e-9, P.cum[i] - P.cum[i - 1]), 0, 1); return Math.max(0.5 * M, P.sp[i - 1] + (P.sp[i] - P.sp[i - 1]) * f); };
  let n = 0;
  while(b > 1e-6 && P.d < P.len && n++ < 400){ const h = b > 4 ? Math.max(1, b / 150) : Math.min(b, 0.2), v = spAt(P.d); P.d = Math.min(P.len, P.d + v * h); b -= h; a.v = v; }
  placeOn(a, P, P.d);
  if(P.d >= P.len - 1e-9){ cmd.done = true; a.v = 0; }
  return Math.max(0, b);
}
function placeOn(a, P, d){
  let i = 1; while(i < P.cum.length - 1 && P.cum[i] < d) i++;
  const p0 = P.pts[i - 1], p1 = P.pts[i], f = clamp((d - P.cum[i - 1]) / Math.max(1e-9, P.cum[i] - P.cum[i - 1]), 0, 1);
  const x = p0.x + (p1.x - p0.x) * f, z = p0.z + (p1.z - p0.z) * f;
  let y = p0.y + (p1.y - p0.y) * f;
  if(P.ground) y = H(x, z) + (P.lift || 0);
  const dx = p1.x - p0.x, dz = p1.z - p0.z, hl = Math.hypot(dx, dz);
  if(hl > 1e-7 && !P.keepYaw){ const yaw = Math.atan2(dx, dz); a.yawRate = angWrap(yaw - (a.yaw === undefined ? yaw : a.yaw)); a.yaw = yaw; }
  a.pitch = P.pitch ? -Math.atan2(p1.y - p0.y, Math.max(hl, 1e-7)) : 0;
  a.g.position.set(x, y, z);
}

// ================================================================== the characters
function actor(o){
  const a = Object.assign({rd: null, s: 0, dir: 1, v: 0, len: 6 * M, lane: 0, id: 500000 + ACTORS.length, status: 'Getting ready', parked: false}, o);
  a.it = a.job(a); a.cmd = null;
  if(!a.noPick) a.g.traverse(m => { if(m.isMesh){ m.userData.onPick = () => showActor(a); clickable.push(m); } });
  ACTORS.push(a); return a;
}
function showActor(a){
  openPanel(a.kind, a.name, `${a.about} Now: ${a.status}.`, a.meta || '');
  const p = a.g.visible || !a.home ? a.g.position : a.home, d = a.followDist || 0.06;      // away on a flight: show his home instead
  flyTo(p.x, p.y, p.z, a.g.visible ? d : 1.1, undefined, a.g.visible ? 1.08 : 0.8);
  if(!a.g.visible) return;
  const b = addPanelButton(a.air ? 'Follow in the air' : 'Follow', () => { followTrain = {mesh: a.g, dist: d}; b.classList.add('active'); });
}
function roadActor(name, kind, model, start, o){
  const g = model(); if(g.userData.custom) finish(g); else { g.scale.setScalar(M); scene.add(g); g.traverse(m => { if(m.isMesh) m.castShadow = true; }); }
  const a = actor(Object.assign({name, kind, g, len: (g.userData.len || 6) * M}, o));
  if(start){ setRoad(a, start.rd, start.s); poseRoad(a, 0); }
  a.road = true; return a;
}
function init(){
  READY = true; W = window.SODOR_WORLD; LIFE = window.SODOR_LIFE;
  const t0 = performance.now();
  buildGraph();
  if(LIFE.EXTRA) LIFE.EXTRA.length = 0;
  // ---- buses and lorries on the roads
  const branch = ['Knapford', 'Dryaw', 'Toryreck', 'Upper Toryreck', 'Elsbridge', 'Maithwaite', 'Hackenbeck', 'Ffarquhar'];
  roadActor('Bertie', 'Bus', bertieModel, spotAt('Knapford'), {color: 0xc8262b, speedK: 0.9, meta: "Thomas' Branch Line bus service",
    about: "Bertie is the red single-decker bus who works alongside Thomas' Branch Line, carrying passengers between Knapford and Ffarquhar and stopping in every village on the way. He once raced Thomas and lost at a traffic light.",
    job: a => serviceJob(a, {stops: branch, home: 'Knapford', shift: shift('07:00', '19:30'), dwell: 75, endWait: 600})});
  const veg = ['Haultraugh', 'Tidmouth Hault', 'Tidmouth', 'Callan', "Bluff's Cove", 'Arlesburgh West', 'Arlesburgh'];
  roadActor('Bulgy', 'Vegetable bus', bulgyModel, spotAt('Haultraugh'), {color: 0x3e8a3a, speedK: 0.8, meta: "Along Duck's Branch Line",
    about: "Bulgy is the double-decker who once pretended to be a railway bus to steal Duck and Oliver's passengers and was made into a henhouse. Given a second chance, he is now a green mobile vegetable stand selling produce in the villages along Duck's line — vegetables do not lay eggs, and they never complain.",
    job: a => serviceJob(a, {stops: veg, home: 'Haultraugh', loop: true, shift: shift('08:00', '17:00', '1111110'), dwell: 900, endWait: 900, verb: 'Taking vegetables to', at: n => `Selling vegetables at ${n}`})});
  const elz = ['Knapford', 'Crosby', 'Wellsworth', 'Suddery'];
  roadActor('Elizabeth', 'Vintage lorry', elizabethModel, spotAt('Knapford'), {color: 0x8a1c2e, speedK: 0.6, meta: 'Deliveries round Knapford and Wellsworth', chimney: new V3(0.6, 4.0, 1.7),
    about: "Elizabeth is the vintage Sentinel steam lorry who once belonged to Sir Topham Hatt. Found shut up in a shed and restored by Jem Cole, she is in perfect working order and makes deliveries where the engines cannot reach.",
    job: a => serviceJob(a, {stops: elz, home: 'Knapford', shift: shift('07:30', '17:30', '1111110'), dwell: 720, endWait: 900, verb: 'Delivering to', at: n => `Unloading at ${n}`})});
  // Butch: on call at the Search and Rescue Centre
  const rescue = stn('Sodor Search and Rescue Centre'), base = rescue && spotNear(rescue.x, rescue.z, 'the Search and Rescue Centre');
  const calls = ['Maron', 'Wellsworth', 'Cronk', 'Killdane', 'Kellaby', 'Suddery', 'Crosby', 'Kellsthorpe Road', 'Balladrine', 'Brendam Docks', 'Lower Suddery'];
  roadActor('Butch', 'Breakdown lorry', butchModel, base, {color: 0xf2c419, speedK: 1.0, meta: 'Sodor Search and Rescue Team',
    about: 'Butch is the yellow and navy breakdown lorry of the Sodor Search and Rescue Team — the Sodor Heavy Recovery Unit. He tows away broken-down lorries and helps clear up after accidents, and waits on call at the Rescue Centre.',
    job: function*(a){ const sh = shift('07:00', '22:00'), r = rngOf(4471);
      for(;;){ if(!onShift(sh)){ yield* restUntil(a, sh, base, 'the Search and Rescue Centre'); continue; }
        a.status = 'On call at the Search and Rescue Centre'; a.parked = true; yield {wait: 3600 + r() * 7200}; a.parked = false; if(!onShift(sh)) continue;
        const to = spotAt(calls[Math.floor(r() * calls.length)]); if(!to) continue;
        a.status = `Called out to a breakdown at ${to.name}`; a.speedK = 1.15; yield* goTo(a, to); a.speedK = 1.0;
        a.status = `Recovering a broken-down lorry at ${to.name}`; a.parked = true; yield {wait: 1500 + r() * 1200}; a.parked = false;
        a.status = 'Towing it back to the Rescue Centre'; a.speedK = 0.7; yield* goTo(a, base); a.speedK = 1.0; } }});
  // Max and Monty: stone from Ffarquhar Quarry to the Sodor Construction Company's site at Elsbridge
  const quarry = (() => { const q = stn('Anopha Quarry'); return q ? spotNear(q.x, q.z, 'Ffarquhar Quarry') : spotAt('Ffarquhar'); })();
  const SK = buildSite(), site = SK ? SK.gate : spotAt('Elsbridge');
  [['Max', true, 0], ['Monty', false, 1500]].forEach(([nm, cap, off]) => roadActor(nm, 'Dump truck', () => dumpModel(cap), quarry, {color: 0xd23a1e, speedK: 0.8, meta: 'Sodor Construction Company',
    about: `${nm} is one of the twin dump trucks of the Sodor Construction Company, vermilion with a grey dumper. With ${nm === 'Max' ? 'Monty' : 'Max'} he hauls stone from Ffarquhar Quarry to the building site at Elsbridge, usually in too much of a hurry.`,
    job: function*(a){ const sh = shift('07:30', '17:00', '1111100'); yield {wait: off};
      for(;;){ if(!onShift(sh)){ yield* restUntil(a, sh, quarry, 'Ffarquhar Quarry'); continue; }
        a.status = 'Being loaded with stone at Ffarquhar Quarry'; yield {wait: 600};
        a.status = 'Hauling stone to the building site at Elsbridge'; yield* goTo(a, site);
        a.status = 'Tipping stone at the Elsbridge building site'; yield {wait: 300};
        a.status = 'Going back to Ffarquhar Quarry'; yield* goTo(a, quarry); } }}));
  // George: rolling the road by the Skarloey Railway, between Crovan's Gate and Glennock
  georgeAt();
  // ---- off the roads
  terence(); trevor(); harold(); jeremy(); captain(); skiff(); bulstrode();
  if(SK) thePack(SK, quarry);
  steamworks();
  // the roster
  if(S.rosterGroup && S.rosterRow){ S.rosterGroup('Road, air and sea'); ACTORS.filter(a => !a.noRoster).forEach(a => S.rosterRow(a.name, a.kind, a.color, () => showActor(a))); }
  ACTORS.filter(a => a.road && !a.ghost).forEach(a => LIFE.EXTRA && LIFE.EXTRA.push(a));
  console.log(`Crew: ${ACTORS.length} named road, air and sea characters, set up in ${Math.round(performance.now() - t0)} ms`);
}
// ------------------------------------------------------------------ the Sodor Construction Company's site at Elsbridge
function buildSite(){
  if(!SITE) return null;
  const c0 = new V3(SITE.x, 0, SITE.z), t = new V3(Math.sin(SITE.ang), 0, Math.cos(SITE.ang)), n = new V3(t.z, 0, -t.x), yaw = Math.atan2(t.x, t.z);
  const at = (u, v) => c0.clone().addScaledVector(t, u * M).addScaledVector(n, v * M), gy = (u, v) => { const p = at(u, v); return H(p.x, p.z); };
  const sg = new THREE.Group(); scene.add(sg);
  const put = (fn, u, v, rot = 0, sunk = 0.1) => { const b = new THREE.Group(); fn(b); S.bakeVC(b); b.scale.setScalar(M); const p = at(u, v); b.position.set(p.x, gy(u, v) - sunk * M, p.z); b.rotation.y = yaw + rot; sg.add(b); return b; };
  // the bare earth of the site
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.fillStyle = '#8a7458'; x.fillRect(0, 0, 128, 128);
  for(let k = 0; k < 900; k++){ const v = 100 + Math.random() * 60 | 0; x.fillStyle = `rgba(${v + 20},${v},${v - 30},0.5)`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  for(let k = 0; k < 14; k++){ x.strokeStyle = 'rgba(60,45,30,0.35)'; x.lineWidth = 3; x.beginPath(); x.moveTo(Math.random() * 128, 0); x.lineTo(Math.random() * 128, 128); x.stroke(); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(9, 6);
  const NU = 14, NV = 10, LEN = 180, WID = 124, pos = [], uv = [], idx = [];
  for(let i = 0; i <= NU; i++) for(let j = 0; j <= NV; j++){ const u = -LEN / 2 + i * LEN / NU, v = -WID / 2 + j * WID / NV, p = at(u, v); pos.push(p.x, H(p.x, p.z) + 0.1 * M, p.z); uv.push(i / NU, j / NV); }
  for(let i = 0; i < NU; i++) for(let j = 0; j < NV; j++){ const a0 = i * (NV + 1) + j, b0 = a0 + NV + 1; idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const gm = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({map: tex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide})); gm.receiveShadow = true; sg.add(gm);
  // the fence round it, with a gap for the gate
  const OR = mat(0xff7a1a, 0.6, 0, 'double'), PO = mat(0x8a8d91, 0.5);
  const fenceRun = (u0, v0, u1, v1) => { const L = Math.hypot(u1 - u0, v1 - v0), nn = Math.ceil(L / 6);
    for(let k = 0; k < nn; k++){ const f0 = k / nn, f1 = (k + 1) / nn, um = u0 + (u1 - u0) * (f0 + f1) / 2, vm = v0 + (v1 - v0) * (f0 + f1) / 2, rot = Math.atan2(v1 - v0, u1 - u0);
      put(b => { box(b, 0.06, 1.8, L / nn, OR, 0, 0.9, 0); cylY(b, 0.05, 0.05, 2.0, PO, 0, 1.0, L / nn / 2, 6); }, um, vm, rot, 0); } };
  const U = LEN / 2 - 2, V = WID / 2 - 2;
  fenceRun(-U, -V, U, -V); fenceRun(U, -V, U, V); fenceRun(U, V, -U, V); fenceRun(-U, V, -U, 9); fenceRun(-U, -9, -U, -V);
  // the site office: two cabins, one on the other, with steps
  put(b => { box(b, 3.0, 2.8, 9, mat(0x2a5aa8, 0.6), 0, 1.4, 0); box(b, 3.0, 2.8, 9, mat(0x2a5aa8, 0.6), 0, 4.2, 0); for(let k = 0; k < 3; k++) for(const y of [1.6, 4.4]) add(b, new THREE.PlaneGeometry(1.2, 0.9), glassMat(), 1.51, y, -3 + k * 3).rotation.y = PI / 2;
    for(let k = 0; k < 6; k++) box(b, 1.2, 0.15, 0.4, PO, 2.1, 0.4 + k * 0.45, -4 + k * 0.4); }, -70, 44);
  // the new building: a slab, a steel frame two storeys high, the ground-floor walls going up
  put(b => { box(b, 42, 0.5, 34, mat(0xb8b4aa, 0.85), 0, 0.25, 0);
    const ST = mat(0x5a6a7a, 0.5, 0.3);
    for(let i = 0; i <= 4; i++) for(let j = 0; j <= 3; j++) box(b, 0.45, 8.2, 0.45, ST, -20 + i * 10, 4.4, -16 + j * 10.67);
    for(const y of [4.3, 8.4]){ for(let i = 0; i <= 4; i++) box(b, 0.35, 0.5, 32, ST, -20 + i * 10, y, 0); for(let j = 0; j <= 3; j++) box(b, 40, 0.5, 0.35, ST, 0, y, -16 + j * 10.67); }
    box(b, 40, 2.2, 0.4, mat(0x9a4a3a, 0.85), 0, 1.6, -16); box(b, 0.4, 1.4, 32, mat(0x9a4a3a, 0.85), -20, 1.2, 0);
    for(let k = 0; k < 8; k++) box(b, 0.06, 4.2, 0.06, PO, 20.8, 2.6, -15 + k * 4.3); for(const y of [1.4, 3.0, 4.6]) box(b, 0.05, 0.05, 32, PO, 20.8, y, 0);
    for(const y of [1.4, 3.0, 4.6]) box(b, 0.9, 0.06, 32, mat(0x8a6a4a, 0.85), 21.3, y, 0); }, 32, 8);
  // heaps: spoil, gravel, the pipes and the steel beams waiting to go up
  put(b => { add(b, new THREE.ConeGeometry(12, 5.5, 14), mat(0x6a5038, 0.95), 0, 2.4, 0); }, -24, -38, 0, 0.3);
  put(b => { add(b, new THREE.ConeGeometry(8, 3.6, 12), mat(0x9a9890, 0.95), 0, 1.6, 0); }, -50, -12, 0, 0.3);
  put(b => { for(let k = 0; k < 6; k++) cylX(b, 0.6, 0.6, 6, mat(0x9a9a94, 0.7), 0, 0.6 + (k > 2 ? 1.05 : 0), -1.3 + (k % 3) * 1.25 + (k > 2 ? 0.6 : 0), 14); }, -55, 26);
  put(b => { for(let k = 0; k < 8; k++) box(b, 0.4, 0.5, 9, mat(0x5a6a7a, 0.5, 0.3), -1.4 + (k % 4) * 0.9, 0.3 + Math.floor(k / 4) * 0.55, 0); }, 14, -34);
  put(b => { box(b, 16, 0.3, 12, mat(0x4a3a2a, 0.95), 0, -0.1, 0); add(b, new THREE.ConeGeometry(5, 2.6, 10), mat(0x6a5038, 0.95), 0, 1.2, 9); }, 64, -32, 0, 0.2);
  put(b => { box(b, 26, 0.2, 1.8, mat(0x3a2e22, 0.95), 0, 0.05, 0); }, 0, 40, 0, 0.1);
  // the sign at the gate
  const sign = K.canvasTex(512, 160, x2 => { x2.fillStyle = '#f2c419'; x2.fillRect(0, 0, 512, 160); x2.fillStyle = '#1a1a1a'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.font = 'bold 46px Arial'; x2.fillText('SODOR', 256, 48); x2.font = 'bold 40px Arial'; x2.fillText('CONSTRUCTION COMPANY', 256, 108); });
  put(b => { for(const s of [-1, 1]) cylY(b, 0.08, 0.08, 3.2, PO, 0, 1.6, s * 2.2, 6); }, -U - 1, 13, PI / 2);
  { const p = at(-U - 1, 13), m = add(sg, new THREE.PlaneGeometry(4.6 * M, 1.45 * M), new THREE.MeshStandardMaterial({map: sign, roughness: 0.5, side: THREE.DoubleSide}), p.x, gy(-U - 1, 13) + 2.6 * M, p.z); m.rotation.y = yaw + PI; }
  const g0 = at(-U - 30, 0), gate = spotNear(g0.x, g0.z, 'the Sodor Construction Company site at Elsbridge');
  return {at, gy, yaw, t, n, gate};
}
function thePack(SK, quarry){
  const {at, gy, yaw} = SK, sh = shift('07:30', '17:30', '1111100');
  const place = (g, u, v, rot = 0) => { const p = at(u, v); g.position.set(p.x, gy(u, v), p.z); g.rotation.y = yaw + rot; };
  const offDuty = (a, where) => { a.working = false; a.status = `Parked on the site until ${fmtTime(nextOn(sh))}`; return {until: nextOn(sh)}; };
  // the diggers, each at its own work
  const dig = (name, kind, model, u, v, rot, color, about, doing) => { const g = model(); finish(g); place(g, u, v, rot);
    return actor({name, kind, g, color, meta: 'Sodor Construction Company', about, ph: Math.random() * 10, base: 0,
      job: function*(a){ for(;;){ if(!onShift(sh)){ yield offDuty(a); continue; } a.working = true; a.status = doing; yield {wait: 600}; } },
      anim: (a, dt) => { const ud = a.g.userData; a.ph += dt * (a.working ? 1 : 0); const w = a.working ? 1 : 0;
        if(ud.up) ud.up.rotation.y += ((Math.sin(a.ph * 0.55) * 0.9) * w - ud.up.rotation.y) * Math.min(1, dt * 2);
        if(ud.boom) ud.boom.rotation.x += ((Math.sin(a.ph * 1.1) * 0.25 + 0.05) * w - ud.boom.rotation.x) * Math.min(1, dt * 2); }}); };
  dig('Alfie', 'Excavator', () => diggerModel(0x2e8b3a, {sc: 0.8, face: {smile: 0.9, skin: '#d9d2c8'}}), -4, 35, PI / 2, 0x2e8b3a,
    'Alfie is the small green excavator, number 12, of the Sodor Construction Company. He is the smallest of the Pack and the keenest — he is digging the trench for the new drains.', 'Digging the trench for the new drains');
  dig('Oliver', 'Excavator', () => diggerModel(0xb08a5a, {sc: 1.35, panel: 0xa8c49a, hat: 0xf2c419, face: {smile: 0.5, brow: 0.2, skin: '#d9d2c8'}}), 56, -24, -2.2, 0xb08a5a,
    "Oliver is the big pale-brown excavator of the Sodor Construction Company, with the rim of a builder's hat over his cab windows. He is digging out the foundations for the next building.", 'Digging out the foundations');
  const ned = dig('Ned', 'Steam shovel', () => diggerModel(0xa0562a, {steam: true, sc: 1.1, bucket: 0x8a8d91, face: {smile: 0.6, brow: -0.2, skin: '#d0c6b6'}}), -16, -50, -0.4, 0xa0562a,
    'Ned is the orange steam shovel, number 19, of the Sodor Construction Company. Clumsy but willing, he is digging the footings by the spoil heap — and still learning to look where his bucket is going.', 'Digging the footings with his steam shovel');
  ned.steam = true;
  // Kelly lifts the steel beams up onto the frame
  { const g = kellyModel(); g.scale.setScalar(M); scene.add(g); place(g, 20, -24, 0.4);
    actor({name: 'Kelly', kind: 'Mobile crane lorry', g, color: 0x1f3fa8, meta: 'Sodor Construction Company', ph: 0,
      about: 'Kelly is the blue and cream mobile crane lorry, number 17, of the Sodor Construction Company. He is lifting the steel beams up onto the frame of the new building — carefully, since he is afraid of falling over.',
      job: function*(a){ for(;;){ if(!onShift(sh)){ yield offDuty(a); continue; } a.working = true; a.status = 'Lifting steel beams onto the new building'; yield {wait: 600}; } },
      anim: (a, dt) => { if(a.working) a.ph += dt; const top = a.g.userData.top; if(top) top.rotation.y += ((a.working ? Math.sin(a.ph * 0.25) * 1.3 + 0.6 : 0) - top.rotation.y) * Math.min(1, dt); }}); }
  // Jack: gravel from the stockpile to the building, his bucket up when he tips it
  { const g = jackModel(); finish(g); const there = [at(-44, -12), at(-30, -4), at(-12, 1), at(6, 3)], back = [at(6, 3), at(-8, 13), at(-30, 9), at(-46, -1), at(-44, -12)];
    place(g, -44, -12, PI / 2);
    actor({name: 'Jack', kind: 'Front loader', g, color: 0xc8262b, meta: 'Sodor Construction Company', armT: 0.3,
      about: 'Jack is the red front loader, number 11, of the Sodor Construction Company. Young and eager, he carries the gravel from the stockpile over to the new building.',
      job: function*(a){ for(;;){ if(!onShift(sh)){ a.armT = 0.3; yield offDuty(a); continue; }
        a.status = 'Scooping gravel from the stockpile'; a.armT = 0.35; yield {wait: 50}; a.armT = -0.25;
        a.status = 'Carrying the gravel to the new building'; yield {follow: {pts: there, speed: 2.2 * M, ground: true}};
        a.status = 'Tipping the gravel by the new building'; a.armT = -0.8; yield {wait: 40}; a.armT = 0.1;
        a.status = 'Going back for more gravel'; yield {follow: {pts: back, speed: 2.5 * M, ground: true}}; } },
      anim: (a, dt) => { const arm = a.g.userData.arm; if(arm) arm.rotation.x += (a.armT - arm.rotation.x) * Math.min(1, dt * 1.5); }}); }
  // Byron levels the ground; Buster rolls the site road
  const toAndFro = (name, kind, g, p0, p1, speed, color, about, doing) => { finish(g); g.position.copy(p0); g.position.y = H(p0.x, p0.z); g.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    return actor({name, kind, g, color, meta: 'Sodor Construction Company', about,
      job: function*(a){ a.yaw = g.rotation.y; for(;;){ if(!onShift(sh)){ yield offDuty(a); continue; } a.working = true; a.status = doing;
        yield {follow: {pts: [p0.clone(), p1.clone()], speed, ground: true, keepYaw: true}}; yield {wait: 15};
        yield {follow: {pts: [p1.clone(), p0.clone()], speed: speed * 1.2, ground: true, keepYaw: true}}; yield {wait: 15}; } }}); };
  toAndFro('Byron', 'Bulldozer', byronModel(), at(-62, -26), at(-6, -26), 1.4 * M, 0xf2c419,
    'Byron is the yellow bulldozer, number 18, of the Sodor Construction Company. He pushes the earth about to level the ground — and has to watch he does not push too hard.', 'Pushing the earth to level the ground');
  const buster = toAndFro('Buster', 'Steamroller', steamRoadModel(0x6a1a22, true, {smile: 0.9, skin: '#c4c7ca'}), at(-82, 2), at(-8, 2), 1.0 * M, 0x6a1a22,
    'Buster is the maroon steamroller of the Sodor Construction Company, who goes about his job with glee, pride and contentment. He is rolling the new road into the site.', 'Rolling the new site road');
  buster.steam = true;
  // Miss Jenny, who runs the Pack
  { const g = personModel(0x2e6a3a, 0xf2c419); finish(g); place(g, -64, 40, -PI / 2);
    actor({name: 'Miss Jenny', kind: 'Site boss', g, color: 0x2e6a3a, followDist: 0.02, meta: 'Sodor Construction Company',
      about: 'Miss Jenny Packard owns and runs the Sodor Construction Company — the Pack — taking charge of the big building projects round Sodor with the Foreman. She is overseeing the new building at Elsbridge.',
      job: function*(a){ for(;;){ a.status = onShift(sh) ? 'Running the building site' : 'Gone home for the night'; a.g.visible = onShift(sh); yield {wait: 300}; } }}); }
  // the Pack's lorries on the roads: Isobella brings pipes from Knapford Harbour, Patrick concrete from the
  // Sodor Cement Works at Kirk Ronan, Nelson fetches loads from Ffarquhar Quarry on his low loader
  const gate = SK.gate;
  roadActor('Isobella', 'Steam lorry', () => sentinelModel(0xf2c419, 0xc8262b, 'pipes', {smile: 0.8, lashes: true, lips: '#b03040', skin: '#d9d2c8'}), gate, {color: 0xf2c419, speedK: 0.6, steam: true, chimney: new V3(0.6, 4.0, 1.7), meta: 'Sodor Construction Company',
    about: 'Isobella is the yellow steam lorry, number 22, of the Sodor Construction Company, lined in red and black. She brings pipes for the site from Knapford Harbour.',
    job: a => serviceJob(a, {stops: [gate, 'Knapford Harbour'], home: gate, shift: shift('07:30', '17:00', '1111100'), dwell: 900, endWait: 900, verb: nm => nm === gate.name ? 'Bringing pipes to the building site' : `Going to fetch pipes from ${nm}`, at: nm => nm === gate.name ? 'Unloading pipes at the building site' : `Loading pipes at ${nm}`})});
  roadActor('Patrick', 'Cement mixer', patrickModel, gate, {color: 0x5a2a3a, speedK: 0.85, meta: 'Sodor Construction Company',
    about: 'Patrick is the cement mixer lorry, number 23, of the Sodor Construction Company, purple-brown and cream. He fetches fresh concrete from the Sodor Cement Works at Kirk Ronan, his drum always turning so it never sets.',
    job: a => serviceJob(a, {stops: [gate, 'Kirk Ronan'], home: gate, shift: shift('07:00', '18:00', '1111100'), dwell: 1200, endWait: 1200, verb: nm => nm === gate.name ? 'Bringing fresh concrete to the building site' : 'Going to fetch concrete from the Sodor Cement Works', at: nm => nm === gate.name ? 'Pouring concrete at the building site' : 'Filling up at the Sodor Cement Works'}),
    anim: (a, dt) => { const d = a.g.userData.drum; if(d) d.rotation.z += dt * (onShift(shift('07:00', '18:00', '1111100')) ? 1.6 : 0); }});
  roadActor('Nelson', 'Ballast tractor', nelsonModel, gate, {color: 0x1c1c1e, speedK: 0.75, meta: 'Sodor Construction Company',
    about: 'Nelson is the black ballast tractor, number 10, of the Sodor Construction Company. He carries the Pack and their heavy loads on his low loader — today, stone and a skip between Ffarquhar Quarry and the site.',
    job: a => serviceJob(a, {stops: [gate, quarry], home: gate, shift: shift('08:00', '16:30', '1111100'), dwell: 1500, endWait: 1500, verb: nm => nm === gate.name ? 'Hauling a load to the building site' : `Going to ${nm} for a load`, at: nm => nm === gate.name ? 'Unloading at the building site' : `Loading at ${nm}`})});
}
// ------------------------------------------------------------------ the Sodor Steamworks: Victor fetches and delivers parts, Kevin helps
function steamworks(){
  const rec = window.SODOR_NWR && window.SODOR_NWR.byId.victor;
  if(rec && rec.shunt && rec.veh){
    const g = rec.veh.group, [p0, p1] = rec.shunt.map(p => p.clone());
    actor({name: 'Victor', kind: 'Steamworks engine', g, noPick: true, noRoster: true,
      job: function*(a){ const sh = shift('07:00', '18:00', '1111110');
        for(;;){ if(!onShift(sh)){ a.status = 'In the works for the night'; yield {until: nextOn(sh)}; continue; }
          a.status = 'Fetching parts from the stores'; yield {follow: {pts: [g.position.clone(), p1.clone()], speed: 1.1 * M, keepYaw: true}};
          a.status = 'Collecting parts'; yield {wait: 300};
          a.status = 'Delivering parts to the repair shop'; yield {follow: {pts: [p1.clone(), p0.clone()], speed: 1.1 * M, keepYaw: true}};
          a.status = 'Supervising the repairs'; yield {wait: 480}; } }});
  }
  const kv = S.NONRAIL && S.NONRAIL.kevin;
  if(kv){
    const o = kv.obj, q = new THREE.Quaternion(); kv.G.getWorldQuaternion(q); scene.attach(o);
    const d = new V3(0, 0, 1).applyQuaternion(q); d.y = 0; d.normalize();
    const p0 = o.position.clone(), p1 = p0.clone().addScaledVector(d, 16 * M);
    actor({name: 'Kevin', kind: 'Mobile crane', g: o, noPick: true, noRoster: true,
      job: function*(a){ const sh = shift('07:00', '18:00', '1111110');
        for(;;){ if(!onShift(sh)){ a.status = 'Asleep in the works'; yield {until: nextOn(sh)}; continue; }
          a.status = 'Fetching parts for Victor'; yield {follow: {pts: [p0.clone(), p1.clone()], speed: 1.5 * M, keepYaw: true}}; a.status = 'Lifting an engine part'; yield {wait: 240};
          yield {follow: {pts: [p1.clone(), p0.clone()], speed: 1.3 * M, keepYaw: true}}; yield {wait: 360}; } }});
  }
}
function georgeAt(){
  const sk = LINES.skarloey; if(!sk || !sk.real) return;
  const cg = stn("Crovan's Gate"), gl = stn('Glennock'); if(!cg || !gl) return;
  let best = null;
  W.roads.forEach(rd => { if(!(rd.cls === 'B' || rd.cls === 'lane' || rd.cls === 'A') || rd.s[rd.s.length - 1] < 160 * M) return;
    rd.pts.forEach((p, i) => { if(i % 3) return; const d = K.nearTrack(p.x, p.z, 120 * M) ? 0 : 1, dc = Math.hypot(p.x - (cg.x + gl.x) / 2, p.z - (cg.z + gl.z) / 2);
      const sc = dc + d * 3000 * M; if(!best || sc < best.sc) best = {rd, s: rd.s[i], sc}; }); });
  if(!best) return;
  const rd = best.rd, span = rd.s[rd.s.length - 1], s0 = clamp(best.s - 30 * M, 20 * M, span - 90 * M), s1 = s0 + 60 * M;
  // cones and a sign at each end of the works
  const cones = new THREE.Group(); scene.add(cones);
  [s0 - 8 * M, s1 + 8 * M].forEach((s, k) => { const fr = LIFE.roadFrame(rd, s, {_i: 0});
    for(let q = -1; q <= 1; q++){ const c = new THREE.Group(); add(c, new THREE.ConeGeometry(0.22, 0.7, 10), mat(0xff6a1a, 0.5), 0, 0.35, 0); box(c, 0.45, 0.04, 0.45, BLK(), 0, 0.02, 0); c.scale.setScalar(M); c.position.set(fr.x + fr.nx * rd.hw * (0.15 + q * 0.3), fr.y, fr.z + fr.nz * rd.hw * (0.15 + q * 0.3)); cones.add(c); }
    const sg = new THREE.Group(); cylY(sg, 0.04, 0.04, 1.4, GREY(), 0, 0.7, 0, 6); const tri = add(sg, new THREE.CircleGeometry(0.5, 3), mat(0xf2f0ea, 0.5, 0, 'double'), 0, 1.6, 0); tri.rotation.z = PI / 2;
    add(sg, new THREE.CircleGeometry(0.38, 3), mat(0xc8262b, 0.5, 0, 'double'), 0, 1.6, 0.01).rotation.z = PI / 2;
    sg.scale.setScalar(M); sg.position.set(fr.x + fr.nx * rd.hw * 1.3, fr.y, fr.z + fr.nz * rd.hw * 1.3); sg.rotation.y = Math.atan2(fr.tx, fr.tz) + (k ? 0 : PI); cones.add(sg); });
  const work = {rd, s: s0, name: "the road works by the Skarloey Railway"};
  roadActor('George', 'Steamroller', () => steamRoadModel(0x2e6a32, true), work, {color: 0x2e6a32, fixedSpeed: 1.1 * M, ghost: true, laneK: 1.0, steam: true, meta: "Road works by the Skarloey Railway",
    about: "George is the green steamroller who rolls the roads. He has no time for railways and took an instant dislike to the little engines, Sir Handel above all — he is working on the road beside the Skarloey Railway.",
    job: function*(a){ const sh = shift('08:00', '17:00', '1111100');
      for(;;){ if(!onShift(sh)){ a.status = `Parked at the road works until ${fmtTime(nextOn(sh))}`; a.parked = true; yield {until: nextOn(sh)}; a.parked = false; continue; }
        a.status = 'Rolling the new road surface'; a.working = true;
        yield {drive: [{rd, s0: a.s, s1}]}; yield {wait: 20}; yield {drive: [{rd, s0: s1, s1: s0}]}; yield {wait: 20}; a.working = false; } }});
}
function terence(){
  if(!FIELD) return;
  const ang = 0.4, t = new V3(Math.sin(ang), 0, Math.cos(ang)), n = new V3(t.z, 0, -t.x), LEN = 190, WID = 110, c = new V3(FIELD.x, 0, FIELD.z);
  const at = (u, v) => c.clone().addScaledVector(t, u * M).addScaledVector(n, v * M);
  // the field: ploughed furrows, draped over the ground
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const g2 = cv.getContext('2d');
  g2.fillStyle = '#6b4a2e'; g2.fillRect(0, 0, 64, 256); for(let k = 0; k < 64; k += 4){ g2.fillStyle = k % 8 ? '#5a3c24' : '#7a573a'; g2.fillRect(k, 0, 2, 256); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(WID / 16, 1);
  const NU = 12, NV = 8, pos = [], uv = [], idx = [];
  for(let i = 0; i <= NU; i++) for(let j = 0; j <= NV; j++){ const u = -LEN / 2 + i * LEN / NU, v = -WID / 2 + j * WID / NV, p = at(u, v); pos.push(p.x, H(p.x, p.z) + 0.12 * M, p.z); uv.push(j / NV, i / NU); }
  for(let i = 0; i < NU; i++) for(let j = 0; j < NV; j++){ const a0 = i * (NV + 1) + j, b0 = a0 + NV + 1; idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const fm = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({map: tex, roughness: 0.98, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide})); fm.receiveShadow = true; scene.add(fm);
  // a barn at the corner, where he waits overnight
  const barn = new THREE.Group(); box(barn, 12, 6, 9, mat(0x8a2a1e, 0.8), 0, 3, 0); const rf = box(barn, 12.6, 0.3, 6.2, mat(0x4a4d52, 0.7), 0, 7.2, -2.3); rf.rotation.x = 0.6; const rf2 = box(barn, 12.6, 0.3, 6.2, mat(0x4a4d52, 0.7), 0, 7.2, 2.3); rf2.rotation.x = -0.6;
  box(barn, 4, 4.5, 0.1, mat(0x3a2a1e, 0.8), 0, 2.25, 4.55); const bp = at(-LEN / 2 - 16, -WID / 2 + 6); S.bakeVC(barn); barn.scale.setScalar(M); barn.position.set(bp.x, H(bp.x, bp.z) - 0.3 * M, bp.z); barn.rotation.y = Math.atan2(t.x, t.z) + PI / 2; scene.add(barn);
  // up and down the field, a furrow width apart, turning on the headlands
  const pts = [], P0 = at(-LEN / 2 - 8, -WID / 2 + 4);
  pts.push(new V3(P0.x, 0, P0.z));
  for(let k = 0, v = -WID / 2 + 5; v <= WID / 2 - 5; v += 9, k++){
    const u0 = k % 2 ? LEN / 2 - 6 : -LEN / 2 + 6, u1 = -u0;
    pts.push(at(u0, v), at(u1, v));
    for(let q = 1; q < 6; q++){ const ang2 = q / 6 * PI, uc = u1 + Math.sign(u1) * Math.sin(ang2) * 6, vc = v + 4.5 - Math.cos(ang2) * 4.5; pts.push(at(uc, vc)); }
  }
  pts.push(at(-LEN / 2 - 8, WID / 2 - 4), new V3(P0.x, 0, P0.z));
  const park = P0;
  const g = terenceModel(); finish(g);
  actor({name: 'Terence', kind: 'Caterpillar tractor', g, color: 0xe8731e, meta: "Farmer Finney's farm by Thomas' Branch Line",
    about: "Terence is the orange caterpillar tractor owned and driven by Farmer Finney, who works the fields beside Thomas' Branch Line. His caterpillar tracks take him where wheels cannot — he once pulled Thomas out of a snowdrift.",
    job: function*(a){ const sh = shift('08:00', '16:30', '1111110');
      a.g.position.set(park.x, H(park.x, park.z), park.z);
      for(;;){ if(!onShift(sh)){ a.status = `In the barn until ${fmtTime(nextOn(sh))}`; yield {until: nextOn(sh)}; continue; }
        a.status = "Ploughing Farmer Finney's field"; yield {follow: {pts, speed: 1.9 * M, ground: true}}; a.status = 'Having a rest at the headland'; yield {wait: 900}; } }});
}
function trevor(){
  if(!ORCHARD) return;
  const c = new V3(ORCHARD.x, 0, ORCHARD.z), ang = 1.1, t = new V3(Math.sin(ang), 0, Math.cos(ang)), n = new V3(t.z, 0, -t.x);
  const at = (u, v) => c.clone().addScaledVector(t, u * M).addScaledVector(n, v * M);
  // the orchard: rows of apple trees inside a hedge, the vicarage, a log pile and a saw bench
  const og = new THREE.Group(); scene.add(og);
  const trunk = mat(0x5a4030, 0.9), leaf = [0x3a7a2e, 0x467f32, 0x2f6a28];
  for(let i = 0; i < 7; i++) for(let j = 0; j < 5; j++){
    const p = at(-36 + i * 12, -20 + j * 10), tg = new THREE.Group(); cylY(tg, 0.22, 0.3, 2.2, trunk, 0, 1.1, 0, 7);
    add(tg, new THREE.SphereGeometry(2.3, 9, 7), mat(leaf[(i + j) % 3], 0.85), 0, 3.4, 0).scale.y = 0.8;
    for(let k = 0; k < 5; k++) add(tg, new THREE.SphereGeometry(0.16, 6, 5), mat(0xc8262b, 0.5), Math.cos(k * 1.3) * 1.9, 3.0 + (k % 2) * 0.8, Math.sin(k * 1.3) * 1.9);
    S.bakeVC(tg); tg.scale.setScalar(M); tg.position.set(p.x, H(p.x, p.z), p.z); og.add(tg);
  }
  for(let k = 0; k < 4; k++){ const u = k < 2 ? 0 : (k === 2 ? -52 : 52), v = k < 2 ? (k ? 32 : -32) : 0, len = k < 2 ? 104 : 64, hg = new THREE.Group();
    box(hg, k < 2 ? len : 1.4, 1.8, k < 2 ? 1.4 : len, mat(0x2f5a26, 0.95), 0, 0.9, 0); S.bakeVC(hg); hg.scale.setScalar(M); const p = at(u, v); hg.position.set(p.x, H(p.x, p.z), p.z); hg.rotation.y = Math.atan2(t.x, t.z) + PI / 2; og.add(hg); }
  const vic = new THREE.Group(); box(vic, 14, 9, 10, mat(0xc9b28a, 0.85), 0, 4.5, 0); const r1 = box(vic, 14.6, 0.3, 6.6, mat(0x4a4d52, 0.7), 0, 10.4, -2.5); r1.rotation.x = 0.7; const r2 = box(vic, 14.6, 0.3, 6.6, mat(0x4a4d52, 0.7), 0, 10.4, 2.5); r2.rotation.x = -0.7;
  for(let k = 0; k < 3; k++) for(const y of [2.5, 6.5]) add(vic, new THREE.PlaneGeometry(1.4, 1.8), glassMat(), -4.5 + k * 4.5, y, 5.02);
  box(vic, 1.6, 2.6, 0.1, mat(0x3a5a3a, 0.6), 0, 1.3, 5.05); cylY(vic, 0.6, 0.6, 3, mat(0x8a5a3a, 0.8), 5, 11.5, 0, 8);
  S.bakeVC(vic); vic.scale.setScalar(M); const vp = at(0, 46); vic.position.set(vp.x, H(vp.x, vp.z) - 0.2 * M, vp.z); vic.rotation.y = Math.atan2(-n.x, -n.z); og.add(vic);
  const logs = new THREE.Group(); for(let k = 0; k < 9; k++) cylX(logs, 0.3, 0.3, 3.2, mat(0x7a5a3a, 0.9), 0, 0.3 + Math.floor(k / 3) * 0.55, -0.6 + (k % 3) * 0.62 + (Math.floor(k / 3) % 2) * 0.3, 8);
  box(logs, 1.2, 0.9, 2.2, mat(0x6a4a2a, 0.8), 3.2, 0.45, 0); cylZ(logs, 0.5, 0.5, 0.05, mat(0xb8bcc0, 0.3, 0.7), 3.2, 1.05, 0, 20);
  S.bakeVC(logs); logs.scale.setScalar(M); const lp = at(44, -26); logs.position.set(lp.x, H(lp.x, lp.z), lp.z); logs.rotation.y = Math.atan2(t.x, t.z); og.add(logs);
  // round the orchard on the grass path inside the hedge, then over to the saw bench
  const loop = []; for(let k = 0; k <= 32; k++){ const q = k / 32 * TAU; loop.push(at(Math.cos(q) * 46, Math.sin(q) * 26)); }
  const toSaw = [at(46, 0), at(46, -14), at(40, -24)], back = [at(40, -24), at(46, -14), at(46, 0)];
  const g = steamRoadModel(0x1f4a2a, false); finish(g);
  actor({name: 'Trevor', kind: 'Traction engine', g, color: 0x1f4a2a, steam: true, meta: 'Wellsworth Vicarage Orchard', chimney: new V3(0, 3.8, 1.45),
    about: "Trevor is the green traction engine who lives at the Wellsworth Vicarage Orchard, driven by Jem Cole. Saved from the scrap yard by Edward, who persuaded the Vicar of Wellsworth to buy him, he saws timber and does odd jobs about the orchard, and loves giving the children rides.",
    job: function*(a){ const sh = shift('09:00', '16:00', '1111110'); const p0 = at(46, 0); a.g.position.set(p0.x, H(p0.x, p0.z), p0.z);
      for(;;){ if(!onShift(sh)){ a.status = `Resting in the orchard until ${fmtTime(nextOn(sh))}`; a.working = false; yield {until: nextOn(sh)}; continue; }
        a.status = 'Giving the children rides round the orchard'; a.working = true; yield {follow: {pts: loop, speed: 1.3 * M, ground: true}};
        a.status = 'Going over to the saw bench'; yield {follow: {pts: toSaw, speed: 1.0 * M, ground: true}};
        a.status = 'Sawing logs for the Vicar'; a.sawing = true; yield {wait: 1800}; a.sawing = false;
        yield {follow: {pts: back, speed: 1.0 * M, ground: true, keepYaw: false}}; } },
    anim: (a, dt) => { if(a.g.userData.fly) a.g.userData.fly.rotation.x += dt * (a.sawing ? 9 : a.v > 0 ? 3 : 0); }});
}
// a flight path between two points at a safe height over the ground
function flightPath(p0, p1, agl, step){
  const d = Math.hypot(p1.x - p0.x, p1.z - p0.z), n = Math.max(2, Math.ceil(d / (step * M))), pts = [], ys = [];
  for(let i = 0; i <= n; i++){ const f = i / n, x = p0.x + (p1.x - p0.x) * f, z = p0.z + (p1.z - p0.z) * f; let hi = 0; for(const q of [-2, -1, 0, 1, 2]){ const g = Math.min(1, Math.max(0, f + q / n)); hi = Math.max(hi, H(p0.x + (p1.x - p0.x) * g, p0.z + (p1.z - p0.z) * g)); } ys.push(Math.max(0, hi) + agl * M); pts.push(new V3(x, 0, z)); }
  for(let i = 0; i <= n; i++){ let m = 0, c = 0; for(let k = -3; k <= 3; k++){ const j = i + k; if(j >= 0 && j <= n){ m += ys[j]; c++; } } pts[i].y = Math.max(ys[i], m / c); }
  return pts;
}
function harold(){
  const RA = S.RESCUE_ANIM || [], e = RA.find(r => r.heli); if(!e) return;
  const g = e.heli; RA.splice(RA.indexOf(e), 1);
  scene.attach(g); g.updateMatrixWorld(true);
  face(g, 0.8, {smile: 0.7, skin: '#e8eaec', hat: null}, 0, 1.55, 3.12);
  const pad = g.position.clone(), yaw0 = g.rotation.y;
  const spots = STATIONS.filter(s => s.kind !== 'closed' && s.name).map(s => new V3(s.x, 0, s.z));
  actor({name: 'Harold', kind: 'Helicopter', g, color: 0xf2f0ea, air: true, followDist: 0.25, meta: 'Sodor Search and Rescue Team',
    about: "Harold is the white helicopter who patrols the skies of Sodor looking for emergencies. Once based at Dryaw Airfield, he now lives in his own hangar at the Sodor Search and Rescue Centre and speeds to the rescue of anyone in distress. He thinks railways slow and out of date — though Percy once beat him in a race.",
    job: function*(a){ const sh = shift('07:30', '20:30'), r = rngOf(9127);
      a.yaw = yaw0; a.g.rotation.y = yaw0;
      for(;;){
        if(!onShift(sh)){ a.status = `In his hangar until ${fmtTime(nextOn(sh))}`; a.rotor = 0; yield {until: nextOn(sh)}; continue; }
        a.status = 'On stand-by at the Rescue Centre'; a.rotor = 0; yield {wait: 1800 + r() * 2700}; if(!onShift(sh)) continue;
        a.rotor = 1; a.status = 'Starting up'; yield {wait: 60};
        let here = pad.clone(); const up = pad.clone(); up.y += 45 * M;
        a.status = 'Lifting off'; yield {follow: {pts: [pad.clone(), up], speed: 3 * M, keepYaw: true}};
        here = up;
        const legs = 2 + Math.floor(r() * 3);
        for(let k = 0; k < legs; k++){
          const to = spots[Math.floor(r() * spots.length)], name = STATIONS.find(s => s.x === to.x && s.z === to.z).name;
          a.status = `Patrolling towards ${name}`;
          const path = flightPath(here, to, 160, 120); path[0] = here.clone();
          yield {follow: {pts: path, speed: 55 * M, pitch: true}};
          // circle the place, looking for trouble
          const cpts = [], cy = path[path.length - 1].y; for(let q = 0; q <= 24; q++){ const ang = q / 24 * TAU; cpts.push(new V3(to.x + Math.sin(ang) * 280 * M, cy, to.z + Math.cos(ang) * 280 * M)); }
          a.status = `Circling over ${name}`; yield {follow: {pts: [path[path.length - 1], ...cpts], speed: 30 * M}};
          here = cpts[cpts.length - 1];
        }
        a.status = 'Flying back to the Rescue Centre'; const home = flightPath(here, pad, 160, 120); home[0] = here.clone(); const over = up.clone(); home[home.length - 1] = over;
        yield {follow: {pts: home, speed: 55 * M, pitch: true}};
        a.status = 'Landing'; yield {follow: {pts: [over, pad.clone()], speed: 2.5 * M, keepYaw: true}};
        a.g.position.copy(pad);
        a.status = 'Shutting down'; yield {wait: 90}; a.rotor = 0;
      } },
    anim: (a, dt) => { const ud = a.g.userData; a.spin = (a.spin || 0) + ((a.rotor ? 1 : 0) - (a.spin || 0)) * Math.min(1, dt * 0.8);
      if(ud.rotor) ud.rotor.rotation.y += dt * 24 * a.spin; if(ud.tail) ud.tail.rotation.x += dt * 60 * a.spin;
      a.bank = (a.bank || 0) + (clamp(-(a.yawRate || 0) * 6, -0.35, 0.35) - (a.bank || 0)) * Math.min(1, dt * 2);
      a.g.rotation.set((a.pitch || 0) * 0.5 + (a.v > 20 * M ? 0.12 : 0), a.yaw === undefined ? a.g.rotation.y : a.yaw, a.bank, 'YXZ'); }});
}
function jeremy(){
  // Sodor Airport: runway, taxiway, apron, terminal, tower and hangar
  const {t, n, L, WID, side, at} = AP, Lm = L / M, sd = side, ag = new THREE.Group(); scene.add(ag);
  const hAt = (s, q) => { let h = -Infinity; for(const qq of [q - 30, q, q + 30]){ const p = at(s, qq); h = Math.max(h, H(p.x, p.z)); } return h; };
  const strip = (s0, s1, q0, q1, col, lift, ys) => {          // a flat-topped strip draped on the ground, with skirts
    const N = Math.max(2, Math.ceil((s1 - s0) / 20)), pos = [], idx = [];
    for(let i = 0; i <= N; i++){ const s = s0 + (s1 - s0) * i / N, y = ys ? ys(s) : Math.max(hAt(s, q0), hAt(s, q1)) + lift * M;
      for(const q of [q0, q1]){ const p = at(s, q); pos.push(p.x, y, p.z); }
      for(const q of [q0, q1]){ const p = at(s, q); pos.push(p.x, H(p.x, p.z) - 1.5 * M, p.z); } }
    for(let i = 0; i < N; i++){ const a0 = i * 4, b0 = a0 + 4; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1, a0, a0 + 2, b0, b0, a0 + 2, b0 + 2, a0 + 1, b0 + 1, a0 + 3, a0 + 3, b0 + 1, b0 + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: col, roughness: 0.9, side: THREE.DoubleSide})); m.receiveShadow = true; ag.add(m); return m;
  };
  // the runway's level: the highest ground under it, smoothed, so it never dips into the hills
  const RS = [], step = 25; for(let s = -Lm / 2 - 60; s <= Lm / 2 + 60; s += step) RS.push(hAt(s, 0));
  const RY = RS.map((h, i) => { let m = -Infinity; for(let k = -4; k <= 4; k++){ const j = i + k; if(j >= 0 && j < RS.length) m = Math.max(m, RS[j]); } return m + 0.35 * M; });
  const ry = s => { const f = (s + Lm / 2 + 60) / step, i = clamp(Math.floor(f), 0, RY.length - 2), k = clamp(f - i, 0, 1); return RY[i] + (RY[i + 1] - RY[i]) * k; };
  strip(-Lm / 2 - 60, Lm / 2 + 60, -WID / M / 2 - 8, WID / M / 2 + 8, 0x8a9a6a, -0.05, s => ry(s) - 0.08 * M);
  strip(-Lm / 2, Lm / 2, -WID / M / 2, WID / M / 2, 0x3a3d40, 0, ry);
  const mark = (s, q, w, l, c = 0xf2f2ee) => { const p = at(s, q), m = add(ag, new THREE.PlaneGeometry(w * M, l * M), mat(c, 0.6, 0, 'double'), p.x, ry(s) + 0.04 * M, p.z); m.rotation.set(-PI / 2, AP.yaw, 0, 'YXZ'); return m; };
  for(let s = -Lm / 2 + 90; s < Lm / 2 - 90; s += 50) mark(s, 0, 0.9, 30);
  for(const e of [-1, 1]) for(let k = -4; k <= 4; k++) if(k) mark(e * (Lm / 2 - 25), k * 4.6, 1.8, 30);
  for(const e of [-1, 1]) for(const q of [-11, 11]) mark(e * (Lm / 2 - 330), q, 6, 45);
  // the taxiway alongside, the turn-offs and the apron
  const TQ = sd * 85, sAp = 220, ty = s => Math.max(ry(s), hAt(s, TQ)) + 0.1 * M;
  strip(-Lm / 2 + 10, Lm / 2 - 10, TQ - 11, TQ + 11, 0x45484c, 0, ty);
  for(const s of [-Lm / 2 + 30, sAp, Lm / 2 - 40]) strip(s - 12, s + 12, sd > 0 ? WID / M / 2 - 2 : TQ - 8, sd > 0 ? TQ + 8 : -WID / M / 2 + 2, 0x45484c, 0, () => Math.max(ry(s), ty(s)) + 0.02 * M);
  const AQ0 = TQ + sd * 10, AQ1 = TQ + sd * 150, apY = (() => { let h = -Infinity; for(let s = sAp - 120; s <= sAp + 120; s += 30) for(let q = 0; q <= 1; q += 0.25) h = Math.max(h, H(at(s, AQ0 + (AQ1 - AQ0) * q).x, at(s, AQ0 + (AQ1 - AQ0) * q).z)); return h + 0.3 * M; })();
  strip(sAp - 120, sAp + 120, Math.min(AQ0, AQ1), Math.max(AQ0, AQ1), 0x55585c, 0, () => apY);
  const bld = (fn, s, q, rot) => { const b = new THREE.Group(); fn(b); S.bakeVC(b); b.scale.setScalar(M); const p = at(s, q); b.position.set(p.x, apY - 0.2 * M, p.z); b.rotation.y = AP.yaw + (rot || 0); ag.add(b); return b; };
  bld(b => { box(b, 26, 14, 120, mat(0xe9e6dc, 0.6), 0, 7, 0); box(b, 0.2, 9, 112, glassMat(), -13.1 * sd, 7.5, 0); box(b, 28, 0.8, 122, mat(0x6a6d70, 0.5), 0, 14.4, 0);
    box(b, 0.2, 2.4, 40, mat(0x1f4f9a, 0.5), -13.15 * sd, 12.6, 0); }, sAp, TQ + sd * 175);
  bld(b => { cylY(b, 3, 3.4, 30, mat(0xe9e6dc, 0.6), 0, 15, 0, 16); cylY(b, 5.5, 4.5, 4, glassMat(), 0, 32, 0, 16); cylY(b, 6, 6, 0.6, mat(0x6a6d70, 0.5), 0, 34.3, 0, 16); cylY(b, 0.1, 0.1, 5, GREY(), 0, 37, 0, 6); }, sAp + 110, TQ + sd * 150);
  bld(b => { box(b, 46, 18, 60, mat(0x9aa2aa, 0.5, 0.3), 0, 9, 0); box(b, 0.3, 15, 50, mat(0x6a7078, 0.5, 0.3), -23.1 * sd, 7.5, 0); }, sAp - 170, TQ + sd * 120);
  // sign
  const sign = K.canvasTex(512, 96, x => { x.fillStyle = '#1f4f9a'; x.fillRect(0, 0, 512, 96); x.fillStyle = '#fff'; x.font = 'bold 56px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SODOR AIRPORT', 256, 50); });
  { const p = at(sAp, TQ + sd * 161.9), m = add(ag, new THREE.PlaneGeometry(40 * M, 7.5 * M), new THREE.MeshStandardMaterial({map: sign, roughness: 0.5}), p.x, apY + 16.5 * M, p.z); m.rotation.y = AP.yaw + (sd > 0 ? -PI / 2 : PI / 2); }
  // Jeremy's flights: out over the sea towards England, and back
  const g = jeremyModel(); finish(g);
  const stand = at(sAp, TQ + sd * 95); stand.y = apY;
  const P = (s, q, y) => { const p = at(s, q); p.y = y === undefined ? ty(s) : y; return p; };
  const thr = -Lm / 2 + 45, gy = s => ry(s);
  const away = (() => { const b = stn('Barrow-in-Furness'), dx = b.x - AP.c.x, dz = b.z - AP.c.z, dl = Math.hypot(dx, dz); return {x: AP.c.x + dx / dl * 70000 * M, z: AP.c.z + dz / dl * 70000 * M}; })();
  actor({name: 'Jeremy', kind: 'Jet plane', g, color: 0xf2f4f6, air: true, followDist: 0.3, meta: 'Sodor Airport', home: stand,
    about: "Jeremy is the white jet plane whose home is Sodor Airport, south-east of Maron. He flies passengers between Sodor and the Mainland. Thomas once thought he was boasting — but Jeremy simply loves to fly, and has a soft spot for the engines.",
    job: function*(a){
      const times = ['08:15', '11:15', '14:15', '17:15', '20:15'].map(hm);
      a.g.position.copy(stand); a.yaw = AP.yaw + (sd > 0 ? -PI / 2 : PI / 2); a.g.rotation.y = a.yaw;
      for(;;){
        // the next departure
        const d0 = Math.floor(simTime / 1440); let dep = null; for(let k = 0; k < 2 && dep === null; k++) for(const tm of times){ const T = (d0 + k) * 1440 + tm; if(T > simTime + 4){ dep = T; break; } }
        a.status = `At the terminal: boarding for the ${fmtTime(dep)} flight to the Mainland`; a.g.visible = true; a.g.position.copy(stand);
        yield {until: dep - 4};
        a.status = 'Taxiing to the runway';
        yield {follow: {pts: [stand.clone(), P(sAp, TQ + sd * 30, apY), P(sAp, TQ), P(sAp - 40, TQ), P(-Lm / 2 + 30, TQ), P(-Lm / 2 + 30, TQ - sd * 50), P(thr - 10, sd * 6, gy(thr - 10)), P(thr, 0, gy(thr))], speed: 7 * M}};
        a.status = 'Holding at the end of the runway'; yield {wait: 45};
        // take-off roll, rotate, climb away
        const roll = [], sp = []; for(let s = thr; s <= Lm / 2 - 250; s += 25){ roll.push(P(s, 0, gy(s))); sp.push(Math.sqrt(8 + 2 * 2.3 * (s - thr)) * M); }
        const rEnd = roll[roll.length - 1], y0 = rEnd.y;
        for(let k = 1; k <= 30; k++){ const s = Lm / 2 - 250 + k * 120; roll.push(P(s, 0, y0 + Math.min(k * 120 * 0.16, 600) * M)); sp.push(Math.min(110, 72 + k * 2) * M); }
        a.status = 'Taking off'; yield {follow: {pts: roll, sp, speed: 70 * M, pitch: true}};
        a.status = 'Climbing away towards the Mainland';
        const cl = roll[roll.length - 1], outPts = [cl]; for(let k = 1; k <= 20; k++){ const f = k / 20; outPts.push(new V3(cl.x + (away.x - cl.x) * f, cl.y + Math.min(1, f * 3) * 1800 * M, cl.z + (away.z - cl.z) * f)); }
        yield {follow: {pts: outPts, speed: 160 * M, pitch: true}};
        a.g.visible = false; a.status = 'Away on a flight to the Mainland'; yield {wait: 3600 + 1200};
        // back: down the approach from ten kilometres out, touch down, roll out, taxi in
        a.g.visible = true; a.status = 'Flying back to Sodor';
        const ap0 = P(thr - 10000, 0, gy(thr) + 900 * M), inb = [new V3(away.x, cl.y + 1800 * M, away.z), ap0];
        yield {follow: {pts: inb, speed: 160 * M, pitch: true}};
        a.status = 'On the approach to Sodor Airport'; const app = []; for(let k = 0; k <= 20; k++){ const s = thr - 10000 + k * (10000 + 280) / 20; app.push(P(s, 0, gy(Math.max(thr, s)) + Math.max(0, (thr + 280 - s) * 0.087) * M)); }
        yield {follow: {pts: app, speed: 75 * M, pitch: true}};
        a.status = 'Landing'; const ro = [], rsp = []; for(let s = thr + 280; s <= Lm / 2 - 60; s += 25){ ro.push(P(s, 0, gy(s))); rsp.push(Math.max(8, 70 - (s - thr - 280) * 0.072) * M); }
        yield {follow: {pts: ro, sp: rsp, speed: 20 * M}};
        a.status = 'Taxiing to the terminal';
        yield {follow: {pts: [ro[ro.length - 1], P(Lm / 2 - 40, sd * 30), P(Lm / 2 - 40, TQ), P(sAp + 40, TQ), P(sAp, TQ), P(sAp, TQ + sd * 30, apY), stand.clone()], speed: 7 * M}};
        a.yaw = AP.yaw + (sd > 0 ? -PI / 2 : PI / 2);
        a.status = 'At the terminal: passengers getting off'; yield {wait: 600};
      } },
    anim: a => { a.g.rotation.set((a.pitch || 0) * 0.8, a.yaw === undefined ? a.g.rotation.y : a.yaw, clamp(-(a.yawRate || 0) * 4, -0.4, 0.4), 'YXZ'); }});
}
// a loop of water round a point, every stretch of it deep enough
function seaLoop(c, r, n = 24){ const pts = []; for(let k = 0; k <= n; k++){ const q = k / n * TAU; pts.push(new V3(c.x + Math.sin(q) * r, 0, c.z + Math.cos(q) * r)); } return pts; }
const deep = (p, q, d = -1.2) => { for(let f = 0; f <= 1; f += 0.04){ if(H(p.x + (q.x - p.x) * f, p.z + (q.z - p.z) * f) > d * M) return false; } return true; };
function captain(){
  const RA = S.RESCUE_ANIM || [], e = RA.find(r => r.boat); if(!e) return;
  const g = e.boat; RA.splice(RA.indexOf(e), 1); scene.attach(g); g.updateMatrixWorld(true);
  face(g, 0.42, {smile: 0.6, brow: 0.3, skin: '#d9dcdf', hat: '#1f3f8a'}, 0, 1.6, 1.16);
  cylY(g, 0.05, 0.06, 4.5, mat(0xf2c419, 0.5), 0, 4.0, -3.8, 6);
  const berth = g.position.clone(), yaw0 = g.rotation.y, wl = berth.y;
  // out to sea from the boathouse: the most open water round the Centre
  let best = null;
  for(let k = 0; k < 24; k++){ const q = k / 24 * TAU, dx = Math.sin(q), dz = Math.cos(q); let open = 0; for(let d = 300; d <= 3000; d += 300) if(H(berth.x + dx * d * M, berth.z + dz * d * M) < -2 * M) open++; if(!best || open > best.open) best = {dx, dz, open}; }
  const out = (d, side) => new V3(berth.x + best.dx * d * M + best.dz * side * M, wl, berth.z + best.dz * d * M - best.dx * side * M);
  const patrol = [berth.clone(), out(120, 0), out(700, 0)];
  for(const [d, sd] of [[1500, 900], [2600, 0], [1500, -900], [700, 0], [120, 0]]){ const p = out(d, sd); if(deep(patrol[patrol.length - 1], p, -0.8) || d <= 700) patrol.push(p); }
  patrol.push(berth.clone()); patrol.forEach(p => p.y = wl);
  actor({name: 'Captain', kind: 'Lifeboat', g, color: 0xe8a020, followDist: 0.08, meta: 'Sodor Search and Rescue Team',
    about: 'Captain is the coastguard lifeboat of the Sodor Search and Rescue Team, with his amber cab, blue sides and red hull. He keeps watch over the seas round Sodor, launches to anyone in trouble on the water, and helped search for Thomas when he was lost on Misty Island.',
    job: function*(a){ const sh = shift('08:00', '20:00'), r = rngOf(3301); a.yaw = yaw0;
      for(;;){ if(!onShift(sh)){ a.status = `In the boathouse until ${fmtTime(nextOn(sh))}`; yield {until: nextOn(sh)}; continue; }
        a.status = 'Moored at the boathouse, ready to launch'; yield {wait: 3600 + r() * 5400}; if(!onShift(sh)) continue;
        a.status = 'Out on patrol off the coast'; yield {follow: {pts: patrol, speed: 9 * M}}; a.yaw = yaw0; a.g.position.copy(berth); } },
    anim: (a, dt) => { const tt = performance.now() / 1000; a.g.position.y = wl + Math.sin(tt * 0.9) * 0.15 * M; a.g.rotation.set(Math.sin(tt * 0.55) * 0.03 - (a.v > 3 * M ? 0.05 : 0), a.yaw === undefined ? a.g.rotation.y : a.yaw, Math.sin(tt * 0.7) * 0.04, 'YXZ'); }});
}
function skiff(){
  const st = stn('Arlesburgh West') || stn('Arlesburgh'); if(!st) return;
  // the nearest water deep enough for a circle round the harbour
  let best = null;
  for(let r = 200; r <= 9000; r += 100) for(let k = 0; k < 24; k++){
    const q = k / 24 * TAU, c = new V3(st.x + Math.sin(q) * r * M, 0, st.z + Math.cos(q) * r * M);
    if(H(c.x, c.z) > -1.5 * M) continue;
    const loop = seaLoop(c, 180 * M); if(!loop.every((p, i) => !i || deep(loop[i - 1], p, -0.6))) continue;
    best = {c, loop}; break;
  }
  if(!best) return;
  // the jetty: the shallows nearest the station, on the way in
  let quay = null; for(let f = 0; f <= 1; f += 0.02){ const x = best.c.x + (st.x - best.c.x) * f, z = best.c.z + (st.z - best.c.z) * f; if(H(x, z) < -0.4 * M) quay = new V3(x, 0, z); else break; }
  quay = quay || best.loop[0].clone();
  const g = skiffModel(); finish(g); g.position.copy(quay);
  const jt = new THREE.Group(); box(jt, 2.4, 0.3, 14, mat(0x8a6a4a, 0.85), 0, 0.6, 0); for(let k = 0; k < 4; k++) for(const s of [-1, 1]) cylY(jt, 0.15, 0.15, 3, mat(0x5a4030, 0.9), s * 1.1, -0.8, -6 + k * 4, 6);
  S.bakeVC(jt); jt.scale.setScalar(M); jt.position.set(quay.x, 0, quay.z); jt.rotation.y = Math.atan2(st.x - quay.x, st.z - quay.z); scene.add(jt);
  const ring = best.loop, near = ring.reduce((m, p, i) => !m || p.distanceTo(quay) < m.d ? {i, d: p.distanceTo(quay)} : m, null).i;
  const tour = [quay.clone(), ...ring.slice(near), ...ring.slice(1, near + 1), quay.clone()];
  actor({name: 'Skiff', kind: 'Railboat', g, color: 0x2aa0b0, followDist: 0.05, meta: 'Arlesburgh Harbour',
    about: "Skiff is the little railboat who sails on the sea and runs on rails. Once Sailor John's boat, he helped Thomas search for Captain Calles' lost treasure; now, with his new owner Captain Joe, he gives railboat tours round Arlesburgh Harbour.",
    job: function*(a){ const sh = shift('10:00', '18:00');
      for(;;){ if(!onShift(sh)){ a.status = `Tied up at the jetty until ${fmtTime(nextOn(sh))}`; yield {until: nextOn(sh)}; continue; }
        a.status = 'Taking on passengers at the jetty'; yield {wait: 900};
        a.status = 'Giving a tour round Arlesburgh Harbour'; yield {follow: {pts: tour, speed: 3.2 * M}}; } },
    anim: a => { const tt = performance.now() / 1000; a.g.position.y = Math.sin(tt * 1.1) * 0.1 * M; a.g.rotation.set(Math.sin(tt * 0.6) * 0.03, a.yaw === undefined ? a.g.rotation.y : a.yaw, Math.sin(tt * 0.8) * 0.06 + (a.v > 1 * M ? 0.12 : 0), 'YXZ'); }});
}
function bulstrode(){
  if(!BEACH) return;
  const g = bulstrodeModel(); finish(g);
  g.position.set(BEACH.x, H(BEACH.x, BEACH.z) - 0.7 * M, BEACH.z); g.rotation.set(0.03, BEACH.yaw + 0.4, 0.07, 'YXZ');
  const kids = [];
  for(let k = 0; k < 5; k++){ const c = childModel([0xc8262b, 0x2a5aa8, 0xf2c419, 0x2e8b6e, 0x8a5ab2][k]); S.bakeVC(c); c.scale.setScalar(M); scene.add(c); kids.push({c, a: k * 1.3, r: 6 + k * 1.5, w: 0.25 + k * 0.05}); }
  actor({name: 'Bulstrode', kind: 'Barge', g, color: 0x1a1a1a, followDist: 0.06, meta: 'A beach near Knapford',
    about: "Bulstrode is the grumpy barge who used to carry coal and stone to Knapford Harbour, always complaining he was not loaded fast enough. When Percy pushed some trucks off the quay into his hold, his barging days ended: he was towed to this beach and made into a children's play boat. He is still here today, most likely still grumbling.",
    job: function*(a){ for(;;){ a.status = tod() > hm('09:00') && tod() < hm('18:30') ? 'Being a play boat for the children on the beach (and grumbling about it)' : 'Sitting on the beach for the night, grumbling'; yield {wait: 600}; } },
    anim: (a, dt) => { const day = tod() > hm('09:00') && tod() < hm('18:30'), near = camera.position.distanceTo(g.position) < 0.5;
      kids.forEach(k => { k.c.visible = day && near; if(!k.c.visible) return; k.a += dt * k.w; const x = BEACH.x + Math.cos(k.a) * k.r * M, z = BEACH.z + Math.sin(k.a) * k.r * 1.6 * M; k.c.position.set(x, H(x, z), z); k.c.rotation.y = -k.a; }); }});
}

// ================================================================== every frame
const _c = new V3();
let puffT = 0;
frameHooks.push(dt => {
  if(!READY){ if(window.SODOR_WORLD && window.SODOR_LIFE && window.SODOR_LIFE.roadFrame) init(); else return; }
  const b0 = dt * timeScale;
  puffT -= dt; const doPuff = puffT <= 0; if(doPuff) puffT = 0.35;
  for(const a of ACTORS){
    let b = b0, guard = 0;
    try {
      while(b > 1e-6 && guard++ < 40){
        if(!a.cmd){ const r = a.it.next(); a.cmd = r.done ? {wait: 1e9} : r.value; }
        b = step(a, a.cmd, b);
        if(a.cmd.done) a.cmd = null;
      }
    } catch(err){ console.error('crew.js', a.name, err); a.it = a.job(a); a.cmd = {wait: 300}; }
    if(a.road && a.rd) poseRoad(a, b0);
    else if(a.yaw !== undefined) a.g.rotation.set(a.pitch || 0, a.yaw, 0, 'YXZ');
    if(a.anim) a.anim(a, dt, b0);
    if(a.road && a.g.userData.fly) a.g.userData.fly.rotation.x += dt * (a.v > 0 || a.working ? 3 : 0);
    if(doPuff && (a.steam || a.chimney) && (a.v > 0 || a.working || a.sawing) && camera.position.distanceTo(a.g.position) < 0.5){
      const ch = a.chimney || a.g.userData.chimney; if(ch && K.puff){ _c.copy(ch); a.g.localToWorld(_c); K.puff(_c); }
    }
  }
});
window.SODOR_CREW = {ACTORS, AP, show: name => { const a = ACTORS.find(x => x.name === name); if(a) showActor(a); }, route: (f, t) => route(f, t)};
})();
