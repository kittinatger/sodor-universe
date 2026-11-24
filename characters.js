// Skarloey Railway: detailed engines, rolling stock and the characters who work the line.
// Loaded after the main scene script; uses its globals (scene, LINES, STATIONS, clickable, ...).
(function(){
'use strict';

const NG = 2.6 * METRE;
const MINI = NG * 0.6;   // the 15-inch gauge Arlesdale engines, about 0.6 the size of the 2 ft 3 in ones     // narrow-gauge models: 1 model unit = 2.6 m, so Skarloey is ~5.6 m long
const STD = 4.8 * METRE;    // the NWR's standard-gauge models: ~12 m engines and coaches
const GAUGE = 0.56;         // model units between the wheel planes
const BRASS = 0xc9a23a, BRONZE = 0xa8703c, BLACK = 0x18191b, IRON = 0x2b2c2e, BEAM_RED = 0xb3201c;

// ------------------------------------------------------------------ materials & primitives
const mats = new Map();
function mat(color, rough = 0.55, metal = 0, extra = null){
  const key = color + '|' + rough + '|' + metal + (extra ? '|' + extra : '');
  let m = mats.get(key);
  if(!m){
    m = new THREE.MeshStandardMaterial({color, roughness: rough, metalness: metal});
    if(extra === 'double') m.side = THREE.DoubleSide;
    mats.set(key, m);
  }
  return m;
}
const brassMat = () => mat(BRASS, 0.32, 0.65);
const bronzeMat = () => mat(BRONZE, 0.35, 0.6);
const glassMat = () => mat(0x1b2830, 0.15, 0.4, 'double');

function add(p, geo, m, x = 0, y = 0, z = 0){ const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); p.add(me); return me; }
const box = (p, w, h, d, m, x, y, z) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z);
function cylZ(p, r1, r2, len, m, x, y, z, seg = 18){ const g = new THREE.CylinderGeometry(r1, r2, len, seg); g.rotateX(Math.PI / 2); return add(p, g, m, x, y, z); }
function cylX(p, r1, r2, len, m, x, y, z, seg = 16){ const g = new THREE.CylinderGeometry(r1, r2, len, seg); g.rotateZ(Math.PI / 2); return add(p, g, m, x, y, z); }
const cylY = (p, r1, r2, h, m, x, y, z, seg = 16) => add(p, new THREE.CylinderGeometry(r1, r2, h, seg), m, x, y, z);
const domeCap = (p, r, m, x, y, z) => add(p, new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, x, y, z);
// Arc of a cylinder around the z axis, centred on the top, spanning ±half radians.
function arcZ(p, r, len, half, m, x, y, z, open = false){
  const g = new THREE.CylinderGeometry(r, r, len, 28, 1, open, Math.PI - half, 2 * half);
  g.rotateX(Math.PI / 2);
  return add(p, g, m, x, y, z);
}
function roof(p, width, len, top, m, z){
  const R = width * 1.1, half = Math.asin(Math.min(0.99, width / 2 / R));
  return arcZ(p, R, len, half, m.side === THREE.DoubleSide ? m : mat(m.color.getHex(), m.roughness, m.metalness, 'double'), 0, top - R, z, true);
}

