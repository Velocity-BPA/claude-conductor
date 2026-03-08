#!/usr/bin/env python3
"""
Generate icon files for Claude Conductor.

Usage:
    pip install Pillow
    python3 scripts/generate_icons.py

This produces:
  src-tauri/icons/32x32.png
  src-tauri/icons/128x128.png
  src-tauri/icons/128x128@2x.png
  src-tauri/icons/icon.png       (512px, used in Tauri config)
  src-tauri/icons/tray-icon.png
  src-tauri/icons/icon.icns      (required for macOS release builds)
  src-tauri/icons/icon.ico       (required for Windows release builds)
"""
import math, struct, io, os
from PIL import Image, ImageDraw


def make_icon(size: int) -> Image.Image:
    """Render the Claude Conductor icon at the given pixel size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size
    pad = s * 0.11
    corner_r = s * 0.22
    x0, y0 = pad, pad
    x1, y1 = s - pad, s - pad

    # Background rounded rect
    draw.rounded_rectangle([x0, y0, x1, y1], radius=corner_r, fill=(26, 29, 38, 255))
    draw.rounded_rectangle(
        [x0, y0, x1, y1], radius=corner_r,
        outline=(255, 255, 255, 18), width=max(1, int(s * 0.012))
    )

    cx, cy = s / 2, s / 2
    dot_r = s * 0.085
    amber  = (245, 166,  35, 255)
    blue   = ( 96, 165, 250, 255)
    purple = (167, 139, 250, 255)

    # Three instance dots
    d1x, d1y = cx,              cy - s * 0.155   # top centre  (conductor)
    d2x, d2y = cx - s * 0.17,  cy + s * 0.10    # bottom left
    d3x, d3y = cx + s * 0.17,  cy + s * 0.10    # bottom right

    # Connecting lines (behind dots)
    lw = max(1, int(s * 0.018))
    lc = (255, 255, 255, 30)
    draw.line([(d1x, d1y), (d2x, d2y)], fill=lc, width=lw)
    draw.line([(d1x, d1y), (d3x, d3y)], fill=lc, width=lw)
    draw.line([(d2x, d2y), (d3x, d3y)], fill=lc, width=lw)

    def draw_dot(x, y, color, r):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)
        hr = r * 0.4
        draw.ellipse(
            [x - hr + r * 0.15, y - hr - r * 0.15,
             x + hr + r * 0.15, y + hr - r * 0.15],
            fill=(255, 255, 255, 80)
        )

    draw_dot(d1x, d1y, amber,  dot_r)
    draw_dot(d2x, d2y, blue,   dot_r * 0.85)
    draw_dot(d3x, d3y, purple, dot_r * 0.85)

    # Conductor baton through the amber dot
    baton_len = s * 0.13
    baton_angle = -45
    bx = math.cos(math.radians(baton_angle)) * baton_len
    by = math.sin(math.radians(baton_angle)) * baton_len
    bw = max(1, int(s * 0.025))
    draw.line(
        [(d1x - bx * 0.3, d1y - by * 0.3), (d1x + bx, d1y + by)],
        fill=(255, 220, 150, 200), width=bw
    )

    return img


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def build_icns() -> bytes:
    """Build a valid .icns file from rendered PNGs."""
    icns_types = [
        (b'icp4',   16),   # 16x16
        (b'icp5',   32),   # 32x32
        (b'ic11',   64),   # 32x32@2x
        (b'ic07',  128),   # 128x128
        (b'ic13',  256),   # 128x128@2x
        (b'ic08',  256),   # 256x256
        (b'ic14',  512),   # 256x256@2x
        (b'ic09',  512),   # 512x512
        (b'ic10', 1024),   # 512x512@2x
    ]
    blocks = []
    for otype, px in icns_types:
        data = _png_bytes(make_icon(px))
        blocks.append(otype + struct.pack(">I", 8 + len(data)) + data)
    total = 8 + sum(len(b) for b in blocks)
    return b'icns' + struct.pack(">I", total) + b''.join(blocks)


def main():
    icons_dir = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")
    os.makedirs(icons_dir, exist_ok=True)

    png_sizes = {
        "32x32.png":      32,
        "128x128.png":   128,
        "128x128@2x.png": 256,
        "icon.png":       512,
        "tray-icon.png":   32,
    }
    for fname, sz in png_sizes.items():
        path = os.path.join(icons_dir, fname)
        make_icon(sz).save(path, "PNG")
        print(f"  ✓ {fname}")

    icns_path = os.path.join(icons_dir, "icon.icns")
    with open(icns_path, "wb") as f:
        f.write(build_icns())
    print("  ✓ icon.icns")

    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    imgs = [make_icon(sz) for sz in ico_sizes]
    ico_path = os.path.join(icons_dir, "icon.ico")
    imgs[0].save(
        ico_path, format="ICO",
        sizes=[(i.size[0], i.size[1]) for i in imgs],
        append_images=imgs[1:]
    )
    print("  ✓ icon.ico")
    print("\nDone! All icons generated in src-tauri/icons/")


if __name__ == "__main__":
    main()
