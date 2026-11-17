// Culdee Fell Railway: the Swiss-built rack engines, the Hunslet diesels, the coaches, Catherine and
// the "Trucks", with Kirk Machan sheds, Poll-ny-Chrink, the Skarloey Road Viaduct and the Summit hotel.
// Loaded after nwr.js; models are in metres and use its kit (window.SODOR_STD) and the shared train runner.
(function(){
'use strict';
const K = window.SODOR_KIT, S = window.SODOR_STD;
const line = LINES.culdeefell;
if(!K || !S || !line) return;
const {mat, add, box, cylZ, cylX, cylY, domeCap, roof, canvasTex, glassMat, brassMat} = K;
const {bakeVC, faceOn, letter, nameplate, lining, addWheels, finish, chimneyS, gable, findSite, siteKit, shedOver, building, label, bakeSite, depotGroup, allNWR, taken} = S;
const M = METRE, HGR = 0.43;                      // half gauge of the 800 mm line, rail centre to centre
const PURPLE = 0x5b2d82, ORANGE = 0xe8771e, BLACK = 0x18191b, BEAM = 0xb3201c, CREAM = 0xefe4c4, COACH = 0xd8691e, LIGHTGREY = 0xb4b7ba;
const hex = c => '#' + c.toString(16).padStart(6, '0');
const cfrGroup = new THREE.Group(); scene.add(cfrGroup);   // viaduct, lake, hotel

// ------------------------------------------------------------------ the rack engines
// Swiss Locomotive and Machine Works 0-4-2 rack tanks, as on the Snowdon Mountain Railway. The engine
// always stands at the downhill end, chimney uphill, pushing its coach; the boiler is tilted forward so
// that it lies level on the climb. Two pinions engage the Abt rack in the middle of the track.
const TILT = 0.1;
function rackEngine(o){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const newer = !!o.newer, L = newer ? 6.6 : 6.3, F = L / 2, R = -L / 2, W = 2.3, hw = W / 2, deck = 0.95;
  const C = mat(PURPLE, 0.4), LIN = mat(ORANGE, 0.4), BLK = mat(BLACK, 0.7), DRK = mat(0x2a2c30, 0.55), BM = mat(BEAM, 0.5), FIT = brassMat();
  const cabLen = newer ? 1.9 : 1.75, cabRear = R + 0.06, cabFront = cabRear + cabLen, roofY = newer ? 3.45 : 3.35;
  // outside frames, footplate, valances, bufferbeams
  for(const s of [-1, 1]) box(body, 0.08, 0.62, L - 0.3, BLK, s * 0.72, 0.6, 0);
  box(body, W, 0.07, L - 0.1, BLK, 0, deck, 0);
  for(const s of [-1, 1]) box(body, 0.04, 0.18, L - 0.2, C, s * (hw - 0.02), deck - 0.11, 0);
  for(const e of [1, -1]) box(body, W, 0.4, 0.12, BM, 0, 0.78, e * (F - 0.06));
  box(body, 0.95, 0.5, 0.16, BLK, 0, 0.85, F + 0.05);                 // pushing plate for the coach
  cylZ(body, 0.17, 0.17, 0.22, BLK, 0, 0.82, R - 0.1, 14);
  // tilted boiler, smokebox, chimney, dome
  const tilt = new THREE.Group(); tilt.rotation.x = TILT; body.add(tilt);
  const by = 1.78, br = 0.5, sbF = F - 0.42, sbLen = 0.72, bz0 = cabFront, bz1 = sbF - sbLen;
  cylZ(tilt, br, br, bz1 - bz0, C, 0, by, (bz0 + bz1) / 2, 28);
  for(let k = 0; k <= 3; k++) cylZ(tilt, br + 0.012, br + 0.012, 0.05, LIN, 0, by, bz0 + 0.1 + k * (bz1 - bz0 - 0.2) / 3, 28);
  cylZ(tilt, br + 0.05, br + 0.05, sbLen, DRK, 0, by, sbF - sbLen / 2, 28);
  cylZ(tilt, br + 0.07, br + 0.07, 0.05, mat(0x3b3d41, 0.4), 0, by, sbF + 0.01, 28);
  box(tilt, 0.7, by - deck, sbLen * 0.8, DRK, 0, (by + deck) / 2, sbF - sbLen / 2);
  faceOn(tilt, br * 0.95, o.face, 0, by, sbF + 0.045);
  const chim = newer ? {top: by + br + 1.0, r: 0.2, cap: 0xc9a23a} : {top: by + br + 1.25, r: 0.18, type: 'stovepipe'};
  chimneyS(tilt, chim, 0, by + br - 0.04, sbF - sbLen * 0.5);
  cylY(tilt, 0.27, 0.3, 0.26, C, 0, by + br + 0.08, bz0 + (bz1 - bz0) * 0.55, 18);
  domeCap(tilt, 0.27, C, 0, by + br + 0.21, bz0 + (bz1 - bz0) * 0.55);
  for(const s of [-1, 1]) cylY(tilt, 0.045, 0.06, 0.24, FIT, s * 0.1, by + br + 0.1, bz0 + 0.25, 10);
  cylY(tilt, 0.03, 0.03, 0.3, FIT, 0.2, by + br + 0.12, bz0 + 0.1, 8);
  for(const s of [-1, 1]) cylZ(tilt, 0.02, 0.02, bz1 - bz0 + 0.3, mat(0xd0d3d6, 0.25, 0.85), s * (br + 0.07), by + 0.25, (bz0 + bz1) / 2, 6);
  // side tanks, level with the frames, with red nameplates
  const tz1 = newer ? 1.95 : 1.75, tTop = newer ? 2.05 : 1.95, tw = 0.42;
  for(const s of [-1, 1]) box(body, tw, tTop - deck, tz1 - cabFront, C, s * (hw - tw / 2), (tTop + deck) / 2, (tz1 + cabFront) / 2);
  lining(body, LIN, hw, deck, tTop, cabFront, tz1, 0.07, 0.03);
  nameplate(body, o.name.toUpperCase(), '#b3201c', '#e7c35a', '#d4af37', Math.min(1.5, 0.22 * o.name.length + 0.3), 0.22, hw, (tTop + deck) / 2 + 0.05, (tz1 + cabFront) / 2);
  // cab: low sides, big openings, roof; number in yellow on the sides and back
  for(const s of [-1, 1]){
    box(body, 0.05, 1.05, cabLen, C, s * (hw - 0.025), deck + 0.52, cabRear + cabLen / 2);
    for(const zz of [cabRear + 0.08, cabFront - 0.1]) box(body, 0.05, roofY - deck, 0.16, C, s * (hw - 0.025), (roofY + deck) / 2, zz);
    box(body, 0.06, 0.04, cabLen, LIN, s * (hw - 0.02), deck + 1.03, cabRear + cabLen / 2);
  }
  box(body, W - 0.04, roofY - deck, 0.06, C, 0, (roofY + deck) / 2, cabFront);
  for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.5, 0.55), glassMat(), s * 0.7, roofY - 0.55, cabFront + 0.035); box(body, 0.6, 0.65, 0.05, LIN, s * 0.7, roofY - 0.55, cabFront + 0.005); }
  box(body, W - 0.04, roofY - deck - 0.9, 0.06, C, 0, roofY - (roofY - deck - 0.9) / 2, cabRear);
  box(body, W - 0.04, 0.9, 0.06, C, 0, deck + 0.45, cabRear);
  for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.55, 0.55), glassMat(), s * 0.55, roofY - 0.6, cabRear - 0.035); w.rotation.y = Math.PI; }
  roof(body, W + 0.1, cabLen + 0.35, roofY + 0.12, mat(newer ? 0x3a3c40 : PURPLE, 0.55), cabRear + cabLen / 2);
  box(body, W - 0.5, roofY - deck - 0.2, cabLen - 0.25, mat(0x141414, 0.95), 0, (roofY + deck) / 2, cabRear + cabLen / 2);
  letter(body, String(o.no), 'yellow', 0.4, hw - 0.025, deck + 0.55, cabRear + cabLen / 2);
  const bn = add(body, new THREE.PlaneGeometry(0.4, 0.5), mat(PURPLE, 0.4), 0, deck + 0.5, cabRear - 0.04); bn.rotation.y = Math.PI;
  const back = add(body, new THREE.PlaneGeometry(0.6, 0.6), S_paint(String(o.no)), 0, deck + 0.5, cabRear - 0.045); back.rotation.y = Math.PI;
  // cylinders at the back, driving forward to rocking levers and the pinion axles
  for(const s of [-1, 1]){
    const cyl = cylZ(body, 0.2, 0.2, 0.7, C, s * (hw - 0.05), 1.3, cabRear + 0.7, 14); cyl.rotation.x = Math.PI / 2 + 0.15;
    box(body, 0.06, 0.12, 1.6, mat(0xa6a9ad, 0.3, 0.75), s * (hw - 0.05), 1.18, cabRear + 1.8);
    box(body, 0.1, 0.55, 0.12, BLK, s * (hw - 0.05), 0.95, cabRear + 2.65);
  }
  lamp(body, -0.6, deck, F - 0.12);
  // wheels: two pinion axles and a trailing axle under the cab
  const axles = addWheels(root, [{z: 1.75, r: 0.33, c: 1, pinion: 1}, {z: 0.15, r: 0.33, c: 1, pinion: 1}, {z: -2.25, r: 0.27}], {color: BLACK, spokes: 8, hg: HGR, rodOut: 0.38});
  const v = finish(root, body, axles, 0x9fa2a6);
  v.len = L + 0.4;
  v.chimneyAt = new THREE.Vector3(0, chim.top, sbF - sbLen * 0.5).applyEuler(tilt.rotation);
  return v;
}
function lamp(p, x, y, z){
  box(p, 0.22, 0.28, 0.18, mat(0xe9e9e6, 0.5), x, y + 0.14, z);
  cylZ(p, 0.07, 0.07, 0.03, mat(0xf4efd0, 0.2), x, y + 0.15, z + 0.1, 12);
}
const paintCache = new Map();
function S_paint(text){
  if(paintCache.has(text)) return paintCache.get(text);
  const m = new THREE.MeshStandardMaterial({roughness: 0.45, alphaTest: 0.45, map: canvasTex(128, 128, (g, w, h) => {
    g.font = 'bold 100px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2c419'; g.fillText(text, w / 2, h / 2 + 4);
  })});
  paintCache.set(text, m);
  return m;
}

