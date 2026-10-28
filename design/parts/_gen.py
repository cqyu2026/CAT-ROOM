#!/usr/bin/env python3
"""
泡芙的房间 —— 家具部件三视图参考图生成器

用途：为 data/objects.json 里的每件家具生成「2D 三视图 + 3/4 透视」参考图，
      供外部 3D 模型生成工具使用。

用法：
    python3 _gen.py views    # 只写三视图的 args json
    python3 _gen.py persp    # 只写透视图的 args json
    python3 _gen.py all      # 两个都写

产出：
    _views.json  8 件待出图的三视图（bed / sofa 已单独出过，样张不入此文件）
    _persp.json  10 件的 3/4 透视

再调用：
    mcode-tools connector call connector__matrix__generate_image --args-file _views.json
"""

import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent

# --------------------------------------------------------------------------
# 每件家具的造型描述 / 配色 / 尺寸标注
# --------------------------------------------------------------------------
PARTS = {
    "bowl": {
        "name_en": "a small round ceramic pet food bowl",
        "front": (
            "the bowl seen perfectly straight on from the front at floor level, straight-on "
            "horizontal eye level. It is a low round cream ceramic bowl with a slightly wider "
            "thick rim ring at the top and a small foot ring at the bottom, filled with a few "
            "small coral-orange and warm brown kibble pieces visible just below the rim"
        ),
        "top": (
            "the same bowl seen perfectly straight down from above, a plain plan view. You see "
            "a circle with a wide cream outer rim ring, a slightly smaller inner circle, and the "
            "kibble pieces clustered in the middle"
        ),
        "side": (
            "the same bowl seen perfectly straight on from its right-hand side at floor level. "
            "Because the bowl is perfectly round it reads as the same silhouette as the front "
            "elevation, a low cream cylinder with a wide top rim and a small foot ring"
        ),
        "desc3q": (
            "a small round cream ceramic pet bowl with a slightly wider thick rim ring and a "
            "small foot ring, holding a few coral-orange kibble pieces"
        ),
        "palette": "warm cream white and pale beige for the ceramic, coral orange for the kibble",
        "dims_views": (
            "For the front elevation label the overall diameter as 0.30 m and the overall height "
            "as 0.09 m. For the top view label the diameter as 0.30 m. For the side elevation "
            "label the diameter as 0.30 m."
        ),
        "dims_p": "label the overall diameter as 0.30 m and the overall height as 0.09 m",
    },
    "ball": {
        "name_en": "a round patchwork yarn toy ball",
        "front": (
            "the ball seen perfectly straight on from the front, straight-on horizontal eye level. "
            "It is a coral orange plush yarn ball with a wide cream woven band running around it "
            "and several rounded misty blue and cream patch segments bulging out of its surface, "
            "with two tiny yarn knots"
        ),
        "top": (
            "the same ball seen perfectly straight down from above, a plain plan view, a circle "
            "showing the coral orange surface with the cream band and the misty blue patch "
            "segments arranged across it"
        ),
        "side": (
            "the same ball seen perfectly straight on from its right-hand side. Because the ball "
            "is perfectly round it reads as the same circle as the front elevation, with the cream "
            "band and the patch segments rotated to a different position"
        ),
        "desc3q": (
            "a coral orange plush yarn ball with a wide cream woven band around it and rounded "
            "misty blue and cream patch segments bulging out of the surface"
        ),
        "palette": "coral orange, warm cream and soft misty blue for the yarn",
        "dims_views": (
            "For the front elevation label the overall diameter as 0.36 m and the overall height "
            "as 0.36 m. For the top view label the diameter as 0.36 m. For the side elevation "
            "label the diameter as 0.36 m."
        ),
        "dims_p": "label the overall diameter as 0.36 m",
    },
    "windowsill": {
        "name_en": "a wall-mounted window sill ledge",
        "front": (
            "the ledge seen perfectly straight on from the room side, straight-on horizontal eye "
            "level, with a plain warm off-white wall plane behind it. It is a slim cream white "
            "painted shelf board, 1.80 m long and quite shallow, with a small terracotta pot "
            "holding a round green plant and a second smaller pot standing on it near the middle, "
            "and a little square cream photo frame leaning against the wall"
        ),
        "top": (
            "the same ledge seen perfectly straight down from above, a plain plan view. You see a "
            "long narrow cream rectangle against the wall edge running along the top of the panel, "
            "with the terracotta pots and the small picture frame sitting on it"
        ),
        "side": (
            "the same ledge seen perfectly straight on from its right-hand end, straight-on "
            "horizontal eye level, with the warm off-white wall plane behind it, showing the thin "
            "shelf board profile and how far it projects out from the wall, with the small plant "
            "pot on top"
        ),
        "desc3q": (
            "a slim cream white wall-mounted window ledge with a terracotta pot of green plant "
            "and a small square cream photo frame standing on it"
        ),
        "palette": (
            "warm cream white for the ledge, warm off-white for the wall, terracotta orange and "
            "leaf green for the potted plants"
        ),
        "dims_views": (
            "For the front elevation label the overall length as 1.80 m and the overall height as "
            "0.15 m. For the top view label the length as 1.80 m and the depth as 0.35 m. For "
            "the side elevation label the depth as 0.35 m."
        ),
        "dims_p": (
            "label the overall length as 1.80 m, the overall depth as 0.35 m and the overall "
            "height as 0.15 m"
        ),
    },
    "tree": {
        "name_en": "a tall cat climbing tower",
        "front": (
            "the tower seen perfectly straight on from the front, straight-on horizontal eye "
            "level. It is a slim misty blue cat climbing tower: a wide round base, a thick "
            "central post wrapped in cream rope, a flat misty blue shelf at mid height, a larger "
            "misty blue shelf higher up, and at the very top a small blue house-shaped cat bed "
            "with a round arched doorway, plus a small coral toy ball hanging on a short string "
            "from the upper shelf"
        ),
        "top": (
            "the same tower seen perfectly straight down from above, a plain plan view. You see "
            "the round base as a circle, the rope post as a small circle in the middle, the two "
            "rectangular shelves projecting out at right angles to each other, and the peaked roof "
            "of the little house at the top"
        ),
        "side": (
            "the same tower seen perfectly straight on from its right-hand side, straight-on "
            "horizontal eye level, showing the rope-wrapped post, the two shelves edge-on, the "
            "small house bed with its round doorway, and the hanging toy ball"
        ),
        "desc3q": (
            "a tall misty blue cat climbing tower with a round base, a cream rope-wrapped post, "
            "two flat shelves at different heights, a small house-shaped cat bed with a round "
            "arched doorway at the top and a coral toy ball hanging on a string"
        ),
        "palette": (
            "soft misty blue for the shelves and house, warm cream rope for the post, pale wood "
            "for the base, coral orange for the toy ball"
        ),
        "dims_views": (
            "For the front elevation label the overall width as 0.80 m and the overall height as "
            "1.80 m. For the top view label the width as 0.80 m and the depth as 0.80 m. For the "
            "side elevation label the depth as 0.80 m."
        ),
        "dims_p": (
            "label the overall width as 0.80 m, the overall depth as 0.80 m and the overall "
            "height as 1.80 m"
        ),
    },
    "desk": {
        "name_en": "a small wooden writing desk",
        "front": (
            "the desk seen perfectly straight on from the front, straight-on horizontal eye level. "
            "It is a misty blue painted wooden desk with a flat top, a slim leg on the left "
            "leaving open knee space, and a drawer pedestal on the right with two pale drawer "
            "fronts and small round knobs. On the desktop stand a black flat-screen monitor on a "
            "small stand, a misty blue anglepoise desk lamp with a thin arm, a small terracotta "
            "pot with a green plant, and a neat stack of three books"
        ),
        "top": (
            "the same desk seen perfectly straight down from above, a plain plan view. You see "
            "the rectangular blue desktop with the black monitor seen from above, the round lamp "
            "base and thin arm, the plant pot and the stack of books"
        ),
        "side": (
            "the same desk seen perfectly straight on from its right-hand side, straight-on "
            "horizontal eye level, showing the drawer pedestal, the thin desktop slab and the "
            "legs, with the monitor and lamp seen edge-on"
        ),
        "desc3q": (
            "a misty blue painted wooden desk with open knee space on the left and a two-drawer "
            "pedestal on the right, topped with a black flat-screen monitor, a misty blue "
            "anglepoise desk lamp, a small potted plant and a stack of books"
        ),
        "palette": (
            "soft misty blue for the desk, near black for the monitor and screen, warm wood for "
            "the books, terracotta orange and leaf green for the plant"
        ),
        "dims_views": (
            "For the front elevation label the overall width as 1.60 m and the overall height of "
            "the desk itself as 0.75 m. For the top view label the width as 1.60 m and the depth "
            "as 0.70 m. For the side elevation label the depth as 0.70 m."
        ),
        "dims_p": (
            "label the overall width as 1.60 m, the overall depth as 0.70 m and the overall "
            "height of the desk itself as 0.75 m"
        ),
    },
    "doormat": {
        "name_en": "a flat rectangular woven doormat",
        "front": (
            "the mat seen perfectly straight on from the front at floor level, straight-on "
            "horizontal eye level. It is a very thin flat rectangular mat with a beige woven "
            "surface, a slightly darker beige border strip along the front edge and a few fine "
            "horizontal stripe bands across it, sitting flat on the ground"
        ),
        "top": (
            "the same mat seen perfectly straight down from above, a plain plan view and the "
            "most important panel of this sheet. You see the full long rectangle of the mat, a "
            "dark beige border frame running all the way around the edge, and a field of fine "
            "beige and warm cream horizontal stripes in the middle with one coral stripe band "
            "near one end"
        ),
        "side": (
            "the same mat seen perfectly straight on from its right-hand end at floor level, "
            "straight-on horizontal eye level, showing only its very thin edge profile, a slim "
            "dark beige slab, with the ground line under it"
        ),
        "desc3q": (
            "a thin flat rectangular beige woven doormat with a darker beige border frame and "
            "fine horizontal stripes"
        ),
        "palette": "warm beige, cream and a single coral stripe accent",
        "dims_views": (
            "For the front elevation label the overall width as 0.90 m and the overall thickness "
            "as 0.03 m. For the top view label the width as 0.90 m and the depth as 0.55 m. For "
            "the side elevation label the depth as 0.55 m and the thickness as 0.03 m."
        ),
        "dims_p": (
            "label the overall width as 0.90 m, the overall depth as 0.55 m and the thickness "
            "as 0.03 m"
        ),
    },
    "rug": {
        "name_en": "a large flat rectangular rug with a star pattern",
        "front": (
            "the rug seen perfectly straight on from the front at floor level, straight-on "
            "horizontal eye level. It is a very thin flat rectangular rug in soft misty blue with "
            "a slightly deeper blue border band and scattered white five-pointed stars on its "
            "surface, lying flat on the ground"
        ),
        "top": (
            "the same rug seen perfectly straight down from above, a plain plan view and the "
            "most important panel of this sheet. You see the full long rectangle of the rug, a "
            "deeper blue border frame running all the way around the edge, and scattered white "
            "five-pointed stars of slightly different sizes across the misty blue field"
        ),
        "side": (
            "the same rug seen perfectly straight on from its right-hand end at floor level, "
            "straight-on horizontal eye level, showing only its very thin edge profile, a slim "
            "blue slab, with the ground line under it"
        ),
        "desc3q": (
            "a large thin flat rectangular misty blue rug with a deeper blue border and scattered "
            "white five-pointed stars"
        ),
        "palette": "soft misty blue and deeper blue with white stars",
        "dims_views": (
            "For the front elevation label the overall width as 1.40 m and the overall thickness "
            "as 0.02 m. For the top view label the width as 1.40 m and the depth as 1.90 m. For "
            "the side elevation label the depth as 1.90 m and the thickness as 0.02 m."
        ),
        "dims_p": (
            "label the overall width as 1.40 m, the overall depth as 1.90 m and the thickness "
            "as 0.02 m"
        ),
    },
}

