/**
 * 泡芙的房间 —— 家具零件的公共件
 *
 * 每件家具是一个独立模块 parts/<id>.js，各自 export build(def)，
 * 用这里的 Part / PAL / 几何工具拼出来。分工：
 *   - common.js  ：配色、圆角盒、五角星、程序化贴图、Part 积木
 *   - parts/*.js ：一件家具一个文件，互不依赖，可以各写各的
 *   - main.js    ：房间、时间轴、拾取、卡片、相机
 *
 * 硬约束（别破）：家具只用 Box / Cylinder / Sphere / Cone 拼，
 * 不许引外部模型、不许外部贴图文件（贴图一律 Canvas 现画）。
 */
import * as THREE from 'three';

/* =========================================================================
 * 配色：暖白墙 / 浅木地板 / 雾蓝软装 / 原木家具
 * ========================================================================= */
export const PAL = {
  wall:      '#f3f0e9',
  wallOut:   '#e7e3da',
  floor:     '#efdcb4',
  plank:     '#c2a377',
  wood:      '#b98a58',
  woodDark:  '#9a6f43',
  blue:      '#b7d3ec',
  blueDeep:  '#7ea6cf',
  blueLight: '#dbe9f5',
  cream:     '#f8f4ec',
  sand:      '#ece2c8',
  cardboard: '#d7ae80',
  coral:     '#e8734a',
  leaf:      '#83a86a',
  leafDark:  '#5d8a4b',
  terra:     '#c98f6b',
  soil:      '#6b5340',
  charcoal:  '#5f5750',
  rope:      '#d9c39a',
  ink:       '#3b332c',
};

/* =========================================================================
 * 几何工具
 * ========================================================================= */

