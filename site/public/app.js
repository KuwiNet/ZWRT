/* ZWRT 构建器 — 纯静态、去中心化：浏览器直连 GitHub API 触发构建。Token 仅存 localStorage。

 * 全量设备版：按 target 分组搜索、设备信息面板、出厂包懒加载 device-pkgs.json、role 字段。 */

"use strict";



/* ===================== 纯函数区（可被 Node 测试直接引用，无 DOM 依赖） ===================== */



/* 互联网（科学上网）多选方案：与 openwrt.ai 一致，默认勾选 nikki */

const INTERNET_SCHEMES = [

  { id: "passwall", name: "PassWall", pkgs: ["luci-app-passwall"] },

  { id: "homeproxy", name: "HomeProxy", pkgs: ["luci-app-homeproxy"] },

  { id: "homeproxypro", name: "HomeProxy Pro", pkgs: ["luci-app-homeproxy-pro"] },

  { id: "ssrplus", name: "SSR-Plus", pkgs: ["luci-app-ssr-plus"] },

  { id: "openclash", name: "OpenClash", pkgs: ["luci-app-openclash"] },

  { id: "passwall2", name: "PassWall2", pkgs: ["luci-app-passwall2"] },

  { id: "nikki", name: "Nikki", pkgs: ["luci-app-nikki", "nikki", "mihomo"] },

  { id: "momo", name: "Momo", pkgs: ["luci-app-momo", "momo"] },

  { id: "clashoo", name: "Clashoo", pkgs: ["luci-app-clashoo", "clashoo"] },

  { id: "honk", name: "Honk", pkgs: ["luci-app-honk", "honk"] },

  { id: "lucixray", name: "luci-xray", pkgs: ["luci-app-xray", "xray-core"] },

  { id: "daed", name: "Daed", pkgs: ["luci-app-daed", "daed", "daed-geoip", "daed-geosite"] },

  { id: "hijpass", name: "HiJpass", pkgs: ["luci-app-hijpass"] },

  { id: "v2raya", name: "v2rayA", pkgs: ["luci-app-v2raya", "v2raya"] },

];

/* 主题多选（openwrt.ai 全部主题，含用户自建 zwrt / kucat） */

const THEMES = [

  "luci-theme-zwrt", "luci-theme-argon", "luci-theme-bootstrap",

  "luci-theme-bootstrap-mmdvm", "luci-theme-design", "luci-theme-alpha", "luci-theme-aurora",

  "luci-theme-edge", "luci-theme-fluent", "luci-theme-fluent-lite", "luci-theme-footstrap",

  "luci-theme-glass", "luci-theme-inas", "luci-theme-istorenas", "luci-theme-lightblue",

  "luci-theme-liquid", "luci-theme-luxe", "luci-theme-material", "luci-theme-material3",

  "luci-theme-merona", "luci-theme-noobwrt", "luci-theme-openmptcprouter", "luci-theme-openwrt",

  "luci-theme-openwrt-2020", "luci-theme-rmm", "luci-theme-routerich", "luci-theme-shadcn",

  "luci-theme-shadcnui", "luci-theme-spectra", "luci-theme-teleofis", "luci-theme-vantage",

  "luci-theme-kucat",

];



/* 解析包输入：空格分隔，-pkg 表示剔除（剔除项若在集合中则移除） */

function parsePkgInput(str) {

  const out = new Set(); const removed = new Set();

  (str || "").split(/\s+/).forEach((t) => {

    if (!t) return;

    if (t.startsWith("-")) removed.add(t.slice(1));

    else out.add(t);

  });

  removed.forEach((r) => out.delete(r));

  return [...out];

}

/* 影响固件使用的核心包：不显示、不可剔除 */

const PROTECTED_EXACT = new Set([

  "base-files", "busybox", "libc", "libgcc", "uci", "opkg", "mtd", "procd", "ubus", "ubusd",

  "ubox", "fstools", "netifd", "firewall4", "logd", "block-mount", "resolveip", "fitblk",

  "dnsmasq-full", "dropbear", "odhcpd", "odhcpd-ipv6only", "odhcp6c", "ppp", "ppp-mod-pppoe",

  "wpad-basic-mbedtls", "swconfig", "ca-bundle", "uclient-fetch", "urandom-seed", "urngd",

  "luci-base", "luci-compat", "luci-lib-fs", "luci-lib-ipkg", "mkf2fs", "f2fsck",

]);

const isProtected = (p) => PROTECTED_EXACT.has(p) || p.startsWith("kmod-") || /firmware$/.test(p) || p.startsWith("uboot-");



/* 出厂软件包数据源：legacy 内联 d.base；auto 从 device-pkgs[id] 取（懒加载后缓存） */

function deviceBaseList(d, devicePkgs) {

  if (!d) return [];

  if (Array.isArray(d.base)) return d.base;

  return (devicePkgs && devicePkgs[d.id]) || [];

}



/* 派发键：legacy 走 wfDeviceMain/wfDeviceBypass（与现状一致）；auto 用设备 id。

 * 旁路由且设备提供 bypass 变体（仅 x86-64）时用 wfDeviceBypass，其余用主键 + role='bypass'。 */

function dispatchKey(d, bypass) {

  if (!d) return "";

  if (bypass && d.wfDeviceBypass) return d.wfDeviceBypass;

  if (d.wfDeviceMain) return d.wfDeviceMain;

  return d.id;

}



/* 默认可选包预填：d.default 与当前架构 catalog 求交集；交集为空则空；catalog 未加载时原样返回 */

function prefillDefaults(d, catalogKeys) {

  const def = (d && d.default) || [];

  if (!def.length) return "";

  if (catalogKeys && catalogKeys.size) {

    return def.filter((p) => catalogKeys.has(p)).join(" ");

  }

  return def.join(" ");

}



/* flash 字节 → 可读 MB；0/缺失 → 未知 */

function fmtFlash(bytes) {

  if (!bytes || bytes <= 0) return "未知";

  const mb = bytes / 1048576;

  return (mb >= 100 ? Math.round(mb) : mb >= 10 ? mb.toFixed(1) : mb.toFixed(2)) + " MB";

}

function fmtFwSize(bytes) {

  if (!bytes || bytes <= 0) return "";

  return "约 " + Math.round(bytes / 1048576) + " MB";

}



/* 纯函数：组装派发 payload。o 见 buildInputs 形参注释。返回与 Worker/API 约定一致的 inputs。 */