// Hunslet rack diesels: a cab at the uphill end, the engine compartment behind it.
function rackDiesel(o){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 6.8, F = L / 2, W = 2.3, hw = W / 2, deck = 0.95;
  const C = mat(PURPLE, 0.42), LIN = mat(ORANGE, 0.4), BLK = mat(BLACK, 0.7);
  for(const s of [-1, 1]) box(body, 0.08, 0.62, L - 0.3, BLK, s * 0.72, 0.6, 0);
  box(body, W, 0.08, L - 0.1, BLK, 0, deck, 0);
  for(const e of [1, -1]) box(body, W, 0.4, 0.12, mat(BEAM, 0.5), 0, 0.78, e * (F - 0.06));
  box(body, 0.95, 0.5, 0.16, BLK, 0, 0.85, F + 0.05);
  const cz0 = F - 2.1, cz1 = F - 0.15, top = 3.3;
  box(body, W - 0.1, top - deck, cz1 - cz0, C, 0, (top + deck) / 2, (cz0 + cz1) / 2);
  roof(body, W, cz1 - cz0 + 0.2, top + 0.1, mat(0x3a3c40, 0.55), (cz0 + cz1) / 2);
  box(body, W - 0.3, 1.5, cz0 + F - 0.3, C, 0, deck + 0.75, (cz0 - F + 0.3) / 2);
  roof(body, W - 0.3, cz0 + F - 0.3, deck + 1.6, C, (cz0 - F + 0.3) / 2);
  for(let k = 0; k < 4; k++) for(const s of [-1, 1]) box(body, 0.012, 0.9, 0.04, mat(0x111111, 0.7), s * (hw - 0.14), deck + 0.75, -F + 0.6 + k * 0.7);
  for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.75, 0.75), glassMat(), s * 0.5, top - 0.75, cz1 + 0.01); }
  for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(1.2, 0.7), glassMat(), s * (hw - 0.045), top - 0.75, (cz0 + cz1) / 2); w.rotation.y = s * Math.PI / 2; }
  for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.6, 0.55), glassMat(), s * 0.55, top - 0.75, cz0 - 0.01); w.rotation.y = Math.PI; }
  lining(body, LIN, hw - 0.05, deck + 0.05, top - 0.05, cz0, cz1, 0.08, 0.03);
  faceOn(body, 0.5, o.face, 0, deck + 0.85, cz1 + 0.02);
  letter(body, String(o.no), 'yellow', 0.36, hw - 0.05, deck + 0.7, (cz0 + cz1) / 2);
  cylY(body, 0.08, 0.09, 0.45, BLK, 0.4, deck + 1.8, -F + 1.0, 10);
  lamp(body, -0.6, deck, F - 0.12);
  const axles = addWheels(root, [{z: 1.6, r: 0.33, pinion: 1}, {z: -1.6, r: 0.33, pinion: 1}], {color: BLACK, spokes: 0, hg: HGR});
  const v = finish(root, body, axles);
  v.len = L + 0.4;
  return v;
}

