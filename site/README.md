# ZWRT — 定制 OpenWrt 固件构建器（前端站点）

一个纯静态的 OpenWrt 固件在线定制页，部署在 Cloudflare Pages。**没有任何后端**：
构建用你在浏览器里填的 GitHub Token 直接触发你自己的 GitHub Actions，Token 只保存在你的浏览器，不经过任何服务器 —— 所以不占任何人的构建配额，可随意 fork。

## 它做什么

1. 选设备型号（下拉 + 关键字搜索）：`x86/64` / `WH3000 Pro`
2. 勾选功能：**旁路由**（仅 LAN 口、关 WAN/DHCP，需填网关/DNS）、**IPv6**、**无线**（SSID/密码）、**蜂窝上网 5G/4G**（自动追加 5gmodem 应用与主流蜂窝网卡驱动包）。ipv6/无线/蜂窝对任意设备可开。
3. 软件包：默认只装**基础包**（固定必装）；输入框预填该设备**默认可选包**（可删除）；输入关键字弹出匹配包，点击即填入。蜂窝包不放可选，随「蜂窝上网」开关决定。
4. 系统初始化 shell 脚本（写入 `/etc/uci-defaults`；勾选蜂窝上网时自动附加 WWAN 配置片段）
5. 填你的 GitHub Token（`repo` + `workflow` 权限）+ 仓库（默认 `KuWiNet/ZWRT`）
6. 一键触发对应仓库的 `build-openwrt.yml` 的 `workflow_dispatch`，实时轮询构建状态，完成后列出固件下载

旁路由/IPv6/无线后端配置由 ZWRT 仓库 `files/etc/uci-defaults/99-zwrt-network` 按变体生成，无需改 workflow。

## 目录

```
site/
├── public/                    # 静态站点（Cloudflare Pages 的根目录指向这里）
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── data/                  # 设备与包目录数据（由脚本生成，可重新生成）
│       ├── devices.json
│       ├── packages-x86_64.json
│       └── packages-aarch64_cortex-a53.json
├── scripts/
│   └── refresh-data.js        # 重新生成 public/data（拉 dl.openwrt.ai + luci.zwrt.de + 本仓库 plugins）
└── README.md
```

## 部署

站点已随仓库自动发布（两种方式，选一种即可）：

### 方式 A：GitHub Pages（已配置，开箱即用）

ZWRT 仓库已内置 `.github/workflows/pages.yml`：每次 `push` 改动 `site/**` 自动发布。首次需在 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

访问：**https://kuwinet.github.io/ZWRT/**

### 方式 B：Cloudflare Pages（可选）

1. 把本仓库 fork 一份（或直接用 KuwiNet/ZWRT）。
2. Cloudflare 控制台 → **Workers & Pages → Create → Pages → Connect to Git**，选择该仓库。
3. 构建设置：
   - **Build command（构建命令）**：留空（纯静态，无需构建）
   - **Build output directory（输出目录）**：`site/public`
   - Production branch：`main`
4. 保存并部署，得到一个 `*.pages.dev` 域名；可在 **Custom domains** 绑定你自己的域名。

> 注意：ZWRT 的 `build-openwrt.yml` 已把 `site/**` 和 `.github/workflows/pages.yml` 排除在 OpenWrt 构建触发之外，所以改 `site/` 下的文件不会触发固件重编译（只会触发 pages 发布）。

## fork 后如何用自己的账号构建

- 保留 `build-openwrt.yml`（fork 会自动带过来，其 `workflow_dispatch` 已支持设备/参数/软件包/初始化脚本输入）。
- 部署你的 fork 后，页面上把「仓库所有者」改成你的 GitHub 用户名、仓库名改成你的 fork 名，填入你自己创建的 Token（Personal access token，勾选 `repo` 与 `workflow` 权限）。
- 这样构建在你自己的仓库/Actions 配额下进行。

## 重新生成包目录

包目录是从 dl.openwrt.ai 与 luci.zwrt.de 拉取生成。如需更新：

```bash
node scripts/refresh-data.js            # 默认 KuwiNet/ZWRT
node scripts/refresh-data.js your/repo  # fork 用户用你自己的仓库
```

## 安全说明

- GitHub Token 只在你的浏览器里使用，通过 `Authorization: Bearer` 直接调用 GitHub API，**不会发送到任何服务器**，也不写入任何后端。
- 可选勾选「把 Token 保存在本机浏览器」会写入 `localStorage`（下次免填，但存在本机浏览器里，自行权衡）。
- 向 `KuwiNet/ZWRT` 触发构建需要对该仓库有 `workflow` 写权限；普通用户用自己的 Token 指向别人仓库会失败，这是自然保护，不会占用 KuwiNet 的配额。

## 已知边界

- 每次构建在同一个仓库的 `concurrency: zwrt-openwrt-build` 队列里串行，多人同时构建会排队；页面会显示等待状态。
- 固件会进入当天（或已有）的 `ZWRT-日期` Release 与 R2 `firmware/`，站点从 GitHub Release 列出下载。
- 设备/架构目前为 ZWRT 的三变体；需要更多设备时扩展 `devices.json` 与 ZWRT 的 matrix/workflow。