function buildInputs(o) {

  const d = o.device;

  const allBase = deviceBaseList(d, o.devicePkgs || {});

  // 用户在出厂 chips 上点 × 标记为 -pkg：从出厂包清单中剔除（受保护包不在 chips 中出现，故不会被剔）

  const removed = new Set();

  (o.pkgInput || "").split(/\s+/).forEach((t) => { if (t && t.startsWith("-")) removed.add(t.slice(1)); });

  const base = allBase.filter((p) => !removed.has(p));

  const sel = parsePkgInput(o.pkgInput || "");

  const netPkgs = [...(o.net || [])].flatMap((id) => (INTERNET_SCHEMES.find((s) => s.id === id) || {}).pkgs || []);

  const themePkgs = [...new Set([...(o.themes || []), o.defaultTheme].filter(Boolean))];

  const wwan = o.wwan ? (o.wwanPackages || []) : [];

  const featurePkgs = [];

  if (o.docker) featurePkgs.push("docker", "luci-app-dockerman");

  if (o.https) featurePkgs.push("luci-ssl-openssl");

  if (o.istore) featurePkgs.push("luci-app-store");

  // packages_common = 出厂包(已剔除用户删除项) + 可选点选 + 互联网方案 + 主题 + 蜂窝 + 功能开关，合并去重

  const common = [...new Set([...base, ...sel, ...netPkgs, ...themePkgs, ...wwan, ...featurePkgs])];

  // packages_wh3000 仅 wh3000pro 设备传 whExtra+wwan，其余传空串

  const wh3000 = d && d.id === "wh3000pro"

    ? [...new Set([...(d.whExtra || []), ...wwan])]

    : [];

  const role = o.bypass ? "bypass" : "main";

  return {

    device: dispatchKey(d, o.bypass),

    role,

    hostname: o.hostname || "ZWRT",

    lan_ip: o.lan_ip || "",

    lan_mask: o.lan_mask || "",

    gateway: o.bypass ? o.gateway || "" : "",

    dns: o.bypass ? o.gateway || "" : "",


    ipv6: o.ipv6 ? "true" : "false",

    wifi: o.wifi ? "true" : "false",

    wifi_ssid: o.wifi ? o.wifi_ssid || "" : "",

    wifi_key: o.wifi ? o.wifi_key || "" : "",

    packages_common: common.join(" "),

    packages_wh3000: wh3000.join(" "),

    init_script: o.initScript || "",

    init_script_b64: o.initScriptB64 || "",

  };

}



/* 导出纯函数供 Node 测试与浏览器内部复用 */

if (typeof globalThis !== "undefined") {

  globalThis.ZWRT = {

    INTERNET_SCHEMES, THEMES, PROTECTED_EXACT, isProtected,

    parsePkgInput, deviceBaseList, dispatchKey, prefillDefaults, fmtFlash, fmtFwSize, buildInputs,

  };

}



/* ===================== 浏览器 UI 区（以下依赖 DOM） ===================== */



const $ = (s) => document.querySelector(s[0] === "#" ? s : "#" + s);

function on(sel, ev, fn) {

  const n = $(sel);

  if (!n) { console.warn("ZWRT: 缺少元素 #" + sel); return; }

  n.addEventListener(ev, fn);

}

const el = (tag, cls, text) => {

  const n = document.createElement(tag);

  if (cls) n.className = cls;

  if (text != null) n.textContent = text;

  return n;

};



/* 常用软件包（点击包名添加到可选包；参照 openwrt.ai 常用列表） */

const COMMON_PKGS = [

  ["luci-app-accesscontrol-plus", "访问控制"],

  ["luci-app-adbyby-plus", "adbyby去广告"], ["luci-app-adguardhome", "ADG去广告"],

  ["luci-app-afrp", "AFRP内网穿透"], ["luci-app-airplay2", "Airplay2音箱"], ["luci-app-aliyundrive-webdav", "阿里云盘WebDAV"],

  ["luci-app-ap-modem", "访问AP/光猫"], ["luci-app-aria2", "Aria2下载工具"],

  ["luci-app-arpbind", "ARP绑定"], ["luci-app-bandix", "流量监控限速"],

  ["luci-app-broadbandacc", "宽带提速"], ["luci-app-cifs-mount", "共享盘挂载"],

  ["luci-app-clouddrive2", "多云盘管理工具"], ["luci-app-cpulimit", "CPU占用率限制"],

  ["luci-app-cloudreve", "多存储网盘"], ["luci-app-cupsd", "CUPS打印服务"],

  ["luci-app-ddns", "动态域名解析"], ["luci-app-ddns-go", "动态域名解析"],

  ["luci-app-ddnsto", "内网穿透"], ["luci-app-diskman", "磁盘管理"],

  ["luci-app-dufs", "WebDAV文件管理"], ["luci-app-easymesh", "Mesh组网"],

  ["luci-app-easytier", "异地组网"], ["luci-app-filebrowser-q", "文件网盘管理"],

  ["luci-app-frpc", "内网穿透"], ["luci-app-frps", ""],

  ["luci-app-guest-wifi", "访客WIFI"], ["luci-app-hd-idle", "硬盘休眠"],

  ["luci-app-homeassistant", "智能家居"], ["luci-app-homeredirect", "端口转发"],

  ["luci-app-ipsec-server", ""], ["luci-app-iptvhelper", "IPTV助手"],

  ["luci-app-kodexplorer", "可道云网盘"], ["luci-app-ksmbd", "内核级文件共享"],

  ["luci-app-linkease", "易有云文件管理"], ["luci-app-lucky", "多功能网络工具"],

  ["luci-app-minidlna", ""],

  ["luci-app-msd_lite", "IPTV组播"], ["luci-app-mwan3-nft", "负载均衡"],

  ["luci-app-natmap", "内网穿透"], ["luci-app-nft-timecontrol", "上网时间控制"],

  ["luci-app-npc", "NPS内网穿透客户端"], ["luci-app-netdata", "性能监测"],

  ["luci-app-fastnet", "网络体检/测速"], ["luci-app-nlbwmon", "流量统计"],

  ["luci-app-oaf", "应用过滤"], ["luci-app-openclaw", "OpenClaw AI"],

  ["luci-app-openlist2", "原alist 多存储文件列表"], ["luci-app-openvpn-plus", "OpenVPN服务与客户端"],

  ["luci-app-p910nd", "USB打印机"], ["luci-app-parentcontrol", "家长控制"],

  ["luci-app-partexp", "分区扩容"], ["luci-app-qbittorrent", "BT下载工具"],

  ["luci-app-qosmate", "Qos流量控制"], ["luci-app-quickfile", "文件管理器"],

  ["luci-app-rclone", "云盘挂载同步"], ["luci-app-run", ""],

  ["luci-app-shunt", "策略路由"],

  ["luci-app-snmpd", ""],

  ["luci-app-socat", "端口转发"], ["luci-app-softethervpn", ""],

  ["luci-app-statistics", "collectd系统监控统计"], ["luci-app-store", "iStore软件包补充"],

  ["luci-app-substore", "订阅管理与转换"], ["luci-app-syncdial", "多拨"],

  ["luci-app-tailscale-community", "Tailscale虚拟组网"], ["luci-app-taskplan", "定时/开机任务"],

  ["luci-app-thunder", "迅雷下载"], ["luci-app-timedreboot", "定时重启"],

  ["luci-app-timewol", "网络唤醒"], ["luci-app-trafficctl", "流量限速"],

  ["luci-app-transmission", "BT下载"], ["luci-app-ttyd", "网页版命令行"],

  ["luci-app-turboacc", "网络加速"], ["luci-app-unblockneteasemusic", "解锁网易云音乐"],

  ["luci-app-unshare", "多种文件共享"], ["luci-app-uugamebooster", "UU游戏加速器"],

  ["luci-app-vlmcsd", "KMS服务器"], ["luci-app-vsftpd", "FTP服务器"],

  ["luci-app-watchcat", "断网检测重启"], ["luci-app-webdav", "基于Nginx的WebDAV"],

  ["luci-app-wechatpush", "通知推送"], ["luci-app-apfree-wifidog", "无线认证"],

  ["luci-app-wifischedule", "WiFi计划任务"], ["luci-app-wireguard", ""],

  ["luci-app-wrtbwmon", "流量监控"], ["luci-app-xlnetacc", "迅雷快鸟"],

  ["luci-app-xunyou", "迅游加速器"],

  ["automount", "自动挂载USB/硬盘"], ["btop", "性能监控"],

  ["naiveproxy", ""], ["open-vm-tools", ""],

  ["qemu-ga", ""], ["tvhelper", "盒子助手"],

];