# 已经出过样张的两件，透视图也要补上
DONE_VIEWS = {
    "bed": {
        "name_en": "a soft basket-shaped cat bed",
        "desc3q": (
            "a soft tan basket-shaped cat bed with a low rounded rectangular tub, a taller bolster "
            "rim at the back and lower rims at the front and both sides, and a plump soft misty "
            "blue cushion filling the inside of the tub"
        ),
        "palette": "warm sand tan for the bed shell, soft misty blue for the cushion",
        "dims_p": (
            "label the overall width as 1.20 m, the overall depth as 1.00 m and the overall "
            "height as 0.60 m, and add a small leader-line label pointing at the top surface of "
            "the blue cushion reading 0.54 m"
        ),
    },
    "sofa": {
        "name_en": "a small plush two-seat sofa",
        "desc3q": (
            "a plush cream two-seat sofa with a warm cream rounded frame and backrest, two thick "
            "soft misty blue seat cushions, softly rounded cream armrests at both ends, short dark "
            "brown tapered legs, and a small misty blue square pillow with a white star pattern "
            "leaning against one end of the backrest"
        ),
        "palette": (
            "warm cream for the sofa frame and backrest, soft misty blue for the seat cushions, "
            "dark warm brown for the legs"
        ),
        "dims_p": (
            "label the overall length as 2.00 m, the overall depth as 0.95 m and the overall "
            "height as 1.15 m, and add a small leader-line label pointing at the top surface of "
            "the seat cushions reading 0.99 m"
        ),
    },
}

