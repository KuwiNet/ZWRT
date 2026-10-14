/* ZWRT 构建器 — 纯静态、去中心化：浏览器直连 GitHub API 触发构建。Token 仅存 localStorage。 */
"use strict";

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

/* 互联网（科学上网）多选方案：默认勾选 nikki */
const INTERNET_SCHEMES = [
  { id: "nikki", name: "nikki（Mihomo TUN）", pkgs: ["luci-app-nikki", "nikki", "mihomo"] },
  { id: "openclash", name: "OpenClash", pkgs: ["luci-app-openclash"] },
  { id: "passwall2", name: "PassWall 2", pkgs: ["luci-app-passwall2"] },
  { id: "homeproxy", name: "HomeProxy", pkgs: ["luci-app-homeproxy"] },
  { id: "v2raya", name: "v2rayA", pkgs: ["luci-app-v2raya", "v2raya"] },
  { id: "singbox", name: "sing-box", pkgs: ["sing-box"] },
];
/* 主题多选（openwrt.ai 全部主题，含用户自建 zwrt / kucat） */
const THEMES = [
  "luci-theme-zwrt", "luci-theme-kucat", "luci-theme-argon", "luci-theme-bootstrap",
  "luci-theme-bootstrap-mmdvm", "luci-theme-design", "luci-theme-alpha", "luci-theme-aurora",
  "luci-theme-edge", "luci-theme-fluent", "luci-theme-fluent-lite", "luci-theme-footstrap",
  "luci-theme-glass", "luci-theme-inas", "luci-theme-istorenas", "luci-theme-lightblue",
  "luci-theme-liquid", "luci-theme-luxe", "luci-theme-material", "luci-theme-material3",
  "luci-theme-merona", "luci-theme-noobwrt", "luci-theme-openmptcprouter", "luci-theme-openwrt",
  "luci-theme-openwrt-2020", "luci-theme-rmm", "luci-theme-routerich", "luci-theme-shadcn",
  "luci-theme-shadcnui", "luci-theme-spectra", "luci-theme-teleofis", "luci-theme-vantage",
];

