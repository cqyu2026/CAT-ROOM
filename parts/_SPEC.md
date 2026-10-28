# 泡芙的房间 —— 家具建模规范（每个子 agent 都要照这份做）

你负责「泡芙的房间」3D 场景里的**一件家具**。房间本体（地板、墙、窗、百叶窗、墙饰、灯光）、
时间轴、拾取、卡片、相机由别人负责，你只管你这件家具的模型。

风格参照物（请用 Read 工具直接看图）：

- `/Users/yu/puff-room/design/puff-top-plan.png` —— **俯视图，布局的唯一权威**。家具之间的相对位置以它为准
- `/Users/yu/puff-room/design/puff-front-elevation.jpg` —— 正视图，看家具的高度比例、配色、细节密度
- `/Users/yu/puff-room/design/puff-side-elevation.jpg` —— 侧视图，看纵深关系

## 你要交付的文件

只写一个文件：`/Users/yu/puff-room/parts/<你的家具id>.js`

契约（必须一模一样）：

```js
import * as THREE from 'three';
import { Part, PAL } from './common.js';

export function build(def) {
  const p = new Part(def);
  // 用 p.box / p.cyl / p.sph / p.cone / p.star / p.plane 拼
  return p.finish();          // 返回 { group, meshes, mats }
}
```

规则：

- 只能 import `'three'` 和 `'./common.js'`，不许 import 任何别的文件
- 不许直接碰 scene（你拿不到）、不许写 DOM、不许 setInterval / setTimeout 驱动动画
- 只写你那个文件，**不许改** `main.js` / `parts/common.js` / 别人的 parts 文件
- `def` 就是 `data/objects.json` 里那一条：`{ id, name, appearsAt, shape, pos, size, color, memory }`

## 先读 common.js

`/Users/yu/puff-room/parts/common.js` 是公共 API，**必须用它提供的现成件，不要自己重写一套**。里面已有：

- `PAL` —— 全房间统一的配色表（暖白墙、浅木地板、雾蓝软装、原木家具、珊瑚橘、绿植…）。**颜色一律从 PAL 里取**
- `Part` —— 拼家具的积木类
- `roundedBoxGeo` / `starGeo` —— 圆角盒、五角星
- 程序化贴图：`makeWoodTexture` / `makeStarPatternTexture` / `makeArtTexture` / `makeClockTexture` / `makeSkyTexture` / `makeShadowTexture` / `makePlaceholderTexture`
- `buildDefault(def)` —— 兜底造型（只造一个主体方块），你**不要**用它兜底

### Part 的方法签名

```js
p.box(w, h, d, x, y, z, color, opt?)      // 方盒子，默认圆角
p.cyl(d, h,   x, y, z, color, opt?)       // 圆柱：d 是直径，h 是高
p.cone(d, h,  x, y, z, color, opt?)       // 圆锥：d 是底直径，h 是高
p.sph(d,      x, y, z, color, opt?)       // 球：d 是直径
p.star(rO, rI, h, x, y, z, color, opt?)   // 躺平的五角星：外接圆半径 / 内半径 / 厚度
p.plane(w, d, x, y, z, color, opt?)       // 躺平的平面（贴图层）
p.add(geo, x, y, z, color, opt?)          // 通用：自己 new 几何体时用
```

`opt` 可选字段：

```js
{ rot: [rx, ry, rz],   // 弧度
  scale: [sx, sy, sz],
  round: 0.04,         // box 的圆角半径
  seg: 26,             // 圆柱/锥的细分
  rough: 0.85,         // 材质粗糙度
  map: <CanvasTexture>, // 贴图（只能用 common.js 里现画的那些）
  transparent: true,
  noShadow: true }     // 这块不投影（比如贴在地上的贴片）
```

其它便利属性：

```js
p.baseColor   // 数据里的主色（= def.color）
p.floorY      // 贴地家具的底面局部 y = -def.size[1] / 2
p.topY        // 主体顶面的局部 y = +def.size[1] / 2
```

