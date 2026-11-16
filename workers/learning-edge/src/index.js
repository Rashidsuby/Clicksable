const SITE_URL = 'https://clicksable.com';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeUrl = value => {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};
const safeLink = value => /^mailto:[^\s@/]+@[^\s@/]+\.[^\s@/]+$/i.test(String(value || '').trim()) ? String(value).trim() : safeUrl(value);
const validSlug = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120;
const articleUrl = slug => `${SITE_URL}/learning/${encodeURIComponent(slug)}/`;
const dateText = value => new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value));

function cleanBody(value) {
  const allowed = new Set(['p', 'br', 'div', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'blockquote', 'a', 'hr', 'code', 'pre', 'figure', 'figcaption', 'img', 'table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td']);
  const voidTags = new Set(['br', 'hr', 'img']);
  const dropContent = new Set(['script', 'style', 'iframe', 'svg', 'math', 'object', 'template']);
  const tokens = String(value || '').match(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+|</g) || [];
  let blocked = 0;
  const output = [];
  for (const token of tokens) {
    if (token.startsWith('<!--')) continue;
    const match = token.match(/^<\/?\s*([a-zA-Z0-9-]+)/);
    if (!match) { if (!blocked) output.push(token === '<' ? '&lt;' : esc(token)); continue; }
    const tag = match[1].toLowerCase();
    const closing = /^<\//.test(token);
    if (dropContent.has(tag)) { blocked = closing ? Math.max(0, blocked - 1) : blocked + 1; continue; }
    if (blocked || !allowed.has(tag)) continue;
    if (closing) { if (tag === 'div') output.push('</p>'); else if (!voidTags.has(tag)) output.push(`</${tag}>`); continue; }
    if (tag === 'div') { output.push('<p>'); continue; }
    if (tag === 'a') {
      const href = token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const url = safeLink(href?.[1] ?? href?.[2] ?? href?.[3] ?? '');
      output.push(url ? `<a href="${esc(url)}" rel="noopener noreferrer">` : '<a>');
    } else if (tag === 'img') {
      const src = token.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const alt = token.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const url = safeUrl(src?.[1] ?? src?.[2] ?? src?.[3] ?? '');
      if (url) output.push(`<img src="${esc(url)}" alt="${esc(alt?.[1] ?? alt?.[2] ?? alt?.[3] ?? '')}" loading="lazy">`);
    } else if (tag === 'th') output.push('<th scope="col">');
    else if (tag === 'td') output.push('<td>');
    else output.push(`<${tag}>`);
  }
  return output.join('');
}

