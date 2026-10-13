#!/bin/bash
# ===== 固件重命名: zwrt-日期-架构-设备-<原固件类型> =====
# 用法: scripts/custom.sh <bin目录> <日期YYYYMMDD> <架构标签> <设备标签> <openwrt镜像身份串>
# 例:  scripts/custom.sh bin/targets/x86/64 20261013 x86_64 generic "x86-64-generic"
#      scripts/custom.sh bin/targets/mediatek/filogic 20261013 mt7981b wh3000pro "mediatek-filogic-huasifei_wh3000-pro"
set -e
BIN_DIR="$1"; DATE="$2"; ARCH="$3"; DEV="$4"; IDENTITY="$5"
# 身份串前缀匹配: 兼容 openwrt- / immortalwrt- 前缀 (ImmortalWrt 产物为 immortalwrt-<arch>-<dev>-...)
PATTERN="*${IDENTITY}-"

cd "$BIN_DIR"
for f in *; do
  [ -f "$f" ] || continue
  case "$f" in
    *.bin|*.img|*.img.gz|*.gz|*.tar.gz)
      suffix="${f#"$PATTERN"}"
      if [ "$suffix" = "$f" ]; then
        echo "!! 跳过(未匹配身份串): $f"
        continue
      fi
      new="zwrt-${DATE}-${ARCH}-${DEV}-${suffix}"
      mv "$f" "$new"
      echo ">> $f  ->  $new"
      ;;
  esac
done
echo ">> 固件重命名完成"
