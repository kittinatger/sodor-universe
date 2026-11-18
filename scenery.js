// scenery.js: the countryside and coast between the towns, loaded after world.js and life.js.
//   - farms: round silos, stacks of hay bales, post-and-rail paddocks with sheep and cows grazing and wandering;
//   - windmills: white tower mills on high ground, their four sails turning in the wind;
//   - beaches: rows of brightly painted beach huts above the sand near the towns;
//   - the sea: fishing boats, motor launches and yachts cruising in loops off each harbour mouth.
// Everything here is instanced or baked per district, and only drawn and stepped close to the camera.
(function(){
'use strict';
const t0 = performance.now();
const K = window.SODOR_KIT, S = window.SODOR_STD, W = window.SODOR_WORLD, LAND = window.SODOR_LAND;
if(!K || !S || !W) return;
const {mat, add, box, cylY, glassMat} = K;
const M = METRE, V3 = THREE.Vector3, TAU = Math.PI * 2;
const H = (x, z) => heightAt(x, z), wet = (x, z) => H(x, z) < 0.6 * M;
let seed = 2024; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const blocked = (x, z) => wet(x, z) || K.nearTrack(x, z, 14 * M) || (LAND && LAND.blocked(x, z)) || (K.inClearZone && K.inClearZone(x, z));
const root = new THREE.Group(); scene.add(root);

// ------------------------------------------------------------------ instancing helper
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new V3(), s4 = new V3(), c4 = new THREE.Color();
function merged(parts){                                   // [geometry, colour] pairs -> one geometry with vertex colours
  let n = 0; parts = parts.map(([g, c]) => [g.index ? g.toNonIndexed() : g, new THREE.Color(c)]); parts.forEach(([g]) => n += g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  parts.forEach(([g, c]) => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); for(let i = 0; i < g.attributes.position.count; i++){ col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; } o += g.attributes.position.count; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
const VC = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.85});
function instanced(geo, list, material = VC){
  const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
  im.count = list.length; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
  list.forEach((b, i) => { m4.compose(v4.set(b.x, b.y, b.z), q4.setFromEuler(e4.set(b.rx || 0, b.yaw || 0, 0)), s4.set(b.sx || M, b.sy || M, b.sz || M)); im.setMatrixAt(i, m4); if(b.col !== undefined){ im.setColorAt(i, c4.setHex(b.col)); } });
  root.add(im); return im;
}
const B = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const Cy = (r1, r2, h, x = 0, y = 0, z = 0, n = 12) => new THREE.CylinderGeometry(r1, r2, h, n).translate(x, y, z);

// ------------------------------------------------------------------ farms
const barns = [];
(W.countryside || []).forEach(o => (o.inst.barn || []).forEach(b => barns.push(b)));
// one farmyard per cluster of barns
const yards = [];
barns.forEach(b => { if(!yards.some(y => Math.hypot(y.x - b.x, y.z - b.z) < 120 * M)) yards.push(b); });
const silos = [], bales = [], posts = [], rails = [], sheep = [], cows = [];
const paddocks = [];
yards.forEach(b => {
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), rx = fz, rz = -fx;               // the barn's front and its right
  // a silo or two beside the barn, and a stack of round bales
  if(rnd() < 0.75){ const n = rnd() < 0.4 ? 2 : 1; for(let k = 0; k < n; k++){ const x = b.x + rx * (13 + k * 6.5) * M - fx * 4 * M, z = b.z + rz * (13 + k * 6.5) * M - fz * 4 * M; if(!wet(x, z)) silos.push({x, y: H(x, z), z, yaw: 0, col: [0xd8dcdc, 0x9aa8a8, 0x6a7a5a, 0xd0c8b8][Math.floor(rnd() * 4)]}); } }
  for(let k = 0, nb = 4 + Math.floor(rnd() * 6); k < nb; k++){ const x = b.x - rx * (12 + (k % 3) * 1.9) * M + fx * (6 + Math.floor(k / 3) * 1.9) * M, z = b.z - rz * (12 + (k % 3) * 1.9) * M + fz * (6 + Math.floor(k / 3) * 1.9) * M; bales.push({x, y: H(x, z) + 0.75 * M, z, yaw: b.yaw, rx: Math.PI / 2, col: rnd() < 0.5 ? 0xd8c070 : 0xe8e4dc}); }
  // a paddock behind the farm: post-and-rail fence round 60 x 40 m of grass
  const pw = 60, pd = 40, cx = b.x - fx * (pd / 2 + 16) * M, cz = b.z - fz * (pd / 2 + 16) * M;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => [cx + rx * a * pw / 2 * M + fx * c * pd / 2 * M, cz + rz * a * pw / 2 * M + fz * c * pd / 2 * M]);
  if(corners.concat([[cx, cz]]).some(([x, z]) => blocked(x, z))) return;
  if(paddocks.length > 260) return;
  const P = {cx, cz, rx, rz, fx, fz, hw: pw / 2 - 3, hd: pd / 2 - 3, kind: rnd() < 0.55 ? 'sheep' : 'cows'};
  paddocks.push(P);
  for(let k = 0; k < 4; k++){
    const [x0, z0] = corners[k], [x1, z1] = corners[(k + 1) % 4], L = Math.hypot(x1 - x0, z1 - z0) / M, yaw = Math.atan2(x1 - x0, z1 - z0), n = Math.ceil(L / 3);
    for(let i = 0; i < n; i++){
      const f = i / n, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f, y = H(x, z);
      if(k === 0 && i > n / 2 - 2 && i < n / 2 + 1) continue;                     // a gap for the gate
      posts.push({x, y, z, yaw});
      const g = (i + 0.5) / n, xm = x0 + (x1 - x0) * g, zm = z0 + (z1 - z0) * g, ym = H(xm, zm);
      rails.push({x: xm, y: ym + 0.55 * M, z: zm, yaw, sz: L / n * M}); rails.push({x: xm, y: ym + 1.0 * M, z: zm, yaw, sz: L / n * M});
    }
  }
  const herd = P.kind === 'sheep' ? sheep : cows, n = P.kind === 'sheep' ? 8 + Math.floor(rnd() * 8) : 4 + Math.floor(rnd() * 5);
  for(let k = 0; k < n; k++){ const a = {P, u: (rnd() * 2 - 1) * P.hw, w: (rnd() * 2 - 1) * P.hd, yaw: rnd() * TAU, tu: 0, tw: 0, wait: rnd() * 30, col: P.kind === 'sheep' ? (rnd() < 0.1 ? 0x2a2624 : 0xeeeae0) : [0x4a2e1e, 0x1c1a18, 0x8a5a32, 0xe8e2d4][Math.floor(rnd() * 4)]}; a.tu = a.u; a.tw = a.w; herd.push(a); }
});
instanced(merged([[Cy(3.0, 3.0, 13, 0, 6.5, 0, 16), 0xffffff], [new THREE.SphereGeometry(3.05, 16, 8, 0, TAU, 0, Math.PI / 2).translate(0, 13, 0), 0xb8bcc0], [B(0.4, 13, 0.3, 0, 6.5, 3.05), 0x6a6d70]]), silos);
instanced(merged([[Cy(0.75, 0.75, 1.2, 0, 0, 0, 14), 0xffffff]]), bales);
const fenceWood = new THREE.MeshStandardMaterial({color: 0x8a6a48, roughness: 0.9});
instanced(B(0.14, 1.3, 0.14, 0, 0.65, 0), posts, fenceWood);
instanced(B(0.06, 0.1, 1), rails, fenceWood);
// animals: a body, a head and four legs, instanced; the herd wanders when you are near
const sheepGeo = merged([[new THREE.SphereGeometry(0.55, 10, 8).scale(1, 0.8, 1.5).translate(0, 0.75, 0), 0xffffff], [B(0.32, 0.34, 0.42, 0, 0.92, 0.78), 0x2a2624], ...[[-0.25, -0.45], [0.25, -0.45], [-0.25, 0.4], [0.25, 0.4]].map(([x, z]) => [B(0.1, 0.5, 0.1, x, 0.25, z), 0x2a2624])]);
const cowGeo = merged([[B(0.9, 0.85, 2.0, 0, 1.15, 0), 0xffffff], [B(0.5, 0.5, 0.6, 0, 1.35, 1.25), 0xffffff], [B(0.52, 0.2, 0.25, 0, 1.25, 1.6), 0xe0b0a0], [B(0.6, 0.06, 0.1, 0, 1.62, 1.1), 0xe8e0c8],
  ...[[-0.32, -0.75], [0.32, -0.75], [-0.32, 0.75], [0.32, 0.75]].map(([x, z]) => [B(0.18, 0.75, 0.18, x, 0.37, z), 0xffffff])]);
