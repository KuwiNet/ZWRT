#!/bin/bash
# =============================================================
# ZWRT ImageBuilder 组装脚本 (方案 A) — 用预编译 ipk 几分钟出固件
# 由 build-openwrt.yml 的 build job 调用, 通过环境变量传参
#
# 环境变量:
#   FEED_ARCH / FEED_TARGET  软件源架构/目标 (如 x86_64 / x86/64)
#   IMG_URL                  对应目标 kwrt-imagebuilder 下载地址
#   PROFILE_TAGS             分号分隔多组, 每组 "profile,identity,tag"
#   LAN_IP / LAN_MASK / GATEWAY / DNS / ROLE / IPV6 / WIFI / WIFI_SSID / WIFI_KEY
#   HOSTNAME / ROOT_PASS / INIT_B64
#   PKG_COMMON / PKG_WH3000  自定义包清单 (空=默认; __none__=不装; 其它=以清单为准)
#
# 用法: scripts/ibuild.sh <仓库根目录>
# =============================================================
set -e
set -o pipefail
ZWRT_DIR="$1"

DEVICE="${DEVICE:?需要 DEVICE}"
DATE="${DATE:?需要 DATE}"
FEED_ARCH="${FEED_ARCH:?需要 FEED_ARCH}"
FEED_TARGET="${FEED_TARGET:?需要 FEED_TARGET}"
IMG_URL="${IMG_URL:?需要 IMG_URL}"
PROFILE_TAGS="${PROFILE_TAGS:?需要 PROFILE_TAGS}"
LAN_IP="${LAN_IP:-192.168.100.1}"
LAN_MASK="${LAN_MASK:-255.255.255.0}"
GATEWAY="${GATEWAY:-192.168.100.1}"
DNS="${DNS:-192.168.100.1}"
ROLE="${ROLE:-main}"
IPV6="${IPV6:-0}"
WIFI="${WIFI:-0}"
WIFI_SSID="${WIFI_SSID:-ZWRT}"
WIFI_KEY="${WIFI_KEY:-}"
HOSTNAME="${HOSTNAME:-ZWRT}"
ROOT_PASS="${ROOT_PASS:-}"
INIT_B64="${INIT_B64:-}"
PKG_COMMON="${PKG_COMMON:-}"
PKG_WH3000="${PKG_WH3000:-}"

echo "=============================================================="
echo " ZWRT ImageBuilder 组装  device=$DEVICE arch=$FEED_ARCH"
echo "=============================================================="

echo "==== [1/7] 下载并解压 ImageBuilder ===="
IB_TAR="$(basename "$IMG_URL")"
curl -fsSL -o "$IB_TAR" "$IMG_URL"
tar --zstd -xf "$IB_TAR"
IB_DIR="$(ls -d *imagebuilder-*/ 2>/dev/null | head -1)"
[ -n "$IB_DIR" ] && IB_DIR="${IB_DIR%/}"
echo ">> ImageBuilder 目录: $IB_DIR (engine=$ENGINE)"

echo "==== [2/7] 写入源配置 (构建时拉包源, opkg) ===="
# 由固件运行时源 distfeeds.conf 生成(替换架构占位符)
sed -e "s|__FEED_ARCH__|$FEED_ARCH|g" -e "s|__FEED_TARGET__|$FEED_TARGET|g" \
    "$ZWRT_DIR/files/etc/opkg/distfeeds.conf" > /tmp/zwrt-distfeeds.conf
# opkg 引擎 (kwrt): 由 distfeeds.conf 生成 repositories.conf
grep -E '^src/gz ' /tmp/zwrt-distfeeds.conf > "$IB_DIR/repositories.conf"
echo ">> opkg 源 (repositories.conf):"
cat "$IB_DIR/repositories.conf"

echo "==== [3/7] 生成覆盖层 FILES 目录 ===="
FILES="$ZWRT_DIR/overlay-$DEVICE"
rm -rf "$FILES"; mkdir -p "$FILES"
cp -r "$ZWRT_DIR/files/." "$FILES/" 2>/dev/null || true
# 3a 主机名 (空/ZWRT=默认)
if [ -n "$HOSTNAME" ] && [ "$HOSTNAME" != "ZWRT" ]; then
  sed -i "s/option hostname '.*'/option hostname '$HOSTNAME'/" "$FILES/etc/config/system"
  echo "主机名已改为: $HOSTNAME"
