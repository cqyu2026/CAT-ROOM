/**
 * 泡芙的房间 —— 单页 3D 记忆房间
 *
 * 所有逻辑都在这一个文件里：importmap 只映射了 three / three/addons/，
 * 拆成多个 .js 会直接解析失败，所以不拆。
 *
 * 文件命名规范（页面内记录 与 gen_memories.py 两条路互为兜底，改一处必须改两处）：
 *   photos/<家具id>/YYYY-MM-DD_描述.(jpg|jpeg|png|webp|mp4)
 *   -> gen_memories.py 用正则解析成 date / text / src；
 *   -> 本文件 rescanDir() 用完全相同的正则与合并规则再解析一遍。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// 公共件（配色 / 圆角盒 / 五角星 / 程序化贴图 / Part 积木）与十件家具的独立模块
import {
  PAL, roundedBoxGeo, starGeo, rgba,
  makeWoodTexture, makeStarPatternTexture, makeClockTexture,
  makeSkyTexture, makeShadowTexture, makePlaceholderTexture,
  buildDefault,
} from './parts/common.js';
import { build as buildBed } from './parts/bed.js';
import { build as buildBowl } from './parts/bowl.js?v=20261028-2';
import { build as buildBall } from './parts/ball.js';
import { build as buildWindowsill } from './parts/windowsill.js';
import { build as buildTree } from './parts/tree.js';
import { build as buildDesk } from './parts/desk.js';
import { build as buildDoormat } from './parts/doormat.js';
import { build as buildSofa } from './parts/sofa.js';
import { build as buildRug } from './parts/rug.js';
import { build as buildRibbon } from './parts/ribbon.js';
import { build as buildWardrobe } from './parts/wardrobe.js';
import { build as buildCup } from './parts/cup.js';
import { build as buildTunnel } from './parts/tunnel.js';

/* =========================================================================
 * 常量
 * ========================================================================= */
const ROOM = { halfX: 3, zBack: -2, zFront: 2, height: 2.2, thick: 0.1 };
const HOME = { pos: new THREE.Vector3(1.5, 3.9, 7.1), target: new THREE.Vector3(0, 0.15, -0.35) };
const BASE_FOV = 38;           // 16:9 时的垂直视野
const BASE_ASPECT = 16 / 9;
const MAX_FOV = 68;            // 窄窗口时的视野上限，别把画面拉得太畸变
const FRAME = { w: 0.28, h: 0.34 };
const FADE_IN = 0.8;      // 回忆播放时家具逐件淡入
const IDB_KEY = 'puff-room-photos-dir';
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'mp4'];
const DAY_MS = 86400000;
const LOCAL_RECORDS_KEY = 'puff-room-local-records';
const modelLoader = new GLTFLoader();


/* =========================================================================
 * 全局状态
 * ========================================================================= */
let renderer, scene, camera, controls;
let DATA = null;                 // memories.json：{ cat, objects, memories }
let WALL_ART = {};
let OBJECT_DEFS = [];            // memories.json 中的 9 件家具（记录表单下拉用）
const furnitureMap = new Map();  // 家具 id -> 家具条目（唯一真相源，不用下标认人）
const pickables = [];            // 供 Raycaster 用的 mesh 列表
const photoPickables = [];
const wallFrames = [];
const wallEntry = { id: 'wall', def: { name: '照片墙', memory: '墙上留着泡芙的日常。', memoryByChapter: {} }, mats: [] };
let selectedObject = null;       // 当前开着卡片的家具条目
let selectedWallGroup = null;
let hoveredObject = null;
let isOverview = true;           // 全景/自由模式 = true；推近中或锁定在某件家具上 = false
let catGroup = null, catBody = null, catTail = null;
let dinerGroup = null;
let monitorScreen = null, monitorMaterial = null, screenTexture = null, screenVideo = null, screenRequest = 0;
let screenCanvas = null, screenContext = null;
let catIsModel = false, catBodyBaseY = 1;
const BODY_SCALE = new THREE.Vector3(0.32, 0.18, 0.22);

// 进度条按月走：一格 = 一个月（从生日那个月算起）
const timeline = {
  start: 0, end: 0, totalDays: 0, day: 0,
};

const cam = { mode: 'free', tween: null };  // free | flying | locked | returning

// 页面内记录
let storedDirHandle = null;      // IndexedDB 里存的 handle（刷新后免重选）
let dirHandle = null;            // 本次会话已授权的 photos/ 目录
let previewUrl = '';
let CACHE_EPOCH = Date.now();     // 媒体缓存戳，重新扫描目录后换一次
let lastFrameDate = '';

/* =========================================================================
 * 小工具
 * ========================================================================= */
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 'YYYY-MM-DD' -> 本地零点 Date（不用 new Date(str)，那是 UTC） */
function parseDate(s) {
  const p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
function dateStr(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayStr() { return dateStr(new Date()); }
/**
 * 把 src 里最后一段做 URL 编码（中文描述否则会变 fragment）
 * 顺带挂一个缓存戳：python -m http.server 的 304 判断受时区影响，改了照片/数据后
 * 浏览器可能一直拿旧缓存，房间就不同步了。戳只在一轮「重新扫描」时变，不会每次渲染都变。
 */
function mediaUrl(src) {
  if (!src) return '';
  const parts = String(src).split('/');
  const last = parts.pop();
  return (parts.length ? parts.join('/') + '/' : '') + encodeURIComponent(last) + '?v=' + CACHE_EPOCH;
}

function defById(id) { return DATA.objects.find((o) => o.id === id); }
function memoriesOf(id) { return DATA.memories[id] || []; }

/* =========================================================================
 * 启动
 * ========================================================================= */
async function init() {
  setupRenderer();
  buildRoom();

  try {
    await loadData();
  } catch (err) {
    showFatal('请先运行 python3 gen_memories.py 生成 memories.json，再刷新页面。');
    return;
  }

  buildFurniture();
  buildCatDiner();
  buildPolaroids();
  buildCat();
  setupTimeline();
  setupPicking();
  setupCamera();
  setupCard();
  setupVideo();
  setupRecord();

  applyTimeline();
  updateCat();

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
  // 首屏淡出：模块是 type="module"，延迟执行，所以淡出必须等场景+数据都就绪
  $('#loading').classList.add('fade');
}

async function loadData() {
  // 加时间戳绕开 http.server 的过期 304，保证刚生成的数据一定读得到
  const res = await fetch('memories.json?t=' + Date.now());
  if (!res.ok) throw new Error('memories.json HTTP ' + res.status);
  DATA = await res.json();
  if (!DATA || !DATA.objects || !DATA.memories) throw new Error('memories.json 结构不对');
  const art = await fetch('illustrations/manifest.json?t=' + Date.now());
  if (art.ok) WALL_ART = await art.json();
  mergeLocalRecords();

  OBJECT_DEFS = DATA.objects;
}

function mergeLocalRecords() {
  // 仅在当前浏览器与站点有效；清站点数据后可重跑 gen_memories.py 从磁盘恢复。
  let records = [];
  try { records = JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY) || '[]'); }
  catch (_) { return; }
  if (!Array.isArray(records)) return;
  for (const record of records) {
    const list = DATA.memories[record.id];
    if (!list || !record.date || !record.file) continue;
    const src = `photos/${record.id}/${record.file}`;
    if (list.some((item) => item.src === src && item.date === record.date)) continue;
    list.push({ date: record.date, text: record.text, src,
      type: record.file.toLowerCase().endsWith('.mp4') ? 'video' : 'image', live: false });
    list.sort((a, b) => a.date.localeCompare(b.date));
  }
  CACHE_EPOCH = Date.now();
}

function showFatal(msg) {
  const t = $('#loading .loading-title');
  const s = $('#loading .loading-sub');
  if (t) t.textContent = msg;
  if (s) s.textContent = '页面不会白屏，把这句提示修好就行';
  $('#loading').classList.remove('fade');
  toast(msg, 6000);
}

/* =========================================================================
 * 渲染器 / 场景 / 相机 / 控制器
 * ========================================================================= */
