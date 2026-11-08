# ZWRT: 登录时显示的 opkg -> apk 中文对照表 (已删除官方网址行)
if [ -x /usr/bin/apk ] ; then
cat << 'EOF'

 OpenWrt 已切换至 "apk" 软件包管理器!

OPKG 命令            APK 对应命令       说明
--------------------------------------------
opkg install <pkg>   apk add <pkg>      安装软件包
opkg remove <pkg>    apk del <pkg>      卸载软件包
opkg upgrade         apk upgrade        升级全部软件包
opkg files <pkg>     apk info -L <pkg>  查看软件包文件列表
opkg list-installed  apk info           列出已安装软件包
opkg update          apk update         更新软件源索引
opkg search <pkg>    apk search <pkg>   搜索软件包
--------------------------------------------

EOF
fi