`Part.add` 已经自动帮你做三件事，不用重复写：设 `castShadow`/`receiveShadow`、给 mesh 打
`userData.id`（拾取靠它认人）、把材质登记进 `p.mats`（高亮和淡入淡出靠它）。

## 坐标约定（最容易搞错）

- **局部原点 = `def.pos`**，也就是主体几何体的中心
- x 向右为正，y 向上为正，z 朝房间敞开的那一面（前墙）是正
- 贴地家具的底面在局部 y = `-def.size[1] / 2`
- 悬在墙上的（窗台）局部 y = 0 就是它自己的中心

## 硬约束

1. **几何体只能用 Box / Cylinder / Sphere / Cone**。不许出现 Torus / Extrude / Lathe / RoundedBox / Shape / Text 等
2. **不许引入外部模型或贴图文件**。要贴图就用 common.js 里现画的 Canvas 贴图函数
3. 主体体量不要超出数据给的 `size` 太多（装饰件可以略微超出，但别撞到邻居、别撞到墙）
4. 别越出房间：墙内 x ∈ [-3, 3]，z ∈ [-2, 2]，地板 y = 0，墙高 2.2
5. 风格：柔和手办感。**所有方盒子都要圆角**（`p.box` 默认就是），材质哑光，颜色从 PAL 取
6. 细节密度参考正视图：家具要有软垫、木框、小物件，但别堆到看不清是什么

## 房间总布局（俯视图为准，后墙在 z = -2，正面 z = +2 敞开）

| 家具 | 世界坐标 (x, y, z) | 尺寸 (w,h,d) | 位置 |
|---|---|---|---|
| 猫窝 bed | (-1.90, 0.20, 0.90) | 1.20×0.40×1.00 | 左前 |
| 猫碗 bowl | (-1.15, 0.045, 1.30) | 圆柱 d0.30 h0.09 | 猫窝右前方 |
| 玩具球 ball | (0.20, 0.18, 1.00) | 球 d0.36 | 房间中央偏前 |
| 窗台 windowsill | (-1.00, 0.90, -1.82) | 1.80×0.15×0.35 | 后墙窗下（x 跨 -1.9~ -0.1） |
| 猫爬架 tree | (-2.30, 0.90, -1.45) | 圆柱 d0.80 h1.80 | 后左角，紧挨窗台左边 |
| 书桌 desk | (0.90, 0.375, -1.55) | 1.60×0.75×0.70 | 后墙偏右 |
| 门垫 doormat | (1.00, 0.015, 1.75) | 0.90×0.03×0.60 | 前沿中间 |
| 沙发 sofa | (2.35, 0.425, 0.40) | 0.95×0.85×2.00 | 靠右墙 |
| 地毯 rug | (1.15, 0.010, 0.40) | 1.40×0.02×1.90 | 中右 |

窗洞在**后墙**，x ∈ [-1.9, -0.1]，y ∈ [1.0, 2.05]。

## 泡芙会趴的地方（尺寸必须对得上）

- 沙发：泡芙趴在世界 (2.24, ?, 0.46)，**沙发坐垫顶面必须落在世界 y ≈ 0.99**（局部 y ≈ +0.565）
- 猫窝：泡芙趴在世界 (-1.90, ?, 0.90)，**猫窝坐垫顶面必须落在世界 y ≈ 0.54**（局部 y ≈ +0.34）

## 验收

写完自己跑一遍语法检查，必须过：

```bash
cp /Users/yu/puff-room/parts/<你的id>.js /tmp/x.mjs && node --check /tmp/x.mjs
```

最后回我一段话：这件家具由哪几个零件组成（各自尺寸 + 颜色）、它和邻居的间距是多少、
以及有没有需要我配合调整的地方（比如它比 data.size 高了多少）。