function setupRenderer() {
  const stage = $('#stage');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;      // 粉调柔光，别把白墙压成灰
  renderer.toneMappingExposure = 1.12;
  stage.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xefe9df);

  camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.copy(HOME.pos);
  applyCameraFov();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;  // 限制在水平线以上，不穿地板
  controls.minDistance = 2;
  controls.maxDistance = 22;
  controls.enablePan = true;
  controls.update();

  window.addEventListener('resize', onResize);
}

function onResize() {
  applyCameraFov();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * 窗口越窄，水平视野就越小，整间房会被切掉（竖屏/侧栏里尤其明显）。
 * 所以窄窗口时把垂直 FOV 撑开，保证水平视野始终够宽能装下整间房；
 * 宽屏（16:9 附近）保持 BASE_FOV 不变，初始机位 [4, 3.5, 5] 一个参数都不动。
 */
function applyCameraFov() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.aspect = aspect;
  if (aspect < BASE_ASPECT) {
    const half = Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) * (BASE_ASPECT / aspect);
    camera.fov = Math.min(MAX_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(half)));
  } else {
    camera.fov = BASE_FOV;
  }
  camera.updateProjectionMatrix();
}

/* =========================================================================
 * 房间：木托盘 / 浅木地板 / 三面白墙（后墙开真窗洞）/ 百叶窗 / 踢脚线 / 墙饰
 * ========================================================================= */
function buildRoom() {
  const wallMat = new THREE.MeshStandardMaterial({ color: PAL.wall, roughness: 0.96 });
  const sideMat = new THREE.MeshStandardMaterial({ color: PAL.wallOut, roughness: 0.96 });
  const woodMat = new THREE.MeshStandardMaterial({ color: PAL.wood, roughness: 0.72 });

  // 软阴影：整个房间像手办一样摆在一张桌面上
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 14),
    new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = -0.285;
  scene.add(blob);

  // 木托盘：房间架在一块原木底板上（参考图里的模型底座）
  const plinth = new THREE.Mesh(roundedBoxGeo(7.4, 0.22, 5.4, 0.05, 3), woodMat);
  plinth.position.set(0, -0.175, 0);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  scene.add(plinth);

  // 浅木地板
  const floorMat = new THREE.MeshStandardMaterial({ map: makeWoodTexture(PAL.floor, PAL.plank), roughness: 0.78 });
  const floor = new THREE.Mesh(roundedBoxGeo(6.16, 0.12, 4.12, 0.015, 2), floorMat);
  floor.position.set(0, -0.06, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  // 后墙：中间挖一个窗洞，阳光才穿得进来（百叶窗的条纹是真影子，不是贴图）
  const win = { x0: -1.9, x1: -0.1, y0: 1.0, y1: 2.05 };
  const xL = -ROOM.halfX - 0.05, xR = ROOM.halfX + 0.05;
  const pieces = [
    [(xL + win.x0) / 2, ROOM.height / 2, win.x0 - xL, ROOM.height],
    [(win.x1 + xR) / 2, ROOM.height / 2, xR - win.x1, ROOM.height],
    [(win.x0 + win.x1) / 2, win.y0 / 2, win.x1 - win.x0, win.y0],
    [(win.x0 + win.x1) / 2, (win.y1 + ROOM.height) / 2, win.x1 - win.x0, ROOM.height - win.y1],
  ];
  for (const [cx, cy, w, h] of pieces) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, ROOM.thick), wallMat);
    m.position.set(cx, cy, ROOM.zBack - ROOM.thick / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  // 左墙 / 右墙：整面都在（参考图就是三面围合、正面敞开的盒子房间）
  const left = new THREE.Mesh(new THREE.BoxGeometry(ROOM.thick, ROOM.height, 4.1), wallMat);
  left.position.set(-ROOM.halfX - ROOM.thick / 2, ROOM.height / 2, -0.05);
  left.castShadow = true;
  left.receiveShadow = true;
  scene.add(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(ROOM.thick, ROOM.height, 4.1), sideMat);
  right.position.set(ROOM.halfX + ROOM.thick / 2, ROOM.height / 2, -0.05);
  right.castShadow = true;
  right.receiveShadow = true;
  scene.add(right);

  // 踢脚线
  const skirtMat = new THREE.MeshStandardMaterial({ color: PAL.wood, roughness: 0.7 });
  const skirt = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(roundedBoxGeo(w, h, d, 0.012, 2), skirtMat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  skirt(6.0, 0.14, 0.05, 0, 0.07, ROOM.zBack + 0.025);
  skirt(0.05, 0.14, 4.0, -ROOM.halfX + 0.025, 0.07, 0);
  skirt(0.05, 0.14, 4.0, ROOM.halfX - 0.025, 0.07, 0);

  buildWindow(win);
  buildWallArt();

  // 光照只有两盏：Ambient + Directional
  // 环境光给足，房间才像参考图那样通透；太阳从窗洞穿进来，在地上切出百叶窗的条纹。
  scene.add(new THREE.AmbientLight(0xfff4e8, 1.45));
  const sun = new THREE.DirectionalLight(0xfff2da, 1.4);
  sun.position.set(-1.0, 5.2, -7.6);
  sun.target.position.set(-0.2, 0.6, 0.7);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -5;
  sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -5;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 24;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
}

function buildWindow(win) {
  const g = new THREE.Group();
  const z = ROOM.zBack;                       // 墙的内表面
  const w = win.x1 - win.x0, h = win.y1 - win.y0;
  const cx = (win.x0 + win.x1) / 2, cy = (win.y0 + win.y1) / 2;

  // 窗外的天光：不受光照影响，永远是亮的
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.04, h + 0.04),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture() })
  );
  sky.position.set(cx, cy, z - ROOM.thick - 0.012);
  g.add(sky);

  // 白色窗框
  const frameMat = new THREE.MeshStandardMaterial({ color: PAL.cream, roughness: 0.82 });
  const bar = (bw, bh, x, y, d = 0.08) => {
    const m = new THREE.Mesh(roundedBoxGeo(bw, bh, d, 0.014, 2), frameMat);
    m.position.set(x, y, z + 0.03);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  bar(0.08, h + 0.16, win.x0, cy);
  bar(0.08, h + 0.16, win.x1, cy);
  bar(w + 0.16, 0.08, cx, win.y1);
  bar(w + 0.16, 0.1, cx, win.y0 - 0.01);

  // 百叶窗：一片片横着的叶子，斜着挂（光从缝里漏进来，在地上切出条纹）
  const slatMat = new THREE.MeshStandardMaterial({ color: '#fcf9f3', roughness: 0.86 });
  const n = 13;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const y = win.y0 + 0.05 + t * (h - 0.1);
    const slat = new THREE.Mesh(roundedBoxGeo(w - 0.03, 0.032, 0.045, 0.01, 2), slatMat);
    slat.position.set(cx, y, z + 0.055);
    slat.rotation.x = -0.36;                  // 斜着才有条纹
    slat.castShadow = true;
    g.add(slat);
  }

  // 窗帘盒
  const rail = new THREE.Mesh(roundedBoxGeo(w + 0.22, 0.09, 0.13, 0.025, 2), frameMat);
  rail.position.set(cx, win.y1 + 0.07, z + 0.06);
  rail.castShadow = true;
  g.add(rail);

  const cordMat = new THREE.MeshStandardMaterial({ color: '#d8c8ad', roughness: 0.9 });
  const cordTop = win.y1 + 0.04, cordBottom = 0.70;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, cordTop - cordBottom, 8), cordMat);
  cord.position.set(win.x1 + 0.09, (cordTop + cordBottom) / 2, z + 0.12);
  g.add(cord);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 8, 18), cordMat);
  ring.position.set(win.x1 + 0.09, cordBottom, z + 0.12);
  g.add(ring);

  scene.add(g);
}

/** 墙上的小画 + 挂钟（参考图左墙那一排） */
function buildWallArt() {
  // 挂钟
  const clock = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.155, 0.155, 0.055, 36),
    new THREE.MeshStandardMaterial({ color: PAL.wood, roughness: 0.62 })
  );
  rim.rotation.x = Math.PI / 2;
  clock.add(rim);
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.128, 36),
    new THREE.MeshStandardMaterial({ map: makeClockTexture(), roughness: 0.72 })
  );
  face.position.z = 0.029;
  clock.add(face);
  clock.position.set(-ROOM.halfX + 0.045, 1.86, 1.75);
  clock.rotation.y = Math.PI / 2;
  scene.add(clock);
}

