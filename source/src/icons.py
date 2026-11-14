from PIL import Image, ImageDraw
def icon(size, pad, path):
    s = size; im = Image.new('RGB', (s, s), '#6c3cf0'); d = ImageDraw.Draw(im); m = s * pad
    # kirja
    d.rounded_rectangle([m + s*.08, m + s*.2, s - m - s*.08, s - m - s*.16], radius=s//20, fill='#ffffff')
    d.line([s/2, m + s*.2, s/2, s - m - s*.16], fill='#d9cffb', width=max(2, s//60))
    for k in range(3):
        y = m + s*.32 + k * s*.09
        d.line([m + s*.16, y, s/2 - s*.05, y], fill='#b8a6f5', width=max(2, s//50))
    # tähti
    import math
    cx, cy, R, r = s*.66, s*.47, s*.13 * (1 - pad), s*.055 * (1 - pad)
    pts = [(cx + (R if i % 2 == 0 else r) * math.sin(i * math.pi / 5), cy - (R if i % 2 == 0 else r) * math.cos(i * math.pi / 5)) for i in range(10)]
    d.polygon(pts, fill='#ffd23f')
    im.save(path)
icon(192, 0.04, 'dist/icon-192.png'); icon(512, 0.04, 'dist/icon-512.png'); icon(512, 0.14, 'dist/icon-maskable-512.png')
