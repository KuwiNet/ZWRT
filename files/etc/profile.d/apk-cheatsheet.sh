# ZWRT: 登录时显示的 opkg -> apk 命令对照表
# 已知图形终端(SSH 的 xterm/screen/tmux 等)输出中文; 控制台及未知 TERM(linux/vt100/空, 如 noVNC)默认英文避免方块
if [ -x /usr/bin/apk ] ; then
# 已知支持中文的图形终端走中文; 其余(linux/vt100/空/未知控制台)默认英文, 避免无中文字体时出方块
case "$TERM" in
xterm*|screen*|tmux*|putty*|rxvt*|*color*)
cat << 'EOF'

 OpenWrt 已切换至 "apk" 软件包管理器!

OPKG 命令            APK 对应命令       说明
---------------------------------------------------------
opkg install <pkg>   apk add <pkg>      安装软件包
opkg remove <pkg>    apk del <pkg>      卸载软件包
opkg upgrade         apk upgrade        升级全部软件包
opkg files <pkg>     apk info -L <pkg>  查看软件包文件列表
opkg list-installed  apk info           列出已安装软件包
opkg update          apk update         更新软件源索引
opkg search <pkg>    apk search <pkg>   搜索软件包
---------------------------------------------------------
EOF
;;
*)
cat << 'EOF'

 OpenWrt switched to the "apk" package manager!

OPKG Command         APK Equivalent     Description
---------------------------------------------------------
opkg install <pkg>   apk add <pkg>      Install a package
opkg remove <pkg>    apk del <pkg>      Remove a package
opkg upgrade         apk upgrade        Upgrade all packages
opkg files <pkg>     apk info -L <pkg>  List package files
opkg list-installed  apk info           List installed packages
opkg update          apk update         Update package lists
opkg search <pkg>    apk search <pkg>   Search packages
---------------------------------------------------------
EOF
;;
esac
fi
