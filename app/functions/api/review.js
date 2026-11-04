// Same-origin proxy for the MMIX Review Kit → shared worker review.mmix.biz (binary-safe: attachments go through it).
export async function onRequest({ request }) {
  const u = new URL(request.url);
  const init = { method: request.method, headers: { 'content-type': request.headers.get('content-type') || 'application/json',
    'x-forwarded-for': request.headers.get('cf-connecting-ip') || '', origin: u.origin } };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();
  const r = await fetch('https://review.mmix.biz/api/review' + u.search, init);
  const h = new Headers({ 'cache-control': 'no-store' });
  for (const k of ['content-type', 'content-disposition', 'content-security-policy', 'x-content-type-options']) if (r.headers.get(k)) h.set(k, r.headers.get(k));
  return new Response(r.body, { status: r.status, headers: h });
}
