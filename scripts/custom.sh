#!/bin/bash
# ===== 固件重命名: zwrt-日期-身份串[-变体]-<原固件类型> =====
# 用法: scripts/custom.sh <bin目录> <日期YYYYMMDD> <架构标签> <设备标签> <身份串> [变体]
# 例:  scripts/custom.sh bin/targets/x86/64 20261013 x86_64 main "x86-64-generic" main
#      scripts/custom.sh bin/targets/mediatek/filogic 20261013 mt7981b wh3000pro "mediatek-filogic-huasifei_wh3000-pro"
# 命名: zwrt-20261013-x86-64-generic-main-squashfs-combined.img.gz  (x86 主/旁带变体区分)
#       zwrt-20261013-mediatek-filogic-huasifei_wh3000-pro-emmc-squashfs-sysupgrade.bin
set -e
BIN_DIR="$1"; DATE="$2"; ARCH="$3"; DEV="$4"; IDENTITY="$5"; VARIANT="${6:-}"
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
      if [ -n "$VARIANT" ]; then
        new="zwrt-${DATE}-${IDENTITY}-${VARIANT}-${suffix}"
      else
        new="zwrt-${DATE}-${IDENTITY}-${suffix}"
      fi
      mv "$f" "$new"
      echo ">> $f  ->  $new"
      ;;
  esac
done
echo ">> 固件重命名完成"

