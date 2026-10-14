"use strict";
/* ZWRT 定制 OpenWrt 固件构建器 — 纯前端，token 只在本机浏览器，不经过任何服务器 */

/* 常用软件包（名称 + 简短说明），名称需与源目录一致；仅当在当前架构目录中存在才展示 */
const COMMON = [
  ["luci-app-adguardhome", "ADGuard Home 去广告"],
  ["luci-app-aria2", "Aria2 下载工具"],
  ["luci-app-broadbandacc", "宽带提速"],
  ["luci-app-clouddrive2", "多云盘管理"],
  ["luci-app-cpulimit", "CPU 占用率限制"],
  ["luci-app-ddns", "动态域名解析"],
  ["luci-app-ddns-go", "DDNS-GO 动态解析"],
  ["luci-app-ddnsto", "内网穿透 DDNSTO"],
  ["luci-app-diskman", "磁盘管理"],
  ["luci-app-easytier", "异地组网 EasyTier"],
  ["luci-app-filebrowser-q", "文件网盘管理"],
  ["luci-app-frpc", "内网穿透 FRP 客户端"],
  ["luci-app-frps", "FRP 服务端"],
  ["luci-app-guest-wifi", "访客 WiFi"],
  ["luci-app-ksmbd", "内核级文件共享"],
  ["luci-app-linkease", "易有云文件管理"],
  ["luci-app-lucky", "Lucky 多功能网络工具"],
  ["luci-app-mosdns", "DNS 转发 MosDNS"],
  ["luci-app-msd_lite", "IPTV 组播"],
  ["luci-app-mwan3-nft", "负载均衡 MWAN3"],
  ["luci-app-natmap", "内网穿透 NATMAP"],
  ["luci-app-netdata", "性能监测 Netdata"],
  ["luci-app-npc", "NPS 内网穿透客户端"],
  ["luci-app-nlbwmon", "流量统计 NLBWMon"],
  ["luci-app-qbittorrent", "BT 下载 qBittorrent"],
  ["luci-app-rclone", "云盘挂载同步"],
  ["luci-app-samba4", "Samba 文件共享"],
  ["luci-app-smartdns", "SmartDNS"],
  ["luci-app-socat", "端口转发 Socat"],
  ["luci-app-store", "iStore 软件中心"],
  ["luci-app-substore", "订阅管理与转换"],
  ["luci-app-syncdial", "多拨"],
  ["luci-app-tailscale-community", "Tailscale 组网"],
  ["luci-app-timedreboot", "定时重启"],
  ["luci-app-ttyd", "网页版命令行"],
  ["luci-app-turboacc", "网络加速 TurboACC"],
  ["luci-app-unblockneteasemusic", "解锁网易云音乐"],
  ["luci-app-vlmcsd", "KMS 服务器"],
  ["luci-app-vsftpd", "FTP 服务器"],
  ["luci-app-watchcat", "断网检测重启"],
  ["luci-app-wireguard", "WireGuard"],
  ["luci-app-wrtbwmon", "流量监控 WRTbwmon"],
  ["luci-app-zerotier", "ZeroTier 组网"],
  ["automount", "自动挂载 USB/硬盘"],
  ["btop", "性能监控 btop"],
];

const DEVICES_URL = "data/devices.json";
const PKG_URL = (a) => (a === "x86_64" ? "data/packages-x86_64.json" : "data/packages-aarch64.json");
const DEFAULT_REPO = { owner: "KuwiNet", name: "ZWRT" };
const TOKEN_KEY = "zwrt_token";
const PKG_RE = /^[a-zA-Z0-9][a-zA-Z0-9+_.-]{0,63}$/;
const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAX_INIT = 16000;

const $ = (id) => document.getElementById(id);
const state = {
  devices: [],
  catalog: new Map(),   // name -> desc
  device: null,          // current device object
  pkg: new Map(),        // name -> 'on' | 'off'
  loading: false,
};

async function getJSON(url, token) {
  const h = {};
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(url, { headers: h });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
  return r.json();
}

/* ---------- 设备 ---------- */
async function loadDevices() {
  state.devices = await getJSON(DEVICES_URL);
  const list = $("deviceList");
  list.innerHTML = "";
  state.devices.forEach((d) => {
    const el = document.createElement("div");
    el.className = "device";
    el.innerHTML = `<div class="dname"></div><div class="darch"></div>`;
    el.querySelector(".dname").textContent = d.name;
    el.querySelector(".darch").textContent = d.archLabel;
    el.onclick = () => selectDevice(d);
    d._el = el;
    list.appendChild(el);
  });
  selectDevice(state.devices[0]);
}

