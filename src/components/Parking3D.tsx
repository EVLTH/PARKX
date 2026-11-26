// Vue 3D de la maquette (three.js, embarqué : aucune connexion requise).
// Unités : 1 unité = 1 cm. Repère : X = longueur de la plaque, Z = largeur, Y = hauteur.
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { carLength, type Geometry, type PlaceGeo } from '../lib/geometry';
import type { LedState } from '../db/types';
import { animAt, CAR_COLORS, isReversing, type Anim } from '../lib/parkingSim';
import { BRAND, LED } from '../styles/brand';
import { pcbLabel } from '../lib/utils';
import { CONFIG } from '../config';

export type CamView = 'perspective' | 'dessus' | 'entree' | 'suivi';
export interface Parking3DHandle {
  snapshot: (type?: 'image/png' | 'image/jpeg') => string;
}
interface Props {
  geo: Geometry;
  ledOf: (n: number) => LedState;
  stateOf: (n: number) => LedState;
  anims: Anim[];
  selected: number | null;
  testPcb: number | null;
  night: boolean;
  view: CamView;
  autoRotate: boolean;
  fleet: 'mix' | 'az';
  onSelect: (n: number) => void;
  onToggle: (n: number) => void;
}

// ---------- Textures dessinées (aucun fichier externe) ----------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const glowTexture = () =>
  canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.22, 'rgba(255,255,255,0.6)');
    r.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
const textTexture = (text: string, w: number, h: number, font: string, color = '#FFFFFF') =>
  canvasTex(w, h, (g) => {
    g.fillStyle = color;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + h * 0.04);
  });
const wheelchairTexture = () =>
  canvasTex(128, 128, (g) => {
    g.strokeStyle = '#FFFFFF';
    g.fillStyle = '#FFFFFF';
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.arc(56, 18, 10, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(54, 36);
    g.lineTo(54, 76);
    g.lineTo(90, 76);
    g.lineTo(104, 106);
    g.moveTo(54, 56);
    g.lineTo(82, 56);
    g.stroke();
    g.beginPath();
    g.arc(56, 86, 28, -0.2 * Math.PI, 1.05 * Math.PI, false);
    g.stroke();
  });
const asphaltTexture = () =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = '#7d8590';
    g.fillRect(0, 0, 256, 256);
    const img = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 112 + Math.random() * 40;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
    g.putImageData(img, 0, 0);
  });
const selectionTexture = () =>
  canvasTex(128, 192, (g) => {
    g.fillStyle = 'rgba(17,137,207,0.28)';
    g.fillRect(0, 0, 128, 192);
    g.strokeStyle = '#1189CF';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 118, 182);
  });

// Livrée latérale du modèle « AZ computer28 » : bandes vertes et nom (le côté arrière est à gauche ou à droite)
export const AZ_GREEN = CONFIG.voiture.couleurBandes;
function azSideTexture(rearOnLeft: boolean) {
  return canvasTex(1024, 192, (g) => {
    const w = 1024,
      h = 192;
    g.save();
    if (!rearOnLeft) g.setTransform(-1, 0, 0, 1, w, 0);
    // deux bandes parallèles qui montent vers l'arrière
    for (const off of [0, 24]) {
      g.beginPath();
      g.moveTo(w * 0.6, h * 0.66 + off);
      g.bezierCurveTo(w * 0.38, h * 0.64 + off, w * 0.24, h * 0.58 + off, w * 0.08, h * 0.2 + off);
      g.lineTo(w * 0.08, h * 0.2 + off + 13);
      g.bezierCurveTo(w * 0.24, h * 0.58 + off + 13, w * 0.38, h * 0.64 + off + 13, w * 0.6, h * 0.66 + off + 13);
      g.closePath();
      g.fillStyle = AZ_GREEN;
      g.fill();
    }
    // bas de caisse arrière vert
    g.fillStyle = AZ_GREEN;
    g.fillRect(0, h * 0.8, w * 0.07, h * 0.16);
    g.restore();
    // nom de l'entreprise sur la portière avant (toujours lisible de gauche à droite)
    const x = rearOnLeft ? w * 0.62 : w * 0.06;
    g.fillStyle = '#141C1C';
    g.textBaseline = 'alphabetic';
    // premier mot en grand, la suite plus petite (ex. « AZ » + « computer28 »)
    const [first, ...others] = CONFIG.voiture.nom.split(' ');
    const rest = others.join(' ');
    g.font = 'bold 74px Arial, Helvetica, sans-serif';
    g.fillText(first, x, h * 0.5);
    const azW = g.measureText(first).width;
    g.font = 'bold 40px Arial, Helvetica, sans-serif';
    if (rest) g.fillText(rest, x + azW + 10, h * 0.5);
    const restW = rest ? 10 + g.measureText(rest).width : 0;
    g.fillStyle = AZ_GREEN;
    g.fillRect(x, h * 0.56, azW + restW, 7);
  });
}

