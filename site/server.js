/**
 * ZWRT Builder — VPS 单文件 Node 服务（零依赖，Node 18+）
 * 用法: ACCESS_PASSWORD=xxx GH_TOKEN=ghp_xxx PORT=8080 node server.js
 * 静态目录: 同目录 public/  (index.html / app.js / data/ ...)
 * 登录: 除 /api/login 外全部校验 zwrt_auth Cookie（与 Cloudflare Pages 版行为一致）
 * 环境变量:
 *   ACCESS_PASSWORD  网站访问密码 (留空 = 不设密码)
 *   GH_TOKEN         GitHub Token (调用 GitHub API / 代理下载)
 *   PORT             监听端口 (默认 8080, 供 Nginx/1Panel 反代)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = parseInt(process.env.PORT || '8080', 10);
const ACCESS_PASSWORD = (process.env.ACCESS_PASSWORD || '').toString();
const GH_TOKEN = process.env.GH_TOKEN || '';

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZWRT 构建器 · 登录</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    background:linear-gradient(135deg,#0e2233,#173a5a);color:#e8f0f7}
  .box{width:320px;background:#fff;border-radius:14px;padding:28px;box-shadow:0 12px 40px rgba(0,0,0,.3)}
  .box h1{font-size:20px;margin-bottom:4px;color:#0e2233}
  .box p{color:#6b7a88;font-size:13px;margin-bottom:20px}
  label{display:block;font-size:13px;color:#33465a;margin-bottom:6px}
  input{width:100%;padding:11px 12px;border:1px solid #d4dde5;border-radius:8px;font-size:15px;margin-bottom:16px;outline:none}
  input:focus{border-color:#2f7de1}
  button{width:100%;padding:11px;background:#2f7de1;color:#fff;border:0;border-radius:8px;font-size:15px;cursor:pointer}
  button:disabled{opacity:.6}
  .err{color:#c0392b;font-size:13px;min-height:18px;margin-bottom:8px}
</style></head>
<body>
  <div class="box">
    <h1>ZWRT 构建器</h1><p>私有站点，请输入访问密码</p>
    <label>访问密码</label>
    <input type="password" id="pw" autocomplete="current-password" placeholder="输入访问密码">
    <div class="err" id="err"></div>
    <button id="go">登录</button>
  </div>
  <script>
    var b=document.getElementById('go'),e=document.getElementById('err'),i=document.getElementById('pw');
    function submit(){
      var p=i.value; if(!p){e.textContent='请输入密码';return;}
      b.disabled=true; e.textContent='';
      fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})})
        .then(function(r){ if(r.ok){ location.reload(); } else { return r.json().then(function(j){e.textContent=j&&j.error||'密码错误';}); } })
        .catch(function(){e.textContent='网络错误，请重试';})
        .then(function(){b.disabled=false;});
    }
    b.addEventListener('click',submit); i.addEventListener('keydown',function(ev){if(ev.key==='Enter')submit();});
    i.focus();
  </script>
</body></html>`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers) {
  const h = { 'Cache-Control': 'no-store', ...(headers || {}) };
  res.writeHead(status, h);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 2e6) req.destroy(); });
    req.on('end', () => resolve(d));
    req.on('error', () => resolve(''));
  });
}

async function proxy(req, res, target, extraHeaders) {
  try {
    const headers = { 'User-Agent': 'zwrt-builder', 'Accept': 'application/vnd.github+json', ...extraHeaders };
    const init = { method: req.method, headers, redirect: 'follow' };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const ct = req.headers['content-type'] || 'application/json';
      headers['Content-Type'] = ct;
      init.body = await readBody(req);
    }
    const resp = await fetch(target, init);
    const ct = resp.headers.get('Content-Type') || 'application/octet-stream';
    const cl = resp.headers.get('Content-Length');
    const h = { 'Content-Type': ct, 'Cache-Control': 'no-store' };
    if (cl) h['Content-Length'] = cl;
    res.writeHead(resp.status, h);
    if (req.method === 'HEAD') { res.end(); return; }
    const buf = Buffer.from(await resp.arrayBuffer());
    res.end(buf);
  } catch (e) {
    send(res, 502, JSON.stringify({ error: '上游请求失败: ' + e.message }), { 'Content-Type': 'application/json' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // 1) 登录校验（除 /api/login 外全部拦截）
  if (url.pathname !== '/api/login') {
    const cookie = req.headers.cookie || '';
    if (ACCESS_PASSWORD && !cookie.includes('zwrt_auth=' + ACCESS_PASSWORD)) {
      return send(res, 200, LOGIN_PAGE, { 'Content-Type': 'text/html; charset=utf-8' });
    }
  }

  // 2) /api/login — 校验访问密码
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    let pass = '';
    try { pass = String(JSON.parse(body).password || ''); } catch (e) { pass = ''; }
    if (ACCESS_PASSWORD && pass === ACCESS_PASSWORD) {
      return send(res, 200, 'OK', { 'Set-Cookie': 'zwrt_auth=' + ACCESS_PASSWORD + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800' });
    }
    return send(res, 401, JSON.stringify({ error: '密码错误' }), { 'Content-Type': 'application/json' });
  }

  // 3) /api/gh — GitHub API 代理
  if (url.pathname === '/api/gh') {
    const method = (url.searchParams.get('m') || 'GET').toUpperCase();
    const p = url.searchParams.get('p') || '';
    if (!p) return send(res, 400, JSON.stringify({ error: '缺少 path' }), { 'Content-Type': 'application/json' });
    if (!GH_TOKEN) return send(res, 500, JSON.stringify({ error: 'GH_TOKEN 未配置' }), { 'Content-Type': 'application/json' });
    return proxy(req, res, 'https://api.github.com' + p, { 'Authorization': 'Bearer ' + GH_TOKEN });
  }

  // 4) /api/dl — 代理下载固件
  if (url.pathname === '/api/dl') {
    const u = url.searchParams.get('u') || '';
    if (!/^https:\/\/.*(github\.com|api\.github\.com)/.test(u)) {
      return send(res, 400, JSON.stringify({ error: '非法下载地址' }), { 'Content-Type': 'application/json' });
    }
    const headers = { 'User-Agent': 'zwrt-builder' };
    if (GH_TOKEN) headers['Authorization'] = 'Bearer ' + GH_TOKEN;
    return proxy(req, res, u, headers);
  }

  // 5) 静态文件（public/）
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  if (rel.includes('..')) return send(res, 403, 'forbidden');
  let fp = path.join(ROOT, rel);
  try {
    const st = fs.statSync(fp);
    if (st.isDirectory()) fp = path.join(fp, 'index.html');
    const data = fs.readFileSync(fp);
    send(res, 200, data, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  } catch (e) {
    send(res, 404, 'Not Found');
  }
});

server.listen(PORT, () => {
  console.log('ZWRT site listening on :' + PORT + ' (ACCESS_PASSWORD=' + (ACCESS_PASSWORD ? 'set' : 'empty') + ', GH_TOKEN=' + (GH_TOKEN ? 'set' : 'empty') + ')');
});