// Merge every mesh under `group` into one mesh per material (fewer draw calls on phones).
function bake(group, shadow = true){
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse(o => {
    if(!o.isMesh) return;
    const m4 = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(m4);
    if(!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
  });
  while(group.children.length) group.remove(group.children[0]);
  buckets.forEach((geos, m) => {
    let n = 0; geos.forEach(g => n += g.attributes.position.count);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    geos.forEach(g => {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      if(g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count; g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = shadow;
    group.add(mesh);
  });
  return group;
}

// ------------------------------------------------------------------ textures: faces, plates, panels
function canvasTex(w, h, draw){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
const faceMats = new Map();
function faceMat(f = {}){
  const key = JSON.stringify(f);
  if(faceMats.has(key)) return faceMats.get(key);
  const tex = canvasTex(128, 128, (g) => {
    g.fillStyle = f.skin || '#b8bbbe'; g.beginPath(); g.arc(64, 64, 63, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.beginPath(); g.arc(64, 72, 50, 0, 7); g.fill();
    const brow = f.brow || 0, smile = f.smile === undefined ? 0.6 : f.smile, look = f.look || 0;
    for(const s of [-1, 1]){
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(64 + s * 21, 52, 12.5, f.wide ? 13 : 10.5, 0, 0, 7); g.fill();
      g.fillStyle = '#20262b'; g.beginPath(); g.arc(64 + s * 21 + look * 4, 53, 5.5, 0, 7); g.fill();
      g.strokeStyle = '#3a3c40'; g.lineWidth = 4.5; g.lineCap = 'round'; g.beginPath();
      g.moveTo(64 + s * 33, 37 - brow * 3); g.lineTo(64 + s * 11, 37 + brow * 6); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.arc(64, 70, 7, 0, 7); g.fill();
    g.strokeStyle = '#4a2a2a'; g.lineWidth = 4.5; g.beginPath();
    g.moveTo(44, 88); g.quadraticCurveTo(64, 88 + smile * 22, 84, 88); g.stroke();
    if(f.mustache){ g.strokeStyle = '#555'; g.lineWidth = 6; g.beginPath(); g.moveTo(48, 80); g.quadraticCurveTo(64, 74, 80, 80); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 61, 0, 7); g.stroke();
  });
  const m = new THREE.MeshStandardMaterial({map: tex, roughness: 0.6});
  faceMats.set(key, m);
  return m;
}
function faceDisc(p, r, f, x, y, z, back = false){
  const me = add(p, new THREE.CircleGeometry(r, 28), faceMat(f), x, y, z);
  if(back) me.rotation.y = Math.PI;
  return me;
}
const plateMats = new Map();
function plateMat(text, bg, fg, border, font = 'bold 38px Georgia, serif'){
  const key = [text, bg, fg, border].join('|');
  if(plateMats.has(key)) return plateMats.get(key);
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = border; g.fillRect(0, 0, w, h);
    g.fillStyle = bg; g.fillRect(5, 5, w - 10, h - 10);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
  const m = new THREE.MeshStandardMaterial({map: tex, roughness: 0.35, metalness: 0.25});
  plateMats.set(key, m);
  return m;
}
// A plate on both sides of the vehicle at |x| = sx, reading correctly from outside.
function sidePlates(p, m, w, h, sx, y, z){
  for(const s of [-1, 1]){
    const me = add(p, new THREE.PlaneGeometry(w, h), m, s * sx, y, z);
    me.rotation.y = s * Math.PI / 2;
  }
}
const windowsTex = new Map();
function coachSideMat(color, upper, win, n){
  const key = [color, upper, win, n].join('|');
  if(windowsTex.has(key)) return windowsTex.get(key);
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  const tex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = hex(color); g.fillRect(0, 0, w, h);
    if(upper !== null){ g.fillStyle = hex(upper); g.fillRect(0, 0, w, h * 0.5); }
    const pw = w / n;
    for(let i = 0; i < n; i++){
      g.fillStyle = '#1d2a33'; g.fillRect(i * pw + pw * 0.16, h * 0.14, pw * 0.68, h * 0.38);
      g.strokeStyle = 'rgba(212,175,55,0.9)'; g.lineWidth = 3; g.strokeRect(i * pw + pw * 0.12, h * 0.1, pw * 0.76, h * 0.46);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(i * pw + 4, h * 0.62, pw - 8, h * 0.3);
    }
    g.fillStyle = 'rgba(212,175,55,0.9)'; g.fillRect(0, h * 0.58, w, 3);
  });
  const m = new THREE.MeshStandardMaterial({map: tex, roughness: 0.5});
  windowsTex.set(key, m);
  return m;
}

// ------------------------------------------------------------------ running gear
// A wheelset: spoked wheels with a crank boss and a balance weight, flanged tyres, on a plain axle.
function wheelset(r, z, color = BLACK, spokes = true){
  const g = new THREE.Group(); g.position.set(0, r, z);
  const tyre = mat(color, 0.6, 0.2), hub = mat(0x3a3b3e, 0.45, 0.4), rim = mat(0x8a8d91, 0.3, 0.7);
  for(const s of [-1, 1]){
    const x = s * GAUGE / 2;
    cylX(g, r, r, 0.08, tyre, x, 0, 0, 24);
    cylX(g, r * 1.07, r * 1.07, 0.025, mat(IRON, 0.5, 0.4), s * (GAUGE / 2 - 0.045), 0, 0, 24);   // flange
    cylX(g, r * 0.96, r * 0.96, 0.012, rim, x + s * 0.041, 0, 0, 24);                              // the bright tyre face
    if(spokes){
      cylX(g, r * 0.84, r * 0.84, 0.014, mat(0x0c0c0c, 0.9), x + s * 0.043, 0, 0, 24);             // the dark between the spokes
      const n = r > 0.2 ? 10 : 8;
      for(let k = 0; k < n; k++){ const b = box(g, 0.02, r * 1.66, r * 0.075, tyre, x + s * 0.046, 0, 0); b.rotation.x = k * Math.PI / n; }
      const cw = add(g, new THREE.CircleGeometry(r * 0.78, 18, -0.9, 1.8), tyre, x + s * 0.054, 0, 0);   // balance weight
      cw.rotation.y = s * Math.PI / 2;
    }
    cylX(g, r * 0.26, r * 0.26, 0.04, hub, x + s * 0.05, 0, 0, 12);
    cylX(g, r * 0.1, r * 0.1, 0.06, rim, x + s * 0.06, r * 0.48, 0, 8);                           // crank pin
  }
  cylX(g, 0.03, 0.03, GAUGE, mat(IRON), 0, 0, 0, 8);
  bake(g, false);
  return g;
}
function addRods(root, axles, r, color){
  const zs = axles.map(a => a.z), span = Math.max(...zs) - Math.min(...zs), mid = (Math.max(...zs) + Math.min(...zs)) / 2;
  const rods = [];
  for(const s of [-1, 1]){
    const rod = box(root, 0.026, 0.05, span + 0.12, mat(color || 0x8c8f93, 0.28, 0.75), s * (GAUGE / 2 + 0.085), r, mid);
    rods.push({mesh: rod, mid, r, rc: r * 0.48, phase: s > 0 ? Math.PI / 2 : 0});
  }
  return rods;
}

// ------------------------------------------------------------------ steam engine builder
function chimney(p, S, x, y, z){
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  const blk = mat(BLACK, 0.55, 0.1, 'double');
  if(S.chimney === 'giesl'){                       // Peter Sam's flat, oblong Giesl ejector
    box(g, 0.13, 0.3, 0.34, blk, 0, 0.15, 0);
    box(g, 0.2, 0.06, 0.42, blk, 0, 0.03, 0);
    box(g, 0.15, 0.035, 0.37, mat(0x333333, 0.4, 0.3), 0, 0.31, 0);
    box(g, 0.06, 0.02, 0.28, mat(0x0a0a0a), 0, 0.33, 0);
    return;
  }
  const h = S.chimneyH || 0.5;
  // a flared foot sitting on the smokebox, a slim barrel, then the capuchon or a flared top
  const prof = [[0.17, 0], [0.12, 0.03], [0.09, 0.08], [0.083, h * 0.5], [0.087, h - 0.11], [0.11, h - 0.05], [0.118, h - 0.02], [0.118, h], [0.072, h], [0.07, h - 0.08]]
    .map(([a, b]) => new THREE.Vector2(a, b));
  add(g, new THREE.LatheGeometry(prof, 20), blk);
  if(S.capColor) cylY(g, 0.121, 0.121, 0.055, mat(S.capColor, 0.3, 0.65), 0, h - 0.028, 0, 20);
  if(S.chimneyStripe) cylY(g, 0.088, 0.088, 0.045, mat(S.chimneyStripe, 0.3, 0.65), 0, h * 0.52, 0, 18);
}
// a brass bell-shaped safety valve bonnet, or a dome with a flared foot
function bell(p, m, x, y, z, k = 1){
  const prof = [[0.1, 0], [0.075, 0.03], [0.05, 0.08], [0.045, 0.14], [0.06, 0.17], [0.035, 0.2], [0.012, 0.23], [0, 0.235]].map(([a, b]) => new THREE.Vector2(a * k, b * k));
  return add(p, new THREE.LatheGeometry(prof, 16), m, x, y, z);
}
function domeShape(p, m, x, y, z, r = 0.13){
  const prof = [[r * 1.45, 0], [r * 1.15, 0.03], [r, 0.07], [r, 0.12]];
  for(let k = 1; k <= 8; k++){ const a = k / 8 * Math.PI / 2; prof.push([r * Math.cos(a), 0.12 + r * 0.95 * Math.sin(a)]); }
  return add(p, new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 20), m, x, y, z);
}
// a handrail on stanchions between two points along z, at |x| = sx
function handrail(p, sx, y, z0, z1, m){
  const len = Math.abs(z1 - z0);
  for(const s of [-1, 1]){
    cylZ(p, 0.011, 0.011, len, m, s * sx, y, (z0 + z1) / 2, 6);
    for(let k = 0; k <= Math.max(1, Math.round(len / 0.35)); k++){ const z = z0 + (z1 - z0) * k / Math.max(1, Math.round(len / 0.35)); cylX(p, 0.007, 0.007, 0.05, m, s * (sx - 0.025), y, z, 5); cylY(p, 0.017, 0.017, 0.02, m, s * sx, y, z, 6); }
  }
}

function buildSteam(S){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = S.len, F = L / 2, R = -L / 2;
  const C = mat(S.color, 0.4), LIN = mat(S.lining, 0.35, 0.3), BEAM = mat(S.beam || BEAM_RED, 0.5), BLK = mat(BLACK, 0.7), STEEL = mat(0x9a9da2, 0.3, 0.7);
  const FIT = S.fittings === 'bronze' ? bronzeMat() : brassMat();
  const br = S.boilerR || 0.3, by = S.boilerY || 0.98;
  const bunkLen = S.bunkerLen === undefined ? 0.3 : S.bunkerLen, cabLen = S.cabLen || 0.6;
  const cabRear = R + 0.07 + bunkLen, cabFront = cabRear + cabLen;
  const deck = 0.62;

  // ---- frames, axleboxes and springs, the running plate with its valance
  box(body, 0.44, 0.32, L - 0.12, BLK, 0, 0.43, 0);
  for(const a of S.axles){
    for(const s of [-1, 1]){
      box(body, 0.05, 0.13, 0.13, mat(0x2a2b2d, 0.6), s * 0.235, a.r + 0.0, a.z);                     // axlebox
      box(body, 0.045, 0.035, Math.min(0.34, a.r * 1.4), mat(0x3a3b3e, 0.5, 0.3), s * 0.235, a.r + 0.12, a.z);   // leaf spring
      box(body, 0.045, 0.02, Math.min(0.3, a.r * 1.2), mat(0x3a3b3e, 0.5, 0.3), s * 0.235, a.r + 0.15, a.z);
    }
  }
  box(body, 0.84, 0.045, L - 0.04, mat(S.foot || BLACK, 0.6), 0, deck, 0);
  for(const s of [-1, 1]){
    box(body, 0.02, 0.07, L - 0.08, C, s * 0.42, deck - 0.045, 0);                                    // valance
    box(body, 0.022, 0.016, L - 0.12, LIN, s * 0.421, deck - 0.045, 0);
  }
  // ---- bufferbeams: central buffer, coupling hook and chain, lamp irons, a lamp on the front
  for(const e of [1, -1]){
    const z = e * (L / 2 - 0.035);
    box(body, 0.86, 0.2, 0.07, BEAM, 0, 0.53, z);
    box(body, 0.84, 0.018, 0.075, LIN, 0, 0.62, z);
    cylZ(body, 0.065, 0.065, 0.13, BLK, 0, 0.5, z + e * 0.09, 12);
    cylZ(body, 0.1, 0.1, 0.03, mat(0x7a7a7a, 0.3, 0.6), 0, 0.5, z + e * 0.165, 16);
    box(body, 0.03, 0.06, 0.06, BLK, 0, 0.42, z + e * 0.06);
    for(let k = 0; k < 2; k++) add(body, new THREE.TorusGeometry(0.025, 0.008, 5, 10), STEEL, 0, 0.38 - k * 0.04, z + e * 0.08).rotation.y = k * Math.PI / 2;
    for(const sx of [-0.28, 0, 0.28]) box(body, 0.03, 0.06, 0.02, mat(0x555555, 0.4, 0.5), sx, 0.66, z + e * 0.02);   // lamp irons
    for(const s of [-1, 1]){ box(body, 0.02, 0.2, 0.07, BLK, s * 0.31, 0.32, z - e * 0.03); box(body, 0.1, 0.02, 0.08, mat(0x555555, 0.5, 0.4), s * 0.31, 0.24, z - e * 0.03); }  // guard irons
  }
  { const lamp = new THREE.Group(); lamp.position.set(-0.28, 0.69, F - 0.04); body.add(lamp);         // the white lamp on the front
    box(lamp, 0.12, 0.13, 0.1, mat(0xeeeeea, 0.45), 0, 0.065, 0); cylZ(lamp, 0.04, 0.04, 0.02, mat(0xfff4d0, 0.2), 0, 0.065, 0.055, 12);
    box(lamp, 0.13, 0.02, 0.11, mat(0xdedede, 0.4), 0, 0.14, 0); add(lamp, new THREE.TorusGeometry(0.03, 0.007, 4, 10, Math.PI), mat(0xcfcfcf, 0.4), 0, 0.15, 0); }
  // ---- outside cylinders with covers and a valve chest; slide bars and crosshead
  if(S.cylinders !== false) for(const s of [-1, 1]){
    const cz = F - 0.36;
    cylZ(body, 0.1, 0.1, 0.34, C, s * 0.41, 0.46, cz, 16);
    for(const e of [1, -1]) cylZ(body, 0.106, 0.106, 0.03, S.cylCovers ? mat(S.cylCovers, 0.3, 0.6) : LIN, s * 0.41, 0.46, cz + e * 0.16, 16);
    cylZ(body, 0.04, 0.04, 0.03, STEEL, s * 0.41, 0.46, cz + 0.19, 8);
    box(body, 0.1, 0.1, 0.28, C, s * 0.39, 0.58, cz);
    for(const y of [0.5, 0.42]) box(body, 0.02, 0.018, 0.22, STEEL, s * 0.41, y, cz - 0.28);
    box(body, 0.05, 0.07, 0.06, STEEL, s * 0.41, 0.46, cz - 0.3);
  }
  // ---- boiler with bands, smokebox and its door ring, saddle, chimney
  const boilerFront = F - 0.1, smokeLen = 0.34;
  const boilerLen = boilerFront - smokeLen - cabFront;
  const boilerMat = S.boilerColor ? mat(S.boilerColor, 0.4) : C;
  cylZ(body, br, br, boilerLen, boilerMat, 0, by, cabFront + boilerLen / 2, 26);
  const bandMat = S.bands ? mat(S.bands, 0.3, 0.6) : LIN;
  for(let k = 0; k <= 3; k++) cylZ(body, br + 0.008, br + 0.008, 0.022, bandMat, 0, by, cabFront + 0.03 + k * (boilerLen - 0.06) / 3, 26);
  const sbz = boilerFront - smokeLen / 2, SMK = mat(0x202124, 0.62);
  cylZ(body, br + 0.025, br + 0.025, smokeLen, SMK, 0, by, sbz, 26);
  cylZ(body, br + 0.04, br + 0.04, 0.035, mat(0x2d2e31, 0.4, 0.35), 0, by, boilerFront, 26);
  cylZ(body, br + 0.03, br + 0.03, 0.02, mat(0x2d2e31, 0.4, 0.35), 0, by, boilerFront - smokeLen + 0.01, 26);
  box(body, 0.46, by - deck - 0.1, smokeLen * 0.7, BLK, 0, (by + deck) / 2 - 0.05, sbz);
  faceDisc(body, br + 0.005, S.face, 0, by, boilerFront + 0.02);
  // the curved handrail over the face and the top lamp iron
  { const hr = add(body, new THREE.TorusGeometry(br + 0.05, 0.011, 5, 24, Math.PI), FIT, 0, by, boilerFront - 0.04); hr.rotation.z = 0; }
  box(body, 0.03, 0.07, 0.02, mat(0x555555, 0.4, 0.5), 0, by + br + 0.03, boilerFront + 0.02);
  chimney(body, S, 0, by + br - 0.03, sbz);
  box(body, 0.14, 0.12, 0.08, BLK, 0, 0.72, boilerFront - 0.02);
  // ---- tanks
  let plateX = br + 0.012, plateY = by, topY = by + br;
  if(S.tank === 'saddle'){
    const tR = br + 0.13, t0 = S.tankOverSmoke ? boilerFront - 0.1 : boilerFront - smokeLen - 0.03, tl = t0 - cabFront + 0.02;
    arcZ(body, tR, tl, 2.05, C, 0, by, cabFront + tl / 2 - 0.01);
    for(const e of [1, -1]){ const cap = add(body, new THREE.CircleGeometry(tR, 26, Math.PI / 2 - 2.05, 4.1), C, 0, by, cabFront - 0.01 + (e > 0 ? tl : 0)); if(e < 0) cap.rotation.y = Math.PI; }
    add(body, new THREE.TorusGeometry(tR + 0.005, 0.012, 5, 26, 4.1), LIN, 0, by, cabFront - 0.01 + tl - 0.02).rotation.z = Math.PI / 2 - 2.05;
    for(const s of [-1, 1]){
      const ang = 2.05 - 0.04, lx = Math.sin(ang) * (tR + 0.006), ly = -Math.cos(ang) * (tR + 0.006);
      box(body, 0.012, 0.02, tl - 0.06, LIN, s * lx, by + ly, cabFront + tl / 2);
      box(body, 0.012, 0.02, tl - 0.06, LIN, s * (tR + 0.004), by + 0.16, cabFront + tl / 2);
    }
    // filler hatch with its hinge, handrails along the tank
    cylY(body, 0.075, 0.075, 0.05, FIT, 0, by + tR + 0.01, t0 - 0.14, 14); box(body, 0.03, 0.02, 0.09, FIT, 0, by + tR + 0.04, t0 - 0.21);
    handrail(body, tR * 0.86, by + tR * 0.55, cabFront + 0.06, t0 - 0.06, FIT);
    plateX = tR + 0.006; topY = by + tR;
  } else if(S.tank === 'side'){
    const tl = S.tankLen || boilerLen + 0.1;
    for(const s of [-1, 1]){
      box(body, 0.17, 0.46, tl, C, s * 0.33, deck + 0.25, cabFront + tl / 2);
      box(body, 0.176, 0.02, tl - 0.05, LIN, s * 0.33, deck + 0.46, cabFront + tl / 2);
      box(body, 0.176, 0.02, tl - 0.05, LIN, s * 0.33, deck + 0.05, cabFront + tl / 2);
      box(body, 0.176, 0.42, 0.02, LIN, s * 0.33, deck + 0.25, cabFront + tl - 0.03);
      cylY(body, 0.045, 0.045, 0.05, FIT, s * 0.33, deck + 0.5, cabFront + tl - 0.12, 12);
    }
    handrail(body, br + 0.05, by + 0.14, cabFront + 0.05, boilerFront - smokeLen, FIT);
    plateX = 0.33 + 0.088; plateY = deck + 0.26;
  } else {
    if(S.tank === 'well'){
      box(body, 0.48, 0.2, boilerLen * 0.85, C, 0, 0.47, cabFront + boilerLen * 0.48);
      box(body, 0.484, 0.018, boilerLen * 0.8, LIN, 0, 0.56, cabFront + boilerLen * 0.48);
    }
    handrail(body, br + 0.05, by + 0.12, cabFront + 0.05, boilerFront - 0.04, FIT);
  }
  // ---- boiler mountings: dome, safety valves, whistle, sandboxes and pipes
  const top = S.tank === 'saddle' ? topY : by + br;
  if(S.dome) domeShape(body, S.domeColor ? mat(S.domeColor, 0.3, 0.6) : FIT, 0, top - 0.035, cabFront + boilerLen * (S.domeAt || 0.55));
  if(S.safety === 'bell') bell(body, FIT, 0, top - 0.02, cabFront + 0.14, 1.1);
  else { cylY(body, 0.045, 0.06, 0.12, FIT, 0, top + 0.04, cabFront + 0.12, 12); for(const s of [-1, 1]) cylY(body, 0.022, 0.022, 0.12, FIT, s * 0.04, top + 0.15, cabFront + 0.12, 8); }
  cylY(body, 0.012, 0.012, 0.12, FIT, 0.11, top + 0.04, cabFront + 0.04, 6); bell(body, FIT, 0.11, top + 0.09, cabFront + 0.04, 0.45);   // whistle
  for(const s of [-1, 1]){
    box(body, 0.1, 0.1, 0.22, C, s * 0.36, deck + 0.07, F - 0.22);
    cylY(body, 0.035, 0.035, 0.03, FIT, s * 0.36, deck + 0.13, F - 0.22, 8);
    cylY(body, 0.01, 0.01, 0.3, mat(0x2a2a2a, 0.5), s * 0.33, deck - 0.15, S.axles[0].z + 0.2, 5);
  }
  // ---- the cab: spectacle plate with round windows, side sheets, a roof with an overhang and rain strip
  const cabH = S.cabH || 0.74, cabTop = deck + cabH, weather = S.cab === 'weatherboard';
  box(body, 0.8, weather ? cabH - 0.1 : cabH, 0.04, C, 0, deck + (weather ? cabH - 0.1 : cabH) / 2, cabFront);
  for(const s of [-1, 1]) for(const f of [1, -1]){
    const wy = cabTop - (weather ? 0.3 : 0.2);
    const w = add(body, new THREE.CircleGeometry(0.08, 18), glassMat(), s * 0.22, wy, cabFront + f * 0.022);
    if(f < 0) w.rotation.y = Math.PI;
    const ring = add(body, new THREE.RingGeometry(0.08, 0.102, 20), S.portholes ? mat(S.portholes, 0.4) : FIT, s * 0.22, wy, cabFront + f * 0.023);
    if(f < 0) ring.rotation.y = Math.PI;
  }
  if(weather){ box(body, 0.82, 0.02, 0.05, LIN, 0, deck + cabH - 0.1, cabFront); }
  const sideH = S.cab === 'open' ? 0.36 : weather ? 0.3 : 0.44;
  for(const s of [-1, 1]){
    if(!weather){
      box(body, 0.04, sideH, cabLen, C, s * 0.4, deck + sideH / 2, cabFront - cabLen / 2);
      box(body, 0.042, cabH, 0.06, C, s * 0.4, deck + cabH / 2, cabFront - 0.03);
      box(body, 0.042, cabH, 0.06, C, s * 0.4, deck + cabH / 2, cabRear + 0.03);
      box(body, 0.044, 0.018, cabLen - 0.12, LIN, s * 0.4, deck + sideH - 0.05, cabFront - cabLen / 2);
      box(body, 0.044, sideH - 0.12, 0.018, LIN, s * 0.4, deck + sideH / 2, cabFront - 0.08);
      box(body, 0.044, sideH - 0.12, 0.018, LIN, s * 0.4, deck + sideH / 2, cabRear + 0.08);
      cylY(body, 0.01, 0.01, cabH - 0.1, FIT, s * 0.425, deck + cabH / 2, cabRear + 0.07, 6);   // grab handle
    } else box(body, 0.04, sideH, 0.24, C, s * 0.4, deck + sideH / 2, cabFront - 0.12);
    for(let k = 0; k < 2; k++) box(body, 0.06, 0.016, 0.14, BLK, s * 0.39, 0.42 - k * 0.12, cabFront - cabLen / 2);   // steps
    box(body, 0.02, 0.26, 0.016, BLK, s * 0.42, 0.37, cabFront - cabLen / 2 - 0.07); box(body, 0.02, 0.26, 0.016, BLK, s * 0.42, 0.37, cabFront - cabLen / 2 + 0.07);
    if(S.cab === 'closed') box(body, 0.042, 0.06, cabLen, C, s * 0.4, cabTop - 0.04, cabFront - cabLen / 2);
  }
  if(S.cab === 'closed'){
    box(body, 0.8, cabH * 0.45, 0.04, C, 0, deck + cabH * 0.225, cabRear);
    for(const s of [-1, 1]) box(body, 0.16, cabH * 0.55, 0.04, C, s * 0.32, deck + cabH * 0.725, cabRear);
    for(const s of [-1, 1]){ const w = add(body, new THREE.CircleGeometry(0.075, 16), glassMat(), s * 0.22, cabTop - 0.2, cabRear - 0.022); w.rotation.y = Math.PI; }
  }
  if(!weather){
    roof(body, 0.94, cabLen + 0.16, cabTop + 0.07, S.roof ? mat(S.roof, 0.5) : C, cabFront - cabLen / 2);
    for(const s of [-1, 1]) box(body, 0.015, 0.015, cabLen + 0.12, mat(0x2a2a2a, 0.5), s * 0.3, cabTop + 0.085, cabFront - cabLen / 2);   // rain strips
  }
  // the backhead: firebox door, gauges and the regulator
  box(body, 0.6, 0.42, 0.06, mat(0x2a2a2a, 0.8), 0, deck + 0.21, cabFront - 0.05);
  box(body, 0.16, 0.12, 0.02, mat(0x1a1a1a, 0.6), 0, deck + 0.2, cabFront - 0.085);
  for(const sx of [-0.12, 0.12]) cylZ(body, 0.035, 0.035, 0.015, FIT, sx, deck + 0.38, cabFront - 0.085, 12);
  box(body, 0.03, 0.03, 0.18, FIT, 0.05, deck + 0.46, cabFront - 0.13);
  // ---- bunker and coal
  if(bunkLen > 0){
    box(body, 0.8, 0.42, bunkLen, C, 0, deck + 0.21, cabRear - bunkLen / 2);
    for(const s of [-1, 1]) box(body, 0.012, 0.3, bunkLen - 0.06, LIN, s * 0.402, deck + 0.21, cabRear - bunkLen / 2);
    const COAL = mat(0x121212, 0.95);
    for(let k = 0; k < 6; k++){ const c = box(body, 0.2 + (k % 3) * 0.06, 0.06, bunkLen * 0.4, COAL, -0.22 + (k % 3) * 0.22, deck + 0.44 + (k % 2) * 0.03, cabRear - bunkLen * (0.28 + 0.4 * Math.floor(k / 3))); c.rotation.y = k * 0.4; }
    handrail(body, 0.41, deck + 0.38, cabRear - bunkLen + 0.04, cabRear - 0.04, FIT);
  }
  const P = S.plates;
  if(P.name) sidePlates(body, plateMat(P.name, P.bg, P.fg, P.border), P.nameW || 0.62, 0.15, plateX, plateY, P.nameZ !== undefined ? P.nameZ : cabFront + boilerLen * 0.5);
  if(P.number){
    const nx = bunkLen > 0 && !P.numberOnCab ? 0.402 : 0.422, nz = bunkLen > 0 && !P.numberOnCab ? cabRear - bunkLen / 2 : cabFront - cabLen / 2;
    sidePlates(body, plateMat(P.number, P.numBg || P.bg, P.fg, P.border, 'bold 42px Georgia, serif'), 0.22, 0.12, nx, deck + 0.24, nz);
  }

  bake(body);
  const axles = S.axles.map(a => ({...a, g: wheelset(a.r, a.z)}));
  axles.forEach(a => root.add(a.g));
  const coupled = axles.filter(a => a.coupled);
  const rods = coupled.length > 1 ? addRods(root, coupled, coupled[0].r) : [];
  return {group: root, len: L, axles, rods, chimneyAt: new THREE.Vector3(0, by + br + (S.chimneyH || 0.5), sbz)};
}

function buildTender(S){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 1.1, C = mat(S.color, 0.42), LIN = mat(S.lining, 0.35, 0.3), BLK = mat(BLACK, 0.7);
  box(body, 0.44, 0.3, L - 0.1, BLK, 0, 0.42, 0);
  box(body, 0.82, 0.04, L - 0.04, BLK, 0, 0.6, 0);
  for(const e of [1, -1]){ box(body, 0.84, 0.18, 0.06, mat(S.beam || BEAM_RED), 0, 0.52, e * (L / 2 - 0.03)); cylZ(body, 0.06, 0.06, 0.12, BLK, 0, 0.5, e * (L / 2 + 0.05), 10); }
  box(body, 0.76, 0.38, L - 0.18, C, 0, 0.81, -0.03);
  box(body, 0.66, 0.1, L - 0.34, mat(0x101010, 0.95), 0, 1.04, -0.06);
  for(const s of [-1, 1]){ box(body, 0.766, 0.018, L - 0.24, LIN, 0, 0.98, -0.03); box(body, 0.012, 0.3, L - 0.26, LIN, s * 0.383, 0.81, -0.03); }
  box(body, 0.5, 0.14, 0.12, C, 0, 1.06, L / 2 - 0.16);
  bake(body);
  const axles = [0.27, -0.27].map(z => ({z, r: 0.17, g: wheelset(0.17, z)}));
  axles.forEach(a => root.add(a.g));
  return {group: root, len: L, axles, rods: []};
}

function buildFairlie(S){
  // Double Fairlie: central cab, a boiler, smokebox and chimney at each end, two power bogies.
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 3.3, C = mat(S.color, 0.42), BLK = mat(BLACK, 0.7), FIT = brassMat(), deck = 0.64;
  const lineFront = mat(0xf2c419, 0.35, 0.3), lineRear = mat(0xc8262b, 0.35, 0.3);   // Mighty yellow, Mac red
  box(body, 0.84, 0.05, L - 0.06, BLK, 0, deck, 0);
  box(body, 0.46, 0.18, L - 0.3, BLK, 0, 0.5, 0);
  const cabLen = 0.72, by = 1.02, br = 0.31;
  for(const e of [1, -1]){
    const LM = e > 0 ? lineFront : lineRear;
    const z = e * (L / 2 - 0.035);
    box(body, 0.86, 0.2, 0.07, mat(BEAM_RED), 0, 0.55, z);
    cylZ(body, 0.065, 0.065, 0.13, BLK, 0, 0.52, z + e * 0.09, 10);
    cylZ(body, 0.1, 0.1, 0.03, mat(0x7a7a7a, 0.3, 0.6), 0, 0.52, z + e * 0.165, 14);
    const bz0 = e * cabLen / 2, bz1 = e * (L / 2 - 0.1), bl = Math.abs(bz1 - bz0) - 0.34;
    const bmid = e * (cabLen / 2 + bl / 2);
    cylZ(body, br, br, bl, C, 0, by, bmid, 24);
    for(let k = 0; k < 3; k++) cylZ(body, br + 0.008, br + 0.008, 0.022, LM, 0, by, e * (cabLen / 2 + 0.04 + k * (bl - 0.08) / 2), 24);
    const sbz = e * (L / 2 - 0.1 - 0.17);
    cylZ(body, br + 0.025, br + 0.025, 0.34, mat(0x232427, 0.6), 0, by, sbz, 24);
    faceDisc(body, br + 0.005, e > 0 ? S.face : S.face2, 0, by, e * (L / 2 - 0.1 + 0.018), e < 0);
    chimney(body, {chimneyH: 0.42, capColor: BRASS}, 0, by + br - 0.03, sbz);
    domeCap(body, 0.12, FIT, 0, by + br - 0.03, e * (cabLen / 2 + bl * 0.55));
    for(const s of [-1, 1]){
      box(body, 0.16, 0.36, bl, C, s * 0.34, deck + 0.2, bmid);                              // side tanks
      box(body, 0.166, 0.02, bl - 0.04, LM, s * 0.34, deck + 0.36, bmid);
      cylY(body, 0.045, 0.045, 0.05, LM, s * 0.34, deck + 0.4, e * (cabLen / 2 + bl - 0.12), 10);
    }
    box(body, 0.46, by - deck - 0.12, 0.26, BLK, 0, (by + deck) / 2 - 0.05, sbz);
  }
  const cabH = 0.82, cabTop = deck + cabH;
  for(const e of [1, -1]){
    box(body, 0.82, cabH, 0.04, C, 0, deck + cabH / 2, e * cabLen / 2);
    for(const s of [-1, 1]) for(const f of [1, -1]){
      const w = add(body, new THREE.CircleGeometry(0.075, 16), glassMat(), s * 0.22, cabTop - 0.2, e * cabLen / 2 + f * 0.022);
      if(f < 0) w.rotation.y = Math.PI;
      const rg = add(body, new THREE.RingGeometry(0.075, 0.095, 18), e > 0 ? lineFront : lineRear, s * 0.22, cabTop - 0.2, e * cabLen / 2 + f * 0.023);
      if(f < 0) rg.rotation.y = Math.PI;
    }
  }
  for(const s of [-1, 1]){
    box(body, 0.04, 0.44, cabLen, C, s * 0.41, deck + 0.22, 0);
    box(body, 0.044, 0.018, cabLen - 0.1, s < 0 ? lineFront : lineRear, s * 0.41, deck + 0.38, 0);
  }
  roof(body, 0.94, cabLen + 0.12, cabTop + 0.07, C, 0);
  sidePlates(body, plateMat('MIGHTY MAC', '#2b2f86', '#f2c419', '#d4af37'), 0.6, 0.13, 0.425, deck + 0.24, 0);
  bake(body);
  const axles = [];
  for(const e of [1, -1]){
    const bc = e * 1.0;
    const bog = new THREE.Group(); bog.position.z = bc; root.add(bog);
    box(bog, 0.5, 0.2, 0.86, BLK, 0, 0.4, 0);
    for(const s of [-1, 1]) cylZ(bog, 0.09, 0.09, 0.3, C, s * 0.36, 0.42, e * 0.42, 12);
    bake(bog);
    const set = [0.22, -0.22].map(z => ({z: bc + z, r: 0.24, coupled: true, g: wheelset(0.24, bc + z)}));
    set.forEach(a => { root.add(a.g); axles.push(a); });
  }
  const rods = [...addRods(root, axles.slice(0, 2), 0.24), ...addRods(root, axles.slice(2), 0.24)];
  return {group: root, len: L, axles, rods, chimneyAt: new THREE.Vector3(0, by + br + 0.42, L / 2 - 0.27), chimneyAt2: new THREE.Vector3(0, by + br + 0.42, -(L / 2 - 0.27))};
}

function buildRusty(S){
  // Ruston & Hornsby 48DL-type four-wheeled diesel: long bonnet, cab at the rear.
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const L = 1.95, F = L / 2, C = mat(S.color, 0.45), BLK = mat(BLACK, 0.7), YEL = mat(0xf2c400, 0.4, 0.2), deck = 0.56;
  box(body, 0.8, 0.26, L - 0.06, BLK, 0, 0.42, 0);
  box(body, 0.86, 0.05, L - 0.02, BLK, 0, deck, 0);
  for(const e of [1, -1]){
    const z = e * (L / 2 - 0.035);
    box(body, 0.88, 0.2, 0.07, mat(BLACK), 0, 0.48, z);
    for(let k = -2; k <= 2; k++) box(body, 0.1, 0.18, 0.012, YEL, k * 0.18, 0.48, z + e * 0.036);
    cylZ(body, 0.065, 0.065, 0.13, BLK, 0, 0.46, z + e * 0.09, 10);
    cylZ(body, 0.1, 0.1, 0.03, mat(0x7a7a7a, 0.3, 0.6), 0, 0.46, z + e * 0.165, 14);
  }
  const bonLen = 0.98, bz = F - 0.06 - bonLen / 2;
  box(body, 0.66, 0.5, bonLen, C, 0, deck + 0.25, bz);
  roof(body, 0.66, bonLen, deck + 0.56, C, bz);
  const grille = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a3a3a'; g.lineWidth = 5; for(let x = 10; x < w; x += 14){ g.beginPath(); g.moveTo(x, 6); g.lineTo(x, h - 6); g.stroke(); } });
  add(body, new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshStandardMaterial({map: grille, roughness: 0.7}), 0, deck + 0.27, F - 0.059);
  cylY(body, 0.05, 0.05, 0.07, brassMat(), -0.18, deck + 0.6, F - 0.16, 12);                  // radiator cap
  cylY(body, 0.04, 0.045, 0.32, mat(0x2a2a2a, 0.5, 0.3), 0.18, deck + 0.7, bz - 0.12, 10);    // exhaust
  const fm = add(body, new THREE.PlaneGeometry(0.4, 0.4), faceMat(S.face), 0, deck + 0.27, F - 0.055);
  fm.position.z = F - 0.055; fm.renderOrder = 2;
  const cabLen = 0.78, cz = -F + 0.06 + cabLen / 2, cabH = 0.86;
  box(body, 0.84, cabH, cabLen, C, 0, deck + cabH / 2, cz);
  for(const s of [-1, 1]){
    add(body, new THREE.PlaneGeometry(0.4, 0.3), glassMat(), s * 0.421, deck + cabH - 0.26, cz).rotation.y = s * Math.PI / 2;
    for(const [w, h, y, z] of [[0.46, 0.03, deck + cabH - 0.09, cz], [0.46, 0.03, deck + cabH - 0.43, cz], [0.03, 0.37, deck + cabH - 0.26, cz + 0.215], [0.03, 0.37, deck + cabH - 0.26, cz - 0.215]])
      box(body, 0.012, h, w === 0.03 ? 0.03 : w, YEL, s * 0.424, y, z);
  }
  for(const f of [1, -1]) for(const s of [-1, 1]){
    const w = add(body, new THREE.PlaneGeometry(0.28, 0.3), glassMat(), s * 0.2, deck + cabH - 0.26, cz + f * (cabLen / 2 + 0.002));
    if(f < 0) w.rotation.y = Math.PI;
  }
  roof(body, 0.92, cabLen + 0.1, deck + cabH + 0.07, mat(0x3a3a3a, 0.6), cz);
  const tx = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#ff6a13'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RUSTY  5', w / 2, h / 2); });
  sidePlatesTex(body, tx, 0.6, 0.15, 0.331, deck + 0.3, bz);
  bake(body);
  const axles = [0.48, -0.48].map(z => ({z, r: 0.22, coupled: true, g: wheelset(0.22, z, BLACK, true)}));
  axles.forEach(a => root.add(a.g));
  return {group: root, len: L, axles, rods: addRods(root, axles, 0.22, 0x555555)};
}
function sidePlatesTex(p, tex, w, h, sx, y, z){
  const m = new THREE.MeshStandardMaterial({map: tex, roughness: 0.5});
  for(const s of [-1, 1]){ const me = add(p, new THREE.PlaneGeometry(w, h), m, s * sx, y, z); me.rotation.y = s * Math.PI / 2; }
}

// ------------------------------------------------------------------ rolling stock
const STOCK = {
  redCoach:   {kind: 'coach', color: 0x9b1c1c, upper: null, len: 2.1, n: 5, label: 'Red coach'},
  blueCoach:  {kind: 'coach', color: 0x2a4c9c, upper: null, len: 2.1, n: 5, label: 'Blue coach'},
  semiOpen:   {kind: 'semiopen', color: 0x9b1c1c, len: 2.0, label: 'Semi-open coach'},
  refresh:    {kind: 'refresh', color: 0x7a2418, upper: 0xe8dcc0, len: 2.1, label: 'Refreshment coach'},
  tr4w:       {kind: 'coach', color: 0x7b2c22, upper: 0xead9b8, len: 1.45, n: 3, label: 'Talyllyn four-wheeled coach'},
  trSemiOpen: {kind: 'semiopen', color: 0x7b2c22, len: 1.5, label: 'Talyllyn semi-open coach'},
  gvtCoach:   {kind: 'coach', color: 0x3f5a2c, upper: 0xd9cfa5, len: 1.7, n: 4, label: 'Glyn Valley Tramway coach', clerestory: true},
  adOpen:     {kind: 'semiopen', color: 0x8a6a3a, len: 1.9, label: 'Arlesdale open-topped coach', open: true},
  adSemi:     {kind: 'semiopen', color: 0x7a2a22, len: 1.9, label: 'Arlesdale semi-open coach'},
  adSaloon:   {kind: 'coach', color: 0x7a2a22, upper: 0xe6d8b8, len: 2.0, n: 4, label: 'Arlesdale saloon coach'},
  adHopper:   {kind: 'steel', color: 0x4a4d52, len: 1.1, label: 'Arlesdale hopper', text: 'A.R.'},
  adFlat:     {kind: 'bogieflat', color: 0x5d4a3a, len: 2.2, label: 'Arlesdale bogie flatbed'},
  skBrake:    {kind: 'brake', color: 0x8a2a1d, len: 1.4, label: 'Skarloey brake van'},
  trBrake:    {kind: 'brake', color: 0x5b2a20, len: 1.3, label: 'Talyllyn brake van'},
  padBrake:   {kind: 'brake', color: 0x8d8d82, len: 1.3, label: 'Padarn brake van'},
  skSlate:    {kind: 'slate', color: 0x6b5a48, len: 1.0, label: 'Skarloey slate truck'},
  trSlate:    {kind: 'slate', color: 0x7d6a55, len: 0.95, label: 'Talyllyn slate truck'},
  lnwrSlate:  {kind: 'slate', color: 0x494b4f, len: 1.05, label: 'LNWR slate truck', iron: true},
  dinSlate:   {kind: 'dinorwic', color: 0x3a3b3e, len: 0.95, label: 'Dinorwic slate truck'},
  plank3:     {kind: 'plank', planks: 3, color: 0x8a6440, len: 1.1, label: '3-plank truck'},
  plank4:     {kind: 'plank', planks: 4, color: 0x7a5a3c, len: 1.1, label: '4-plank truck'},
  plank5:     {kind: 'plank', planks: 5, color: 0x6e5236, len: 1.15, label: '5-plank truck'},
  bmqTruck:   {kind: 'steel', color: 0x55585f, len: 1.05, label: 'Blue Mountain Quarry truck', text: 'B.M.Q.'},
  openEnd:    {kind: 'openend', color: 0x6a6f74, len: 1.05, label: 'Open end door wagon'},
  waste:      {kind: 'waste', color: 0x5e5148, len: 1.0, label: 'Waste wagon'},
  vtipper:    {kind: 'vtipper', color: 0x7b4a2d, len: 0.95, label: 'V-tipper wagon'},
  mine:       {kind: 'mine', color: 0x6a5a4a, len: 0.62, label: 'Mine trolley'},
  flatShort:  {kind: 'flat', color: 0x6b5641, len: 0.95, label: 'Short wheelbase flatbed'},
  flat1:      {kind: 'flat', color: 0x7a6248, len: 1.15, lip: true, label: '1-plank flatbed'},
  well:       {kind: 'well', color: 0x4d4f53, len: 1.6, label: 'Well wagon'},
  bogieFlat:  {kind: 'bogieflat', color: 0x5d4a3a, len: 2.4, label: 'Bogie flatbed'},
  coral:      {kind: 'flat', color: 0xe8735e, len: 1.15, lip: true, label: 'Coral flatbed', load: 'crates'},
  slab:       {kind: 'slab', color: 0x4b4d52, len: 1.1, label: 'Slab wagon'},
  carCyrn:    {kind: 'carcyrn', color: 0x6b4a2e, len: 1.2, label: 'Car Cyrn'},
  fusit:      {kind: 'van', color: 0xb02a24, ends: 0x1d1d1d, len: 1.15, label: 'D. Fusit gunpowder wagon', text: 'D. FUSIT'},
  bmqPowder:  {kind: 'van', color: 0x8c2a1e, ends: 0x2b2b2b, len: 1.1, label: 'BMQ gunpowder wagon', text: 'GUNPOWDER'},
  van:        {kind: 'van', color: 0x6e4a33, ends: 0x5b3c29, len: 1.2, label: 'Van'},
  gwrMatch:   {kind: 'flat', color: 0x6c6e70, len: 1.3, lip: true, label: 'GWR match truck flatbed', text: 'G W'},
  art:        {kind: 'art', color: 0x5a5d62, len: 1.3, label: 'Art transporter'},
  bdCrane:    {kind: 'bdcrane', color: 0xb3201c, len: 1.4, label: 'Narrow gauge breakdown crane'},
  bdVan:      {kind: 'van', color: 0xb3201c, ends: 0x2b2b2b, len: 1.3, label: 'Breakdown train tool van', text: 'BREAKDOWN'},
};

function underframe(body, L, r = 0.16, wb = null){
  const BLK = mat(BLACK, 0.7);
  box(body, 0.5, 0.14, L - 0.12, BLK, 0, 0.38, 0);
  box(body, 0.04, 0.1, L - 0.06, BLK, -0.27, 0.36, 0); box(body, 0.04, 0.1, L - 0.06, BLK, 0.27, 0.36, 0);
  for(const e of [1, -1]){
    box(body, 0.74, 0.12, 0.05, BLK, 0, 0.38, e * (L / 2 - 0.025));
    cylZ(body, 0.055, 0.055, 0.1, BLK, 0, 0.38, e * (L / 2 + 0.04), 10);
    cylZ(body, 0.085, 0.085, 0.025, mat(0x6e6e6e, 0.35, 0.5), 0, 0.38, e * (L / 2 + 0.095), 12);
  }
  const z = wb === null ? L / 2 - Math.max(0.22, L * 0.22) : wb;
  return [z, -z].map(zz => ({z: zz, r}));
}
function stoneLoad(p, L, w, h, y, col, seed){
  let s = seed || 1; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const m = mat(col, 0.85);
  for(let i = 0; i < 6; i++){
    const b = box(p, w * (0.3 + rnd() * 0.25), h * (0.5 + rnd() * 0.6), L * (0.18 + rnd() * 0.2), m, (rnd() - 0.5) * w * 0.5, y + h * 0.3, (rnd() - 0.5) * L * 0.6);
    b.rotation.set((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.3);
  }
}
let stockSeed = 7;
function buildStock(key){
  const D = STOCK[key], L = D.len, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const C = mat(D.color, 0.55), BLK = mat(BLACK, 0.7), GOLD = mat(0xd4af37, 0.35, 0.4), ROOF = mat(0x5f6164, 0.6);
  let axles, wheelR = 0.16;
  switch(D.kind){
    case 'coach': {
      axles = L > 1.8 ? underframe(body, L, 0.15, L / 2 - 0.42) : underframe(body, L);
      const h = 0.74, y0 = 0.46;
      box(body, 0.84, h, L - 0.08, C, 0, y0 + h / 2, 0);
      sidePlatesTex(body, coachSideMat(D.color, D.upper, 0x1d2a33, D.n).map, L - 0.14, h - 0.08, 0.421, y0 + h / 2, 0);
      for(const e of [1, -1]) box(body, 0.86, 0.04, 0.02, GOLD, 0, y0 + 0.06, e * (L / 2 - 0.04));
      roof(body, 0.92, L, y0 + h + 0.1, ROOF, 0);
      if(D.clerestory) box(body, 0.34, 0.1, L - 0.4, ROOF, 0, y0 + h + 0.12, 0);
      for(const e of [1, -1]) box(body, 0.6, 0.05, 0.16, BLK, 0, y0 + 0.02, e * (L / 2 - 0.1));
      break;
    }
    case 'semiopen': {
      axles = L > 1.8 ? underframe(body, L, 0.15, L / 2 - 0.42) : underframe(body, L);
      const y0 = 0.46;
      box(body, 0.84, 0.36, L - 0.08, C, 0, y0 + 0.18, 0);
      for(const s of [-1, 1]) box(body, 0.846, 0.02, L - 0.14, GOLD, 0, y0 + 0.33, 0);
      const posts = Math.round(L / 0.36);
      if(!D.open) for(let i = 0; i <= posts; i++) for(const s of [-1, 1]) box(body, 0.04, 0.42, 0.04, C, s * 0.4, y0 + 0.57, -L / 2 + 0.06 + i * (L - 0.12) / posts);
      for(let i = 0; i < posts; i++) box(body, 0.7, 0.06, 0.1, mat(0x6b4a2e, 0.7), 0, y0 + 0.4, -L / 2 + 0.06 + (i + 0.5) * (L - 0.12) / posts);
      if(!D.open){
        for(const e of [1, -1]) box(body, 0.84, 0.42, 0.04, C, 0, y0 + 0.57, e * (L / 2 - 0.06));
        roof(body, 0.92, L, y0 + 0.86, ROOF, 0);
      }
      break;
    }
    case 'refresh': {
      axles = underframe(body, L, 0.15, L / 2 - 0.42);
      const h = 0.74, y0 = 0.46;
      box(body, 0.84, h, L - 0.08, C, 0, y0 + h / 2, 0);
      sidePlatesTex(body, coachSideMat(D.color, D.upper, 0x1d2a33, 3).map, L - 0.14, h - 0.08, 0.421, y0 + h / 2, 0.18);
      for(const s of [-1, 1]){
        box(body, 0.02, 0.26, 0.5, mat(0x1d2a33, 0.2), s * 0.422, y0 + 0.5, -L / 2 + 0.4);
        box(body, 0.1, 0.03, 0.56, mat(0x8a6a4a, 0.6), s * 0.46, y0 + 0.36, -L / 2 + 0.4);
      }
      sidePlates(body, plateMat('REFRESHMENTS', '#7a2418', '#f2e6c8', '#d4af37', 'bold 30px Georgia, serif'), 0.5, 0.1, 0.424, y0 + h - 0.08, 0.3);
      roof(body, 0.92, L, y0 + h + 0.1, ROOF, 0);
      break;
    }
    case 'brake': {
      axles = underframe(body, L);
      const y0 = 0.46, bl = L * 0.68;
      box(body, 0.82, 0.78, bl, C, 0, y0 + 0.39, -L / 2 + bl / 2 + 0.05);
      for(const s of [-1, 1]) add(body, new THREE.PlaneGeometry(0.2, 0.18), glassMat(), s * 0.411, y0 + 0.56, -L / 2 + bl * 0.55).rotation.y = s * Math.PI / 2;
      box(body, 0.84, 0.05, L - bl - 0.05, mat(0x4a3a2a, 0.8), 0, y0 + 0.03, L / 2 - (L - bl) / 2);
      for(const s of [-1, 1]) box(body, 0.03, 0.34, 0.03, BLK, s * 0.38, y0 + 0.2, L / 2 - 0.06);
      box(body, 0.78, 0.03, 0.03, BLK, 0, y0 + 0.36, L / 2 - 0.06);
      roof(body, 0.92, L, y0 + 0.9, ROOF, 0);
      cylY(body, 0.035, 0.035, 0.12, BLK, 0, y0 + 0.97, -L / 2 + 0.2, 8);
      break;
    }
    case 'slate': {
      axles = underframe(body, L, 0.15);
      const y0 = 0.46, wood = C;
      box(body, 0.8, 0.05, L - 0.06, wood, 0, y0, 0);
      for(const s of [-1, 1]) box(body, 0.04, 0.14, L - 0.06, D.iron ? mat(D.color, 0.45, 0.4) : wood, s * 0.38, y0 + 0.09, 0);
      for(const e of [1, -1]) box(body, 0.8, 0.14, 0.04, wood, 0, y0 + 0.09, e * (L / 2 - 0.05));
      const SL = mat(0x3c4552, 0.6);
      for(let i = 0; i < 7; i++) box(body, 0.66, 0.035, L - 0.2, SL, 0, y0 + 0.06 + i * 0.04, (i % 2) * 0.02);
      break;
    }
    case 'dinorwic': {
      axles = underframe(body, L, 0.14);
      const y0 = 0.46, IRN = mat(D.color, 0.5, 0.4);
      box(body, 0.74, 0.04, L - 0.08, IRN, 0, y0, 0);
      for(const e of [1, -1]){ box(body, 0.74, 0.04, 0.04, IRN, 0, y0 + 0.3, e * (L / 2 - 0.08)); for(const s of [-1, 1]) box(body, 0.04, 0.32, 0.04, IRN, s * 0.35, y0 + 0.16, e * (L / 2 - 0.08)); }
      const SL = mat(0x3c4552, 0.6);
      for(let i = 0; i < 6; i++) box(body, 0.03, 0.26, L - 0.26, SL, -0.2 + i * 0.08, y0 + 0.15, 0);
      break;
    }
    case 'plank': {
      axles = underframe(body, L);
      const y0 = 0.46, h = 0.075 * D.planks;
      box(body, 0.82, 0.05, L - 0.06, C, 0, y0, 0);
      for(const s of [-1, 1]){
        box(body, 0.04, h, L - 0.06, C, s * 0.39, y0 + h / 2, 0);
        for(let k = 1; k < D.planks; k++) box(body, 0.044, 0.008, L - 0.06, mat(0x2a2016, 0.9), s * 0.39, y0 + k * 0.075, 0);
        for(const zz of [-0.3, 0.3]) box(body, 0.05, h, 0.04, BLK, s * 0.41, y0 + h / 2, zz * L);
      }
      for(const e of [1, -1]) box(body, 0.82, h, 0.04, C, 0, y0 + h / 2, e * (L / 2 - 0.05));
      if(D.planks >= 4) stoneLoad(body, L - 0.2, 0.6, 0.18, y0 + 0.04, 0x4a4a4a, stockSeed++);
      break;
    }
    case 'steel': case 'openend': case 'waste': {
      axles = underframe(body, L);
      const y0 = 0.46, SM = mat(D.color, 0.45, 0.45), h = 0.3;
      box(body, 0.8, 0.04, L - 0.06, SM, 0, y0, 0);
      for(const s of [-1, 1]){
        box(body, 0.04, h, L - 0.06, SM, s * 0.38, y0 + h / 2, 0);
        for(let k = 0; k < 4; k++) box(body, 0.046, h, 0.03, mat(0x3a3c40, 0.5, 0.5), s * 0.38, y0 + h / 2, -L / 2 + 0.1 + k * (L - 0.2) / 3);
      }
      box(body, 0.8, h, 0.04, SM, 0, y0 + h / 2, -(L / 2 - 0.05));
      if(D.kind === 'openend'){ const d = box(body, 0.76, h, 0.035, SM, 0, y0 + h / 2 - 0.06, L / 2 + 0.02); d.rotation.x = 0.55; }
      else box(body, 0.8, h, 0.04, SM, 0, y0 + h / 2, L / 2 - 0.05);
      if(D.text) sidePlates(body, plateMat(D.text, '#55585f', '#ffffff', '#55585f', 'bold 40px Arial'), 0.5, 0.12, 0.402, y0 + h / 2, 0);
      if(D.kind === 'waste') stoneLoad(body, L - 0.2, 0.6, 0.24, y0 + 0.08, 0x6b5a4a, stockSeed++);
      else if(D.kind === 'steel') stoneLoad(body, L - 0.2, 0.62, 0.22, y0 + 0.08, 0x3c4552, stockSeed++);
      break;
    }
    case 'vtipper': {
      axles = underframe(body, L, 0.14);
      const y0 = 0.46, SM = mat(D.color, 0.5, 0.4);
      box(body, 0.5, 0.06, L - 0.1, BLK, 0, y0, 0);
      for(const s of [-1, 1]){ const p = box(body, 0.04, 0.5, L - 0.16, SM, s * 0.17, y0 + 0.28, 0); p.rotation.z = s * 0.62; }
      for(const e of [1, -1]){ const sh = new THREE.Shape(); sh.moveTo(-0.33, 0.44); sh.lineTo(0.33, 0.44); sh.lineTo(0.02, 0.04); sh.lineTo(-0.02, 0.04); sh.closePath();
        const eg = new THREE.ShapeGeometry(sh); const em = add(body, eg, mat(D.color, 0.5, 0.4, 'double'), 0, y0 + 0.02, e * (L / 2 - 0.09)); }
      stoneLoad(body, L - 0.3, 0.4, 0.14, y0 + 0.3, 0x8a8172, stockSeed++);
      break;
    }
    case 'mine': {
      axles = underframe(body, L, 0.1, 0.16);
      const y0 = 0.4, SM = mat(D.color, 0.5, 0.4);
      cylZ(body, 0.3, 0.26, 0.42, SM, 0, y0 + 0.2, 0, 14);
      box(body, 0.5, 0.06, 0.42, SM, 0, y0 + 0.02, 0);
      stoneLoad(body, 0.32, 0.38, 0.12, y0 + 0.3, 0x55606b, stockSeed++);
      break;
    }
    case 'flat': {
      axles = underframe(body, L);
      const y0 = 0.46;
      box(body, 0.84, 0.06, L - 0.04, C, 0, y0, 0);
      if(D.lip) for(const s of [-1, 1]) box(body, 0.04, 0.07, L - 0.04, C, s * 0.4, y0 + 0.06, 0);
      if(D.text) sidePlates(body, plateMat(D.text, '#6c6e70', '#ffffff', '#6c6e70', 'bold 44px Arial'), 0.32, 0.07, 0.424, y0 + 0.02, 0);
      if(D.load === 'crates') for(const zz of [-0.25, 0.25]) box(body, 0.5, 0.3, 0.38, mat(0xb08a5a, 0.8), 0, y0 + 0.18, zz * L);
      else if(key === 'flat1') for(let i = 0; i < 3; i++) cylZ(body, 0.06, 0.06, L - 0.2, mat(0x8a6a44, 0.8), -0.2 + i * 0.2, y0 + 0.09, 0, 10);
      break;
    }
    case 'well': {
      axles = underframe(body, L, 0.15, L / 2 - 0.2);
      const y0 = 0.46, SM = mat(D.color, 0.5, 0.4);
      for(const e of [1, -1]) box(body, 0.84, 0.08, 0.36, SM, 0, y0, e * (L / 2 - 0.2));
      box(body, 0.84, 0.05, L - 0.76, SM, 0, y0 - 0.14, 0);
      for(const s of [-1, 1]) box(body, 0.05, 0.2, L - 0.76, SM, s * 0.4, y0 - 0.06, 0);
      box(body, 0.58, 0.42, L - 0.9, mat(0x2d4a6b, 0.5, 0.3), 0, y0 + 0.1, 0);
      break;
    }
    case 'bogieflat': {
      const y0 = 0.5;
      box(body, 0.86, 0.07, L - 0.04, C, 0, y0, 0);
      box(body, 0.5, 0.12, L - 0.2, BLK, 0, y0 - 0.08, 0);
      for(const e of [1, -1]){ cylZ(body, 0.055, 0.055, 0.1, BLK, 0, 0.42, e * (L / 2 + 0.04), 10); box(body, 0.5, 0.1, 0.5, BLK, 0, 0.36, e * (L / 2 - 0.42)); }
      for(let i = 0; i < 4; i++) cylZ(body, 0.08, 0.08, L - 0.3, mat(0x9a7a50, 0.8), -0.24 + i * 0.16, y0 + 0.12, 0, 10);
      axles = [L / 2 - 0.28, L / 2 - 0.56, -(L / 2 - 0.28), -(L / 2 - 0.56)].map(z => ({z, r: 0.13}));
      break;
    }
    case 'slab': {
      axles = underframe(body, L);
      const y0 = 0.46, SM = mat(D.color, 0.5, 0.4);
      box(body, 0.82, 0.05, L - 0.06, SM, 0, y0, 0);
      for(const zz of [-0.32, 0, 0.32]){ const a = box(body, 0.04, 0.42, 0.04, SM, 0, y0 + 0.2, zz * L); }
      box(body, 0.04, 0.04, L - 0.1, SM, 0, y0 + 0.42, 0);
      for(const s of [-1, 1]){ const sl = box(body, 0.05, 0.4, L - 0.2, mat(0x8d8a84, 0.8), s * 0.12, y0 + 0.22, 0); sl.rotation.z = -s * 0.18; }
      break;
    }
    case 'carcyrn': {
      axles = underframe(body, L);
      const y0 = 0.46;
      box(body, 0.84, 0.05, L - 0.06, C, 0, y0, 0);
      for(const s of [-1, 1]) box(body, 0.04, 0.24, L - 0.06, C, s * 0.4, y0 + 0.14, 0);
      for(let i = 0; i < 3; i++) box(body, 0.7, 0.05, 0.12, mat(0x8a6a44, 0.7), 0, y0 + 0.2, -L / 2 + 0.25 + i * (L - 0.5) / 2);
      for(const s of [-1, 1]) for(const e of [1, -1]) box(body, 0.03, 0.5, 0.03, BLK, s * 0.39, y0 + 0.45, e * (L / 2 - 0.06));
      roof(body, 0.9, L, y0 + 0.74, mat(0x4a4a4a, 0.6), 0);
      break;
    }
    case 'van': {
      axles = underframe(body, L);
      const y0 = 0.46, h = 0.7;
      box(body, 0.82, h, L - 0.12, C, 0, y0 + h / 2, 0);
      for(const e of [1, -1]) box(body, 0.84, h + 0.02, 0.04, mat(D.ends, 0.6), 0, y0 + h / 2, e * (L / 2 - 0.06));
      for(const s of [-1, 1]){ box(body, 0.012, h - 0.1, 0.36, mat(D.ends, 0.6), s * 0.416, y0 + h / 2, 0); }
      if(D.text) sidePlates(body, plateMat(D.text, '#' + D.color.toString(16).padStart(6, '0'), '#ffffff', '#' + D.color.toString(16).padStart(6, '0'), 'bold 34px Arial'), 0.62, 0.13, 0.423, y0 + h - 0.16, 0);
      roof(body, 0.9, L - 0.06, y0 + h + 0.08, mat(D.ends, 0.6), 0);
      break;
    }
    case 'art': {
      axles = underframe(body, L);
      const y0 = 0.46;
      box(body, 0.84, 0.06, L - 0.04, C, 0, y0, 0);
      const art = canvasTex(256, 192, (g, w, h) => {
        g.fillStyle = '#c9a45a'; g.fillRect(0, 0, w, h); g.fillStyle = '#87b8e0'; g.fillRect(14, 14, w - 28, h * 0.55);
        g.fillStyle = '#5e9e48'; g.fillRect(14, 14 + h * 0.5, w - 28, h * 0.42 - 28); g.fillStyle = '#d2382a';
        g.beginPath(); g.arc(w * 0.68, h * 0.32, 18, 0, 7); g.fill(); g.fillStyle = '#2f5fd0'; g.fillRect(w * 0.2, h * 0.58, 70, 26);
      });
      const am = new THREE.MeshStandardMaterial({map: art, roughness: 0.6, side: THREE.DoubleSide});
      for(const zz of [-0.25, 0.25]){ box(body, 0.06, 0.62, 0.5, mat(0x6b4a2e, 0.6), 0, y0 + 0.35, zz * L); for(const s of [-1, 1]){ const pm = add(body, new THREE.PlaneGeometry(0.44, 0.33), am, s * 0.032, y0 + 0.38, zz * L); pm.rotation.y = s * Math.PI / 2; } }
      break;
    }
    case 'bdcrane': {
      axles = underframe(body, L);
      const y0 = 0.46;
      box(body, 0.84, 0.08, L - 0.04, C, 0, y0, 0);
      cylY(body, 0.26, 0.3, 0.16, C, 0, y0 + 0.12, 0.2, 16);
      box(body, 0.46, 0.4, 0.42, C, 0, y0 + 0.4, 0.2);
      const jib = box(body, 0.12, 0.1, 1.2, mat(0x2b2b2b, 0.5, 0.3), 0, y0 + 0.62, -0.25); jib.rotation.x = -0.32;
      cylY(body, 0.01, 0.01, 0.4, mat(0x111111), 0, y0 + 0.62, -0.78, 4);
      box(body, 0.08, 0.1, 0.06, mat(0x2b2b2b), 0, y0 + 0.4, -0.78);
      break;
    }
  }
  bake(body);
  if(axles){
    axles.forEach(a => { a.r = a.r || wheelR; a.g = wheelset(a.r, a.z, BLACK, false); root.add(a.g); });
  }
  root.userData.stockKey = key;
  return {group: root, len: L, axles: axles || [], rods: [], label: D.label};
}

// ------------------------------------------------------------------ the engines
const plate = (name, number, bg, fg, border = '#d4af37') => ({name: name.toUpperCase(), number: String(number), bg, fg, border});
const ENGINES = [
  {id: 'skarloey', name: 'Skarloey', no: '1', wheels: '0-4-2ST', basis: 'Talyllyn Railway No. 1 Talyllyn (Fletcher Jennings, 1864)',
   livery: 'Crimson with white and gold lining, brass fittings', job: 'Passenger trains with the red coaches',
   build: () => buildSteam({len: 2.15, color: 0x9b1730, lining: 0xf3f0e8, tank: 'saddle', tankOverSmoke: true, safety: 'bell', cab: 'open', chimneyH: 0.55, capColor: null,
     dome: false, bunkerLen: 0.28, face: {smile: 0.7, brow: -0.3, mustache: false}, plates: plate('Skarloey', 1, '#9b1730', '#d4af37'),
     axles: [{z: 0.62, r: 0.25, coupled: true}, {z: 0.06, r: 0.25, coupled: true}, {z: -0.72, r: 0.15}]}),
   line: 'skarloey', from: "Crovan's Gate", to: 'Glennock', consist: ['redCoach', 'redCoach', 'redCoach'], cars: ['Agnes', 'Ruth', 'Jane'], speed: 1.0, passenger: true},
  {id: 'rheneas', name: 'Rheneas', no: '2', wheels: '0-4-0WT', basis: 'Talyllyn Railway No. 2 Dolgoch (Fletcher Jennings)',
   livery: 'Vermilion with black and gold lining, brass fittings', job: 'Passenger trains around the Lakeside loop',
   build: () => buildSteam({len: 2.2, color: 0xd23a26, lining: 0xd4af37, tank: 'well', cab: 'open', chimneyH: 0.56, capColor: BRASS, bands: BRASS,
     dome: true, domeAt: 0.45, bunkerLen: 0.28, face: {smile: 0.8, brow: -0.2, wide: true}, plates: Object.assign(plate('Rheneas', 2, '#111111', '#d4af37'), {nameW: 0.5}),
     axles: [{z: 0.66, r: 0.25, coupled: true}, {z: -0.62, r: 0.25, coupled: true}]}),
   line: 'skarloeyloop', consist: ['redCoach', 'redCoach', 'skBrake'], cars: ['Lucy', 'Mabel', 'Beatrice'], speed: 0.9, passenger: true},
  {id: 'sirhandel', name: 'Sir Handel', no: '3', wheels: '0-4-2ST', basis: 'Talyllyn Railway No. 3 Sir Haydn (Hughes "Falcon", ex-Corris Railway)',
   livery: 'Royal blue with red lining and bufferbeams, brass fittings', job: 'Slate trains down from Blue Mountain Quarry',
   build: () => buildSteam({len: 2.3, color: 0x1f4fbf, lining: 0xc8262b, tank: 'saddle', safety: 'bell', cab: 'closed', chimneyH: 0.52, capColor: null,
     dome: false, bunkerLen: 0.3, face: {smile: 0.3, brow: 0.6}, plates: plate('Sir Handel', 3, '#c8262b', '#d4af37'),
     axles: [{z: 0.7, r: 0.25, coupled: true}, {z: 0.12, r: 0.25, coupled: true}, {z: -0.78, r: 0.15}]}),
   line: 'skarloey', from: 'Mountain Village', to: 'Blue Mountain Quarry', consist: ['skSlate', 'skSlate', 'skSlate', 'skSlate', 'skBrake'], speed: 0.8},
  {id: 'petersam', name: 'Peter Sam', no: '4', wheels: '0-4-2ST', basis: 'Talyllyn Railway No. 4 Edward Thomas (Kerr Stuart "Tattoo", ex-Corris Railway)',
   livery: 'Sea green with red lining and bufferbeams; Giesl ejector funnel', job: 'Passenger trains on the western line to Ulfstead',
   build: () => buildSteam({len: 2.3, color: 0x2e8b6e, lining: 0xc8262b, tank: 'saddle', safety: 'bell', cab: 'closed', chimney: 'giesl',
     dome: false, domeAt: 0.4, bunkerLen: 0.3, face: {smile: 0.9, brow: -0.1}, plates: plate('Peter Sam', 4, '#c8262b', '#d4af37'),
     axles: [{z: 0.68, r: 0.25, coupled: true}, {z: 0.1, r: 0.25, coupled: true}, {z: -0.78, r: 0.15}]}),
   line: 'skarloey', from: 'Cronk Abbey', to: 'Rumblin Bridge', consist: ['blueCoach', 'blueCoach', 'blueCoach'], speed: 1.0, passenger: true},
  {id: 'rusty', name: 'Rusty', no: '5', wheels: '4wDM', basis: 'Talyllyn Railway No. 5 Midlander (Ruston & Hornsby 48DL diesel)',
   livery: 'Safety orange with yellow window lining; black radiator with a brass cap', job: 'Track maintenance and ballast trains',
   build: () => buildRusty({color: 0xff6a13, face: {smile: 0.8, brow: -0.2}}),
   line: 'skarloey', from: 'Glennock', to: 'Rheneas', consist: ['vtipper', 'vtipper', 'flat1', 'trBrake'], speed: 0.7, diesel: true},
  {id: 'duncan', name: 'Duncan', no: '6', wheels: '0-4-0WT', basis: 'Talyllyn Railway No. 6 Douglas (Andrew Barclay "E" class)',
   livery: 'Golden yellow with red bufferbeams; brass nameplates', job: 'Slate trains to the Wharf',
   build: () => buildSteam({len: 2.05, color: 0xe2a91f, lining: 0x1a1a1a, tank: 'well', cab: 'closed', chimneyH: 0.5, capColor: null, bands: BRASS,
     dome: true, domeAt: 0.5, bunkerLen: 0.26, face: {smile: -0.5, brow: 0.8}, plates: Object.assign(plate('Duncan', 6, '#c9a23a', '#1a1a1a', '#b48a2a'), {nameW: 0.46}),
     axles: [{z: 0.48, r: 0.24, coupled: true}, {z: -0.3, r: 0.24, coupled: true}]}),
   line: 'wharf', consist: ['dinSlate', 'dinSlate', 'dinSlate', 'trSlate', 'trSlate', 'padBrake'], speed: 0.85},
  {id: 'freddie', name: 'Freddie', no: '7', wheels: '2-6-2T', basis: 'Russell (Hunslet, 1906, North Wales Narrow Gauge Railways)',
   livery: 'Pale grey with black and white lining; red bufferbeams and cab porthole rims; bronze dome, chimney cap and stripe', job: 'Goods trains on the Rocky Way',
   build: () => buildSteam({len: 2.75, color: 0xc4c8cc, lining: 0x1a1a1a, tank: 'side', tankLen: 1.0, cab: 'closed', chimneyH: 0.46, capColor: BRONZE,
     chimneyStripe: BRONZE, dome: true, domeColor: BRONZE, domeAt: 0.5, fittings: 'bronze', portholes: 0xc8262b, bunkerLen: 0.3,
     face: {smile: 1.0, brow: 0.2, look: 0.5}, plates: plate('Freddie', 7, '#111111', '#d4af37'),
     axles: [{z: 1.05, r: 0.16}, {z: 0.48, r: 0.24, coupled: true}, {z: 0.0, r: 0.24, coupled: true}, {z: -0.48, r: 0.24, coupled: true}, {z: -1.05, r: 0.16}]}),
   line: 'rockyway', fromU: 0.0, toU: 0.5, consist: ['van', 'van', 'plank3', 'plank4', 'plank5'], speed: 1.2},
  {id: 'duke', name: 'Duke', no: 'MSR 1', wheels: '0-4-0ST+T', basis: 'Ffestiniog Railway No. 2 Prince ("Small England" class)',
   livery: 'Orange-brown with yellow lining and red bufferbeams; red name plaques', job: 'Heritage trains of semi-open coaches',
   build: () => buildSteam({len: 1.75, color: 0x9a5426, lining: 0xf2c419, tank: 'saddle', cab: 'weatherboard', chimneyH: 0.62, capColor: BRASS,
     dome: true, domeAt: 0.4, bunkerLen: 0, cabLen: 0.5, face: {smile: 0.3, brow: 0.3, mustache: true}, plates: Object.assign(plate('Duke', '', '#b3201c', '#d4af37'), {number: null, nameW: 0.4}),
     axles: [{z: 0.42, r: 0.23, coupled: true}, {z: -0.32, r: 0.23, coupled: true}]}),
   tender: {color: 0x9a5426, lining: 0xf2c419},
   line: 'skarloey', from: 'Rheneas', to: 'Mountain Village', consist: ['trSemiOpen', 'trSemiOpen'], speed: 0.7, passenger: true},
  {id: 'bertram', name: 'Bertram', no: '', wheels: '0-4-0ST+T', basis: 'Ffestiniog Railway "Small England" class',
   livery: 'Dark brown with red lining and bufferbeams', job: 'Mine trains at the old workings near Ulfstead',
   build: () => buildSteam({len: 1.75, color: 0x4f2f1c, lining: 0xc8262b, tank: 'saddle', cab: 'weatherboard', chimneyH: 0.62, capColor: BRASS,
     dome: true, domeAt: 0.4, bunkerLen: 0, cabLen: 0.5, face: {smile: 0.9, brow: -0.4, wide: true}, plates: Object.assign(plate('Bertram', '', '#b3201c', '#d4af37'), {number: null, nameW: 0.44}),
     axles: [{z: 0.42, r: 0.23, coupled: true}, {z: -0.32, r: 0.23, coupled: true}]}),
   tender: {color: 0x4f2f1c, lining: 0xc8262b},
   line: 'skarloey', from: 'Rumblin Bridge', to: 'Ulfstead Castle', consist: ['mine', 'mine', 'mine', 'lnwrSlate', 'lnwrSlate'], speed: 0.7},
  {id: 'mightymac', name: 'Mighty Mac', no: '', wheels: '0-4-4-0T', basis: 'Ffestiniog Railway double Fairlie (resembling David Lloyd George)',
   livery: 'Indigo blue; yellow lining on Mighty\'s end, red on Mac\'s', job: 'Long passenger trains to the Ironworks',
   build: () => buildFairlie({color: 0x2b2f86, face: {smile: 0.9, brow: -0.2}, face2: {smile: -0.3, brow: 0.7}}),
   line: 'rockyway', fromU: 0.5, toU: 1.0, consist: ['tr4w', 'tr4w', 'refresh', 'semiOpen'], speed: 1.0, passenger: true},
  {id: 'luke', name: 'Luke', no: '22', wheels: '0-4-0ST', basis: 'Kerr Stuart "Wren" class No. 4256 Peter Pan',
   livery: 'Pea green with white lining; brass number plates on the cab', job: 'Shunting at Blue Mountain Quarry',
   build: () => buildSteam({len: 1.7, color: 0x6aa84f, lining: 0xffffff, tank: 'saddle', cab: 'closed', chimneyH: 0.5, capColor: null,
     dome: true, domeAt: 0.35, bunkerLen: 0.22, cabLen: 0.5, face: {smile: 0.5, brow: -0.5, look: -0.6},
     plates: Object.assign(plate('Luke', 22, '#6aa84f', '#ffffff', '#6aa84f'), {numberOnCab: true, numBg: '#111111', nameW: 0.36}),
     axles: [{z: 0.38, r: 0.22, coupled: true}, {z: -0.26, r: 0.22, coupled: true}]}),
   line: 'skarloey', from: 'Blue Mountain Quarry', to: 'Cronk Abbey', consist: ['bmqTruck', 'bmqTruck', 'bmqTruck', 'bmqPowder'], speed: 0.6},
  // ---- the Arlesdale Railway: 15-inch gauge, Arlesburgh West to Arlesdale (built smaller, see MINI)
  ...arlesdale(),
];
// The Arlesdale Railway, after the Thomas wiki (Railway Series): Bert (0-8-2, after River Irt), Rex and
// Mike (2-8-2, River Esk and River Mite) came from a closed line in 1967; Jock (2-6-2, like Northern Rock)
// was built at Arlesburgh Works in 1976. The steam engines work the passenger trains (Mike prefers the
// ballast); Sigrid runs the staff train from Arlesdale; Frank does empty-carriage work at Arlesburgh;
// the Blisters shunt the ballast chute and work for the platelaying gangs.
function arlesdale(){
  const big = (o) => () => buildSteam(Object.assign({len: 2.5, tank: 'well', cab: 'closed', chimneyH: 0.42, capColor: null, dome: true, domeAt: 0.45,
    domeColor: BRASS, bunkerLen: 0, cabLen: 0.55}, o));
  const ax282 = [{z: 0.95, r: 0.15}, {z: 0.5, r: 0.21, coupled: true}, {z: 0.08, r: 0.21, coupled: true}, {z: -0.34, r: 0.21, coupled: true}, {z: -0.76, r: 0.21, coupled: true}, {z: -1.08, r: 0.15}];
  const ax082 = ax282.slice(1);
  const ax262 = [{z: 0.95, r: 0.15}, {z: 0.45, r: 0.23, coupled: true}, {z: -0.03, r: 0.23, coupled: true}, {z: -0.51, r: 0.23, coupled: true}, {z: -1.0, r: 0.15}];
  const nm = (n, bg, fg) => Object.assign(plate(n, '', bg, fg), {number: null, nameW: 0.34});
  const A = {rail: 'ar', line: 'arlesdale', from: 'Arlesburgh West', to: 'Arlesdale', block: true};
  return [
    {...A, id: 'rex', name: 'Rex', no: '', wheels: '2-8-2+T', basis: 'Ravenglass and Eskdale Railway No. 7 River Esk (Davey Paxman, 1923)',
     livery: 'North Western green with red and yellow lining, red bufferbeams, brass dome, ARLESDALE on the tender',
     job: 'Passenger trains up the valley with the open coaches, always popular in fine weather',
     build: big({color: 0x2e7d3c, lining: 0xf2c419, face: {smile: 0.7, brow: -0.2}, plates: nm('Rex', '#b3201c', '#d4af37'), axles: ax282}),
     tender: {color: 0x2e7d3c, lining: 0xf2c419}, consist: ['adOpen', 'adOpen', 'adOpen', 'adOpen'], speed: 0.85, passenger: true, shedEnd: 'A'},
    {...A, id: 'bert', name: 'Bert', no: '', wheels: '0-8-2+T', basis: 'Ravenglass and Eskdale Railway No. 3 River Irt (rebuilt Heywood 0-8-0)',
     livery: 'North Western blue with red and yellow lining, red bufferbeams, brass dome, ARLESDALE on the tender',
     job: 'Passenger trains up the valley with the saloon coaches built at Arlesburgh Works',
     build: big({color: 0x2a5fb0, lining: 0xc8262b, chimneyH: 0.52, face: {smile: 0.9, brow: 0.1}, plates: nm('Bert', '#b3201c', '#d4af37'), axles: ax082}),
     tender: {color: 0x2a5fb0, lining: 0xc8262b}, consist: ['adSaloon', 'adSaloon', 'adSaloon'], speed: 0.85, passenger: true, shedEnd: 'A'},
    {...A, id: 'mike', name: 'Mike', no: '', wheels: '2-8-2+T', basis: 'Ravenglass and Eskdale Railway No. 9 River Mite (Clarkson, 1966)',
     livery: 'Red with blue lining and yellow cab window frames, red bufferbeams, brass dome, ARLESDALE on the tender',
     job: 'Ballast trains of mine spoil from Arlesdale down to the chute at Arlesburgh West (he prefers goods to passengers)',
     build: big({color: 0xb3262a, lining: 0x2a5fb0, face: {smile: 0.2, brow: 0.6}, plates: nm('Mike', '#b3201c', '#d4af37'), axles: ax282}),
     tender: {color: 0xb3262a, lining: 0x2a5fb0}, consist: ['adHopper', 'adHopper', 'adHopper', 'adHopper', 'adHopper'], speed: 0.7, shedEnd: 'A'},
    {...A, id: 'jock', name: 'Jock', no: '', wheels: '2-6-2+T', basis: 'Ravenglass and Eskdale Railway No. 10 Northern Rock (built at Arlesburgh Works, 1976)',
     livery: 'Highland Railway chartreuse yellow with red lining, red bufferbeams, brass dome, red and gold nameplates',
     job: 'Relief and extra passenger trains, stabled at Arlesdale',
     build: big({color: 0xc9cf3a, lining: 0xc8262b, chimneyH: 0.52, face: {smile: 1.0, brow: -0.3}, plates: nm('Jock', '#b3201c', '#d4af37'), axles: ax262}),
     tender: {color: 0xc9cf3a, lining: 0xc8262b}, consist: ['adSaloon', 'adOpen', 'adOpen'], speed: 0.85, passenger: true, shedEnd: 'B'},
    {...A, id: 'sigrid', name: 'Sigrid of Arlesdale', no: '', wheels: '4-6-4DH', basis: 'Ravenglass and Eskdale Railway Shelagh of Eskdale (Severn-Lamb, 1969)',
     livery: 'Two-tone blue, the lighter centre band sweeping down to a point at each end',
     job: 'The staff train, taking railway employees from Arlesdale to work in the morning and home in the evening',
     build: () => buildRusty({color: 0x2a5a9a, face: {smile: 0.8, brow: -0.4, lashes: true}}),
     consist: ['adSaloon'], speed: 0.8, passenger: true, diesel: true, shedEnd: 'B'},
    {...A, id: 'frank', name: 'Frank', no: '', wheels: '0-4-4DM', basis: 'Ravenglass and Eskdale Railway ICL4 Perkins (built at Arlesburgh Works, c.1967)', block: false,
     livery: 'Light grey with a red stripe, red bufferbeams, red and gold nameplates',
     job: 'Shunting and empty-carriage workings at Arlesburgh West', yard: 'Arlesburgh West', yardOff: -17, consist: ['adSaloon', 'adSaloon', 'adOpen'], cat: 'Diesel', diesel: true,
     build: () => buildRusty({color: 0xb8bcc0, face: {smile: 0.3, brow: 0.6}})},
    {...A, id: 'blister1', name: 'Blister I', no: '', wheels: '4wDM', basis: 'Ravenglass and Eskdale Railway Cyril (Lister, c.1932)', block: false,
     livery: 'Black with black and yellow warning panels front and rear',
     job: 'Shunting the hoppers at the ballast chute at Arlesburgh West', yard: 'Arlesburgh West', yardOff: -21, consist: ['adHopper', 'adHopper', 'adHopper'], cat: 'Diesel', diesel: true,
     build: () => buildRusty({color: 0x1c1c1e, face: {smile: 0.4, brow: 0.2}})},
    {...A, id: 'blister2', name: 'Blister II', no: '', wheels: '4wDM', basis: 'Ravenglass and Eskdale Railway Cyril (Lister, c.1932)', block: false,
     livery: 'Black with black and yellow warning panels front and rear',
     job: 'Works trains for the platelaying gangs, from the siding at Marthwaite', yard: 'Marthwaite', yardOff: -7, consist: ['adFlat', 'adFlat'], cat: 'Diesel', diesel: true,
     build: () => buildRusty({color: 0x1c1c1e, face: {smile: 0.2, brow: 0.5}})},
  ];
}

// ------------------------------------------------------------------ trains on the line
const smokeTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(240,240,240,0.9)'); r.addColorStop(1, 'rgba(240,240,240,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const puffs = [];
for(let i = 0; i < 60; i++){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: smokeTex, transparent: true, depthWrite: false, opacity: 0}));
  s.visible = false; scene.add(s); puffs.push({s, life: 0});
}
let puffIdx = 0;
function puff(pos){
  const p = puffs[puffIdx++ % puffs.length];
  p.s.position.copy(pos); p.life = 1; p.s.visible = true; p.s.scale.setScalar(1.2 * METRE);
}

function lineU(line, name){
  return realU(line, STATIONS.find(s => s.name === name));
}

const allVehicles = [];
function tagPick(group, info){
  group.traverse(o => { if(o.isMesh){ o.userData.onPick = info; clickable.push(o); } });
}
function engineDesc(E){
  const train = E.consist.map((k, i) => (E.cars && E.cars[i] ? E.cars[i] + ' (' + STOCK[k].label.toLowerCase() + ')' : STOCK[k].label)).join(', ');
  const now = window.SODOR_OPS ? window.SODOR_OPS.statusOf(E.train && E.train.engine && E.train.engine.group) : '';
  return `${E.name}${E.no ? ' (No. ' + E.no + ')' : ''} is a ${E.wheels} engine based on ${E.basis}. Livery: ${E.livery}. Job here: ${E.job}. Train: ${train}.${now ? ' ' + now : ''}`;
}
function showEngine(E){
  openPanel(E.rail === 'ar' ? 'Arlesdale Railway engine' : 'Skarloey Railway engine', E.name, engineDesc(E), `${E.wheels}${E.no ? ' · No. ' + E.no : ''} · ${LINES[E.line].name}`);
  const g = E.train ? E.train.engine.group : E.engine.group, pos = g.position;
  flyTo(pos.x, pos.y, pos.z, 0.05, undefined, 1.12);
  const b = addPanelButton('Follow engine', () => { followTrain = {mesh: g, dist: 0.05}; b.classList.add('active'); });
}

// ------------------------------------------------------------------ train runner
// Every train on Sodor runs on this, on the life-size track and in real units (metres, seconds).
// Vehicles keep their order and facing (tank engines run bunker-first on the way back), trains
// accelerate and brake into stops, passenger trains call at the stations on their stretch, and at
// each terminus the engine runs round its train through a passing loop.
const ACC = 0.35 * METRE, RR_SPEED = 2.2 * METRE, MARGIN = 12 * METRE;
const _p = new THREE.Vector3(), _t = new THREE.Vector3();
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function makeRunner(o){
  const line = o.line, L = line.real.len;
  const sgn = o.uB >= o.uA ? 1 : -1, span = Math.max(20 * METRE, Math.abs(o.uB - o.uA) * L);
  const gap = o.gap;
  const unit = o.unit.map(v => ({v, len: v.len * o.scale}));
  const cars = o.cars.map(v => ({v, len: v.len * o.scale}));
  const U = unit.reduce((s, m, i) => s + m.len + (i ? gap : 0), 0);
  const off = [0];
  for(let k = 1; k < cars.length; k++) off.push(off[k - 1] + (cars[k - 1].len + cars[k].len) / 2 + gap);
  const last = cars.length - 1, len0 = cars[0].len / 2, lenN = cars[last].len / 2;
  const Lc = off[last] + len0 + lenN;
  const R = {o, line, L, sgn, span, gap, unit, cars, U, off, Lc, engine: o.unit[0], v: 0, phase: 'run', timer: 0, lastStop: null, rr: null, puffT: 0};

  R.aB = span - MARGIN - (len0 + gap + U);
  R.aA = MARGIN + off[last] + lenN + gap + U;
  R.runRound = !o.noRunRound && R.aA < R.aB - 30 * METRE;     // railcars and trolleys just reverse
  if(!R.runRound){
    // the engine stays at one end: B normally, A for mountain engines pushing their coach uphill
    if(o.side === 'A') R.aB = span - MARGIN - len0;
    else R.aA = MARGIN + off[last] + lenN;
    if(R.aA > R.aB) R.aA = R.aB = (R.aA + R.aB) / 2;
  }
  R.stops = o.passenger ? stopsFor(R, o.stopsAt || 'all') : [];
  R.vBase = o.vmax;
  R.a = R.aA + Math.random() * (R.aB - R.aA);
  R.dir = Math.random() < 0.5 ? 1 : -1;
  R.side = R.runRound ? (R.dir > 0 ? 'B' : 'A') : (o.side || 'B');

  // Unit (engine + tender) centres for a given anchor and side; the engine always faces B.
  R.unitX = (a, side, un = R.unit) => {
    const nc = R.cars.length - 1, Bend = a + R.cars[0].len / 2, Aend = a - R.off[nc] - R.cars[nc].len / 2, xs = [], UU = un.reduce((s, m, i) => s + m.len + (i ? gap : 0), 0);
    if(side === 'B'){ let x = Bend + gap + UU; un.forEach(m => { xs.push(x - m.len / 2); x -= m.len + gap; }); }
    else { let x = Aend - gap; un.forEach(m => { xs.push(x - m.len / 2); x -= m.len + gap; }); }
    return xs;
  };
  // Passing loop at each terminus: zero offset exactly where the engine leaves and rejoins.
  if(R.runRound) R.loops = [R.aB, R.aA].map(a => {
    const xB = R.unitX(a, 'B')[0], xA = R.unitX(a, 'A')[0];
    const lo = Math.min(xA, xB), hi = Math.max(xA, xB);
    return {lo, hi, k: Math.min(15 * METRE, (hi - lo) / 4)};
  });
  return R;
}
// Where the train stands at each station it calls at: 'all', 'none', or a list of station names.
function stopsFor(R, which){
  const out = [], line = R.line, o = R.o, len0 = R.cars[0].len / 2;
  if(which === 'none' || !(R.aB > R.aA)) return out;
  line.stops.forEach(k => {
    const st = STATIONS[k];
    if(Array.isArray(which) && !which.includes(st.name)) return;     // expresses only call at the big stations
    const u = lineU(line, st.name), x = (u - o.uA) * R.sgn * R.L;
    const a = x - len0 + R.Lc / 2;
    if(a > R.aA + 20 * METRE && a < R.aB - 20 * METRE) out.push(a);
  });
  return out;
}
function loopLat(R, loop, x){
  if(!loop || x <= loop.lo || x >= loop.hi) return 0;
  return R.o.loopW * smooth(loop.lo, loop.lo + loop.k, x) * (1 - smooth(loop.hi - loop.k, loop.hi, x));
}
function trackFrame(R, x){
  const uRaw = R.o.uA + R.sgn * x / R.L, u = Math.max(0, Math.min(1, uRaw));
  realAt(R.line, u, _p); realDir(R.line, u, _t);
  if(uRaw !== u){                                   // past the end of the line (engine sheds there): carry straight on
    const over = (uRaw - u) * R.L;
    _p.x += _t.x * over; _p.z += _t.z * over;
  }
  if(R.sgn < 0) _t.negate();
  return u;
}
function placeVeh(R, veh, x, lat){
  const u = trackFrame(R, x);
  const g = veh.group;
  g.rotation.order = 'YXZ';
  g.rotation.set(-Math.asin(Math.max(-0.35, Math.min(0.35, _t.y))), Math.atan2(_t.x, _t.z), 0);
  const nx = _t.z, nz = -_t.x, nl = Math.hypot(nx, nz) || 1;
  const L = lat + (R.o.lane || 0) + (R.o.latFn ? R.o.latFn(x) : 0);       // lane: which road of a double-track line; latFn: a station's own roads (Knapford)
  g.position.set(_p.x + nx / nl * L, _p.y, _p.z + nz / nl * L);
  g.visible = R.line.userVisible && (Math.abs(lat) > Math.abs(R.o.loopW) * 0.5 || !inTunnel(R.line, u));
}
function spin(veh, dx, scale){
  if(!veh.axles || !veh.axles.length || dx === 0) return;
  veh.axles.forEach(a => { a.g.rotation.x += dx / (a.r * scale); });
  if(veh.rods && veh.rods.length){
    const ang = veh.axles.find(a => a.coupled).g.rotation.x;
    veh.rods.forEach(r => { r.mesh.position.y = r.r + r.rc * Math.cos(ang + r.phase); r.mesh.position.z = r.mid + r.rc * Math.sin(ang + r.phase); });
  }
}
// a sleepers-and-rails ribbon through world points (sidings and the Arlesdale passing loops)
function ribbon(line, pts, bedM){
  const half = bedM * METRE / 2, vp = [], vu = [], vn = [], ix = [];
  let along = 0;
  pts.forEach((q, i) => {
    const r = pts[Math.min(i + 1, pts.length - 1)], l = pts[Math.max(i - 1, 0)];
    let tx = r.x - l.x, tz = r.z - l.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = tz, nz = -tx;
    if(i) along += Math.hypot(q.x - pts[i - 1].x, q.z - pts[i - 1].z);
    const b = vp.length / 3;
    vp.push(q.x + nx * half, q.y, q.z + nz * half, q.x - nx * half, q.y, q.z - nz * half);
    vu.push(0, along / (0.9 * METRE), 1, along / (0.9 * METRE)); vn.push(0, 1, 0, 0, 1, 0);
    if(i) ix.push(b - 2, b - 1, b, b - 1, b + 1, b);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(vu, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(vn, 3));
  g.setIndex(ix);
  const m = new THREE.Mesh(g, line.realMesh.material); m.receiveShadow = true;
  loopGroup.add(m);
}
// The passing loops are drawn as sleepers-and-rails strips like the main track.
const loopGroup = new THREE.Group(); scene.add(loopGroup);
function drawLoops(R){
  if(!R.runRound) return;
  const half = (R.o.bedM || 2.3) * METRE / 2;
  R.loops.forEach(loop => {
    const vp = [], vu = [], vn = [], ix = [];
    let along = 0, prev = null;
    for(let x = loop.lo; x <= loop.hi + 1e-9; x += 3 * METRE){
      trackFrame(R, x);
      const lat = loopLat(R, loop, x) + (R.o.lane || 0) + (R.o.latFn ? R.o.latFn(x) : 0), nl = Math.hypot(_t.z, _t.x) || 1, nx = _t.z / nl, nz = -_t.x / nl;
      const cx = _p.x + nx * lat, cz = _p.z + nz * lat, y = Math.max(_p.y, heightAt(cx, cz) + 0.5 * METRE);
      if(prev) along += Math.hypot(cx - prev[0], cz - prev[1]);
      const b = vp.length / 3;
      vp.push(cx + nx * half, y, cz + nz * half, cx - nx * half, y, cz - nz * half);
      vu.push(0, along / (0.9 * METRE), 1, along / (0.9 * METRE)); vn.push(0, 1, 0, 0, 1, 0);
      if(prev) ix.push(b - 2, b - 1, b, b - 1, b + 1, b);
      prev = [cx, cz];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(vu, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(vn, 3));
    g.setIndex(ix);
    const m = new THREE.Mesh(g, R.line.realMesh.material); m.receiveShadow = true;
    loopGroup.add(m);
  });
}

// Put a different rake of coaches or trucks on a train (ops.js shunts them in and out of the sidings).
// The train's turning points stay where they are, so a rake is never longer than the train's first.
function setCars(R, vehicles){
  R.cars = vehicles.map(v => ({v, len: v.len * R.o.scale}));
  R.off = [0];
  for(let k = 1; k < R.cars.length; k++) R.off.push(R.off[k - 1] + (R.cars[k - 1].len + R.cars[k].len) / 2 + R.gap);
  const nc = R.cars.length - 1;
  R.Lc = R.off[nc] + R.cars[0].len / 2 + R.cars[nc].len / 2;
  if(R.runRound) R.loops = [R.aB, R.aA].map(a => {
    const xB = R.unitX(a, 'B')[0], xA = R.unitX(a, 'A')[0], lo = Math.min(xA, xB), hi = Math.max(xA, xB);
    return {lo, hi, k: Math.min(15 * METRE, (hi - lo) / 4)};
  });
}
// Swap the engine (and tender) working a train: used by the duty rosters in ops.js.
function swapUnit(R, vehicles){
  R.unit = vehicles.map(v => ({v, len: v.len * R.o.scale}));
  R.U = R.unit.reduce((s, m, i) => s + m.len + (i ? R.gap : 0), 0);
  R.engine = vehicles[0];
  if(R.runRound) R.loops = [R.aB, R.aA].map(a => {
    const xB = R.unitX(a, 'B')[0], xA = R.unitX(a, 'A')[0], lo = Math.min(xA, xB), hi = Math.max(xA, xB);
    return {lo, hi, k: Math.min(15 * METRE, (hi - lo) / 4)};
  });
}
function stepRunner(R, dt){
  let carDx = 0, unitDx = 0, moving = false;
  if(R.manual) return;                              // being shunted by ops.js, which places every vehicle itself
  if(R.hold){                                       // stabled for the night: the train stands, the engine may be away
    R.cars.forEach((c, k) => placeVeh(R, c.v, R.a - R.off[k], 0));
    if(R.attached !== false){ const xs = R.unitX(R.a, R.side); R.unit.forEach((m, i) => placeVeh(R, m.v, xs[i], 0)); }
    return;
  }
  if(R.phase === 'run'){
    const term = R.dir > 0 ? R.aB : R.aA;
    let target = term;
    R.stops.forEach(s => { if((s - R.a) * R.dir > METRE && s !== R.lastStop && Math.abs(s - R.a) < Math.abs(target - R.a)) target = s; });
    const d = Math.abs(target - R.a);
    const vdes = Math.min(R.o.vmax, Math.sqrt(2 * ACC * d));
    R.v = R.v < vdes ? Math.min(vdes, R.v + ACC * dt) : Math.max(vdes, R.v - 2 * ACC * dt);
    let step = R.v * dt;
    if(step >= d || d < 0.05 * METRE){
      step = d; R.a = target; R.v = 0;
      if(target === term){ R.lastStop = null; R.phase = 'dwell'; R.timer = 90; R.next = R.runRound ? 'rr' : 'turn'; }
      else { R.lastStop = target; R.phase = 'dwell'; R.timer = R.stopDwell || 35; R.next = 'run'; }
      if(R.blockSys) R.blockSys.arrive(R, target, target === term);
    } else R.a += R.dir * step;
    carDx = unitDx = R.dir * step; moving = step > 0;
  } else if(R.phase === 'dwell'){
    R.timer -= dt;
    // two trains on one stretch cross at the passing loop: wait there until the road ahead is clear
    if(R.timer <= 0 && R.blockSys && R.next === 'run' && !R.blockSys.depart(R)) R.timer = 4;
    if(R.timer <= 0){
      if(R.next === 'rr'){
        const to = R.side === 'B' ? 'A' : 'B';
        const x0 = R.unitX(R.a, R.side)[0], x1 = R.unitX(R.a, to)[0];
        R.rr = {x0, x1, to, p: 0, dur: Math.abs(x1 - x0) / RR_SPEED + 8, loop: R.loops[R.side === 'B' ? 0 : 1], last: x0};
        R.phase = 'rr';
      } else if(R.next === 'turn'){ R.dir = -R.dir; R.phase = 'run'; }
      else R.phase = 'run';
    }
  } else if(R.phase === 'rr'){
    const rr = R.rr;
    rr.p = Math.min(1, rr.p + dt / rr.dur);
    const x = rr.x0 + (rr.x1 - rr.x0) * smooth(0, 1, rr.p);
    unitDx = x - rr.last; rr.last = x; moving = Math.abs(unitDx) > 1e-9;
    if(rr.p >= 1){ R.side = rr.to; R.dir = -R.dir; R.rr = null; R.phase = 'dwell'; R.timer = 25; R.next = 'run'; }
  }

  R.cars.forEach((c, k) => { placeVeh(R, c.v, R.a - R.off[k], 0); spin(c.v, carDx, R.o.scale); });
  if(R.phase === 'rr' && R.rr){
    const xe = R.rr.last, xs = [xe];
    for(let i = 1; i < R.unit.length; i++) xs.push(xs[i - 1] - (R.unit[i - 1].len + R.unit[i].len) / 2 - R.gap);
    R.unit.forEach((m, i) => { placeVeh(R, m.v, xs[i], loopLat(R, R.rr.loop, xs[i])); spin(m.v, unitDx, R.o.scale); });
  } else {
    const xs = R.unitX(R.a, R.side);
    R.unit.forEach((m, i) => { placeVeh(R, m.v, xs[i], 0); spin(m.v, unitDx, R.o.scale); });
  }

  if(moving && !R.o.diesel && R.engine.chimneyAt && R.engine.group.visible && camDist < 3){
    R.puffT -= dt * (0.6 + R.v / (4 * METRE));
    if(R.puffT <= 0){
      R.puffT = 1.2;
      [R.engine.chimneyAt, R.engine.chimneyAt2].forEach(c => { if(c){ _p.copy(c); R.engine.group.localToWorld(_p); puff(_p); } });
    }
  }
}

// Markers: a fixed-size dot over each train so it can be found (and tapped) from far away,
// where a life-size engine is far smaller than a pixel.
function markerMat(color){
  const tex = canvasTex(64, 64, (g) => {
    g.fillStyle = 'rgba(10,20,28,0.85)'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.beginPath(); g.arc(32, 32, 22, 0, 7); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 23, 0, 7); g.stroke();
  });
  return new THREE.SpriteMaterial({map: tex, depthTest: false, sizeAttenuation: false, transparent: true});
}
function addMarker(R, color, onPick, trainRef){
  const s = new THREE.Sprite(markerMat(color));
  s.scale.setScalar(0.028); s.renderOrder = 12;
  if(onPick) s.userData.onPick = onPick;
  if(trainRef) s.userData.train = trainRef;
  scene.add(s); clickable.push(s);
  R.marker = s;
}

const ENGINE_COLORS = {skarloey: 0x9b1730, rheneas: 0xd23a26, sirhandel: 0x1f4fbf, petersam: 0x2e8b6e, rusty: 0xff6a13, duncan: 0xe2a91f,
  freddie: 0xc4c8cc, duke: 0x9a5426, bertram: 0x4f2f1c, mightymac: 0x2b2f86, luke: 0x6aa84f,
  rex: 0x2e7d3c, bert: 0x2a5fb0, mike: 0xb3262a, jock: 0xc9cf3a, frank: 0xb8bcc0, sigrid: 0x2a5a9a, blister1: 0x3a3a3e, blister2: 0x5a5a5e};
const RUNNERS = [], SR_TRAINS = [];
ENGINES.forEach(E => {
  const line = LINES[E.line];
  if(!line) return;
  const eng = E.build();
  const unit = [eng];
  if(E.tender) unit.push(buildTender(E.tender));
  const mini = line.kind === 'miniature', SC = mini ? MINI : NG;
  const cars = E.consist.map(k => buildStock(k));
  [...unit, ...cars].forEach(v => { v.group.scale.setScalar(SC); scene.add(v.group); allVehicles.push(v); });
  if(E.yard){                         // shunts a siding (laid out below, worked by ops.js)
    E.unit = unit; E.engine = eng; E.cars = cars; tagPick(eng.group, () => showEngine(E));
    return;
  }
  const uA = E.from ? lineU(line, E.from) : (E.fromU || 0), uB = E.to ? lineU(line, E.to) : (E.toU === undefined ? 1 : E.toU);
  const R = makeRunner({line, uA, uB, unit, cars, scale: SC, gap: (mini ? 0.3 : 0.5) * METRE, vmax: 6.5 * METRE * E.speed,
    passenger: !!E.passenger, loopW: (mini ? -2.4 : 3.4) * METRE, bedM: mini ? 1.3 : 2.3, diesel: !!E.diesel, shedEnd: E.shedEnd, shedSide: mini ? 1 : 0});
  R.E = E; R.engine = eng;
  E.train = R;
  drawLoops(R);
  addMarker(R, ENGINE_COLORS[E.id], () => showEngine(E));
  RUNNERS.push(R); SR_TRAINS.push(R);
  tagPick(eng.group, () => showEngine(E));
  if(E.tender) tagPick(unit[1].group, () => showEngine(E));
  cars.forEach((v, i) => tagPick(v.group, () => {
    openPanel('Rolling stock', (E.cars && E.cars[i]) || v.label, `${v.label} in ${E.name}'s train on the ${line.name}.`, line.name);
  }));
});

// ---- Arlesdale Railway: single line worked in sections between passing loops (after the wiki: a loop
// at Ffarquhar Road with a warning disc before it, one in the woods on the approach to Arlesdale Green,
// and one at Marthwaite in the middle of the valley). A train may only leave a loop or terminus when the
// section ahead is empty and there is room for it at the far end: in each loop the up train keeps the
// main road and the down train takes the loop road; each terminus has three roads (Arlesdale's three
// roads to the turntable; Arlesburgh West's platforms and yard).
const BLOCK = (() => {
  const trains = ENGINES.filter(E => E.block && E.train).map(E => E.train);
  if(!trains.length) return null;
  const line = trains[0].line, L = line.real.len, R0 = trains[0], u0 = R0.o.uA, CAP = 3, RS = -4.8 * METRE, WL = -2.4 * METRE, K = 15 * METRE;
  const xOf = u => (u - u0) * R0.sgn * L;
  const loopsX = [xOf(lineU(line, 'Ffarquhar Road')), xOf(lineU(line, 'Marthwaite')), xOf(lineU(line, 'Arlesdale Green')) - 260 * METRE];
  const N = loopsX.length + 2;                    // node 0: Arlesburgh West; N-1: Arlesdale
  const half = Math.max(...trains.map(R => R.Lc / 2 + R.U)) + 6 * METRE;
  const bump = (x, c) => smooth(c - half - K, c - half, x) * (1 - smooth(c + half, c + half + K, x));
  const zW = Math.max(...trains.map(R => R.aA + R.U + R.cars[0].len)) + 10 * METRE;
  const zA = Math.min(...trains.map(R => R.aB - R.Lc - R.U)) - 10 * METRE;
  const fadeW = x => 1 - smooth(zW, zW + 30 * METRE, x), fadeA = x => smooth(zA - 30 * METRE, zA, x);
  trains.forEach((R, i) => {
    R.block = {nodeA: loopsX.map(x => x - R.cars[0].len / 2 + R.Lc / 2)};
    R.block.nodeA.forEach(a => { if(!R.stops.some(s => Math.abs(s - a) < 0.5 * METRE)) R.stops.push(a); });
    R.roads = {};
    R.o.latFn = x => {
      let l = 0;
      if(R.roads[0]) l += R.roads[0] * RS * fadeW(x);
      if(R.roads[N - 1]) l += R.roads[N - 1] * RS * fadeA(x);
      if(R.dir < 0) loopsX.forEach(c => { l += WL * bump(x, c); });
      return l;
    };
    // start the day standing at a terminus, as if just arrived: those shedded at Arlesburgh West there
    const atA = R.o.shedEnd !== 'B', node = atA ? 0 : N - 1;
    R.roads[node] = trains.filter(T => T !== R && T.at === node).length;
    R.at = node; R.res = null;
    R.a = atA ? R.aA : R.aB; R.dir = atA ? -1 : 1; R.side = atA ? 'A' : 'B';
    R.phase = 'dwell'; R.next = 'rr'; R.timer = 30 + i * 240;
  });
  const others = R => trains.filter(T => T !== R);
  function depart(R){
    if(R.at === null || R.at === undefined) return true;          // a station call inside a section
    const n2 = R.at + R.dir;
    if(n2 < 0 || n2 >= N) return true;
    const sec = Math.min(R.at, n2), O = others(R);
    if(O.some(T => T.res && T.res.sec === sec)) return false;
    const bound = T => T.at === n2 || (T.res && T.res.node === n2);
    if(n2 === 0 || n2 === N - 1){
      const there = O.filter(bound);
      if(there.length >= CAP) return false;
      const used = new Set(there.map(T => T.roads[n2] || 0));
      let k = 0; while(used.has(k)) k++;
      R.roads[n2] = k;
    } else if(O.some(T => bound(T) && T.dir === R.dir)) return false;
    R.res = {sec, node: n2}; R.at = null;
    return true;
  }
  function arrive(R, a, term){
    if(term){ R.at = R.dir > 0 ? N - 1 : 0; R.res = null; return; }
    const l = R.block.nodeA.findIndex(x => Math.abs(x - a) < 0.5 * METRE);
    if(l >= 0){ R.at = l + 1; R.res = null; }
  }
  // the extra rails: loop roads, and the second and third roads at each terminus with their run-round loops
  const Rl = trains.reduce((b, R) => R.Lc + R.U > b.Lc + b.U ? R : b);
  const lay = (x0, x1, latF) => { const pts = []; for(let x = x0; x <= x1 + 1e-9; x += 3 * METRE){ trackFrame(Rl, x); const nl = Math.hypot(_t.z, _t.x) || 1, lt = latF(x);
    const cx = _p.x + _t.z / nl * lt, cz = _p.z - _t.x / nl * lt; pts.push({x: cx, y: Math.max(_p.y, heightAt(cx, cz) + 0.5 * METRE), z: cz}); } if(pts.length > 1) ribbon(line, pts, 1.3); };
  const saved = Rl.o.latFn; Rl.o.latFn = null;
  loopsX.forEach(c => lay(c - half - K, c + half + K, x => WL * bump(x, c)));
  for(let k = 1; k < CAP; k++){
    lay(2 * METRE, zW + 30 * METRE, x => k * RS * fadeW(x));
    lay(zA - 30 * METRE, Rl.span - 2 * METRE, x => k * RS * fadeA(x));
    const [lB, lA] = Rl.loops;
    lay(lA.lo, lA.hi, x => k * RS + loopLat(Rl, lA, x));
    lay(lB.lo, lB.hi, x => k * RS + loopLat(Rl, lB, x));
  }
  Rl.o.latFn = saved;
  // the warning disc before the Ffarquhar Road loop, for features.js
  return {trains, depart, arrive, loopsX, nodes: N, line, frame: (x, lat, out) => { trackFrame(Rl, x); const nl = Math.hypot(_t.z, _t.x) || 1; return out.set(_p.x + _t.z / nl * lat, _p.y, _p.z - _t.x / nl * lat); }};
})();
if(BLOCK) BLOCK.trains.forEach(R => R.blockSys = BLOCK);

// Rex (Arlesdale Railway, built in the main script) runs on the same model.
// The North Western Railway's fleet is in nwr.js, the Culdee Fell Railway's in cfr.js.
const NWR_RUNS = {Rex: {passenger: true}};
TRAINS.forEach(tr => {
  const run = NWR_RUNS[tr.name] || {};
  if(run.line && LINES[run.line]) tr.line = run.line;
  const line = LINES[tr.line];
  if(run.cars !== undefined){ tr.cars.slice(run.cars).forEach(c => c.parent && c.parent.remove(c)); tr.cars = tr.cars.slice(0, run.cars); }
  const uA = run.from ? lineU(line, run.from) : (run.fromU || 0), uB = run.to ? lineU(line, run.to) : (run.toU === undefined ? 1 : run.toU);
  const kind = line.kind;
  const speedMS = run.vmax || (tr.line === 'main' ? 24 : kind === 'standard' ? 13 : kind === 'rack' ? 4 : 6);
  const scale = kind === 'standard' ? STD : NG;
  [tr.mesh, ...tr.cars].forEach(g => g.scale.setScalar(scale));
  const R = makeRunner({line, uA, uB, unit: [{group: tr.mesh, len: 2.5}], cars: tr.cars.map(c => ({group: c, len: 2.4})),
    scale, gap: 0.8 * METRE, vmax: speedMS * METRE, passenger: !!run.passenger,
    loopW: (kind === 'standard' ? 4.6 : 3.4) * METRE, bedM: kind === 'standard' ? 3.6 : 2.3, diesel: true});
  R.nwr = tr;
  drawLoops(R);
  addMarker(R, tr.color, null, tr);
  RUNNERS.push(R);
});

frameHooks.push(dt => {
  // long frames (time-lapse) are cut into short steps, with the timetable (ops.js) checked before each,
  // so a train never skips through a stop or misses the end of its turn
  const d = dt * timeScale, n = Math.max(1, Math.ceil(d / 20)), ops = window.SODOR_OPS;
  for(let k = 0; k < n; k++){ if(ops) ops.step(d / n); RUNNERS.forEach(R => stepRunner(R, d / n)); }
  RUNNERS.forEach(R => {
    const m = R.marker, eg = R.engine.group;
    m.position.copy(eg.position);
    m.visible = !R.hideMarker && R.line.userVisible && camera.position.distanceTo(eg.position) > 0.35;
  });
  loopGroup.visible = camDist < 9;
  puffs.forEach(p => {
    if(p.life <= 0) return;
    p.life -= dt * 0.35;
    p.s.position.y += dt * 1.4 * METRE;
    p.s.scale.setScalar((1.2 + (1 - p.life) * 4.5) * METRE);
    p.s.material.opacity = Math.max(0, p.life) * 0.55;
    if(p.life <= 0) p.s.visible = false;
  });
});

// ------------------------------------------------------------------ parked stock in yards
function stationFrame(lineId, name, lat){
  const line = LINES[lineId], st = STATIONS.find(s => s.name === name);
  const u = realU(line, st), p = realAt(line, u, new THREE.Vector3());
  const t = realDir(line, u, new THREE.Vector3()).setY(0).normalize(), n = new THREE.Vector3(t.z, 0, -t.x);
  return {o: p.setY(0).addScaledVector(n, lat), t, n};
}
const ground = (x, z) => Math.max(heightAt(x, z), 0);
// A straight strip of sleepers and rails between two points, laid on the ground.
const sidingGroup = new THREE.Group(); scene.add(sidingGroup);
function siding(a, b, n){
  const half = 1.15 * METRE, len = a.distanceTo(b), steps = Math.max(2, Math.ceil(len / (3 * METRE)));
  const vp = [], vu = [], vn = [], ix = [];
  for(let i = 0; i <= steps; i++){
    const p = a.clone().lerp(b, i / steps), y = ground(p.x, p.z) + 0.5 * METRE, v = i * len / steps / (0.9 * METRE);
    vp.push(p.x + n.x * half, y, p.z + n.z * half, p.x - n.x * half, y, p.z - n.z * half);
    vu.push(0, v, 1, v); vn.push(0, 1, 0, 0, 1, 0);
    if(i) ix.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(vu, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(vn, 3));
  g.setIndex(ix);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({map: trackTexture('narrow'), roughness: 0.9, side: THREE.DoubleSide}));
  m.receiveShadow = true; sidingGroup.add(m);
}
function yard(lineId, name, latM, keys, labelWhere){
  const f = stationFrame(lineId, name, latM * METRE);
  let along = -25 * METRE;
  const row = [];
  keys.forEach(k => {
    const v = buildStock(k);
    along += v.len * NG / 2;
    const pos = f.o.clone().addScaledVector(f.t, along);
    const hf = ground(pos.x + f.t.x * 2 * METRE, pos.z + f.t.z * 2 * METRE), hb = ground(pos.x - f.t.x * 2 * METRE, pos.z - f.t.z * 2 * METRE);
    v.group.position.set(pos.x, ground(pos.x, pos.z) + 0.5 * METRE, pos.z);
    v.group.rotation.order = 'YXZ';
    v.group.rotation.set(-Math.atan2(hf - hb, 4 * METRE), Math.atan2(f.t.x, f.t.z), 0);
    v.group.scale.setScalar(NG);
    scene.add(v.group); row.push(v);
    tagPick(v.group, () => openPanel('Rolling stock', v.label, `${v.label}, stabled at ${labelWhere}.`, 'Skarloey Railway'));
    along += v.len * NG / 2 + 0.5 * METRE;
  });
  siding(f.o.clone().addScaledVector(f.t, -30 * METRE), f.o.clone().addScaledVector(f.t, along + 6 * METRE), f.n);
  return {f, row};
}
const bmqYard = yard('skarloey', 'Blue Mountain Quarry', 7, ['fusit', 'fusit', 'slab', 'slab', 'waste', 'waste', 'openEnd', 'openEnd'], 'Blue Mountain Quarry');
yard('wharf', 'The Wharf', -6, ['flatShort', 'flatShort', 'coral', 'coral', 'well', 'bogieFlat', 'carCyrn', 'gwrMatch', 'gwrMatch'], 'the Wharf');
yard('skarloey', "Crovan's Gate", -6.5, ['bdCrane', 'bdVan', 'gvtCoach', 'gvtCoach', 'art', 'art'], "Crovan's Gate works");

// ------------------------------------------------------------------ Owen, Merrick, Colin and Madge
const statics = [];
function groundY(x, z){ return Math.max(heightAt(x, z), 0); }
function showStatic(c){
  openPanel(c.kind, c.name, c.desc, 'Skarloey Railway');
  flyTo(c.group.position.x, c.group.position.y, c.group.position.z, c.dist || 0.08, undefined, 1.08);
}

// Owen: the incline at Blue Mountain Quarry, a drum house with a vertical boiler.
(function(){
  const st = STATIONS.find(s => s.name === 'Blue Mountain Quarry');
  let best = null;
  const R0 = 60 * METRE;
  for(let k = 0; k < 16; k++){ const a = k / 16 * Math.PI * 2, x = st.x + Math.cos(a) * R0, z = st.z + Math.sin(a) * R0, h = heightAt(x, z); if(!best || h > best.h) best = {a, h}; }
  const dir = new THREE.Vector3(Math.cos(best.a), 0, Math.sin(best.a));
  const base = new THREE.Vector3(st.x, 0, st.z).addScaledVector(dir, 18 * METRE), topP = new THREE.Vector3(st.x, 0, st.z).addScaledVector(dir, 140 * METRE);
  base.y = groundY(base.x, base.z) + 0.3 * METRE; topP.y = groundY(topP.x, topP.z) + 0.3 * METRE;
  const g = new THREE.Group(); scene.add(g);
  const mid = base.clone().lerp(topP, 0.5), len = base.distanceTo(topP) / NG;   // model units
  const incl = new THREE.Group(); incl.position.copy(mid); incl.lookAt(topP); incl.scale.setScalar(NG); g.add(incl);
  const rails = new THREE.Group(); incl.add(rails);
  for(const s of [-1, 1]) box(rails, 0.04, 0.04, len, mat(0x3a3028), s * 0.22, 0.04, 0);
  for(let i = 0; i < len / 0.35; i++) box(rails, 0.62, 0.035, 0.1, mat(0x5a4632, 0.9), 0, 0, -len / 2 + i * 0.35);
  bake(rails, false);
  const ORANGE = mat(0xe8731e, 0.5), GREY = mat(0x7b7f84, 0.6), YEL = mat(0xf2c419, 0.45);
  const house = new THREE.Group(); house.position.copy(topP); house.rotation.y = Math.atan2(dir.x, dir.z); house.scale.setScalar(NG * 1.8); g.add(house);
  box(house, 2.0, 1.4, 1.4, GREY, 0, 0.7, 0.5);
  box(house, 2.1, 0.12, 1.5, ORANGE, 0, 1.45, 0.5);
  for(const s of [-1, 1]) box(house, 0.02, 0.08, 1.3, YEL, s * 1.0, 1.1, 0.5);
  const drum = new THREE.Group(); drum.position.set(0, 1.98, 0.5); house.add(drum);
  cylX(drum, 0.45, 0.45, 1.2, ORANGE, 0, 0, 0, 22);
  for(let k = 0; k < 4; k++){ const sp = box(drum, 1.24, 0.06, 0.82, YEL, 0, 0, 0); sp.rotation.x = k * Math.PI / 4; }
  cylY(house, 0.28, 0.28, 1.1, ORANGE, 1.25, 0.55, 0.2, 18);
  cylY(house, 0.07, 0.07, 0.6, mat(BLACK), 1.25, 1.4, 0.2, 10);
  domeCap(house, 0.28, GREY, 1.25, 1.1, 0.2);
  faceDisc(house, 0.32, {smile: 0.9, brow: -0.2}, 0, 0.75, -0.205, true);
  sidePlates(house, plateMat('OWEN', '#c9a23a', '#1a1a1a', '#8a6a1a'), 0.5, 0.14, 1.003, 1.2, 0.5);
  const platforms = [0, 1].map(k => { const p = new THREE.Group(); incl.add(p); box(p, 0.5, 0.06, 0.6, GREY, 0, 0.08, 0); box(p, 0.44, 0.2, 0.5, mat(0x3c4552, 0.6), 0, 0.2, 0); return p; });
  const c = {name: 'Owen', kind: 'Incline engine', group: house, dist: 0.3,
    desc: 'Owen runs the incline at Blue Mountain Quarry, winding slate trucks up and down the slope on two platforms — empties go up as loaded trucks come down. He is based on the Dinorwic Slate Quarry incline with a vertical boiler beside the drum house, painted orange and grey with yellow stripes.'};
  statics.push(c);
  tagPick(g, () => showStatic(c));
  let ph = 0;
  frameHooks.push(dt => {
    ph += dt * timeScale * 0.03;
    const s = (Math.sin(ph) + 1) / 2;
    platforms[0].position.z = -len / 2 + 1 + s * (len - 2);
    platforms[1].position.z = -len / 2 + 1 + (1 - s) * (len - 2);
    drum.rotation.x = s * 12;
  });
})();

// Merrick: the crimson travelling gantry crane over the quarry sidings.
(function(){
  const f = bmqYard.f, centre = f.o.clone().addScaledVector(f.t, 10 * METRE);
  const g = new THREE.Group(); g.position.set(centre.x, groundY(centre.x, centre.z), centre.z); g.rotation.y = Math.atan2(f.t.x, f.t.z); g.scale.setScalar(NG); scene.add(g);
  const CR = mat(0xa0142c, 0.45), OR = mat(0xb4652d, 0.5), YEL = mat(0xf2c419, 0.45);
  for(const s of [-1, 1]){
    box(g, 0.3, 0.2, 1.4, OR, s * 1.3, 0.2, 0);
    for(const e of [1, -1]){ cylX(g, 0.12, 0.12, 0.1, mat(BLACK), s * 1.3, 0.12, e * 0.5, 12); const leg = box(g, 0.16, 2.4, 0.16, CR, s * 1.3, 1.4, e * 0.45); leg.rotation.x = -e * 0.1; }
  }
  box(g, 2.9, 0.26, 0.5, CR, 0, 2.62, 0);
  for(const s of [-1, 1]) box(g, 2.9, 0.04, 0.03, YEL, 0, 2.62, s * 0.26);
  const trolley = new THREE.Group(); trolley.position.y = 2.3; g.add(trolley);
  box(trolley, 0.5, 0.42, 0.44, CR, 0, 0, 0);
  faceDisc(trolley, 0.17, {smile: 0.1, brow: 0.4}, 0, 0, 0.225);
  const hook = new THREE.Group(); trolley.add(hook);
  cylY(hook, 0.012, 0.012, 1.0, mat(0x222222), 0, -0.7, 0, 4);
  box(hook, 0.14, 0.12, 0.1, YEL, 0, -1.24, 0);
  sidePlates(g, plateMat('MERRICK', '#c9a23a', '#1a1a1a', '#8a6a1a'), 0.5, 0.12, 1.46, 0.3, 0);
  const c = {name: 'Merrick', kind: 'Gantry crane', group: g, dist: 0.07,
    desc: 'Merrick is the travelling gantry crane at Blue Mountain Quarry, lifting heavy loads of slate on and off the trucks. He is painted crimson with orange-brown and yellow details.'};
  statics.push(c); tagPick(g, () => showStatic(c));
  let ph = 0;
  frameHooks.push(dt => { ph += dt * timeScale * 0.08; trolley.position.x = Math.sin(ph) * 0.9; hook.position.y = (Math.cos(ph * 1.7) - 1) * 0.15; });
})();

// Colin: the green steam crane on the quayside at the Wharf.
(function(){
  const st = STATIONS.find(s => s.name === 'The Wharf');
  let low = null;
  for(let k = 0; k < 16; k++){ const a = k / 16 * Math.PI * 2, x = st.x + Math.cos(a) * 30 * METRE, z = st.z + Math.sin(a) * 30 * METRE, h = heightAt(x, z); if(!low || h < low.h) low = {a, h, x, z}; }
  const px = st.x + Math.cos(low.a) * 12 * METRE, pz = st.z + Math.sin(low.a) * 12 * METRE;
  const g = new THREE.Group(); g.position.set(px, groundY(px, pz), pz); g.scale.setScalar(NG * 1.2); scene.add(g);
  const GR = mat(0x2f7a3a, 0.5), GREY = mat(0x7b7f84, 0.6), RED = mat(0xb3201c, 0.45);
  cylY(g, 0.55, 0.65, 0.5, GREY, 0, 0.25, 0, 18);
  const top = new THREE.Group(); top.position.y = 0.55; g.add(top);
  box(top, 0.9, 0.85, 0.9, GR, 0, 0.45, 0);
  box(top, 1.0, 0.08, 1.0, GREY, 0, 0.92, 0);
  box(top, 0.92, 0.12, 0.02, GREY, 0, 0.8, 0.46);
  faceDisc(top, 0.24, {smile: 0.8, brow: -0.3}, 0, 0.45, 0.452);
  cylX(top, 0.16, 0.16, 0.1, RED, 0.48, 0.55, -0.1, 14);
  cylX(top, 0.1, 0.1, 0.1, RED, -0.48, 0.3, -0.2, 12);
  const jib = new THREE.Group(); jib.position.set(0, 0.3, 0.45); jib.rotation.x = -0.75; top.add(jib);
  for(const s of [-1, 1]) box(jib, 0.06, 0.06, 2.6, GREY, s * 0.18, 0, 1.3);
  for(let i = 0; i < 8; i++){ const b = box(jib, 0.36, 0.03, 0.03, GREY, 0, 0, 0.15 + i * 0.32); b.rotation.y = (i % 2 ? 0.5 : -0.5); }
  cylX(jib, 0.1, 0.1, 0.12, RED, 0, 0, 2.6, 12);
  const hook = new THREE.Group(); top.add(hook);
  const tip = new THREE.Vector3(0, 0.3 + Math.cos(0.75) * 2.6 * 0 + 2.6 * Math.sin(0.75), 0.45 + 2.6 * Math.cos(0.75));
  cylY(hook, 0.012, 0.012, 1.4, mat(0x222222), 0, tip.y - 0.7, tip.z, 4);
  box(hook, 0.3, 0.22, 0.3, mat(0x8a6a44, 0.8), 0, tip.y - 1.5, tip.z);
  sidePlates(top, plateMat('COLIN', '#2f7a3a', '#f2e6c8', '#d4af37'), 0.42, 0.12, 0.452, 0.2, 0);
  top.rotation.y = Math.atan2(Math.cos(low.a), Math.sin(low.a));
  const c = {name: 'Colin', kind: 'Wharf crane', group: g, dist: 0.07,
    desc: 'Colin is the steam crane at the Wharf, loading slate and goods between the narrow-gauge trains and the boats. He is painted green with red pulleys and cogwheels and a grey roof.'};
  statics.push(c); tagPick(g, () => showStatic(c));
  const baseYaw = top.rotation.y; let ph = 0;
  frameHooks.push(dt => { ph += dt * timeScale * 0.05; top.rotation.y = baseYaw + Math.sin(ph) * 1.1; });
})();

// Madge: the Scammell Scarab lorry who carries loads where the rails don't reach.
(function(){
  const f = bmqYard.f;
  const g = new THREE.Group(); scene.add(g);
  const tractor = new THREE.Group(); g.add(tractor);
  const GR = mat(0x2f6b3a, 0.5), CREAM = mat(0xe9e1c4, 0.5), BLK = mat(BLACK, 0.7), RED = mat(0xb3201c, 0.45);
  box(tractor, 0.8, 0.42, 0.7, GR, 0, 0.42, 0.6);
  box(tractor, 0.8, 0.32, 0.6, CREAM, 0, 0.8, 0.55);
  for(const s of [-1, 1]) add(tractor, new THREE.PlaneGeometry(0.4, 0.2), glassMat(), s * 0.401, 0.82, 0.55).rotation.y = s * Math.PI / 2;
  add(tractor, new THREE.PlaneGeometry(0.6, 0.18), glassMat(), 0, 0.86, 0.851);
  box(tractor, 0.82, 0.05, 0.64, GR, 0, 0.98, 0.55);
  faceDisc(tractor, 0.17, {smile: 0.8, brow: -0.3, skin: '#c9ccc9'}, 0, 0.42, 0.952);
  for(const s of [-1, 1]) cylZ(tractor, 0.06, 0.06, 0.04, CREAM, s * 0.3, 0.6, 0.952, 12);
  const wheels = [];
  const wheel = (p, r, x, y, z, hub) => { const w = new THREE.Group(); w.position.set(x, y, z); p.add(w);
    cylX(w, r, r, 0.12, BLK, 0, 0, 0, 14); if(hub) cylX(w, r * 0.42, r * 0.42, 0.13, RED, 0, 0, 0, 10);
    box(w, 0.125, r * 1.4, 0.04, mat(0x444444), 0, 0, 0); wheels.push({w, r}); };
  wheel(tractor, 0.16, 0, 0.16, 0.85, false);
  for(const s of [-1, 1]) wheel(tractor, 0.17, s * 0.36, 0.17, 0.25, true);
  box(g, 0.86, 0.08, 1.9, GR, 0, 0.38, -0.85);
  for(const s of [-1, 1]) box(g, 0.04, 0.12, 1.9, GR, s * 0.43, 0.46, -0.85);
  for(const s of [-1, 1]) wheel(g, 0.15, s * 0.36, 0.15, -1.45, false);
  box(g, 0.6, 0.3, 0.8, mat(0x3c4552, 0.6), 0, 0.57, -0.7);
  g.scale.setScalar(NG);
  const c = {name: 'Madge', kind: 'Lorry', group: g, dist: 0.07,
    desc: 'Madge is a Scammell Scarab lorry who works with the Skarloey Railway, carrying loads to and from places the rails cannot reach. She is green with a cream upper cab and red hubcaps.'};
  statics.push(c); tagPick(g, () => showStatic(c));
  // A closed road round the quarry yard, so Madge never has to reverse.
  const road = [[-2.5, 1.4], [0, 1.15], [3, 1.15], [6, 1.4], [6.9, 2.05], [6, 2.75], [3, 2.95], [0, 2.95], [-2.5, 2.75], [-3.4, 2.05]]
    .map(([t, n]) => f.o.clone().addScaledVector(f.t, t * 5 * METRE).addScaledVector(f.n, n * 5 * METRE));
  const loop = new THREE.CatmullRomCurve3(road, true, 'centripetal');
  loop.arcLengthDivisions = 400;
  const loopLen = loop.getLength(), N = 160, half = 2.6 * METRE, pos = [], idx = [];
  for(let i = 0; i <= N; i++){
    const q = loop.getPointAt(i / N % 1), tg = loop.getTangentAt(i / N % 1), nx = tg.z, nz = -tg.x, nl = Math.hypot(nx, nz) || 1;
    for(const s of [-1, 1]){ const x = q.x + nx / nl * half * s, z = q.z + nz / nl * half * s; pos.push(x, groundY(x, z) + 0.3 * METRE, z); }
    if(i < N){ const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
  const roadMesh = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({color: 0x8c8172, roughness: 0.95, side: THREE.DoubleSide}));
  roadMesh.receiveShadow = true; scene.add(roadMesh);
  let s = 0.3, wait = 0;
  const q = new THREE.Vector3(), tg = new THREE.Vector3();
  frameHooks.push(dt => {
    const d = dt * timeScale;
    let move = 0;
    if(wait > 0) wait -= d;
    else {
      const prev = s;
      s = (s + d * 5 * METRE / loopLen) % 1;
      move = d * 5 * METRE;
      if(prev < 0.1 && s >= 0.1) wait = 40;                      // pause at the yard to load
    }
    loop.getPointAt(s, q); loop.getTangentAt(s, tg);
    const hf = groundY(q.x + tg.x * 3 * METRE, q.z + tg.z * 3 * METRE), hb = groundY(q.x - tg.x * 3 * METRE, q.z - tg.z * 3 * METRE);
    g.position.set(q.x, groundY(q.x, q.z) + 0.25 * METRE, q.z);
    g.rotation.order = 'YXZ';
    g.rotation.set(-Math.atan2(hf - hb, 6 * METRE), Math.atan2(tg.x, tg.z), 0);
    if(move) wheels.forEach(({w, r}) => { w.rotation.x += move / (r * NG); });
  });
})();

// ------------------------------------------------------------------ close-up scenery
// Only shown when zoomed in: station platforms and buildings, houses around the towns, and trees
// generated around wherever the camera is looking. Placement is procedural (the maps give no
// buildings or woodland), kept clear of the track.
const CELL = 0.02;
const trackCells = new Map();
RAIL.lines.forEach(l => {
  const R = l.real;
  for(let j = 0; j < R.n; j++){
    const k = Math.floor(R.x[j] / CELL) + ',' + Math.floor(R.z[j] / CELL);
    if(!trackCells.has(k)) trackCells.set(k, []);
    trackCells.get(k).push(R.x[j], R.z[j]);
  }
});
function nearTrack(x, z, r){
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), r2 = r * r;
  for(let i = -1; i <= 1; i++) for(let k = -1; k <= 1; k++){
    const a = trackCells.get((cx + i) + ',' + (cz + k)); if(!a) continue;
    for(let q = 0; q < a.length; q += 2){ const dx = a[q] - x, dz = a[q + 1] - z; if(dx * dx + dz * dz < r2) return true; }
  }
  return false;
}
const hash2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function valueNoise(x, z){
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0), b = hash2(x0 + 1, z0), c = hash2(x0, z0 + 1), d = hash2(x0 + 1, z0 + 1);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}

window.BESPOKE = new Set(['Knapford', 'Ffarquhar', 'Anopha Quarry', 'Tidmouth', 'Sodor Search and Rescue Centre']);
const sceneryNear = new THREE.Group(); scene.add(sceneryNear);   // platforms, buildings, houses
const WALLS = [0xe8dcc0, 0xd9cfb4, 0x9a4a32, 0xa39c8e, 0xf0ece0, 0x8a5a3e], ROOFS = [0x4a4f58, 0x5a5f66, 0x8a3a2a, 0x6b3a2a];

// Station platforms (laid in short pieces so they follow the curve) and station buildings.
(function(){
  const plat = new THREE.Group(), PM = mat(0xa8a49a, 0.85), EDGE = mat(0xeeeeee, 0.6);
  const _a = new THREE.Vector3(), _d = new THREE.Vector3();
  STATIONS.forEach((st, si) => {
    const line = LINES[st.lines[0]];
    if(!line || BESPOKE.has(st.name)) return;            // Knapford, Ffarquhar and Anopha Quarry are built by their own files
    const std = line.kind === 'standard', closed = st.kind === 'closed';
    const lenM = std ? (MAJOR.has(st.name) ? 140 : 90) : line.kind === 'miniature' ? 22 : line.kind === 'industrial' ? 20 : 40;
    const wM = std ? 4 : 2.8, off = ((std ? 3.6 : 2.3) / 2 + 0.6 + wM / 2 + (line.id === 'main' ? MAIN_LANE : 0)) * METRE;
    const segs = Math.ceil(lenM / 15), u0 = st.trackU;
    for(let k = 0; k < segs; k++){
      const du = ((k + 0.5) / segs - 0.5) * lenM * METRE / line.real.len;
      realAt(line, u0 + du, _a); realDir(line, u0 + du, _d);
      const nx = _d.z, nz = -_d.x, nl = Math.hypot(nx, nz) || 1;
      const cx = _a.x + nx / nl * off, cz = _a.z + nz / nl * off, gy = Math.max(heightAt(cx, cz), _a.y - 0.55 * METRE);
      const b = box(plat, wM * METRE, _a.y + 0.45 * METRE - gy, (lenM / segs + 0.3) * METRE, closed ? mat(0x8f8a7c, 0.95) : PM, cx, (gy + _a.y + 0.45 * METRE) / 2, cz);
      b.rotation.y = Math.atan2(_d.x, _d.z);
      if(!closed){ const e = box(plat, 0.3 * METRE, 0.06 * METRE, (lenM / segs + 0.3) * METRE, EDGE, cx - nx / nl * (wM / 2 - 0.15) * METRE, _a.y + 0.48 * METRE, cz - nz / nl * (wM / 2 - 0.15) * METRE); e.rotation.y = b.rotation.y; }
    }
    if(closed || line.id === 'arlesdale') return;
    realAt(line, u0, _a); realDir(line, u0, _d);
    const nx = _d.z, nz = -_d.x, nl = Math.hypot(nx, nz) || 1, bo = off + (wM / 2 + 4.5) * METRE;
    const bx = _a.x + nx / nl * bo, bz = _a.z + nz / nl * bo, by = heightAt(bx, bz);
    const W = (std ? 16 : 9) * METRE, D = (std ? 7 : 5) * METRE, H = (std ? 5 : 3.6) * METRE;
    const g = new THREE.Group(); g.position.set(bx, by, bz); g.rotation.y = Math.atan2(_d.x, _d.z); plat.add(g);
    box(g, D, H, W, mat(WALLS[si % WALLS.length], 0.8), 0, H / 2, 0);
    // Triangular prism with its ridge up and along the building: a gable roof.
    add(g, new THREE.CylinderGeometry(D * 0.6, D * 0.6, W * 1.06, 3).rotateX(-Math.PI / 2), mat(ROOFS[si % ROOFS.length], 0.7), 0, H + D * 0.3, 0);
    for(let w = 0; w < 4; w++) for(const s of [-1, 1]) box(g, 0.05 * METRE, 1.2 * METRE, 1.0 * METRE, glassMat(), s * (D / 2 + 0.02 * METRE), H * 0.55, -W / 2 + W * (w + 0.5) / 4);
    box(g, D * 1.05, 0.25 * METRE, W * 0.7, mat(0x3a3a3a, 0.6), 0, H * 0.82, 0).position.x = -D * 0.62;
  });
  bake(plat);
  sceneryNear.add(plat);
})();

let clearHouses = () => {};
const clearZones = [];          // ground kept free of houses and trees
function clearArea(x, z, r){ clearZones.push({x, z, r2: r * r}); clearHouses(x, z, r); }

// Towns, streets and buildings are laid out in world.js; clearArea() marks ground they must keep off.
const inClearZone = (x, z) => clearZones.some(c => (c.x - x) ** 2 + (c.z - z) ** 2 < c.r2);

// Trees, regenerated around the camera target as you move: patchy woodland, none on the line.
const trees = (function(){
  const CAP = 10000;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({color: 0x5a4030, roughness: 0.9}), CAP);
  // conifers: three tiers of branches; broadleaves: a crown of overlapping lobes, its surface roughened a little
  const mergeT = parts => { parts = parts.map(p => p.index ? p.toNonIndexed() : p); let n = 0; parts.forEach(p => n += p.attributes.position.count);
    const pos = new Float32Array(n * 3); let o = 0; parts.forEach(p => { pos.set(p.attributes.position.array, o * 3); o += p.attributes.position.count; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return g; };
  const rough = (g, amt) => { const p = g.attributes.position; for(let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + amt * (Math.sin(x * 7.1 + z * 3.3) * Math.cos(y * 5.7 - x * 2.1)); p.setXYZ(i, x * k, y * k, z * k); } g.computeVertexNormals(); return g; };
  const coneGeo = rough(mergeT([new THREE.ConeGeometry(1, 0.5, 9).translate(0, 0.25, 0), new THREE.ConeGeometry(0.78, 0.45, 9).translate(0, 0.5, 0), new THREE.ConeGeometry(0.52, 0.42, 9).translate(0, 0.78, 0)]), 0.05);
  const ballGeo = rough(mergeT([new THREE.IcosahedronGeometry(0.78, 1), new THREE.IcosahedronGeometry(0.58, 1).translate(0.45, 0.12, 0.22), new THREE.IcosahedronGeometry(0.56, 1).translate(-0.42, 0.08, -0.26),
    new THREE.IcosahedronGeometry(0.5, 1).translate(0.08, 0.48, -0.1), new THREE.IcosahedronGeometry(0.5, 1).translate(-0.18, -0.18, 0.38), new THREE.IcosahedronGeometry(0.45, 1).translate(0.3, -0.12, -0.42)]), 0.07);
  const cone = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({roughness: 0.9, flatShading: true}), CAP);
  const ball = new THREE.InstancedMesh(ballGeo, new THREE.MeshStandardMaterial({roughness: 0.9, flatShading: true}), CAP);
  const g = new THREE.Group(); g.add(trunk, cone, ball); scene.add(g);
  // create the per-tree colours now, so the shader is built with them even if the first fill has no trees of a kind
  [cone, ball].forEach(m => { m.castShadow = true; m.setColorAt(0, new THREE.Color(0x3f6b2e)); });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const greens = [0x3f6b2e, 0x4c7a34, 0x2f5a2a, 0x5a8a3c, 0x3a5f30, 0x6a8a3a, 0x2e4f2c, 0x7a9a46], firs = [0x2a4a2c, 0x30523a, 0x26402a, 0x3a5a34], up = new THREE.Vector3(0, 1, 0);
  let last = null;
  function fill(cx, cz, radius){
    const step = 12 * METRE, n = Math.ceil(radius / step);
    let nt = 0, nc = 0, nb = 0;
    const ix0 = Math.floor(cx / step), iz0 = Math.floor(cz / step);
    // close in, two more layers of trees fill the same cells (the first layer never moves, so nothing jumps)
    const layers = radius < 0.22 ? 3 : radius < 0.36 ? 2 : 1;
    for(let lay = 0; lay < layers; lay++)
    for(let i = -n; i <= n && nt < CAP; i++) for(let k = -n; k <= n && nt < CAP; k++){
      const gi = ix0 + i + lay * 100003, gk = iz0 + k - lay * 70001, h1 = hash2(gi, gk);
      const x = (ix0 + i + hash2(gk, gi)) * step, z = (iz0 + k + hash2(gi + 7, gk - 3)) * step;
      // world.js's land map says where the woods, hedgerows and gardens are; before it loads, plain noise
      const L = window.SODOR_LAND, dens = L ? L.trees(x, z) : (w => w * w * 1.6)(valueNoise(gi * 0.045, gk * 0.045));
      if(h1 > dens) continue;
      if((x - cx) ** 2 + (z - cz) ** 2 > radius * radius) continue;
      const h = heightAt(x, z);
      if(h < 2 * METRE || nearTrack(x, z, 8 * METRE)) continue;
      if(!L && STATIONS.some(st => (st.x - x) ** 2 + (st.z - z) ** 2 < (MAJOR.has(st.name) ? 0.09 : 0.0016))) continue;
      if(inClearZone(x, z) || (L && L.blocked(x, z))) continue;
      const th = (8 + hash2(gi * 3, gk) * 9) * METRE, conifer = hash2(gk * 5, gi) < 0.45;
      m4.compose(v.set(x, h - 0.3 * METRE, z), q.identity(), s.set(th * 0.06, th * 0.45, th * 0.06)); trunk.setMatrixAt(nt, m4);
      c.setHex(conifer ? firs[Math.floor(hash2(gi, gk * 3) * firs.length)] : greens[Math.floor(hash2(gi, gk * 3) * greens.length)]);
      c.offsetHSL(0, 0, (hash2(gi * 7, gk * 11) - 0.5) * 0.08);
      q.setFromAxisAngle(up, hash2(gi * 13, gk) * 6.283);
      const wd = 0.85 + hash2(gk * 17, gi) * 0.35;
      if(conifer){ m4.compose(v.set(x, h + th * 0.15, z), q, s.set(th * 0.22 * wd, th * 0.9, th * 0.22 * wd)); cone.setMatrixAt(nc, m4); cone.setColorAt(nc++, c); }
      else { m4.compose(v.set(x, h + th * 0.62, z), q, s.set(th * 0.3 * wd, th * 0.27, th * 0.3 * wd)); ball.setMatrixAt(nb, m4); ball.setColorAt(nb++, c); }
      q.identity();
      nt++;
    }
    trunk.count = nt; cone.count = nc; ball.count = nb;
    [trunk, cone, ball].forEach(m => { m.instanceMatrix.needsUpdate = true; if(m.instanceColor) m.instanceColor.needsUpdate = true; });
  }
  return {group: g, invalidate(){ last = null; }, update(){
    const radius = Math.min(0.6, Math.max(0.12, camDist * 1.2));
    if(!last || Math.hypot(camCenter.x - last.x, camCenter.z - last.z) > radius * 0.3 || Math.abs(radius - last.r) > last.r * 0.4){
      fill(camCenter.x, camCenter.z, radius);
      last = {x: camCenter.x, z: camCenter.z, r: radius};
    }
  }};
})();
frameHooks.push(() => {
  sceneryNear.visible = camDist < 5;
  sidingGroup.visible = camDist < 9;
  trees.group.visible = camDist < 2.5;
  if(trees.group.visible) trees.update();
});

// ------------------------------------------------------------------ roster panel
const rosterList = document.getElementById('rosterList'), roster = document.getElementById('roster');
const hex = c => '#' + c.toString(16).padStart(6, '0');
function rosterRow(name, sub, color, onClick){
  const d = document.createElement('div'); d.className = 'ros-item';
  d.innerHTML = `<span class="ros-dot" style="background:${color}"></span><span class="ros-name">${name}</span><span class="ros-sub">${sub}</span>`;
  d.onclick = onClick; rosterList.appendChild(d);
}
const grp = t => { const h = document.createElement('div'); h.className = 'leg-group'; h.textContent = t; rosterList.appendChild(h); };
grp('Engines');
ENGINES.filter(E => E.train && E.rail !== 'ar').forEach(E => rosterRow(E.name, E.no ? 'No. ' + E.no : E.wheels, hex(ENGINE_COLORS[E.id]), () => showEngine(E)));
grp('Arlesdale Railway');
ENGINES.filter(E => E.rail === 'ar' && (E.train || E.unit)).forEach(E => rosterRow(E.name, E.wheels, hex(ENGINE_COLORS[E.id]), () => showEngine(E)));
grp('Cranes, incline and lorry');
const STATIC_COLORS = {Owen: 0xe8731e, Merrick: 0xa0142c, Colin: 0x2f7a3a, Madge: 0x2f6b3a};
statics.forEach(c => rosterRow(c.name, c.kind, hex(STATIC_COLORS[c.name]), () => showStatic(c)));
document.getElementById('rosterArrow').onclick = () => roster.classList.add('collapsed');      // the top bar's menu button brings it back
if(innerWidth < 760) roster.classList.add('collapsed');

document.getElementById('statTrains').textContent = TRAINS.length + SR_TRAINS.length;
window.SODOR_SR = {ENGINES, SR_TRAINS, RUNNERS, statics, STOCK, COLORS: ENGINE_COLORS, show: showEngine, BLOCK};
// The model kit and train runner, shared with nwr.js.
window.SODOR_KIT = {mat, add, box, cylZ, cylX, cylY, domeCap, arcZ, roof, bake, canvasTex, faceMat, plateMat, sidePlates, sidePlatesTex,
  glassMat, brassMat, bronzeMat, buildSteam, buildTender, wheelset, makeRunner, drawLoops, addMarker, RUNNERS, tagPick, lineU,
  placeVeh, spin, puff, trackFrame, swapUnit, stopsFor, setCars, loopLat, markerMat, _p, _t, yards: [], roundhouse: null,
  nearTrack, clearArea, inClearZone, clearZones, ground, rosterRow, NG, STD, BLACK, BEAM_RED, BRASS, sceneryNear, trees, ribbon, MINI};
// Arlesdale sidings: a short road beside the station, shunted by a Blister (ops.js YARDS).
ENGINES.filter(E => E.yard && E.unit).forEach(E => {
  const line = LINES[E.line], L = line.real.len, u0 = lineU(line, E.yard), sg = u0 > 0.5 ? -1 : 1;      // run back along the line
  realDir(line, u0, _t); const nl = Math.hypot(_t.x, _t.z) || 1, nx = _t.z / nl, nz = -_t.x / nl, OFF = (E.yardOff || 6) * METRE, LEN = Math.round((E.yardLen || 60) * METRE / MINI);   // s runs in model units, like the vehicle lengths
  const at = (s, out) => { const u = Math.max(0, Math.min(1, u0 + sg * (s + 3) * MINI / L)); realAt(line, u, out); out.x += nx * OFF; out.z += nz * OFF; out.y = Math.max(out.y, heightAt(out.x, out.z) + 0.5 * METRE); return out; };
  const pts = []; for(let s = -2; s <= LEN + 2; s += 3) pts.push(at(s, new THREE.Vector3()));
  ribbon(line, pts, 1.3);
  const d = new THREE.Vector3().subVectors(pts[pts.length - 1], pts[0]).normalize();
  let s0 = 4;                          // stand them at the start of the road (ops.js moves them from here)
  [...E.unit, ...E.cars].forEach(v => { at(s0 + v.len / 2, v.group.position); v.group.rotation.set(0, Math.atan2(d.x, d.z), 0); s0 += v.len + 0.15; });
  window.SODOR_KIT.yards.push({D: {label: E.yard + ' siding'}, label: E.yard + ' siding (Arlesdale Railway)', rail: 'ar', units: [E.unit, ...E.cars.map(c => [c])],
    ids: [E.id, ...E.consist], recs: [E, ...E.cars.map(() => null)], at, yaw: Math.atan2(d.x, d.z), face: 1, sMin: 1, sMax: LEN, shed: 0, scale: MINI});
});
})();
