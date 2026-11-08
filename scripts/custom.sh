#!/bin/bash
# ===== 固件重命名: 前缀换成 zwrt, 并在镜像类型前插入构建日期 =====
# 用法: scripts/custom.sh <bin目录> [日期 YYYYMMDD] [发布标签] [镜像身份串]
# 示例: kwrt-x86-64-generic-squashfs-combined.img.gz
#    -> zwrt-x86-64-generic-20261108-squashfs-combined.img.gz
#       kwrt-mediatek-filogic-cudy_tr3000-256mb-v1-squashfs-sysupgrade.bin
#    -> zwrt-mediatek-filogic-cudy_tr3000-256mb-v1-20261108-squashfs-sysupgrade.bin
set -e
BIN_DIR="$1"
DATE="${2:-${DATE:-}}"
[ -n "$DATE" ] || DATE="$(TZ='Asia/Shanghai' date +%Y%m%d)"

cd "$BIN_DIR"
for f in *; do
  [ -f "$f" ] || continue
  case "$f" in
    *.bin|*.img|*.img.gz|*.gz|*.tar.gz)
      new="${f/immortalwrt/zwrt}"
      new="${new/openwrt/zwrt}"
      new="${new/kwrt/zwrt}"
      # 去掉基座版本号段: immortalwrt-25.12.2-x86-64-generic -> zwrt-x86-64-generic
      # (保证 R2 按 zwrt-YYYYMMDD-* 清理旧版本时能正确匹配)
      new="$(echo "$new" | sed -E 's/^zwrt-[0-9]+\.[0-9]+\.[0-9]+-/zwrt-/')"
      # 已带本次日期则不重复插入
      case "$new" in
        *-"$DATE"-*|*"$DATE".*) ;;
        *)
          for kw in squashfs ext4 targz kernel initramfs ubi; do
            case "$new" in
              *-"$kw"-*) new="${new/-$kw-/-$DATE-$kw-}"; break ;;
              *-"$kw".*) new="${new/-$kw./-$DATE-$kw.}"; break ;;
            esac
          done
          ;;
      esac
      if [ "$new" != "$f" ]; then
        mv "$f" "$new"
        echo ">> $f  ->  $new"
      else
        echo ">> 跳过(无变更): $f"
      fi
      ;;
  esac
done
echo ">> 固件重命名完成"
