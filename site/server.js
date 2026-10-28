/**
 * ZWRT Builder — VPS 单文件 Node 服务（零依赖，Node 18+）
 * 用法: GH_TOKEN=ghp_xxx PORT=8090 node server.js
 * 静态目录: 同目录 public/  (index.html / app.js / data/ ...)
 * 公开站点: 无登录校验（浏览器直连 GitHub API 构建）
 * 环境变量:
 *   GH_TOKEN         GitHub Token (调用 GitHub API / 代理下载)
 *   PORT             监听端口 (默认 8090, 供 Nginx/1Panel 反代)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, 'public');
const PORT = parseInt(process.env.PORT || '8090', 10);
const GH_TOKEN = process.env.GH_TOKEN || '';

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

// 可压缩类型
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

// 静态资源缓存: 数据/脚本 5 分钟 (数据会定期更新), 图片 1 小时
function cacheControl(ext) {
  if (ext === '.png' || ext === '.ico') return 'public, max-age=3600';
  return 'public, max-age=300';
}

function maybeGzip(req, data, headers) {
  const ae = (req.headers['accept-encoding'] || '').toLowerCase();
  if (ae.includes('gzip') && data.length > 512) {
    const gz = zlib.gzipSync(data);
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    return gz;
  }
  return data;
}

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

  // 1) /api/gh — GitHub API 代理
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
    const ext = path.extname(fp).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheControl(ext),
    };
    let data = fs.readFileSync(fp);
    if (COMPRESSIBLE.has(ext)) data = maybeGzip(req, data, headers);
    send(res, 200, data, headers);
  } catch (e) {
    send(res, 404, 'Not Found');
  }
});

server.listen(PORT, () => {
  console.log('ZWRT site listening on :' + PORT + ' (GH_TOKEN=' + (GH_TOKEN ? 'set' : 'empty') + ')');
});