/** 圆角盒：BoxGeometry 的顶点投影成圆角（软糯的手办质感） */
export function roundedBoxGeo(w, h, d, r = 0.04, seg = 4) {
  r = Math.max(0.001, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = geo.attributes.position;
  const inner = [w / 2 - r, h / 2 - r, d / 2 - r];
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
    const cx = Math.max(-inner[0], Math.min(inner[0], vx));
    const cy = Math.max(-inner[1], Math.min(inner[1], vy));
    const cz = Math.max(-inner[2], Math.min(inner[2], vz));
    const dx = vx - cx, dy = vy - cy, dz = vz - cz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) {
      const s = r / len;
      pos.setXYZ(i, cx + dx * s, cy + dy * s, cz + dz * s);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** 五角星：10 边圆柱，隔一根顶点往里收，就成一个躺平的五角星 */
export function starGeo(rOuter, rInner, h) {
  const geo = new THREE.CylinderGeometry(rOuter, rOuter, h, 10, 1);
  const pos = geo.attributes.position;
  const step = (Math.PI * 2) / 10;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) < 1e-5) continue;
    let col = Math.round(Math.atan2(z, x) / step);
    col = ((col % 10) + 10) % 10;
    if (col % 2 === 1) {
      const k = rInner / rOuter;
      pos.setXYZ(i, x * k, pos.getY(i), z * k);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/* =========================================================================
 * 程序化贴图：全部 Canvas 现画，不下载任何图片
 * ========================================================================= */
export function rgba(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function drawStar(g, x, y, r, rot) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
  g.fill();
}

export function makeWoodTexture(base, grain) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  const plankH = 64;
  for (let y = 0; y < 512; y += plankH) {
    g.fillStyle = rgba(grain, 0.20);
    g.fillRect(0, y, 512, 1.6);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = rgba(grain, 0.04 + Math.random() * 0.08);
      g.lineWidth = 0.6 + Math.random() * 1.5;
      g.beginPath();
      const yy = y + Math.random() * plankH;
      g.moveTo(0, yy);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, yy + Math.sin(x * 0.02 + i) * 2.0);
      g.stroke();
    }
    g.fillStyle = rgba(grain, 0.14);
    g.fillRect(Math.floor(Math.random() * 3) * 170, y, 1.4, plankH);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeStarPatternTexture(base) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 640;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 640);
  g.fillStyle = '#fdfaf3';
  const rows = 5, cols = 4;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = ((i + (j % 2 ? 0.5 : 0)) + 0.5) * (512 / cols);
      const y = (j + 0.5) * (640 / rows);
      drawStar(g, x, y, 30 + ((i + j) % 3) * 6, (i + j) % 2 ? 0.28 : -0.22);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeArtTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf7ef';
  g.fillRect(0, 0, 256, 320);
  if (kind === 'hill') {
    g.fillStyle = '#f4c49b';
    g.beginPath(); g.arc(168, 84, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a9c8e4';
    g.beginPath(); g.moveTo(0, 232);
    g.quadraticCurveTo(86, 152, 176, 220);
    g.quadraticCurveTo(228, 252, 256, 230);
    g.lineTo(256, 320); g.lineTo(0, 320); g.closePath(); g.fill();
    g.fillStyle = '#8fb48c';
    g.beginPath(); g.moveTo(0, 268);
    g.quadraticCurveTo(118, 208, 256, 260);
    g.lineTo(256, 320); g.lineTo(0, 320); g.closePath(); g.fill();
  } else if (kind === 'wave') {
    g.fillStyle = '#7ea6cf';
    for (let i = 0; i < 3; i++) {
      const y = 150 + i * 42;
      g.beginPath(); g.moveTo(0, y);
      g.quadraticCurveTo(64, y - 34, 128, y);
      g.quadraticCurveTo(192, y + 34, 256, y);
      g.lineTo(256, y + 26); g.lineTo(0, y + 26);
      g.closePath(); g.fill();
    }
  } else if (kind === 'flower') {
    g.fillStyle = '#f2c3cf';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.beginPath();
      g.ellipse(128 + Math.cos(a) * 44, 150 + Math.sin(a) * 44, 30, 22, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f0d58c';
    g.beginPath(); g.arc(128, 150, 26, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8fb48c'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(128, 176); g.lineTo(128, 272); g.stroke();
  } else {
    g.fillStyle = '#dbe9f5';
    g.beginPath();
    g.moveTo(58, 270); g.lineTo(58, 150);
    g.arc(128, 150, 70, Math.PI, 0);
    g.lineTo(198, 270); g.closePath(); g.fill();
    g.fillStyle = '#f4c49b';
    g.beginPath(); g.arc(128, 186, 30, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeClockTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fdfaf3';
  g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#6b6259';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = i % 3 === 0 ? 92 : 102;
    g.lineWidth = i % 3 === 0 ? 9 : 5;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
    g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112);
    g.stroke();
  }
  g.lineCap = 'round';
  g.lineWidth = 11; g.strokeStyle = '#4b443d';
  g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(-1.05) * 62, 128 + Math.sin(-1.05) * 62); g.stroke();
  g.lineWidth = 8;
  g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(0.62) * 86, 128 + Math.sin(0.62) * 86); g.stroke();
  g.fillStyle = '#e8734a';
  g.beginPath(); g.arc(128, 128, 10, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#b9d6ee');
  grad.addColorStop(0.55, '#dfeaf3');
  grad.addColorStop(1, '#fdf6e6');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  grad.addColorStop(0, 'rgba(96,82,66,0.42)');
  grad.addColorStop(0.55, 'rgba(96,82,66,0.18)');
  grad.addColorStop(1, 'rgba(96,82,66,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makePlaceholderTexture(label) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e2d9c9';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#8a7a6b';
  g.font = '600 24px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* =========================================================================
 * Part：拼家具的积木
 *
 * 坐标系：局部原点在「主体几何体的中心」，也就是 def.pos。
 *   x 向右为正、y 向上为正、z 向前（房间敞开的那一面）为正。
 *   贴地家具的底面在 local y = -def.size[1] / 2。
 *   悬在墙上的（比如窗台）local y = 0 就是它自己的中心。
 * ========================================================================= */
export class Part {
  constructor(def) {
    this.def = def;
    this.origin = new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]);
    this.group = new THREE.Group();
    this.group.name = def.id;
    this.group.position.copy(this.origin);
    if (Array.isArray(def.rot)) this.group.rotation.set(def.rot[0] || 0, def.rot[1] || 0, def.rot[2] || 0);
    this.meshes = [];
    this.mats = [];
    this._mats = new Map();     // 同一件家具内同色共享材质（不同家具不共享，否则高亮会串）
  }

  /** 这件家具的主色（数据里的 color） */
  get baseColor() { return this.def.color; }

  /** 贴地家具的底面局部 y */
  get floorY() { return -this.def.size[1] / 2; }

  /** 主体顶面的局部 y */
  get topY() { return this.def.size[1] / 2; }

  /** 取材质（同色复用一件家具内的那一个） */
  mat(color, opt = {}) {
    const key = String(color) + '|' + (opt.rough ?? 0.84) + '|' + (opt.map ? 'map' : '-') + '|' + (opt.transparent ? 't' : '-');
    let m = this._mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color || this.baseColor),
        map: opt.map || null,
        transparent: !!opt.transparent,
        roughness: opt.rough ?? 0.84,
        metalness: opt.metal ?? 0.02,
      });
      this._mats.set(key, m);
      this.mats.push(m);
    }
    return m;
  }

  /**
   * 加一个零件。
   * @param geo   THREE 几何体
   * @param x,y,z 相对 def.pos 的局部坐标
   * @param color 颜色字符串（省略则用数据里的主色）
   * @param opt   { rot:[x,y,z], scale:[x,y,z], round, seg, rough, map, transparent, noShadow }
   */
  add(geo, x, y, z, color, opt = {}) {
    const mat = this.mat(color, opt);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (opt.rot) m.rotation.set(opt.rot[0] || 0, opt.rot[1] || 0, opt.rot[2] || 0);
    if (opt.scale) m.scale.set(opt.scale[0], opt.scale[1], opt.scale[2]);
    m.castShadow = !opt.noShadow;
    m.receiveShadow = true;
    m.userData.id = this.def.id;      // 靠 userData.id 认回是哪件家具
    this.group.add(m);
    this.meshes.push(m);
    return m;
  }

  /** 方盒子（默认圆角） */
  box(w, h, d, x, y, z, color, opt = {}) {
    return this.add(roundedBoxGeo(w, h, d, opt.round ?? 0.035, opt.seg ?? 4), x, y, z, color, opt);
  }

  /** 圆柱：d 是直径，h 是高 */
  cyl(d, h, x, y, z, color, opt = {}) {
    return this.add(new THREE.CylinderGeometry(d / 2, d / 2, h, opt.seg ?? 26), x, y, z, color, opt);
  }

  /** 锥：d 是底直径，h 是高 */
  cone(d, h, x, y, z, color, opt = {}) {
    return this.add(new THREE.ConeGeometry(d / 2, h, opt.seg ?? 24), x, y, z, color, opt);
  }

  /** 球：d 是直径 */
  sph(d, x, y, z, color, opt = {}) {
    return this.add(new THREE.SphereGeometry(d / 2, opt.seg ?? 22, opt.seg2 ?? 16), x, y, z, color, opt);
  }

  /** 五角星（躺平的抱枕/装饰），rO 外接圆半径、rI 内半径、h 厚度 */
  star(rO, rI, h, x, y, z, color, opt = {}) {
    return this.add(starGeo(rO, rI, h), x, y, z, color, opt);
  }

  /** 躺平的平面（贴纸、贴图层），w 宽 d 深 */
  plane(w, d, x, y, z, color, opt = {}) {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    return this.add(geo, x, y, z, color, opt);
  }

  finish() {
    return { group: this.group, meshes: this.meshes, mats: this.mats };
  }
}

/**
 * 兜底造型：按数据里的 shape 造一个主体（没有专属模块时用）。
 * 方盒子一律圆角。
 */
export function buildDefault(def) {
  const p = new Part(def);
  const [w, h, d] = def.size;
  if (def.shape === 'box') p.box(w, h, d, 0, 0, 0);
  else if (def.shape === 'sphere') p.sph(w, 0, 0, 0);
  else if (def.shape === 'cylinder') p.cyl(w, h, 0, 0, 0);
  else p.cone(w, h, 0, 0, 0);
  return p.finish();
}