// ---------- Kit voiture (géométries partagées) ----------
interface CarKit {
  L: number;
  Wc: number;
  body: THREE.BufferGeometry;
  cabin: THREE.BufferGeometry;
  wheels: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  beam: THREE.BufferGeometry;
  az: {
    body: THREE.BufferGeometry;
    cabin: THREE.BufferGeometry;
    roof: THREE.BufferGeometry;
    spoiler: THREE.BufferGeometry;
    hubs: THREE.BufferGeometry;
    mirrors: THREE.BufferGeometry;
    side: THREE.BufferGeometry;
    rear: THREE.BufferGeometry;
    white: THREE.Material;
    green: THREE.Material;
    hub: THREE.Material;
    sideA: THREE.Material;
    sideB: THREE.Material;
    rearMat: THREE.Material;
  };
  mats: {
    glass: THREE.Material;
    tire: THREE.Material;
    headOn: THREE.Material;
    headOff: THREE.Material;
    tailOn: THREE.Material;
    tailOff: THREE.Material;
    reverse: THREE.Material;
    beam: THREE.Material;
    body: Map<string, THREE.Material>;
  };
}
function makeKit(geo: Geometry, glow: THREE.Texture): CarKit {
  const L = carLength(geo.cfg);
  const Wc = Math.min(geo.cfg.placeWidth * 0.66, 4.6);
  const r = 0.85;
  const body = new RoundedBoxGeometry(L, 1.6, Wc, 3, 0.55);
  body.translate(0, 1.55, 0);
  const cabin = new RoundedBoxGeometry(L * 0.52, 1.35, Wc * 0.84, 3, 0.48);
  cabin.translate(-L * 0.06, 2.9, 0);
  const wl: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const w = new THREE.CylinderGeometry(r, r, 0.7, 16);
      w.rotateX(Math.PI / 2);
      w.translate(sx * L * 0.31, r, sz * (Wc / 2 - 0.3));
      wl.push(w);
    }
  const lights = (x: number, y: number, inset: number) => {
    const arr: THREE.BufferGeometry[] = [];
    for (const sz of [-1, 1]) {
      const b = new THREE.BoxGeometry(0.3, 0.42, 0.9);
      b.translate(x, y, sz * (Wc / 2 - inset));
      arr.push(b);
    }
    return mergeGeometries(arr)!;
  };
  const beam = new THREE.PlaneGeometry(14, 9);
  beam.rotateX(-Math.PI / 2);
  beam.translate(L / 2 + 6.5, 0.09, 0);

  // Modèle « AZ computer28 » : citadine blanche à bandes vertes
  const azBody = new RoundedBoxGeometry(L, 1.75, Wc, 4, 0.45);
  azBody.translate(0, 1.6, 0);
  const cab = new THREE.Shape();
  cab.moveTo(-L * 0.47, 0);
  cab.lineTo(L * 0.28, 0);
  cab.lineTo(L * 0.05, 1.42);
  cab.lineTo(-L * 0.42, 1.42);
  cab.lineTo(-L * 0.47, 0.25);
  cab.lineTo(-L * 0.47, 0);
  const azCabin = new THREE.ExtrudeGeometry(cab, { depth: Wc * 0.82, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 });
  azCabin.translate(0, 2.4, -Wc * 0.41);
  const azRoof = new RoundedBoxGeometry(L * 0.42, 0.2, Wc * 0.8, 2, 0.08);
  azRoof.translate(-L * 0.17, 3.92, 0);
  const azSpoiler = new RoundedBoxGeometry(L * 0.12, 0.26, Wc * 0.84, 2, 0.1);
  azSpoiler.translate(-L * 0.38, 3.96, 0);
  const hubList: THREE.BufferGeometry[] = [];
  const mirList: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const hb = new THREE.CylinderGeometry(0.52, 0.52, 0.06, 16);
      hb.rotateX(Math.PI / 2);
      hb.translate(sx * L * 0.31, r, sz * (Wc / 2 + 0.06));
      hubList.push(hb);
    }
  for (const sz of [-1, 1]) {
    const m = new THREE.BoxGeometry(0.5, 0.32, 0.38);
    m.translate(L * 0.24, 2.6, sz * (Wc / 2 + 0.17));
    mirList.push(m);
  }
  const glowWhite = { roughness: 0.28, metalness: 0.1 };
  const sideMat = (rearOnLeft: boolean) => new THREE.MeshStandardMaterial({ map: azSideTexture(rearOnLeft), transparent: true, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
  return {
    L,
    Wc,
    body,
    cabin,
    wheels: mergeGeometries(wl)!,
    az: {
      body: azBody,
      cabin: azCabin,
      roof: azRoof,
      spoiler: azSpoiler,
      hubs: mergeGeometries(hubList)!,
      mirrors: mergeGeometries(mirList)!,
      side: new THREE.PlaneGeometry(L * 0.98, 1.75),
      rear: new THREE.PlaneGeometry(Wc * 0.86, 0.6),
      white: new THREE.MeshStandardMaterial({ color: '#F3F5F8', ...glowWhite }),
      green: new THREE.MeshStandardMaterial({ color: AZ_GREEN, roughness: 0.35 }),
      hub: new THREE.MeshStandardMaterial({ color: '#C9CED6', metalness: 0.8, roughness: 0.3 }),
      sideA: sideMat(true),
      sideB: sideMat(false),
      rearMat: new THREE.MeshStandardMaterial({ color: AZ_GREEN, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 }),
    },
    head: lights(L / 2 + 0.02, 1.75, 0.75),
    tail: lights(-L / 2 - 0.02, 1.8, 0.7),
    beam,
    mats: {
      glass: new THREE.MeshStandardMaterial({ color: '#1B2633', metalness: 0.55, roughness: 0.15 }),
      tire: new THREE.MeshStandardMaterial({ color: '#1C1F24', roughness: 0.9 }),
      headOn: new THREE.MeshStandardMaterial({ color: '#FFF7D6', emissive: '#FFF1B0', emissiveIntensity: 2.4 }),
      headOff: new THREE.MeshStandardMaterial({ color: '#D9DEE5', roughness: 0.3 }),
      tailOn: new THREE.MeshStandardMaterial({ color: '#B91C1C', emissive: '#FF2A2A', emissiveIntensity: 2 }),
      tailOff: new THREE.MeshStandardMaterial({ color: '#8E1B1B', emissive: '#FF2A2A', emissiveIntensity: 0.25 }),
      reverse: new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 1.6 }),
      beam: new THREE.MeshBasicMaterial({ map: glow, color: '#FFE9A8', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      body: new Map(),
    },
  };
}
interface Car3D {
  group: THREE.Group;
  head: THREE.Mesh;
  tail: THREE.Mesh;
  beam: THREE.Mesh;
}
export type CarModel = 'std' | 'az';
function makeAzCar(kit: CarKit): Car3D {
  const a = kit.az;
  const g = new THREE.Group();
  const body = new THREE.Mesh(a.body, a.white);
  const cabin = new THREE.Mesh(a.cabin, kit.mats.glass);
  const roof = new THREE.Mesh(a.roof, a.white);
  const spoiler = new THREE.Mesh(a.spoiler, a.green);
  const wheels = new THREE.Mesh(kit.wheels, kit.mats.tire);
  const hubs = new THREE.Mesh(a.hubs, a.hub);
  const mirrors = new THREE.Mesh(a.mirrors, a.white);
  const sideA = new THREE.Mesh(a.side, a.sideA);
  sideA.position.set(0, 1.6, kit.Wc / 2 + 0.015);
  const sideB = new THREE.Mesh(a.side, a.sideB);
  sideB.rotation.y = Math.PI;
  sideB.position.set(0, 1.6, -kit.Wc / 2 - 0.015);
  const rear = new THREE.Mesh(a.rear, a.rearMat);
  rear.rotation.y = -Math.PI / 2;
  rear.position.set(-kit.L / 2 - 0.015, 1.05, 0);
  const head = new THREE.Mesh(kit.head, kit.mats.headOff);
  const tail = new THREE.Mesh(kit.tail, kit.mats.tailOff);
  const beam = new THREE.Mesh(kit.beam, kit.mats.beam);
  beam.visible = false;
  body.castShadow = cabin.castShadow = roof.castShadow = wheels.castShadow = true;
  g.add(body, cabin, roof, spoiler, wheels, hubs, mirrors, sideA, sideB, rear, head, tail, beam);
  return { group: g, head, tail, beam };
}
function makeCar(kit: CarKit, color: string, model: CarModel = 'std'): Car3D {
  if (model === 'az') return makeAzCar(kit);
  let mat = kit.mats.body.get(color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.36 });
    kit.mats.body.set(color, mat);
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(kit.body, mat);
  const cabin = new THREE.Mesh(kit.cabin, kit.mats.glass);
  const wheels = new THREE.Mesh(kit.wheels, kit.mats.tire);
  const head = new THREE.Mesh(kit.head, kit.mats.headOff);
  const tail = new THREE.Mesh(kit.tail, kit.mats.tailOff);
  const beam = new THREE.Mesh(kit.beam, kit.mats.beam);
  beam.visible = false;
  body.castShadow = cabin.castShadow = wheels.castShadow = true;
  g.add(body, cabin, wheels, head, tail, beam);
  return { group: g, head, tail, beam };
}

