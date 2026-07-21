# qa-stills.py — structural self-check of rendered stills (model can't view images directly)
# Reports per-frame: size, brightness stats, bright-pixel fraction, edge density (text/UI proxy).
from PIL import Image, ImageFilter
import os, sys, glob

QA = r"C:\Users\86150\Desktop\网站项目\video\tour\out\qa"
files = sorted(glob.glob(os.path.join(QA, "*.png")))
if not files:
    print("NO STILLS FOUND"); sys.exit(1)

print(f"{'frame':<22} {'size':<12} {'mean':>6} {'std':>6} {'bright%':>7} {'edge':>6}")
print("-" * 62)
for f in files:
    name = os.path.basename(f)
    im = Image.open(f).convert("L")
    w, h = im.size
    px = list(im.getdata())
    n = len(px)
    mean = sum(px) / n
    std = (sum((p - mean) ** 2 for p in px) / n) ** 0.5
    bright = sum(1 for p in px if p > 90) / n * 100
    # edge density via FIND_EDGES
    edges = im.filter(ImageFilter.FIND_EDGES)
    ev = list(edges.getdata())
    edgemean = sum(ev) / len(ev)
    flag = ""
    if w != 1920 or h != 1080: flag += " BADSIZE"
    if std < 8: flag += " TOOBLANK"
    if bright < 1.5: flag += " NOCONTENT"
    if edgemean < 3: flag += " NOEDGES"
    print(f"{name:<22} {f'{w}x{h}':<12} {mean:6.1f} {std:6.1f} {bright:6.2f}% {edgemean:6.2f}{flag}")
print("-" * 62)
print("done")
