#!/bin/bash
# ===== 固件重命名: zwrt-日期-发布标签-<原固件类型> =====
# 用法: scripts/custom.sh <bin目录> <日期YYYYMMDD> <发布标签> <openwrt镜像身份串>
# 例:  scripts/custom.sh bin/targets/x86/64 20261013 x86_64-main "x86-64-generic"
#      scripts/custom.sh bin/targets/mediatek/filogic 20261013 wh3000pro "mediatek-filogic-huasifei_wh3000-pro"
# 命名: zwrt-20261013-x86_64-main-squashfs-combined.img.gz          (x86 主路由)
#       zwrt-20261013-x86_64-bypass-squashfs-combined.img.gz        (x86 旁路由)
#       zwrt-20261013-wh3000pro-emmc-squashfs-sysupgrade.bin        (WH3000 Pro eMMC)
#       zwrt-20261013-wh3000pro-nand-squashfs-sysupgrade.bin        (WH3000 Pro NAND)
set -e
BIN_DIR="$1"; DATE="$2"; TAG="$3"; IDENTITY="$4"
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
      new="zwrt-${DATE}-${TAG}-${suffix}"
      mv "$f" "$new"
      echo ">> $f  ->  $new"
      ;;
  esac
done
echo ">> 固件重命名完成"
