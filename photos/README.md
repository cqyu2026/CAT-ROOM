# 照片命名

使用 `photos/<家具id>/YYYY-MM-DD_描述.<扩展名>`。家具 id 为 `bed`、`bowl`、`ball`、`windowsill`、`tree`、`desk`、`doormat`、`sofa`、`rug`。扩展名可为 jpg、jpeg、png、webp、mp4，大小写均可。描述使用一句有画面的短句；非法文件名字符与空格换成 `-`，同名时在扩展名前加 `-2`、`-3`。

添加、改名或删除照片后，在网站根目录运行 `python3 gen_memories.py`，再刷新网页。网页内「记录今天」仅在桌面 Chrome / Edge 且授权本目录的 `photos/` 时可直接写入。
