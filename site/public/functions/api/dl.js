/**
 * GET /api/dl?u=<url> — 代理下载固件。
 * 仓库已改私库，Release 资产匿名不可下载；此处用 GH_TOKEN 代理流式返回。
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const u = url.searchParams.get('u') || '';
  if (!/^https:\/\/.*(github\.com|api\.github\.com)/.test(u)) {
    return new Response(JSON.stringify({ error: '非法下载地址' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const resp = await fetch(u, {
    headers: { 'Authorization': 'Bearer ' + (env.GH_TOKEN || ''), 'User-Agent': 'zwrt-builder' },
    redirect: 'follow',
  });
  const ct = resp.headers.get('Content-Type') || 'application/octet-stream';
  const cl = resp.headers.get('Content-Length');
  const h = { 'Content-Type': ct };
  if (cl) h['Content-Length'] = cl;
  return new Response(resp.body, { status: resp.status, headers: h });
}
