import re, urllib.request, io, os, sys

SRC = r"C:\Users\86150\Desktop\网站项目\video\tour\src\aifl\content.ts"
OUTDIR = r"C:\Users\86150\Desktop\网站项目\video\tour\public\fonts"
os.makedirs(OUTDIR, exist_ok=True)

# 1. collect all chars from content.ts
text = open(SRC, encoding="utf-8").read()
strings = re.findall(r"'([^']*)'|\"([^\"]*)\"", text)
chars = set()
for a, b in strings:
    for s in (a, b):
        chars.update(s)
# keep only printable-ish
text_chars = "".join(sorted(c for c in chars if c.strip()))
print("unique glyphs:", len(text_chars))

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"}

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=30).read()

def get_cjk_woff2_url(weight):
    css = fetch(f"https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@{weight}&display=swap").decode("utf-8")
    # find @font-face blocks
    blocks = re.findall(r"@font-face\s*\{([^}]*)\}", css)
    for blk in blocks:
        if "U+4E00" in blk or "U+20000" in blk:  # CJK range
            m = re.search(r"url\((https://[^)]+\.woff2)\)", blk)
            if m:
                return m.group(1)
    # fallback: last woff2 (often CJK)
    urls = re.findall(r"url\((https://[^)]+\.woff2)\)", css)
    return urls[-1] if urls else None

from fontTools import subset
from fontTools.subset import parse_unicodes
from fontTools.ttLib import TTFont

for weight in (400, 700):
    url = get_cjk_woff2_url(weight)
    print(f"weight {weight} -> {url}")
    data = fetch(url)
    inp = os.path.join(OUTDIR, f"_src_{weight}.woff2")
    open(inp, "wb").write(data)
    out = os.path.join(OUTDIR, f"noto-sc-{weight}.woff2")
    # subset to our text + common punctuation/unicode ranges
    sub = subset.Subsetter()
    sub.options.glyph_names = False
    sub.options.recalc_bounds = True
    sub.options.drop_tables = []
    sub.populate(text=text_chars,
                 unicodes=parse_unicodes("U+3000-303F,U+FF00-FFEF,U+2000-206F,U+0020-007E,U+FF0C,U+3002,U+FF1A,U+FF1B,U+300C,U+300D,U+201C,U+201D,U+2018,U+2019,U+2026,U+00B7"))
    f = TTFont(inp)
    sub.subset(f)
    f.flavor = "woff2"
    f.save(out)
    print(f"saved {out} ({os.path.getsize(out)} bytes)")
    try:
        os.remove(inp)
    except OSError:
        pass

print("DONE")