/* =========================================================================
 * 家具：每件家具是一个独立模块 parts/<id>.js，各自拼自己的零件
 * ========================================================================= */
const PART_BUILDERS = {
  bed: buildBed, bowl: buildBowl, ball: buildBall,
  windowsill: buildWindowsill, tree: buildTree, desk: buildDesk,
  doormat: buildDoormat, sofa: buildSofa, rug: buildRug,
  ribbon: buildRibbon, wardrobe: buildWardrobe, cup: buildCup, tunnel: buildTunnel,
};

function buildFurniture() {
  for (const def of DATA.objects) {
    const builder = PART_BUILDERS[def.id] || buildDefault;   // 没有专属模块就用兜底主体
    const built = builder(def);
    scene.add(built.group);

    const entry = {
      id: def.id,
      def,
      group: built.group,
      mesh: built.meshes[0] || built.group,     // 主体（用来判断显隐状态）
      meshes: built.meshes,
      material: built.mats[0] || null,
      mats: built.mats,                          // 主体 + 零件的材质（高亮/淡入淡出一起走）
      fading: false, fadeT: 0, hasFaded: false,
    };
    furnitureMap.set(def.id, entry);
    for (const m of built.meshes) pickables.push(m);   // 每个零件都能被点中认回同一件家具
    if (['bowl', 'ribbon', 'wardrobe', 'cup', 'tunnel'].includes(def.id)) continue;
    modelLoader.load(`models/${def.id}.glb`, (gltf) => {
      const realMeshes = [], realMats = new Set();
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.userData.id = def.id;
        if (node.name === 'monitor_screen') {
          node.userData.video = true;
          monitorScreen = node;
          monitorMaterial = new THREE.MeshBasicMaterial({ color: 0x111116 });
          node.material = monitorMaterial;
          if (story.currentMedia) showOnMonitor(story.currentMedia);
        }
        node.castShadow = true;
        node.receiveShadow = true;
        realMeshes.push(node);
        for (const mat of (Array.isArray(node.material) ? node.material : [node.material])) realMats.add(mat);
      });
      if (!realMeshes.length) return;
      for (const old of built.meshes) {
        const index = pickables.indexOf(old);
        if (index >= 0) pickables.splice(index, 1);
      }
      const wasVisible = entry.mesh.visible;
      entry.group.clear();
      entry.group.position.set(def.pos[0], def.pos[1] - def.size[1] / 2, def.pos[2]);
      if (Array.isArray(def.rot)) entry.group.rotation.set(def.rot[0] || 0, def.rot[1] || 0, def.rot[2] || 0);
      entry.group.add(gltf.scene);
      entry.group.visible = wasVisible;
      entry.meshes.splice(1, entry.meshes.length - 1, ...realMeshes); // mesh[0] 维持时间轴状态
      entry.mats.splice(0, entry.mats.length, ...realMats);
      for (const mesh of realMeshes) pickables.push(mesh);
      entry.bbox = new THREE.Box3().setFromObject(gltf.scene);
      if (selectedObject === entry || hoveredObject === entry) highlight(entry, true);
    }, undefined, () => console.warn(`models/${def.id}.glb 加载失败，保留占位模型`));
  }
}

/** 窗台下的迷你猫咪食堂；碗仍是独立家具，摆在下层开放格里。 */
function buildCatDiner() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xa96a3d, roughness: 0.78 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x76482d, roughness: 0.82 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf0e7d3, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9baba8, roughness: 0.37, transparent: true, opacity: 0.78 });
  const addBox = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
    return mesh;
  };
  // 窗台下缘 0.825；食堂顶端 0.79，背面离后墙 0.005。
  addBox(1.18, 0.74, 0.035, 0, 0.39, -0.235, wood);
  for (const x of [-0.58, 0.58]) addBox(0.04, 0.75, 0.48, x, 0.39, 0, wood);
  addBox(1.18, 0.035, 0.48, 0, 0.765, 0, dark);
  addBox(1.14, 0.035, 0.48, 0, 0.025, 0, wood);
  addBox(1.14, 0.03, 0.48, 0, 0.42, 0, wood);
  // 双门与圆形压纹玻璃。
  for (const x of [-0.29, 0.29]) {
    addBox(0.55, 0.30, 0.025, x, 0.605, 0.232, wood);
    const windowPane = new THREE.Mesh(new THREE.CircleGeometry(0.105, 32), glass);
    windowPane.position.set(x, 0.605, 0.249); g.add(windowPane);
    for (let i = -4; i <= 4; i++) {
      const stripe = addBox(0.004, 0.18, 0.002, x + i * 0.021, 0.605, 0.251, cream);
      stripe.material = new THREE.MeshStandardMaterial({ color: 0xe5e4dc, transparent: true, opacity: 0.28 });
    }
  }
  // 奶油与木色相间的短雨篷，留出下层入口。
  for (let i = 0; i < 8; i++) addBox(0.144, 0.09, 0.19, -0.504 + i * 0.144, 0.38, 0.30, i % 2 ? cream : wood);
  addBox(1.16, 0.025, 0.21, 0, 0.43, 0.29, dark);
  g.position.set(-1.0, 0, -1.76);
  scene.add(g);
  dinerGroup = g;
}


function setEntryVisible(entry, v) {
  if (entry.group) entry.group.visible = v;
  for (const m of entry.meshes) m.visible = v;
}

/* =========================================================================
 * 墙上的拍立得相框
 * ========================================================================= */
function buildPolaroids() {
  const currentDate = timeline.start ? dateStr(dateAt(timeline.day)) : todayStr();
  lastFrameDate = currentDate;
  photoPickables.length = 0;
  for (const group of wallFrames) { scene.remove(group); disposeGroup(group); }
  wallFrames.length = 0;
  const wallPhotos = memoriesOf('wall').filter((memory) => memory.type === 'image' && memory.date <= currentDate);
  const grouped = new Set();
  const frames = [];
  for (const group of DATA.wallGroups || []) {
    const photos = group.photos.map((src) => wallPhotos.find((memory) => memory.src === src)).filter(Boolean);
    if (!photos.length) continue;
    photos.forEach((memory) => grouped.add(memory.src));
    frames.push({ def: wallEntry.def, photos, group });
  }
  for (const memory of wallPhotos) {
    if (!grouped.has(memory.src)) frames.push({ def: wallEntry.def, photos: [memory] });
  }
  frames.sort((a, b) => a.photos[0].date.localeCompare(b.photos[0].date));
  frames.forEach((item, index) => createFrame(-0.66 + (index % 6) * 0.43, index < 6 ? 1.72 : 1.27, item));
}

/** 照片全部贴在挂钟所在的左墙，正面朝房间内。 */
function createFrame(along, y, item) {
  const g = new THREE.Group();
  g.position.set(-ROOM.halfX + 0.02, y, along);
  g.rotation.y = Math.PI / 2;
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(FRAME.w, FRAME.h, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x93623f, roughness: 0.75 })
  );
  g.add(plate);
  const mount = new THREE.Mesh(
    new THREE.BoxGeometry(FRAME.w - 0.035, FRAME.h - 0.035, 0.004),
    new THREE.MeshStandardMaterial({ color: 0xf4ede1, roughness: 0.9 })
  );
  mount.position.z = 0.017;
  g.add(mount);

  const photoMat = new THREE.MeshBasicMaterial({ map: makePlaceholderTexture(item.def.name) });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), photoMat);
  photo.position.set(0, 0.02, 0.022);
  photo.userData.id = item.def.id;
  const cover = item.photos.find((memory) => memory.src === item.group?.cover) || item.photos[0];
  photo.userData.memory = cover;
  photo.userData.group = item.group ? { ...item.group, photos: item.photos } : null;
  photoPickables.push(photo);
  g.add(photo);
  scene.add(g);

  const illustrated = WALL_ART[cover.src];
  const loadThumbnail = illustrated ? loadPhotoTexture : makeIllustratedTexture;
  loadThumbnail(mediaUrl(illustrated || cover.src), (tex) => {
    if (!g.parent) { tex.dispose(); return; }
    if (photoMat.map) photoMat.map.dispose();
    photoMat.map = tex;
    photoMat.needsUpdate = true;
  });

  wallFrames.push(g);
}

