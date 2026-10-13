#!/bin/bash
# ===== 由 seed + 插件清单生成 OpenWrt .config =====
# 用法: scripts/merge-config.sh <ZWRT仓库根目录> <device-id> <输出.config路径>
# 组成: 1) configs/<device>.seed (目标平台)  2) plugins/common.txt (通用) + plugins/<device>.txt (平台专属)
set -e
ZWRT_DIR="$1"
DEVICE="$2"
OUT="${3:-.config}"

# 变体 -> 种子/插件映射:
#   x86-64-main / x86-64-bypass 共用 configs/x86_64.seed, 仅用 common 插件
#   wh3000pro 等用 configs/<device>.seed + plugins/<device>.txt
case "$DEVICE" in
  x86-64-main|x86-64-bypass) SEED="x86_64"; PLUGIN="" ;;
  *)                         SEED="$DEVICE"; PLUGIN="$DEVICE" ;;
esac

: > "$OUT"

# 1) 目标平台 seed
echo "### 目标平台: $DEVICE (seed=$SEED)" >> "$OUT"
cat "$ZWRT_DIR/configs/$SEED.seed" >> "$OUT"

# 2) 插件清单 -> CONFIG_PACKAGE_xxx=y
for pf in "$ZWRT_DIR/plugins/common.txt" "$ZWRT_DIR/plugins/${PLUGIN}.txt"; do
  [ -f "$pf" ] || continue
  echo "### 合并插件清单: $(basename "$pf")" >> "$OUT"
  while IFS= read -r line || [ -n "$line" ]; do
    # 去掉行内注释与首尾空白
    pkg="${line%%#*}"
    pkg="$(echo "$pkg" | xargs)"
    [ -z "$pkg" ] && continue
    echo "CONFIG_PACKAGE_${pkg}=y" >> "$OUT"
  done < "$pf"
done

echo ">> 已生成 $OUT ($(wc -l < "$OUT") 行)"