const state = {
  devices: [],
  wwan: [],
  catalog: new Map(),       // name -> desc
  catalogArr: [],
  catalogFile: "",
  device: null,
  features: { bypass: false, ipv6: false, wifi: false, wwan: false },
  params: { hostname: "ZWRT", lan_ip: "", lan_mask: "", gateway: "", password: "", wifi_ssid: "", wifi_key: "" },
  net: new Set(["nikki"]),            // 已选互联网方案
  themes: new Set(["luci-theme-zwrt"]), // 已选主题
  defaultTheme: "luci-theme-zwrt",     // 默认主题
  pkgInput: "",             // 当前输入框内容
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

async function loadData() {
  const d = await getJSON(DEV_URL);
  state.devices = d.devices;
  state.wwan = d.wwan_packages || [];
  $("m-devices").textContent = state.devices.length;
  state.device = state.devices[0];
  await loadCatalog(state.device.arch);
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

/* ---------- device combo ---------- */
function renderDeviceList(filter) {
  const box = $("deviceList");
  box.innerHTML = "";
  const kw = (filter || "").trim().toLowerCase();
  const hits = state.devices.filter((d) =>
    !kw || d.name.toLowerCase().includes(kw) || d.archLabel.toLowerCase().includes(kw) || d.id.includes(kw));
  if (!hits.length) { box.appendChild(el("li", "none", "无匹配设备")); }
  hits.forEach((d) => {
    const li = el("li");
    li.innerHTML = d.name + '<span class="sub">' + d.archLabel + " · 架构 " + (d.archLabel === "x86_64" ? "x86/64" : "MT7981") + "</span>";
    li.addEventListener("click", () => selectDevice(d));
    box.appendChild(li);
  });
  $("deviceCombo").classList.add("open");
}
function selectDevice(d) {
  state.device = d;
  $("deviceSearch").value = d.name;
  $("deviceCombo").classList.remove("open");
  $("deviceMeta").hidden = false;
  $("deviceMetaText").textContent = d.note;
  if (state.catalogFile !== d.arch) { loadCatalog(d.arch).then(() => { applyDeviceDefaults(); render(); }); }
  else { applyDeviceDefaults(); render(); }
}

/* ---------- features ---------- */
function setFeature(name, on) {
  state.features[name] = !!on;
  if (name === "bypass") {
    if (on && state.device && state.device.arch !== "x86_64") { state.features.bypass = false; $("f-bypass").checked = false; toast("旁路由仅适用于 x86/64 设备"); return; }
    if (on) {
      state.features.wifi = false;                         // 旁路由无法开启无线
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
}

/* ---------- params ---------- */
function readParams() {
  state.params.hostname = $("p-hostname").value.trim() || "ZWRT";
  state.params.lan_ip = $("p-lanip").value.trim();
  state.params.password = $("p-password").value.trim();
  state.params.gateway = $("p-gateway").value.trim();
  state.params.wifi_ssid = $("p-wifissid").value.trim();
  state.params.wifi_key = $("p-wifikey").value.trim();
  state.params.pppoe_user = $("p-pppuser").value.trim();
  state.params.pppoe_pass = $("p-ppppass").value.trim();
  state.account.str = ($("p-account").value.trim() || "KuWiNet/ZWRT").replace(/\/+$/, "");
}
function accountOwner() { return (state.account.str.split("/")[0] || "KuWiNet").trim(); }
function accountRepo() { return (state.account.str.split("/")[1] || "ZWRT").trim(); }
function applyDeviceDefaults() {
  const dd = state.device.defaults;
  state.features.bypass = false;
  state.features.ipv6 = !!dd.ipv6;
  state.features.wifi = !!dd.wifi;
  state.features.wwan = !!dd.wwan;
  state.net = new Set(["nikki"]);
  state.themes = new Set(["luci-theme-zwrt"]);
  state.defaultTheme = "luci-theme-zwrt";
  state.params = {
    hostname: dd.hostname || "ZWRT", lan_ip: dd.lan_ip, lan_mask: dd.lan_mask,
    gateway: "", password: "",
    wifi_ssid: dd.wifi_ssid || "", wifi_key: dd.wifi_key || "",
    pppoe_user: "", pppoe_pass: "",
  };
  state.pkgInput = (state.device.default || []).join(" ");
  state.initScript = "";
  $("f-bypass").checked = false;
  $("f-ipv6").checked = state.features.ipv6;
  $("f-wifi").checked = state.features.wifi;
  $("f-wwan").checked = state.features.wwan;
}

/* ---------- packages ---------- */
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
/* 基础包标签云：点 × 剔除（可选包输入框追加 -包名），已剔除点击恢复 */
function renderBaseChips() {
  const box = $("baseChips"); box.innerHTML = "";
  if (!state.device || !state.device.base) return;
  const excl = new Set();
  (state.pkgInput.match(/-([^\s]+)/g) || []).forEach((t) => excl.add(t.slice(1)));
  state.device.base.slice().sort().forEach((p) => {
    const tag = el("span", "btag" + (excl.has(p) ? " out" : ""));
    tag.appendChild(el("span", "bn", p));
    if (excl.has(p)) {
      tag.title = "已剔除，点击恢复";
      tag.addEventListener("click", () => {
        state.pkgInput = state.pkgInput.replace(new RegExp("(?:^|\\s)-" + p + "(?=\\s|$)"), " ").replace(/\s{2,}/g, " ").trim();
        render();
      });
    } else {
      const x = document.createElement("button");
      x.type = "button"; x.className = "bx"; x.textContent = "×"; x.title = "剔除";
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        state.pkgInput = (state.pkgInput + " -" + p).trim();
        render();
      });
      tag.appendChild(x);
    }
    box.appendChild(tag);
  });
}
function renderPkgChips() {
  const box = $("pkgChips"); box.innerHTML = "";
  parsePkgInput(state.pkgInput).sort().forEach((p) => {
    const label = el("label", "chip");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true;
    cb.addEventListener("change", () => {
      state.pkgInput = state.pkgInput.split(/\s+/).filter((t) => t && t !== p).join(" ") + " -" + p;
      render();
    });
    label.appendChild(cb);
    label.appendChild(el("span", "", p));
    box.appendChild(label);
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
    cb.addEventListener("change", () => { if (cb.checked) state.themes.add(t); else state.themes.delete(t); render(); });
    label.appendChild(cb);
    label.appendChild(el("span", "", t.replace("luci-theme-", "")));
    box.appendChild(label);
  });
}
/* 默认主题下拉 */
function renderThemeSelect() {
  const sel = $("p-theme"); sel.innerHTML = "";
  THEMES.forEach((t) => {
    const o = document.createElement("option");
    o.value = t; o.textContent = t.replace("luci-theme-", "");
    sel.appendChild(o);
  });
  sel.value = state.defaultTheme;
}
/* textarea 高度自适应：默认全显内容、无滚动条；用户手动拉大后保持，不缩回 */
function autoGrow(el) {
  const cur = parseInt(el.style.height, 10) || 0;
  el.style.height = "auto";
  const sh = el.scrollHeight;
  el.style.height = (Math.max(sh, cur + 2)) + "px";
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
  const role = state.features.bypass ? "旁路由" : "主路由";
  const rows = [
    ["设备", d.name],
    ["模式", state.features.bypass ? "旁路由（仅 LAN）" : "主路由"],
    ["主机名", state.params.hostname],
    ["LAN IP", state.params.lan_ip + " / " + state.params.lan_mask],
  ];
  if (state.features.bypass) rows.push(["网关/DNS", state.params.gateway + " / " + state.params.gateway]);
  rows.push(["IPv6", state.features.ipv6 ? "开" : "关"]);
  if (state.features.wifi) rows.push(["无线", "SSID " + (state.params.wifi_ssid || "—") + (state.params.wifi_key ? "（加密）" : "（无密码）")]);
  else rows.push(["无线", "关"]);
  if (state.features.wwan) { rows.push(["蜂窝上网", "开（5gmodem + 蜂窝驱动）"]); if (state.params.pppoe_user || state.params.pppoe_pass) rows.push(["蜂窝拨号", (state.params.pppoe_user || "—") + " / " + (state.params.pppoe_pass ? "****" : "—")]); }
  rows.push(["基础包", d.base.length + " 个（固定）"]);
  rows.push(["可选包", set.length + " 个"]);
  rows.push(["互联网", state.net.size ? [...state.net].join("、") : "无"]);
  rows.push(["主题", [...new Set([...state.themes, state.defaultTheme])].length + " 个 · 默认 " + state.defaultTheme.replace("luci-theme-", "")]);
  rows.push(["构建账号", accountOwner() + "/" + accountRepo()]);
  rows.forEach(([k, v]) => {
    dd.appendChild(el("dt", "", k));
    dd.appendChild(el("dd", "", v));
  });
}

/* ---------- wwan / theme init snippet ---------- */
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
    parts.push("# ZWRT 构建器 · 蜂窝上网(WWAN) 自动配置\n" + cred +
      "if [ -f /etc/init.d/ModemManager ]; then\n" +
      "  /etc/init.d/ModemManager enable 2>/dev/null || true\n" +
      "  /etc/init.d/ModemManager start 2>/dev/null || true\n" +
      "fi");
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
function workflowDevice() {
  const d = state.device;
  if (state.features.bypass && d.wfDeviceBypass) return d.wfDeviceBypass;
  return d.wfDeviceMain;
}
function composeInputs() {
  readParams();
  const d = state.device;
  const base = [...d.base];
  const sel = parsePkgInput(state.pkgInput);
  const netPkgs = [...state.net].flatMap((id) => (INTERNET_SCHEMES.find((s) => s.id === id) || {}).pkgs || []);
  const themePkgs = [...new Set([...state.themes, state.defaultTheme])];
  const wwan = state.features.wwan ? state.wwan : [];
  const common = [...new Set([...base, ...sel, ...netPkgs, ...themePkgs, ...wwan])];
  const wh3000 = [...new Set([...d.whExtra, ...wwan])];
  const inputs = {
    device: workflowDevice(),
    hostname: state.params.hostname,
    lan_ip: state.params.lan_ip,
    lan_mask: state.params.lan_mask,
    gateway: state.features.bypass ? state.params.gateway : "",
    dns: state.features.bypass ? state.params.gateway : "",
    password: state.params.password,
    ipv6: state.features.ipv6 ? "true" : "false",
    wifi: state.features.wifi ? "true" : "false",
    wifi_ssid: state.features.wifi ? state.params.wifi_ssid : "",
    wifi_key: state.features.wifi ? state.params.wifi_key : "",
    packages_common: common.join(" "),
    packages_wh3000: wh3000.join(" "),
    init_script: composeInitScript(),
  };
  return { inputs, meta: { base: base.length, sel: sel.length, wwan: wwan.length, role: state.features.bypass ? "bypass" : "main" } };
}
function ghAPI(method, path, token, body) {
  const opt = { method, headers: { Authorization: "Bearer " + token, "User-Agent": "zwrt-builder", Accept: "application/vnd.github+json" } };
  if (body) opt.headers["Content-Type"] = "application/json";
  return fetch("https://api.github.com" + path, body ? Object.assign(opt, { body: JSON.stringify(body) }) : opt);
}
async function apiJson(res) {
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch (e) { j = null; }
  if (!res.ok) throw new Error((j && j.message) || ("HTTP " + res.status));
  return j;
}

function validate() {
  const str = state.account.str;
  const parts = str.split("/").filter(Boolean);
  if (parts.length < 2 || !parts[0] || !parts[1]) return "仓库需填 所有者/仓库名（如 KuWiNet/ZWRT）";
  if (!state.account.token) return "请填写 GitHub Token（需 repo + workflow 权限）";
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
    if (res.status !== 204 && res.status !== 201) throw new Error(await res.text());
    logc("已提交，等待调度…", "ok");
    startPoll({ owner, repo, token });
  } catch (e) {
    logc("触发失败: " + e.message, "err");
    toast("触发失败：" + e.message);
    setBusy(false);
  }
}

async function startPoll(a) {
  if (state.pollTimer) clearInterval(state.pollTimer);
  const t0 = Date.now();
  const probe = async () => {
    try {
      const runs = await apiJson(await ghAPI("GET", "/repos/" + a.owner + "/" + a.repo + "/actions/runs?event=workflow_dispatch&per_page=5", a.token));
      const mine = runs.workflow_runs.find((r) => r.path === ".github/workflows/build-openwrt.yml" && new Date(r.created_at).getTime() >= t0 - 60000);
      if (mine) {
        state.runId = mine.id;
        const s = mine.status, c = mine.conclusion;
        logc("Run #" + mine.id + " 状态: " + s + (c ? " / " + c : ""), c === "success" ? "ok" : c === "failure" ? "err" : s === "in_progress" ? "warn" : "muted");
        if (s === "completed") {
          clearInterval(state.pollTimer);
          setBusy(false);
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

/* ---------- downloads ---------- */
async function loadDownloads(owner, repo, token) {
  const box = $("downloads");
  try {
    const rel = await apiJson(await ghAPI("GET", "/repos/" + owner + "/" + repo + "/releases?per_page=5", token));
    box.innerHTML = "";
    const items = rel.filter((r) => r.assets && r.assets.length);
    if (!items.length) { box.appendChild(el("p", "dim", "暂无 Release 固件")); return; }
    items.forEach((r) => {
      r.assets.filter((a) => a.name.startsWith("zwrt-")).forEach((a) => {
        const it = el("div", "dl-item");
        const n = el("div", "n", a.name); it.appendChild(n);
        const m = el("div", "m", (a.size / 1048576).toFixed(1) + " MB · " + r.tag_name); it.appendChild(m);
        const l = el("div", "links");
        const gh = el("a", "", "GitHub ↓"); gh.href = a.browser_download_url; gh.target = "_blank"; gh.rel = "noopener";
        const r2 = el("a", "", "R2 下载 ↓"); r2.href = "https://dl.zwrt.de/firmware/" + a.name; r2.target = "_blank"; r2.rel = "noopener";
        l.appendChild(r2); l.appendChild(gh); it.appendChild(l);
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
  // 功能字段显隐
  const by = state.features.bypass;
  $("lblGateway").hidden = !by;
  $("netHint").hidden = !by;
  $("fieldsWifi").hidden = !state.features.wifi;
  $("fieldsWwan").hidden = !state.features.wwan;
  $("f-wifi").disabled = by;                       // 旁路由不可开无线
  if (by && $("f-wifi").checked) $("f-wifi").checked = false;
  $("featureHint").textContent = [
    by ? "旁路由：仅 LAN 口、关闭 WAN/DHCP，网关指向主路由（DNS=网关），不可开无线。" : "",
    state.features.wwan ? "蜂窝上网：自动追加 5gmodem 应用与主流蜂窝网卡驱动包。" : "",
  ].filter(Boolean).join(" ");
  // 基础参数回填
  $("p-hostname").value = state.params.hostname;
  $("p-lanip").value = state.params.lan_ip;
  $("p-password").value = state.params.password;
  $("p-gateway").value = state.params.gateway;
  $("p-wifissid").value = state.params.wifi_ssid;
  $("p-wifikey").value = state.params.wifi_key;
  $("p-pppuser").value = state.params.pppoe_user;
  $("p-ppppass").value = state.params.pppoe_pass;
  $("pkgInput").value = state.pkgInput;
  $("initScript").value = state.initScript;
  $("p-account").value = state.account.str;
  $("m-base").textContent = state.device.base.length;
  $("m-selected").textContent = parsePkgInput(state.pkgInput).length;
  $("initHint").textContent = state.features.wwan ? "已勾选蜂窝上网：构建时会自动附加 WWAN 配置片段。" : "可选。写入 /etc/uci-defaults，首次开机执行。";
  $("deviceNote").textContent = "共 " + state.devices.length + " 种设备；x86/64 可旁路由。";
  renderBaseChips();
  renderPkgChips();
  renderNetChips();
  renderThemeChips();
  renderThemeSelect();
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
  ["p-hostname", "p-lanip", "p-password", "p-gateway", "p-wifissid", "p-wifikey", "p-pppuser", "p-ppppass"].forEach((id) => {
    on(id, "input", () => { readParams(); renderSummary(); });
  });
  on("p-account", "input", (e) => { state.account.str = e.target.value.trim() || "KuWiNet/ZWRT"; renderSummary(); });
  on("pkgInput", "input", (e) => { state.pkgInput = e.target.value; renderPkgChips(); $("m-selected").textContent = parsePkgInput(state.pkgInput).length; autoGrow(e.target); renderSummary(); });
  on("p-theme", "change", (e) => { state.defaultTheme = e.target.value; renderThemeChips(); render(); });
  on("initScript", "input", (e) => { state.initScript = e.target.value; renderSummary(); });
  on("p-token", "input", (e) => { state.account.token = e.target.value.trim(); });
  on("p-tokensave", "change", (e) => {
    try { if (e.target.checked) localStorage.setItem("zwrt_token", state.account.token); else localStorage.removeItem("zwrt_token"); }
    catch (err) {}
  });
  on("btnBuild", "click", () => triggerBuild());
  on("btnPreview", "click", () => {
    readParams();
    const { inputs } = composeInputs();
    const p = $("preview"); p.hidden = !p.hidden; if (!p.hidden) p.textContent = JSON.stringify({ ref: "main", inputs }, null, 2);
  });
  const saved = (() => { try { return localStorage.getItem("zwrt_token") || ""; } catch (e) { return ""; } })();
  if (saved) { $("p-token").value = saved; $("p-tokensave").checked = true; state.account.token = saved; }
}

(async function init() {
  bindStatic();
  try { await loadData(); }
  catch (e) {
    console.error(e);
    $("deviceSearch").value = "";
    $("deviceNote").textContent = "无法加载设备/包数据：请通过 https 访问本站（直接打开本地 html 会被浏览器拦截数据请求）。";
  }
})();