/** 每张原照片保留构图，转为带纸感和柔和笔触的水彩缩略图。 */
function makeIllustratedTexture(src, onReady) {
  const image = new Image();
  image.onload = () => {
    const sample = document.createElement('canvas');
    sample.width = sample.height = 48;
    const sx = sample.getContext('2d');
    const scale = Math.max(48 / image.width, 48 / image.height);
    const w = image.width * scale, h = image.height * scale;
    sx.drawImage(image, (48 - w) / 2, (48 - h) / 2, w, h);
    const pixels = sx.getImageData(0, 0, 48, 48).data;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4f0e7'; ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const i = (y * 48 + x) * 4;
      const r = Math.round(pixels[i] / 26) * 26;
      const g = Math.round(pixels[i + 1] / 26) * 26;
      const b = Math.round(pixels[i + 2] / 26) * 26;
      const jitter = Math.sin(x * 18.1 + y * 43.7) * 1.5;
      ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
      ctx.beginPath();
      ctx.ellipse(x * 5.34 + jitter, y * 5.34 - jitter, 4.2, 3.7, jitter, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(251,246,232,0.12)'; ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    onReady(tex);
  };
  image.onerror = () => {};
  image.src = src;
}

function loadPhotoTexture(src, onReady) {
  const loader = new THREE.TextureLoader();
  loader.load(src, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    onReady(tex);
  }, undefined, () => { /* 加载失败就保留灰色占位图，不白屏 */ });
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    }
  });
}

/* =========================================================================
 * 泡芙（纯几何体拼的低多边形趴睡猫）
 * ========================================================================= */
function buildCat() {
  catGroup = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xf0d0a8, roughness: 0.95 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xe8a0a0, roughness: 0.9 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x3b332c, roughness: 0.7 });

  // 身体：压扁的球
  catBody = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), fur);
  catBody.scale.copy(BODY_SCALE);
  catBody.castShadow = true;
  catGroup.add(catBody);

  // 头
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), fur);
  head.scale.set(0.17, 0.16, 0.16);
  head.position.set(0.30, 0.03, 0);
  head.castShadow = true;
  catGroup.add(head);

  // 两只小锥耳
  for (const z of [0.085, -0.085]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 8), fur);
    ear.position.set(0.26, 0.16, z);
    ear.rotation.set(z > 0 ? -0.25 : 0.25, 0, -0.15);
    ear.castShadow = true;
    catGroup.add(ear);
  }

  // 眼睛：两颗小点，缩得这么小也要看得出是只猫
  for (const z of [0.065, -0.065]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), ink);
    eye.position.set(0.405, 0.06, z);
    catGroup.add(eye);
  }

  // 鼻子：一个小锥
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.055, 6), pink);
  nose.position.set(0.455, -0.005, 0);
  nose.rotation.z = -Math.PI / 2;   // 锥尖朝 +x（猫头朝向）
  catGroup.add(nose);

  // 两只小球前爪
  for (const z of [0.10, -0.10]) {
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), fur);
    paw.scale.set(0.10, 0.055, 0.065);
    paw.position.set(0.27, -0.135, z);
    catGroup.add(paw);
  }

  // 尾巴：圆柱节绕身体后半圈盘一圈
  catTail = new THREE.Group();
  const segs = 8, r = 0.12, cx = -0.27, cy = -0.06;
  for (let i = 0; i < segs; i++) {
    const th = Math.PI / 2 + (i * Math.PI) / segs;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.056, 8), fur);
    seg.position.set(cx + r * Math.cos(th), cy + r * Math.sin(th), 0);
    seg.rotation.z = th;   // 圆柱轴切向于圆弧
    seg.castShadow = true;
    catTail.add(seg);
  }
  catGroup.add(catTail);

  scene.add(catGroup);
  modelLoader.load('models/cat.glb', (gltf) => {
    if (!gltf.scene.getObjectByName('Head')) return;
    catGroup.clear();
    catGroup.add(gltf.scene);
    catIsModel = true;
    catBody = catGroup.getObjectByName('Body');
    catTail = catGroup.getObjectByName('TailRoot');
    catBodyBaseY = catBody ? catBody.scale.y : 1;
    updateCat();
  }, undefined, () => console.warn('models/cat.glb 加载失败，保留占位猫'));
}

/** 位置 / 体型 / 显隐（显隐跟 isOverview，硬切不淡入淡出） */
function updateCat() {
  if (!catGroup) return;
  const ts = dateAt(timeline.day).getTime();
  const sofa = defById('sofa'), bed = defById('bed');
  const onSofa = ts >= parseDate(sofa.appearsAt).getTime();
  const hasBed = ts >= parseDate(bed.appearsAt).getTime();
  if (!hasBed) { catGroup.visible = false; return; }

  const weeks = dayDiff(dateAt(timeline.day), new Date(timeline.start)) / 7;
  const s = weeks >= 52 ? 1 : 0.45 + 0.55 * (weeks / 52);   // 1 岁前 0.45 → 1.0
  catGroup.scale.setScalar(s);
  const seatY = onSofa ? 0.64 : 0.54; // 以已交付沙发模型的坐垫顶为准
  catGroup.position.set(onSofa ? 2.41 : -2.40, seatY + (catIsModel ? 0 : 0.18 * s), onSofa ? 0.46 : 0.90);
  catGroup.rotation.y = catIsModel ? (onSofa ? 0 : Math.PI) : (onSofa ? Math.PI : 0);
  catGroup.visible = isOverview;
}

function updateCatAnim(t) {
  if (!catGroup || !catGroup.visible) return;
  const breath = 0.97 + 0.03 * (0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 4));  // 呼吸，周期 4s
  if (catBody) {
    if (catIsModel) catBody.scale.y = catBodyBaseY * breath;
    else catBody.scale.set(BODY_SCALE.x, BODY_SCALE.y * breath, BODY_SCALE.z);
  }
  if (catTail) catTail.rotation.y = Math.sin((t * 2 * Math.PI) / 8) * 0.35;
}

/* =========================================================================
 * 时间轴
 * ========================================================================= */
function dateAt(day) {
  const d = new Date(timeline.start);
  d.setDate(d.getDate() + day);
  return d;
}

/** 两个本地零点之间相差的自然天数。 */
function dayDiff(a, b) {
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
    - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / DAY_MS);
}

const story = { events: [], index: 0, timer: 0, playing: false, currentMedia: null };
const PERMANENT = new Set(['windowsill', 'sofa', 'bowl', 'desk']);

function setupTimeline() {
  timeline.start = parseDate(DATA.cat.born).getTime();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  timeline.end = now.getTime();
  timeline.totalDays = Math.max(0, dayDiff(now, new Date(timeline.start)));
  const slider = $('#timeline-slider');
  const startDate = new Date(timeline.start);
  const monthCount = Math.max(0, (now.getFullYear() - startDate.getFullYear()) * 12 + now.getMonth() - startDate.getMonth());
  slider.max = String(monthCount);
  slider.value = String(monthCount);
  slider.addEventListener('input', () => {
    pausePlayback();
    const target = new Date(startDate);
    target.setMonth(startDate.getMonth() + Number(slider.value));
    setDay(Math.min(timeline.totalDays, dayDiff(target, startDate)));
  });
  const used = new Set();
  const furnitureEvents = DATA.objects.map((o) => {
    const media = memoriesOf(o.id).find((m) => m.src && m.date === o.appearsAt && !used.has(m.src));
    if (media) used.add(media.src);
    return {
      date: o.appearsAt,
      title: PERMANENT.has(o.id) ? `与${o.name}的回忆` : `${o.name}来到房间`,
      text: o.memory,
      media,
    };
  });
  const mediaEvents = Object.entries(DATA.memories).flatMap(([id, items]) => items
    .filter((m) => m.src && !used.has(m.src))
    .map((m) => ({ date: m.date, title: id === 'wall' ? '照片墙里的回忆' : `${defById(id)?.name || '泡芙'}的回忆`, text: m.text, media: m })));
  story.events = [
    { date: DATA.cat.born, title: '房间已经备好', text: '窗台、沙发、书桌和猫咪食堂先在这里，等泡芙慢慢认识这个家。' },
    ...furnitureEvents,
    ...mediaEvents,
    { date: todayStr(), title: '今天的房间', text: '这些物件还在，照片也替泡芙记得一路走来的日子。' },
  ].sort((a, b) => a.date.localeCompare(b.date));
  $('#week-sign').addEventListener('click', openStory);
  $('#story-close').addEventListener('click', closeStory);
  $('#story-play').addEventListener('click', () => {
    if (story.playing) { pausePlayback(); return; }
    if (story.index >= story.events.length - 1) showStoryEvent(0);
    playStory();
  });
  $('#holo-card').addEventListener('click', openVideo);
  setDay(timeline.totalDays);
}