const state = {

  devices: [],

  wwan: [],

  catalog: new Map(),       // name -> desc

  catalogArr: [],

  catalogFile: "",

  device: null,

  devicePkgs: {},           // 懒加载的 device-pkgs.json：id -> [pkg,...]

  devicePkgsLoaded: false,

  features: { bypass: false, ipv6: false, wifi: false, wwan: false, docker: false, https: false, dhcp: false, istore: false },

  params: { hostname: "ZWRT", lan_ip: "", lan_mask: "", gateway: "", wifi_ssid: "", wifi_key: "" },

  net: new Set([]),

  themes: new Set([]),

  defaultTheme: "",

  pkgInput: "",

  initScript: "",

  account: { str: "KuWiNet/ZWRT", token: "" },

  pollTimer: null,

  runId: null,

  triggering: false,

};



/* ---------- data ---------- */

async function getJSON(url) {

  const r = await fetch(url, { cache: "no-store" });

  if (!r.ok) throw new Error("HTTP " + r.status);

  return r.json();

}

const DEV_URL = "data/devices.json";

const PKG_URL = (arch) => "data/packages-" + arch + ".json";

const DEV_PKGS_URL = "data/device-pkgs.json";



async function loadData() {

  const d = await getJSON(DEV_URL);

  state.devices = d.devices;

  state.wwan = d.wwan_packages || [];

  $("m-devices").textContent = state.devices.length;

  state.device = state.devices[0];

  // 默认加载 x86_64 包目录（自建源覆盖最全，不选设备也能搜到包）；选择设备后按设备架构切换
  await loadCatalog("x86_64");

  await ensureDevicePkgs(state.device);

  applyDeviceDefaults();

  render();

}



async function loadCatalog(arch) {

  if (state.catalogFile === arch && state.catalog.size) return;

  const pj = await getJSON(PKG_URL(arch));

  state.catalog = new Map(pj.pkgs.map((x) => [x[0], x[1]]));

  state.catalogArr = pj.pkgs;

  state.catalogFile = arch;

  $("m-pkgs").textContent = pj.count;

}



/* 懒加载出厂包清单（全量约 1100 台，首次用到时拉取一次并缓存） */

async function ensureDevicePkgs(d) {

  if (state.devicePkgsLoaded) return;

  if (d && Array.isArray(d.base)) { state.devicePkgsLoaded = true; return; } // legacy 自带 base，无需远程

  try {

    const j = await getJSON(DEV_PKGS_URL);

    state.devicePkgs = j || {};

  } catch (e) { state.devicePkgs = {}; }

  state.devicePkgsLoaded = true;

}



/* ---------- device combo（按 target 分组，legacy 置顶，可搜索） ---------- */

function deviceSearchableText(d) {

  return [d.name, d.id, d.vendor, d.model, d.target, d.subtarget, d.archLabel, d.arch]

    .filter(Boolean).join(" ").toLowerCase();

}

function renderDeviceList(filter) {

  const box = $("deviceList");

  box.innerHTML = "";

  const kw = (filter || "").trim().toLowerCase();

  const match = (d) => !kw || deviceSearchableText(d).includes(kw);

  const hits = state.devices.filter(match);

  if (!hits.length) { box.appendChild(el("li", "none", "无匹配设备")); return; }



  // legacy 置顶（仅按数据里的 legacy 标记；wfDeviceMain 仅作派发键，不再算常用）

  const isLegacy = (d) => !!d.legacy;

  const legacy = hits.filter(isLegacy).sort((a, b) => a.name.localeCompare(b.name));

  const rest = hits.filter((d) => !isLegacy(d));



  const itemHtml = (d) => {

    const flash = d.flash ? fmtFlash(d.flash) : "闪存未知";

    const sub = [d.archLabel || d.arch, d.target, flash].filter(Boolean).join(" · ");

    return '<span class="dn">' + d.name + "</span><span class=\"sub\">" + sub + "</span>";

  };

  const addItem = (d, legacyBadge) => {

    const li = el("li");

    li.innerHTML = itemHtml(d) + (legacyBadge ? '<em class="badge">常用</em>' : "");

    li.addEventListener("click", () => selectDevice(d));

    box.appendChild(li);

  };

  if (legacy.length) {

    box.appendChild(el("li", "devgroup", "常用设备"));

    legacy.forEach((d) => addItem(d, true));

  }

  // 按 target 分组

  const groups = new Map();

  rest.forEach((d) => {

    const t = d.target || "其他";

    if (!groups.has(t)) groups.set(t, []);

    groups.get(t).push(d);

  });

  [...groups.keys()].sort().forEach((t) => {

    const arr = groups.get(t).sort((a, b) => a.name.localeCompare(b.name));

    box.appendChild(el("li", "devgroup", t + " (" + arr.length + ")"));

    arr.forEach((d) => addItem(d, false));

  });

  $("deviceCombo").classList.add("open");

}



/* ---------- 设备信息面板 ---------- */

function renderDeviceMeta() {

  const d = state.device;

  const grid = $("devMetaGrid");

  const warn = $("flashWarn");

  const note = $("deviceMetaText");

  if (!d || !grid) return;

  grid.innerHTML = "";

  const rows = [

    ["型号", (d.vendor ? d.vendor + " " : "") + (d.model ? d.model + " · " : "") + d.name],

    ["Target / Subtarget", (d.target || "—") + (d.subtarget ? " / " + d.subtarget : "")],

    ["架构", d.archLabel || d.arch || "—"],

    ["闪存", fmtFlash(d.flash)],

  ];

  const fw = fmtFwSize(d.fw_size);

  if (fw) rows.push(["原厂固件", fw]);

  const baseN = deviceBaseList(d, state.devicePkgs).length;

  rows.push(["出厂软件包", (baseN || d.pkg_count || 0) + " 个"]);

  if (d.built === false) rows.push(["状态", "未构建（可尝试）"]);

  rows.forEach(([k, v]) => {

    const div = el("div", "meta-row");

    div.appendChild(el("span", "mk", k));

    div.appendChild(el("span", "mv", v));

    grid.appendChild(div);

  });

  // 小闪存警示：flash>0 且 <=32MB

  if (warn) {

    const small = d.flash > 0 && d.flash <= 32 * 1048576;

    warn.hidden = !small;

  }

  if (note) note.textContent = d.note || "";

}



