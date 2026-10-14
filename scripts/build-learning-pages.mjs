import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputRoot = path.resolve(process.argv[2] || root);
const siteUrl = 'https://clicksable.com';
const learningPath = path.join(root, 'learning', 'index.html');
const learningHtml = await fs.readFile(learningPath, 'utf8');
const url = learningHtml.match(/const SUPABASE_URL='([^']+)'/)?.[1];
const key = learningHtml.match(/const SUPABASE_ANON_KEY='([^']+)'/)?.[1];
if (!url || !key) throw new Error('Could not read the public Supabase settings from learning/index.html');

const endpoint = new URL('/rest/v1/learning_articles', url);
const articleFields = 'title,slug,excerpt,body_html,cover_image_url,cover_image_alt,category,tags,author_name,seo_title,seo_description,canonical_url,geo_faq,published_at,updated_at';
const queryArticles = async fields => {
  const queryUrl = new URL(endpoint);
  queryUrl.search = new URLSearchParams({
    select: fields,
  status: 'eq.published',
  published_at: `lte.${new Date().toISOString()}`,
  order: 'published_at.desc',
  limit: '1000',
  }).toString();
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(queryUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', Range: `items=${offset}-${offset + 999}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Supabase article request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Supabase returned an unexpected article response');
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
};
const articles = [];
try {
  articles.push(...await queryArticles(articleFields));
} catch (error) {
  if (!String(error.message).includes('cover_image_alt')) throw error;
  console.warn('The cover_image_alt column is not installed yet; generating article pages without custom cover alt text.');
  articles.push(...await queryArticles(articleFields.replace(',cover_image_alt', '')));
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = value => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try { const parsed = new URL(text); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : ''; }
  catch { return ''; }
};
const decodeArticleMarkup = value => String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, entity => {
  const key = entity.slice(1, -1).toLowerCase();
  if (key[0] === '#') {
    const code = key[1] === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" })[key] || entity;
});
const cleanBody = value => {
  const allowed = new Set(['p', 'br', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'blockquote', 'a', 'hr', 'code', 'pre']);
  const voidTags = new Set(['br', 'hr']);
  const dropContent = new Set(['script', 'style', 'iframe', 'svg', 'math', 'object', 'template']);
  const raw = String(value || '');
  const source = /&lt;\/?(?:p|h[2-4]|ul|ol|li|blockquote|strong|b|em|i|a|hr|code|pre)\b/i.test(raw) ? decodeArticleMarkup(raw) : raw;
  const tokens = source.match(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+|</g) || [];
  let blocked = 0;
  const output = [];
  for (const token of tokens) {
    if (token.startsWith('<!--')) continue;
    const tag = token.match(/^<\/?\s*([a-zA-Z0-9-]+)/);
    if (!tag) { if (!blocked) output.push(token === '<' ? '&lt;' : token); continue; }
    const name = tag[1].toLowerCase();
    const closing = /^<\//.test(token);
    if (dropContent.has(name)) { blocked = closing ? Math.max(0, blocked - 1) : blocked + 1; continue; }
    if (blocked || !allowed.has(name)) continue;
    if (closing) { if (!voidTags.has(name)) output.push(`</${name}>`); continue; }
    if (name === 'a') {
      const attr = token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = safeUrl((attr?.[1] ?? attr?.[2] ?? attr?.[3] ?? '').replace(/&amp;/gi, '&'));
      output.push(href ? `<a href="${esc(href)}" rel="noopener noreferrer">` : '<a>');
    } else output.push(`<${name}>`);
  }
  return output.join('');
};
const dateText = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
};
const validSlug = slug => String(slug || '').length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ''));
const faqFor = article => Array.isArray(article.geo_faq) ? article.geo_faq.filter(item => item && String(item.question || '').trim() && String(item.answer || '').trim()).slice(0, 30) : [];
const articleUrl = slug => `${siteUrl}/learning/${encodeURIComponent(slug)}/`;
const articlePages = [];