function setDay(day) {
  timeline.day = clamp(day, 0, timeline.totalDays);
  const d = dateAt(timeline.day);
  $('#week-sign').textContent = `泡芙online第 ${dayDiff(d, new Date(timeline.start)) + 1} 天`;
  const slider = $('#timeline-slider');
  if (slider) {
    const start = new Date(timeline.start);
    slider.value = String(Math.max(0, (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth()));
  }
  applyTimeline();
  if (dateStr(d) !== lastFrameDate) buildPolaroids();
  updateCat();
  if (selectedObject) renderCard();
}

function openStory() {
  if (!$('#story-panel').classList.contains('hidden')) { closeStory(); return; }
  closeCard();
  for (const entry of furnitureMap.values()) if (!PERMANENT.has(entry.id)) entry.hasFaded = false;
  $('#story-panel').classList.remove('hidden');
  $('#story-panel').setAttribute('aria-hidden', 'false');
  $('#holo-layer').classList.remove('hidden');
  $('#holo-layer').setAttribute('aria-hidden', 'false');
  showStoryEvent(0);
  playStory();
}

function closeStory() {
  pausePlayback();
  $('#story-panel').classList.add('hidden');
  $('#story-panel').setAttribute('aria-hidden', 'true');
  $('#holo-layer').classList.add('hidden');
  $('#holo-layer').setAttribute('aria-hidden', 'true');
  const holoVideo = $('#holo-video');
  holoVideo.pause();
  holoVideo.removeAttribute('src');
  setDay(timeline.totalDays);
  showOnMonitor(null);
}

function showStoryEvent(index) {
  clearTimeout(story.timer);
  story.index = index;
  const event = story.events[index];
  setDay(dayDiff(parseDate(event.date), new Date(timeline.start)));
  $('#story-date').textContent = event.date;
  $('#story-text').textContent = event.text;
  showOnMonitor(event.media || null);
  showProjection(event);
  const panel = $('#story-panel');
  panel.classList.remove('story-enter');
  void panel.offsetWidth;
  panel.classList.add('story-enter');
  $('#story-play').textContent = index === story.events.length - 1 ? '重播回忆' : '暂停播放';
}

function playStory() {
  clearTimeout(story.timer);
  if (story.index >= story.events.length - 1) { story.playing = false; return; }
  story.playing = true;
  if (screenVideo) screenVideo.play().catch(() => {});
  if ($('#holo-video').style.display === 'block') $('#holo-video').play().catch(() => {});
  $('#story-play').textContent = '暂停播放';
  story.timer = setTimeout(() => {
    showStoryEvent(story.index + 1);
    playStory();
  }, 5200);
}

function pausePlayback() {
  clearTimeout(story.timer);
  story.playing = false;
  if (screenVideo) screenVideo.pause();
  $('#holo-video').pause();
  if (!$('#story-panel').classList.contains('hidden')) $('#story-play').textContent = '继续播放';
}

function showProjection(event) {
  const photo = $('#holo-photo');
  const video = $('#holo-video');
  video.pause();
  video.removeAttribute('src');
  photo.removeAttribute('src');
  photo.style.display = video.style.display = 'none';
  if (event.media?.src) {
    if (event.media.type === 'video') {
      video.src = mediaUrl(event.media.src);
      video.style.display = 'block';
      if (story.playing) video.play().catch(() => {});
    } else {
      photo.src = mediaUrl(event.media.src);
      photo.style.display = 'block';
    }
  }
  $('#holo-date').textContent = event.date;
  $('#holo-text').textContent = event.text;
}

function positionProjection() {
  if ($('#holo-layer').classList.contains('hidden')) return;
  const point = new THREE.Vector3();
  if (monitorScreen) monitorScreen.getWorldPosition(point);
  else point.set(2.1, 0.9, -1.55);
  point.project(camera);
  const x = (point.x + 1) * innerWidth / 2;
  const y = (1 - point.y) * innerHeight / 2;
  const card = $('#holo-card');
  const left = clamp(x - card.offsetWidth - 42, 12, innerWidth - card.offsetWidth - 12);
  const top = clamp(y - card.offsetHeight - 75, 82, innerHeight - card.offsetHeight - 85);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  $('#holo-origin').style.left = `${x}px`;
  $('#holo-origin').style.top = `${y}px`;
  const endX = left + card.offsetWidth * .78;
  const endY = top + card.offsetHeight;
  const dx = endX - x, dy = endY - y;
  const beam = $('#holo-beam');
  beam.style.left = `${x}px`;
  beam.style.top = `${y - 37}px`;
  beam.style.width = `${Math.hypot(dx, dy)}px`;
  beam.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
}

function showOnMonitor(memory, track = true) {
  if (track) story.currentMedia = memory;
  const request = ++screenRequest;
  if (screenVideo) { screenVideo.pause(); screenVideo.removeAttribute('src'); screenVideo = null; }
  if (screenTexture) { screenTexture.dispose(); screenTexture = null; }
  screenCanvas = screenContext = null;
  if (!monitorScreen) return;
  if (!memory) {
    monitorScreen.material = monitorMaterial;
    return;
  }
  screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512;
  screenCanvas.height = 288;
  screenContext = screenCanvas.getContext('2d');
  screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  monitorScreen.material = new THREE.MeshBasicMaterial({ map: screenTexture });
  if (memory.type === 'video') {
    screenVideo = document.createElement('video');
    screenVideo.src = mediaUrl(memory.src);
    screenVideo.muted = true;
    screenVideo.loop = true;
    screenVideo.playsInline = true;
    screenVideo.addEventListener('loadeddata', () => {
      if (request === screenRequest) drawOnMonitor(screenVideo);
    });
    screenVideo.play().catch(() => {});
  } else {
    const image = new Image();
    image.onload = () => { if (request === screenRequest) drawOnMonitor(image); };
    image.src = mediaUrl(memory.src);
  }
}

function drawOnMonitor(media) {
  if (!screenContext || !screenTexture) return;
  const width = media.videoWidth || media.naturalWidth;
  const height = media.videoHeight || media.naturalHeight;
  if (!width || !height) return;
  const scale = Math.min(screenCanvas.width / width, screenCanvas.height / height) * 0.78;
  screenContext.fillStyle = '#111116';
  screenContext.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
  screenContext.drawImage(media, (screenCanvas.width - width * scale) / 2, (screenCanvas.height - height * scale) / 2, width * scale, height * scale);
  screenTexture.needsUpdate = true;
}

function applyTimeline() {
  const ts = dateAt(timeline.day).getTime();
  for (const entry of furnitureMap.values()) {
    const appears = parseDate(entry.def.appearsAt).getTime();
    const shouldShow = PERMANENT.has(entry.id) || ts >= appears;
    if (shouldShow) {
      if (!entry.mesh.visible) {
        setEntryVisible(entry, true);
        if (!entry.hasFaded) {          // 每次回忆重播时重新淡入
          entry.hasFaded = true;
          entry.fading = true;
          entry.fadeT = 0;
          for (const m of entry.mats) { m.opacity = 0; m.transparent = true; m.needsUpdate = true; }
        } else {
          for (const m of entry.mats) { m.opacity = 1; m.transparent = false; m.needsUpdate = true; }
        }
      }
    } else {
      if (entry.mesh.visible) {
        setEntryVisible(entry, false);   // 淡出直接切
        entry.fading = false;
        for (const m of entry.mats) { m.opacity = 1; m.transparent = false; m.needsUpdate = true; }
        if (selectedObject === entry) closeCard();   // 家具消失 → 卡片自动关
      }
    }
  }
  if (dinerGroup) dinerGroup.visible = true;
}

/* =========================================================================
 * 拾取
 * ========================================================================= */
function setupPicking() {
  const el = renderer.domElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downX = 0, downY = 0, dragDist = 0;

  const pick = (ev) => {
    const rect = el.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const photoHits = ray.intersectObjects(photoPickables.filter((m) => m.parent?.visible), false);
    if (photoHits.length) return { entry: wallEntry, memory: photoHits[0].object.userData.memory, group: photoHits[0].object.userData.group };
    // 只拾取当前时间轴里「已经出现」的家具
    const hits = ray.intersectObjects(pickables.filter((m) => m.visible), false);
    if (!hits.length) return null;
    const id = hits[0].object.userData.id;
    const entry = furnitureMap.get(id);
    return entry ? { entry, video: hits[0].object.userData.video } : null;
  };

  el.addEventListener('pointerdown', (ev) => {
    downX = ev.clientX; downY = ev.clientY; dragDist = 0;
    $('#hint').classList.add('gone');
  });

  el.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'mouse') {
      const hit = pick(ev);
      setHover(hit?.entry || null);
      el.style.cursor = hit ? 'pointer' : '';
    } else {
      dragDist = Math.max(dragDist, Math.hypot(ev.clientX - downX, ev.clientY - downY));
    }
  });

  el.addEventListener('pointerup', (ev) => {
    dragDist = Math.max(dragDist, Math.hypot(ev.clientX - downX, ev.clientY - downY));
    if (dragDist > 6) unlockCamera();   // 锁定状态下手动拖拽 → 解除锁定
  });

  el.addEventListener('click', (ev) => {
    if (dragDist > 6) { dragDist = 0; return; }   // 拖完不算点中
    const hit = pick(ev);
    if (hit?.video) openVideo();
    else if (hit?.memory) openCard(hit.entry, hit.memory, hit.group);
    else if (hit) { openCard(hit.entry); flyTo(hit.entry); }
    else { closeCard(); }
  });
}

