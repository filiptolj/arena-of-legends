import * as THREE from 'three';
import { MAP, type Vec2, pointInPolygon } from '@lol/shared';
import type { FogOfWar } from './fog';
import { mulberry32 } from './util';

const TEX_SIZE = 2048;

/** Paints the ground: grass, lanes, river and base platforms. Reused for the minimap. */
export function paintGroundCanvas(size = TEX_SIZE): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const k = size / MAP.size;
  const rand = mulberry32(7);

  g.fillStyle = '#2f5a2a';
  g.fillRect(0, 0, size, size);
  // Grass variation.
  for (let i = 0; i < 2500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = (2 + rand() * 6) * k;
    g.fillStyle = rand() < 0.5 ? 'rgba(70,120,50,0.25)' : 'rgba(25,55,25,0.25)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // River along the top-left → bottom-right diagonal.
  g.lineCap = 'round';
  g.strokeStyle = '#2b6f86';
  g.lineWidth = MAP.riverWidth * k;
  g.beginPath();
  g.moveTo(30 * k, 30 * k);
  g.lineTo(170 * k, 170 * k);
  g.stroke();
  g.strokeStyle = 'rgba(120,200,220,0.25)';
  g.lineWidth = MAP.riverWidth * 0.5 * k;
  g.stroke();

  // Lanes.
  const strokeLanes = (color: string, width: number) => {
    g.strokeStyle = color;
    g.lineWidth = width * k;
    g.lineJoin = 'round';
    for (const path of Object.values(MAP.lanePaths)) {
      g.beginPath();
      path.forEach((p, i) => (i === 0 ? g.moveTo(p.x * k, p.y * k) : g.lineTo(p.x * k, p.y * k)));
      g.stroke();
    }
  };
  strokeLanes('#6b5a3a', MAP.laneWidth + 2);
  strokeLanes('#8a7550', MAP.laneWidth - 2);
  for (let i = 0; i < 1500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.fillStyle = 'rgba(60,45,25,0.08)';
    g.beginPath();
    g.arc(x, y, (0.5 + rand()) * k, 0, Math.PI * 2);
    g.fill();
  }

  // Base platforms.
  for (const [team, f] of Object.entries(MAP.fountains)) {
    const nexus = MAP.structures.find((s) => s.kind === 'nexus' && s.team === team)!.pos;
    const grad = g.createRadialGradient(nexus.x * k, nexus.y * k, 0, nexus.x * k, nexus.y * k, 30 * k);
    grad.addColorStop(0, team === 'blue' ? '#7c8aa8' : '#a88c7c');
    grad.addColorStop(0.7, team === 'blue' ? '#55607a' : '#7a5f55');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(nexus.x * k, nexus.y * k, 30 * k, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = team === 'blue' ? 'rgba(80,150,255,0.35)' : 'rgba(255,90,90,0.35)';
    g.beginPath();
    g.arc(f.x * k, f.y * k, MAP.fountainRadius * k, 0, Math.PI * 2);
    g.fill();
  }

  // Brush footprints.
  g.fillStyle = '#3c6a2a';
  for (const poly of MAP.brushes) {
    g.beginPath();
    poly.forEach((p, i) => (i === 0 ? g.moveTo(p.x * k, p.y * k) : g.lineTo(p.x * k, p.y * k)));
    g.closePath();
    g.fill();
  }

  // Rock footprints.
  g.fillStyle = '#1d2a1a';
  for (const poly of MAP.rocks) {
    g.beginPath();
    poly.forEach((p, i) => (i === 0 ? g.moveTo(p.x * k, p.y * k) : g.lineTo(p.x * k, p.y * k)));
    g.closePath();
    g.fill();
  }
  return c;
}

function buildRock(poly: Vec2[], height: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.8,
    bevelSize: 0.8,
    bevelSegments: 1,
  });
  // Shape lies in XY; rotate so Y becomes world Z and extrusion points up.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Scatter trees inside a polygon. */
function scatterInPolygon(poly: Vec2[], count: number, rand: () => number): Vec2[] {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: Vec2[] = [];
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const p = { x: x0 + rand() * (x1 - x0), y: y0 + rand() * (y1 - y0) };
    if (pointInPolygon(p, poly)) out.push(p);
  }
  return out;
}

export interface MapView {
  /** One grass mesh per brush (same order as MAP.brushes), faded when the player stands inside. */
  brushes: THREE.InstancedMesh[];
}