async function selectDevice(d) {

  state.device = d;

  $("deviceSearch").value = d.name;

  $("deviceCombo").classList.remove("open");

  $("deviceMeta").hidden = false;

  const needLoad = state.catalogFile !== d.arch;

  const needPkgs = !state.devicePkgsLoaded && !Array.isArray(d.base);

  try {

    if (needLoad) await loadCatalog(d.arch);

    if (needPkgs) await ensureDevicePkgs(d);

  } catch (e) { /* 数据加载失败沿用现状 */ }

  applyDeviceDefaults();

  render();

}



/* ---------- features ---------- */

function setFeature(name, on) {

  state.features[name] = !!on;

  if (name === "bypass") {

    if (on) {

      state.features.wifi = false;

      state.features.wwan = false;

      const b = (state.device && state.device.bypassDefaults) || {};

      state.params.lan_ip = b.lan_ip || "192.168.100.10";

      state.params.gateway = b.gateway || "192.168.100.1";

    } else if (state.device) {

      state.params.lan_ip = state.device.defaults.lan_ip;

      state.params.gateway = "";

    }

  }

  render();

}

function bindFeatures() {

  on("f-bypass", "change", (e) => setFeature("bypass", e.target.checked));

  on("f-ipv6", "change", (e) => setFeature("ipv6", e.target.checked));

  on("f-wifi", "change", (e) => setFeature("wifi", e.target.checked));

  on("f-wwan", "change", (e) => setFeature("wwan", e.target.checked));

  on("f-docker", "change", (e) => setFeature("docker", e.target.checked));

  on("f-https", "change", (e) => setFeature("https", e.target.checked));

  on("f-dhcp", "change", (e) => setFeature("dhcp", e.target.checked));

  on("f-istore", "change", (e) => setFeature("istore", e.target.checked));

}



/* ---------- params ---------- */

function readParams() {

  state.params.hostname = $("p-hostname").value.trim() || "ZWRT";

  state.params.lan_ip = $("p-lanip").value.trim();


  state.params.gateway = $("p-gateway").value.trim();

  state.params.wifi_ssid = $("p-wifissid").value.trim() || "ZWRT";

  state.params.wifi_key = $("p-wifikey").value.trim();

  state.params.pppoe_user = $("p-pppuser").value.trim();

  state.params.pppoe_pass = $("p-ppppass").value.trim();

  state.account.str = $("p-acct").value.trim() || "KuWiNet/ZWRT";

  state.account.token = $("p-token").value.trim();

}

function accountOwner() { return (state.account.str.split("/")[0] || "KuWiNet").trim(); }

function accountRepo() { return (state.account.str.split("/")[1] || "ZWRT").trim(); }

function updateGHA() {

  const a = $("btnGHA");

  if (!a) return;

  a.href = "https://github.com/" + accountOwner() + "/" + accountRepo() + "/actions";

}

/* 构建账号（仓库名 + Token）仅存本浏览器 localStorage，不上传任何服务器 */

function saveAcct() {

  try { localStorage.setItem("zwrt_acct", JSON.stringify({ str: $("p-acct").value.trim(), token: $("p-token").value.trim() })); } catch (e) {}

}

function restoreAcct() {

  try {

    const ac = JSON.parse(localStorage.getItem("zwrt_acct") || "null");

    if (ac && ac.str) $("p-acct").value = ac.str;

    if (ac && ac.token) $("p-token").value = ac.token;

  } catch (e) {}

}

function setBottomBtn(mode) {

  const r = $("btnResume"), g = $("btnGHA");

  if (!r || !g) return;

  const gha = mode === "gha";

  r.hidden = gha;

  g.hidden = !gha;

}

function applyDeviceDefaults() {

  const dd = state.device.defaults || {};

  state.features.bypass = false;

  state.features.ipv6 = !!dd.ipv6;

  state.features.wifi = !!dd.wifi;

  state.features.wwan = !!dd.wwan;

  state.features.docker = false;

  state.features.https = false;

  state.features.dhcp = false;

  state.features.istore = false;

  state.net = new Set(["nikki"]);

  state.themes = new Set(["luci-theme-zwrt", "luci-theme-openwrt"]);

  state.defaultTheme = "luci-theme-zwrt";

  state.params = {

    hostname: dd.hostname || "ZWRT", lan_ip: dd.lan_ip || "", lan_mask: dd.lan_mask || "",

    gateway: "",

    wifi_ssid: dd.wifi_ssid || "ZWRT", wifi_key: dd.wifi_key || "",

    pppoe_user: "", pppoe_pass: "",

  };

  // d.default 与当前架构 catalog 求交集后预填；交集为空则空

  state.pkgInput = prefillDefaults(state.device, state.catalog);

  state.initScript = "";

  $("f-bypass").checked = false;

  $("f-ipv6").checked = state.features.ipv6;

  $("f-wifi").checked = state.features.wifi;

  $("f-wwan").checked = state.features.wwan;

  $("f-docker").checked = state.features.docker;

  $("f-https").checked = state.features.https;

  $("f-dhcp").checked = state.features.dhcp;

  $("f-istore").checked = state.features.istore;

}



/* ---------- packages ---------- */

/* 基础包标签云：仅显示可安全剔除的包；点 × 剔除，已剔除点击恢复 */

function renderBaseChips() {

  const box = $("baseChips"); box.innerHTML = "";

  if (!state.device) return;

  const all = deviceBaseList(state.device, state.devicePkgs);

  const excl = new Set((state.pkgInput.match(/-([^\s]+)/g) || []).map((t) => t.slice(1)));

  const cuttable = all.filter((p) => !isProtected(p)).sort();

  const mc = $("m-cut"); if (mc) mc.textContent = cuttable.length;

  // 总数与已删数

  const mTot = $("m-basetotal"); if (mTot) mTot.textContent = all.length;

  const mDel = $("m-basedel"); if (mDel) mDel.textContent = excl.size;

  if (!cuttable.length) { box.appendChild(el("p", "dim", all.length ? "无可剔除项（均为受保护核心包）" : "出厂清单加载中…")); return; }

  cuttable.forEach((p) => {

    const tag = el("span", "btag" + (excl.has(p) ? " out" : ""));

    tag.appendChild(el("span", "bn", p));

    if (excl.has(p)) {

      tag.title = "已剔除，点击恢复";

      tag.addEventListener("click", () => {

        state.pkgInput = state.pkgInput.replace(new RegExp("(?:^|\\s)-" + p + "(?=\\s|$)"), " ").replace(/\s{2,}/g, " ").trim();

        render();

      });

      const x = document.createElement("button");

      x.type = "button"; x.className = "bx"; x.textContent = "×"; x.title = "恢复";

      x.addEventListener("click", (e) => {

        e.stopPropagation();

        state.pkgInput = state.pkgInput.replace(new RegExp("(?:^|\\s)-" + p + "(?=\\s|$)"), " ").replace(/\s{2,}/g, " ").trim();

        render();

      });

      tag.appendChild(x);

    } else {

      tag.title = "点击剔除";

      tag.addEventListener("click", () => {

        state.pkgInput = (state.pkgInput + " -" + p).trim();

        render();

      });

    }

    box.appendChild(tag);

  });

}

