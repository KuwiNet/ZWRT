/**
 * /api/gh?m=METHOD&p=/repos/... — 代理 GitHub API（注入 GH_TOKEN）。
 * 前端不再直连 api.github.com，也不再持有/填写 Token。
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = (url.searchParams.get('m') || 'GET').toUpperCase();
  const path = url.searchParams.get('p') || '';
  if (!path) return new Response(JSON.stringify({ error: '缺少 path' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const headers = {
    'Authorization': 'Bearer ' + (env.GH_TOKEN || ''),
    'User-Agent': 'zwrt-builder',
    'Accept': 'application/vnd.github+json',
  };
  const init = { method, headers };
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const ct = request.headers.get('Content-Type') || 'application/json';
    headers['Content-Type'] = ct;
    init.body = await request.text();
  }

  const resp = await fetch('https://api.github.com' + path, init);
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: {
      'Content-Type': resp.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