export function buildMap(scene: THREE.Scene, fog: FogOfWar): MapView {
  const root = new THREE.Group();
  scene.add(root);
  const groundTex = new THREE.CanvasTexture(paintGroundCanvas());
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 8;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.size, MAP.size).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }),
  );
  ground.position.set(MAP.size / 2, 0, MAP.size / 2);
  ground.receiveShadow = true;
  root.add(ground);

  // Surroundings beyond the playable area.
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.size * 4, MAP.size * 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1a2a17, roughness: 1 }),
  );
  outer.position.set(MAP.size / 2, -0.05, MAP.size / 2);
  root.add(outer);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a5244, roughness: 0.9, flatShading: true });
  const rand = mulberry32(42);
  const treePositions: Vec2[] = [];

  for (const poly of MAP.rocks) {
    root.add(buildRock(poly, 2.5, rockMat));
    treePositions.push(...scatterInPolygon(poly, 14, rand));
  }

  // Border walls: a ring of cliffs just outside the walkable area.
  const b = MAP.boundary - 1;
  const s = MAP.size;
  const borders: Vec2[][] = [
    [{ x: -10, y: -10 }, { x: s + 10, y: -10 }, { x: s + 10, y: b }, { x: -10, y: b }],
    [{ x: -10, y: s - b }, { x: s + 10, y: s - b }, { x: s + 10, y: s + 10 }, { x: -10, y: s + 10 }],
    [{ x: -10, y: b }, { x: b, y: b }, { x: b, y: s - b }, { x: -10, y: s - b }],
    [{ x: s - b, y: b }, { x: s + 10, y: b }, { x: s + 10, y: s - b }, { x: s - b, y: s - b }],
  ];
  for (const poly of borders) {
    root.add(buildRock(poly, 3, rockMat));
    treePositions.push(...scatterInPolygon(poly, 120, rand).filter((p) => p.x > -4 && p.y > -4 && p.x < s + 4 && p.y < s + 4));
  }

  // Instanced trees: trunk + two foliage cones.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6).translate(0, 0.8, 0);
  const leafGeo = new THREE.ConeGeometry(1.6, 3.2, 7).translate(0, 3, 0);
  const leafGeo2 = new THREE.ConeGeometry(1.1, 2.4, 7).translate(0, 4.4, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d22, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b34, flatShading: true });
  const n = treePositions.length;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, n);
  const leaves2 = new THREE.InstancedMesh(leafGeo2, leafMat, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  treePositions.forEach((p, i) => {
    const sc = 0.8 + rand() * 0.7;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    m.compose(new THREE.Vector3(p.x, 2.5, p.y), q, new THREE.Vector3(sc, sc, sc));
    trunks.setMatrixAt(i, m);
    leaves.setMatrixAt(i, m);
    leaves2.setMatrixAt(i, m);
    color.setHSL(0.3 + rand() * 0.06, 0.45, 0.22 + rand() * 0.1);
    leaves.setColorAt(i, color);
    leaves2.setColorAt(i, color);
  });
  for (const im of [trunks, leaves, leaves2]) {
    im.castShadow = true;
    root.add(im);
  }

  // Fountain platforms.
  for (const [team, f] of Object.entries(MAP.fountains)) {
    const col = team === 'blue' ? 0x5aa0ff : 0xff6a6a;
    const plat = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 6, 0.6, 24),
      new THREE.MeshStandardMaterial({ color: 0x8c8f99, roughness: 0.6 }),
    );
    plat.position.set(f.x, 0.3, f.y);
    plat.receiveShadow = true;
    root.add(plat);
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.6, 0.1, 24),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }),
    );
    pool.position.set(f.x, 0.65, f.y);
    root.add(pool);
  }

  const brushes = buildBrushes(root);
  fog.applyTree(root);
  return { brushes };
}

/** Tall grass: instanced blades scattered inside each brush polygon. */
function buildBrushes(root: THREE.Group): THREE.InstancedMesh[] {
  const rand = mulberry32(99);
  const blade = new THREE.ConeGeometry(0.22, 1.9, 4).translate(0, 0.95, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  return MAP.brushes.map((poly) => {
    const spots = scatterInPolygon(poly, 140, rand);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4f8f3a, flatShading: true, transparent: true, opacity: 1 });
    const mesh = new THREE.InstancedMesh(blade, mat, spots.length);
    spots.forEach((p, i) => {
      const tilt = new THREE.Euler((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5);
      q.setFromEuler(tilt);
      const sc = 0.7 + rand() * 0.6;
      m.compose(new THREE.Vector3(p.x, 0, p.y), q, new THREE.Vector3(sc, sc, sc));
      mesh.setMatrixAt(i, m);
      color.setHSL(0.26 + rand() * 0.06, 0.55, 0.28 + rand() * 0.12);
      mesh.setColorAt(i, color);
    });
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  });
}