/* 互联网（科学上网）多选 */

function renderNetChips() {

  const box = $("netChips"); box.innerHTML = "";

  INTERNET_SCHEMES.forEach((s) => {

    const label = el("label", "chip");

    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = state.net.has(s.id);

    cb.addEventListener("change", () => { if (cb.checked) state.net.add(s.id); else state.net.delete(s.id); render(); });

    label.appendChild(cb);

    label.appendChild(el("span", "", s.name));

    box.appendChild(label);

  });

}

/* 主题多选 */

function renderThemeChips() {

  const box = $("themeChips"); box.innerHTML = "";

  THEMES.forEach((t) => {

    const label = el("label", "chip");

    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = state.themes.has(t);

    cb.addEventListener("change", () => {

      if (cb.checked) { state.themes.add(t); if (!state.defaultTheme) state.defaultTheme = t; }

      else state.themes.delete(t);

      render();

    });

    label.appendChild(cb);

    const span = el("span", "");

    span.appendChild(document.createTextNode(t.replace("luci-theme-", "")));

    if (state.themes.has(t)) {

      if (state.defaultTheme === t) span.appendChild(el("em", "def", "★默认"));

      else {

        const btn = document.createElement("button");

        btn.type = "button"; btn.className = "setdef"; btn.textContent = "设为默认";

        btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); state.defaultTheme = t; state.themes.add(t); render(); });

        span.appendChild(btn);

      }

    }

    label.appendChild(span);

    box.appendChild(label);

  });

}

/* textarea 高度自适应 */

function autoGrow(n) {

  const cur = parseInt(n.style.height, 10) || 0;

  n.style.height = "auto";

  const sh = n.scrollHeight;

  n.style.height = (Math.max(sh, cur + 2)) + "px";

}



/* 常用软件包：与输入框联动 */

function toggleCommonPkg(name) {

  const chosen = parsePkgInput(state.pkgInput);

  if (chosen.includes(name)) {

    state.pkgInput = state.pkgInput

      .replace(new RegExp("(?:^|\\s)-" + name + "(?=\\s|$)"), " ")

      .replace(new RegExp("(?:^|\\s)" + name + "(?=\\s|$)"), " ")

      .replace(/\s{2,}/g, " ").trim();

  } else {

    state.pkgInput = state.pkgInput

      .replace(new RegExp("(?:^|\\s)-" + name + "(?=\\s|$)"), " ")

      .replace(/\s{2,}/g, " ").trim();

    state.pkgInput = (state.pkgInput + " " + name).trim();

  }

  render();

}

function renderCommonChips() {

  const box = $("commonChips"); box.innerHTML = "";

  if (!state.catalog.size) { box.appendChild(el("p", "dim", "包目录加载中…")); return; }

  const chosen = new Set(parsePkgInput(state.pkgInput));

  COMMON_PKGS.forEach(([name, desc]) => {

    if (!state.catalog.has(name)) return;

    const tag = el("span", "ctag" + (chosen.has(name) ? " on" : ""));

    tag.title = desc || name;

    tag.appendChild(el("span", "cn", name));

    if (chosen.has(name)) tag.appendChild(el("em", "ck", "✓"));

    tag.addEventListener("click", () => toggleCommonPkg(name));

    box.appendChild(tag);

  });

}



function renderPkgSuggest(kw) {

  const box = $("pkgSuggest");

  if (!kw.trim()) { box.innerHTML = ""; $("pkgCombo").classList.remove("open"); return; }

  const q = kw.trim().toLowerCase();

  const hits = state.catalogArr.filter((x) => x[0].toLowerCase().includes(q) || (x[1] && x[1].toLowerCase().includes(q))).slice(0, 24);

  box.innerHTML = "";

  if (!hits.length) box.appendChild(el("li", "none", "无匹配软件包"));

  hits.forEach(([name, desc]) => {

    const li = el("li");

    li.innerHTML = name + (desc ? '<span class="sub">' + desc + "</span>" : "");

    li.addEventListener("click", () => {

      state.pkgInput = (state.pkgInput + " " + name).trim();

      $("pkgSearch").value = "";

      render();

    });

    box.appendChild(li);

  });

  $("pkgCombo").classList.add("open");

}



/* ---------- summary ---------- */

function renderSummary() {

  const dd = $("summary"); dd.innerHTML = "";

  const d = state.device; if (!d) return;

  const set = parsePkgInput(state.pkgInput);

  const baseN = deviceBaseList(d, state.devicePkgs).length;

  const rows = [

    ["设备", d.name],

    ["模式", state.features.bypass ? "旁路由（仅 LAN）" : "主路由"],

    ["主机名", state.params.hostname],

    ["LAN IP", state.params.lan_ip + " / " + state.params.lan_mask],

  ];

  if (state.features.bypass) rows.push(["网关/DNS", state.params.gateway + " / " + state.params.gateway]);

  rows.push(["IPv6", state.features.ipv6 ? "开" : "关"]);

  rows.push(["Docker", state.features.docker ? "开" : "关"]);

  rows.push(["HTTPS 后台", state.features.https ? "开" : "关"]);

  rows.push(["DHCP 服务器", state.features.dhcp ? "开" : "关"]);

  rows.push(["伪装 iStoreOS", state.features.istore ? "开" : "关"]);

  if (state.features.wifi) rows.push(["无线", "SSID " + (state.params.wifi_ssid || "—") + (state.params.wifi_key ? "（加密）" : "（无密码）")]);

  else rows.push(["无线", "关"]);

  if (state.features.wwan) { rows.push(["WWAN", "开（5gmodem + 蜂窝驱动）"]); if (state.params.pppoe_user || state.params.pppoe_pass) rows.push(["蜂窝拨号", (state.params.pppoe_user || "—") + " / " + (state.params.pppoe_pass ? "****" : "—")]); }

  rows.push(["出厂包", baseN + " 个（可剔除非核心项）"]);

  rows.push(["可选包", set.length + " 个"]);

  rows.push(["互联网", state.net.size ? [...state.net].join("、") : "无"]);

  rows.push(["主题", [...new Set([...state.themes, state.defaultTheme].filter(Boolean))].length + " 个 · 默认 " + (state.defaultTheme ? state.defaultTheme.replace("luci-theme-", "") : "—")]);

  rows.push(["构建账号", accountOwner() + "/" + accountRepo()]);

  rows.forEach(([k, v]) => {

    dd.appendChild(el("dt", "", k));

    dd.appendChild(el("dd", "", v));

  });

}



/* ---------- features / init snippet ---------- */

