#!/usr/bin/env node
/* 重新生成 site/public/data 下的设备与包目录数据。
 * 用法:  node scripts/refresh-data.js [owner/repo]
 *  默认取 KuwiNet/ZWRT 的 plugins/*.txt 作为出厂默认包。
 * 数据源: dl.openwrt.ai (25.12) + luci.zwrt.de 自有源。
 */
"use strict";
const https = require("https");
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const REPO = process.argv[2] || "KuwiNet/ZWRT";
const [OWNER, NAME] = REPO.split("/");
const ARCHS = ["x86_64", "aarch64_cortex-a53"];
const FEEDS = ["base", "packages", "luci", "routing", "video", "kiddin9"];
const OUT = path.join(__dirname, "..", "public", "data");
const DL = "https://dl.openwrt.ai/releases/25.12/packages";
const ZWRT = "https://luci.zwrt.de/packages";

function get(u, binary) {
  return new Promise((res) => {
    https.get(u, { headers: { "User-Agent": "zwrt-refresh" } }, (r) => {
      const d = [];
      r.on("data", (c) => d.push(c));
      r.on("end", () => res({ s: r.statusCode, b: Buffer.concat(d) }));
    }).on("error", (e) => res({ s: 0, b: Buffer.from(e.message) }));
  });
}
function raw(txt) {
  return new Promise((res) => {
    https.get("https://raw.githubusercontent.com/" + REPO + "/main/" + txt, { headers: { "User-Agent": "z" } }, (r) => {
      const d = [];
      r.on("data", (c) => d.push(c));
      r.on("end", () => res({ s: r.statusCode, b: r.statusCode === 200 ? Buffer.concat(d).toString("utf8") : "" }));
    }).on("error", (e) => res({ s: 0, b: "" }));
  });
}
function unzip(b) {
  try { return zlib.gunzipSync(b).toString("utf8"); } catch (e) { return b.toString("utf8"); }
}
function parsePackages(txt, feed, out) {
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const [commonP, whP] = await Promise.all([raw("plugins/common.txt"), raw("plugins/wh3000pro.txt")]);
  const common = clean(commonP.b), wh = clean(whP.b);
  const reqX = [...new Set(common)];
  const reqWH = [...new Set([...common, ...wh])];

  const devices = [
    { id: "x86-64-main", name: "Generic x86/64 · 主路由", arch: "x86_64", archLabel: "x86_64",
      defaults: { lan_ip: "192.168.100.1", lan_mask: "255.255.255.0", gateway: "192.168.100.1", dns: "192.168.100.1", ipv6: false, wifi: false, wifi_ssid: "", wifi_key: "", hostname: "ZWRT" },
      required: reqX, note: "软路由主路由模式：开 DHCP、开 WAN。" },
    { id: "x86-64-bypass", name: "Generic x86/64 · 旁路由", arch: "x86_64", archLabel: "x86_64",
      defaults: { lan_ip: "192.168.100.10", lan_mask: "255.255.255.0", gateway: "192.168.100.1", dns: "192.168.100.1", ipv6: false, wifi: false, wifi_ssid: "", wifi_key: "", hostname: "ZWRT" },
      required: reqX, note: "旁路由模式：关 DHCP、关 WAN，网关指向主路由。" },
    { id: "wh3000pro", name: "Huasifei WH3000 Pro · MT7981", arch: "aarch64_cortex_a53", archLabel: "aarch64_cortex-a53",
      defaults: { lan_ip: "192.168.100.1", lan_mask: "255.255.255.0", gateway: "192.168.100.1", dns: "192.168.100.1", ipv6: true, wifi: true, wifi_ssid: "ZWRT", wifi_key: "", hostname: "ZWRT" },
      required: reqWH, note: "MT7981B (eMMC+NAND)，默认开 IPv6 与无线（SSID=ZWRT）。" },
  ];
  fs.writeFileSync(path.join(OUT, "devices.json"), JSON.stringify(devices));

  for (const a of ARCHS) {
    const merged = {};
    for (const f of FEEDS) {
      const r = await get(`${DL}/${a}/${f}/Packages.gz`, true);
      if (r.s === 200 && r.b.length > 100) parsePackages(unzip(r.b), f, merged);
    }
    const zr = await get(`${ZWRT}/${a}/Packages.gz`, true);
    if (zr.s === 200 && zr.b.length > 200) parsePackages(unzip(zr.b), "zwrt", merged);
    const arr = Object.entries(merged).map(([n, v]) => [n, v.desc]).sort((x, y) => x[0].localeCompare(y[0]));
    const fname = a === "x86_64" ? "packages-x86_64.json" : "packages-aarch64.json";
    fs.writeFileSync(path.join(OUT, fname), JSON.stringify({ count: arr.length, pkgs: arr }));
    console.log(fname, "->", arr.length);
  }
  console.log("OK 已生成 devices.json + packages-*.json 于", OUT);
  process.exit(0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
