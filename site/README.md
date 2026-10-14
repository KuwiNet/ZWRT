# ZWRT Builder — 构建配置器网站

仿 [openwrt.ai](https://openwrt.ai) 的 ZWRT 固件在线配置器，可直接在浏览器中配置并触发 GitHub Actions 构建。

## 功能

- **设备选择**：x86_64 主路由 / x86_64 旁路由 / WH3000 Pro / 全部构建
- **参数配置**：主机名、LAN IP、子网掩码、网关、DNS、IPv6、无线 SSID/密码
- **软件包选择**：通用 359 包 + WH3000 Pro 专属 28 包，可搜索、全选/清空
  - 默认全选 = 仓库标准清单；清空某类 = `__none__`（不装）；取消勾选 = 按所选清单构建
- **初始化脚本**：自定义 `/etc/uci-defaults` 脚本（附常用模板）
- **一键构建**：填写 GitHub Token（仅存浏览器 localStorage）→ 触发 `build-openwrt.yml` 的 `workflow_dispatch`
- **最近发布**：自动拉取最新 Release 并提供 R2 / GitHub 下载链接

## 目录

```
site/
├── index.html      # 单页应用 (自包含, 内嵌软件包清单)
├── wrangler.toml   # Cloudflare Pages 配置
└── README.md
```

## 发布

### GitHub Pages（自动）

1. 推送后由 `.github/workflows/pages.yml` 自动部署 `site/`。
2. 首次需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。
3. 地址：`https://<用户名>.github.io/ZWRT/`

### Cloudflare Pages（二选一）

**方式 A — 控制台直连（推荐，无需本地环境）**
1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers 和 Pages** → **创建** → **Pages** → **连接到 Git**。
2. 选择 `KuWiNet/ZWRT` 仓库。
3. 构建配置：
   - Framework preset: **None**
   - 构建命令: *(留空)*
   - 构建输出目录: **`site`**
4. 保存并部署，访问地址形如 `https://zwrt-builder.pages.dev`（可在项目设置中绑定自定义域名，如 `builder.zwrt.de`）。

**方式 B — Wrangler CLI**
```bash
export CLOUDFLARE_API_TOKEN=<你的 CF API Token>
npx wrangler pages deploy site --project-name zwrt-builder
```

## 触发构建需要什么

- 仓库：默认 `KuWiNet/ZWRT`（可改为你自己的 fork）
- GitHub Token：需 **repo** 权限（`repo` scope 即包含 `workflow`），用于调用 `POST /repos/{repo}/actions/workflows/build-openwrt.yml/dispatches`
- Token 仅保存在浏览器 localStorage，**不会**发送到本站服务器

## 与 Actions 联动

网站提交的 `workflow_dispatch` inputs（`build-openwrt.yml` 已支持）：

| input | 说明 |
|---|---|
| `device` | `all` / `x86-64-main` / `x86-64-bypass` / `wh3000pro` |
| `hostname` | 主机名，默认 ZWRT |
| `lan_ip` / `lan_mask` / `gateway` / `dns` | 网络参数，空 = 设备默认 |
| `ipv6` / `wifi` | 布尔开关 |
| `wifi_ssid` / `wifi_key` | 无线参数 |
| `packages_common` | 通用软件包清单（空格分隔；空 = 仓库默认；`__none__` = 不装） |
| `packages_wh3000` | WH3000 Pro 专属清单（同上） |
| `init_script` | 自定义初始化脚本，写入 `/etc/uci-defaults/90-zwrt-custom-init` |

## 本地预览

直接双击打开 `index.html` 即可预览（包清单已内嵌，无需联网）；仅"最近发布"与"触发构建"需要联网。
