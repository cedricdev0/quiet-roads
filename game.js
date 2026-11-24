import * as THREE from './vendor/three.module.js';

(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#world');
  const errorBox = $('#errorBox');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    errorBox.textContent = 'This game needs a browser with WebGL enabled. ' + error.message;
    errorBox.classList.add('show');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.55));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0xb7cbc0);
  scene.background = skyColor;
  scene.fog = new THREE.FogExp2(0xb7cbc0, 0.00128);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1800);
  const hemi = new THREE.HemisphereLight(0xe7f0dd, 0x53634e, 2.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffedcd, 2.35);
  sun.position.set(-180, 260, 130);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 115;
  sun.shadow.camera.bottom = -115;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 650;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  const world = new THREE.Group();
  scene.add(world);

  let seed = 804271;
  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const range = (a, b) => a + (b - a) * random();
  const clamp = THREE.MathUtils.clamp;
  const smoothstep = THREE.MathUtils.smoothstep;
  const material = (color, roughness = 0.9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const shared = {
    bark: material(0x514539),
    grassA: material(0x7e8d5c),
    grassB: material(0x879463),
    rock: material(0x777a68),
    roadLine: material(0xe8e2c9, 0.82),
    centerLine: material(0xe0c77e, 0.88),
    post: material(0x514e42),
    reflector: material(0xd8d4b8, 0.5),
    tire: material(0x202321, 0.98),
    rim: material(0xa9ada0, 0.48, 0.3),
    window: new THREE.MeshStandardMaterial({ color: 0x273b3e, roughness: 0.32, metalness: 0.12 }),
    grille: material(0x28312e, 0.65, 0.12),
    headlamp: new THREE.MeshStandardMaterial({ color: 0xe9e3cb, emissive: 0xc2a96c, emissiveIntensity: 0.35, roughness: 0.38 }),
    tailLamp: new THREE.MeshStandardMaterial({ color: 0x9f4236, emissive: 0x641c15, emissiveIntensity: 0.35, roughness: 0.48 }),
  };

  function terrainHeight(x, z) {
    const rolling = 8.8 * Math.sin(x * 0.0048 + z * 0.0021)
      + 7.2 * Math.cos(z * 0.0054 - x * 0.0026)
      + 3.1 * Math.sin((x + z) * 0.0118)
      + 1.4 * Math.cos((x - z) * 0.021);
    const ridgeA = 28 * Math.exp(-(((x + 245) / 185) ** 2 + ((z - 70) / 265) ** 2));
    const ridgeB = 23 * Math.exp(-(((x - 185) / 230) ** 2 + ((z + 175) / 190) ** 2));
    return -2 + rolling + ridgeA + ridgeB;
  }

  // A closed scenic byway gives the drive a continuous route with varied bends and grades.
  const routeXZ = [
    [0, -300], [96, -347], [205, -337], [296, -274], [354, -174],
    [361, -73], [315, 6], [351, 92], [332, 192], [260, 271],
    [153, 301], [57, 264], [-9, 204], [-78, 169], [-157, 199],
    [-245, 266], [-333, 239], [-384, 151], [-360, 51], [-301, -25],
    [-330, -126], [-348, -227], [-270, -310], [-159, -350], [-49, -330],
  ];
  const routePoints = routeXZ.map(([x, z], i) => {
    const a = i / routeXZ.length * Math.PI * 2;
    const rise = 3.2 + 6.1 * Math.sin(2 * a + 0.48) + 2.35 * Math.sin(5 * a - 0.7);
    return new THREE.Vector3(x, terrainHeight(x, z) + rise, z);
  });
  const road = new THREE.CatmullRomCurve3(routePoints, true, 'catmullrom', 0.42);
  road.arcLengthDivisions = 5000;
  road.updateArcLengths();
  const roadLength = road.getLength();
  const trackCount = 3200;
  const samples = [];
  const sampleBuckets = new Map();
  const bucketSize = 32;
  const key2 = (x, z) => `${x},${z}`;
  function frameAt(distance) {
    const s = THREE.MathUtils.euclideanModulo(distance, roadLength);
    const u = s / roadLength;
    const point = road.getPointAt(u);
    const tangent = road.getTangentAt(u).normalize();
    const horizontalLength = Math.hypot(tangent.x, tangent.z) || 1;
    const tx = tangent.x / horizontalLength;
    const tz = tangent.z / horizontalLength;
    return {
      point,
      tangent,
      tx,
      tz,
      rightX: -tz,
      rightZ: tx,
      yaw: Math.atan2(-tx, -tz),
      grade: Math.atan2(tangent.y, horizontalLength),
    };
  }
  for (let i = 0; i < trackCount; i++) {
    const s = roadLength * i / trackCount;
    const frame = frameAt(s);
    const sample = { s, x: frame.point.x, y: frame.point.y, z: frame.point.z, tx: frame.tx, tz: frame.tz, rx: frame.rightX, rz: frame.rightZ };
    samples.push(sample);
    const bx = Math.floor(sample.x / bucketSize);
    const bz = Math.floor(sample.z / bucketSize);
    const key = key2(bx, bz);
    if (!sampleBuckets.has(key)) sampleBuckets.set(key, []);
    sampleBuckets.get(key).push(sample);
  }
  function nearestRoad(x, z) {
    const bx = Math.floor(x / bucketSize);
    const bz = Math.floor(z / bucketSize);
    let bestSq = Infinity;
    let best = samples[0];
    for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) {
      const candidates = sampleBuckets.get(key2(bx + ox, bz + oz));
      if (!candidates) continue;
      for (const sample of candidates) {
        const dx = sample.x - x;
        const dz = sample.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestSq) { bestSq = d2; best = sample; }
      }
    }
    return { distance: Math.sqrt(bestSq), y: best.y, sample: best };
  }
  function terrainSurfaceHeight(x, z, closest = nearestRoad(x, z)) {
    const natural = terrainHeight(x, z);
    const corridor = smoothstep(5.5, 24, closest.distance);
    const roadCut = closest.y - 1.85;
    return natural + (roadCut - natural) * (1 - corridor);
  }

  function buildTerrain() {
    const segments = 220;
    const size = 1400;
    const half = size / 2;
    const positions = new Float32Array((segments + 1) * (segments + 1) * 3);
    const colors = new Float32Array(positions.length);
    const indices = [];
    const c = new THREE.Color();
    let p = 0;
    for (let iz = 0; iz <= segments; iz++) {
      const z = -half + size * iz / segments;
      for (let ix = 0; ix <= segments; ix++) {
        const x = -half + size * ix / segments;
        const natural = terrainHeight(x, z);
        const closest = nearestRoad(x, z);
        const corridor = smoothstep(5.5, 24, closest.distance);
        const cut = closest.y - 1.85;
        const y = natural + (cut - natural) * (1 - corridor);
        positions[p] = x;
        positions[p + 1] = y;
        positions[p + 2] = z;
        const variation = 0.94 + 0.08 * Math.sin(x * 0.095 + z * 0.033) * Math.cos(z * 0.077);
        const altitude = clamp((y + 10) / 90, 0, 1);
        c.setHex(0x607953).lerp(new THREE.Color(0x87936a), 0.35 + altitude * 0.22).multiplyScalar(variation);
        colors[p] = c.r;
        colors[p + 1] = c.g;
        colors[p + 2] = c.b;
        p += 3;
      }
    }
    for (let z = 0; z < segments; z++) for (let x = 0; x < segments; x++) {
      const a = z * (segments + 1) + x;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    ground.receiveShadow = true;
    world.add(ground);
  }
  buildTerrain();

  function addDistantRidges() {
    const peakGeometry = new THREE.IcosahedronGeometry(1, 1);
    const peakMaterials = [material(0x63786d), material(0x708276), material(0x788979)];
    for (let i = 0; i < 19; i++) {
      const a = i / 19 * Math.PI * 2 + 0.16;
      const radius = range(590, 760);
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const height = range(82, 175);
      const peak = new THREE.Mesh(peakGeometry, peakMaterials[i % peakMaterials.length]);
      peak.position.set(x, terrainHeight(x, z) + height * 0.44, z);
      peak.scale.set(range(62, 118), height, range(66, 132));
      peak.rotation.y = range(0, Math.PI);
      peak.receiveShadow = true;
      world.add(peak);
    }
  }
  addDistantRidges();

  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 256;
  asphaltCanvas.height = 256;
  const asphaltCtx = asphaltCanvas.getContext('2d');
  asphaltCtx.fillStyle = '#454943';
  asphaltCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const shade = Math.floor(range(52, 83));
    asphaltCtx.fillStyle = `rgba(${shade},${shade + 2},${shade - 2},${range(0.04, 0.2)})`;
    const w = range(1, 5);
    asphaltCtx.fillRect(range(0, 256), range(0, 256), w, range(1, 2));
  }
  const asphaltTexture = new THREE.CanvasTexture(asphaltCanvas);
  asphaltTexture.wrapS = THREE.RepeatWrapping;
  asphaltTexture.wrapT = THREE.RepeatWrapping;
  asphaltTexture.colorSpace = THREE.SRGBColorSpace;
  asphaltTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const asphaltMaterial = new THREE.MeshStandardMaterial({ map: asphaltTexture, color: 0xb8b9ae, roughness: 0.98, metalness: 0 });
  const shoulderMaterial = material(0x777a6c, 1);

  function makeStrip(left, right, mat, lift = 0.035, longitudinalScale = 1) {
    const count = trackCount;
    const positions = new Float32Array((count + 1) * 2 * 3);
    const uvs = new Float32Array((count + 1) * 2 * 2);
    const indices = new Uint32Array(count * 6);
    for (let i = 0; i <= count; i++) {
      const sample = samples[i % count];
      const distance = i === count ? roadLength : sample.s;
      const offsets = [left, right];
      for (let side = 0; side < 2; side++) {
        const offset = offsets[side];
        const at = (i * 2 + side) * 3;
        positions[at] = sample.x + sample.rx * offset;
        positions[at + 1] = sample.y + lift;
        positions[at + 2] = sample.z + sample.rz * offset;
        const uv = (i * 2 + side) * 2;
        uvs[uv] = side;
        uvs[uv + 1] = distance / longitudinalScale;
      }
      if (i < count) {
        const a = i * 2;
        const b = a + 2;
        const at = i * 6;
        indices[at] = a; indices[at + 1] = a + 1; indices[at + 2] = b;
        indices[at + 3] = a + 1; indices[at + 4] = b + 1; indices[at + 5] = b;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.receiveShadow = true;
    world.add(mesh);
    return mesh;
  }
  makeStrip(-5.35, 5.35, shoulderMaterial, 0.012);
  makeStrip(-4.86, 4.86, asphaltMaterial, 0.035, 18);
  makeStrip(-4.43, -4.30, shared.roadLine, 0.064);
  makeStrip(4.30, 4.43, shared.roadLine, 0.064);

  function makeDashedLine(offset, width, dashLength, gap, mat) {
    const positions = [];
    const indices = [];
    const period = dashLength + gap;
    const dashCount = Math.floor(roadLength / period);
    for (let i = 0; i < dashCount; i++) {
      const a = frameAt(i * period);
      const b = frameAt(i * period + dashLength);
      const base = positions.length / 3;
      for (const frame of [a, b]) for (const side of [-1, 1]) {
        const d = offset + side * width / 2;
        positions.push(frame.point.x + frame.rightX * d, frame.point.y + 0.068, frame.point.z + frame.rightZ * d);
      }
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.receiveShadow = true;
    world.add(mesh);
  }
  makeDashedLine(-0.105, 0.09, 5.2, 7.2, shared.centerLine);
  makeDashedLine(0.105, 0.09, 5.2, 7.2, shared.centerLine);

  function buildRoadsidePosts() {
    const poleGeometry = new THREE.CylinderGeometry(0.048, 0.075, 0.88, 6);
    const reflectorGeometry = new THREE.BoxGeometry(0.18, 0.18, 0.11);
    const step = 28;
    const count = Math.floor(roadLength / step);
    const poles = new THREE.InstancedMesh(poleGeometry, shared.post, count * 2);
    const reflectors = new THREE.InstancedMesh(reflectorGeometry, shared.reflector, count * 2);
    const dummy = new THREE.Object3D();
    let index = 0;
    for (let i = 0; i < count; i++) {
      const frame = frameAt(i * step + 5);
      for (const side of [-1, 1]) {
        const x = frame.point.x + frame.rightX * side * 5.95;
        const z = frame.point.z + frame.rightZ * side * 5.95;
        const y = frame.point.y;
        dummy.position.set(x, y + 0.43, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, range(0.9, 1.15), 1);
        dummy.updateMatrix();
        poles.setMatrixAt(index, dummy.matrix);
        dummy.position.set(x, y + 0.56, z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        reflectors.setMatrixAt(index, dummy.matrix);
        index++;
      }
    }
    poles.count = index;
    reflectors.count = index;
    poles.instanceMatrix.needsUpdate = true;
    reflectors.instanceMatrix.needsUpdate = true;
    poles.castShadow = false;
    reflectors.castShadow = false;
    world.add(poles, reflectors);
  }
  buildRoadsidePosts();

  function combineShapes(parts) {
    const positions = [];
    const normals = [];
    const colors = [];
    for (const part of parts) {
      const position = part.geometry.getAttribute('position');
      const normal = part.geometry.getAttribute('normal');
      const index = part.geometry.index;
      const transform = new THREE.Matrix4().compose(part.position, part.quaternion || new THREE.Quaternion(), part.scale || new THREE.Vector3(1, 1, 1));
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
      const color = new THREE.Color(part.color);
      const addVertex = (id) => {
        const v = new THREE.Vector3(position.getX(id), position.getY(id), position.getZ(id)).applyMatrix4(transform);
        const n = new THREE.Vector3(normal.getX(id), normal.getY(id), normal.getZ(id)).applyMatrix3(normalMatrix).normalize();
        positions.push(v.x, v.y, v.z);
        normals.push(n.x, n.y, n.z);
        colors.push(color.r, color.g, color.b);
      };
      if (index) for (let i = 0; i < index.count; i++) addVertex(index.getX(i));
      else for (let i = 0; i < position.count; i++) addVertex(i);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
  const pineParts = [
    { geometry: new THREE.ConeGeometry(6.2, 10.2, 7), position: new THREE.Vector3(0, 8.2, 0), color: 0x315b43 },
    { geometry: new THREE.ConeGeometry(5.25, 9.2, 7), position: new THREE.Vector3(0, 12.2, 0), color: 0x3c694a },
    { geometry: new THREE.ConeGeometry(4.1, 8.2, 7), position: new THREE.Vector3(0, 16.1, 0), color: 0x426e4d },
  ];
  const pineFoliageGeometry = combineShapes(pineParts);
  const deciduousFoliageGeometry = combineShapes([
    { geometry: new THREE.IcosahedronGeometry(1, 1), position: new THREE.Vector3(0, 13, 0), scale: new THREE.Vector3(5.4, 5.2, 5.2), color: 0x54764e },
    { geometry: new THREE.IcosahedronGeometry(1, 1), position: new THREE.Vector3(-3.1, 11.5, 0.4), scale: new THREE.Vector3(3.5, 3.4, 3.8), color: 0x426d4b },
    { geometry: new THREE.IcosahedronGeometry(1, 1), position: new THREE.Vector3(2.9, 12.2, -0.6), scale: new THREE.Vector3(3.8, 3.6, 3.7), color: 0x638151 },
  ]);
  const trunkGeometry = new THREE.CylinderGeometry(0.24, 0.43, 1, 7, 1, false);
  trunkGeometry.translate(0, 0.5, 0);
  const foliageMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x88795e, roughness: 1 });
  const treeGrid = new Map();
  const treeCell = 22;
  const forestTiles = new Map();
  const forestTileSize = 280;
  let treeCount = 0;
  function registerTree(x, y, z) {
    const gx = Math.floor(x / treeCell);
    const gz = Math.floor(z / treeCell);
    const key = key2(gx, gz);
    if (!treeGrid.has(key)) treeGrid.set(key, []);
    treeGrid.get(key).push({ x, y, z });
  }
  function addForests() {
    const step = 11.8;
    for (let z = -646; z <= 646; z += step) for (let x = -646; x <= 646; x += step) {
      const px = x + range(-4.1, 4.1);
      const pz = z + range(-4.1, 4.1);
      const roadInfo = nearestRoad(px, pz);
      // Leave a clear verge; roadside trees begin just beyond the vehicle's safe shoulder.
      if (roadInfo.distance < 7.7 || random() < 0.035) continue;
      const py = terrainSurfaceHeight(px, pz, roadInfo);
      const scale = range(0.72, 1.17);
      const deciduous = random() < 0.17;
      const tileX = Math.floor((px + 700) / forestTileSize);
      const tileZ = Math.floor((pz + 700) / forestTileSize);
      const key = key2(tileX, tileZ);
      if (!forestTiles.has(key)) forestTiles.set(key, { pines: [], broadleaf: [], trunks: [] });
      const tile = forestTiles.get(key);
      const record = { x: px, y: py, z: pz, scale, deciduous };
      (deciduous ? tile.broadleaf : tile.pines).push(record);
      tile.trunks.push(record);
      registerTree(px, py, pz);
      treeCount++;
    }
    const dummy = new THREE.Object3D();
    for (const tile of forestTiles.values()) {
      const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, tile.trunks.length);
      trunks.castShadow = true;
      trunks.receiveShadow = false;
      tile.trunks.forEach((tree, i) => {
        dummy.position.set(tree.x, tree.y, tree.z);
        dummy.rotation.set(0, range(0, Math.PI * 2), 0);
        dummy.scale.set(tree.scale * 0.92, tree.scale * range(8.8, 12.3), tree.scale * 0.92);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
        const tint = new THREE.Color(0x8f795d).multiplyScalar(range(0.72, 1.12));
        trunks.setColorAt(i, tint);
      });
      trunks.instanceMatrix.needsUpdate = true;
      trunks.computeBoundingSphere();
      world.add(trunks);
      for (const [records, geometry] of [[tile.pines, pineFoliageGeometry], [tile.broadleaf, deciduousFoliageGeometry]]) {
        if (!records.length) continue;
        const mesh = new THREE.InstancedMesh(geometry, foliageMaterial, records.length);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        records.forEach((tree, i) => {
          dummy.position.set(tree.x, tree.y, tree.z);
          dummy.rotation.set(0, range(0, Math.PI * 2), 0);
          const size = tree.scale * range(0.91, 1.13);
          dummy.scale.set(size * range(0.9, 1.13), size, size * range(0.91, 1.12));
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          const palette = tree.deciduous ? [0xb2bc83, 0x9eae75, 0x829d68] : [0xa4b781, 0x91a976, 0x819c70];
          mesh.setColorAt(i, new THREE.Color(palette[Math.floor(random() * palette.length)]).multiplyScalar(range(0.84, 1.08)));
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        world.add(mesh);
      }
    }
  }
  addForests();

  function addGroundCover() {
    const shrubGeometry = new THREE.IcosahedronGeometry(1, 1);
    const shrubMaterial = new THREE.MeshStandardMaterial({ color: 0x6f8551, roughness: 1 });
    const shrubRecords = [];
    for (let i = 0; i < 2600; i++) {
      const x = range(-650, 650);
      const z = range(-650, 650);
      if (nearestRoad(x, z).distance < 8) continue;
      shrubRecords.push({ x, z, y: terrainSurfaceHeight(x, z), s: range(0.45, 1.65) });
    }
    const shrubs = new THREE.InstancedMesh(shrubGeometry, shrubMaterial, shrubRecords.length);
    const dummy = new THREE.Object3D();
    shrubRecords.forEach((plant, i) => {
      dummy.position.set(plant.x, plant.y + plant.s * 0.46, plant.z);
      dummy.rotation.set(range(-0.14, 0.14), range(0, 6.28), range(-0.14, 0.14));
      dummy.scale.set(plant.s * 1.2, plant.s * 0.68, plant.s);
      dummy.updateMatrix();
      shrubs.setMatrixAt(i, dummy.matrix);
      shrubs.setColorAt(i, new THREE.Color(random() < 0.5 ? 0x71814d : 0x87915b).multiplyScalar(range(0.78, 1.12)));
    });
    shrubs.instanceMatrix.needsUpdate = true;
    shrubs.computeBoundingSphere();
    shrubs.castShadow = false;
    world.add(shrubs);

    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rockMesh = new THREE.InstancedMesh(rockGeometry, shared.rock, 540);
    let rockCount = 0;
    for (let i = 0; i < 540; i++) {
      const x = range(-670, 670);
      const z = range(-670, 670);
      const nearest = nearestRoad(x, z);
      if (nearest.distance < 9) continue;
      const size = range(0.4, 2.5);
      dummy.position.set(x, terrainSurfaceHeight(x, z, nearest) + size * 0.36, z);
      dummy.rotation.set(range(-0.4, 0.4), range(0, 6.28), range(-0.4, 0.4));
      dummy.scale.set(size * 1.4, size * 0.7, size);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(rockCount, dummy.matrix);
      rockMesh.setColorAt(rockCount, new THREE.Color(0x7c7c6d).multiplyScalar(range(0.72, 1.15)));
      rockCount++;
    }
    rockMesh.count = rockCount;
    rockMesh.instanceMatrix.needsUpdate = true;
    rockMesh.computeBoundingSphere();
    rockMesh.castShadow = false;
    world.add(rockMesh);
  }
  addGroundCover();

  function addGrassTufts() {
    const geometry = combineShapes([
      { geometry: new THREE.ConeGeometry(0.19, 1.1, 4), position: new THREE.Vector3(-0.13, 0.55, 0), color: 0x88905b },
      { geometry: new THREE.ConeGeometry(0.16, 0.82, 4), position: new THREE.Vector3(0.15, 0.41, 0.08), color: 0xa0a16a },
    ]);
    const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const count = 6800;
    const grass = new THREE.InstancedMesh(geometry, grassMat, count);
    const dummy = new THREE.Object3D();
    let written = 0;
    for (let i = 0; i < count; i++) {
      const x = range(-660, 660);
      const z = range(-660, 660);
      if (nearestRoad(x, z).distance < 7.8) continue;
      const size = range(0.65, 1.55);
      dummy.position.set(x, terrainSurfaceHeight(x, z), z);
      dummy.rotation.set(0, range(0, 6.28), 0);
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      grass.setMatrixAt(written, dummy.matrix);
      grass.setColorAt(written, new THREE.Color(random() < 0.5 ? 0x8e9b65 : 0xb4a871).multiplyScalar(range(0.72, 1.12)));
      written++;
    }
    grass.count = written;
    grass.instanceMatrix.needsUpdate = true;
    grass.computeBoundingSphere();
    grass.castShadow = false;
    world.add(grass);
  }
  addGrassTufts();

  const carBodyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.27, 14, 1, false);
  const wheelHubGeometry = new THREE.CylinderGeometry(0.19, 0.19, 0.285, 12, 1, false);
  function addBox(parent, size, position, mat, rotation = null) {
    const mesh = new THREE.Mesh(carBodyGeometry, mat);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function createCar(color, type = 'wagon', playerCar = false) {
    const root = new THREE.Group();
    const shell = new THREE.Group();
    root.add(shell);
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.43, metalness: 0.18 });
    const roofPaint = new THREE.MeshStandardMaterial({ color: playerCar ? 0xd4d0bd : color, roughness: 0.48, metalness: 0.11 });
    const isSuv = type === 'suv';
    const isPickup = type === 'pickup';
    const roofY = isSuv ? 1.77 : 1.62;
    addBox(shell, [1.97, 0.46, 4.34], [0, 0.66, 0.02], paint);
    addBox(shell, [1.9, 0.24, 1.55], [0, 0.83, -1.28], paint);
    addBox(shell, [1.86, 0.25, 0.78], [0, 0.82, 1.69], paint);
    if (isPickup) {
      addBox(shell, [1.72, 0.23, 0.94], [0, 0.9, 1.25], shared.grille);
    }
    const cabinLength = isPickup ? 1.7 : (isSuv ? 2.25 : 2.12);
    addBox(shell, [1.63, 0.74, cabinLength], [0, 1.22 + (isSuv ? 0.08 : 0), 0.02], paint);
    addBox(shell, [1.52, 0.11, cabinLength * 0.84], [0, roofY, 0.02], roofPaint);
    const sideY = isSuv ? 1.36 : 1.3;
    const sideWindowLength = isPickup ? 1.2 : 1.58;
    for (const side of [-1, 1]) {
      addBox(shell, [0.035, 0.43, sideWindowLength], [side * 0.825, sideY, -0.02], shared.window, [0.04, 0, 0]);
      addBox(shell, [0.07, 0.08, 0.74], [side * 0.91, 0.99, -1.18], paint);
      addBox(shell, [0.13, 0.08, 0.33], [side * 0.94, 1.0, 0.06], shared.grille);
      addBox(shell, [0.16, 0.12, 0.36], [side * 0.88, 0.73, -2.18], shared.headlamp);
      addBox(shell, [0.15, 0.14, 0.16], [side * 0.89, 0.72, 2.18], shared.tailLamp);
      const mirror = addBox(shell, [0.18, 0.14, 0.24], [side * 1.02, 1.12, -0.84], paint);
      mirror.rotation.y = side * 0.14;
    }
    addBox(shell, [1.48, 0.45, 0.045], [0, 1.34, -0.87], shared.window, [-0.23, 0, 0]);
    addBox(shell, [1.42, 0.4, 0.045], [0, 1.34, 0.89], shared.window, [0.2, 0, 0]);
    addBox(shell, [0.56, 0.19, 0.09], [0, 0.72, -2.205], shared.grille);
    addBox(shell, [2.02, 0.13, 0.15], [0, 0.49, -2.15], shared.grille);
    addBox(shell, [2.02, 0.14, 0.16], [0, 0.48, 2.13], shared.grille);
    const wheels = [];
    for (const z of [-1.43, 1.43]) for (const x of [-1.02, 1.02]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.39, z);
      root.add(pivot);
      const tire = new THREE.Mesh(wheelGeometry, shared.tire);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      tire.receiveShadow = true;
      pivot.add(tire);
      const hub = new THREE.Mesh(wheelHubGeometry, shared.rim);
      hub.rotation.z = Math.PI / 2;
      hub.castShadow = true;
      pivot.add(hub);
      wheels.push({ pivot, tire, front: z < 0 });
    }
    return { root, shell, wheels, type, roofY };
  }

  const playerCar = createCar(0x527c76, 'wagon', true);
  playerCar.root.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  world.add(playerCar.root);

  const trafficColors = [0xb87954, 0x596c77, 0xc2b893, 0x7e564e, 0x788260, 0x9ca2a0, 0x596c91, 0xa36f4b, 0x4f625e];
  const trafficTypes = ['sedan', 'wagon', 'suv', 'pickup'];
  const traffic = [];
  const trafficCount = 8;
  for (let i = 0; i < trafficCount; i++) {
    const car = createCar(trafficColors[i % trafficColors.length], trafficTypes[i % trafficTypes.length], false);
    car.root.traverse((object) => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; } });
    world.add(car.root);
    traffic.push({ car, s: roadLength * (0.074 + i / trafficCount), speed: range(9.5, 12.2), phase: range(0, Math.PI * 2) });
  }

  const state = { mode: 'menu', speed: 0, lateral: 2.05, lateralSpeed: 0, progress: 0, worldX: 0, worldZ: 0, yaw: 0, distance: 0, time: 0, collisionTimer: 0 };
  const input = new Set();
  const tiltControl = { active: false, pending: false, calibrated: false, neutral: 0, filtered: null, roll: null, steer: 0, lastEvent: 0 };
  const maxOffset = 4.08;
  function wrapDistance(value) { return THREE.MathUtils.euclideanModulo(value, roadLength); }
  function projectToRoad(x, z, expectedDistance) {
    const expectedIndex = Math.round(wrapDistance(expectedDistance) / roadLength * trackCount);
    let best = samples[0];
    let bestSq = Infinity;
    for (let offset = -22; offset <= 22; offset++) {
      const index = THREE.MathUtils.euclideanModulo(expectedIndex + offset, trackCount);
      const sample = samples[index];
      const dx = x - sample.x;
      const dz = z - sample.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < bestSq) { bestSq = distanceSq; best = sample; }
    }
    const along = (x - best.x) * best.tx + (z - best.z) * best.tz;
    const distance = wrapDistance(best.s + along);
    const frame = frameAt(distance);
    const lateral = (x - frame.point.x) * frame.rightX + (z - frame.point.z) * frame.rightZ;
    return { distance, lateral, frame, distanceFromRoad: Math.sqrt(bestSq) };
  }
  function resetPlayerPose() {
    const frame = frameAt(0);
    state.progress = 0;
    state.lateral = 2.05;
    state.worldX = frame.point.x + frame.rightX * state.lateral;
    state.worldZ = frame.point.z + frame.rightZ * state.lateral;
    state.yaw = frame.yaw;
    state.lateralSpeed = 0;
  }
  function placePlayer(bounce = 0, roll = 0) {
    const frame = frameAt(state.progress);
    playerCar.root.position.set(state.worldX, frame.point.y + bounce, state.worldZ);
    playerCar.root.rotation.order = 'YXZ';
    playerCar.root.rotation.set(frame.grade, state.yaw, roll);
    playerCar.shell.position.y = 0;
    playerCar.shell.rotation.x = frame.grade * 0.07;
    for (const wheel of playerCar.wheels) {
      wheel.tire.rotation.x = -state.speed * 0.085;
      wheel.pivot.rotation.y = wheel.front ? -steeringAngle : 0;
    }
    return { frame, x: state.worldX, z: state.worldZ };
  }

  let steeringAngle = 0;
  function collideWithTree(playerX, playerZ, yaw) {
    const gx = Math.floor(playerX / treeCell);
    const gz = Math.floor(playerZ / treeCell);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = -fz;
    const rz = fx;
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const list = treeGrid.get(key2(gx + ox, gz + oz));
      if (!list) continue;
      for (const tree of list) {
        const dx = tree.x - playerX;
        const dz = tree.z - playerZ;
        const along = dx * fx + dz * fz;
        const across = dx * rx + dz * rz;
        if (Math.abs(along) < 2.15 + 0.5 && Math.abs(across) < 0.96 + 0.5) return Math.sign(across) || 1;
      }
    }
    return 0;
  }

  function simulate(dt) {
    if (state.mode !== 'driving') return;
    state.time += dt;
    state.collisionTimer = Math.max(0, state.collisionTimer - dt);
    if (tiltControl.active && performance.now() - tiltControl.lastEvent > 900) {
      tiltControl.steer = THREE.MathUtils.damp(tiltControl.steer, 0, 8, dt);
      if (tiltControl.lastEvent && performance.now() - tiltControl.lastEvent > 2600) setGyroStatus('NO SENSOR · USE ARROWS');
    }
    const accelerate = input.has('KeyW') ? 1 : 0;
    const reverse = input.has('KeyS') ? 1 : 0;
    const handbrake = input.has('Space');
    const steering = clamp((input.has('KeyD') ? 1 : 0) - (input.has('KeyA') ? 1 : 0) + tiltControl.steer, -1, 1);
    if (accelerate) {
      if (state.speed < -0.5) state.speed = Math.min(0, state.speed + 18 * dt);
      else state.speed += 10.8 * dt;
    } else if (reverse) {
      if (state.speed > 0.5) state.speed = Math.max(0, state.speed - 20 * dt);
      else state.speed -= 7.4 * dt;
    } else {
      state.speed -= Math.sign(state.speed) * (0.48 + 0.0028 * state.speed * state.speed) * dt;
      if (Math.abs(state.speed) < 0.12) state.speed = 0;
    }
    state.speed = clamp(state.speed, -10.5, 31.5);
    if (handbrake) state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), 14 * dt);

    const speedFactor = clamp(Math.abs(state.speed) / 8, 0, 1);
    const oldLateral = state.lateral;
    steeringAngle = THREE.MathUtils.damp(steeringAngle, steering * 0.49 / (1 + Math.abs(state.speed) * 0.035), 9, dt);
    const maxYawRate = Math.min(1.35, 5.4 / Math.max(3, Math.abs(state.speed)));
    const yawRate = clamp(-Math.tan(steeringAngle) * state.speed / 2.8, -maxYawRate, maxYawRate);
    state.yaw = THREE.MathUtils.euclideanModulo(state.yaw + yawRate * dt + Math.PI, Math.PI * 2) - Math.PI;
    state.worldX += -Math.sin(state.yaw) * state.speed * dt;
    state.worldZ += -Math.cos(state.yaw) * state.speed * dt;
    const projection = projectToRoad(state.worldX, state.worldZ, state.progress + state.speed * dt);
    state.progress = projection.distance;
    state.lateral = projection.lateral;
    state.lateralSpeed = (state.lateral - oldLateral) / dt;
    if (Math.abs(state.lateral) > maxOffset) {
      state.lateral = clamp(state.lateral, -maxOffset, maxOffset);
      state.worldX = projection.frame.point.x + projection.frame.rightX * state.lateral;
      state.worldZ = projection.frame.point.z + projection.frame.rightZ * state.lateral;
      if (Math.sign(state.lateralSpeed) === Math.sign(projection.lateral)) state.speed *= 0.965;
      state.lateralSpeed = 0;
    }
    state.distance += Math.abs(state.speed) * dt;

    for (const npc of traffic) {
      const frame = frameAt(npc.s);
      const before = frameAt(npc.s - 4.5);
      const after = frameAt(npc.s + 4.5);
      const turn = Math.acos(clamp(before.tx * after.tx + before.tz * after.tz, -1, 1));
      const curvature = turn / 9;
      let desired = npc.speed * (0.76 + 0.24 * Math.sin(state.time * 0.18 + npc.phase));
      desired *= clamp(1.12 - curvature * 7.5, 0.68, 1);
      let nearestAhead = roadLength;
      for (const other of traffic) if (other !== npc) {
        const gap = wrapDistance(npc.s - other.s);
        if (gap > 0.01) nearestAhead = Math.min(nearestAhead, gap);
      }
      if (nearestAhead < 66) desired *= clamp((nearestAhead - 13) / 53, 0.08, 1);
      npc.currentSpeed = THREE.MathUtils.damp(npc.currentSpeed ?? npc.speed, desired, 1.1, dt);
      npc.s = wrapDistance(npc.s - npc.currentSpeed * dt);
    }

    const playerPlacement = placePlayer(
      Math.sin(state.time * 7 + Math.abs(state.speed) * 0.12) * Math.min(0.045, Math.abs(state.speed) * 0.0018),
      clamp(-steeringAngle * speedFactor * 0.22, -0.12, 0.12),
    );

    const treeSide = state.collisionTimer === 0 ? collideWithTree(playerPlacement.x, playerPlacement.z, state.yaw) : 0;
    if (treeSide) {
      state.speed *= 0.24;
      state.lateralSpeed -= treeSide * 0.65;
      state.collisionTimer = 0.85;
    }
    if (state.collisionTimer === 0) for (const npc of traffic) {
      const along = Math.abs(wrapDistance(state.progress - npc.s));
      const separation = Math.min(along, roadLength - along);
      if (separation < 3.9 && Math.abs(state.lateral + 2.08) < 1.65) {
        state.speed *= 0.27;
        state.lateralSpeed += 0.85;
        state.collisionTimer = 1.05;
        break;
      }
    }
  }

  function positionTraffic() {
    for (const npc of traffic) {
      const frame = frameAt(npc.s);
      const reverseYaw = frame.yaw + Math.PI;
      const x = frame.point.x - frame.rightX * 2.08;
      const z = frame.point.z - frame.rightZ * 2.08;
      npc.car.root.position.set(x, frame.point.y, z);
      npc.car.root.rotation.order = 'YXZ';
      npc.car.root.rotation.set(-frame.grade, reverseYaw, 0);
      for (const wheel of npc.car.wheels) {
        wheel.tire.rotation.x = (npc.currentSpeed || npc.speed) * 0.085;
        wheel.pivot.rotation.y = 0;
      }
    }
  }
  resetPlayerPose();
  placePlayer();
  positionTraffic();

  const hud = {
    brand: $('#brand'), topRight: $('#topRight'), hint: $('#drivingHint'), speed: $('#speed'), gear: $('#gear'),
    overlay: $('#overlay'), panel: $('#panel'), eyebrow: $('#eyebrow'), title: $('#title'), description: $('#description'),
    action: $('#action'), guide: $('#controlGuide'), finePrint: $('#finePrint'), mouseNote: $('#mouseNote'),
    speedPanel: $('#speedPanel'), audio: $('#audio'), gyroStatus: $('#gyroStatus'), gyroDot: $('#gyroDot'),
  };
  const cameraState = { yaw: 0, pitch: 0.22, distance: 11.8, dragging: false, lastX: 0, lastY: 0, noteTimer: 0, touches: new Map(), pinchDistance: null };
  const cameraTarget = new THREE.Vector3();
  const cameraDesired = new THREE.Vector3();
  function touchDevice() {
    return navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse), (any-pointer:coarse)').matches;
  }
  function showCameraHelp() {
    hud.mouseNote.textContent = touchDevice()
      ? 'Drag to look · pinch to zoom'
      : 'Click to capture mouse · Esc to release · scroll to adjust distance';
  }
  function pinchDistance() {
    const points = [...cameraState.touches.values()];
    if (points.length < 2) return null;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }
  function setGyroStatus(message, ready = false) {
    hud.gyroStatus.textContent = message;
    hud.gyroDot.classList.toggle('ready', ready);
  }
  function readScreenRoll(event) {
    if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return null;
    const beta = THREE.MathUtils.degToRad(event.beta);
    const gamma = THREE.MathUtils.degToRad(event.gamma);
    const gravityX = -Math.sin(gamma) * Math.cos(beta);
    const gravityY = Math.sin(beta);
    const gravityZ = Math.cos(gamma) * Math.cos(beta);
    const screenAngle = ((window.screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
    const angle = THREE.MathUtils.degToRad(screenAngle);
    const screenHorizontalGravity = gravityX * Math.cos(angle) - gravityY * Math.sin(angle);
    return THREE.MathUtils.radToDeg(Math.atan2(screenHorizontalGravity, gravityZ));
  }
  function handleDeviceOrientation(event) {
    const roll = readScreenRoll(event);
    if (roll === null) return;
    tiltControl.roll = roll;
    tiltControl.lastEvent = performance.now();
    tiltControl.filtered = tiltControl.filtered === null ? roll : THREE.MathUtils.damp(tiltControl.filtered, roll, 12, 1 / 60);
    if (!tiltControl.calibrated) {
      tiltControl.neutral = tiltControl.filtered;
      tiltControl.calibrated = true;
      setGyroStatus('GYRO READY · TILT TO STEER', true);
    }
    const offset = tiltControl.filtered - tiltControl.neutral;
    const deadZone = 2.2;
    const normalizedTilt = Math.sign(offset) * clamp((Math.abs(offset) - deadZone) / 19, 0, 1);
    tiltControl.steer = normalizedTilt;
    if (Math.abs(normalizedTilt) > 0.16) setGyroStatus(normalizedTilt > 0 ? 'TILT RIGHT' : 'TILT LEFT', true);
    else if (tiltControl.calibrated) setGyroStatus('GYRO READY · TILT TO STEER', true);
  }
  async function enableGyroscope() {
    if (tiltControl.active || tiltControl.pending) return;
    if (!('DeviceOrientationEvent' in window)) {
      setGyroStatus('NO GYRO · USE ARROWS');
      return;
    }
    tiltControl.pending = true;
    try {
      const Orientation = window.DeviceOrientationEvent;
      if (typeof Orientation.requestPermission === 'function') {
        const permission = await Orientation.requestPermission();
        if (permission !== 'granted') {
          setGyroStatus('GYRO OFF · USE ARROWS');
          return;
        }
      }
      window.addEventListener('deviceorientation', handleDeviceOrientation, true);
      tiltControl.active = true;
      setGyroStatus('WAITING FOR GYRO');
      setTimeout(() => {
        if (tiltControl.active && tiltControl.roll === null) setGyroStatus('NO SENSOR · USE ARROWS');
      }, 2600);
    } catch (error) {
      setGyroStatus('GYRO OFF · USE ARROWS');
    } finally {
      tiltControl.pending = false;
    }
  }
  function calibrateGyroscope() {
    if (tiltControl.filtered === null) {
      setGyroStatus(tiltControl.active ? 'HOLD STILL · TRY AGAIN' : 'START DRIVE TO ENABLE GYRO');
      return;
    }
    tiltControl.neutral = tiltControl.filtered;
    tiltControl.calibrated = true;
    tiltControl.steer = 0;
    setGyroStatus('CENTER SET · TILT TO STEER', true);
  }
  function updateCamera(dt) {
    const frame = frameAt(state.progress);
    const px = state.worldX;
    const py = frame.point.y;
    const pz = state.worldZ;
    const heading = state.yaw + cameraState.yaw;
    const horizontal = Math.cos(cameraState.pitch) * cameraState.distance;
    cameraDesired.set(px + Math.sin(heading) * horizontal, py + 1.65 + Math.sin(cameraState.pitch) * cameraState.distance, pz + Math.cos(heading) * horizontal);
    cameraDesired.y = Math.max(cameraDesired.y, terrainHeight(cameraDesired.x, cameraDesired.z) + 2.2);
    camera.position.lerp(cameraDesired, 1 - Math.exp(-dt * 5.6));
    cameraTarget.set(px - Math.sin(state.yaw) * 1.8, py + 1.05, pz - Math.cos(state.yaw) * 1.8);
    camera.lookAt(cameraTarget);
  }

  let audioContext = null;
  let engineOscillator = null;
  let engineGain = null;
  let windGain = null;
  let audioEnabled = true;
  function startAudio() {
    if (audioContext) { audioContext.resume(); return; }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) { hud.audio.style.opacity = '0.45'; return; }
    audioContext = new AudioCtor();
    const engineFilter = audioContext.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 180;
    engineOscillator = audioContext.createOscillator();
    engineOscillator.type = 'sawtooth';
    engineOscillator.frequency.value = 42;
    engineGain = audioContext.createGain();
    engineGain.gain.value = 0;
    engineOscillator.connect(engineFilter).connect(engineGain).connect(audioContext.destination);
    engineOscillator.start();

    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.28;
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = audioContext.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    windGain = audioContext.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(audioContext.destination);
    noise.start();
  }
  function setAudio(enabled) {
    audioEnabled = enabled;
    if (!audioContext) startAudio();
    if (!audioContext) return;
    audioContext.resume();
    const now = audioContext.currentTime;
    windGain.gain.cancelScheduledValues(now);
    engineGain.gain.cancelScheduledValues(now);
    windGain.gain.setTargetAtTime(enabled ? 0.047 : 0, now, 0.25);
    engineGain.gain.setTargetAtTime(enabled && state.mode === 'driving' ? 0.017 : 0, now, 0.2);
    hud.audio.style.color = enabled ? '#c9d9b0' : '';
    hud.audio.setAttribute('aria-pressed', String(enabled));
  }
  function updateAudio() {
    if (!audioContext || !engineOscillator) return;
    engineOscillator.frequency.setTargetAtTime(40 + Math.abs(state.speed) * 2.05 + (input.has('KeyW') ? 8 : 0), audioContext.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(audioEnabled && state.mode === 'driving' ? 0.014 + Math.abs(state.speed) * 0.00028 : 0, audioContext.currentTime, 0.15);
  }

  function clearKeys() { input.clear(); }
  function showPause() {
    if (state.mode !== 'driving') return;
    state.mode = 'paused';
    clearKeys();
    hud.eyebrow.textContent = 'THE RIDGE WILL WAIT';
    hud.title.innerHTML = 'Take a<br><em>breather.</em>';
    hud.description.textContent = 'You are right where you left the road. The trees are still, the engine is quiet, and there is nowhere else you need to be.';
    hud.action.innerHTML = 'BACK TO THE DRIVE <span>↗</span>';
    hud.guide.style.display = 'none';
    hud.finePrint.textContent = 'Press P or Escape to continue';
    hud.overlay.classList.remove('hidden');
    hud.mouseNote.classList.remove('show');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    updateAudio();
  }
  function resumeDrive() {
    if (state.mode !== 'paused') return;
    state.mode = 'driving';
    hud.overlay.classList.add('hidden');
    hud.guide.style.display = '';
    showCameraHelp();
    hud.mouseNote.classList.add('show');
    clearTimeout(cameraState.noteTimer);
    cameraState.noteTimer = setTimeout(() => hud.mouseNote.classList.remove('show'), 5200);
    updateAudio();
  }
  function beginDrive() {
    if (state.mode === 'paused') { resumeDrive(); return; }
    state.mode = 'driving';
    state.speed = 0;
    resetPlayerPose();
    placePlayer();
    state.distance = 0;
    state.time = 0;
    cameraState.yaw = 0;
    cameraState.pitch = 0.22;
    hud.overlay.classList.add('hidden');
    hud.brand.classList.add('show');
    hud.topRight.classList.add('show');
    hud.hint.classList.add('show');
    hud.speedPanel.classList.add('show');
    showCameraHelp();
    hud.mouseNote.classList.add('show');
    clearTimeout(cameraState.noteTimer);
    cameraState.noteTimer = setTimeout(() => hud.mouseNote.classList.remove('show'), 6500);
    startAudio();
    if (audioEnabled && audioContext) setAudio(true);
    if (touchDevice()) enableGyroscope();
  }
  function resetCar() {
    state.speed = 0;
    resetPlayerPose();
    placePlayer();
    state.collisionTimer = 1;
    cameraState.yaw = 0;
    cameraState.pitch = 0.22;
    clearKeys();
  }
  hud.action.addEventListener('click', beginDrive);
  $('#pause').addEventListener('click', () => state.mode === 'paused' ? resumeDrive() : showPause());
  hud.audio.addEventListener('click', () => setAudio(!audioEnabled));
  $('#gyroCalibrate').addEventListener('click', calibrateGyroscope);

  function rotateCamera(dx, dy) {
    cameraState.yaw -= dx * 0.0024;
    cameraState.pitch = clamp(cameraState.pitch - dy * 0.0019, -0.06, 0.82);
  }
  canvas.addEventListener('click', () => {
    if (state.mode === 'driving' && document.pointerLockElement !== canvas && canvas.requestPointerLock && matchMedia('(pointer:fine)').matches) {
      const result = canvas.requestPointerLock();
      if (result && result.catch) result.catch(() => {});
    }
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (document.pointerLockElement === canvas || state.mode !== 'driving') return;
    if (event.pointerType === 'touch') {
      cameraState.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      cameraState.pinchDistance = pinchDistance();
      cameraState.dragging = cameraState.touches.size === 1;
      cameraState.lastX = event.clientX;
      cameraState.lastY = event.clientY;
      if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
      return;
    }
    cameraState.dragging = true;
    cameraState.lastX = event.clientX;
    cameraState.lastY = event.clientY;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (state.mode !== 'driving') return;
    if (document.pointerLockElement === canvas) rotateCamera(event.movementX || 0, event.movementY || 0);
    else if (event.pointerType === 'touch' && cameraState.touches.has(event.pointerId)) {
      const previous = cameraState.touches.get(event.pointerId);
      cameraState.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (cameraState.touches.size >= 2) {
        const nextDistance = pinchDistance();
        if (cameraState.pinchDistance !== null && nextDistance !== null) {
          cameraState.distance = clamp(cameraState.distance - (nextDistance - cameraState.pinchDistance) * 0.025, 7, 19);
        }
        cameraState.pinchDistance = nextDistance;
      } else {
        rotateCamera(event.clientX - previous.x, event.clientY - previous.y);
      }
    }
    else if (cameraState.dragging) {
      rotateCamera(event.clientX - cameraState.lastX, event.clientY - cameraState.lastY);
      cameraState.lastX = event.clientX;
      cameraState.lastY = event.clientY;
    }
  });
  const stopDragging = (event) => {
    cameraState.dragging = false;
    if (event?.pointerId !== undefined) cameraState.touches.delete(event.pointerId);
    cameraState.pinchDistance = pinchDistance();
    if (cameraState.touches.size === 1) {
      const point = cameraState.touches.values().next().value;
      cameraState.lastX = point.x;
      cameraState.lastY = point.y;
      cameraState.dragging = true;
    }
  };
  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);
  canvas.addEventListener('lostpointercapture', stopDragging);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraState.distance = clamp(cameraState.distance + Math.sign(event.deltaY) * 0.9, 7, 19);
  }, { passive: false });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) hud.mouseNote.classList.remove('show');
    else if (state.mode === 'driving') {
      showCameraHelp();
      hud.mouseNote.classList.add('show');
      clearTimeout(cameraState.noteTimer);
      cameraState.noteTimer = setTimeout(() => hud.mouseNote.classList.remove('show'), 4300);
    }
  });

  window.addEventListener('keydown', (event) => {
    const controlled = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyR', 'KeyP', 'Escape'];
    if (controlled.includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'Escape') {
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      } else if (state.mode === 'driving') showPause();
      else if (state.mode === 'paused') resumeDrive();
      return;
    }
    if (event.code === 'KeyP') {
      if (state.mode === 'driving') showPause(); else if (state.mode === 'paused') resumeDrive();
      return;
    }
    if (event.code === 'KeyR' && state.mode === 'driving') { resetCar(); return; }
    if (state.mode === 'driving' && controlled.includes(event.code)) input.add(event.code);
    if (event.code === 'Enter' && state.mode === 'menu') beginDrive();
  });
  window.addEventListener('keyup', (event) => input.delete(event.code));
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.mode === 'driving') showPause(); });
  document.querySelectorAll('[data-key]').forEach((button) => {
    const code = button.dataset.key;
    const down = (event) => {
      event.preventDefault();
      if (state.mode === 'driving') input.add(code);
      if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
    };
    const up = (event) => { event.preventDefault(); input.delete(code); };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  });

  function updateHud() {
    const kph = Math.round(Math.abs(state.speed) * 3.6);
    hud.speed.textContent = String(kph).padStart(2, '0');
    hud.gear.textContent = state.speed < -0.35 ? 'REVERSE' : (Math.abs(state.speed) < 0.35 ? 'PARK' : 'SCENIC DRIVE');
  }
  let last = performance.now();
  let accumulator = 0;
  const fixedStep = 1 / 60;
  function animate(now) {
    requestAnimationFrame(animate);
    const elapsed = Math.min((now - last) / 1000, 0.06);
    last = now;
    accumulator = Math.min(accumulator + elapsed, 0.14);
    while (accumulator >= fixedStep) {
      simulate(fixedStep);
      accumulator -= fixedStep;
    }
    positionTraffic();
    const shadowFocus = frameAt(state.progress);
    sun.target.position.set(state.worldX, shadowFocus.point.y, state.worldZ);
    sun.position.set(state.worldX - 180, shadowFocus.point.y + 260, state.worldZ + 130);
    updateCamera(elapsed);
    updateHud();
    updateAudio();
    renderer.render(scene, camera);
  }
  updateCamera(1);
  requestAnimationFrame(animate);

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.55));
  });
})();
