#!/usr/bin/env node
/* 重新生成 site/public/data 下的设备与包目录数据。
 * 用法:  node scripts/refresh-data.js [owner/repo]
 *  默认取 KuWiNet/ZWRT 的 plugins/*.txt 作为出厂软件包来源。
 * 数据源: dl.openwrt.ai (25.12) + luci.zwrt.de 自有源。
 * 包分类: base(固定必装) + default(默认可选, 预填输入框) + wwan(随蜂窝开关).
 */
"use strict";
const https = require("https");
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const REPO = process.argv[2] || "KuWiNet/ZWRT";
const ARCHS = ["x86_64", "aarch64_cortex-a53"];
const FEEDS = ["base", "packages", "luci", "routing", "video", "kiddin9"];
const OUT = path.join(__dirname, "..", "public", "data");
const DL = "https://dl.openwrt.ai/releases/25.12/packages";
const ZWRT = "https://luci.zwrt.de/packages";

// ---- 默认可选应用包 (预填输入框; 用户可增删) ----
const DEFAULT_APPS = `bash bc coremark coreutils coreutils-stat coreutils-stty curl dbus ddns-go frpc glib2 htop iw jansson4 minicom nano nikki mihomo node127 smartmontools wget-ssl yq zram-swap ttyd shellsync chat atinout
luci-app-advancedplus luci-app-afrp luci-app-ddns-go luci-app-diskman luci-app-fan luci-app-firewall luci-app-footstrap-files luci-app-nikki luci-app-oui luci-app-package-manager luci-app-partexp luci-app-syscontrol luci-app-sysctl luci-app-timedreboot luci-app-ttyd luci-app-unblockneteasemusic luci-app-upnp luci-app-wifihistory luci-app-wizard`.split(/\s+/);

// ---- 蜂窝上网(WWAN) 相关包: 随 "开启蜂窝上网" 开关安装, 不放进可选包 ----
const WWAN_PKGS = `luci-app-5gmodem luci-i18n-5gmodem-zh-cn luci-proto-qmi luci-proto-mbim luci-proto-modemmanager qmi-utils libqmi mbim-utils libmbim modemmanager quectel-cm usb-modeswitch sms-tool
kmod-usb-net-qmi-wwan kmod-usb-net-cdc-mbim kmod-usb-net-rndis kmod-usb-serial kmod-usb-serial-option kmod-usb-serial-qualcomm`.split(/\s+/);

