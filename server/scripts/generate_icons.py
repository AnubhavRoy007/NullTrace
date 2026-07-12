import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "extension" / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def crc32(data: bytes) -> int:
    return zlib.crc32(data) & 0xFFFFFFFF


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc32(tag + data))


def make_png(size: int) -> bytes:
    raw = bytearray()
    cx = cy = size / 2
    r = size * 0.38
    for y in range(size):
        raw.append(0)
        for x in range(size):
            dx = x + 0.5 - cx
            dy = y + 0.5 - cy
            if dx * dx + dy * dy <= r * r:
                raw.extend((94, 234, 212, 255))
            else:
                raw.extend((10, 11, 15, 255))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", idat)
        + chunk(b"IEND", b"")
    )


for s in (16, 48, 128):
    (OUT / f"icon{s}.png").write_bytes(make_png(s))
print(f"Icons written to {OUT}")