const sheepIM = instanced(sheepGeo, sheep.map(a => ({x: 0, y: 0, z: 0, col: a.col}))), cowIM = instanced(cowGeo, cows.map(a => ({x: 0, y: 0, z: 0, col: a.col})));
const placeAnimal = (im, a, i) => { const P = a.P, x = P.cx + P.rx * a.u * M + P.fx * a.w * M, z = P.cz + P.rz * a.u * M + P.fz * a.w * M; m4.compose(v4.set(x, H(x, z), z), q4.setFromEuler(e4.set(0, a.yaw, 0)), s4.setScalar(M)); im.setMatrixAt(i, m4); a.x = x; a.z = z; };
sheep.forEach((a, i) => placeAnimal(sheepIM, a, i)); cows.forEach((a, i) => placeAnimal(cowIM, a, i));
function stepHerd(list, im, dt, speed, cp){
  let any = false;
  list.forEach((a, i) => {
    if(Math.abs(a.x - cp.x) > 0.9 || Math.abs(a.z - cp.z) > 0.9) return;
    if(a.wait > 0){ a.wait -= dt; return; }
    const du = a.tu - a.u, dw = a.tw - a.w, d = Math.hypot(du, dw);
    if(d < 0.2){ a.tu = Math.max(-a.P.hw, Math.min(a.P.hw, a.u + (rnd() * 2 - 1) * 9)); a.tw = Math.max(-a.P.hd, Math.min(a.P.hd, a.w + (rnd() * 2 - 1) * 7)); a.wait = 8 + rnd() * 40; return; }   // graze, then amble on
    const st = Math.min(d, speed * dt); a.u += du / d * st; a.w += dw / d * st;
    const P = a.P, wx = P.rx * du + P.fx * dw, wz = P.rz * du + P.fz * dw, want = Math.atan2(wx, wz);
    a.yaw += Math.atan2(Math.sin(want - a.yaw), Math.cos(want - a.yaw)) * Math.min(1, dt * 2);
    placeAnimal(im, a, i); any = true;
  });
  if(any) im.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------ windmills on the high ground
const mills = [];
yards.slice().sort((a, b) => H(b.x, b.z) - H(a.x, a.z)).forEach(b => {
  if(mills.length >= 16 || H(b.x, b.z) < 25 * M) return;
  if(mills.some(m => Math.hypot(m.x - b.x, m.z - b.z) < 3500 * M)) return;
  const x = b.x + Math.sin(b.yaw + 2.2) * 40 * M, z = b.z + Math.cos(b.yaw + 2.2) * 40 * M;
  if(blocked(x, z)) return;
  const g = new THREE.Group(); g.position.set(x, H(x, z) - 0.3 * M, z); g.scale.setScalar(M); root.add(g);
  const WIND = 2.4;                                                                           // the sails face the prevailing wind
  cylY(g, 3.2, 4.6, 15, mat(0xf2efe6, 0.85), 0, 7.5, 0, 16);
  box(g, 1.3, 2.4, 0.2, mat(0x2f5a3a, 0.6), 0, 1.2, 4.45).rotation.y = 0;
  for(const y of [5, 10]) for(const a of [0.6, 2.4, 4.0]) box(g, 0.9, 1.2, 0.2, glassMat(), Math.sin(a) * (4.4 - y * 0.09), y, Math.cos(a) * (4.4 - y * 0.09)).rotation.y = a;
  const cap = new THREE.Group(); cap.position.y = 15; cap.rotation.y = WIND; g.add(cap);
  add(cap, new THREE.SphereGeometry(3.4, 14, 8, 0, TAU, 0, Math.PI / 2), mat(0x2a2c30, 0.7), 0, 0, 0).scale.set(1, 0.8, 1.2);
  box(cap, 7.4, 0.3, 1.6, mat(0xf2efe6, 0.8), 0, 0.2, -3.6);                                    // the fantail stage
  cylY(cap, 0.25, 0.25, 2.6, mat(0x3a3a3a, 0.6), 0, 1.0, -4.2, 8);
  box(cap, 0.8, 0.8, 2.4, mat(0x3a3a3a, 0.6), 0, 1.0, 3.2);
  const sails = new THREE.Group(); sails.position.set(0, 1.0, 4.4); cap.add(sails);
  for(let k = 0; k < 4; k++){
    const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; sails.add(arm);
    box(arm, 0.35, 13, 0.3, mat(0x5a4630, 0.8), 0, 6.5, 0);
    box(arm, 2.2, 10, 0.12, mat(0xeae6dc, 0.85), 1.25, 7.5, 0.05);
    for(let y = 3; y <= 12.5; y += 1.6) box(arm, 2.4, 0.1, 0.16, mat(0x5a4630, 0.8), 1.25, y, 0.08);
  }
  const sailsKeep = sails; cap.remove(sails); S.bakeVC(g); S.bakeVC(sailsKeep);
  const capNode = new THREE.Group(); capNode.position.set(0, 15, 0); capNode.rotation.y = WIND; g.add(capNode); sailsKeep.position.set(0, 1.0, 4.4); capNode.add(sailsKeep);
  mills.push({x, z, g, sails: sailsKeep, spin: 0.6 + rnd() * 0.4});
});

// ------------------------------------------------------------------ beach huts on the town beaches
const huts = [];
(W.towns || []).filter(t => t.cls >= 2).forEach(t => {
  for(let k = 0; k < 64; k++){
    const a = k / 64 * TAU;
    for(let d = 0.2; d < 1.5; d += 0.03){
      const x = t.x + Math.cos(a) * t.R * d, z = t.z + Math.sin(a) * t.R * d, h = H(x, z) / M;
      if(h < 0.3) break;
      if(h > 1.0 && h < 2.6 && wet(x + Math.cos(a) * 25 * M, z + Math.sin(a) * 25 * M) && !blocked(x - Math.cos(a) * 6 * M, z - Math.sin(a) * 6 * M)){
        if(huts.some(u => Math.hypot(u.x - x, u.z - z) < 250 * M)) break;
        // a row along the shore, doors facing the sea
        const tx = -Math.sin(a), tz = Math.cos(a), yaw = Math.atan2(Math.cos(a), Math.sin(a)), n = 6 + Math.floor(rnd() * 6);
        for(let i = 0; i < n; i++){ const o = (i - n / 2) * 3.4 * M, hx = x + tx * o - Math.cos(a) * 4 * M, hz = z + tz * o - Math.sin(a) * 4 * M; if(wet(hx, hz)) continue;
          huts.push({x: hx, y: H(hx, hz), z: hz, yaw, col: [0xd8342e, 0x2f7ac0, 0xf2c419, 0x3a9a5a, 0xf2f0ea, 0xe87aa0, 0x5ac0c8][(i + k) % 7]}); }
        break;
      }
    }
  }
});
const hutGeo = merged([[B(2.6, 2.4, 2.4, 0, 1.4, 0), 0xffffff], [new THREE.CylinderGeometry(1.95, 1.95, 2.9, 3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.5, 1).translate(0, 3.09, 0), 0xf2f0ea], [B(1.0, 1.8, 0.06, 0, 1.2, 1.22), 0xf2f0ea], [B(2.9, 0.18, 3.0, 0, 0.15, 0.3), 0x8a6a48]]);
instanced(hutGeo, huts);

// ------------------------------------------------------------------ boats cruising off the harbours
const cruisers = [];
function boatModel(kind){
  const g = new THREE.Group(), hullC = [0x2a4a7a, 0xc8262b, 0x2f6a4a, 0xf2f0ea, 0x1a1a1a][Math.floor(rnd() * 5)];
  const L = kind === 'yacht' ? 10 : kind === 'launch' ? 8 : 13;
  box(g, 3.0, 1.4, L, mat(hullC, 0.6), 0, 0.3, 0);
  add(g, new THREE.ConeGeometry(1.55, 3.2, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), mat(hullC, 0.6), 0, 0.3, L / 2 + 1.5).scale.set(1, 0.45, 1);
  box(g, 3.1, 0.2, L + 0.2, mat(0xe8e2cf, 0.7), 0, 1.05, 0);
  if(kind === 'yacht'){ cylY(g, 0.08, 0.1, 12, mat(0xdedede, 0.4), 0, 7, 0.8, 6); const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new V3(0, 1.6, 0.9), new V3(0, 12.5, 0.9), new V3(0, 1.6, -3.6)]), mat(0xf6f4ee, 0.8, 0, 'double')); sail.geometry.computeVertexNormals(); g.add(sail); }
  else { box(g, 2.2, 1.8, kind === 'launch' ? 2.4 : 3.6, mat(0xf2f0ea, 0.65), 0, 2.0, -L * 0.12); box(g, 2.3, 0.6, 1.8, glassMat(), 0, 2.4, -L * 0.12 + 0.6); if(kind === 'fishing'){ cylY(g, 0.1, 0.12, 6, mat(0x5a4630, 0.9), 0, 4, L * 0.25, 6); box(g, 0.08, 0.08, 6, mat(0x5a4630, 0.9), 0, 5, L * 0.1).rotation.x = 0.5; } }
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(4, 22).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false}));
  wake.position.set(0, 0.05, -L / 2 - 10); g.add(wake);
  g.scale.setScalar(M); root.add(g); g.visible = false;
  return g;
}
(W.harbours || []).forEach(h => {
  const c = h.mouth.clone().addScaledVector(h.dir, 140 * M), n = h.t.cls === 3 ? 3 : 2, px = -h.dir.z, pz = h.dir.x;
  for(let k = 0; k < n; k++){
    const ra = (110 + rnd() * 90) * M, rb = (60 + rnd() * 50) * M;
    let ok = true; for(let i = 0; i < 24 && ok; i++){ const a = i / 24 * TAU, x = c.x + px * Math.cos(a) * ra + h.dir.x * Math.sin(a) * rb, z = c.z + pz * Math.cos(a) * ra + h.dir.z * Math.sin(a) * rb; if(H(x, z) > -1.5 * M) ok = false; }
    if(!ok) continue;
    const kind = ['fishing', 'yacht', 'launch'][k % 3];
    cruisers.push({g: boatModel(kind), c, px, pz, dx: h.dir.x, dz: h.dir.z, ra, rb, a: rnd() * TAU, w: (kind === 'yacht' ? 2.5 : 4) * M / ((ra + rb) / 2) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * 10});
  }
});