function setHover(entry) {
  if (hoveredObject === entry) return;
  if (hoveredObject && hoveredObject !== selectedObject) highlight(hoveredObject, false);
  hoveredObject = entry;
  if (hoveredObject && hoveredObject !== selectedObject) highlight(hoveredObject, true);
}

function setupVideo() {
  $('#video-close').addEventListener('click', closeVideo);
  $('#video-layer').addEventListener('click', (ev) => {
    if (ev.target === $('#video-layer')) closeVideo();
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !$('#video-layer').classList.contains('hidden')) closeVideo();
  });
}

function openVideo() {
  if (story.playing) pausePlayback();
  const video = $('#computer-video');
  const photo = $('#computer-photo');
  const memory = story.currentMedia;
  const url = memory?.src || DATA.computerVideo;
  const isImage = memory?.type === 'image';
  video.style.display = url && !isImage ? 'block' : 'none';
  photo.style.display = isImage ? 'block' : 'none';
  $('#video-empty').style.display = url ? 'none' : 'grid';
  if (isImage) photo.src = mediaUrl(url);
  else if (url) { video.src = mediaUrl(url); video.play().catch(() => {}); }
  $('#video-layer').classList.remove('hidden');
  $('#video-layer').setAttribute('aria-hidden', 'false');
}

function closeVideo() {
  const video = $('#computer-video');
  video.pause();
  $('#video-layer').classList.add('hidden');
  $('#video-layer').setAttribute('aria-hidden', 'true');
}

function highlight(entry, on) {
  if (!entry) return;
  for (const m of entry.mats) {          // 主体 + 装饰件一起亮
    if (!m.emissive) continue;
    m.emissive.setHex(on ? 0x4a3a2c : 0x000000);
    m.emissiveIntensity = on ? 0.5 : 0;
  }
}

/* =========================================================================
 * 记忆卡片（普通 DOM 叠在 canvas 上）
 * ========================================================================= */
let cardIndex = 0;
let cardItem = null;

function setupCard() {
  $('#card-close').addEventListener('click', closeCard);
  $('#card-prev').addEventListener('click', () => stepCard(-1));
  $('#card-next').addEventListener('click', () => stepCard(1));
  $('#card-layer').addEventListener('click', (ev) => {
    if (ev.target === $('#card-layer')) closeCard();   // 点卡片外空白关闭
  });
  window.addEventListener('keydown', (ev) => {
    if (!$('#record-layer').classList.contains('hidden')) {
      if (ev.key === 'Escape') closeRecord();
      return;
    }
    if ($('#card-layer').classList.contains('hidden')) {
      if (ev.key === 'Escape') closeCard();
      return;
    }
    if (ev.key === 'Escape') closeCard();
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepCard(-1); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); stepCard(1); }
  });
}

function openCard(entry, initialItem = null, group = null) {
  selectedObject = entry;
  selectedWallGroup = group;
  // 默认停在第一张照片上；这件家具一张照片都没有时才停在那条纯文字记忆上
  cardItem = initialItem || cardList()[0] || null;
  cardIndex = 0;
  if (hoveredObject && hoveredObject !== entry) highlight(hoveredObject, false);
  highlight(entry, true);            // 卡片打开期间该家具保持高亮
  renderCard();
  $('#card-layer').classList.remove('hidden');
  $('#card-layer').setAttribute('aria-hidden', 'false');
}

function closeCard() {
  if (selectedObject) highlight(selectedObject, false);
  selectedObject = null;
  selectedWallGroup = null;
  cardItem = null;
  $('#card-layer').classList.add('hidden');
  $('#card-layer').setAttribute('aria-hidden', 'true');
  $('#card-media').innerHTML = '';
}

function cardList() {
  const currentDate = dateStr(dateAt(timeline.day));
  if (selectedObject?.id === 'wall') return selectedWallGroup?.photos || (cardItem ? [cardItem] : []);
  return selectedObject ? memoriesOf(selectedObject.id).filter((m) => m.src && m.date <= currentDate) : [];
}

function stepCard(delta) {
  const list = cardList();
  if (!list.length) return;
  const next = cardIndex + delta;
  if (next < 0 || next >= list.length) return;   // 到边界不循环
  cardIndex = next;
  cardItem = list[next];
  renderCard();
}

function renderCard() {
  if (!selectedObject) return;
  const entry = selectedObject;
  const list = cardList();
  cardIndex = cardItem ? list.findIndex((m) => m.src === cardItem.src) : -1;
  if (cardIndex < 0) cardIndex = 0;
  const item = list[cardIndex];
  cardItem = item || null;

  $('#card-name').textContent = selectedWallGroup?.title || entry.def.name;
  const currentDate = dateStr(dateAt(timeline.day));
  const chapter = (DATA.chapters || []).find((c) => currentDate >= c.from && currentDate <= c.to);
  $('#card-memory').textContent = selectedWallGroup?.description || (chapter && entry.def.memoryByChapter?.[chapter.id]) || entry.def.memory;

  const media = $('#card-media');
  const oldVideo = media.querySelector('video');
  if (oldVideo) oldVideo.pause();          // 切图时暂停上一个视频
  media.innerHTML = '';

  if (item && item.src) {
    if (item.type === 'video') {
      const v = document.createElement('video');
      v.controls = true; v.muted = false; v.playsInline = true; v.preload = 'metadata';
      v.src = mediaUrl(item.src);
      if (item.live) attachLiveGesture(v);
      v.addEventListener('error', () => { media.innerHTML = ''; media.appendChild(placeholderNode(entry.def.name)); });
      media.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.alt = entry.def.name + ' 的照片';
      img.src = mediaUrl(item.src);
      img.addEventListener('error', () => { media.innerHTML = ''; media.appendChild(placeholderNode(entry.def.name)); });
      media.appendChild(img);
    }
  } else {
    media.appendChild(placeholderNode(entry.def.name));
  }

  $('#card-date').textContent = item ? item.date : '';
  // type=text 的那一条就是 furniture 的 memory 本身，上面已经显示过一句了，这里不重复
  $('#card-text').textContent = item && item.type !== 'text' ? item.text : '';
  const hint = $('#card-hint');
  if (hint) hint.textContent = item?.live ? '按住画面，它会动、也会出声；松手就定格' : '';
  $('#card-count').textContent = `${item ? cardIndex + 1 : 0} / ${list.length}`;
  $('#card-prev').disabled = cardIndex <= 0;
  $('#card-next').disabled = !item || cardIndex >= list.length - 1;
}

