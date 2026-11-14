#!/bin/bash
# Kokoaa dist/-kansion: index.html (ydin upotettuna), manifest, service worker, ikonit
set -e
cd "$(dirname "$0")"
VER=$(date +%Y%m%d-%H%M)
mkdir -p dist
python3 - "$VER" <<'PY'
import sys
v=sys.argv[1]
core=open('src/core.js').read()
html=open('src/app.html').read().replace('/*CORE*/',core).replace('__VERSION__',v)
open('dist/index.html','w').write(html)
open('dist/sw.js','w').write(open('src/sw.js').read().replace('__VERSION__',v))
PY
cp src/manifest.webmanifest dist/
python3 src/icons.py
echo "build $VER ok"
