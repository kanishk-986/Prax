# Draws the Prax mark (src/components/logo.tsx) as PNG icons for the extension. No image libraries needed.
# Run: python3 scripts/make-icons.py
import struct, zlib

INK, CANVAS, ACCENT = (0x1f, 0x15, 0x15), (0xfd, 0xf8, 0xf7), (0xd6, 0x45, 0x45)
# Shapes in the logo's 24x24 viewBox: (x, y, w, h, radius, colour), drawn in order.
SHAPES = [(2, 2, 20, 20, 6, INK), (6.5, 7.5, 8, 3, 1.5, CANVAS), (9.5, 13.5, 8, 3, 1.5, ACCENT)]

def inside(px, py, x, y, w, h, r):
    cx = min(max(px, x + r), x + w - r); cy = min(max(py, y + r), y + h - r)
    return x <= px <= x + w and y <= py <= y + h and (px - cx) ** 2 + (py - cy) ** 2 <= r * r

def render(size, ss=4):
    rows = []
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            acc = [0, 0, 0, 0]
            for sj in range(ss):
                for si in range(ss):
                    px = (i + (si + .5) / ss) * 24 / size; py = (j + (sj + .5) / ss) * 24 / size
                    col = None
                    for (x, y, w, h, r, c) in SHAPES:
                        if inside(px, py, x, y, w, h, r): col = c
                    if col: acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; acc[3] += 1
            n = ss * ss
            a = acc[3]
            row += bytes([acc[0] // a, acc[1] // a, acc[2] // a, round(255 * a / n)] if a else [0, 0, 0, 0])
        rows.append(bytes(row))
    raw = b"".join(rows)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

for s in (16, 32, 48, 128):
    open(f"extension/icons/icon{s}.png", "wb").write(render(s))
    print("icon", s)
