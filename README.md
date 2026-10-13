# ZWRT-openwrt

通过 GitHub Actions 自动构建定制的多平台 OpenWrt 固件。跟踪官方稳定分支，稳定分支有新提交时自动编译；按设备/平台矩阵，每平台使用独立插件清单。

- 主机名统一：`ZWRT`
- 固件命名：`zwrt-YYYYMMDD-架构-设备-<类型>.bin / .img.gz`
- 发布：自动创建 GitHub Release + 上传 Artifact

## 目录结构

```
ZWRT-openwrt/
├── .github/workflows/build-openwrt.yml   # 自动构建工作流
├── configs/                              # 各平台目标配置 (seed)
│   ├── x86_64.seed
│   └── wh3000pro.seed
├── plugins/                              # 插件清单 (一行一个包名)
│   ├── common.txt        # 所有平台通用插件
│   ├── x86_64.txt        # x86_64 专属
│   └── wh3000pro.txt     # WH3000 Pro 专属
├── targets/devices.yml   # 设备-矩阵定义 (设备名/架构/seed/插件组合)
├── feeds/feeds.conf.custom # 自定义 feeds (非官方源的包)
├── files/                # 覆盖层 (files/etc/config/system -> hostname=ZWRT)
└── scripts/
    ├── merge-feeds.sh    # 合并自定义 feeds 到 OpenWrt 源码
    ├── merge-config.sh   # seed + 插件清单 -> .config
    └── custom.sh         # 固件重命名
```

## 支持的设备

| 设备 ID | 设备 | 架构 / 目标 |
|---------|------|-------------|
| `x86_64` | x86_64 (Generic) | x86_64 / `x86/64` |
| `wh3000pro` | Huasifei WH3000 Pro | MT7981B / `mediatek/filogic` |

> 新增设备：在 `configs/` 加一个 `.seed`、在 `plugins/` 加一个 `.txt`、在 `targets/devices.yml` 加一条、再在 workflow 的 `matrix.include` 加一条即可。

## 版本策略

- 默认跟踪 **OpenWrt 稳定分支 `openwrt-25.12`**（25.12 为当前稳定系列，24.10 已 EOL）。
- 稳定分支有新提交时自动编译；无新提交则跳过（通过 `.cache/openwrt-stable-commit` 记录上次构建的源码 commit）。
- 手动触发（`Actions` → `Run workflow`）会强制构建，忽略缓存判断。
- 想换分支：设置仓库变量 `OPENWRT_BRANCH`（如 `openwrt-24.10`）即可覆盖。

## 插件清单说明

当前 `common.txt` 里是你在两个设备上共用的一整套包（387 个，含 `luci-theme-zwrt`、`nikki`、`mihomo`、`modemmanager`、`luci-app-advancedplus` 等）。

- 把某平台特有的包从 `common.txt` 移到对应 `x86_64.txt` / `wh3000pro.txt`，即可实现"不同平台不同插件"。
- 清单里的版本号只是参考固件的已装版本，构建时只需包名；实际版本由编译时的 feeds 决定。
- 大量自定包不在官方源，由 `feeds/feeds.conf.custom` 提供（kenzok8/openwrt-packages、kenzok8/small、KuWiNet/ZWRT-Theme 等）。

## 自定义 feeds

`feeds/feeds.conf.custom` 已预置主要来源。若某包编译时报 "Package xxx is missing dependencies" 或找不到，多半需调整该文件里的源（详见文件内注释）。

## 本地运行

在装有 Linux 构建环境的机器上：

```bash
git clone https://github.com/KuWiNet/ZWRT-openwrt.git
git clone --depth=1 --branch openwrt-25.12 https://github.com/openwrt/openwrt.git openwrt
cd openwrt
bash ../ZWRT-openwrt/scripts/merge-feeds.sh ../ZWRT-openwrt .
bash ../ZWRT-openwrt/scripts/merge-config.sh ../ZWRT-openwrt x86_64 .config
make defconfig && make -j$(nproc)
```

## 首次构建注意事项

- 首次构建会拉取全部依赖，耗时较长（GitHub Actions 免费额度足够）。
- 个别自定内核模块（如 `kmod-nft-fullcone`）可能需匹配内核版本，若编译报错请反馈对应日志，调整 feeds 或配置。
