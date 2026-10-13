#!/bin/bash
# ===== 合并自定义 feeds 到 OpenWrt 源码 =====
# 用法: scripts/merge-feeds.sh <ZWRT仓库根目录> <OpenWrt源码目录>
# 作用: 把 feeds/feeds.conf.custom 追加进 OpenWrt 的 feeds.conf.default, 并更新/安装 feeds
set -e
ZWRT_DIR="$1"
OPENWRT_DIR="${2:-.}"
cd "$OPENWRT_DIR"

cat "$ZWRT_DIR/feeds/feeds.conf.custom" >> feeds.conf.default
echo ">> feeds.conf.default 已追加自定义 feeds"

./scripts/feeds update -a
./scripts/feeds install -a
echo ">> feeds 更新与安装完成"
