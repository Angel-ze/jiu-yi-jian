#!/bin/bash
# 把仓库根目录的 index.html 打成一个可以双击运行的原生 Mac App。
#
#   bash dev/mac/build.sh          → dist/就一件.app
#   bash dev/mac/build.sh && open dist/就一件.app
#
# 依赖：Xcode 命令行工具（swiftc / iconutil / sips / codesign）
#   没装的话：xcode-select --install
set -e
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
APP_NAME="就一件"
BUNDLE="$ROOT/dist/${APP_NAME}.app"

rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources"

echo "① 编译原生窗口（Swift + WebKit）"
swiftc -O -o "$BUNDLE/Contents/MacOS/$APP_NAME" main.swift -framework Cocoa -framework WebKit

echo "② 放入页面（仓库根目录的 index.html，与手机版同一份）"
cp "$ROOT/index.html" "$BUNDLE/Contents/Resources/index.html"

echo "③ 生成图标"
if [ -f "$ROOT/icon-512.png" ]; then
  TMP=$(mktemp -d); mkdir -p "$TMP/AppIcon.iconset"
  for s in 16 32 64 128 256 512; do
    sips -z $s $s "$ROOT/icon-512.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null 2>&1
    sips -z $((s*2)) $((s*2)) "$ROOT/icon-512.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null 2>&1
  done
  iconutil -c icns "$TMP/AppIcon.iconset" -o "$BUNDLE/Contents/Resources/AppIcon.icns" 2>/dev/null \
    && echo "   已生成" || echo "   跳过（不影响运行）"
  rm -rf "$TMP"
fi

echo "④ 写 Info.plist"
cat > "$BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>就一件</string>
  <key>CFBundleExecutable</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>io.github.angelze.jiuyijian.mac</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.4.1</string>
  <key>CFBundleVersion</key><string>10401</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

echo "⑤ 本地签名（ad-hoc，避免首次打开被拦）"
codesign --force --deep --sign - "$BUNDLE" 2>/dev/null && echo "   已签名" || echo "   跳过"
touch "$BUNDLE"

echo
echo "✅ $BUNDLE"
echo "   双击即可打开，或：open \"$BUNDLE\""
