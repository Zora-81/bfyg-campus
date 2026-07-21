# 宝丰一高校徽 — Motion Spec

## Source
- File: source.png (600×600 RGBA)
- Type: Circular school emblem (badge)

## Semantic Parts (animation actors)
1. `#ring-outer` — 深红色外圆环 (r≈170-179)
2. `#text-band-bg` — 白色文字带背景 + 内金线 (r≈128-165)
3. `#text-band-top` — 上半弧中文"宝丰县第一高级中学"
4. `#text-band-bottom` — 下半弧英文"BAOFENG NO.1 SENIOR HIGH SCHOOL"
5. `#inner-field` — 内圆红底 (r≈0-126)
6. `#mountain` — 黄色三角山峰 (窄高锐利)
7. `#platform` — 三层蓝色阶梯基座
8. `#year-text` — "1956" 年份

## Personality
- **noble** (庄重学府感)
- **steady** (稳健根基)
- **radiant** (光辉绽放)

## Usage Context
- Splash/intro reveal: 1800ms total
- End state: static logo display

## Choreography Sketch
1. Ring rotates in → scale-pop with overshoot
2. White band fades in → text appears
3. Inner field pops → mountain rises from below
4. Platform slides up → year text glows in
- Golden Ratio timing: 20% anticipation : 50% action : 30% settle

## Key Geometry Notes (from source analysis)
- ViewBox: -300 -300 600 600 (centered)
- Outer ring: r_out=179, r_in≈170, color=#8B0000
- Text band: r_outer≈165, r_inner≈128, color=#FFFFFF
- Gold separator line: r≈128, stroke #D4A017
- Inner red: r≈126, color=#CC0000
- Mountain: peak at y≈-95, base ±65, fill #E8B800
- Platform: 3 layers at y≈58/75/92, fills #00088A/#000780/#000672
- Year text: y≈138, fill #F5E6B8, font Times New Roman bold 28px
- Chinese text: font-size ~38px, Microsoft YaHei bold, letter-spacing 5
- English text: font-size ~16px, Arial Black bold, letter-spacing 0.5
- Text arc radius: ~147 (midpoint of white band r=128..165)
- Chinese arc span: ~150° (10 o'clock to 2 o'clock)
- English arc span: ~160° (8 o'clock to 4 o'clock)
