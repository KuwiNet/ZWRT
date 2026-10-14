#!/bin/bash
# ===== 固件重命名: zwrt-日期-引擎-发布标签-<原固件类型> =====
# 用法: scripts/custom.sh <bin目录> <日期YYYYMMDD> <引擎immortalwrt|kwrt> <发布标签> <openwrt镜像身份串>
# 例:  scripts/custom.sh bin/targets/x86/64 20261013 kwrt x86_64-main "x86-64-generic"
# 命名: zwrt-20261013-kwrt-x86_64-main-squashfs-combined.img.gz      (x86 主路由, Kwrt引擎)
#       zwrt-20261013-immortal-x86_64-main-squashfs-combined.img.gz  (x86 主路由, ImmortalWrt官方引擎)
set -e
BIN_DIR="$1"; DATE="$2"; ENGINE="$3"; TAG="$4"; IDENTITY="$5"

cd "$BIN_DIR"
for f in *; do
  [ -f "$f" ] || continue
  case "$f" in
    *.bin|*.img|*.img.gz|*.gz|*.tar.gz)
      # 去掉到身份串为止的前缀 (模式不加引号, 否则 * 无法通配)
      suffix="${f#*${IDENTITY}-}"
      if [ "$suffix" = "$f" ]; then
        echo "!! 跳过(未匹配身份串): $f"
        continue
      fi
      new="zwrt-${DATE}-${ENGINE}-${TAG}-${suffix}"
      mv "$f" "$new"
      echo ">> $f  ->  $new"
      ;;
  esac
done
echo ">> 固件重命名完成"
