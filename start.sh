#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/ecobe-engine"
npm install --legacy-peer-deps
npm run build
npm run start
