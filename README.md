# ZWRT-openwrt

基于 GitHub Actions + Cloudflare Pages 的自建 **OpenWrt 固件在线定制与构建**项目。

- **在线构建器**：https://zwrt.de （同时发布到 GitHub Pages）
- 选设备、开功能开关（旁路由 / IPv6 / 无线 / WWAN / Docker / HTTPS 后台 / DHCP / iStoreOS）、选软件包、写初始化脚本 → **一键触发 GitHub Actions 构建**
- 构建产物自动发布到 GitHub Release；固件可选上传 R2/B2（下载地址由 `R2_PUBLIC_URL` 自定义）
- **去中心化**：任何人 fork 到自己的库即可构建，不依赖本项目配额

---

## 特性

- **多平台矩阵**：x86-64 主路由 / x86-64 旁路由 / WH3000 Pro
- **workflow_dispatch 全参数定制**：动态矩阵 + 主机名 / LAN IP / 网关 / DNS / 管理密码 / IPv6 / 无线 / 软件包清单 / 初始化脚本
- 固件默认：主题 `ZWRT`、LAN `192.168.100.1`（旁路由 `.100.10`）、后台密码空、WiFi SSID `ZWRT`、签名 `kuwi.net`
- 软件源三级：`dl.openwrt.ai` → `luci.zwrt.de` → 官方
- 自动发布：单个 Release（`ZWRT-日期`）；R2 只保留最近 2 版

## 目录结构

```
.
├── .github/workflows/
│   ├── build-openwrt.yml     # 固件构建工作流（workflow_dispatch 全参数）
│   └── pages-cloudflare.yml  # 网站 → Cloudflare Pages 自动部署
├── configs/                  # 各平台目标配置 (seed)
│   ├── x86_64.seed
│   └── wh3000pro.seed
├── plugins/                  # 插件清单（一行一个包名）
│   ├── common.txt            # 所有平台通用
│   ├── x86_64.txt            # x86_64 专属
│   └── wh3000pro.txt         # WH3000 Pro 专属
├── targets/devices.yml       # 设备-矩阵定义
├── feeds/feeds.conf.custom   # 自定义 feeds
├── files/                    # 覆盖层（hostname=ZWRT、opkg 源、网络/无线生成模板）
├── scripts/                  # merge-feeds / merge-config / custom
└── site/public/              # 在线构建器前端（GitHub Pages + Cloudflare Pages）
```

## 支持的设备

| device | 设备 | 架构 / 目标 |
|--------|------|-------------|
| `x86-64-main` | x86_64 主路由 | x86_64 / `x86/64` |
| `x86-64-bypass` | x86_64 旁路由 | x86_64 / `x86/64` |
| `wh3000pro` | Huasifei WH3000 Pro | MT7981B / `mediatek/filogic` |

## 固件默认配置

- 主机名：`ZWRT`；LAN IP：`192.168.100.1`（旁路由 `.100.10`，网关 `.100.1`）
- 后台密码：空（**首次登录进入修改密码页面**）；WiFi SSID：`ZWRT`、密码空
- 默认主题：`luci-theme-zwrt`；签名：`kuwi.net`
- 软件源：`dl.openwrt.ai`（25.12 / 6.12 内核）→ `luci.zwrt.de`（ipk / apk）→ 官方

## 构建方式

### 1. 在线构建器（推荐）
访问 https://zwrt.de ，填写设备 / 功能开关 / 软件包 / 初始化脚本后，前端直连 GitHub API 触发 `workflow_dispatch` 构建。构建账号默认 `KuWiNet/ZWRT`，**也可填你自己 fork 的仓库**。

### 2. 手动触发（Actions → Run workflow）
`workflow_dispatch` 支持以下 inputs：

| input | 说明 |
|-------|------|
| `device` | `all` / `x86-64-main` / `x86-64-bypass` / `wh3000pro` |
| `hostname` | 主机名（空=ZWRT） |
| `lan_ip` / `lan_mask` / `gateway` / `dns` | 网络配置（空=设备默认；旁路由填网关） |
| `password` | root 管理密码（空=无密码） |
| `ipv6` / `wifi` | 布尔开关 |
| `wifi_ssid` / `wifi_key` | 无线（空=设备默认/无密码） |
| `packages_common` / `packages_wh3000` | 软件包清单（空=仓库默认；`__none__`=不装） |
| `init_script` / `init_script_b64` | 初始化脚本（写入 `/etc/uci-defaults`） |

### 3. 自动构建
`schedule` 每日检测稳定分支（默认 `openwrt-25.12`）有新提交即构建，无更新则跳过（`.cache/openwrt-stable-commit` 记录）。

## 软件源

`files/etc/opkg/distfeeds.conf` 定义三级源，构建时按 `dl.openwrt.ai` → `luci.zwrt.de` → 官方 顺序。

## 去中心化构建：Fork 到自己的库（推荐私有）