# --------------------------------------------------------------------------
# prompt 模板
# --------------------------------------------------------------------------
VIEWS_TMPL = """A clean 2D orthographic three-view reference sheet of ONE single object: {name_en}, drawn on a plain warm white background. The sheet is divided into three evenly spaced panels arranged left to right, all in the same flat vector illustration style with gentle soft shading and no perspective distortion.

PANEL 1 - FRONT ELEVATION: {front}.

PANEL 2 - TOP VIEW: {top}.

PANEL 3 - SIDE ELEVATION: {side}.

DIMENSION ANNOTATIONS: thin dark-gray dimension lines with small arrowheads and small neat sans-serif labels in meters, placed beside each view. {dims}

STYLE: clean flat vector shapes with soft simple shading, {palette}, subtle soft contact shadow beneath the object, absolutely no perspective, no isometric angle, perfectly straight orthographic lines, plain warm off-white background, no extra text, no title, no captions, no extra labels, no watermark"""

PERSP_TMPL = """A clean 2D three-quarter perspective product reference image of ONE single object: {name_en}, shown from a raised three-quarter angle so that both its front and one of its sides are visible, drawn on a plain warm white background in the same flat vector illustration style as an orthographic sheet: clean flat shapes with gentle soft shading, no realistic rendering.

The object: {desc3q}

DIMENSION ANNOTATIONS: thin dark-gray dimension lines with small arrowheads and small neat sans-serif labels in meters placed around the object: {dims}

STYLE: clean flat vector shapes with soft simple shading, {palette}, subtle soft contact shadow beneath the object, plain warm off-white background, no extra text, no title, no captions, no extra labels, no watermark"""


