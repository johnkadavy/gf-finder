#!/usr/bin/env python3
"""Rasterize digest hero SVGs to email-ready PNGs (1120x630, 2x for retina).
Usage: python3 scripts/digest-heroes/rasterize.py <svg-dir> <png-dir>
Needs: pip install cairosvg
"""
import sys, os, cairosvg
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith(".svg"): continue
    out = os.path.join(dst, f[:-4] + ".png")
    cairosvg.svg2png(url=os.path.join(src, f), write_to=out, output_width=1120, output_height=630)
    print(out, os.path.getsize(out)//1024, "KB")