// ------------------------------------------------------------------ coaches and the "Trucks"
function bogies(body, L, list, bz = 3.6){
  const BLK = mat(BLACK, 0.7);
  for(const e of [1, -1]){
    for(const s of [-1, 1]) box(body, 0.08, 0.35, 1.9, BLK, s * 0.62, 0.5, e * bz);
    list.push({z: e * bz + 0.6, r: 0.3, pinion: 1}, {z: e * bz - 0.6, r: 0.3});
  }
  for(const s of [-1, 1]) box(body, 0.1, 0.25, L - 0.2, BLK, s * 1.1, 0.88, 0);
  for(const e of [1, -1]){ box(body, 2.3, 0.3, 0.12, mat(BEAM, 0.5), 0, 0.82, e * (L / 2 - 0.06)); box(body, 0.8, 0.4, 0.12, BLK, 0, 0.85, e * (L / 2 + 0.02)); }
}
// Open-sided coach: roof on posts over cross-benches, waterproof curtains rolled up under the eaves.
function openCoach(o){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 11.0, F = L / 2, W = 2.4, hw = W / 2, floor = 1.05, top = 3.15;
  const C = mat(COACH, 0.5), CR = mat(CREAM, 0.6), LIN = o.lining === undefined ? mat(0x6a2a10, 0.5) : mat(o.lining, 0.45), WOOD = mat(0x7a5a38, 0.7);
  const list = [];
  bogies(body, L, list);
  box(body, W, 0.1, L - 0.2, C, 0, floor, 0);
  const n = 7, pitch = (L - 0.6) / n;
  for(const s of [-1, 1]){
    box(body, 0.06, 0.85, L - 0.3, C, s * (hw - 0.03), floor + 0.47, 0);
    box(body, 0.065, 0.04, L - 0.4, LIN, s * (hw - 0.025), floor + 0.82, 0);
    for(let k = 0; k <= n; k++) box(body, 0.08, top - floor, 0.08, C, s * (hw - 0.04), (top + floor) / 2, -F + 0.3 + k * pitch);
    box(body, 0.1, 0.32, L - 0.4, CR, s * (hw - 0.03), top - 0.2, 0);
  }
  for(let k = 0; k < n; k++){ box(body, W - 0.3, 0.45, 0.4, WOOD, 0, floor + 0.3, -F + 0.3 + (k + 0.5) * pitch); box(body, W - 0.3, 0.5, 0.08, WOOD, 0, floor + 0.65, -F + 0.3 + (k + 0.5) * pitch - 0.2); }
  for(const e of [1, -1]){
    box(body, W, top - floor, 0.08, C, 0, (top + floor) / 2, e * (F - 0.12));
    for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.7, 0.8), glassMat(), s * 0.55, top - 0.75, e * (F - 0.07)); if(e < 0) w.rotation.y = Math.PI; }
  }
  roof(body, W + 0.12, L + 0.1, top + 0.3, mat(0x8a8d91, 0.6), 0);
  letter(body, String(o.no), 'cream', 0.28, hw, floor + 0.45, F - 1.2);
  const axles = addWheels(root, list, {color: BLACK, spokes: 0, hg: HGR});
  const v = finish(root, body, axles);
  v.len = L + 0.3;
  return v;
}
// Catherine: an enclosed coach, orange below and cream above, with a face at the downhill end.
function catherine(){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 11.0, F = L / 2, W = 2.4, hw = W / 2, floor = 1.05, top = 3.15;
  const list = [];
  bogies(body, L, list);
  box(body, W, top - floor, L - 0.24, mat(COACH, 0.5), 0, (top + floor) / 2, 0);
  const tex = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = hex(COACH); g.fillRect(0, 0, w, h);
    g.fillStyle = hex(CREAM); g.fillRect(0, 0, w, h * 0.62);
    for(let k = 0; k < 8; k++){ const x = 30 + k * 122; g.fillStyle = '#1b2731'; g.fillRect(x, h * 0.12, 92, h * 0.42); g.strokeStyle = '#8a4a1a'; g.lineWidth = 4; g.strokeRect(x, h * 0.12, 92, h * 0.42); }
    g.fillStyle = '#7a3a12'; g.fillRect(0, h * 0.62, w, 5);
    g.fillStyle = '#efe4c4'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center'; g.fillText('4', w * 0.88, h * 0.86);
  });
  K.sidePlatesTex(body, tex, L - 0.3, top - floor - 0.04, hw + 0.006, (top + floor) / 2, 0);
  roof(body, W + 0.12, L + 0.1, top + 0.3, mat(0x8a8d91, 0.6), 0);
  faceOn(body, 0.7, {smile: 0.6, lashes: true, brow: 0.1}, 0, floor + 1.05, -F + 0.1, true);
  const axles = addWheels(root, list, {color: BLACK, spokes: 0, hg: HGR});
  const v = finish(root, body, axles);
  v.len = L + 0.3;
  return v;
}
// The "Trucks": a flat wagon with a guard's compartment and water tank at the front, and a drop-sided open wagon.
function truck(kind){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 10.5, F = L / 2, W = 2.4, hw = W / 2, floor = 1.05, G = mat(LIGHTGREY, 0.6), BR = mat(0x6e4a33, 0.55);
  const list = [];
  bogies(body, L, list, 3.4);
  box(body, W, 0.12, L - 0.2, G, 0, floor, 0);
  if(kind === 'guard'){
    box(body, W - 0.1, 2.0, 2.4, BR, 0, floor + 1.0, F - 1.4);
    roof(body, W, 2.6, floor + 2.2, G, F - 1.4);
    for(const s of [-1, 1]){ const w = add(body, new THREE.PlaneGeometry(0.6, 0.5), glassMat(), s * (hw - 0.04), floor + 1.4, F - 1.4); w.rotation.y = s * Math.PI / 2; }
    add(body, new THREE.PlaneGeometry(1.4, 0.5), glassMat(), 0, floor + 1.4, F - 0.18);
    cylZ(body, 0.6, 0.6, 2.2, G, 0, floor + 0.7, F - 4.0, 18);
    for(let k = 0; k < 3; k++) box(body, 1.0, 0.6, 0.9, mat(0x8a6a44, 0.8), 0, floor + 0.36, -F + 1.0 + k * 1.1);
  } else {
    for(const s of [-1, 1]) for(let k = 0; k < 3; k++) box(body, 0.06, 0.7, (L - 0.4) / 3 - 0.06, G, s * (hw - 0.03), floor + 0.4, -L / 3 + k * (L - 0.4) / 3);
    for(const e of [1, -1]) box(body, W, 0.7, 0.06, G, 0, floor + 0.4, e * (F - 0.15));
    for(let k = 0; k < 5; k++){ const b = box(body, 0.7, 0.35, 0.9, mat(0x8a857c, 0.9), (k % 2 - 0.5) * 0.8, floor + 0.3, -F + 1.2 + k * 1.9); b.rotation.y = k; }
  }
  const axles = addWheels(root, list, {color: BLACK, spokes: 0, hg: HGR});
  const v = finish(root, body, axles);
  v.len = L + 0.3;
  return v;
}

