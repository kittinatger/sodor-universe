// Ffarquhar and Ffarquhar (Anopha) Quarry, after the Thomas wiki and the CGI series.
// The station: one platform with a run-round loop, a red-brick building with a tiled roof and the
// green FFARQUHAR boards, a milk dock, cattle dock, coal staithes, an oil depot and a goods shed for
// Sodor Roadways, the arcaded stone wall behind the station road, and Ffarquhar Yards to the north with
// the carriage shed, the stone-cutting and curing sheds and the quarrymen's cottages. From the yard the
// Quarry Tramroad winds up past the runaway siding, the Stop Board and the wooden river bridge to the
// quarry: a canyon of grey rock with a fan of sidings, stone hoppers, the overhead walkway, pale-green
// sheds, a silver water tank, Cliff the crawler shovel, dump trucks, and a platform with a shelter.
(function(){
const K = window.SODOR_KIT, S = window.SODOR_STD;
const LF = LINES.ffarquhar, LQ = LINES.ffquarry;
if(!K || !LF || !LF.real) return;
const {mat, box, add, cylY, glassMat, canvasTex} = K;
const M = METRE, V3 = THREE.Vector3;
const ROOT = new THREE.Group(); scene.add(ROOT);
const _a = new V3(), _t = new V3();
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// a point d metres back from the end of a line (negative: past the end) and lat metres to its left
function at(line, d, lat, out){
  const L = line.real.len, u = 1 - d * M / L, uc = Math.max(0, Math.min(1, u));
  realAt(line, uc, out); realDir(line, uc, _t); _t.y = 0; _t.normalize();
  if(u > 1){ out.addScaledVector(_t, (u - 1) * L); }
  return out.set(out.x + _t.z * lat * M, out.y, out.z - _t.x * lat * M);
}
// a group standing beside the line, local x across (+ left), z along towards the end of the line
function site(line, d, lat, clear = 14){
  at(line, d, lat, _a); const p = _a.clone(), q = at(line, d - 1, lat, new V3());
  const g = new THREE.Group(); g.position.set(p.x, p.y - 0.55 * M, p.z); g.rotation.y = Math.atan2(q.x - p.x, q.z - p.z); g.scale.setScalar(M);
  ROOT.add(g); if(clear) K.clearArea(p.x, p.z, clear * M);
  return g;
}
function rails(line, pts, bed = 3.6){
  const P = pts.map(([d, lat]) => { const p = at(line, d, lat, new V3()); p.y = Math.max(p.y, heightAt(p.x, p.z) + 0.5 * M); return p; });
  K.ribbon(line, P, bed);
}
const ease = (d0, l0, d1, l1, n = 10) => { const p = []; for(let i = 0; i <= n; i++){ const t = i / n, s = t * t * (3 - 2 * t); p.push([d0 + (d1 - d0) * t, l0 + (l1 - l0) * s]); } return p; };
const roofP = (g, w, d, h, m, x, z, pitch = 0.55) => { const r = add(g, new THREE.CylinderGeometry(w * 0.62, w * 0.62, d, 3).rotateX(-Math.PI / 2), m, x, h + w * 0.18 * pitch / 0.55, z); r.scale.y = pitch; return r; };
function house(g, x, z, w, d, h, wall, roofC, o = {}){
  box(g, w, h, d, mat(wall, 0.85), x, h / 2, z);
  roofP(g, w + 0.5, d + 0.4, h, mat(roofC, 0.75), x, z);
  const nW = Math.max(1, Math.floor(d / 3));
  for(const s of [-1, 1]) for(let k = 0; k < nW; k++){
    const zz = z - d / 2 + (k + 0.5) * d / nW;
    box(g, 0.08, 1.3, 1.0, glassMat(), x + s * (w / 2 + 0.03), h * 0.55, zz);
    box(g, 0.1, 1.5, 1.2, mat(o.trim || 0xe8dcc0, 0.6), x + s * (w / 2 + 0.01), h * 0.55, zz);
    if(h > 5) box(g, 0.08, 1.2, 1.0, glassMat(), x + s * (w / 2 + 0.03), h * 0.8, zz);
  }
  (o.chimneys || []).forEach(cz => box(g, 0.8, 1.6, 0.8, mat(wall, 0.85), x, h + w * 0.25 + 0.6, z + cz));
}
function board(g, text, x, z, rotY = Math.PI / 2){
  const tex = canvasTex(512, 96, (c, w, h) => { c.fillStyle = '#2f5a3a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e8e2c8'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#f2eedc'; c.font = 'bold 60px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 3); });
  for(const s of [-1.6, 1.6]) box(g, 0.12, 2.2, 0.12, mat(0x2f5a3a, 0.6), x, 1.1, z + s);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.75), new THREE.MeshStandardMaterial({map: tex, roughness: 0.6, side: THREE.DoubleSide}));
  m.position.set(x, 2.3, z); m.rotation.y = rotY; g.add(m);
}
const lampPost = (g, x, z) => { cylY(g, 0.07, 0.1, 3.4, mat(0x2f5a3a, 0.6), x, 1.7, z, 6); box(g, 0.35, 0.45, 0.35, mat(0xf2e8c0, 0.3, 0, 'double'), x, 3.55, z); box(g, 0.45, 0.08, 0.45, mat(0x2f5a3a, 0.6), x, 3.82, z); };
const bench = (g, x, z) => { box(g, 0.45, 0.06, 1.8, mat(0x7a5a3a, 0.8), x, 0.5, z); box(g, 0.06, 0.45, 1.8, mat(0x7a5a3a, 0.8), x - 0.22, 0.75, z); for(const s of [-0.8, 0.8]) box(g, 0.45, 0.5, 0.06, mat(0x2a2a2a, 0.6), x, 0.25, z + s); };
const bufferStop = (g, x, z) => { box(g, 3.2, 0.5, 0.5, mat(0xb3201c, 0.6), x, 1.0, z); for(const s of [-0.8, 0.8]) box(g, 0.3, 1.1, 1.6, mat(0x3a3a3a, 0.7), x + s, 0.55, z - 0.6); };
function semaphore(g, x, z, face){
  cylY(g, 0.1, 0.12, 6.5, mat(0xe8e8e2, 0.6), x, 3.25, z, 6);
  const arm = box(g, 0.08, 0.3, 1.4, mat(0xc8201e, 0.5), x + 0.12, 5.8, z + 0.6 * face); arm.rotation.x = 0;
  box(g, 0.09, 0.3, 0.25, mat(0xf2f2f2, 0.5), x + 0.13, 5.8, z + 1.0 * face);
  cylY(g, 0.1, 0.1, 0.25, mat(0x1a1a1a, 0.6), x, 6.6, z, 6);
  for(let y = 0.5; y < 6; y += 0.5) box(g, 0.35, 0.04, 0.04, mat(0x9a9a9a, 0.5), x - 0.3, y, z);
}
const STONE = 0x8d8a82, BRICK = 0x9b4a34, TILE = 0x8a4a3a, SLATE = 0x4a4f58, GREEN = 0x2f5a3a, CREAM = 0xe8dcc0;

// ======================================================================= Ffarquhar station
// track: the main road ends at the buffers; Thomas's run-round loop lies on the north (+) side
{
  // the platform (south side) in short pieces so it follows the curve: red brick face, stone slabs
  for(let d = 14; d < 94; d += 10){
    const g = site(LF, d + 5, -4.4, 0);
    box(g, 4, 0.9, 10.2, mat(0x9a4a32, 0.85), 0, 0.45, 0);
    box(g, 4.2, 0.12, 10.2, mat(0xb8b4aa, 0.8), -0.05, 0.95, 0);
    box(g, 0.3, 0.02, 10.2, mat(0xf2f2ea, 0.6), 1.85, 1.02, 0);
  }
  const ramp = site(LF, 96, -4.4, 0); const r = box(ramp, 4, 0.12, 5, mat(0xb8b4aa, 0.8), 0, 0.5, -1.5); r.rotation.x = 0.17;
  K.clearArea(at(LF, 55, -10, _a).x, _a.z, 70 * M);

  // the station building behind the platform, with a canopy over it
  const s = site(LF, 55, -11, 0);
  house(s, 0, 0, 7, 20, 5.2, BRICK, TILE, {chimneys: [-6, 0, 6]});
  box(s, 7.4, 0.35, 20.4, mat(0xc9b89a, 0.8), 0, 0.17, 0);                 // stone plinth
  for(const z of [-3, 3]) { box(s, 0.12, 2.4, 1.2, mat(GREEN, 0.6), 3.56, 1.2, z); box(s, 0.14, 2.6, 1.4, mat(CREAM, 0.6), 3.54, 1.3, z); }
  box(s, 3.4, 0.18, 14, mat(0x5a5f66, 0.7), 5.0, 3.6, 0);                   // canopy
  for(let z = -6; z <= 6; z += 4) box(s, 0.12, 0.12, 2.6, mat(GREEN, 0.6), 4.6, 3.3, z);
  box(s, 0.08, 0.5, 14, mat(GREEN, 0.6), 6.65, 3.35, 0);                    // valance
  const sign = canvasTex(512, 96, (c, w, h) => { c.fillStyle = '#2f5a3a'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2eedc'; c.font = 'bold 64px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FFARQUHAR', w / 2, h / 2 + 3); });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), new THREE.MeshStandardMaterial({map: sign, roughness: 0.6}));
  sm.position.set(3.58, 4.4, 0); sm.rotation.y = Math.PI / 2; s.add(sm);
  // on the platform: running-in boards, benches, lamps, flower tubs; the red telephone box by the door
  const p = (d) => site(LF, d, -4.4, 0);
  [24, 86].forEach(d => board(p(d), 'FFARQUHAR', -1.2, 0));
  [36, 48, 64].forEach(d => bench(p(d), -1.4, 0));
  [20, 32, 44, 66, 78, 90].forEach(d => lampPost(p(d), -1.6, 0));
  [40, 70].forEach(d => { const t = p(d); cylY(t, 0.45, 0.35, 0.6, mat(0x6a4a30, 0.8), -1.5, 1.3, 0, 10); add(t, new THREE.SphereGeometry(0.45, 8, 6), mat(0x4a7a3a, 0.9), -1.5, 1.75, 0); });
  const ph = site(LF, 70, -8.6, 0);
  box(ph, 1.0, 2.5, 1.0, mat(0xc8201e, 0.5), 0, 1.25, 0); box(ph, 1.05, 0.25, 1.05, mat(0xc8201e, 0.5), 0, 2.6, 0);
  for(const s2 of [-1, 1]) box(ph, 0.04, 1.6, 0.7, glassMat(), s2 * 0.52, 1.3, 0);
  // buffers at the end of the line and of the loop
  bufferStop(site(LF, 2, 0, 0), 0, 0);
  // signals: the home signal out on the line, the starter at the platform end
  semaphore(site(LF, 330, -3.2, 0), 0, 0, -1);
  semaphore(site(LF, 104, -3.2, 0), 0, 0, 1);

  // the station road (Ulfstead Road) and the arcaded stone retaining wall behind it
  for(let d = -30; d < 190; d += 20){ const g = site(LF, d + 10, -24, 0); box(g, 6.5, 0.1, 20.4, mat(0x5f5f5c, 0.95), 0, 0.5, 0); box(g, 0.15, 0.02, 2.5, mat(0xeeeeee, 0.6), 0, 0.56, 0); }
  for(let d = -20; d < 180; d += 10){
    const g = site(LF, d + 5, -31, 0);
    box(g, 1.4, 6.5, 10.2, mat(STONE, 0.95), 0, 3.25, 0);
    box(g, 1.8, 0.5, 10.4, mat(0xa39f95, 0.95), 0, 6.6, 0);
    box(g, 0.1, 3.4, 6, mat(0x5e5b54, 0.95), 0.72, 1.7, 0);
    const c = add(g, new THREE.CircleGeometry(3, 14, 0, Math.PI), mat(0x5e5b54, 0.95, 0, 'double'), 0.73, 3.4, 0); c.rotation.y = Math.PI / 2;
  }
  const stop = site(LF, 60, -20, 0);                                         // Sodor Roadways bus stop
  cylY(stop, 0.06, 0.06, 2.6, mat(0x3a3a3a, 0.6), 0, 1.3, 0, 6); box(stop, 0.05, 0.5, 0.5, mat(0xc8201e, 0.5), 0, 2.5, 0);

  // goods: the goods shed for Sodor Roadways, the milk dock and the cattle dock, beyond the platform
  const gs = site(LF, 130, -13, 0); house(gs, 0, 0, 9, 14, 5.5, BRICK, SLATE);
  for(const z of [-3, 3]) box(gs, 0.1, 3.2, 2.8, mat(0x6a4a30, 0.8), -4.56, 1.6, z);
  const md = site(LF, 112, -5.2, 0); box(md, 3, 1.0, 12, mat(0x9a4a32, 0.85), 0, 0.5, 0);
  for(let k = 0; k < 8; k++) cylY(md, 0.22, 0.25, 0.7, mat(0xc8ccd0, 0.4, 0.6), -0.6 + (k % 2) * 0.6, 1.35, -4 + k, 8);
  const cd = site(LF, 150, -16.6, 0); box(cd, 4, 1.0, 12, mat(STONE, 0.9), 0, 0.5, 0);      // beside the goods siding (track.js)
  for(let z = -6; z <= 6; z += 1.5) for(const x of [-1.9, 1.9]) box(cd, 0.1, 1.2, 0.1, mat(0xe8e8e2, 0.7), x, 1.6, z);
  for(const x of [-1.9, 1.9]) box(cd, 0.06, 0.06, 12, mat(0xe8e8e2, 0.7), x, 2.1, 0);
}

// ======================================================================= Ffarquhar Yards (north side)
{
  // the carriage shed: long and wooden, two roads (track.js lays the yard's track: the ladder, the
  // carriage roads, the engine shed roads and the coal road)
  const cs = site(LF, 130, 36, 30);
  for(const x of [-4.8, 4.8]) box(cs, 0.3, 5, 60, mat(0x6a4a30, 0.85), x, 2.5, 0);
  box(cs, 9.9, 5, 0.3, mat(0x6a4a30, 0.85), 0, 2.5, -30);
  roofP(cs, 10.6, 61, 5, mat(SLATE, 0.75), 0, 0);
  for(let z = -26; z < 30; z += 4) for(const x of [-4.98, 4.98]) box(cs, 0.04, 0.9, 1.6, glassMat(), x, 3.2, z);
  // the engine shed: two roads, brick, for Thomas and Rosie
  const es = site(LF, 166, 19.3, 16);
  for(const x of [-4.9, 4.9]) box(es, 0.4, 5.4, 28, mat(BRICK, 0.85), x, 2.7, 0);
  box(es, 10.2, 5.4, 0.4, mat(BRICK, 0.85), 0, 2.7, -14);
  box(es, 10.2, 1.2, 0.4, mat(BRICK, 0.85), 0, 4.8, 14);
  roofP(es, 10.8, 28.8, 5.4, mat(SLATE, 0.75), 0, 0);
  box(es, 1, 0.6, 24, mat(0x3a3f46, 0.7), 0, 7.6, 0);                          // smoke vent along the ridge
  for(let z = -11; z < 12; z += 4) for(const x of [-5.12, 5.12]) box(es, 0.04, 1.0, 1.4, glassMat(), x, 3.4, z);
  // the water tower beside the shed
  const wt = site(LF, 186, 27, 0);
  for(const x of [-1.2, 1.2]) for(const z of [-1.2, 1.2]) box(wt, 0.3, 4.5, 0.3, mat(0x3a3a3a, 0.7), x, 2.25, z);
  box(wt, 3.4, 2.2, 3.4, mat(0x2f5a3a, 0.6), 0, 5.6, 0);
  // coal staithes beside the coal road, and the oil depot
  const co = site(LF, 172, 49, 12);
  for(let k = 0; k < 4; k++){ box(co, 4, 1.8, 0.4, mat(BRICK, 0.85), 0, 0.9, -6 + k * 4); heap(co, 0, -4 + k * 4, 1.6, 1.4, 0x18181a); }
  box(co, 0.4, 1.8, 16, mat(BRICK, 0.85), -2, 0.9, 0);
  const oil = site(LF, 212, 54, 12);
  for(const x of [-2, 2]){ const t = add(oil, new THREE.CylinderGeometry(1.6, 1.6, 9, 16).rotateX(Math.PI / 2), mat(0xdedcd6, 0.4, 0.3), x, 2.6, 0); for(const z of [-3, 3]) box(oil, 0.4, 1.2, 0.4, mat(0x3a3a3a, 0.7), x, 0.6, z); }
  box(oil, 7, 0.3, 11, mat(0x7a7a74, 0.9), 0, 0.15, 0);
  // the stone yard: cutting and curing sheds beside the start of the Quarry Tramroad, with cut blocks
  for(const [d, l] of [[70, 58], [105, 60]]){
    const y = site(LF, d, l, 18);
    for(const x of [-5, 5]) for(let z = -9; z <= 9; z += 4.5) box(y, 0.3, 5, 0.3, mat(0x4a3a2a, 0.8), x, 2.5, z);
    roofP(y, 11, 19, 5, mat(0x5a5f66, 0.7), 0, 0, 0.35);
    for(let k = 0; k < 10; k++) box(y, 1.2 + rnd(), 0.8 + rnd() * 0.6, 1.6 + rnd(), mat([0xd8d0bc, 0xc8c0aa, 0xb8b4aa][k % 3], 0.9), -3.5 + (k % 4) * 2.3, 0.5, -7 + Math.floor(k / 4) * 5);
  }
  const cr = site(LF, 88, 52, 0);                                            // a hand crane in the stone yard
  cylY(cr, 0.3, 0.4, 6, mat(0x3a3a3a, 0.6, 0.3), 0, 3, 0, 8);
  const jib = box(cr, 0.3, 0.3, 8, mat(0x3a3a3a, 0.6, 0.3), 0, 5, 3.4); jib.rotation.x = -0.45;
  // the quarrymen's cottages, between the tramroad and the yard, and the stationmaster's house
  for(let k = 0; k < 4; k++) house(site(LF, 40 + k * 9, 70, k ? 0 : 30), 0, 0, 7, 8, 5.8, STONE, SLATE, {chimneys: [0]});
  house(site(LF, 300, 34, 14), 0, 0, 8, 9, 6, BRICK, TILE, {chimneys: [-2.5, 2.5]});
}
function heap(g, x, z, r, h, c){ add(g, new THREE.ConeGeometry(r, h, 9), mat(c, 0.95), x, h / 2, z); }

// ======================================================================= the Quarry Tramroad
if(LQ && LQ.real){
  const LQL = LQ.real.len / M, q = (f, lat, clear) => site(LQ, (1 - f) * LQL, lat, clear);
  // the runaway siding just out of Ffarquhar, ending in a sand drag
  const f0 = 0.06, dr = (1 - f0) * LQL;
  rails(LQ, ease(dr + 30, 0, dr - 25, -6.5)); rails(LQ, [[dr - 25, -6.5], [dr - 75, -6.5]]);
  const sd = site(LQ, dr - 78, -6.5, 0); heap(sd, 0, 0, 2.2, 1.2, 0xc8b88a); bufferStop(sd, 0, -2);
  // the Stop Board at the top of the steepest climb
  const sb = q(0.33, 3, 0);
  for(const s of [-0.6, 0.6]) box(sb, 0.12, 2.4, 0.12, mat(0x3a3a3a, 0.6), 0, 1.2, s);
  const st = canvasTex(256, 160, (c, w, h) => { c.fillStyle = '#f2f2ea'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 70px Arial'; c.textAlign = 'center'; c.fillText('STOP', w / 2, 72); c.font = 'bold 24px Arial'; c.fillText('ALL TRAINS', w / 2, 112); c.fillText('MUST STOP HERE', w / 2, 142); });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({map: st, roughness: 0.6, side: THREE.DoubleSide}));
  sm.position.set(0, 2.6, 0); sm.rotation.y = Math.PI / 2; sb.add(sm);
  // Ffarquhar River Bridge: a wooden bridge carrying the tramroad
  for(let k = 0; k < 6; k++){
    const b = q(0.6 + k * 6 / LQL, 0, 0);
    for(const x of [-2.4, 2.4]){ box(b, 0.25, 1.1, 0.25, mat(0x6a5038, 0.9), x, 1.1, 0); box(b, 0.12, 0.12, 6.2, mat(0x6a5038, 0.9), x, 1.6, 0); box(b, 0.5, 4, 0.5, mat(0x5a4030, 0.9), x * 0.9, -1.4, 0); }
    box(b, 5.2, 0.3, 6.2, mat(0x6a5038, 0.9), 0, 0.35, 0);
  }
}

// ======================================================================= Ffarquhar (Anopha) Quarry
if(LQ && LQ.real){
  const Q = (d, lat, clear = 0) => site(LQ, d, lat, clear);
  const c0 = at(LQ, 70, 0, new V3()); K.clearArea(c0.x, c0.z, 120 * M);
  // the quarry floor
  for(let d = -40; d < 190; d += 30){ const g = Q(d + 15, 0); box(g, 100, 1.2, 30.5, mat(0x9e9a90, 0.95), 0, -0.2, 0); }
  // the rock walls round three sides, in broken blocks and buttresses
  const ROCK = [0x8a8984, 0x7d7b75, 0x96948d, 0x6f6d68];
  const crag = (g, w, h, d2, x, z) => { const b = box(g, w, h, d2, mat(ROCK[Math.floor(rnd() * 4)], 0.95), x, h / 2 - 1, z); b.rotation.y = (rnd() - 0.5) * 0.5; b.rotation.z = (rnd() - 0.5) * 0.12; return b; };
  for(let d = -30; d < 170; d += 14) for(const side of [-1, 1]){
    const g = Q(d, side * (48 + rnd() * 6));
    crag(g, 12 + rnd() * 6, 18 + rnd() * 16, 16, 0, 0);
    crag(g, 7, 10 + rnd() * 10, 9, -side * 6, 3);
    if(rnd() < 0.5) crag(g, 9, 30 + rnd() * 10, 8, side * 4, -2);
  }
  for(let lat = -50; lat <= 50; lat += 14){ const g = Q(-42 - rnd() * 6, lat); crag(g, 16, 22 + rnd() * 16, 12, 0, 0); crag(g, 8, 12, 8, 0, 8); }
  // the fan of sidings at the head of the quarry, with trucks waiting under the hoppers
  [[-9, 125], [-15, 115], [12, 120]].forEach(([l, d0]) => {
    rails(LQ, ease(d0 + 40, l > 0 ? 4.6 : 0, d0, l)); rails(LQ, [[d0, l], [8, l]]);
    bufferStop(Q(6, l), 0, 0);
  });
  [[-9, 30], [-9, 42], [-15, 60], [-15, 72], [12, 40]].forEach(([l, d]) => {
    const t = Q(d, l); box(t, 2.4, 1.6, 5.2, mat(0x5a4a3c, 0.8), 0, 1.6, 0); box(t, 2.2, 0.5, 5, mat(0xa8a49a, 0.95), 0, 2.4, 0);
    for(const z of [-1.6, 1.6]) for(const x of [-0.75, 0.75]) cylY(t, 0.4, 0.4, 0.2, mat(0x2a2a2a, 0.6), x, 0.6, z, 10).rotation.z = Math.PI / 2;
  });
  // stone hoppers: dark bins on tall legs straddling the sidings
  for(const [l, d] of [[-9, 36], [-15, 66]]){
    const h = Q(d, l, 0), DK = mat(0x3a3028, 0.85);
    for(const x of [-2.6, 2.6]) for(const z of [-2.8, 2.8]) box(h, 0.5, 9, 0.5, DK, x, 4.5, z);
    box(h, 6.2, 5, 7, DK, 0, 11.5, 0);
    const ch = box(h, 2.2, 0.2, 4, mat(0x55585f, 0.6, 0.4), 0, 8.5, 0); ch.rotation.x = 0.5;
    box(h, 6.6, 0.3, 7.4, mat(0x2a2420, 0.85), 0, 14.1, 0);
    for(let y = 2; y < 9; y += 2.5) box(h, 5.4, 0.2, 0.2, DK, 0, y, 2.8);
  }
  // the overhead walkway across the yard on two lattice towers
  {
    const w = Q(50, -2, 0), G2 = mat(0x4a564a, 0.6, 0.3);
    for(const x of [-24, 18]){ for(const xx of [-1, 1]) for(const zz of [-1, 1]) box(w, 0.3, 10, 0.3, G2, x + xx, 5, zz); for(let y = 1.5; y < 10; y += 2.2) { const b = box(w, 2.3, 0.15, 0.15, G2, x, y, 1); b.rotation.z = 0.7; } }
    box(w, 44, 0.4, 2.6, G2, -3, 10.2, 0);
    for(const z of [-1.25, 1.25]){ box(w, 44, 0.1, 0.08, G2, -3, 11.3, z); for(let x = -24; x <= 18; x += 2) box(w, 0.08, 1.1, 0.08, G2, x, 10.8, z); }
    for(let x = -22; x <= 16; x += 3){ const b = box(w, 0.12, 0.12, 2.8, G2, x, 9.7, 0); b.rotation.x = 0.6; }
  }
  // pale-green corrugated sheds
  const shedG = (d, l, w, dd, h) => { const g = Q(d, l, 0); box(g, w, h, dd, mat(0x9ab58a, 0.7), 0, h / 2, 0); roofP(g, w + 0.6, dd + 0.6, h, mat(0x7a9a6e, 0.7), 0, 0, 0.4);
    for(let k = 0; k < Math.floor(dd / 0.6); k++) box(g, w + 0.04, h - 0.4, 0.06, mat(0x88a37a, 0.7), 0, h / 2, -dd / 2 + 0.3 + k * 0.6);
    box(g, 0.1, h * 0.7, dd * 0.4, mat(0x4a5a44, 0.7), w / 2 + 0.03, h * 0.35, 0); };
  shedG(22, 26, 10, 12, 7); shedG(110, -30, 12, 10, 7.5); shedG(150, 24, 8, 8, 6);
  // the silver water tank on its legs
  { const t = Q(80, 24, 0);
    for(let k = 0; k < 6; k++){ const a = k * Math.PI / 3; box(t, 0.3, 6, 0.3, mat(0x6a6a6a, 0.5, 0.4), Math.cos(a) * 2.6, 3, Math.sin(a) * 2.6); }
    cylY(t, 3.2, 3.2, 5, mat(0xc8ccd0, 0.35, 0.6), 0, 8.5, 0, 24);
    add(t, new THREE.SphereGeometry(3.2, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc8ccd0, 0.35, 0.6), 0, 11, 0).scale.y = 0.45;
    box(t, 0.1, 5, 0.6, mat(0x6a6a6a, 0.5, 0.4), 3.3, 8.5, 0); }
  // the big wooden cable wheel, rock piles, a derrick crane
  { const cw = Q(14, 18, 0); add(cw, new THREE.TorusGeometry(2.3, 0.25, 6, 20), mat(0x6a4a30, 0.9), 0, 2.5, 0); for(let k = 0; k < 6; k++){ const s = box(cw, 0.25, 4.6, 0.25, mat(0x6a4a30, 0.9), 0, 2.5, 0); s.rotation.z = k * Math.PI / 6; } }
  for(let k = 0; k < 9; k++){ const g = Q(20 + rnd() * 130, (rnd() < 0.5 ? -1 : 1) * (22 + rnd() * 18), 0); heap(g, 0, 0, 3 + rnd() * 4, 2 + rnd() * 3, ROCK[k % 4]);
    for(let j = 0; j < 4; j++){ const b = box(g, 0.8 + rnd(), 0.6 + rnd() * 0.6, 0.8 + rnd(), mat(ROCK[j % 4], 0.95), (rnd() - 0.5) * 6, 0.3, (rnd() - 0.5) * 6); b.rotation.y = rnd() * 3; } }
  { const dc = Q(90, -28, 0); cylY(dc, 0.3, 0.3, 12, mat(0x3a3a3a, 0.6, 0.3), 0, 6, 0, 8); const j = box(dc, 0.35, 0.35, 14, mat(0x3a3a3a, 0.6, 0.3), 0, 9, 5.5); j.rotation.x = -0.6; }
  // Cliff the crawler shovel and two dump trucks
  { const c = Q(26, -30, 0), Y = mat(0xd9a520, 0.55), DK = mat(0x2a2a2a, 0.7);
    for(const x of [-1.6, 1.6]) box(c, 1.0, 1.0, 5, DK, x, 0.5, 0);
    box(c, 3.6, 1.6, 3.6, Y, 0, 1.9, -0.3); box(c, 2.2, 1.4, 1.8, Y, -0.6, 3.4, -1.0); box(c, 0.1, 0.8, 1.4, glassMat(), -1.72, 3.5, -1.0);
    const boom = box(c, 0.5, 0.5, 6, Y, 0.6, 3.6, 3.2); boom.rotation.x = -0.6;
    box(c, 1.4, 1.2, 1.2, DK, 0.6, 5.0, 6.0); }
  for(const [d, l] of [[40, -24], [130, 22]]){ const t = Q(d, l, 0), Y = mat(0xd9a520, 0.55);
    box(t, 2.6, 1.6, 4, mat(0x8a7a5a, 0.8), 0, 2.0, -0.8); box(t, 2.4, 1.6, 1.6, Y, 0, 2.0, 2.2); box(t, 0.04, 0.7, 1.2, glassMat(), 1.22, 2.3, 2.2);
    for(const z of [-1.8, 2.2]) for(const x of [-1.2, 1.2]) cylY(t, 0.55, 0.55, 0.4, mat(0x1a1a1a, 0.7), x, 0.55, z, 12).rotation.z = Math.PI / 2; }
  // the quarrymen's platform and shelter by the gates
  for(let d = 140; d < 170; d += 10){ const p = Q(d + 5, -4.4, 0); box(p, 3.6, 0.95, 10.2, mat(0x8a8a80, 0.9), 0, 0.47, 0); }
  { const sh = Q(155, -7, 0); box(sh, 2.2, 2.6, 5, mat(0x6a4a30, 0.85), 0, 1.3, 0); box(sh, 2.8, 0.15, 5.6, mat(SLATE, 0.75), 0.3, 2.7, 0); box(sh, 0.1, 2.0, 4.4, mat(0x2a2420, 0.9), 1.1, 1.2, 0); }
  { const gt = Q(185, 0, 0); for(const x of [-6, 6]) { box(gt, 0.5, 2.6, 0.5, mat(0x3a3a3a, 0.6), x, 1.3, 0); const b = box(gt, 0.12, 0.12, 5, mat(0xd9a520, 0.6), x, 1.8, -2.5); } }
}

// telegraph poles and trees keep clear of all this
if(S && S.bakeVC) S.bakeVC(ROOT);                // merge everything into a handful of meshes
window.FFQ = {root: ROOT};
if(K.trees && K.trees.invalidate) K.trees.invalidate();
})();