function composeInitScript() {

  const parts = [];

  const user = state.initScript.trim();

  if (user) parts.push(user);

  if (state.features.wwan) {

    const cred = (state.params.pppoe_user || state.params.pppoe_pass)

      ? "# 蜂窝拨号凭据（构建器填写）\n" +

        "uci set network.wwan=interface\n" +

        "uci set network.wwan.username='" + state.params.pppoe_user + "'\n" +

        "uci set network.wwan.password='" + state.params.pppoe_pass + "'\n" +

        "uci commit network 2>/dev/null || true\n" : "";

    parts.push("# ZWRT 构建器 · WWAN 自动配置\n" + cred +

      "if [ -f /etc/init.d/ModemManager ]; then\n" +

      "  /etc/init.d/ModemManager enable 2>/dev/null || true\n" +

      "  /etc/init.d/ModemManager start 2>/dev/null || true\n" +

      "fi");

  }

  if (!state.features.dhcp) {

    parts.push("# ZWRT 构建器 · 关闭 DHCP 服务器\n" +

      "uci set dhcp.lan.ignore='1'\n" +

      "uci commit dhcp 2>/dev/null || true\n" +

      "/etc/init.d/dnsmasq restart 2>/dev/null || true");

  }

  if (state.features.https) {

    parts.push("# ZWRT 构建器 · HTTPS 后台\n" +

      "if [ ! -f /etc/ssl/certs/uhttpd-ssl.pem ]; then\n" +

      "  mkdir -p /etc/ssl/certs\n" +

      "  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout /etc/ssl/private/uhttpd.key -out /etc/ssl/certs/uhttpd-ssl.pem -subj \"/CN=ZWRT\" 2>/dev/null\n" +

      "  cat /etc/ssl/private/uhttpd.key >> /etc/ssl/certs/uhttpd-ssl.pem\n" +

      "fi\n" +

      "uci set uhttpd.main.listen_http='0.0.0.0:80'\n" +

      "uci set uhttpd.main.listen_https='0.0.0.0:443'\n" +

      "uci set uhttpd.main.redirect_https='1'\n" +

      "uci commit uhttpd 2>/dev/null || true\n" +

      "/etc/init.d/uhttpd restart 2>/dev/null || true");

  }

  if (state.features.docker) {

    parts.push("# ZWRT 构建器 · Docker\n" +

      "/etc/init.d/dockerd enable 2>/dev/null || true\n" +

      "/etc/init.d/dockerd start 2>/dev/null || true");

  }

  if (state.features.istore) {

    parts.push("# ZWRT 构建器 · 伪装 iStoreOS 品牌\n" +

      "sed -i 's/DISTRIB_ID=.*/DISTRIB_ID=\"iStoreOS\"/' /etc/openwrt_release 2>/dev/null || true\n" +

      "sed -i 's/DISTRIB_DESCRIPTION=.*/DISTRIB_DESCRIPTION=\"iStoreOS '\"\"'\"$(cat /etc/openwrt_version 2>/dev/null)\"'\"\"'\"/' /etc/openwrt_release 2>/dev/null || true\n" +

      "echo '  ________  ___  ____  ____  ____\n /_  __/ _ \\/ _ \\/ __ \\/ __ \\/ __/ iStoreOS\n' > /etc/banner 2>/dev/null || true");

  }

  const theme = state.defaultTheme.replace("luci-theme-", "");

  if (theme && theme !== "bootstrap") {

    parts.push("# ZWRT 构建器 · 默认主题\n" +

      "uci set luci.main.mediaurlbase=/luci-static/" + theme + "\n" +

      "uci commit luci 2>/dev/null || true");

  }

  if (!parts.length) return "";

  return parts.join("\n\n") + "\n\nexit 0";

}



/* ---------- dispatch ---------- */

function composeInputs() {

  readParams();

  const script = composeInitScript();

  const inputs = buildInputs({

    device: state.device,

    bypass: state.features.bypass,

    ipv6: state.features.ipv6,

    wifi: state.features.wifi,

    wwan: state.features.wwan,

    docker: state.features.docker,

    https: state.features.https,

    istore: state.features.istore,

    hostname: state.params.hostname,

    lan_ip: state.params.lan_ip,

    lan_mask: state.params.lan_mask,

    gateway: state.params.gateway,


    wifi_ssid: state.params.wifi_ssid,

    wifi_key: state.params.wifi_key,

    pkgInput: state.pkgInput,

    net: state.net,

    themes: state.themes,

    defaultTheme: state.defaultTheme,

    wwanPackages: state.wwan,

    devicePkgs: state.devicePkgs,

    initScript: script,

    initScriptB64: btoa(unescape(encodeURIComponent(script || ""))),

  });

  const base = deviceBaseList(state.device, state.devicePkgs);

  const sel = parsePkgInput(state.pkgInput);

  return { inputs, meta: { base: base.length, sel: sel.length, wwan: state.features.wwan ? state.wwan.length : 0, role: state.features.bypass ? "bypass" : "main" } };

}

function ghAPI(method, path, token, body) {

  if (token === undefined) token = state.account.token; // 未显式传 token 时用当前构建账号

  const opt = { method, headers: { "User-Agent": "zwrt-builder", Accept: "application/vnd.github+json" } };

  if (token) opt.headers["Authorization"] = "Bearer " + token;

  if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }

  return fetch("https://api.github.com" + path, opt);

}

async function apiJson(res) {

  const t = await res.text();

  let j; try { j = JSON.parse(t); } catch (e) { j = null; }

  if (!res.ok) throw new Error((j && j.message) || ("HTTP " + res.status));

  if (j === null) throw new Error("非 JSON 响应（请检查仓库名是否正确、GH Token 是否有效）");

  return j;

}



function validate() {

  const str = state.account.str;

  const parts = str.split("/").filter(Boolean);

  if (parts.length < 2 || !parts[0] || !parts[1]) return "仓库需填 所有者/仓库名（如 KuWiNet/ZWRT）";

  if (!state.account.token) return "请填写 GH Token（你自己的 GitHub Token，用于触发构建）";

  const ip = state.params.lan_ip, mk = state.params.lan_mask;

  const v4 = (s) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && s.split(".").every((o) => +o <= 255);

  if (!v4(ip)) return "LAN IP 不是有效 IPv4 地址";

  if (!v4(mk)) return "子网掩码不是有效 IPv4";

  if (state.features.bypass && !v4(state.params.gateway)) return "旁路由需填写有效网关";

  if (!/^[A-Za-z0-9_-]{1,63}$/.test(state.params.hostname)) return "主机名只能含字母/数字/下划线/连字符";

  return null;

}



async function triggerBuild() {

  readParams();

  const err = validate();

  if (err) { toast(err); return; }

  const owner = accountOwner(), repo = accountRepo(), token = state.account.token;

  const { inputs, meta } = composeInputs();

  logc("触发构建: " + meta.role + " · 包 " + (meta.base + meta.sel) + " (基础 " + meta.base + " + 可选 " + meta.sel + (meta.wwan ? " + 蜂窝 " + meta.wwan : "") + ")");

  setBusy(true);

  try {

    const res = await ghAPI("POST", "/repos/" + owner + "/" + repo + "/actions/workflows/build-openwrt.yml/dispatches", token, { ref: "main", inputs });

    if (res.status === 422 || res.status === 400 || res.status === 403 || res.status === 404) {

      throw new Error(await res.text());

    }

    logc("已提交，等待调度…", "ok");

    setBottomBtn("gha");

    startPoll({ owner, repo, token, since: Date.now() });

  } catch (e) {

    logc("触发失败: " + e.message, "err");

    toast("触发失败：" + e.message);

    setBusy(false);

  }

}



