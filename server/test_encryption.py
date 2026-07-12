"""Round-trip test for 7-layer encryption (run: python test_encryption.py)."""
import hashlib
import os
import struct
import subprocess
import sys
from pathlib import Path

SERVER = Path(__file__).parent


def find_node():
    candidates = [
        os.environ.get("NODE", ""),
        r"D:\node js\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    try:
        out = subprocess.check_output(["where", "node"], text=True, stderr=subprocess.DEVNULL)
        return out.strip().splitlines()[0]
    except Exception:
        return None


def main():
    node = find_node()
    if not node:
        print("SKIP: Node.js not found — install Node to run crypto tests")
        return 0
    result = subprocess.run(
        [node, str(SERVER / "test-encryption.js")],
        cwd=SERVER,
        capture_output=True,
        text=True,
    )
    print(result.stdout or result.stderr)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