// ------------------------------------------------------------------ who is who
const ENG = [
  {id: 'godred', name: 'Godred', no: 1, basis: "the Snowdon Mountain Railway's No. 1 L.A.D.A.S.", face: {smile: 0.25, brow: 0.8, thick: true, look: 0.4}, dot: 0x6a3a92, former: true,
    about: 'the proud first engine who ignored the rules of the mountain. On the opening day he came off the rack and fell down the mountainside; what was left of him was kept to give spare parts to the others.'},
  {id: 'ernest', name: 'Ernest', no: 2, basis: "the Snowdon Mountain Railway's No. 2 Enid", face: {smile: 0.6, brow: -0.2}, dot: 0x7a4aa2,
    about: 'one of the five original engines, who arrived from Switzerland in 1900.'},
  {id: 'wilfred', name: 'Wilfred', no: 3, basis: "the Snowdon Mountain Railway's No. 3 Wyddfa", face: {smile: -0.1, brow: 0.5, look: -0.3}, dot: 0x6a3a8a,
    about: 'one of the five original engines who arrived from Switzerland in 1900.'},
  {id: 'culdee', name: 'Culdee', no: 4, basis: "the Snowdon Mountain Railway's No. 4 Snowdon", face: {smile: 0.7, brow: -0.3}, dot: 0x5b2d82,
    about: 'the wise mountain engine who works with his coach Catherine, and who teaches the others the ways of the mountain.'},
  {id: 'shane', name: 'Shane Dooiney', no: 5, basis: "the Snowdon Mountain Railway's No. 5 Moel Siabod", face: {smile: 0.5, look: 0.3}, dot: 0x8a5ab2,
    about: 'the last of the five original engines, named after one of the fells.'},
  {id: 'patrick', name: 'Patrick', no: 6, basis: "the Snowdon Mountain Railway's No. 6 Padarn", face: {smile: 0.6, brow: 0.2}, dot: 0x9a6ac2, newer: true,
    about: 'the first of three newer and more powerful engines ordered in 1961; he first carried the name Lord Harry.'},
  {id: 'alaric', name: 'Alaric', no: 7, basis: "the Snowdon Mountain Railway's No. 7 Ralph", face: {smile: 0.4, brow: 0.3, look: -0.3}, dot: 0x5a2a6a, newer: true,
    about: 'one of the three newer engines, who also works the goods trains with the "Trucks".'},
  {id: 'eric', name: 'Eric', no: 8, basis: "the Snowdon Mountain Railway's No. 8 Eryri", face: {smile: 0.85, wide: true}, dot: 0x7a3a9a, newer: true,
    about: 'the youngest of the three newer engines.'},
];
const DIESELS = [
  {id: 'diesel9', name: 'Diesel No. 9', no: 9, face: {smile: 0.3, brow: 0.1}, dot: 0x4a2a6a},
  {id: 'diesel10', name: 'Diesel No. 10', no: 10, face: {smile: 0.5, brow: -0.1}, dot: 0x3a1a5a},
];
const COACHES = [1, 2, 3, 5].map(no => ({id: 'coach' + no, no, lining: no === 1 ? PURPLE : undefined}));
const byId = {};
ENG.forEach(e => byId[e.id] = e); DIESELS.forEach(e => byId[e.id] = e);
function scaleAdd(v){ v.group.scale.setScalar(M); scene.add(v.group); return v; }