// ------------------------------------------------------------------ every frame
const _cp = new V3();
frameHooks.push(dt => {
  const cp = camera.position, near = camDist < 3.2, sdt = dt * Math.min(timeScale, 20);
  root.children.forEach(o => { if(o.isInstancedMesh) o.visible = near; });
  mills.forEach(m => { m.g.visible = camDist < 14 && Math.hypot(cp.x - m.x, cp.z - m.z) < 12; if(m.g.visible) m.sails.rotation.z -= dt * m.spin; });
  if(near && camDist < 1.6){ stepHerd(sheep, sheepIM, sdt, 0.35 * M, cp); stepHerd(cows, cowIM, sdt, 0.5 * M, cp); }
  const t = performance.now() * 0.001;
  cruisers.forEach(b => {
    const vis = camDist < 9 && Math.hypot(cp.x - b.c.x, cp.z - b.c.z) < 6;
    b.g.visible = vis; if(!vis) return;
    b.a += b.w * dt * Math.min(timeScale, 6);
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    const x = b.c.x + b.px * ca * b.ra + b.dx * sa * b.rb, z = b.c.z + b.pz * ca * b.ra + b.dz * sa * b.rb;
    const vx = (-b.px * sa * b.ra + b.dx * ca * b.rb) * Math.sign(b.w), vz = (-b.pz * sa * b.ra + b.dz * ca * b.rb) * Math.sign(b.w);
    b.g.position.set(x, Math.sin(t * 1.3 + b.ph) * 0.15 * M, z);
    b.g.rotation.set(Math.sin(t * 0.9 + b.ph) * 0.04, Math.atan2(vx, vz), Math.sin(t * 1.1 + b.ph) * 0.05);
  });
});
window.SODOR_SCENERY = {yards, paddocks, sheep, cows, mills, huts, cruisers, silos, bales};
console.log(`Scenery: ${yards.length} farmyards, ${paddocks.length} paddocks (${sheep.length} sheep, ${cows.length} cows), ${mills.length} windmills, ${huts.length} beach huts, ${cruisers.length} boats cruising — ${Math.round(performance.now() - t0)} ms`);
})();
