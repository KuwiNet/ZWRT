#!/bin/bash
# ===== 固件重命名: 只把 ImageBuilder 生成的 immortalwrt/openwrt 前缀换成 zwrt, 其余完整保留 =====
# 用法: scripts/custom.sh <bin目录> [日期] [发布标签] [镜像身份串]
# 命名示例(ImmortalWrt 官方格式): immortalwrt-mediatek-filogic-20261001-cudy_tr3000-v1-256mb-squashfs-sysupgrade.bin
#                           转换后: zwrt-     mediatek-filogic-20261001-cudy_tr3000-v1-256mb-squashfs-sysupgrade.bin
set -e
BIN_DIR="$1"

cd "$BIN_DIR"
for f in *; do
  [ -f "$f" ] || continue
  case "$f" in
    *.bin|*.img|*.img.gz|*.gz|*.tar.gz)
      new="${f/immortalwrt/zwrt}"
      new="${new/openwrt/zwrt}"
      if [ "$new" != "$f" ]; then
        mv "$f" "$new"
        echo ">> $f  ->  $new"
      else
        echo ">> 跳过(无 immortalwrt/openwrt 前缀): $f"
      fi
      ;;
  esac
done
echo ">> 固件重命名完成"
