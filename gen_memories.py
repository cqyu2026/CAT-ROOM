#!/usr/bin/env python3
"""从家具数据和 photos/ 生成页面唯一读取的 memories.json。"""
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.abspath(__file__))
with open(f"{ROOT}/data/objects.json", encoding="utf-8") as source:
    objects = json.load(source)

memories = {item["id"]: [] for item in objects["objects"]}
memories["wall"] = []
memories["story"] = []
assignments = objects.get("mediaAssignments", {})
photos = f"{ROOT}/photos"
skipped = []
warnings = []
errors = []
pattern = re.compile(r"^(\d{4}-\d{2}-\d{2})_(.+)\.(jpg|jpeg|png|webp|mp4)$", re.IGNORECASE)

for folder in sorted(os.listdir(photos)):
    path = f"{photos}/{folder}"
    if not os.path.isdir(path):
        continue
    if folder not in memories or folder == "wall":
        warnings.append(f"photos/{folder}/ 不在 data/objects.json 中")
        continue
    for filename in sorted(os.listdir(path)):
        if filename.startswith("."):
            continue
        match = pattern.fullmatch(filename)
        if not match:
            skipped.append(f"photos/{folder}/{filename}")
            warnings.append(f"不支持的文件名或扩展名: photos/{folder}/{filename}")
            continue
        try:
            date.fromisoformat(match[1])
        except ValueError:
            skipped.append(f"photos/{folder}/{filename}")
            warnings.append(f"无效日期: photos/{folder}/{filename}")
            continue
        src = f"photos/{folder}/{filename}"
        assignment = assignments.get(src, {})
        target = assignment.get("target", folder)
        if target == "computer":
            if src != objects.get("computerVideo"):
                errors.append(f"{src}: 电脑专属视频与 computerVideo 不一致")
            continue
        if target not in memories:
            errors.append(f"{src}: 未知目标 {target}")
            continue
        memories[target].append({
            "date": match[1], "text": assignment.get("text", match[2]),
            "src": src,
            "type": "video" if match[3].lower() == "mp4" else "image",
            "live": (target, match[1]) in {
                ("bowl", "2022-04-19"),
                ("ribbon", "2026-01-18"),
            } and match[3].lower() == "mp4",
        })

for item in objects["objects"]:
    entries = memories[item["id"]]
    if entries and item["appearsAt"] > min(entry["date"] for entry in entries):
        errors.append(f'{item["id"]}: appearsAt {item["appearsAt"]} 晚于最早照片')
    entries.append({"date": item["appearsAt"], "text": item["memory"], "src": None, "type": "text"})
    entries.sort(key=lambda entry: entry["date"])

if objects.get("computerVideo") and not os.path.isfile(f"{ROOT}/{objects['computerVideo']}"):
    errors.append("computerVideo 文件不存在")

memories["wall"].sort(key=lambda entry: (entry["date"], entry["src"]))
wall_sources = {entry["src"] for entry in memories["wall"]}
grouped_sources = set()
for group in objects.get("wallGroups", []):
    for src in group["photos"]:
        if src not in wall_sources:
            errors.append(f'{group["id"]}: 墙上组合引用了非墙照 {src}')
        if src in grouped_sources:
            errors.append(f'{group["id"]}: 墙照重复入组 {src}')
        grouped_sources.add(src)
    if group["cover"] not in group["photos"]:
        errors.append(f'{group["id"]}: 封面不在相框照片中')

for item in objects["objects"]:
    print(f'{item["id"]}: {sum(bool(entry["src"]) for entry in memories[item["id"]])} 件照片/视频')
print("跳过的文件: " + (", ".join(skipped) if skipped else "无"))
for warning in warnings:
    print("WARN: " + warning)
for error in errors:
    print("ERROR: " + error)
if errors:
    sys.exit(1)

result = {"cat": objects["cat"], "chapters": objects["chapters"], "objects": objects["objects"], "memories": memories, "mediaAssignments": assignments, "wallGroups": objects.get("wallGroups", [])}
if objects.get("computerVideo"):
    result["computerVideo"] = objects["computerVideo"]
temporary = f"{ROOT}/memories.json.tmp"
with open(temporary, "w", encoding="utf-8") as output:
    json.dump(result, output, ensure_ascii=False, indent=1)
os.replace(temporary, f"{ROOT}/memories.json")
print("校验通过" + (f"，{len(warnings)} 条警告" if warnings else "，零警告"))
