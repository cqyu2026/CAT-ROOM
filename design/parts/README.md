# 泡芙房间 · 家具部件三视图参考图

这批图是给**外部 3D 模型生成工具**用的参考图，不是最终素材。
每件家具两张：一张**三视图**（正 / 俯 / 侧，带尺寸标注），一张 **3/4 透视**。

生成后拿回 3D 模型，转写到 `parts/<id>.js` 即可替换当前占位桩。

## 房间布局总图

`../puff-layout-sheet.jpg` —— **一个文件里同时是正视图 / 俯视图 / 侧视图**，带 6.00 m × 4.00 m × 2.20 m 的房间尺寸线。
这是摆放各部件位置的**唯一权威**，比本目录的单件参考图优先。

坐标约定：房间 x ∈ [-3, 3]（左右），z ∈ [-2, 2]（前后，后墙 z = -2 开着窗，前沿 z = +2 敞开），y 向上。

## 文件对照表

| 家具 id | 中文名 | 三视图 | 透视 | 世界坐标 (x,y,z) | 尺寸 (w×h×d, m) | 关键高度 |
|---|---|---|---|---|---|---|
| `bed` | 猫窝 | `puff-part-bed.jpg` | `puff-part-bed-persp.jpg` | (-1.90, 0.20, 0.90) | 1.20 × 0.40 × 1.00 | **软垫顶面 0.54**（猫趴这） |
| `bowl` | 猫碗 | `puff-part-bowl.jpg` | `puff-part-bowl-persp.jpg` | (-1.15, 0.045, 1.30) | ⌀0.30 × 0.09 | — |
| `ball` | 玩具球 | `puff-part-ball.jpg` | `puff-part-ball-persp.jpg` | (0.20, 0.18, 1.00) | ⌀0.36 | — |
| `windowsill` | 窗台 | `puff-part-windowsill.jpg` | `puff-part-windowsill-persp.jpg` | (-1.00, 0.90, -1.82) | 1.80 × 0.15 × 0.35 | 悬墙，整体 ≤ 0.99 |
| `tree` | 猫爬架 | `puff-part-tree.jpg` | `puff-part-tree-persp.jpg` | (-2.30, 0.90, -1.45) | ⌀0.80 × 1.80 | 紧挨窗台左侧 |
| `desk` | 书桌 | `puff-part-desk.jpg` | `puff-part-desk-persp.jpg` | (0.90, 0.375, -1.55) | 1.60 × 0.75 × 0.70 | — |
| `doormat` | 门垫 | `puff-part-doormat.jpg` | `puff-part-doormat-persp.jpg` | (1.00, 0.015, 1.725) | 0.90 × 0.03 × 0.55 | 贴地，前沿齐 z=2.0 |
| `sofa` | 沙发 | `puff-part-sofa.jpg` | `puff-part-sofa-persp.jpg` | (2.35, 0.425, 0.40) | 0.95 × 0.85 × 2.00 | **坐垫顶面 0.99**（猫趴这） |
| `rug` | 地毯 | `puff-part-rug.jpg` | `puff-part-rug-persp.jpg` | (1.15, 0.010, 0.40) | 1.40 × 0.02 × 1.90 | 贴地 |

> 门垫进深用 0.55 而不是数据里的 0.60 —— 数据那样算出来会超出房间前沿 z = 2.0。

## 图面说明

- **三视图**左→右：正视图 / 俯视图 / 侧视图，全部正交，无透视
- 每件都标了真实尺寸（米），带箭头尺寸线和引导线
- 图右下角有平台自动加的「由 MiniMax AI 生成」水印，去不掉
- 视角约定：**正视图 = 朝着家具正面看**，**俯视图 = 正上方**，**侧视图 = 从右侧看**
  - 猫爬架的正面朝 +z（房间敞开面）
  - 沙发的正面朝 -x（面向房间中心，靠右墙）
  - 窗台的正面朝 +z（从房间里看）

## 配色

沿用房间的 PAL 配色表（`parts/common.js` 里的 `PAL`）：

- 暖白墙 `#f3f0e9`、浅木地板 `#efdcb4`、原木 `#b98a58` / `#9a6f43`
- 雾蓝软装 `#b7d3ec` / `#7ea6cf` / `#dbe9f5`
- 米白 `#f8f4ec`、沙色 `#ece2c8`、纸箱 `#d7ae80`
- 珊瑚橘 `#e8734a`、绿植 `#83a86a` / `#5d8a4b`、陶土 `#c98f6b`
- 炭灰 `#5f5750`、麻绳 `#d9c39a`

## 重新生成

```bash
cd design/parts
python3 _gen.py all          # 写 _views.json / _persp.json
MCODE_REGION=cn mcode-tools connector call connector__matrix__generate_image --args-file _views.json
```

`_gen.py` 里集中存着每件家具的造型描述和尺寸标注文案，改词后重跑即可。
`_samples.json` 是最初猫窝 + 沙发两张样张的原始参数。