function get(u, binary) {
  return new Promise((res) => {
    https.get(u, { headers: { "User-Agent": "zwrt-refresh" } }, (r) => {
      const d = [];
      r.on("data", (c) => d.push(c));
      r.on("end", () => res({ s: r.statusCode, b: Buffer.concat(d) }));
    }).on("error", () => res({ s: 0, b: Buffer.from("") }));
  });
}
function raw(txt, tries) {
  tries = tries || 0;
  return new Promise((res) => {
    https.get("https://raw.githubusercontent.com/" + REPO + "/main/" + txt, { headers: { "User-Agent": "z" } }, (r) => {
      const d = [];
      r.on("data", (c) => d.push(c));
      r.on("end", () => {
        const ok = r.statusCode === 200 && d.length;
        if (ok) res({ s: r.statusCode, b: Buffer.concat(d).toString("utf8") });
        else if (tries < 3) setTimeout(() => res(raw(txt, tries + 1)), 1500);
        else res({ s: r.statusCode, b: "" });
      });
    }).on("error", () => { if (tries < 3) setTimeout(() => res(raw(txt, tries + 1)), 1500); else res({ s: 0, b: "" }); });
  });
}
function unzip(b) { try { return zlib.gunzipSync(b).toString("utf8"); } catch (e) { return b.toString("utf8"); } }
function parsePackages(txt, out) {
  for (const blk of txt.split("\n\n")) {
    const m = blk.match(/^Package:\s*(\S+)/m);
    if (!m) continue;
    const n = m[1];
    const dm = blk.match(/^Description:\s*(.*)$/m);
    const d = dm ? dm[1].replace(/\s+/g, " ").trim() : "";
    if (!out[n]) out[n] = { desc: "" };
    if (!out[n].desc && d) out[n].desc = d.length > 120 ? d.slice(0, 117) + "..." : d;
  }
  return out;
}
const clean = (t) => (t || "").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
const dedup = (a) => [...new Set(a)];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const [commonP, whP] = await Promise.all([raw("plugins/common.txt"), raw("plugins/wh3000pro.txt")]);
  const common = dedup(clean(commonP.b));
  const wh = dedup(clean(whP.b));
  const reqX = common; // x86 必需 = common.txt
  const reqWH = dedup([...common, ...wh]); // wh 必需 = common + wh3000pro

  const isDefault = new Set(DEFAULT_APPS);
  const isWwan = new Set(WWAN_PKGS);
  // 冗余蜂窝 CLI 工具(comgt/uqmi/umbim 已被 qmi/mbim 库替代): 不默认安装, 避免不开蜂窝也装
  const DROP = new Set(["comgt", "uqmi", "umbim"]);
  // 基础包 = 必需 - 默认可选 - wwan (均不进入可选; wwan 由蜂窝开关决定)
  const baseX = reqX.filter((p) => !isDefault.has(p) && !isWwan.has(p));
  // wh 专属基础包 (存储/固件类, 由 wh3000pro.txt 提供且非 wwan) -> 走 packages_wh3000
  const whExtra = wh.filter((p) => !isDefault.has(p) && !isWwan.has(p) && !DROP.has(p));

  const devices = [
    { id: "x86-64", name: "Generic x86/64", arch: "x86_64", archLabel: "x86_64",
      wfDeviceMain: "x86-64-main", wfDeviceBypass: "x86-64-bypass",
      defaults: { hostname: "ZWRT", lan_ip: "192.168.100.1", lan_mask: "255.255.255.0", gateway: "192.168.100.1", dns: "192.168.100.1", ipv6: false, wifi: false, wifi_ssid: "", wifi_key: "", wwan: false },
      bypassDefaults: { lan_ip: "192.168.100.10", gateway: "192.168.100.1", dns: "192.168.100.1" },
      base: baseX, default: DEFAULT_APPS, whExtra: [],
      note: "软路由/虚拟机通用镜像 (UEFI+Legacy)。可勾选旁路由/IPv6/无线/蜂窝上网。" },
    { id: "wh3000pro", name: "Huasifei WH3000 Pro · MT7981", arch: "aarch64_cortex-a53", archLabel: "aarch64_cortex-a53",
      wfDeviceMain: "wh3000pro", wfDeviceBypass: "",
      defaults: { hostname: "ZWRT", lan_ip: "192.168.100.1", lan_mask: "255.255.255.0", gateway: "192.168.100.1", dns: "192.168.100.1", ipv6: true, wifi: true, wifi_ssid: "ZWRT", wifi_key: "", wwan: false },
      base: baseX, default: DEFAULT_APPS, whExtra,
      note: "MT7981B (eMMC+NAND)。默认开 IPv6 与无线 (SSID=ZWRT)。" },
  ];
  fs.writeFileSync(path.join(OUT, "devices.json"), JSON.stringify({
    devices, wwan_packages: WWAN_PKGS,
    build_note: "base=固定必装; default=默认可选(可增删); wwan_packages=勾选蜂窝上网后追加。旁路由=关WAN/关DHCP, 需填网关/DNS。",
  }));

  for (const a of ARCHS) {
    const merged = {};
    for (const f of FEEDS) {
      const r = await get(`${DL}/${a}/${f}/Packages.gz`, true);
      if (r.s === 200 && r.b.length > 100) parsePackages(unzip(r.b), merged);
    }
    const zr = await get(`${ZWRT}/${a}/Packages.gz`, true);
    if (zr.s === 200 && zr.b.length > 200) parsePackages(unzip(zr.b), merged);
    const arr = Object.entries(merged).map(([n, v]) => [n, v.desc]).sort((x, y) => x[0].localeCompare(y[0]));
    const fname = "packages-" + a + ".json"; // x86_64 / aarch64_cortex-a53
    fs.writeFileSync(path.join(OUT, fname), JSON.stringify({ count: arr.length, pkgs: arr }));
    console.log(fname, "->", arr.length);
  }
  console.log("devices: x86 base=", baseX.length, "default=", DEFAULT_APPS.length, "| wh extra=", whExtra.length, "| wwan=", WWAN_PKGS.length);
  console.log("OK 已生成 devices.json + packages-*.json 于", OUT);
  process.exit(0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