/* =========================================================================
 * 实况照片手势
 * 苹果实况照片的本质是「按下有动作、有声音」。当普通视频点开就播，把这一点丢了。
 * 所以：按住画面 → 动起来并出声；松手 → 立刻定格回第一帧。
 * ========================================================================= */
function attachLiveGesture(v) {
  const REST = 0.02;              // 定格帧
  const HOLD = 200;               // 按住多久才算「按住」
  const CTRL_H = 46;              // 原生控件条高度，点在上面不接管
  let timer = null, holding = false;

  const begin = (e) => {
    if (holding) return;
    const r = v.getBoundingClientRect();
    if (e.clientY - r.top > r.height - CTRL_H) return;   // 按在控件条上
    holding = true;
    timer = setTimeout(() => {
      timer = null;
      v.muted = false;
      v.currentTime = 0;
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    }, HOLD);
  };
  const end = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!holding) return;
    holding = false;
    if (!v.paused) v.pause();
    v.currentTime = REST;          // 松手就定格
  };

  v.addEventListener('pointerdown', begin);
  v.addEventListener('pointerup', end);
  v.addEventListener('pointerleave', end);
  v.addEventListener('pointercancel', end);
  v.addEventListener('ended', () => { v.currentTime = REST; });
  // 先把第一帧亮出来，否则停在 metadata 上是一片黑
  v.addEventListener('loadedmetadata', () => { v.currentTime = REST; }, { once: true });
}

function placeholderNode(name) {
  const d = document.createElement('div');
  d.className = 'placeholder';
  const a = document.createElement('span'); a.textContent = name;
  const b = document.createElement('span'); b.textContent = '还没有照片';
  d.appendChild(a); d.appendChild(b);
  return d;
}

/* =========================================================================
 * 相机：自由轨道 + 点击推近 + 回到全景
 * ========================================================================= */
function setupCamera() {
  $('#btn-overview').addEventListener('click', () => returnToOverview());
}

function setCamMode(mode) {
  cam.mode = mode;
  isOverview = (mode === 'free' || mode === 'returning');
  updateCat();     // 推近时猫消失，回全景猫回来（硬切）
}

function flyTo(entry) {
  const to = { pos: focusPos(entry), target: new THREE.Vector3(entry.def.pos[0], entry.def.pos[1], entry.def.pos[2]) };
  startTween(to, 0.8, 'locked', () => {
    controls.enabled = true;
    controls.enablePan = false;    // 锁定 target，只能绕着转
    setCamMode('locked');          // 锁定状态：isOverview = false，猫不在这场景里
  });
}

/** 相机落点：家具中心 + 按家具尺寸算的斜后方偏移，并保证落在房间里（不会被墙挡住） */
function focusPos(entry) {
  const def = entry.def;
  const center = entry.bbox ? entry.bbox.getCenter(new THREE.Vector3()) : new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]);
  const size = entry.bbox ? entry.bbox.getSize(new THREE.Vector3()) : new THREE.Vector3(...def.size);
  const radius = Math.max(size.x, size.y, size.z);
  const want = Math.min(3.2, Math.max(1.4, radius * 1.15 + 0.9));   // 偏移量按尺寸取，不写死

  let dir = camera.position.clone().sub(center);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0.8, 1);
  dir.normalize();
  if (dir.y < 0.35) { dir.y = 0.35; dir.normalize(); }               // 保持俯视感

  // 相机始终留在房间脚印内（x ∈ [-2.85, 2.85]、z ≥ -1.85、y ∈ [0.5, 4.6]），任何角度都穿不过墙
  let t = want;
  if (dir.x > 1e-6) t = Math.min(t, (2.85 - center.x) / dir.x);
  else if (dir.x < -1e-6) t = Math.min(t, (-2.85 - center.x) / dir.x);
  if (dir.z > 1e-6) t = Math.min(t, (4.6 - center.z) / dir.z);
  else if (dir.z < -1e-6) t = Math.min(t, (-1.85 - center.z) / dir.z);
  if (dir.y > 1e-6) t = Math.min(t, (4.6 - center.y) / dir.y);
  else if (dir.y < -1e-6) t = Math.min(t, (0.5 - center.y) / dir.y);
  t = Math.max(0.9, t);
  return center.clone().add(dir.multiplyScalar(t));
}

function startTween(to, dur, thenMode, onDone) {
  cam.tween = {
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPos: to.pos,
    toTarget: to.target,
    t: 0, dur, thenMode, onDone,
  };
  controls.enabled = false;
  setCamMode(thenMode === 'locked' ? 'flying' : 'returning');
}

function returnToOverview(onDone) {
  if (cam.tween) cam.tween = null;
  startTween({ pos: HOME.pos.clone(), target: HOME.target.clone() }, 0.6, 'free', () => {
    controls.enabled = true;
    controls.enablePan = true;     // 解锁 target
    setCamMode('free');
    if (onDone) onDone();
  });
}

function unlockCamera() {
  if (cam.mode !== 'locked') return;
  controls.enablePan = true;
  setCamMode('free');              // 保持当前视角，不重置
}

/* =========================================================================
 * 页面内记录（showDirectoryPicker + IndexedDB）
 * ========================================================================= */
function setupRecord() {
  const sel = $('#rec-object');
  for (const def of OBJECT_DEFS) {
    const o = document.createElement('option');
    o.value = def.id;
    o.textContent = def.name;
    sel.appendChild(o);
  }
  $('#rec-date').value = todayStr();
  $('#rec-date').max = todayStr();

  $('#rec-file').addEventListener('change', onFileChange);
  $('#rec-form').addEventListener('submit', onSubmit);
  $('#rec-close').addEventListener('click', closeRecord);
  $('#rec-cancel').addEventListener('click', closeRecord);
  $('#btn-record').addEventListener('click', onRecordClick);

  // 刷新后不用重选：handle 存在 IndexedDB 里（但每次新会话仍需点一下按钮重新授权）
  idbGet(IDB_KEY).then((h) => {
    storedDirHandle = h || null;
    if (storedDirHandle) $('#btn-record').textContent = '继续记录';
  }).catch(() => { /* IndexedDB 不可用也不影响别的功能 */ });
}

async function onRecordClick() {
  if (typeof window.showDirectoryPicker !== 'function') {
    toast('当前浏览器不支持页面内记录，请用 Chrome 打开，或把照片按 photos/<家具id>/YYYY-MM-DD_描述.jpg 命名后丢进文件夹再跑 python3 gen_memories.py', 7000);
    return;
  }
  if (dirHandle) { openRecordForm(); return; }

  try {
    if (storedDirHandle) {
      const perm = await storedDirHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') dirHandle = storedDirHandle;
    }
    if (!dirHandle) {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const ok = await validateDir(dirHandle);
      if (!ok) {
        toast('这个目录里没找到任何家具子目录，请选项目里的 photos/ 目录再试一次');
        dirHandle = null;
        await idbDel(IDB_KEY).catch(() => {});
        storedDirHandle = null;
        $('#btn-record').textContent = '记录今天';
        return;
      }
      storedDirHandle = dirHandle;
      await idbSet(IDB_KEY, dirHandle).catch(() => {});
    }
    if (!(await validateDir(dirHandle))) {
      toast('这个目录里没找到任何家具子目录，请选项目里的 photos/ 目录再试一次');
      dirHandle = null;
      return;
    }
    openRecordForm();
  } catch (err) {
    if (err && err.name === 'AbortError') return;   // 用户自己取消了
    toast('打不开目录：' + ((err && err.message) || '未知错误'));
  }
}

/** 目录里至少要有一个家具 id 子目录，不然就是选错了 */
async function validateDir(handle) {
  const ids = new Set(OBJECT_DEFS.map((o) => o.id));
  try {
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === 'directory' && ids.has(name)) return true;
    }
  } catch (e) { return false; }
  return false;
}

function openRecordForm() {
  if (story.playing) pausePlayback();      // 表单打开时暂停播放
  if (!$('#story-panel').classList.contains('hidden')) closeStory();
  if (cam.mode === 'locked' || cam.mode === 'flying') {
    returnToOverview(() => showRecordForm());
  } else {
    showRecordForm();
  }
}