async function startPoll(a) {

  if (state.pollTimer) clearInterval(state.pollTimer);

  let lastKey = "";

  const probe = async () => {

    try {

      let mine = null;

      if (a.runId) {

        try { mine = await apiJson(await ghAPI("GET", "/repos/" + a.owner + "/" + a.repo + "/actions/runs/" + a.runId, a.token)); } catch (e) {}

      }

      if (!mine) {

        const runs = await apiJson(await ghAPI("GET", "/repos/" + a.owner + "/" + a.repo + "/actions/runs?event=workflow_dispatch&per_page=5", a.token));

        const cands = runs.workflow_runs.filter((r) => r.path === ".github/workflows/build-openwrt.yml");

        if (a.since) mine = cands.find((r) => new Date(r.created_at).getTime() >= (a.since - 120000)) || null;

        else mine = cands[0] || null;

      }

      if (mine) {

        state.runId = mine.id;

        try { localStorage.setItem("zwrt_run", JSON.stringify({ owner: a.owner, repo: a.repo, runId: mine.id, ts: Date.now() })); } catch (e) {}

        renderSteps(a, mine.id);

        const s = mine.status, c = mine.conclusion;

        const statusCN = { queued: "排队中", in_progress: "构建中", completed: "已完成", success: "成功", failure: "失败", cancelled: "已取消", skipped: "已跳过", timed_out: "超时", neutral: "无结果" };

        const label = statusCN[c] || statusCN[s] || s || "";

        const key = mine.id + ":" + s + ":" + (c || "");

        if (key !== lastKey) {

          logc("Run #" + mine.id + " 状态: " + label, c === "success" ? "ok" : c === "failure" || c === "cancelled" ? "err" : s === "in_progress" ? "warn" : "muted");

          lastKey = key;

        }

        if (s === "completed") {

          clearInterval(state.pollTimer);

          setBusy(false);

          try { localStorage.removeItem("zwrt_run"); } catch (e) {}

          if (c === "success") { logc("构建成功！刷新固件列表…", "ok"); loadDownloads(a.owner, a.repo, a.token); }

          else logc("构建未成功 (" + c + ")，请查看 Actions 日志", "err");

        }

      } else {

        logc("…等待 workflow_dispatch 进入队列…", "muted");

      }

    } catch (e) {

      logc("轮询出错: " + e.message, "err");

    }

  };

  probe();

  state.pollTimer = setInterval(probe, 12000);

}



/* ---------- 渲染真实 GitHub Actions 工作流步骤 ---------- */

async function renderSteps(a, runId) {

  const box = $("#jobsteps");

  if (!box) return;

  try {

    const jr = await apiJson(await ghAPI("GET", "/repos/" + a.owner + "/" + a.repo + "/actions/runs/" + runId + "/jobs", a.token));

    const all = jr.jobs || [];

    if (!all.length) { box.hidden = true; return; }

    box.hidden = false;

    box.innerHTML = "";

    const stCN = { queued: "排队中", in_progress: "进行中", completed: "已完成", success: "成功", failure: "失败", cancelled: "已取消", skipped: "已跳过" };

    all.forEach((j) => {

      const h = el("div", "jobs-head", j.name + " · " + (stCN[j.conclusion] || stCN[j.status] || j.status || ""));

      box.appendChild(h);

      const ul = el("div", "steps");

      (j.steps || []).forEach((st) => {

        const row = el("div", "step", stepMark(st) + " " + st.name);

        if (st.conclusion === "skipped") row.classList.add("step-skipped");

        if (st.status === "in_progress") row.classList.add("step-run");

        row.title = (st.status || "") + (st.conclusion ? " / " + st.conclusion : "");

        ul.appendChild(row);

      });

      box.appendChild(ul);

    });

  } catch (e) { box.hidden = true; }

}

function stepMark(st) {

  if (st.status === "in_progress") return "◍";

  if (st.conclusion === "success") return "✔";

  if (st.conclusion === "failure") return "✘";

  if (st.conclusion === "cancelled") return "✕";

  if (st.conclusion === "skipped") return "—";

  if (st.status === "completed") return "✔";

  return "·";

}



/* ---------- 重新打开页面后：查看/恢复上次定制构建 ---------- */

async function resumeProgress() {

  const owner = accountOwner(), repo = accountRepo();

  let mine = null;

  try {

    const saved = JSON.parse(localStorage.getItem("zwrt_run") || "null");

    if (saved && saved.runId && saved.owner === owner && saved.repo) {

      mine = await apiJson(await ghAPI("GET", "/repos/" + owner + "/" + repo + "/actions/runs/" + saved.runId));

    }

  } catch (e) {}

  if (!mine) {

    try {

      const runs = await apiJson(await ghAPI("GET", "/repos/" + owner + "/" + repo + "/actions/runs?event=workflow_dispatch&per_page=5"));

      mine = (runs.workflow_runs || []).find((r) => r.path === ".github/workflows/build-openwrt.yml");

    } catch (e) {

      logc("查询定制进度失败：" + (e && e.message ? e.message : String(e)) + "（如提示未登录请重新登录；并确认 Cloudflare 项目 zwrt 已配置 GH_TOKEN）", "err");

      return;

    }

  }

  if (!mine) { logc("未找到该仓库最近的定制构建记录", "err"); return; }

  const s = mine.status, c = mine.conclusion;

  const statusCN = { queued: "排队中", in_progress: "构建中", completed: "已完成", success: "成功", failure: "失败", cancelled: "已取消", skipped: "已跳过", timed_out: "超时", neutral: "无结果" };

  const label = statusCN[c] || statusCN[s] || s || "";

  logc("上次构建 Run #" + mine.id + " 状态: " + label, c === "success" ? "ok" : c === "failure" || c === "cancelled" ? "err" : s === "in_progress" ? "warn" : "muted");

  setBottomBtn("gha");

  if (s === "completed") {

    if (c === "success") { logc("上次构建已完成，正在加载固件下载…", "ok"); loadDownloads(owner, repo); }

    else logc("上次构建未成功 (" + c + ")，请查看 GitHub Actions 日志", "err");

  } else {

    logc("上次构建尚未完成，正在恢复跟踪进度…", "warn");

    startPoll({ owner, repo, runId: mine.id });

  }

}



/* ---------- 主题（深/浅） ---------- */

function initTheme() {

  const root = document.documentElement;

  let cur = "dark";

  try { cur = localStorage.getItem("zwrt-theme") || "dark"; } catch (e) {}

  if (cur !== "light" && cur !== "dark") cur = "dark";

  root.setAttribute("data-theme", cur);

  const btn = $("#themeBtn");

  if (btn) btn.addEventListener("click", () => {

    cur = root.getAttribute("data-theme") === "light" ? "dark" : "light";

    root.setAttribute("data-theme", cur);

    try { localStorage.setItem("zwrt-theme", cur); } catch (e) {}

  });

}



