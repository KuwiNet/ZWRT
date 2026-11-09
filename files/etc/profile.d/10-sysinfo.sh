# ZWRT: 登录时在 banner 下显示系统状态(负载/内存/存储 + 运行时间/IP/CPU)
# 已知图形终端(SSH 的 xterm/screen/tmux/putty 等)输出中文; 控制台及未知 TERM(linux/vt100/空, 如 noVNC)
# 内核字体不含中文, 默认输出英文版避免方块
# 兼容 BusyBox ash: 仅用 POSIX 语法、整数算术, 动态值均为纯 ASCII

# --- 负载 (1/5/15 分钟) ---
read ld1 ld5 ld15 _ < /proc/loadavg
LOAD="$ld1 $ld5 $ld15"

# --- 运行时间 (秒 -> HH:MM; 超过 24h 加天数) ---
read up _ < /proc/uptime
up=${up%%.*}
mins=$((up / 60)); h=$((mins / 60)); m=$((mins % 60))
if [ "$h" -ge 24 ]; then
	d=$((h / 24)); h=$((h % 24))
	UPTIME="${d}d $(printf '%02d:%02d' "$h" "$m")"
else
	UPTIME=$(printf '%02d:%02d' "$h" "$m")
fi

# --- 内存: 已用百分比 + 总量 MB ---
mt=$(grep '^MemTotal:' /proc/meminfo | awk '{print $2}')
ma=$(grep '^MemAvailable:' /proc/meminfo | awk '{print $2}')
if [ -z "$ma" ]; then
	ma=$(grep -E '^(MemFree|Buffers|Cached):' /proc/meminfo | awk '{s += $2} END {print s}')
fi
mem_pct=$(( (mt - ma) * 100 / mt ))
mem_mb=$((mt / 1024))
MEM="${mem_pct}% of ${mem_mb}MB"

# --- 系统存储: 根分区使用百分比 + 总量 MB ---
dline=$(df / 2>/dev/null | tail -1)
disk_total=$(echo "$dline" | awk '{print $2}')
disk_pct=$(echo "$dline" | awk '{print $5}' | tr -d '%')
disk_mb=$(awk "BEGIN {printf \"%.1f\", $disk_total / 1024}")
DISK="${disk_pct}% of ${disk_mb}M"

# --- IP 地址 (第一个非 lo 的 IPv4) ---
IP=$(ip -4 addr 2>/dev/null | grep inet | grep -v '127.0.0.1' | awk '{print $2}' | cut -d/ -f1 | head -1)
if [ -z "$IP" ]; then
	IP=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)
fi

# --- CPU: 型号 + 核数 ---
CPU_MODEL=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//')
CPU_N=$(grep -c processor /proc/cpuinfo)
CPU="${CPU_MODEL} x ${CPU_N}C"
# 80 列终端保护: CPU 型号过长时截断, 避免折行 (右列在 COL2=26 起, 最多约 44 字符)
if [ "${#CPU}" -gt 44 ]; then
	CPU=$(printf '%s' "$CPU" | cut -c1-44)
fi

# --- 双列输出: 左列标签固定显示宽 LW, 右列从 COL2 列开始 ---
line() {
	llabel=$1; lval=$2; rlabel=$3; rval=$4
	n=$((COL2 - LW - ${#lval}))
	[ "$n" -lt 1 ] && n=1
	printf '%s%s' "$llabel" "$lval"
	i=0
	while [ "$i" -lt "$n" ]; do printf ' '; i=$((i + 1)); done
	printf '%s%s\n' "$rlabel" "$rval"
}

# 已知支持中文的图形终端走中文; 其余(linux/vt100/空/dumb/未知控制台)默认英文, 避免无中文字体时出方块
case "$TERM" in
xterm*|screen*|tmux*|putty*|rxvt*|*color*)
	LW=9; COL2=26
	line '系统负载：' "$LOAD" '运行时间：' "$UPTIME"
	line '内存已用：' "$MEM"  'IP  地址：' "$IP"
	line '系统存储：' "$DISK" 'CPU 信息：' "$CPU"
	;;
*)
	LW=10; COL2=26
	line "$(printf '%-10s' 'Load:')"   "$LOAD" "$(printf '%-10s' 'Uptime:')" "$UPTIME"
	line "$(printf '%-10s' 'Memory:')" "$MEM"  "$(printf '%-10s' 'IP:')"     "$IP"
	line "$(printf '%-10s' 'Disk:')"   "$DISK" "$(printf '%-10s' 'CPU:')"    "$CPU"
	;;
esac