// ---------- Maquette ----------
interface LedObj {
  state: LedState | '';
  dome: THREE.MeshStandardMaterial;
  glow: THREE.Sprite;
  glowMat: THREE.SpriteMaterial;
  pool: THREE.Mesh;
  poolMat: THREE.MeshBasicMaterial;
  cone: THREE.Object3D;
}
interface Board {
  group: THREE.Group;
  leds: Map<number, LedObj>;
  hits: THREE.Mesh[];
  pcbMats: Map<number, THREE.MeshStandardMaterial>;
  baseMat: THREE.MeshStandardMaterial;
}

function buildBoard(geo: Geometry, tex: { glow: THREE.Texture; wheel: THREE.Texture; asphalt: THREE.Texture }): Board {
  const { cfg, ix, iy, innerW, innerH } = geo;
  const W = cfg.plateW,
    H = cfg.plateH;
  const X = (x: number) => x - W / 2;
  const Z = (y: number) => y - H / 2;
  const group = new THREE.Group();
  const flat = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    return m;
  };

  // Socle de la plaque
  const baseMat = new THREE.MeshStandardMaterial({ color: '#F4F6F8', roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, 1.8, H), baseMat);
  base.position.y = -0.9;
  base.receiveShadow = true;
  group.add(base);

  // Bordures (bande périphérique légèrement surélevée)
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, -H / 2);
  shape.lineTo(W / 2, -H / 2);
  shape.lineTo(W / 2, H / 2);
  shape.lineTo(-W / 2, H / 2);
  shape.lineTo(-W / 2, -H / 2);
  const hole = new THREE.Path();
  hole.moveTo(X(ix), Z(iy));
  hole.lineTo(X(ix), Z(iy + innerH));
  hole.lineTo(X(ix + innerW), Z(iy + innerH));
  hole.lineTo(X(ix + innerW), Z(iy));
  hole.lineTo(X(ix), Z(iy));
  shape.holes.push(hole);
  const frameGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  frameGeo.rotateX(Math.PI / 2); // (x, y) -> (x, 0, y) ; extrusion vers le bas
  frameGeo.translate(0, 0.3, 0);
  const frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({ color: '#D3D9E1', roughness: 0.85 }));
  frame.receiveShadow = true;
  group.add(frame);

  // Revêtement intérieur
  tex.asphalt.wrapS = tex.asphalt.wrapT = THREE.RepeatWrapping;
  tex.asphalt.repeat.set(innerW / 18, innerH / 18);
  const asphaltMat = new THREE.MeshStandardMaterial({ color: '#566070', map: tex.asphalt, roughness: 0.95 });
  const asphalt = flat(innerW, innerH, asphaltMat, X(ix + innerW / 2), 0.02, Z(iy + innerH / 2));
  asphalt.receiveShadow = true;
  group.add(asphalt);

  // Voies d'accès (entrée à droite, sortie à gauche) — contexte de simulation
  const roadMat = new THREE.MeshStandardMaterial({ color: '#5A6371', map: tex.asphalt, roughness: 0.95, transparent: true, opacity: 0.9 });
  for (const side of [1, -1]) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(18, 1.82, cfg.aisle), roadMat);
    road.position.set(side * (W / 2 + 9), -0.89, Z(geo.aisleMid));
    road.receiveShadow = true;
    group.add(road);
    const label = textTexture(side > 0 ? 'ENTRÉE' : 'SORTIE', 256, 64, 'bold 46px system-ui, Arial', side > 0 ? '#C9F06B' : '#FCA5A5');
    group.add(flat(11, 2.75, new THREE.MeshBasicMaterial({ map: label, transparent: true, depthWrite: false }), side * (W / 2 + 9), 0.06, Z(geo.aisleMid) + cfg.aisle * 0.3));
  }

  // Marquages blancs (lignes des places, ligne centrale)
  const lw = 0.32;
  const marks: THREE.BufferGeometry[] = [];
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const b = new THREE.BoxGeometry(x1 === x2 ? lw : len + lw, 0.05, x1 === x2 ? len + lw : lw);
    b.translate(X((x1 + x2) / 2), 0.05, Z((y1 + y2) / 2));
    marks.push(b);
  };
  for (const p of geo.places) {
    seg(p.x, p.y, p.x, p.y + p.h);
    seg(p.x + p.w, p.y, p.x + p.w, p.y + p.h);
    const back = p.row === 'top' ? p.y : p.y + p.h;
    seg(p.x, back, p.x + p.w, back);
  }
  for (let x = ix + 2; x < ix + innerW - 4; x += 5.5) seg(x, geo.aisleMid, x + 3, geo.aisleMid);
  for (const side of [1, -1]) for (let x = 0; x < 16; x += 5.5) seg(side > 0 ? W + 1 + x : -1 - x - 3, geo.aisleMid, side > 0 ? W + 4 + x : -1 - x, geo.aisleMid);
  const white = new THREE.MeshStandardMaterial({ color: '#F4F6F8', roughness: 0.6 });
  const markMesh = new THREE.Mesh(mergeGeometries(marks)!, white);
  markMesh.receiveShadow = true;
  group.add(markMesh);

  // Flèches de sens de circulation (vers la gauche)
  const arrow = new THREE.Shape();
  arrow.moveTo(-2.2, 0);
  arrow.lineTo(-0.6, -1.3);
  arrow.lineTo(-0.6, -0.45);
  arrow.lineTo(2.2, -0.45);
  arrow.lineTo(2.2, 0.45);
  arrow.lineTo(-0.6, 0.45);
  arrow.lineTo(-0.6, 1.3);
  arrow.lineTo(-2.2, 0);
  for (const k of [0.2, 0.5, 0.8]) {
    const a = new THREE.Mesh(new THREE.ShapeGeometry(arrow), white);
    a.rotation.x = -Math.PI / 2;
    a.position.set(X(ix + innerW * k), 0.06, Z(geo.aisleMid + Math.min(cfg.aisle * 0.25, 5)));
    group.add(a);
  }

  // Places : PMR, numéros, zones cliquables, LED, cônes de maintenance
  const leds = new Map<number, LedObj>();
  const hits: THREE.Mesh[] = [];
  const housingGeo = new THREE.CylinderGeometry(0.62, 0.7, 0.7, 16);
  const housingMat = new THREE.MeshStandardMaterial({ color: '#1F2937', roughness: 0.5 });
  const domeGeo = new THREE.SphereGeometry(0.46, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const coneGeo = new THREE.ConeGeometry(0.9, 2.4, 16);
  const coneMat = new THREE.MeshStandardMaterial({ color: BRAND.orange, roughness: 0.5 });
  const coneBand = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.4 });
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  for (const p of geo.places) {
    if (p.pmr) {
      group.add(flat(p.w - lw, p.h - lw, new THREE.MeshStandardMaterial({ color: BRAND.blue, roughness: 0.7 }), X(p.cx), 0.035, Z(p.cy)));
      const s = Math.min(p.w, p.h) * 0.42;
      group.add(flat(s, s, new THREE.MeshBasicMaterial({ map: tex.wheel, transparent: true, depthWrite: false }), X(p.cx), 0.06, Z(p.iconY)));
    }
    const numY = p.numY;
    const nt = textTexture(String(p.number), 128, 128, 'bold 84px system-ui, Arial');
    group.add(flat(Math.min(3, p.w * 0.45), Math.min(3, p.w * 0.45), new THREE.MeshBasicMaterial({ map: nt, transparent: true, depthWrite: false }), X(p.cx), 0.07, Z(numY)));

    const hit = flat(p.w, p.h, hitMat, X(p.cx), 0.12, Z(p.cy));
    hit.userData.place = p.number;
    hits.push(hit);
    group.add(hit);

    // LED à l'entrée de la place (côté allée)
    const ly = p.ledY;
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.set(X(p.cx), 0.35, Z(ly));
    housing.castShadow = true;
    const domeMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#FFFFFF', emissiveIntensity: 1, roughness: 0.2 });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(X(p.cx), 0.7, Z(ly));
    const glowMat = new THREE.SpriteMaterial({ map: tex.glow, color: '#FFFFFF', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(X(p.cx), 1.1, Z(ly));
    const poolMat = new THREE.MeshBasicMaterial({ map: tex.glow, color: '#FFFFFF', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = flat(8, 8, poolMat, X(p.cx), 0.08, Z(ly));
    const cone = new THREE.Group();
    const c1 = new THREE.Mesh(coneGeo, coneMat);
    c1.position.y = 1.2;
    c1.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.35, 16), coneBand);
    band.position.y = 1.35;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 2), coneMat);
    foot.position.y = 0.1;
    cone.add(c1, band, foot);
    cone.position.set(X(p.cx), 0.05, Z(p.cy));
    cone.visible = false;
    group.add(housing, dome, glow, pool, cone);
    leds.set(p.number, { state: '', dome: domeMat, glow, glowMat, pool, poolMat, cone });
  }

  // PCB (1 pour 2 places) et liaisons vers les LED
  const pcbMats = new Map<number, THREE.MeshStandardMaterial>();
  const chipGeo = new THREE.BoxGeometry(1.1, 0.25, 0.8);
  const chipMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.4 });
  const wireMat = new THREE.LineDashedMaterial({ color: '#C98A4B', dashSize: 0.6, gapSize: 0.45, transparent: true, opacity: 0.85 });
  for (const b of geo.pcbs) {
    const mat = new THREE.MeshStandardMaterial({ color: '#0E5A34', roughness: 0.55, emissive: BRAND.lime, emissiveIntensity: 0 });
    pcbMats.set(b.number, mat);
    const board = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.22, b.h), mat);
    board.position.set(X(b.x + b.w / 2), 0.14, Z(b.y + b.h / 2));
    board.castShadow = true;
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.set(X(b.x + b.w * 0.82), 0.33, Z(b.y + b.h / 2));
    const lt = textTexture(pcbLabel(b.number), 256, 64, 'bold 40px system-ui, Arial');
    const label = flat(b.w * 0.55, Math.min(b.h * 0.85, b.w * 0.14), new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false }), X(b.x + b.w * 0.36), 0.27, Z(b.y + b.h / 2));
    group.add(board, chip, label);
    for (const n of b.places) {
      const p = geo.places.find((q) => q.number === n) as PlaceGeo;
      const edge = b.row === 'top' ? b.y + b.h : b.y;
      // liaison PCB → LED (à l'entrée de la place), le long de la place
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(p.x + 0.7), 0.09, Z(edge)), new THREE.Vector3(X(p.x + 0.7), 0.09, Z(p.ledY)), new THREE.Vector3(X(p.cx - 0.7), 0.09, Z(p.ledY))]), wireMat);
      line.computeLineDistances();
      group.add(line);
    }
  }

  return { group, leds, hits, pcbMats, baseMat };
}

