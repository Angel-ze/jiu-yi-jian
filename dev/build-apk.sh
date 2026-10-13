#!/bin/bash
# 打 Android APK：同步页面 → Gradle 构建 → zipalign 对齐 → apksigner 签名
#
#   bash dev/build-apk.sh 1.4.2
#
# 产物：仓库根目录 jiu-yi-jian-<版本>.apk
#
# ── 需要准备（都可用环境变量覆盖）────────────────────────────────
#   JAVA_HOME      JDK 17          不设则用 PATH 里的 java
#   ANDROID_HOME   Android SDK     不设则用 PATH 里的 sdkmanager 推断
#   KEYSTORE       签名密钥         默认 仓库根目录/android.keystore
#   KS_ALIAS       密钥别名         默认 android
#   KS_PASS        密钥密码         必填（没有密码没法签名）
#
# ── 受限环境（CI / 沙箱，home 不可写）────────────────────────────
#   WRITABLE_HOME=/tmp/gradle-home bash dev/build-apk.sh 1.4.2
#
# ⚠️ 签名密钥丢了，就再也发不出「能覆盖安装」的更新。请单独备份。
set -e
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
ANDROID_DIR="$ROOT/android"
PROJ="$ANDROID_DIR"

VER="${1:-}"
if [ -z "$VER" ]; then
  echo "用法: bash dev/build-apk.sh <版本号>      例：bash dev/build-apk.sh 1.4.2"
  exit 1
fi
CODE=$(( $(echo "$VER" | cut -d. -f1) * 10000 + $(echo "$VER" | cut -d. -f2) * 100 + $(echo "$VER" | cut -d. -f3) ))

: "${KEYSTORE:=$ROOT/android.keystore}"
: "${KS_ALIAS:=android}"
if [ -z "${KS_PASS:-}" ]; then
  echo "❌ 没给密钥密码。请这样跑：KS_PASS=xxxx bash dev/build-apk.sh $VER"
  echo "   （密钥：$KEYSTORE）"
  exit 1
fi
[ -f "$KEYSTORE" ] || { echo "❌ 找不到密钥文件：$KEYSTORE"; exit 1; }

# ── 环境 ────────────────────────────────────────────────────────
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
if ! command -v java >/dev/null 2>&1; then echo "❌ 找不到 java。装 JDK 17，或设 JAVA_HOME"; exit 1; fi

if [ -z "${ANDROID_HOME:-}" ]; then
  for c in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" /usr/local/share/android-sdk; do
    [ -d "$c" ] && export ANDROID_HOME="$c" && break
  done
fi
[ -n "${ANDROID_HOME:-}" ] || { echo "❌ 找不到 Android SDK。设 ANDROID_HOME，或用 Android Studio 装一个"; exit 1; }
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$ANDROID_HOME/.android}"
[ -n "${WRITABLE_HOME:-}" ] && export GRADLE_OPTS="-Duser.home=$WRITABLE_HOME ${GRADLE_OPTS:-}"

BT="$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)"
[ -n "$BT" ] || { echo "❌ SDK 里没有 build-tools。跑：sdkmanager \"build-tools;35.0.0\""; exit 1; }

echo "① 同步页面（仓库根目录的 index.html 是唯一真源）"
mkdir -p "$PROJ/app/src/main/assets"
cp "$ROOT/index.html" "$PROJ/app/src/main/assets/index.html"
H1=$(shasum -a 256 "$ROOT/index.html" | cut -d' ' -f1)
H2=$(shasum -a 256 "$PROJ/app/src/main/assets/index.html" | cut -d' ' -f1)
[ "$H1" = "$H2" ] && echo "   ✅ ${H1:0:16}" || { echo "   ❌ 拷贝不一致"; exit 1; }

echo "② 版本号 → $VER (versionCode $CODE)"
python3 - "$PROJ/app/build.gradle" "$CODE" "$VER" <<'PY'
import io, re, sys
p, code, ver = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(p, encoding='utf-8').read()
s = re.sub(r'versionCode\s+\d+', f'versionCode {code}', s)
s = re.sub(r'versionName\s+"[^"]*"', f'versionName "{ver}"', s)
io.open(p, 'w', encoding='utf-8').write(s)
PY
grep -n 'versionCode\|versionName' "$PROJ/app/build.gradle" | sed 's/^/   /'

echo "③ Gradle 构建"
cd "$PROJ"
./gradlew --no-daemon assembleRelease -q 2>&1 | tail -8 || true
UNSIGNED="$PROJ/app/build/outputs/apk/release/app-release-unsigned.apk"
[ -f "$UNSIGNED" ] || { echo "   ❌ 没有产物，看上面的 Gradle 报错"; exit 1; }
echo "   产物 $(wc -c < "$UNSIGNED" | tr -d ' ') 字节"

echo "④ zipalign"
OUT="$ROOT/jiu-yi-jian-$VER.apk"
"$BT/zipalign" -f -p 4 "$UNSIGNED" "$ROOT/.aligned.apk"

echo "⑤ 签名"
"$BT/apksigner" sign \
  --ks "$KEYSTORE" --ks-key-alias "$KS_ALIAS" \
  --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --out "$OUT" "$ROOT/.aligned.apk"
rm -f "$ROOT/.aligned.apk"
rm -f "$OUT.idsig"

echo "⑥ 校验"
"$BT/apksigner" verify --print-certs "$OUT" | grep -E "^Signer #1 certificate (DN|SHA-256)" | sed 's/^/   /'
"$BT/aapt2" dump badging "$OUT" 2>/dev/null | grep -E "^package" | sed 's/^/   /' || true

echo
echo "✅ $OUT"
echo "   sha256 = $(shasum -a 256 "$OUT" | cut -d' ' -f1)"
echo
echo "下一步（可选）：发 Release"
echo "   gh release create v$VER \"$OUT\" --notes \"...\""