任何人可 fork 本项目，用**自己的 GitHub 账号**构建，不占用本项目配额：

1. **Fork**：GitHub → KuWiNet/ZWRT → Fork。
2. **设为私有（推荐）**：Settings → General → Danger Zone → Change visibility → **Private**。私有库的 Actions run 对外不可见，dispatch 参数（含密码）不会公开。
3. **（可选）固件上传到自己的 R2/B2 对象存储**（不配置则自动跳过上传，构建与 Release 照常成功）：

| 配置项 | 类型 | 用途 | 是否必需 |
|--------|------|------|---------|
| `R2_ACCESS_KEY_ID` | Secret | R2 S3 Access Key ID | 要上传则必需 |
| `R2_SECRET_ACCESS_KEY` | Secret | R2 S3 Secret Access Key | 要上传则必需 |
| `R2_BUCKET` | Secret | 桶名称（如 `zwrt`） | 要上传则必需 |
| `R2_ENDPOINT` | Secret | 自定义 S3 端点 `https://<account_id>.r2.cloudflarestorage.com` | 可选（缺省按 `R2_ACCOUNT_ID` 推导） |
| `R2_ACCOUNT_ID` | Secret | Cloudflare 账户 ID | 可选（设了 `R2_ENDPOINT` 可不填） |
| `R2_PUBLIC_URL` | Variable | 桶公开下载前缀（如 `https://你的域名`） | 可选（默认 `https://dl.zwrt.de`） |

获取位置（Cloudflare 控制台）：Access Key → `R2` 管理 API 令牌；Account ID → 控制台首页右上角；Bucket → `R2` 创建桶；公开前缀 → 桶 `Settings → Public access`（或默认 `https://pub-<hash>.r2.dev`）。

配置入口：仓库 → `Settings` → `Secrets and variables` → `Actions`（`R2_PUBLIC_URL` 加 Variables，其余加 Secrets）。

4. **使用你自己的库构建**：在在线构建器里把"构建账号"填成 `你的用户名/你的仓库名`，并填入你自己的 GitHub Token（只需 `repo` + `workflow` 权限）。

## 安全事项（重要）

> 本项目为"去中心化直连 GitHub API"设计，token 只存于你的浏览器（localStorage），**不经任何服务器**。但仍有几点务必注意：

### 1. dispatch 参数会留在 Actions run 记录里
`workflow_dispatch` 的 inputs（**含管理密码 `password`、base64 的初始化脚本**）会随该次 run 的元数据保存。**对公开仓库，任何人可通过 GitHub API 查看 run 的 inputs（明文）**。因此：

- **构建请优先用私有 fork**（run 记录仅自己可见）。
- 若用公开 `KuWiNet/ZWRT` 构建，**管理密码请留空**（走首次开机改密），固件和 dispatch 中都不会有密码。

### 2. 固件镜像内含 root 密码 hash（非明文）
固件上传到公开 Release / R2（若桶公开），`/etc/shadow` 含密码的 **crypt hash**（单向不可逆），但弱密码可被**离线爆破**。请用强密码，或保持"首次登录改密"模式。

### 3. 初始化脚本不要写敏感信息
`init_script` 会随 dispatch 暴露且解码后为**明文脚本**。**不要**在初始化脚本里写密码 / Token / API Key。

### 4. Token 权限最小化
- GitHub Token：只需 `repo` + `workflow` 权限即可触发构建，不要用高权限 token。
- Cloudflare Token：只需 `Account · Cloudflare Pages · Edit`（部署网站）。
- **绝不**把 Token 写入仓库文件、脚本或日志。

## 发布与部署

- **GitHub Release**：单 tag `ZWRT-日期`，含全部设备固件。
- **R2/B2 对象存储（可选）**：配置 R2 密钥后固件自动上传，上传完成后把下载地址写进 Release 描述。下载地址前缀由仓库 Variable `R2_PUBLIC_URL` 定义（默认 `https://dl.zwrt.de`），R2 只保留最近 2 版。前端"固件下载"优先显示该地址，无则回退 GitHub Release 直链。
- **网站**：`site/public` 由 `pages-cloudflare.yml`（Cloudflare Pages）与 `pages.yml`（GitHub Pages）双发布；推送 `site/public/**` 自动触发。

## 本地构建

```bash
git clone https://github.com/KuWiNet/ZWRT.git
git clone --depth=1 --branch openwrt-25.12 https://github.com/immortalwrt/immortalwrt.git openwrt
cd openwrt
bash ../ZWRT/scripts/merge-feeds.sh ../ZWRT .
bash ../ZWRT/scripts/merge-config.sh ../ZWRT x86-64-main .config
make defconfig && make -j$(nproc)
```

## 首次构建注意事项

- 首次构建耗时较长（拉取全部依赖），GitHub Actions 免费额度足够。
- 个别自定内核模块需匹配内核版本，若编译报错请提供日志并调整 feeds / 配置。