// Each train works one stretch of the line: engine below, coach above.
const RUNS = [
  {id: 'ernest', from: 'Kirk Machan', to: 'Shiloh', cars: () => [openCoach(COACHES[1])], carNames: ['Coach No. 2'], job: 'passenger trains from Kirk Machan to Shiloh'},
  {id: 'culdee', from: 'Shiloh', to: 'Skarloey Road', cars: () => [catherine()], carNames: ['Catherine'], job: 'passenger trains past Poll-ny-Chrink and over the Skarloey Road Viaduct'},
  {id: 'patrick', from: 'Skarloey Road', to: "Devil's Back", cars: () => [openCoach(COACHES[2])], carNames: ['Coach No. 3'], job: "passenger trains up to Devil's Back"},
  {id: 'alaric', from: "Devil's Back", to: 'Culdee Fell Summit', cars: () => [truck('guard'), truck('open')], carNames: ['The "Trucks" (guard\'s wagon)', 'The "Trucks" (open wagon)'], job: 'the goods train with the "Trucks", taking supplies to the Summit hotel', goods: true},
];
const RUNNERS = [];
const stockPick = [];
RUNS.forEach(run => {
  const e = byId[run.id], eng = scaleAdd(rackEngine(e));
  const cars = run.cars().map(scaleAdd);
  const uA = K.lineU(line, run.from), uB = K.lineU(line, run.to);
  const R = K.makeRunner({line, uA, uB, unit: [eng], cars, scale: M, gap: 0.15 * M, vmax: 3.4 * M, passenger: !run.goods,
    loopW: 3 * M, lane: 0, bedM: 2.4, diesel: false, noRunRound: true, side: uB >= uA ? 'A' : 'B'});
  e.veh = eng; e.runner = R; e.run = run;
  K.addMarker(R, e.dot, () => showEngine(e));
  K.RUNNERS.push(R); RUNNERS.push(R);
  K.tagPick(eng.group, () => showEngine(e));
  cars.forEach((v, i) => { const kind = run.carNames[i].startsWith('Catherine') ? 'catherine' : run.carNames[i].startsWith('The') ? 'trucks' : 'coaches'; v.name = run.carNames[i]; stockPick.push({kind, v, run}); K.tagPick(v.group, () => showStock(kind, v, run)); });
});

// ------------------------------------------------------------------ Kirk Machan: engine shed, carriage shed and workshops
// Just north of the station, to the right of the line going up the mountain.
const sheds = (function(){
  const roads = [
    {ids: ['wilfred', 'shane']},
    {ids: ['eric', 'diesel9']},
    {ids: ['diesel10']},
    {coaches: [COACHES[0], COACHES[3]]},
    {godred: true},
  ];
  const len = 60, shedLen = 24, wid = roads.length * 5 + 16;
  const site = findSite('Kirk Machan', 'culdeefell', len, wid);
  const kit = siteKit(site), G = kit.G, lx = kit.lx;
  const parked = [];
  roads.forEach((r, i) => {
    const b = 3 + i * 5;
    kit.road(0, b, r.godred ? 26 : len, b, 'rack');
    let vehicles = [];
    if(r.ids) vehicles = r.ids.map(id => { const e = byId[id]; e.veh = scaleAdd(e.no >= 9 && DIESELS.includes(e) ? rackDiesel(e) : rackEngine(e)); e.home = 'Kirk Machan sheds'; K.tagPick(e.veh.group, () => showEngine(e)); return e.veh; });
    if(r.coaches) vehicles = r.coaches.map(c => { const v = scaleAdd(openCoach(c)); v.name = 'Coach No. ' + c.no; K.tagPick(v.group, () => showStock('coaches', v, null)); stockPick.push({kind: 'coaches', v}); return v; });
    if(r.godred){
      const e = byId.godred, v = scaleAdd(rackEngine(e));
      v.axles.forEach(a => a.g.visible = false); v.rods.forEach(rd => rd.mesh.visible = false); v.axles = []; v.rods = [];
      e.veh = v; e.home = 'the Kirk Machan workshops'; K.tagPick(v.group, () => showEngine(e));
      for(const zz of [-2, 0, 2]) box(G, 2.0, 0.55, 0.5, mat(0x6b4a2e, 0.85), lx(b), 0.27, 12 + zz);
      vehicles = [v];
      kit.row(vehicles, 9, b, 1, 0);
      v.group.position.y += 0.5 * M;
    } else kit.row(vehicles, 3, b, 1, 0);
    vehicles.forEach(v => { allNWR.push({v, parked: true}); parked.push(v); });
    // engines and coaches on these roads are shunted and put away by ops.js
    if(r.ids || r.coaches) K.yards.push({label: 'Kirk Machan sheds', rail: 'cfr', units: vehicles.map(v => [v]), ids: r.ids || r.coaches.map(() => 'coach'),
      recs: r.ids ? r.ids.map(id => byId[id]) : null, at: (s, out) => out.copy(kit.pt(s, b)), yaw: kit.yaw + Math.PI, face: -1, sMin: 1, sMax: len - 1, shed: len - shedLen});
  });
  shedOver(kit, 4, len - shedLen, len, 6.5, 0x8a7a6a, 0x3a3f46);
  building(G, lx(3 + 5 * 5 + 4), 13, 9, 16, 6, 0x9a8a78, 0x4a4f58);                // workshops beside Godred's road
  bakeSite(G); depotGroup.add(G);
  const c = kit.pt(kit.lenM / 2, kit.widM / 2), rad = Math.hypot(kit.lenM, kit.widM) / 2 * M;
  K.clearArea(c.x, c.z, rad + 6 * M);
  taken.push({x: c.x, z: c.z, r: rad + 4 * M});
  label('Culdee Fell Railway Engine Sheds', c.clone().setY(c.y + 24 * M));
  return {center: c};
})();

