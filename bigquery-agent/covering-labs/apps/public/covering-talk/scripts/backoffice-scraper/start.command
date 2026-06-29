#!/bin/bash
cd "$(dirname "$0")"
echo "🔍 백오피스 스크래퍼 시작..."
echo "종료하려면 Ctrl+C"
echo ""
HEADLESS=false npx tsx index.ts