else
  echo "主机名保持默认 ZWRT"
fi
# 3b 管理密码 (空=无密码)
if [ -n "$ROOT_PASS" ]; then
  printf '#!/bin/sh\necho "root:%s" | chpasswd 2>/dev/null || { (echo "%s"; echo "%s") | passwd root 2>/dev/null; }\nexit 0\n' "$ROOT_PASS" "$ROOT_PASS" "$ROOT_PASS" > "$FILES/etc/uci-defaults/89-zwrt-pass"
  chmod +x "$FILES/etc/uci-defaults/89-zwrt-pass"
  echo "已写入管理密码 uci-defaults"
else
  echo "管理密码为空, 保持无密码"
fi
# 3c 运行时软件源 (只保留 src/gz 源行, 去掉所有说明注释)
mkdir -p "$FILES/etc/opkg"
grep -E '^src/gz ' /tmp/zwrt-distfeeds.conf > "$FILES/etc/opkg/distfeeds.conf"
# 3d 网络变体
sed -e "s|__LAN_IP__|$LAN_IP|g" -e "s|__LAN_MASK__|$LAN_MASK|g" \
    -e "s|__GATEWAY__|$GATEWAY|g" -e "s|__DNS__|$DNS|g" \
    -e "s|__ROLE__|$ROLE|g" -e "s|__IPV6__|$IPV6|g" \
    -e "s|__WIFI__|$WIFI|g" -e "s|__WIFI_SSID__|$WIFI_SSID|g" \
    -e "s|__HOSTNAME__|$HOSTNAME|g" \
    "$ZWRT_DIR/files/etc/uci-defaults/99-zwrt-network" > "$FILES/etc/uci-defaults/99-zwrt-network"
chmod +x "$FILES/etc/uci-defaults/99-zwrt-network"
# 无线密码用 base64 文件写入 (避免 sed/单引号破坏特殊字符)
if [ -n "$WIFI_KEY" ]; then
  printf '%s' "$WIFI_KEY" | base64 > "$FILES/etc/zwrt-wifi-key.b64"
  echo "无线密码已写入 (base64 文件)"
else
  echo "无线密码为空, WiFi 开放"
fi
# 3e DNS 主机记录 (zwrt -> LAN IP, 改 IP 自动跟随; 删除旧 pw 映射)
mkdir -p "$FILES/etc/hotplug.d/iface"
cat > "$FILES/etc/hotplug.d/iface/20-zwrt-dns" <<'EOF'
#!/bin/sh
[ "$ACTION" = "ifup" ] || exit 0
[ "$INTERFACE" = "lan" ] || exit 0
IP=$(uci get network.lan.ipaddr 2>/dev/null)
[ -n "$IP" ] || exit 0
uci get dhcp.@dnsmasq[0].enable >/dev/null 2>&1 || uci add dhcp dnsmasq >/dev/null 2>&1
# 删除原固件遗留的 pw 主机名映射 (任意 IP)
uci show dhcp 2>/dev/null | grep "\.address='/pw/" | sed "s/.*\.address='\([^']*\)'.*/\1/" | while read -r v; do
  uci -q del_list dhcp.@dnsmasq[0].address="$v"
done
# zwrt -> 后台地址 (nikki: http://zwrt/cgi-bin/luci/admin/services/nikki)
uci -q del_list dhcp.@dnsmasq[0].address="/zwrt/$IP"
uci add_list dhcp.@dnsmasq[0].address="/zwrt/$IP"
uci commit dhcp
/etc/init.d/dnsmasq restart
exit 0
EOF
chmod +x "$FILES/etc/hotplug.d/iface/20-zwrt-dns"
echo "已配置 DNS 主机记录: http://zwrt 打开后台 / nikki 直达 http://zwrt/cgi-bin/luci/admin/services/nikki"
# 3f 自定义初始化脚本
if [ -n "$INIT_B64" ]; then
  echo "$INIT_B64" | base64 -d > "$FILES/etc/uci-defaults/90-zwrt-custom-init"
  chmod +x "$FILES/etc/uci-defaults/90-zwrt-custom-init"
  echo "已写入自定义初始化脚本 ($(wc -l < "$FILES/etc/uci-defaults/90-zwrt-custom-init") 行)"
fi
echo ">> 覆盖层: $FILES"