// ------------------------------------------------------------------ Skarloey Road Viaduct
// Ten stone arches carry the line over the gap cut for the road to Skarloey, just below Skarloey Road station.
const viaduct = (function(){
  const V = line.real.viaduct; if(!V) return null;
  const R = line.real, STONE = mat(0x8a8174, 0.9), DARK = mat(0x6e675c, 0.9), g = new THREE.Group();
  const P = j => new THREE.Vector3(R.x[j], R.y[j], R.z[j]);
  const p0 = P(V.j0), p1 = P(V.j1), spanLen = p0.distanceTo(p1) / M, n = 10, s = spanLen / n, width = 3.6, deckT = 1.2;
  const dir = p1.clone().sub(p0); dir.y = 0; dir.normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  const trackY = f => { const j = V.j0 + (V.j1 - V.j0) * f, i = Math.min(R.n - 2, Math.floor(j)); return R.y[i] + (R.y[i + 1] - R.y[i]) * (j - i); };
  for(let k = 0; k < n; k++){
    const c = p0.clone().lerp(p1, (k + 0.5) / n), y0 = trackY(k / n), y1 = trackY((k + 1) / n);
    let ground = Infinity;
    for(const f of [-0.5, 0, 0.5]){ const q = c.clone().addScaledVector(dir, f * s * M); ground = Math.min(ground, Math.max(0, heightAt(q.x, q.z))); }
    // from 1.5 m below the ground up to just under the rails, the top following the climb
    const yb = ground - 1.5 * M, H0 = (y0 - 0.1 * M - yb) / M, H1 = (y1 - 0.1 * M - yb) / M;
    const pier = 0.9, r = s / 2 - pier, spring = Math.max(0.6, Math.min(H0, H1) - deckT - r - 1.5);
    const shp = new THREE.Shape();
    shp.moveTo(-s / 2, 0); shp.lineTo(-s / 2 + pier, 0); shp.lineTo(-s / 2 + pier, spring);
    shp.absarc(0, spring, r, Math.PI, 0, true);
    shp.lineTo(s / 2 - pier, 0); shp.lineTo(s / 2, 0); shp.lineTo(s / 2, H0); shp.lineTo(-s / 2, H1); shp.closePath();
    const geo = new THREE.ExtrudeGeometry(shp, {depth: width, bevelEnabled: false, curveSegments: 14});
    geo.translate(0, 0, -width / 2); geo.rotateY(Math.PI / 2);            // shape +x now points back towards the start of the span
    const m = new THREE.Mesh(geo, STONE);
    m.position.set(c.x, yb, c.z); m.rotation.y = yaw; m.scale.setScalar(M);
    g.add(m);
    const pitch = Math.atan2(y1 - y0, s * M);
    for(const side of [-1, 1]){
      const par = box(g, 0.4 * M, 1.0 * M, s * M, DARK, 0, 0, 0);
      par.position.set(c.x + Math.cos(yaw) * side * (width / 2 + 0.2) * M, (y0 + y1) / 2 + 0.3 * M, c.z - Math.sin(yaw) * side * (width / 2 + 0.2) * M);
      par.rotation.order = 'YXZ'; par.rotation.set(-pitch, yaw, 0);
    }
  }
  // embankments under the approach ramps, so the raised track does not float
  // each sample gives four vertices (left top, left toe, right top, right toe); consecutive samples make the two slopes
  const vp = [], ix = [], half = 1.5, toe = 1.6, rampN = Math.round(V.ramp / 6) + 3;
  for(const [ja, jb] of [[V.j0 - rampN, V.j0 + 1], [V.j1 - 1, V.j1 + rampN]]){
    let prev = -1;
    for(let j = Math.max(1, ja); j <= Math.min(R.n - 2, jb); j++){
      const t = new THREE.Vector3(R.x[j + 1] - R.x[j - 1], 0, R.z[j + 1] - R.z[j - 1]).normalize(), nx = t.z, nz = -t.x;
      const gnd = Math.max(0, heightAt(R.x[j], R.z[j])), h = R.y[j] - 0.6 * M - gnd;
      if(h < 0.2 * M){ prev = -1; continue; }
      const b = vp.length / 3, w = (half + toe * h / M) * M;
      for(const sd of [-1, 1]){
        vp.push(R.x[j] + nx * sd * half * M, R.y[j] - 0.6 * M, R.z[j] + nz * sd * half * M);
        vp.push(R.x[j] + nx * sd * w, gnd - 0.5 * M, R.z[j] + nz * sd * w);
      }
      if(prev >= 0) for(const q of [0, 2]) ix.push(prev + q, prev + q + 1, b + q, prev + q + 1, b + q + 1, b + q);
      prev = b;
    }
  }
  if(ix.length){
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); eg.setIndex(ix); eg.computeVertexNormals();
    const em = new THREE.Mesh(eg, new THREE.MeshStandardMaterial({color: 0x6f8a4a, roughness: 0.95, side: THREE.DoubleSide})); em.receiveShadow = true; g.add(em);
  }
  // the road to Skarloey, through the middle arch
  const mid = p0.clone().lerp(p1, 0.5), across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), rv = [], ri = [];
  for(let k = -14; k <= 14; k++){
    const q = mid.clone().addScaledVector(across, k * 6 * M), h = Math.max(0, heightAt(q.x, q.z)) + 0.15 * M, b = rv.length / 3;
    rv.push(q.x + dir.x * 3 * M, h, q.z + dir.z * 3 * M, q.x - dir.x * 3 * M, h, q.z - dir.z * 3 * M);
    if(k > -14) ri.push(b - 2, b - 1, b, b - 1, b + 1, b);
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3)); rg.setIndex(ri); rg.computeVertexNormals();
  g.add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({color: 0x5a5a58, roughness: 0.9, side: THREE.DoubleSide})));
  g.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.userData.onPick = () => showPlace('viaduct'); clickable.push(o); } });
  cfrGroup.add(g);
  K.clearArea(mid.x, mid.z, 90 * M);
  return {center: mid, label: label('Skarloey Road Viaduct', mid.clone().setY(mid.y + 22 * M))};
})();

