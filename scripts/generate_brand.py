#!/usr/bin/env python3
"""Original MIT geometric artwork. Development-only dependency: Pillow 12.0.0."""
from pathlib import Path
from PIL import Image, ImageDraw

BRAND = Path(__file__).resolve().parents[1] / "custom_components/bticino_smarther_mqtt/brand"
BRAND.mkdir(exist_ok=True)
SVG = '''<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<rect x="4" y="4" width="248" height="248" rx="44" fill="#edf7f7" stroke="#174b58" stroke-width="8"/>
<rect x="36" y="36" width="184" height="108" rx="18" fill="#174b58"/>
<path d="M62 76h48m-48 28h72" fill="none" stroke="#edf7f7" stroke-width="12" stroke-linecap="round"/>
<rect x="168" y="60" width="16" height="48" rx="8" fill="#ffad44"/>
<circle cx="176" cy="112" r="16" fill="#ffad44"/>
<circle cx="128" cy="194" r="28" fill="#174b58"/>
<circle cx="128" cy="194" r="12" fill="#ffad44"/>
</svg>
'''
(BRAND / "icon.svg").write_text(SVG)
for size, name in ((256, "icon.png"), (512, "icon@2x.png")):
    scale = size * 4 / 256
    image = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    def box(values): return tuple(round(v * scale) for v in values)
    draw.rounded_rectangle(box((0, 0, 256, 256)), radius=round(48 * scale), fill="#174b58")
    draw.rounded_rectangle(box((8, 8, 248, 248)), radius=round(40 * scale), fill="#edf7f7")
    draw.rounded_rectangle(box((36, 36, 220, 144)), radius=round(18 * scale), fill="#174b58")
    for x2, y in ((110, 76), (134, 104)):
        draw.line(box((62, y, x2, y)), fill="#edf7f7", width=round(12 * scale))
        for x in (62, x2): draw.ellipse(box((x-6, y-6, x+6, y+6)), fill="#edf7f7")
    draw.rounded_rectangle(box((168, 60, 184, 108)), radius=round(8 * scale), fill="#ffad44")
    draw.ellipse(box((160, 96, 192, 128)), fill="#ffad44")
    draw.ellipse(box((100, 166, 156, 222)), fill="#174b58")
    draw.ellipse(box((116, 182, 140, 206)), fill="#ffad44")
    image.resize((size, size), Image.Resampling.LANCZOS).save(BRAND / name)