for (const article of articles) {
  if (!validSlug(article.slug)) {
    console.warn(`Skipping article with invalid slug: ${String(article.slug).slice(0, 80)}`);
    continue;
  }
  const canonicalInput = safeUrl(article.canonical_url);
  const canonical = canonicalInput || articleUrl(article.slug);
  const title = String(article.seo_title || article.title || 'Learning Center article').trim().slice(0, 180);
  const description = String(article.seo_description || article.excerpt || '').trim().slice(0, 320);
  const cover = safeUrl(article.cover_image_url);
  const published = new Date(article.published_at);
  const modified = new Date(article.updated_at || article.published_at);
  const publishedIso = Number.isNaN(published.getTime()) ? '' : published.toISOString();
  const modifiedIso = Number.isNaN(modified.getTime()) ? publishedIso : modified.toISOString();
  const faqs = faqFor(article);
  const coverAlt = String(article.cover_image_alt || article.title || '').trim();
  const faqHtml = faqs.length ? `<section class="faq"><h2>Common questions</h2>${faqs.map(f => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join('')}</section>` : '';
  const structured = {
    '@context': 'https://schema.org', '@type': 'Article', headline: article.title,
    description, datePublished: publishedIso, dateModified: modifiedIso,
    author: { '@type': 'Organization', name: article.author_name || 'clicksable.' },
    publisher: { '@type': 'Organization', name: 'clicksable.' }, mainEntityOfPage: canonical,
    ...(cover ? { image: [cover] } : {}),
  };
  const faqStructured = faqs.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  } : null;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | clicksable.</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="article"><meta property="og:site_name" content="clicksable."><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">${cover ? `<meta property="og:image" content="${esc(cover)}">` : ''}