// ------------------------------------------------------------------ Poll-ny-Chrink
// "The Pool on the Hillside": a thousand-foot lake the line skirts just before Skarloey Road.
const lake = (function(){
  // The map's fellside is steep, so look along the line for the flattest hollow beside it, and keep the water
  // within a few metres of the ground there (it must never cover the track).
  const uSR = K.lineU(line, 'Skarloey Road');
  let best = null;
  for(const back of [600, 750, 900, 1050, 1200, 1400]) for(const side of [-1, 1]) for(const off of [130, 180, 240, 300]){
    const u = uSR - back * M / line.real.len;
    const p = realAt(line, u, new THREE.Vector3()), t = realDir(line, u, new THREE.Vector3()); t.y = 0; t.normalize();
    const c = p.clone().addScaledVector(new THREE.Vector3(t.z, 0, -t.x), side * off * M);
    let lo = Infinity, hi = -Infinity;
    for(let i = -4; i <= 4; i++) for(let k = -4; k <= 4; k++){ const h = heightAt(c.x + i * 22 * M, c.z + k * 22 * M); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if(lo < 0 || p.y - 2 * M < lo + 4 * M) continue;                     // keep below the line
    if(!best || hi - lo < best.flat) best = {c, lo, flat: hi - lo};
  }
  if(!best) return null;
  // An oval pool lying along the contour, its downhill side held by a grassy bank down to the fellside.
  const cx = best.c.x, cz = best.c.z, gx = heightAt(cx + 40 * M, cz) - heightAt(cx - 40 * M, cz), gz = heightAt(cx, cz + 40 * M) - heightAt(cx, cz - 40 * M);
  const gl = Math.hypot(gx, gz) || 1, ux = -gz / gl, uz = gx / gl;           // along the contour
  const vx = gx / gl, vz = gz / gl, slope = gl / (80 * M);                    // uphill direction and gradient
  let RA = 140 * M, RB = 26 * M;
  const at = (a, b) => [cx + ux * a + vx * b, cz + uz * a + vz * b];
  for(let tries = 0; tries < 6; tries++){                                    // shrink until it is clear of the line
    let clear = true;
    for(let k = 0; k < 24 && clear; k++){ const th = k / 24 * Math.PI * 2; for(const f of [0.5, 1]){ const [x, z] = at(RA * f * Math.cos(th), RB * f * Math.sin(th)); if(K.nearTrack(x, z, 20 * M)) clear = false; } }
    if(clear) break;
    RA *= 0.8; RB *= 0.85;
  }
  const level = heightAt(cx, cz) + RB * slope * 0.9;                       // the uphill shore meets the fellside
  const geo = new THREE.CircleGeometry(1, 56); geo.rotateX(-Math.PI / 2); geo.scale(RA, 1, RB);
  const bank = [], bix = [];
  for(let k = 0; k <= 56; k++){
    const th = k / 56 * Math.PI * 2, [x, z] = at(RA * Math.cos(th), RB * Math.sin(th)), g0 = heightAt(x, z), q = bank.length / 3;
    bank.push(x, level + 0.3 * M, z, x, Math.min(level, g0) - 0.6 * M, z);
    if(k) bix.push(q - 2, q - 1, q, q - 1, q + 1, q);
  }
  const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: 0x3f7fa8, roughness: 0.12, metalness: 0.15}));
  water.position.set(cx, level, cz); water.rotation.y = Math.atan2(-uz, ux);
  water.receiveShadow = true; water.userData.onPick = () => showPlace('lake'); clickable.push(water);
  cfrGroup.add(water);
  if(bix.length){
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bank, 3)); bg.setIndex(bix); bg.computeVertexNormals();
    const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({color: 0x6f8a4a, roughness: 0.95, side: THREE.DoubleSide})); bm.receiveShadow = true; cfrGroup.add(bm);
  }
  for(let k = 0; k < 18; k++){                                             // reeds round the shore
    const th = k / 18 * Math.PI * 2 + 0.2, [x, z] = at(RA * 1.02 * Math.cos(th), RB * 1.04 * Math.sin(th));
    const r = new THREE.Mesh(new THREE.ConeGeometry(1.2 * M, 2.4 * M, 5), mat(0x5f7a3a, 0.9)); r.position.set(x, Math.max(level, heightAt(x, z)) + 1.0 * M, z); cfrGroup.add(r);
  }
  K.clearArea(cx, cz, RA + 10 * M);
  const c = new THREE.Vector3(cx, level, cz);
  return {center: c, label: label('Poll-ny-Chrink', c.clone().setY(level + 20 * M))};
})();

// ------------------------------------------------------------------ the Summit: buffer stops and the hotel behind them
const summit = (function(){
  const p = realAt(line, 1, new THREE.Vector3()), t = realDir(line, 1, new THREE.Vector3()); t.y = 0; t.normalize();
  const g = new THREE.Group(); g.position.copy(p); g.position.y = Math.max(0, heightAt(p.x, p.z)); g.rotation.y = Math.atan2(t.x, t.z); g.scale.setScalar(M);
  for(const s of [-1, 1]) box(g, 0.2, 1.0, 0.2, mat(0x6b4a2e, 0.8), s * 0.6, 0.9, 2.5);
  box(g, 1.8, 0.35, 0.3, mat(BEAM, 0.5), 0, 1.2, 2.6);
  const STONE = mat(0x8a8478, 0.9);
  box(g, 26, 4.6, 10, STONE, 0, 2.0, 12);
  box(g, 26.6, 0.5, 10.6, mat(0x5a5f66, 0.75), 0, 4.55, 12);           // low, stoutly built: a nearly flat slate roof
  box(g, 26.8, 0.25, 10.8, mat(0x6e6a60, 0.9), 0, 4.85, 12);
  for(let k = 0; k < 7; k++){ const w = add(g, new THREE.PlaneGeometry(1.4, 1.3), glassMat(), -10.5 + k * 3.5, 2.6, 6.97); w.rotation.y = Math.PI; }
  box(g, 1.6, 2.4, 0.1, mat(0x5a3a22, 0.7), 0, 1.5, 6.95);
  bakeVC(g);
  g.traverse(o => { if(o.isMesh){ o.receiveShadow = true; o.userData.onPick = () => showPlace('summit'); clickable.push(o); } });
  cfrGroup.add(g);
  K.clearArea(p.x, p.z, 40 * M);
  return {center: p.clone(), label: label('Summit Hotel', p.clone().setY(p.y + 22 * M))};
})();