async function selectDevice(d) {
  state.device = d;
  state.devices.forEach((x) => x._el.classList.toggle("sel", x === d));
  $("deviceNote").textContent = d.note;
  // 载入该架构包目录
  const pj = await getJSON(PKG_URL(d.arch));
  state.catalog = new Map(pj.pkgs);
  // 设置默认参数
  setParams(d.defaults);
  // 初始化包集合：出厂包默认全选
  state.pkg = new Map();
  d.required.forEach((n) => state.pkg.set(n, "on"));
  renderChips();
  updateSummary();
}

function setParams(p) {
  $("hostname").value = p.hostname || "ZWRT";
  $("lan_ip").value = p.lan_ip || "";
  $("lan_mask").value = p.lan_mask || "";
  $("gateway").value = p.gateway || "";
  $("dns").value = p.dns || "";
  $("ipv6").checked = !!p.ipv6;
  $("wifi").checked = !!p.wifi;
  $("wifi_ssid").value = p.wifi_ssid || "";
  $("wifi_key").value = p.wifi_key || "";
  updateParamVisibility();
}

/* ---------- 软件包 ---------- */
function renderChips() {
  const d = state.device;
  const defaults = $("defaultChips"), common = $("commonChips"), custom = $("customChips");
  defaults.innerHTML = "";
  d.required.forEach((n) => {
    const s = state.pkg.get(n);
    const core = !n.startsWith("luci-app-") && s !== "off";
    defaults.appendChild(chipEl(n, s, core, () => toggle(n), true));
  });
  common.innerHTML = "";
  COMMON.forEach(([n, zh]) => {
    if (!state.catalog.has(n)) return;
    const s = state.pkg.get(n) || "off";
    common.appendChild(chipEl(n + " · " + zh, s, false, () => toggle(n), false));
  });
  custom.innerHTML = "";
  state.pkg.forEach((s, n) => {
    if (!d.required.includes(n) && s === "on") custom.appendChild(chipEl(n, s, false, () => toggle(n), false));
  });
  $("customCount").textContent = state.pkg.size > 0 ? state.pkg.size + " 个已选" : "";
}

function chipEl(label, s, core, onClick, withX) {
  const el = document.createElement("span");
  el.className = "chip" + (s === "on" ? " on" : s === "off" ? " off" : "") + (core ? " core" : "");
  if (core) el.innerHTML = `<span class="dot"></span>`;
  const txt = document.createElement("span");
  txt.textContent = label;
  el.appendChild(txt);
  if (withX) { const x = document.createElement("span"); x.className = "x"; x.textContent = "×"; el.appendChild(x); }
  el.onclick = onClick;
  return el;
}

function toggle(n) {
  const cur = state.pkg.get(n);
  if (cur === "off" || cur === undefined) state.pkg.set(n, "on");
  else state.pkg.set(n, "off");
  renderChips();
  updateSummary();
}

/* 定制软件包输入 */
function parsePkgInput() {
  const raw = $("pkgInput").value.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const bad = [];
  raw.forEach((tok) => {
    const remove = tok.startsWith("-");
    const name = remove ? tok.slice(1) : tok;
    if (!PKG_RE.test(name)) { bad.push(tok); return; }
    if (remove) state.pkg.set(name, "off");
    else state.pkg.set(name, "on");
  });
  $("pkgInput").value = "";
  renderChips();
  updateSummary();
  return bad;
}

/* ---------- 参数 ---------- */
function updateParamVisibility() {
  const isBypass = state.device && state.device.id === "x86-64-bypass";
  const isWH = state.device && state.device.id === "wh3000pro";
  // 网关/DNS 旁路由更有意义；无线只有 WH3000 Pro 有意义，其余设备默认隐藏
  $("gateway").closest("label").style.display = isBypass ? "" : "none";
  $("dns").closest("label").style.display = isBypass ? "" : "none";
  $("wifiWrap").style.display = isWH ? "" : "none";
  $("ssidWrap").style.display = isWH && $("wifi").checked ? "" : "none";
  $("keyWrap").style.display = isWH && $("wifi").checked ? "" : "none";
}

