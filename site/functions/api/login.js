/**
 * POST /api/login — 校验访问密码，成功则写入 HttpOnly Cookie（7 天）。
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  const pass = String(body.password || '');
  const want = (env.ACCESS_PASSWORD || '').toString();
  if (want && pass === want) {
    return new Response('OK', {
      status: 200,
      headers: {
        'Set-Cookie': 'zwrt_auth=' + want + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800',
      },
    });
  }
  return new Response(JSON.stringify({ error: '密码错误' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