/* ---------- downloads ---------- */

async function loadDownloads(owner, repo) {

  const box = $("downloads");

  try {

    const rel = await apiJson(await ghAPI("GET", "/repos/" + owner + "/" + repo + "/releases?per_page=5"));

    box.innerHTML = "";

    const items = rel.filter((r) => r.assets && r.assets.length);

    if (!items.length) { box.appendChild(el("p", "dim", "暂无 Release 固件")); return; }

    items.slice(0, 1).forEach((r) => {

      const r2map = {};

      const body = r.body || "";

      (body.match(/https?:\/\/[^\s"']+\/firmware\/[^\s"']+/g) || []).forEach((u) => {

        const nm = decodeURIComponent(u.split("/firmware/").pop());

        r2map[nm] = u;

      });

      r.assets.filter((a) => a.name.startsWith("zwrt-")).forEach((a) => {

        const it = el("div", "dl-item");

        const n = el("div", "n", a.name); it.appendChild(n);

        const m = el("div", "m", (a.size / 1048576).toFixed(1) + " MB · " + r.tag_name); it.appendChild(m);

        const l = el("div", "links");

        if (r2map[a.name]) {

          const r2 = el("a", "", "R2 下载 ↓"); r2.href = r2map[a.name]; r2.target = "_blank"; r2.rel = "noopener";

          l.appendChild(r2);

        } else {

          const gh = el("a", "", "GitHub ↓"); gh.href = a.browser_download_url; gh.target = "_blank"; gh.rel = "noopener";

          l.appendChild(gh);

        }

        it.appendChild(l);

        box.appendChild(it);

      });

    });

  } catch (e) {

    box.innerHTML = ""; box.appendChild(el("p", "dim", "固件列表加载失败: " + e.message));

  }

}



/* ---------- ui helpers ---------- */

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000); }

function logc(msg, cls) {

  const c = $("console");

  if (c.querySelector(".dim") && c.childNodes.length === 1 && c.firstChild.textContent.includes("尚未开始")) c.innerHTML = "";

  const p = el("div", cls || "", msg); c.appendChild(p); c.scrollTop = c.scrollHeight;

}

function setBusy(b) { state.triggering = b; const btn = $("#btnBuild"); btn.disabled = b; btn.textContent = b ? "构建中…" : "开始构建"; }



function render() {

  if (!state.device) return;

  const by = state.features.bypass;

  $("lblGateway").hidden = !by;

  $("netHint").hidden = !by;

  $("fieldsWifi").hidden = !state.features.wifi;

  $("fieldsWwan").hidden = state.features.bypass;

  $("f-wifi").disabled = by;

  if (by && $("f-wifi").checked) $("f-wifi").checked = false;

  if (by && $("f-wwan").checked) { state.features.wwan = false; $("f-wwan").checked = false; }

  $("featureHint").textContent = by ? "旁路由：仅 LAN 口、关闭 WAN/DHCP，网关指向主路由（DNS=网关），不可开无线。" : "";

  $("p-hostname").value = state.params.hostname;

  $("p-lanip").value = state.params.lan_ip;

  

  $("p-gateway").value = state.params.gateway;

  $("p-wifissid").value = state.params.wifi_ssid;

  $("p-wifikey").value = state.params.wifi_key;

  $("p-pppuser").value = state.params.pppoe_user;

  $("p-ppppass").value = state.params.pppoe_pass;

  $("pkgInput").value = state.pkgInput;

  $("initScript").value = state.initScript;

  $("m-base").textContent = deviceBaseList(state.device, state.devicePkgs).length;

  $("m-selected").textContent = parsePkgInput(state.pkgInput).length;

  $("initHint").textContent = state.features.wwan ? "已勾选 WWAN：构建时会自动附加蜂窝配置片段。" : "可选。写入 /etc/uci-defaults，首次开机执行。";

  $("deviceNote").textContent = "共 " + state.devices.length + " 种设备";

  renderDeviceMeta();

  renderBaseChips();

  renderCommonChips();

  renderNetChips();

  renderThemeChips();

  autoGrow($("pkgInput"));

  renderSummary();

}



function bindStatic() {

  bindFeatures();

  on("deviceSearch", "focus", () => renderDeviceList($("deviceSearch").value));

  on("deviceSearch", "input", () => renderDeviceList($("deviceSearch").value));

  on("deviceArrow", "click", () => { const c = $("deviceCombo"); c.classList.contains("open") ? c.classList.remove("open") : renderDeviceList($("deviceSearch").value); });

  document.addEventListener("click", (e) => {

    if (!e.target.closest("#deviceCombo")) $("deviceCombo").classList.remove("open");

    if (!e.target.closest("#pkgCombo")) $("pkgCombo").classList.remove("open");

  });

  on("pkgSearch", "input", (e) => renderPkgSuggest(e.target.value));

  on("pkgSearch", "focus", (e) => { if (e.target.value.trim()) renderPkgSuggest(e.target.value); });

  ["p-hostname", "p-lanip", "p-gateway", "p-wifissid", "p-wifikey", "p-pppuser", "p-ppppass"].forEach((id) => {

    on(id, "input", () => { readParams(); renderSummary(); });

  });

  on("p-acct", "input", () => { readParams(); updateGHA(); renderSummary(); saveAcct(); });

  on("p-token", "input", () => { readParams(); saveAcct(); });

  on("pkgInput", "input", (e) => { state.pkgInput = e.target.value; $("m-selected").textContent = parsePkgInput(state.pkgInput).length; autoGrow(e.target); renderSummary(); renderBaseChips(); renderCommonChips(); });

  on("initScript", "input", (e) => { state.initScript = e.target.value; renderSummary(); });

  on("btnBuild", "click", () => triggerBuild());

  on("btnResume", "click", () => resumeProgress());

  on("btnPreview", "click", () => {

    readParams();

    const { inputs } = composeInputs();

    const p = $("preview"); p.hidden = !p.hidden; if (!p.hidden) p.textContent = JSON.stringify({ ref: "main", inputs }, null, 2);

  });

}



/* 浏览器入口（Node 测试环境无 window/document，自动跳过） */

if (typeof window !== "undefined" && typeof document !== "undefined") {

  (async function init() {

    initTheme();

    bindStatic();

    restoreAcct();

    readParams();

    updateGHA();

    setBottomBtn("resume");

    try { await loadData(); }

    catch (e) {

      console.error(e);

      $("deviceSearch").value = "";

      $("deviceNote").textContent = "无法加载设备/包数据：请通过 https 访问本站（直接打开本地 html 会被浏览器拦截数据请求）。";

    }

    try {

      const rr = JSON.parse(localStorage.getItem("zwrt_run") || "null");

      if (rr && rr.runId && rr.owner && rr.repo) {

        setBottomBtn("gha");

        logc("检测到上次构建 Run #" + rr.runId + "，正在恢复跟踪进度…", "muted");

        startPoll({ owner: rr.owner, repo: rr.repo, runId: rr.runId });

      }

    } catch (e) {}

  })();

}