function articleBody(value) {
  let index = 0;
  return cleanBody(value).replace(/<h2>([\s\S]*?)<\/h2>/gi, (_match, label) => {
    const plain = label.replace(/<[^>]*>/g, '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
    return `<h2 id="${esc(`${plain}-${++index}`)}">${label}</h2>`;
  });
}

async function publishedArticle(slug, env) {
  const url = new URL('/rest/v1/learning_articles', env.SUPABASE_URL);
  url.search = new URLSearchParams({
    select: 'title,slug,excerpt,body_html,cover_image_url,cover_image_alt,category,tags,author_name,author_role,author_avatar_url,key_takeaways,seo_title,seo_description,canonical_url,geo_faq,published_at,updated_at',
    slug: `eq.${slug}`,
    status: 'eq.published',
    published_at: `lte.${new Date().toISOString()}`,
    limit: '1',
  }).toString();
  const response = await fetch(url, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : null;
}

function renderArticle(article) {
  const slug = article.slug;
  const title = String(article.seo_title || article.title || 'Learning Center article').trim().slice(0, 180);
  const description = String(article.seo_description || article.excerpt || '').trim().slice(0, 320);
  const canonical = safeUrl(article.canonical_url) || articleUrl(slug);
  const cover = safeUrl(article.cover_image_url);
  const author = String(article.author_name || 'Clicksable').trim();
  const role = String(article.author_role || '').trim();
  const avatar = safeUrl(article.author_avatar_url);
  const body = articleBody(article.body_html);
  const takeaways = Array.isArray(article.key_takeaways) ? article.key_takeaways.filter(Boolean).slice(0, 8) : [];
  const faqs = Array.isArray(article.geo_faq) ? article.geo_faq.filter(item => item?.question && item?.answer).slice(0, 30) : [];
  const headings = [...body.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/gi)];
  const toc = headings.length ? `<aside class="toc"><p>IN THIS ARTICLE</p>${headings.map(([, id, label]) => `<a href="#${esc(id)}">${esc(label.replace(/<[^>]*>/g, ''))}</a>`).join('')}</aside>` : '';
  const takeawaysHtml = takeaways.length ? `<section class="takeaways"><p class="eyebrow">THE SHORT VERSION</p><h2>Key takeaways</h2><ul>${takeaways.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>` : '';
  const faqHtml = faqs.length ? `<section class="faq"><h2>Common questions</h2>${faqs.map(item => `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('')}</section>` : '';
  const schema = { '@context': 'https://schema.org', '@type': 'BlogPosting', '@id': `${canonical}#article`, headline: article.title, description, datePublished: article.published_at, dateModified: article.updated_at || article.published_at, author: { '@type': /^clicksable\.?$/i.test(author) ? 'Organization' : 'Person', name: author, ...(role ? { jobTitle: role } : {}), ...(avatar ? { image: avatar } : {}) }, publisher: { '@type': 'Organization', name: 'clicksable.', '@id': `${SITE_URL}/#organization` }, mainEntityOfPage: canonical, ...(cover ? { image: [cover] } : {}) };
  const faqSchema = faqs.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) } : null;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | clicksable.</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="article"><meta property="og:site_name" content="clicksable."><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">${cover ? `<meta property="og:image" content="${esc(cover)}">` : ''}<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>${faqSchema ? `<script type="application/ld+json">${JSON.stringify(faqSchema).replace(/</g, '\\u003c')}</script>` : ''}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>*{box-sizing:border-box}body{margin:0;background:#f7f5ed;color:#171a14;font:17px/1.75 'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}a{color:#1a73e8;text-decoration:underline;text-underline-offset:.14em}.topbar{position:sticky;top:10px;z-index:4;width:min(1280px,calc(100% - 28px));margin:10px auto 0;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(23,26,20,.1);border-radius:18px;background:rgba(255,253,248,.94);box-shadow:0 10px 34px rgba(23,26,20,.08);backdrop-filter:blur(16px)}.brand{padding:7px 12px;border-radius:11px;background:#294719;color:#fff;font-size:22px;font-weight:800;letter-spacing:-1.5px;text-decoration:none}.brand span{color:#c8ff00}.nav{display:flex;gap:24px;align-items:center;font-size:13px;font-weight:700}.nav a{color:#3c4139;text-decoration:none}.shell{width:min(1180px,calc(100% - 40px));margin:auto}.article{width:min(820px,100%);margin:0 auto;padding:clamp(52px,8vw,100px) 0 105px}.eyebrow,.meta{margin:0 0 12px;color:#294719;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.article h1{margin:0;max-width:900px;font-size:clamp(42px,7vw,76px);line-height:1.03;letter-spacing:-.075em}.deck{margin:22px 0;color:#5d635a;font-size:clamp(18px,2.4vw,22px);line-height:1.65}.cover{width:100%;max-height:520px;object-fit:cover;margin:30px 0;border-radius:24px}.byline{display:flex;align-items:center;gap:12px;margin:32px 0 38px;color:#5d635a;font-size:14px}.avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;background:#dfe8d5}.body{font-size:18px;line-height:1.85}.body h2,.takeaways h2,.faq h2{margin:1.8em 0 .5em;font-size:1.55em;line-height:1.15;letter-spacing:-.04em}.body h3{margin:1.5em 0 .4em;line-height:1.2}.body img{display:block;max-width:100%;height:auto;margin:1.5em auto;border-radius:16px}.body figure{margin:1.7em 0}.body figcaption{color:#5d635a;font-size:.84em;text-align:center}.body blockquote{margin:1.5em 0;padding:4px 0 4px 20px;border-left:3px solid #294719;color:#294719}.body table{display:block;max-width:100%;overflow:auto;border-collapse:collapse;margin:1.6em 0}.body th,.body td{min-width:150px;padding:12px;border:1px solid rgba(23,26,20,.18);vertical-align:top;text-align:left}.body th{background:#e7ecdf}.toc{margin:34px 0;padding:20px 22px;border:1px solid rgba(23,26,20,.13);border-radius:18px;background:#fffdf8}.toc p{margin:0 0 8px;color:#294719;font-size:11px;font-weight:800;letter-spacing:.14em}.toc a{display:block;padding:4px 0;color:#294719;font-size:14px;font-weight:650;text-decoration:none}.takeaways{margin:48px 0;padding:30px;border-radius:22px;background:#fff;border:1px solid rgba(23,26,20,.08);box-shadow:0 14px 34px rgba(23,26,20,.06)}.takeaways h2{margin-top:.2em}.takeaways li{margin:.35em 0}.faq{margin-top:55px;padding-top:28px;border-top:1px solid rgba(23,26,20,.15)}.faq details{padding:16px 0;border-bottom:1px solid rgba(23,26,20,.15)}.faq summary{font-weight:700;cursor:pointer}.footer{border-top:1px solid rgba(23,26,20,.15);padding:26px 0 42px;color:#5d635a;font-size:13px}@media(max-width:650px){.nav a:not(:last-child){display:none}.nav{gap:12px}.article{padding-top:50px}.body{font-size:16px}.shell{width:calc(100% - 36px)}.takeaways{padding:23px}.body th,.body td{min-width:130px;padding:10px}}</style></head><body><header class="topbar"><a class="brand" href="/">click<span>sable.</span></a><nav class="nav"><a href="/creator/">For creators</a><a href="/business/">For businesses</a><a href="/company/">Company</a><a href="/learning/">Learning Center</a><a href="/contact/">Start a project</a></nav></header><main class="shell"><article class="article"><p class="meta">${esc(article.category || 'Insights')} · ${esc(dateText(article.published_at))}</p><h1>${esc(article.title)}</h1><p class="deck">${esc(article.excerpt)}</p>${cover ? `<img class="cover" src="${esc(cover)}" alt="${esc(article.cover_image_alt || article.title)}">` : ''}<div class="byline">${avatar ? `<img class="avatar" src="${esc(avatar)}" alt="">` : ''}<span>By <strong>${esc(author)}</strong>${role ? ` · ${esc(role)}` : ''}</span></div>${toc}${takeawaysHtml}<div class="body">${body}</div>${faqHtml}</article></main><footer class="shell footer">© ${new Date().getUTCFullYear()} clicksable. <a href="/learning/">Learning Center</a></footer></body></html>`;
}

async function githubPagesFallback(request, env) {
  const url = new URL(request.url);
  const originUrl = new URL(`${env.GITHUB_PAGES_ORIGIN}${url.pathname}${url.search}`);
  return fetch(new Request(originUrl, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/learning\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
    if (request.method !== 'GET' && request.method !== 'HEAD') return githubPagesFallback(request, env);
    if (!match || !validSlug(match[1])) return githubPagesFallback(request, env);
    try {
      const article = await publishedArticle(match[1], env);
      if (!article) return githubPagesFallback(request, env);
      const response = new Response(request.method === 'HEAD' ? null : renderArticle(article), { headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=60', 'X-Robots-Tag': 'index, follow' } });
      return response;
    } catch (error) {
      console.error('Learning edge render failed', error);
      return githubPagesFallback(request, env);
    }
  },
};