function showRecordForm() {
  $('#record-layer').classList.remove('hidden');
  $('#record-layer').setAttribute('aria-hidden', 'false');
}

function closeRecord() {
  $('#record-layer').classList.add('hidden');
  $('#record-layer').setAttribute('aria-hidden', 'true');
  clearRecError();
}

function clearRecError() {
  $('#rec-error').textContent = '';
  document.querySelectorAll('#rec-form .invalid').forEach((el) => el.classList.remove('invalid'));
}

function markInvalid(sel, msg) {
  const el = $(sel);
  if (el) el.classList.add('invalid');
  $('#rec-error').textContent = msg;
}

function onFileChange() {
  const box = $('#rec-preview');
  box.innerHTML = '';
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
  const file = $('#rec-file').files[0];
  if (!file) return;
  previewUrl = URL.createObjectURL(file);
  const el = document.createElement(file.type.startsWith('video') ? 'video' : 'img');
  el.src = previewUrl;
  if (el.tagName === 'VIDEO') { el.controls = true; el.muted = true; el.playsInline = true; }
  box.appendChild(el);
}

async function onSubmit(ev) {
  ev.preventDefault();
  clearRecError();

  const objId = $('#rec-object').value;
  const date = $('#rec-date').value;
  const desc = $('#rec-desc').value.trim();
  const file = $('#rec-file').files[0];

  let bad = false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parseDate(date).getTime()) || dateStr(parseDate(date)) !== date) {
    markInvalid('#rec-date', '日期格式不对，应该是 2026-10-24 这样');
    bad = true;
  } else if (date > todayStr()) {
    markInvalid('#rec-date', '日期不能晚于今天');
    bad = true;
  }
  if (!desc) {
    markInvalid('#rec-desc', '写一句话吧，这是以后会回来看的');
    bad = true;
  }
  if (!file) {
    markInvalid('#rec-file', '选一张照片或一个视频');
    bad = true;
  } else {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      markInvalid('#rec-file', '只支持 jpg / jpeg / png / webp / mp4');
      bad = true;
    }
  }
  if (bad) return;

  const btn = $('#rec-submit');
  btn.disabled = true;
  btn.textContent = '写入中…';
  try {
    const record = await writeRecord(objId, date, desc, file);
    let storageFailed = false;
    try {
      const records = JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY) || '[]');
      records.push(record);
      localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
    } catch (_) {
      storageFailed = true;
    }
    closeRecord();
    $('#rec-file').value = '';
    $('#rec-desc').value = '';
    $('#rec-preview').innerHTML = '';
    await rescanDir();
    const available = await fetch(mediaUrl(`photos/${objId}/${record.file}`), { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
    if (!available) toast('照片已写进所选目录，但网站读不到。请选网站根目录内的 photos 文件夹，或运行 python3 gen_memories.py', 7000);
    else if (storageFailed) toast('照片已存进文件夹，但浏览器无法保存本地记录；请运行 python3 gen_memories.py 恢复索引', 7000);
    else toast('已记录！房间马上更新');
  } catch (err) {
    toast('写文件失败：' + ((err && err.message) || '未知错误'));
  } finally {
    btn.disabled = false;
    btn.textContent = '保存到房间';
  }
}

/** 写文件：photos/<家具id>/YYYY-MM-DD_描述.ext，同名加 -2、-3，绝不覆盖 */
async function writeRecord(objId, date, desc, file) {
  if (!dirHandle) throw new Error('还没授权 photos/ 目录');
  const sub = await dirHandle.getDirectoryHandle(objId, { create: true });
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const safe = sanitizeDesc(desc);
  const name = await uniqueName(sub, `${date}_${safe}.${ext}`);
  const fh = await sub.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(file);
  await w.close();
  return { id: objId, date, text: safe, file: name };
}

/** 描述里的非法字符（/ : * ? " < > | 空格 # %）一律换成 - */
function sanitizeDesc(desc) {
  const s = String(desc).replace(/[\\/:*?"<>|\s#%]+/g, '-').replace(/^[.\-]+|[.\-]+$/g, '');
  return s || '回忆';
}

async function uniqueName(dir, name) {
  const dot = name.lastIndexOf('.');
  const base = name.slice(0, dot), ext = name.slice(dot);
  let candidate = name;
  for (let i = 2; i < 500; i++) {
    try {
      await dir.getFileHandle(candidate);
    } catch (e) {
      return candidate;   // 不存在，用这个名字
    }
    candidate = `${base}-${i}${ext}`;
  }
  return candidate;
}

/**
 * 重扫授权目录，用与 gen_memories.py 完全一致的规则解析，重建内存数据源。
 * （gen_memories.py 里的同名正则和合并顺序就是这里的镜像，改一处改两处。）
 */
async function rescanDir() {
  if (!dirHandle) return;
  const mem = {};
  const ids = new Set(OBJECT_DEFS.map((o) => o.id));
  for (const def of OBJECT_DEFS) mem[def.id] = [];

  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind !== 'directory' || !ids.has(name)) continue;
    for await (const [fname, fentry] of entry.entries()) {
      if (fentry.kind !== 'file') continue;
      const m = /^(\d{4}-\d{2}-\d{2})_(.+)\.(jpg|jpeg|png|webp|mp4)$/i.exec(fname);
      if (!m) continue;
      const src = `photos/${name}/${fname}`;
      const assignment = DATA.mediaAssignments?.[src] || {};
      const target = assignment.target || name;
      if (target === 'computer') continue;
      (mem[target] ||= []).push({
        date: m[1],
        text: assignment.text || m[2],
        src,
        type: m[3].toLowerCase() === 'mp4' ? 'video' : 'image',
        live: target === 'bowl' && m[1] === '2022-04-19' && m[3].toLowerCase() === 'mp4'
          || target === 'ribbon' && m[1] === '2026-01-18' && m[3].toLowerCase() === 'mp4',
      });
    }
  }
  for (const def of OBJECT_DEFS) {
    mem[def.id].push({ date: def.appearsAt, text: def.memory, src: null, type: 'text' });
    mem[def.id].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  DATA.memories = mem;
  CACHE_EPOCH = Date.now();     // 新照片的 URL 带新戳，别被旧缓存挡住
  buildPolaroids();     // 拍立得同步换成最新一张
  applyTimeline();     // 时间轴状态同步刷新
  updateCat();
  if (selectedObject) { cardItem = null; cardIndex = 0; renderCard(); }
}

/* =========================================================================
 * IndexedDB（存目录 handle）
 * ========================================================================= */
function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open('puff-room', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const rq = tx.objectStore('kv').get(key);
    rq.onsuccess = () => { db.close(); resolve(rq.result); };
    rq.onerror = () => { db.close(); reject(rq.error); };
  });
}

async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/* =========================================================================
 * 提示条
 * ========================================================================= */
let toastTimer = 0;
function toast(msg, ms = 3200) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* =========================================================================
 * 渲染循环（所有动画都在这里驱动，不用 setInterval）
 * ========================================================================= */
let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  // 家具淡入
  for (const entry of furnitureMap.values()) {
    if (!entry.fading) continue;
    entry.fadeT += dt;
    const p = clamp(entry.fadeT / FADE_IN, 0, 1);
    for (const m of entry.mats) m.opacity = p;
    if (p >= 1) {
      entry.fading = false;
      for (const m of entry.mats) { m.opacity = 1; m.transparent = false; m.needsUpdate = true; }
    }
  }

  // 相机插值
  if (cam.tween) {
    const tw = cam.tween;
    tw.t += dt;
    const k = clamp(tw.t / tw.dur, 0, 1);
    const e = easeInOutCubic(k);
    camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
    controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
    if (k >= 1) {
      cam.tween = null;
      controls.enabled = true;
      if (tw.onDone) tw.onDone();
    }
  }

  updateCatAnim(now / 1000);
  if (screenVideo && !screenVideo.paused && screenVideo.readyState >= 2) drawOnMonitor(screenVideo);
  controls.update();
  positionProjection();
  renderer.render(scene, camera);
}

/* =========================================================================
 * go
 * ========================================================================= */
init();
