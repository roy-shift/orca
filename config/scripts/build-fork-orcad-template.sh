#!/usr/bin/env bash
# Builds the Linux arm64 server template that `pnpm build:fork` bundles, so Orca Shift can deploy
# its managed server onto an arm64 Linux host such as a local Docker VM. Needs Docker; run it from
# anywhere in the repo after `pnpm install`. The prebuilt native module has to be compiled on glibc
# 2.28 (as upstream CI does), so it is built in a container and the template is assembled on the host.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_VERSION="24.19.0"
mkdir -p "$ROOT/out/orcad-prebuilds"

# Why -i: the build script arrives on stdin, which docker drops without it and then exits 0 having built nothing.
docker run --rm -i --platform linux/arm64 \
	-v "$ROOT":/src:ro \
	-v "$ROOT/out/orcad-prebuilds":/out \
	quay.io/pypa/manylinux_2_28_aarch64 bash -s "$NODE_VERSION" <<'CONTAINER'
set -euo pipefail
export HOME=/root
curl -fsSL "https://nodejs.org/dist/v$1/node-v$1-linux-arm64.tar.xz" | tar -xJ -C /opt
export PATH="/opt/node-v$1-linux-arm64/bin:$PATH"
npm i -g pnpm@12.8.1 >/dev/null
mkdir /work
# A copy keeps the host's node_modules and git state out of the container build.
(cd /src && tar --exclude=./node_modules --exclude='./**/node_modules' --exclude=./out \
	--exclude=./dist --exclude=./test-results --exclude=./.git -cf - .) | tar -xf - -C /work
cd /work
git init -q . && git config user.email fork@example.invalid && git config user.name fork
git add -A >/dev/null 2>&1 && git commit -qm snapshot
export CC=gcc CXX=g++ PYTHON=/opt/python/cp312-cp312/bin/python3
pnpm install --ignore-scripts --frozen-lockfile >/dev/null
pnpm run build:packages >/dev/null
pnpm build:orcad-prebuilds --slot=linux-arm64-glibc
pnpm build:orcad-prebuilds --slot=linux-arm64-glibc --require-slots linux-arm64-glibc
pnpm build:orcad-prebuilds --slot=linux-arm64-glibc --smoke
cp -R out/orcad-prebuilds/. /out/
CONTAINER

cd "$ROOT"
pnpm run build:orcad-template --targets linux-arm64-glibc
echo "[build-fork-orcad-template] out/orcad-template is ready for pnpm build:fork"