function disposeTree(o: THREE.Object3D, keep: Set<THREE.Texture> = new Set()) {
  o.traverse((x: any) => {
    x.geometry?.dispose?.();
    const ms = Array.isArray(x.material) ? x.material : x.material ? [x.material] : [];
    ms.forEach((m: any) => {
      if (m.map && !keep.has(m.map)) m.map.dispose();
      m.dispose?.();
    });
  });
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function presets(geo: Geometry, aspect = 1.6) {
  const W = geo.cfg.plateW,
    H = geo.cfg.plateH;
  // écran étroit (téléphone en portrait) : la caméra recule pour garder toute la maquette
  const d = Math.max(W, H) * Math.max(1, 1.2 / Math.max(aspect, 0.3));
  const az = geo.aisleMid - H / 2;
  return {
    perspective: { pos: new THREE.Vector3(0, d * 0.76, d * 1.0), target: new THREE.Vector3(0, -3, 7) },
    dessus: { pos: new THREE.Vector3(0, d * 1.3, 0.01), target: new THREE.Vector3(0, 0, 0) },
    entree: { pos: new THREE.Vector3(W / 2 + 24, 9, az + 2), target: new THREE.Vector3(W / 2 - 40, 1, az) },
  };
}

export const Parking3D = memo(
  forwardRef<Parking3DHandle, Props>(function Parking3D(props, ref) {
    const box = useRef<HTMLDivElement>(null);
    const pr = useRef(props);
    pr.current = props;
    const [error, setError] = useState('');
    const ctx = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      snapshot: (type = 'image/png') => {
        const c = ctx.current;
        if (!c) return '';
        // rendu en haute définition (×2 minimum) pour l'impression et les captures
        const pr = c.renderer.getPixelRatio();
        c.renderer.setPixelRatio(Math.max(pr, 2));
        c.renderer.render(c.scene, c.camera);
        const url = c.renderer.domElement.toDataURL(type, 0.92);
        c.renderer.setPixelRatio(pr);
        c.renderer.render(c.scene, c.camera);
        return url;
      },
    }));

    // Initialisation : moteur de rendu, caméra, lumières, boucle d'animation
    useEffect(() => {
      const el = box.current!;
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
      } catch {
        setError("La vue 3D nécessite WebGL, qui n'est pas disponible dans ce navigateur. Utilisez le schéma 2D.");
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 3000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI * 0.47;
      controls.minDistance = 12;
      controls.maxDistance = 420;
      controls.autoRotateSpeed = 0.7;

      const hemi = new THREE.HemisphereLight('#FFFFFF', '#AEB9C6', 1);
      const sun = new THREE.DirectionalLight('#FFFFFF', 1.6);
      sun.position.set(-70, 130, 70);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.03;
      sun.shadow.radius = 3;
      const sc = sun.shadow.camera as THREE.OrthographicCamera;
      sc.left = -110;
      sc.right = 110;
      sc.top = 90;
      sc.bottom = -90;
      sc.near = 10;
      sc.far = 400;
      scene.add(hemi, sun);

      const groundMat = new THREE.MeshStandardMaterial({ color: '#E3E9EF', roughness: 1 });
      const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 64), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -1.81;
      ground.receiveShadow = true;
      scene.add(ground);

      const tex = { glow: glowTexture(), wheel: wheelchairTexture(), asphalt: asphaltTexture() };
      const carRoot = new THREE.Group();
      scene.add(carRoot);
      const selTex = selectionTexture();
      const selection = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: selTex, transparent: true, depthWrite: false }));
      selection.rotation.x = -Math.PI / 2;
      selection.visible = false;
      scene.add(selection);

      const c: any = { renderer, scene, camera, controls, hemi, sun, ground, groundMat, tex, carRoot, selection, board: null, kit: null, cars: new Map<string, Car3D>(), camAnim: null, geo: null, lastView: '' };
      ctx.current = c;

      const resize = () => {
        const w = el.clientWidth,
          h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      // Sélection d'une place (clic sans glisser) et bascule (double-clic)
      const ray = new THREE.Raycaster();
      const pick = (e: MouseEvent | PointerEvent): number | null => {
        if (!c.board) return null;
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        const hit = ray.intersectObjects(c.board.hits, false)[0];
        return hit ? (hit.object.userData.place as number) : null;
      };
      let down: { x: number; y: number } | null = null;
      const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
      const onUp = (e: PointerEvent) => {
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
          const n = pick(e);
          if (n) pr.current.onSelect(n);
        }
        down = null;
      };
      const onDbl = (e: MouseEvent) => {
        const n = pick(e);
        if (n) pr.current.onToggle(n);
      };
      let lastMove = 0;
      const onMove = (e: PointerEvent) => {
        const t = performance.now();
        if (t - lastMove < 60 || e.buttons) return;
        lastMove = t;
        renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab';
      };
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);
      renderer.domElement.addEventListener('dblclick', onDbl);
      renderer.domElement.addEventListener('pointermove', onMove);

      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const t = performance.now();
        const p = pr.current;
        const b: Board | null = c.board;
        const g: Geometry | null = c.geo;
        if (!b || !g) {
          renderer.render(scene, camera);
          return;
        }
        const W = g.cfg.plateW,
          H = g.cfg.plateH;
        const animPlaces = new Set(p.anims.map((a) => a.place));
        const blinkOn = Math.floor(t / 260) % 2 === 0;

        // LED
        for (const [n, led] of b.leds as Map<number, LedObj>) {
          const s = p.ledOf(n);
          if (led.state !== s) {
            led.state = s;
            const col = LED[s];
            led.dome.color.set(col);
            led.dome.emissive.set(col);
            led.glowMat.color.set(col);
            led.poolMat.color.set(col);
          }
          const k = animPlaces.has(n) && !blinkOn ? 0.15 : 1;
          led.dome.emissiveIntensity = (p.night ? 3 : 1.25) * k;
          led.glowMat.opacity = (p.night ? 0.95 : 0.5) * k;
          led.glow.scale.setScalar(p.night ? 7.5 : 4);
          led.pool.visible = p.night;
          led.poolMat.opacity = 0.5 * k;
          led.cone.visible = p.stateOf(n) === 'maintenance';
        }
        for (const [k, m] of b.pcbMats as Map<number, THREE.MeshStandardMaterial>) m.emissiveIntensity = p.testPcb === k ? 0.55 + 0.35 * Math.sin(t / 140) : 0;

        // Voitures garées et en mouvement
        const want = new Map<string, { x: number; y: number; a: number; moving: boolean; reverse: boolean; color: string; model: CarModel }>();
        const modelOf = (n: number): CarModel => (p.fleet === 'az' || n % CONFIG.voiture.uneSur === 0 ? 'az' : 'std');
        if (!g.errors.length) {
          for (const pl of g.places)
            if (p.stateOf(pl.number) === 'occupe' && !animPlaces.has(pl.number))
              want.set('p' + pl.number + modelOf(pl.number), { x: pl.cx, y: pl.parkY, a: pl.row === 'top' ? 270 : 90, moving: false, reverse: false, color: CAR_COLORS[pl.number % CAR_COLORS.length], model: modelOf(pl.number) });
          for (const an of p.anims) want.set('a' + an.place + '-' + an.start + modelOf(an.place), { ...animAt(an, t), moving: true, reverse: isReversing(an, t), color: CAR_COLORS[an.place % CAR_COLORS.length], model: modelOf(an.place) });
        }
        for (const [key, car] of c.cars as Map<string, Car3D>)
          if (!want.has(key)) {
            carRoot.remove(car.group);
            c.cars.delete(key);
          }
        let follow: THREE.Object3D | null = null;
        let followA = 0;
        for (const [key, w] of want) {
          let car: Car3D | undefined = c.cars.get(key);
          if (!car) {
            car = makeCar(c.kit, w.color, w.model);
            carRoot.add(car.group);
            c.cars.set(key, car);
          }
          car.group.position.set(w.x - W / 2, 0.02, w.y - H / 2);
          car.group.rotation.y = (-w.a * Math.PI) / 180;
          car.head.material = w.moving || p.night ? c.kit.mats.headOn : c.kit.mats.headOff;
          car.tail.material = w.reverse ? c.kit.mats.reverse : w.moving || p.night ? c.kit.mats.tailOn : c.kit.mats.tailOff;
          car.beam.visible = p.night && w.moving && !w.reverse;
          if (w.moving) {
            follow = car.group;
            followA = w.a;
          }
        }

        // Surbrillance de la place sélectionnée
        const selP = p.selected ? g.places.find((q) => q.number === p.selected) : undefined;
        selection.visible = !!selP;
        if (selP) {
          selection.position.set(selP.cx - W / 2, 0.09, selP.cy - H / 2);
          selection.scale.set(selP.w, selP.h, 1);
          (selection.material as THREE.MeshBasicMaterial).opacity = 0.65 + 0.35 * Math.sin(t / 220);
        }

        // Caméra : transitions, suivi d'une voiture, rotation automatique
        if (c.camAnim) {
          const a = c.camAnim;
          const k = ease(Math.min(1, (t - a.t0) / 900));
          camera.position.lerpVectors(a.fromPos, a.toPos, k);
          controls.target.lerpVectors(a.fromTarget, a.toTarget, k);
          if (k >= 1) {
            c.camAnim = null;
            controls.enabled = p.view !== 'suivi';
          }
        } else if (p.view === 'suivi' && follow) {
          const rad = (followA * Math.PI) / 180;
          const fwd = new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad));
          const desired = follow.position.clone().addScaledVector(fwd, -24).add(new THREE.Vector3(0, 13, 0));
          camera.position.lerp(desired, 0.07);
          controls.target.lerp(follow.position.clone().addScaledVector(fwd, 10).setY(1.5), 0.1);
        }
        controls.autoRotate = p.autoRotate && p.view !== 'suivi' && !c.camAnim;
        controls.update();
        renderer.render(scene, camera);
      };
      loop();

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onDown);
        renderer.domElement.removeEventListener('pointerup', onUp);
        renderer.domElement.removeEventListener('dblclick', onDbl);
        renderer.domElement.removeEventListener('pointermove', onMove);
        controls.dispose();
        disposeTree(scene);
        if (c.kit) disposeKit(c.kit);
        Object.values(tex).forEach((x) => x.dispose());
        renderer.dispose();
        renderer.domElement.remove();
        ctx.current = null;
      };
    }, []);

    // (Re)construction de la maquette quand les mesures changent
    useEffect(() => {
      const c = ctx.current;
      if (!c) return;
      if (c.board) {
        c.scene.remove(c.board.group);
        disposeTree(c.board.group, new Set(Object.values(c.tex)));
      }
      for (const car of c.cars.values()) c.carRoot.remove(car.group);
      c.cars.clear();
      if (c.kit) disposeKit(c.kit);
      const g = props.geo;
      c.geo = g;
      c.kit = makeKit(g, c.tex.glow);
      c.board = g.errors.length ? null : buildBoard(g, c.tex);
      if (c.board) c.scene.add(c.board.group);
      const pre = presets(g, c.camera.aspect)[props.view === 'suivi' ? 'perspective' : props.view];
      if (!c.lastView) {
        c.camera.position.copy(pre.pos);
        c.controls.target.copy(pre.target);
        c.lastView = props.view;
      }
    }, [props.geo]);

    // Ambiance jour / nuit
    useEffect(() => {
      const c = ctx.current;
      if (!c) return;
      const n = props.night;
      c.scene.background = new THREE.Color(n ? '#06111F' : '#EAF0F6');
      c.scene.fog = new THREE.Fog(n ? '#06111F' : '#EAF0F6', 320, 900);
      c.hemi.intensity = n ? 0.42 : 1.05;
      c.hemi.color.set(n ? '#8DA2CF' : '#FFFFFF');
      c.sun.intensity = n ? 0.42 : 1.7;
      c.sun.color.set(n ? '#A9C0FF' : '#FFFFFF');
      c.groundMat.color.set(n ? '#0D1B33' : '#E3E9EF');
      if (c.board) c.board.baseMat.color.set(n ? '#9AA6B6' : '#F4F6F8');
      c.renderer.toneMappingExposure = n ? 1.25 : 1.05;
    }, [props.night, props.geo]);

    // Changement de point de vue (transition douce)
    useEffect(() => {
      const c = ctx.current;
      if (!c || !c.geo || c.lastView === props.view) return;
      c.lastView = props.view;
      if (props.view === 'suivi') {
        c.controls.enabled = false;
        return;
      }
      const pre = presets(c.geo, c.camera.aspect)[props.view];
      c.controls.enabled = false;
      c.camAnim = { fromPos: c.camera.position.clone(), fromTarget: c.controls.target.clone(), toPos: pre.pos.clone(), toTarget: pre.target.clone(), t0: performance.now() };
    }, [props.view]);

    return (
      <div className="p3d" ref={box}>
        {error && <div className="p3d-error">{error}</div>}
        {!error && props.geo.errors.length > 0 && <div className="p3d-error">Mesures invalides : corrigez-les dans « Conception et plans » pour afficher la maquette.</div>}
      </div>
    );
  })
);

function disposeKit(k: CarKit) {
  [k.body, k.cabin, k.wheels, k.head, k.tail, k.beam].forEach((g) => g.dispose());
  const a = k.az;
  [a.body, a.cabin, a.roof, a.spoiler, a.hubs, a.mirrors, a.side, a.rear].forEach((g) => g.dispose());
  [a.white, a.green, a.hub, a.rearMat].forEach((x) => x.dispose());
  [a.sideA, a.sideB].forEach((x: any) => {
    x.map?.dispose();
    x.dispose();
  });
  const m = k.mats;
  [m.glass, m.tire, m.headOn, m.headOff, m.tailOn, m.tailOff, m.reverse, m.beam, ...m.body.values()].forEach((x) => x.dispose());
}