// ------------------------------------------------------------------ panel and roster
function fly(obj, dist){ const p = obj.getWorldPosition(new THREE.Vector3()); flyTo(p.x, p.y, p.z, dist, undefined, 1.12); }
function showEngine(e){
  const diesel = DIESELS.includes(e), R = e.runner;
  const what = diesel
    ? `${e.name} is one of the Culdee Fell Railway's diesel mountain engines, bought from the Hunslet Engine Company of Leeds to the design used for the Snowdon Mountain Railway's diesels (Ninian, Yeti, Peris and George). The books do not give their names, numbers or livery, so they are shown here numbered 9 and 10 in the railway's purple.`
    : `${e.name} (CFR No. ${e.no}) is ${e.about} A 0-4-2 rack tank built by the Swiss Locomotive and Machine Works, based on ${e.basis}. Livery: Culdee Fell Railway purple with orange lining, his number in yellow on the cab sides and back, and a red nameplate with his name in gold on his tanks.`;
  const live = window.SODOR_OPS && e.veh && window.SODOR_OPS.statusOf(e.veh.group);
  const now = live || (R ? `On duty: ${e.run.job}, between ${e.run.from} and ${e.run.to}.` : e.home ? `Now: at ${e.home}.` : '');
  openPanel(`Culdee Fell Railway · ${diesel ? 'Diesel rack engine' : e.former ? 'Former rack engine' : 'Rack engine'}`, e.name, `${what} ${now}`,
    `${diesel ? 'Diesel' : '0-4-2RT'} · 800 mm gauge, Abt rack${R ? ' · ' + e.run.from + ' – ' + e.run.to : ''}`);
  fly(e.veh.group, 0.035);
  if(R || (e.home && !e.former)){ const b = addPanelButton('Follow engine', () => { followTrain = {mesh: e.veh.group, dist: 0.035}; b.classList.add('active'); }); }
}
const STOCK_TEXT = {
  coaches: {title: 'Culdee Fell Railway Coaches', text: 'The railway began with five open-sided coaches with roofs, and waterproof curtains that are let down in bad weather. For safety only one coach at a time is taken up the mountain, pushed by its engine. They are orange with cream curtains and window surrounds and grey roofs; Godred\'s coach, No. 1, had purple lining.'},
  catherine: {title: 'Catherine', text: 'Catherine (CFR No. 4, based on a Snowdon Mountain Railway coach) is the mountain coach who works with Culdee. They know each other so well that he can tell at once if anything is wrong, and she is very safety-conscious. She is orange with cream upper panelling and a grey roof.'},
  trucks: {title: 'The "Trucks"', text: 'The railway\'s only goods stock: a flat wagon with a small passenger and guard\'s compartment and a water tank at the front, and a drop-sided open wagon. They were made in the Works from the wheels and frames of two old open coaches, and are used for goods and maintenance trains. They are light grey, with a brown guard\'s compartment.'},
};
function showStock(kind, v, run){
  const T = STOCK_TEXT[kind];
  openPanel('Culdee Fell Railway · Rolling stock', v && v.name ? v.name : T.title, `${T.text} ${run ? `Now: with ${byId[run.id].name}, ${run.job}.` : 'Now: in the carriage shed at Kirk Machan.'}`, 'Culdee Fell Railway');
  if(v){ fly(v.group, 0.035); if(run){ const b = addPanelButton('Follow train', () => { followTrain = {mesh: v.group, dist: 0.04}; b.classList.add('active'); }); } }
}
const PLACES = {
  sheds: {name: 'Culdee Fell Railway Engine Sheds', text: "The railway's main depot, a short way north of Kirk Machan station to the right of the line up the mountain: an engine shed, a carriage shed long enough for nine coaches on its two roads, and the workshops, where Godred's remains were kept for spare parts.", at: () => sheds.center, dist: 0.12},
  kirk: {name: 'Kirk Machan', text: 'The lower terminus of the Culdee Fell Railway, beside the Peel Godred Branch Line.', at: () => stationPos('Kirk Machan'), dist: 0.2},
  shiloh: {name: 'Shiloh', text: 'The first station on the climb, opened with the railway in 1900.', at: () => stationPos('Shiloh'), dist: 0.15},
  lake: {name: 'Poll-ny-Chrink', text: 'Sudric for "the Pool on the Hillside": a lake about a thousand feet across on the side of Culdee Fell, which the railway skirts just before Skarloey Road. Lord Harry Barrane gave it to the Sodor Nature Conservancy Trust as a wildlife sanctuary.', at: () => lake && lake.center, dist: 0.35},
  viaduct: {name: 'Skarloey Road Viaduct', text: 'Also called Halfway Viaduct: ten arches carrying the line over the gap through the wooded ridge where the road to Skarloey was cut, just before Skarloey Road station. It was the hardest piece of engineering on the line.', at: () => viaduct && viaduct.center, dist: 0.12},
  road: {name: 'Skarloey Road', text: 'The halfway station, on the far side of the viaduct.', at: () => stationPos('Skarloey Road'), dist: 0.15},
  devil: {name: "Devil's Back", text: 'The exposed ridge high on the mountain, the last stretch before the summit.', at: () => stationPos("Devil's Back"), dist: 0.15},
  summit: {name: 'Culdee Fell Summit', text: 'The highest station on Sodor, with two terminal roads and a long platform for each, and the stoutly built one-storey hotel just behind the buffer stops. (On this map the ridge at Devil\'s Back has come out higher than the summit.)', at: () => summit.center, dist: 0.12},
};
function stationPos(name){ const s = STATIONS.find(x => x.name === name); return new THREE.Vector3(s.x, s.y || 0, s.z); }
function showPlace(key){
  const p = PLACES[key], c = p.at(); if(!c) return;
  openPanel('Culdee Fell Railway · Place', p.name, p.text, 'Culdee Fell Railway');
  flyTo(c.x, c.y, c.z, p.dist, undefined, 1.0);
}

const list = document.getElementById('cfrList');
if(list){
  S.rosterGroup('Steam rack engines', list);
  ENG.forEach(e => S.rosterRow(e.name, e.former ? 'former' : e.runner ? 'running' : 'at the sheds', e.dot, () => showEngine(e), list));
  S.rosterGroup('Diesel rack engines', list);
  DIESELS.forEach(e => S.rosterRow(e.name, 'at the sheds', e.dot, () => showEngine(e), list));
  S.rosterGroup('Rolling stock', list);
  const first = k => stockPick.find(s => s.kind === k);
  [['coaches', 'Coaches'], ['catherine', 'Catherine'], ['trucks', 'The "Trucks"']].forEach(([k, n]) => {
    const s = first(k);
    S.rosterRow(n, s && s.run ? 'running' : '', k === 'trucks' ? LIGHTGREY : COACH, () => showStock(k, s && s.v, s && s.run), list);
  });
  S.rosterGroup('Places', list);
  Object.keys(PLACES).forEach(k => S.rosterRow(PLACES[k].name, '', 0x7fa86a, () => showPlace(k), list));
}
const stat = document.getElementById('statTrains');
stat.textContent = (parseInt(stat.textContent, 10) || 0) + RUNNERS.length;
frameHooks.push(() => { cfrGroup.visible = camDist < 12; });

window.SODOR_CFR = {ENG, DIESELS, RUNNERS, byId, PLACES, sheds, viaduct, lake, summit, show: showEngine};
})();