<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">${cover ? `<meta name="twitter:image" content="${esc(cover)}">` : ''}
<meta name="theme-color" content="#f7f5ed"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>${faqStructured ? `<script type="application/ld+json">${JSON.stringify(faqStructured).replace(/</g, '\\u003c')}</script>` : ''}
<style>*{box-sizing:border-box}body{margin:0;background:#f7f5ed;color:#171a14;font:17px/1.75 "DM Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}a{color:#294719}.shell{width:min(1180px,calc(100% - 40px));margin:auto}.topbar{position:sticky;top:10px;z-index:2;width:min(1280px,calc(100% - 28px));margin:10px auto 0;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;border:1px solid rgba(23,26,20,.1);border-radius:18px;background:rgba(255,253,248,.94);box-shadow:0 10px 34px rgba(23,26,20,.08);backdrop-filter:blur(16px)}.brand{padding:7px 12px;border-radius:11px;background:#172318;color:#fff;font-size:22px;font-weight:800;letter-spacing:-1.5px;text-decoration:none}.brand span{color:#c8ff00}.nav{display:flex;gap:22px;align-items:center;font-size:13px;font-weight:600}.nav a{text-decoration:none}.content{max-width:820px;margin:0 auto;padding:clamp(54px,9vw,100px) 0 110px}.eyebrow{margin:0 0 12px;color:#294719;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.content h1{margin:0;font-size:clamp(42px,7vw,76px);line-height:1.03;letter-spacing:-.075em}.deck{margin:22px 0;color:#5d635a;font-size:clamp(18px,2.4vw,22px);line-height:1.65}.cover{display:block;width:100%;max-height:520px;margin:30px 0;border-radius:24px;object-fit:cover}.body{margin-top:32px;font-size:18px;line-height:1.85}.body h2{margin:1.8em 0 .5em;font-size:1.55em;line-height:1.15;letter-spacing:-.04em}.body h3{margin:1.5em 0 .4em;line-height:1.2}.body blockquote{margin:1.5em 0;padding:4px 0 4px 20px;border-left:3px solid #294719;color:#294719}.body a{font-weight:600}.faq{margin-top:54px;padding-top:26px;border-top:1px solid rgba(23,26,20,.15)}.faq h2{font-size:28px;letter-spacing:-1px}.faq details{padding:16px 0;border-bottom:1px solid rgba(23,26,20,.15)}.faq summary{font-weight:700;cursor:pointer}.faq p,.byline{color:#5d635a}.byline{margin-top:38px;font-size:13px}.footer{padding:22px 0 36px;border-top:1px solid rgba(23,26,20,.15);display:flex;justify-content:space-between;gap:15px;color:#5d635a;font-size:12px}.footer a{color:#294719;font-weight:700;text-decoration:none}@media(max-width:600px){body{font-size:16px}.shell{width:calc(100% - 36px)}.nav{gap:12px}.nav a:not(:last-child){display:none}.content{padding-top:54px}.body{font-size:16px}.footer{flex-direction:column}}</style></head>
<body><header class="topbar"><a class="brand" href="/">click<span>sable.</span></a><nav class="nav" aria-label="Main navigation"><a href="/">Home</a><a href="/learning/">Learning Center</a><a href="/#services">Explore services</a></nav></header><main class="shell"><article class="content"><p class="eyebrow">${esc(article.category || 'Insights')}${publishedIso ? ` · ${esc(dateText(article.published_at))}` : ''}</p><h1>${esc(article.title)}</h1><p class="deck">${esc(article.excerpt)}</p>${cover ? `<img class="cover" src="${esc(cover)}" alt="${esc(coverAlt)}" fetchpriority="high" onerror="this.remove()">` : ''}<div class="body">${cleanBody(article.body_html)}</div>${faqHtml}<p class="byline">By ${esc(article.author_name || 'clicksable.')}</p></article></main><footer class="shell footer"><span>© ${new Date().getUTCFullYear()} clicksable. · Dubai · Muscat · London · Islamabad · New York</span><span><a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · <a href="/learning/">All articles</a></span></footer></body></html>`;
  const target = path.join(outputRoot, 'learning', article.slug, 'index.html');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, html);
  articlePages.push({ url: articleUrl(article.slug), lastmod: modifiedIso || publishedIso, canonicalIsLocal: new URL(canonical).origin === siteUrl });
}

// Make the listing's initial HTML crawlable even before the browser hydrates Supabase.
const cards = articles.filter(a => validSlug(a.slug)).map(a => { const cover = safeUrl(a.cover_image_url); return `<article class="article-card"><div class="cover">${cover ? `<img loading="lazy" src="${esc(cover)}" alt="${esc(a.cover_image_alt || a.title)}" onerror="this.remove()">` : ''}</div><div class="article-card-body"><div class="article-meta"><span>${esc(a.category || 'Insights')}</span><span>·</span><time datetime="${esc(a.published_at)}">${esc(dateText(a.published_at))}</time></div><h3>${esc(a.title)}</h3><p>${esc(a.excerpt)}</p><a class="read-link" href="/learning/${encodeURIComponent(a.slug)}/">Read article →</a></div></article>`; }).join('');
const listingTarget = path.join(outputRoot, 'learning', 'index.html');
let listingHtml = await fs.readFile(listingTarget, 'utf8');
listingHtml = listingHtml.replace(/<!-- ARTICLES_START -->[\s\S]*?<!-- ARTICLES_END -->/, `<!-- ARTICLES_START -->${cards || '<div class="empty">New articles are coming soon.</div>'}<!-- ARTICLES_END -->`);
await fs.writeFile(listingTarget, listingHtml);

const entries = [
  { url: `${siteUrl}/` },
  { url: `${siteUrl}/creator/` },
  { url: `${siteUrl}/business/` },
  { url: `${siteUrl}/company/` },
  { url: `${siteUrl}/learning/`, lastmod: new Date().toISOString() },
  { url: `${siteUrl}/privacy.html` },
  { url: `${siteUrl}/terms.html` },
  ...articlePages.filter(page => page.canonicalIsLocal),
];
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(entry => `  <url><loc>${esc(entry.url)}</loc>${entry.lastmod ? `<lastmod>${esc(entry.lastmod.slice(0, 10))}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
await fs.writeFile(path.join(outputRoot, 'sitemap.xml'), xml);
await fs.writeFile(path.join(outputRoot, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
console.log(`Generated ${articlePages.length} article pages and sitemap with ${entries.length} URLs.`);
