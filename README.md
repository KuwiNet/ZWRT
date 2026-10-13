# ZWRT-openwrt

通过 GitHub Actions 自动构建定制的多平台 OpenWrt 固件。跟踪稳定分支，稳定分支有新提交时自动编译；按设备/平台矩阵构建。

- 主机名统一：`ZWRT`
- 固件命名：`zwrt-YYYYMMDD-架构-设备-<类型>.bin / .img.gz`
- 固件内 opkg 软件源：**全部使用 dl.openwrt.ai (Kwrt)**
- 发布：GitHub Release + Artifact + **Cloudflare R2**（https://dl.zwrt.de/firmware/）

## 目录结构

```
ZWRT/
├── .github/workflows/build-openwrt.yml   # 自动构建工作流 (含 R2 上传)
├── configs/                              # 各平台目标配置 (seed)
│   ├── x86_64.seed
│   └── wh3000pro.seed
├── plugins/                              # 插件清单 (一行一个包名)
│   ├── common.txt        # 所有平台通用插件
│   ├── x86_64.txt        # x86_64 专属
│   └── wh3000pro.txt     # WH3000 Pro 专属
├── targets/devices.yml   # 设备-矩阵定义 (设备名/架构/seed/插件组合)
├── feeds/feeds.conf.custom # 构建期自定义 git feeds (非官方源包)
├── files/
│   ├── etc/config/system         # hostname=ZWRT
│   └── etc/opkg/distfeeds.conf   # 运行期 opkg 源 (dl.openwrt.ai, 按架构生成)
└── scripts/
    ├── merge-feeds.sh    # 合并自定义 feeds 到 OpenWrt 源码
    ├── merge-config.sh   # seed + 插件清单 -> .config
    └── custom.sh         # 固件重命名
```

## 支持的设备

| 设备 ID | 设备 | 架构 / 目标 | opkg 源架构 |
|---------|------|-------------|-------------|
| `x86_64` | x86_64 (Generic) | x86_64 / `x86/64` | `x86_64` |
| `wh3000pro` | Huasifei WH3000 Pro | MT7981B / `mediatek/filogic` | `aarch64_cortex-a53` |

> 新增设备：在 `configs/` 加 `.seed`、`plugins/` 加 `.txt`、`targets/devices.yml` 加条目、workflow `matrix.include` 加条目（含 `feed_arch` / `feed_target`）。

## 软件源 (dl.openwrt.ai 全源)

固件刷入后 `/etc/opkg/distfeeds.conf` 为 dl.openwrt.ai 的 7 个源（core/base/packages/luci/routing/video/kiddin9），覆盖清单中的全部包：

```
src/gz kwrt_core https://dl.openwrt.ai/releases/25.12/targets/<目标>/6.12.112
src/gz kwrt_base https://dl.openwrt.ai/releases/25.12/packages/<架构>/base
src/gz kwrt_packages https://dl.openwrt.ai/releases/25.12/packages/<架构>/packages
src/gz kwrt_luci https://dl.openwrt.ai/releases/25.12/packages/<架构>/luci
src/gz kwrt_routing https://dl.openwrt.ai/releases/25.12/packages/<架构>/routing
src/gz kwrt_video https://dl.openwrt.ai/releases/25.12/packages/<架构>/video
src/gz kwrt_kiddin9 https://dl.openwrt.ai/releases/25.12/packages/<架构>/kiddin9
```

构建期自定义包由 `feeds/feeds.conf.custom`（kenzok8/openwrt-packages、kenzok8/small、KuWiNet/ZWRT-Theme 等）提供。

> 注意：opkg 源仅对 **opkg 体系** 固件生效。官方主线 `openwrt-25.12` 分支已改用 **apk**；如需 opkg 固件，请把 `OPENWRT_BRANCH` 指向 opkg 体系的源码线（见下方"版本策略"）。

## 固件下载 (Cloudflare R2)

每次构建会把 `zwrt-*` 固件上传到 R2 的 `firmware/` 目录，公开下载地址：

```
https://dl.zwrt.de/firmware/zwrt-YYYYMMDD-架构-设备-<类型>
```

需要在仓库 **Secrets** 配置（否则该步骤自动跳过）：

| Secret | 说明 | 示例 |
|--------|------|------|
| `R2_ACCESS_KEY_ID` | R2 S3 API Access Key ID | `xxxxxxxxxxxxxxxxxxxx` |
| `R2_SECRET_ACCESS_KEY` | R2 S3 API Secret | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `R2_ENDPOINT` | R2 S3 API Endpoint | `https://<accountid>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | R2 桶名（已绑定 dl.zwrt.de） | `zwrt` |

可选变量 `R2_PUBLIC_URL`（默认 `https://dl.zwrt.de`）。

## 版本策略

- 默认跟踪 **OpenWrt 稳定分支 `openwrt-25.12`**；稳定分支有新提交时自动编译，无新提交则跳过（`.cache/openwrt-stable-commit` 记录上次 commit）。
- 手动触发（`Actions` → `Run workflow`）强制构建。
- 换分支：设置仓库变量 `OPENWRT_BRANCH` 覆盖。
- ⚠️ 若目标是 opkg/ipk 固件（与 dl.openwrt.ai、opkg.zwrt.de 生态一致），官方 `openwrt-25.12`（apk）不适用，请改用 opkg 体系源码线（如 dl.openwrt.ai / Kwrt 对应构建树或相应分支）。

## 插件清单说明

`common.txt` 为两设备共用的一整套包（387 个）。平台特有包移入 `x86_64.txt` / `wh3000pro.txt` 即可实现"不同平台不同插件"。清单版本号仅供对照，构建时以 feeds 实际版本为准。

## 本地运行

```bash
git clone https://github.com/KuWiNet/ZWRT.git
git clone --depth=1 --branch openwrt-25.12 https://github.com/openwrt/openwrt.git openwrt
cd openwrt
bash ../ZWRT/scripts/merge-feeds.sh ../ZWRT .
bash ../ZWRT/scripts/merge-config.sh ../ZWRT x86_64 .config
make defconfig && make -j$(nproc)
```

## 首次构建注意事项

- 首次构建拉取全部依赖，耗时较长。
- 个别自定内核模块（如 `kmod-nft-fullcone`）需匹配内核版本，报错请反馈日志调整 feeds 或配置。