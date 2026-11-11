/**
 * EdgeOne Pages Edge Function —— /api/bird
 * 路径：site/edge-functions/api/bird.js  ->  访问 /api/bird
 * 作用：360 小鸟壁纸每天一张（同一天固定、跨天自动更换）。
 * 说明：360 接口仅 http 可用（https 证书无效），故由服务端抓取后返回 JSON 给前端。
 * 前端在拿不到该端点或图片加载失败时会自动降级为纯色背景，不影响站点功能。
 */
'use strict';

// 风景 / 4K / 小清新 / 动漫 / 美女模特 / 明星风尚
const BIRD_CIDS = [9, 36, 15, 26, 6, 11];
const BIRD_CATEGORY = {
  9: '风景大片',
  36: '4K专区',
  15: '小清新',
  26: '动漫卡通',
  6: '美女模特',
  11: '明星风尚',
};

// 按 UTC+8 当天日期生成确定性 seed，保证同一天壁纸固定、跨天自动更换
function dailyBirdSeed() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  let h = 0;
  for (const ch of ymd) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { ymd, cid: BIRD_CIDS[h % BIRD_CIDS.length], start: h % 1500 };
}

function jsonResponse(status, body, cacheSeconds) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheSeconds ? 'public, max-age=' + cacheSeconds : 'no-store',
    },
  });
}

export default async function onRequest() {
  const seed = dailyBirdSeed();
  const api =
    'http://wallpaper.apc.360.cn/index.php?c=WallPaper&a=getAppsByCategory' +
    '&from=360chrome&count=1&cid=' + seed.cid + '&start=' + seed.start;

  try {
    const resp = await fetch(api, { headers: { 'User-Agent': 'zwrt-builder' } });
    if (!resp.ok) throw new Error('upstream HTTP ' + resp.status);
    const j = await resp.json();
    const item = j && j.data && j.data[0];
    if (!item || !item.url) throw new Error('壁纸接口返回为空');

    const payload = {
      date: seed.ymd,
      cid: seed.cid,
      category: BIRD_CATEGORY[seed.cid] || String(seed.cid),
      url: String(item.url).replace(/^http:\/\//, 'https://'),
    };
    return jsonResponse(200, payload, 3600);
  } catch (e) {
    return jsonResponse(502, { error: '壁纸获取失败: ' + (e && e.message ? e.message : String(e)) });
  }
}