def build_views(parts):
    reqs = []
    for pid, p in parts.items():
        reqs.append({
            "aspect_ratio": "16:9",
            "resolution": "2K",
            "output_file": f"puff-part-{pid}.png",
            "prompt": VIEWS_TMPL.format(name_en=p["name_en"], front=p["front"], top=p["top"],
                                       side=p["side"], dims=p["dims_views"], palette=p["palette"]),
        })
    return reqs


def build_persp(parts):
    reqs = []
    for pid, p in parts.items():
        reqs.append({
            "aspect_ratio": "16:9",
            "resolution": "2K",
            "output_file": f"puff-part-{pid}-persp.png",
            "prompt": PERSP_TMPL.format(name_en=p["name_en"], desc3q=p["desc3q"],
                                        dims=p["dims_p"], palette=p["palette"]),
        })
    return reqs


def main():
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("views", "all"):
        path = HERE / "_views.json"
        path.write_text(json.dumps({"requests": build_views(PARTS)}, ensure_ascii=False, indent=2),
                        encoding="utf-8")
        print("wrote", path)

    if mode in ("persp", "all"):
        path = HERE / "_persp.json"
        path.write_text(json.dumps({"requests": build_persp({**DONE_VIEWS, **PARTS})},
                                    ensure_ascii=False, indent=2), encoding="utf-8")
        print("wrote", path)


if __name__ == "__main__":
    main()