echo "==== [4/7] 生成 PACKAGES 清单 ===="
clean() { echo "$1" | sed '1s/^\xEF\xBB\xBF//' | grep -v '^\s*#' | grep -v '^\s*$' | tr '\n' ' ' || true; }
# 按来源组装覆盖 (空=默认; __none__=不装; 其它=以清单为准)
apply_src() {
  local list="$1" base="$2"
  if [ -z "$list" ]; then echo "$base"
  elif [ "$list" = "__none__" ]; then echo ""
  else echo "$(clean "$list")"
  fi
}
COMMON_BASE=""
DEV_BASE=""
case "$DEVICE" in
  wh3000pro)
    DEV_BASE="$(clean "$(cat "$ZWRT_DIR/plugins/wh3000pro.txt")")"
    if [ -f "$ZWRT_DIR/plugins/common-wh3000.txt" ]; then
      COMMON_BASE="$(clean "$(cat "$ZWRT_DIR/plugins/common-wh3000.txt")")"
      echo ">> 使用 WH3000 精简公共清单 common-wh3000.txt"
    else
      COMMON_BASE="$(clean "$(cat "$ZWRT_DIR/plugins/common.txt")")"
    fi
    ;;
  x86-64-*)
    DEV_BASE="$(clean "$(cat "$ZWRT_DIR/plugins/x86_64.txt")")"
    COMMON_BASE="$(clean "$(cat "$ZWRT_DIR/plugins/common.txt")")"
    ;;
  tr3000*)
    DEV_BASE="$(clean "$(cat "$ZWRT_DIR/plugins/tr3000.txt")")"
    if [ -f "$ZWRT_DIR/plugins/common-wh3000.txt" ]; then
      COMMON_BASE="$(clean "$(cat "$ZWRT_DIR/plugins/common-wh3000.txt")")"
      echo ">> 使用 WH3000 精简公共清单 common-wh3000.txt"
    else
      COMMON_BASE="$(clean "$(cat "$ZWRT_DIR/plugins/common.txt")")"
    fi
    ;;
  *)
    COMMON_BASE="$(clean "$(cat "$ZWRT_DIR/plugins/common.txt")")"
    ;;
esac
COMMON_P="$(apply_src "$PKG_COMMON" "$COMMON_BASE")"
DEV_P="$(apply_src "$PKG_WH3000" "$DEV_BASE")"
PACKAGES="$( { echo "$COMMON_P"; echo "$DEV_P"; } | tr ' ' '\n' | sed '/^$/d' | sort -u | tr '\n' ' ' )"
echo "PACKAGES ($(echo "$PACKAGES" | wc -w) 个): $PACKAGES"

echo "==== [5/7] 组装固件 (ImageBuilder make image) ===="
BIN_DIR="$ZWRT_DIR/$IB_DIR/bin/targets/$FEED_TARGET"
mapfile -d ';' -t PKG_GROUPS < <(printf '%s;' "$PROFILE_TAGS")
for g in "${PKG_GROUPS[@]}"; do
  IFS=',' read -r PROFILE IDENTITY TAG <<< "$g" || true
  echo ">> make image PROFILE=$PROFILE tag=$TAG" >&2
  cd "$ZWRT_DIR/$IB_DIR"
  make image PROFILE="$PROFILE" PACKAGES="$PACKAGES" FILES="$FILES" 2>&1 | tee "image-$PROFILE.log" || {
    echo "!! make image 失败 (PROFILE=$PROFILE)" >&2
    echo "---- 日志尾部 ----" >&2
    tail -50 "image-$PROFILE.log" >&2
    exit 1
  }
  echo ">> make image PROFILE=$PROFILE 完成" >&2
  cd "$ZWRT_DIR"
done

echo "==== [6/7] 重命名固件 (zwrt-日期-发布标签-类型) ===="
for g in "${PKG_GROUPS[@]}"; do
  IFS=',' read -r PROFILE IDENTITY TAG <<< "$g" || true
  echo ">> 重命名 profile=$PROFILE identity=$IDENTITY tag=$TAG"
  bash "$ZWRT_DIR/scripts/custom.sh" "$BIN_DIR" "$DATE" "$TAG" "$IDENTITY" || true
done

echo "==== [7/7] 固件产物 ===="
ls -lh "$BIN_DIR" | grep '^.*zwrt-' || ls -lh "$BIN_DIR" | tail -30
echo "==== ibuild.sh 完成 ===="