function initEventBindings() {
  ["hostname", "lan_ip", "lan_mask", "gateway", "dns", "wifi_ssid", "wifi_key"].forEach((id) => {
    $(id).addEventListener("input", updateSummary);
  });
  ["ipv6", "wifi"].forEach((id) => {
    $(id).addEventListener("change", () => { updateParamVisibility(); updateSummary(); });
  });
  $("initScript").addEventListener("input", () => {
    const v = $("initScript").value;
    $("initLen").textContent = v.length + (v.length > MAX_INIT ? " 字符（超限将截断）" : " 字符");
    updateSummary();
  });
  $("pkgInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); parsePkgInput(); }
  });
  $("resetDefaults").addEventListener("click", () => {
    state.pkg = new Map();
    state.device.required.forEach((n) => state.pkg.set(n, "on"));
    $("pkgInput").value = "";
    renderChips(); updateSummary();
  });
  $("buildBtn").addEventListener("click", startBuild);
  // 加载已保存 token
  $("ghToken").value = localStorage.getItem(TOKEN_KEY) || "";
}

/* ---------- 摘要 ---------- */
function selectedNames() {
  const arr = [];
  state.pkg.forEach((s, n) => { if (s === "on") arr.push(n); });
  return arr.sort();
}

function updateSummary() {
  const ip = $("lan_ip").value || state.device?.defaults?.lan_ip || "";
  const summary = {
    device: state.device ? state.device.id : "—",
    hostname: $("hostname").value || "ZWRT",
    lan_ip: ip,
    ipv6: $("ipv6").checked,
    wifi: $("wifi").checked,
    packages: selectedNames().length + " 个",
    init_script: ($("initScript").value.length || 0) + " 字符",
  };
  $("summaryJson").textContent = JSON.stringify(summary, null, 2);
}

/* ---------- 构建 ---------- */
function validateInputs() {
  const owner = $("repoOwner").value.trim();
  const name = $("repoName").value.trim();
  const token = $("ghToken").value.trim() || localStorage.getItem(TOKEN_KEY) || "";
  if (!owner || !name) return "请填写仓库所有者与仓库名";
  if (!token) return "请填写你的 GitHub Token（需要 repo + workflow 权限）";
  const h = $("hostname").value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/.test(h)) return "主机名仅允许字母数字与 . _ -，且以字母数字开头";
  for (const [id, lbl] of [["lan_ip", "LAN IP"], ["lan_mask", "子网掩码"], ["gateway", "网关"], ["dns", "DNS"]]) {
    const v = $(id).value.trim();
    if (v && !isValidIp(v)) return lbl + " 格式不正确";
  }
  const bad = parsePkgInput();
  if (bad.length) return "无效包名（仅允许字母数字 +_.-）：" + bad.join(", ");
  const init = $("initScript").value;
  if (init.length > MAX_INIT) return "初始化脚本过长（超过 " + MAX_INIT + " 字符）";
  return null;
}

function isValidIp(v) {
  if (!IP_RE.test(v)) return false;
  return v.split(".").every((o) => { const n = +o; return n >= 0 && n <= 255; });
}

async function startBuild() {
  if (state.loading) return;
  const err = validateInputs();
  if (err) { flash("buildBtn", err); return; }
  const owner = $("repoOwner").value.trim();
  const name = $("repoName").value.trim();
  const token = ($("ghToken").value.trim() || localStorage.getItem(TOKEN_KEY) || "").trim();

  if ($("saveToken").checked) localStorage.setItem(TOKEN_KEY, token);
  else if (!localStorage.getItem(TOKEN_KEY)) { /* keep saved if user never cleared */ }

  const sel = selectedNames();
  const inputs = {
    device: state.device.id,
    hostname: $("hostname").value.trim() || "ZWRT",
    lan_ip: $("lan_ip").value.trim(),
    lan_mask: $("lan_mask").value.trim(),
    gateway: $("gateway").value.trim(),
    dns: $("dns").value.trim(),
    ipv6: $("ipv6").checked ? "true" : "false",
    wifi: $("wifi").checked ? "true" : "false",
    wifi_ssid: $("wifi_ssid").value.trim(),
    wifi_key: $("wifi_key").value.trim(),
    packages_common: sel.join(" "),
    packages_wh3000: sel.join(" "),
    init_script: $("initScript").value,
  };

  state.loading = true;
  const btn = $("buildBtn");
  btn.disabled = true; btn.textContent = "正在触发构建…";
  showConsole(`触发构建 → ${owner}/${name}`);

  try {
    const r = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/workflows/build-openwrt.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main", inputs }),
      }
    );
    if (!r.ok) {
      const t = await r.text();
      let msg = "HTTP " + r.status;
      try { const j = JSON.parse(t); msg = (j.message || "") + (j.errors ? " " + JSON.stringify(j.errors) : ""); } catch (e) {}
      throw new Error(msg);
    }
    const t0 = Date.now();
    consoleLine("ok", "已触发。开始轮询构建状态…");
    await pollRuns(owner, name, token, t0);
  } catch (e) {
    consoleLine("err", "触发失败：" + e.message);
    consoleLine("info", "检查：仓库是否已包含 build-openwrt.yml？token 是否有 workflow 权限？仓库名大小写是否正确？");
  } finally {
    state.loading = false;
    btn.disabled = false; btn.textContent = "开始构建";
  }
}

