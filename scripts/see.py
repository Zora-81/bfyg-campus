# -*- coding: utf-8 -*-
# see.py — 截图读取流水线：颜色统计 + ASCII 布局图 + 生成OCR增强图
# 用法: python see.py <图片路径> [更多图片...]
import sys, os, subprocess
from PIL import Image, ImageOps
from collections import Counter

def classify(p):
    r, g, b = p[0], p[1], p[2]
    if r > 235 and g > 235 and b > 225: return '.'   # 白/纸底
    if r < 70 and g < 70 and b < 90:   return '#'    # 深底
    if b > 150 and b > r + 40 and b > g + 30: return 'B'  # 蓝
    if r > 150 and r > g + 40 and r > b + 40: return 'R'  # 红
    if g > 120 and g > r + 25 and g > b + 25: return 'G'  # 绿
    if r > 180 and g > 150 and b < 120: return 'Y'        # 黄
    return '+'

def see(path):
    im = Image.open(path)
    print(f'== {path} ==')
    print('mode', im.mode, 'size', im.size)
    if 'A' in im.mode:
        a = im.getchannel('A')
        print('alpha min/max:', a.getextrema())
    im = im.convert('RGB')
    W, H = im.size
    c = Counter(im.getpixel((x, y)) for y in range(0, H, 2) for x in range(0, W, 2))
    total = max(1, (W // 2 + W % 2) * (H // 2 + H % 2))
    parts = []
    for (r, g, b), n in c.most_common(8):
        parts.append('#%02x%02x%02x(%d%%)' % (r, g, b, round(100.0 * n / total)))
    print('top colors:', ' '.join(parts))
    sx, sy = max(1, W // 60), max(1, H // 30)
    for y in range(0, H, sy):
        print(''.join(classify(im.getpixel((x, y))) for x in range(0, W, sx)))
    g = ImageOps.autocontrast(im.convert('L')).resize((W * 4, H * 4), Image.LANCZOS)
    big = os.path.splitext(path)[0] + '_big.png'
    g.save(big)
    print('ocr-augmented ->', big)

if __name__ == '__main__':
    for p in sys.argv[1:]:
        see(p)
