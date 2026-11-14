#!/bin/bash
# Julkaisu GitHub Pagesiin: repo rikureinikka/koekertaus, juuressa dist/-sisältö, lähdekoodi kansiossa source/
set -e
cd "$(dirname "$0")"
./build.sh
node test/test.js >/dev/null
D=/tmp/koekertaus-pages
[ -d $D/.git ] || git clone -q https://github.com/rikureinikka/koekertaus.git $D
cd $D && git pull -q --rebase 2>/dev/null || true
find $D -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r /workspace/koekertaus/dist/. $D/
mkdir -p $D/source/e2e && cp -r /workspace/koekertaus/{src,test,README.md,build.sh,deploy.sh,.gitignore} $D/source/
cp /workspace/koekertaus/e2e/{e2e.js,fallback.js,package.json,package-lock.json,page1.jpg,blurry.jpg,broken.jpg,big_rot6.jpg} $D/source/e2e/
cp /workspace/koekertaus/README.md $D/README.md
touch $D/.nojekyll
if grep -rIE 'AIza[0-9A-Za-z_-]{20,}' $D --exclude-dir=.git; then echo "AVAIN LÖYTYI – keskeytetään"; exit 1; fi
git add -A && (git diff --cached --quiet || git commit -qm "${1:-Päivitys $(date +%Y-%m-%d\ %H:%M)}") && git push -q origin HEAD:main
echo "julkaistu"
