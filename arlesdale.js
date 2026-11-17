// The Arlesdale Railway's stations and line-side features, after the Thomas wiki (Railway Series):
// Arlesburgh West with its canopy, radio-control cabin, footbridge, steam and diesel sheds, carriage
// shed, turntable and the ballast chute into the North Western's trucks; Ffarquhar Road's granite
// shelter and second platform, the loop warning disc, the Hackenbeck mine branch and the restored
// watermill; Marthwaite and its granite quarry; Arlesdale Green; the unfenced lane with its wool bales
// and Mid Sodor cottages; and Arlesdale's green timber booking office, turntable and mine spur.
(function(){
const K = window.SODOR_KIT, SR = window.SODOR_SR, B = SR && SR.BLOCK;
if(!K || !B) return;
const {mat, box, add, cylY, glassMat} = K;
const M = METRE, line = B.line, L = line.real.len, u0 = B.trains[0].o.uA;
const xOf = name => (K.lineU(line, name) - u0) * L;
const ROOT = new THREE.Group(); scene.add(ROOT);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// a group standing beside the line at x (metres from Arlesburgh West) and lat (metres, + platform side)
function site(x, lat){
  B.frame(x * M, lat * M, _a); B.frame(x * M + M, lat * M, _b);
  const g = new THREE.Group();
  g.position.set(_a.x, _a.y - 0.5 * M, _a.z); g.rotation.y = Math.atan2(_b.x - _a.x, _b.z - _a.z); g.scale.setScalar(M);
  ROOT.add(g); K.clearArea(_a.x, _a.z, 14 * M);
  return g;
}
// extra 15-inch rails through (x, lat) points, in metres
function rails(pts, bed = 1.3){
  const P = []; pts.forEach(([x, lat]) => { B.frame(x * M, lat * M, _a); P.push({x: _a.x, y: Math.max(_a.y, heightAt(_a.x, _a.z) + 0.5 * M), z: _a.z}); });
  K.ribbon(line, P, bed);
}
const curve = (x0, l0, x1, l1, n = 12) => { const p = []; for(let i = 0; i <= n; i++){ const t = i / n, s = t * t * (3 - 2 * t); p.push([x0 + (x1 - x0) * t, l0 + (l1 - l0) * s]); } return p; };
const roofP = (g, w, d, h, m, x, z, rotY = 0) => { const r = add(g, new THREE.CylinderGeometry(w * 0.62, w * 0.62, d, 3).rotateX(-Math.PI / 2), m, x, h + w * 0.18, z); r.scale.y = 0.55; r.rotation.y = rotY; return r; };
function hut(g, x, z, w, d, h, wall, roofC, win = true){
  box(g, w, h, d, mat(wall, 0.85), x, h / 2, z);
  roofP(g, w + 0.3, d + 0.3, h, mat(roofC, 0.75), x, z);
  if(win) for(const s of [-1, 1]) for(let k = 0; k < Math.max(1, Math.floor(d / 2.2)); k++) box(g, 0.06, 0.8, 0.7, glassMat(), x + s * (w / 2 + 0.02), h * 0.6, z - d / 2 + (k + 0.5) * d / Math.max(1, Math.floor(d / 2.2)));
}
function shed(g, x, z, w, d, h, wall, roofC, roads){
  const W = mat(wall, 0.85);
  for(const s of [-1, 1]) box(g, 0.3, h, d, W, x + s * w / 2, h / 2, z);
  box(g, w, h, 0.3, W, x, h / 2, z + d / 2);
  box(g, w, 0.8, 0.3, W, x, h - 0.4, z - d / 2);
  roofP(g, w + 0.4, d + 0.4, h, mat(roofC, 0.75), x, z);
  (roads || []).forEach(rx => box(g, 0.15, h - 0.8, 0.3, W, x + rx + 0.9, (h - 0.8) / 2, z - d / 2));
}
const heap = (g, x, z, r, h, c) => { add(g, new THREE.ConeGeometry(r, h, 10), mat(c, 0.95), x, h / 2, z); };
const turntable = (g, x, z) => { cylY(g, 3.3, 3.3, 0.6, mat(0x5a5852, 0.9), x, 0.2, z, 28); box(g, 1.4, 0.3, 6.4, mat(0x2c3a30, 0.6, 0.2), x, 0.55, z); };
const platform = (g, x, z, w, len) => box(g, w, 0.95, len, mat(0xa8a49a, 0.85), x, 0.475, z);
const STONE = 0x8d8a82, SLATE = 0x4a4f58, GREEN = 0x3f6a3a, BRICK = 0x8a4a32, CREAM = 0xe6dcc6;

// ---------------- Arlesburgh West
{
  const g = site(0, 0);
  // canopy over the platform with the wall behind it (blustery weather)
  for(let z = 8; z <= 36; z += 4) box(g, 0.15, 3.2, 0.15, mat(GREEN, 0.6), 3.6, 1.6, z);
  box(g, 3.4, 0.15, 30, mat(0x5a5f66, 0.7), 4.6, 3.3, 22);
  box(g, 0.4, 2.8, 32, mat(CREAM, 0.85), 6.4, 1.4, 22);
  box(g, 2.8, 0.95, 32, mat(0xa8a49a, 0.85), 4.6, 0.475, 22);
  // signal and radio-control cabin
  hut(g, 9, 42, 3.2, 3.6, 3.2, CREAM, SLATE);
  cylY(g, 0.08, 0.08, 9, mat(0x9a9a9a, 0.5, 0.6), 10.2, 4.5, 43.4, 6);
  for(const y of [7, 8, 9]) box(g, 1.4, 0.05, 0.05, mat(0x9a9a9a, 0.5, 0.6), 10.2, y, 43.4);
  // footbridge to the North Western platforms
  for(const x of [-14, 8]) for(const z of [3, 5]) box(g, 0.3, 5, 0.3, mat(0x2c4a34, 0.6), x, 2.5, z);
  box(g, 22, 0.3, 2.2, mat(0x2c4a34, 0.6), -3, 5.1, 4);
  for(const s of [-1, 1]) box(g, 22, 1.1, 0.08, mat(0x2c4a34, 0.6), -3, 5.8, 4 + s * 1.05);
  for(const x of [-14, 8]){ const st = box(g, 1.2, 0.2, 7, mat(0x2c4a34, 0.6), x, 2.6, 8.5); st.rotation.x = 0.62; }   // stairs
  // steam shed (with its workshop) and turntable, on the south side
  shed(g, 15, 62, 8, 22, 5, BRICK, SLATE, [-2, 2]);
  rails([[40, 13], [73, 13]]); rails([[40, 17], [73, 17]]);
  turntable(g, 15, 46);
  hut(g, 22, 64, 4, 10, 3.6, BRICK, SLATE);                   // Arlesburgh Works carriage shop behind
  // diesel shed on the north side, and the carriage shed over Frank's siding
  shed(g, -27, 30, 5, 12, 4, BRICK, SLATE, [0]);
  rails([[22, -27], [37, -27]]);
  shed(g, -17, 46, 5, 30, 4.2, 0x7a6a58, SLATE, [0]);
  // the ballast chute: hoppers tip from a trestle on Blister I's siding into standard-gauge trucks
  for(let z = 18; z <= 34; z += 4) for(const x of [-20.2, -21.8]) box(g, 0.3, 2.4, 0.3, mat(0x6a5038, 0.9), x, 1.2, z);
  box(g, 3.2, 0.3, 18, mat(0x6a5038, 0.9), -21, 2.5, 26);
  const chute = box(g, 4.2, 0.15, 8, mat(0x55585f, 0.6, 0.4), -24.4, 1.9, 26); chute.rotation.z = -0.35;
  rails([[0, -28.5], [60, -28.5]], 3.6);
  for(const z of [21, 31]) { box(g, 2.5, 2.2, 6, mat(0x4a4d52, 0.7), -28.5, 1.6, z); box(g, 2.3, 0.3, 5.6, mat(0x8a8a80, 0.95), -28.5, 2.75, z); }
}

// ---------------- Ffarquhar Road
{
  const x0 = xOf('Ffarquhar Road'), g = site(x0, 0);
  hut(g, 4.6, 0, 2.6, 4.5, 2.6, STONE, SLATE, false);         // granite shelter
  box(g, 0.1, 1.6, 3, mat(0x2a2a2a, 0.6), 3.28, 1.3, 0);
  platform(g, -4.45, 0, 2.8, 22);                             // the second platform, on the loop road
  // warning disc ahead of the loop
  const w = site(x0 - 480, 2);
  cylY(w, 0.06, 0.06, 3, mat(0x3a3a3a, 0.6), 0, 1.5, 0, 6);
  add(w, new THREE.CircleGeometry(0.45, 18), mat(0xf2f2f2, 0.5, 0, 'double'), 0, 3.1, 0.05);
  box(w, 0.7, 0.12, 0.02, mat(0x111111, 0.5), 0, 3.1, 0.08);
  // the Hackenbeck mine branch, turning south to the spoil heaps
  rails(curve(x0 + 30, -2.4, x0 + 140, -60));
  const m = site(x0 + 150, -70);
  [[0, 0, 9, 6], [10, 6, 7, 5], [-6, 12, 6, 4]].forEach(([x, z, r, h]) => heap(m, x, z, r, h, 0x8a7a6a));
  hut(m, -8, -6, 5, 6, 4, STONE, SLATE);
  cylY(m, 0.6, 0.8, 9, mat(STONE, 0.9), -10, 4.5, -9, 8);
  // the restored watermill, on the right of the line as it curves away
  const mill = site(x0 + 330, 22);
  hut(mill, 0, 0, 7, 9, 6, STONE, SLATE);
  const wheel = new THREE.Group(); wheel.position.set(-4.2, 2.6, 0); mill.add(wheel);
  add(wheel, new THREE.TorusGeometry(2.4, 0.18, 6, 24).rotateY(Math.PI / 2), mat(0x5a4030, 0.9), 0, 0, 0);
  for(let k = 0; k < 8; k++){ const p = box(wheel, 0.5, 4.6, 0.12, mat(0x6a5038, 0.9), 0, 0, 0); p.rotation.x = k * Math.PI / 8; }
  box(mill, 1.2, 0.6, 14, mat(0x6a5038, 0.9), -4.2, 5.2, -4);   // the leat
  frameHooks.push(dt => { if(camDist < 3) wheel.rotation.x -= dt * 0.6; });
}

// ---------------- Marthwaite: buildings on the south side, the granite quarry across the line
{
  const x0 = xOf('Marthwaite'), g = site(x0, 0);
  hut(g, 7.5, 0, 4.5, 9, 3.6, STONE, SLATE);
  box(g, 2.2, 0.12, 9, mat(0x5a5f66, 0.7), 4.6, 3.0, 0);
  const q = site(x0 + 40, -48);
  box(q, 34, 12, 6, mat(0x7c7a74, 0.95), 0, 6, -8);
  [[-8, 4, 6, 4], [6, 6, 7, 5], [14, 0, 5, 3]].forEach(([x, z, r, h]) => heap(q, x, z, r, h, 0x9a958c));
  hut(q, -14, 8, 6, 8, 4, 0x8a8d91, SLATE);
}

// ---------------- Arlesdale Green, the unfenced lane, and the cottages
{
  const x0 = xOf('Arlesdale Green'), g = site(x0, 0);
  hut(g, 6.5, 0, 3.5, 5, 3, BRICK, SLATE);
  const xA = xOf('Arlesdale');
  const laneA = x0 + 250, laneB = Math.min(x0 + 700, xA - 120);
  for(let x = laneA; x < laneB; x += 25){
    const s = site(x + 12.5, 5.5);
    box(s, 3.4, 0.08, 25.5, mat(0x6a6458, 0.95), 0, 0.5, 0);
    if((x / 25 | 0) % 3 === 0) add(s, new THREE.CircleGeometry(0.9, 12).rotateX(-Math.PI / 2), mat(0x4a4a40, 0.2, 0.3), 0.6, 0.56, 4);
  }
  const w = site((laneA + laneB) / 2, 9);
  for(let k = 0; k < 6; k++) box(w, 1.2, 0.9, 1.2, mat(0xe8e0c8, 0.95), (k % 3) * 1.3, 0.45 + (k > 2 ? 0.9 : 0), 0);
  const c = site((laneA + laneB) / 2 + 30, 18);
  for(let k = 0; k < 3; k++) hut(c, 0, -6 + k * 6, 5, 6, 4.5, STONE, SLATE);
}

// ---------------- Arlesdale: booking office and refreshment room, turntable, mine spur
{
  const xA = B.trains[0].span / M, g = site(xA - 22, 0);
  hut(g, 7, 0, 4, 10, 3.2, GREEN, 0x3a3f46);
  box(g, 0.3, 1.2, 3, mat(0xe8e0c8, 0.7), 4.85, 2.2, 0);
  const t = site(xA + 6, -4.8); turntable(t, 0, 0);
  rails([[xA - 4, -4.8], [xA + 3, -4.8]]); rails([[xA - 4, -9.6], [xA + 3, -7]]);
  rails(curve(xA - 70, -12, xA + 40, -75));
  const m = site(xA + 55, -85);
  [[0, 0, 10, 7], [12, 8, 8, 5], [-8, 10, 7, 5]].forEach(([x, z, r, h]) => heap(m, x, z, r, h, 0x7a6e62));
  hut(m, -10, -8, 6, 6, 4.5, STONE, SLATE);
}
if(K.trees && K.trees.invalidate) K.trees.invalidate();
})();
