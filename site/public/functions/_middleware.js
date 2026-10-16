/**
 * ZWRT Builder — Cloudflare Pages Function middleware
 * 网站仅限私用：除 /api/login 外，所有请求都校验访问密码 Cookie。
 * 未登录一律返回内嵌登录页（看不到任何网站内容）。
 */
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

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  // 登录接口本身放行
  if (url.pathname === '/api/login') return next();
  // 其余一律校验访问密码 Cookie
  const cookie = request.headers.get('Cookie') || '';
  const want = (env.ACCESS_PASSWORD || '').toString();
  if (want && cookie.includes('zwrt_auth=' + want)) return next();
  return new Response(LOGIN_PAGE, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