async function pollRuns(owner, name, token, afterMs) {
  const max = 360; // ~1.5h
  for (let i = 0; i < max; i++) {
    await sleep(12000);
    try {
      const runs = await getJSON(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs?per_page=10&event=workflow_dispatch`,
        token
      );
      const mine = (runs.workflow_runs || []).find((r) => new Date(r.created_at).getTime() >= afterMs - 60000);
      if (!mine) { continue; }
      const st = mine.status, concl = mine.conclusion;
      consoleLine("info", `[${i}] run #${mine.run_number} → ${st}${concl ? "/" + concl : ""}`);
      if (st === "completed") {
        if (concl === "success") {
          consoleLine("ok", "构建成功。拉取固件下载列表…");
          await loadDownloads(owner, name, token);
        } else {
          consoleLine("err", "构建结束：" + concl + "。查看日志：" + mine.html_url);
        }
        return;
      }
      if (st === "queued" && i === 0) consoleLine("warn", "已在队列中（仓库可能同时在进行其他构建），继续等待…");
    } catch (e) {
      consoleLine("warn", "轮询出错：" + e.message + "（继续）");
    }
  }
  consoleLine("warn", "轮询超时。可到仓库 Actions 页面查看：" + `https://github.com/${owner}/${name}/actions`);
}

async function loadDownloads(owner, name, token) {
  const box = $("dlList");
  try {
    const rels = await getJSON(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases?per_page=4`,
      token
    );
    const files = [];
    (rels || []).forEach((r) => (r.assets || []).forEach((a) => {
      if (/^zwrt-.*\.(bin|img|img\.gz|gz|tar\.gz)$/.test(a.name)) files.push({ n: a.name, u: a.browser_download_url });
    }));
    if (!files.length) { box.innerHTML = `<div class="dl-empty">暂无固件。构建完成后会自动出现在 Release。</div>`; return; }
    box.innerHTML = "";
    files.forEach((f) => {
      const el = document.createElement("div");
      el.className = "dl-item";
      el.innerHTML = `<span></span><a href="" target="_blank" rel="noopener">下载</a>`;
      el.querySelector("span").textContent = f.n;
      el.querySelector("a").href = f.u;
      box.appendChild(el);
    });
  } catch (e) {
    box.innerHTML = `<div class="dl-empty">读取 Release 失败：${e.message}</div>`;
  }
}

/* ---------- console ---------- */
function showConsole(title) {
  const card = $("consoleCard");
  card.hidden = false;
  $("console").innerHTML = `<div class="info">${esc(title)}</div>`;
}
function consoleLine(cls, text) {
  const c = $("console");
  c.insertAdjacentHTML("beforeend", `<div class="${cls}">${esc(text)}</div>`);
  c.scrollTop = c.scrollHeight;
}
function flash(btnId, msg) {
  const b = $(btnId);
  const old = b.textContent;
  b.textContent = "⚠ " + msg;
  setTimeout(() => (b.textContent = old), 2600);
}
function esc(s) { const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ---------- init ---------- */
(async function init() {
  initEventBindings();
  try { await loadDevices(); }
  catch (e) {
    console.error(e);
    $("deviceList").innerHTML = `<div class="dl-empty">无法加载设备/包数据。请通过 https 访问本站（本地直接打开 html 因浏览器限制无法加载数据）。</div>`;
  }
  try { loadDownloads("KuwiNet", "ZWRT", ""); } catch (e) {}
})();
