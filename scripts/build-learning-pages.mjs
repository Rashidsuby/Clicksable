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
const articleFields = 'title,slug,excerpt,body_html,cover_image_url,cover_image_alt,category,tags,author_name,author_role,author_avatar_url,key_takeaways,seo_title,seo_description,canonical_url,geo_faq,published_at,updated_at';
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
let fields = articleFields;
let articles = [];
const optionalFields = ['cover_image_alt', 'author_role', 'author_avatar_url', 'key_takeaways'];
while (true) {
  try { articles = await queryArticles(fields); break; }
  catch (error) {
    const message = String(error.message);
    const missing = optionalFields.find(field => fields.includes(`,${field},`) && message.includes(field))
      || optionalFields.find(field => fields.endsWith(`,${field}`) && message.includes(field));
    if (!missing) throw error;
    console.warn(`The ${missing} column is not installed yet; generating pages without it.`);
    fields = fields.replace(`,${missing}`, '');
  }
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = value => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try { const parsed = new URL(text); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : ''; }
  catch { return ''; }
};
const safeImageUrl = value => {
  const url = safeUrl(value);
  if (!url) return '';
  const parsed = new URL(url);
  return parsed.origin === siteUrl && parsed.pathname.startsWith('/hq/') ? '' : url;
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
  const canonicalParsed = canonicalInput ? new URL(canonicalInput) : null;
  const canonical = canonicalParsed?.origin === siteUrl && canonicalParsed.pathname.startsWith('/hq/') ? articleUrl(article.slug) : canonicalInput || articleUrl(article.slug);
  const title = String(article.seo_title || article.title || 'Learning Center article').trim().slice(0, 180);
  const description = String(article.seo_description || article.excerpt || '').trim().slice(0, 320);
  const cover = safeImageUrl(article.cover_image_url);
  const published = new Date(article.published_at);
  const modified = new Date(article.updated_at || article.published_at);
  const publishedIso = Number.isNaN(published.getTime()) ? '' : published.toISOString();
  const modifiedIso = Number.isNaN(modified.getTime()) ? publishedIso : modified.toISOString();
  const faqs = faqFor(article);
  const takeaways = Array.isArray(article.key_takeaways) ? article.key_takeaways.map(item => String(item || '').trim()).filter(Boolean).slice(0, 8) : [];
  const author = String(article.author_name || 'clicksable.').trim();
  const authorRole = String(article.author_role || 'Clicksable editorial').trim();
  const avatar = safeImageUrl(article.author_avatar_url);
  const authorMark = esc(author.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toLowerCase() || 'c.');
  const takeawaysHtml = takeaways.length ? `<section class="takeaways"><p class="eyebrow">THE SHORT VERSION</p><h2>Key takeaways</h2><ul>${takeaways.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>` : '';
  const coverAlt = String(article.cover_image_alt || article.title || '').trim();
  const faqHtml = faqs.length ? `<section class="faq"><h2>Common questions</h2>${faqs.map(f => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join('')}</section>` : '';
  let headingIndex = 0;
  const articleBody = cleanBody(article.body_html).replace(/<h2>([\s\S]*?)<\/h2>/gi, (match, inner) => {
    const label = inner.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const id = `${label.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'}-${++headingIndex}`;
    return `<h2 id="${esc(id)}">${inner}</h2>`;
  });
  const tocItems = [...articleBody.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/gi)];
  const tocHtml = tocItems.length ? `<aside class="toc"><p class="toc-title">IN THIS ARTICLE</p><nav aria-label="Article contents">${tocItems.map(([, id, label]) => `<a href="#${esc(id)}">${esc(label.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&'))}</a>`).join('')}</nav></aside>` : '';
  const wordCount = articleBody.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.ceil(wordCount / 220));
  const related = articles.filter(item => item.slug !== article.slug && validSlug(item.slug)).slice(0, 3);
  const relatedHtml = related.length ? `<section class="related"><div class="related-heading"><p class="eyebrow">KEEP EXPLORING</p><h2>More ideas for what comes next.</h2></div><div class="related-grid">${related.map(item => `<a class="related-card" href="/learning/${encodeURIComponent(item.slug)}/"><span>${esc(item.category || 'Insights')}</span><strong>${esc(item.title)}</strong><small>Read article ↗</small></a>`).join('')}</div></section>` : '';
  const structured = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: article.title,
    description, datePublished: publishedIso, dateModified: modifiedIso,
    author: { '@type': 'Person', name: author, ...(authorRole ? { jobTitle: authorRole } : {}), ...(avatar ? { image: avatar } : {}) },
    publisher: { '@type': 'Organization', name: 'clicksable.' }, mainEntityOfPage: canonical,
    ...(cover ? { image: [cover] } : {}),
  };
  const faqStructured = faqs.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  } : null;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><script id="clean-index-url">if(location.pathname.endsWith("/index.html")){history.replaceState(history.state,"",location.pathname.slice(0,-10)+location.search+location.hash)}</script><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | clicksable.</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="article"><meta property="og:site_name" content="clicksable."><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">${cover ? `<meta property="og:image" content="${esc(cover)}">` : ''}
<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">${cover ? `<meta name="twitter:image" content="${esc(cover)}">` : ''}
<meta name="theme-color" content="#f7f5ed"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>${faqStructured ? `<script type="application/ld+json">${JSON.stringify(faqStructured).replace(/</g, '\\u003c')}</script>` : ''}
<style>*{box-sizing:border-box}body{margin:0;background:#f7f5ed;color:#171a14;font:17px/1.75 "DM Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}a{color:#294719}.shell{width:min(1180px,calc(100% - 40px));margin:auto}.topbar{position:sticky;top:10px;z-index:2;width:min(1280px,calc(100% - 28px));margin:10px auto 0;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;border:1px solid rgba(23,26,20,.1);border-radius:18px;background:rgba(255,253,248,.94);box-shadow:0 10px 34px rgba(23,26,20,.08);backdrop-filter:blur(16px)}.brand{padding:7px 12px;border-radius:11px;background:#294719;color:#fff;font-size:22px;font-weight:800;letter-spacing:-1.5px;text-decoration:none}.brand span{color:#c8ff00}.site-nav{display:flex;align-items:center;justify-content:flex-end;gap:clamp(12px,1.5vw,24px);margin-left:24px;font-size:13px;font-weight:620}.site-nav a{color:#3c4139;text-decoration:none;white-space:nowrap}.site-nav a:hover,.site-nav a[aria-current="page"]{color:#294719}.menu-toggle{display:none}.content{max-width:820px;margin:0 auto;padding:clamp(54px,9vw,100px) 0 110px}.eyebrow{margin:0 0 12px;color:#294719;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.content h1{margin:0;font-size:clamp(42px,7vw,76px);line-height:1.03;letter-spacing:-.075em}.deck{margin:22px 0;color:#5d635a;font-size:clamp(18px,2.4vw,22px);line-height:1.65}.cover{display:block;width:100%;max-height:520px;margin:30px 0;border-radius:24px;object-fit:cover}.body{margin-top:32px;font-size:18px;line-height:1.85}.body h2{margin:1.8em 0 .5em;font-size:1.55em;line-height:1.15;letter-spacing:-.04em}.body h3{margin:1.5em 0 .4em;line-height:1.2}.body blockquote{margin:1.5em 0;padding:4px 0 4px 20px;border-left:3px solid #294719;color:#294719}.body a{font-weight:600}.faq{margin-top:54px;padding-top:26px;border-top:1px solid rgba(23,26,20,.15)}.faq h2{font-size:28px;letter-spacing:-1px}.faq details{padding:16px 0;border-bottom:1px solid rgba(23,26,20,.15)}.faq summary{font-weight:700;cursor:pointer}.faq p,.byline{color:#5d635a}.byline{margin-top:38px;font-size:13px}.footer{padding:22px 0 36px;border-top:1px solid rgba(23,26,20,.15);display:flex;justify-content:space-between;gap:15px;color:#5d635a;font-size:12px}.footer a{color:#294719;font-weight:700;text-decoration:none}@media(max-width:600px){body{font-size:16px}.shell{width:calc(100% - 36px)}.nav{gap:12px}.nav a:not(:last-child){display:none}.content{padding-top:54px}.body{font-size:16px}.footer{flex-direction:column}}</style><style id="article-reading-experience">.article-shell{padding-top:24px}.breadcrumb{display:flex;gap:10px;align-items:center;color:#777d72;font-size:12px}.breadcrumb a,.back-link a{color:#294719;font-weight:700;text-decoration:none}.story-hero{max-width:920px;margin:0 auto;padding:clamp(46px,8vw,94px) 0 40px}.story-hero>.eyebrow{margin-bottom:15px}.story-hero h1{max-width:900px;margin:0;font-size:clamp(44px,7.2vw,82px);line-height:.99;letter-spacing:-.075em}.story-hero .deck{max-width:760px;margin:22px 0 25px;color:#5d635a;font-size:clamp(18px,2.2vw,22px);line-height:1.65}.story-meta{display:flex;align-items:center;gap:12px;color:#5d635a;font-size:12px}.story-meta>span:nth-child(2){display:grid;gap:1px}.story-meta strong{color:#171a14;font-size:12px}.story-meta small{font-size:10px;color:#74796f}.author-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#172318;color:#c8ff00;font-weight:800;font-size:14px}.meta-divider{height:20px;border-left:1px solid rgba(23,26,20,.18)}.cover-frame{position:relative;margin:34px 0 0;aspect-ratio:2.05/1;overflow:hidden;border:1px solid rgba(23,26,20,.12);border-radius:24px;background:#e9eee2}.cover-frame .cover{width:100%;height:100%;max-height:none;margin:0;object-fit:cover}.cover-fallback{position:relative;display:flex;min-height:220px;aspect-ratio:2.05/1;margin-top:34px;overflow:hidden;align-items:flex-end;padding:clamp(24px,5vw,54px);border:1px solid rgba(23,26,20,.1);border-radius:24px;background:radial-gradient(ellipse at 76% 34%,rgba(200,255,0,.3),transparent 28%),linear-gradient(130deg,#e7ebdf,#f5f2e8 64%,#e5eadc);color:#294719}.cover-fallback span{position:absolute;top:24px;left:clamp(24px,5vw,54px);font-size:10px;font-weight:800;letter-spacing:.16em}.cover-fallback i{position:absolute;right:12%;top:-23%;width:43%;aspect-ratio:1;border:1px solid rgba(41,71,25,.2);border-radius:50%}.cover-fallback i:after{content:"";position:absolute;inset:12%;border:1px dashed rgba(41,71,25,.25);border-radius:50%}.cover-fallback strong{position:relative;font-size:clamp(24px,4vw,42px);letter-spacing:-.05em}.reading-grid{display:grid;grid-template-columns:190px minmax(0,720px);gap:clamp(30px,5vw,72px);justify-content:center;align-items:start;padding:18px 0 0}.toc{position:sticky;top:110px;padding:18px 0;border-top:2px solid #294719}.toc-title{margin:0 0 12px;font-size:9px;font-weight:800;letter-spacing:.14em;color:#74796f}.toc nav{display:grid;gap:9px}.toc a{color:#5d635a;font-size:12px;line-height:1.45;text-decoration:none}.toc a:hover{color:#294719}.body{margin:0;font-size:17px;line-height:1.85;color:#33382f}.body>p:first-child{margin-top:0;font-size:19px;color:#252a22}.body h2{scroll-margin-top:30px;margin:2.1em 0 .55em;font-size:clamp(25px,3vw,34px);line-height:1.12;letter-spacing:-.05em;color:#171a14}.body h3{margin:1.6em 0 .45em;font-size:22px;line-height:1.2;letter-spacing:-.035em}.body li{padding-left:5px;margin:7px 0}.body blockquote{padding:8px 0 8px 20px}.faq{max-width:720px;margin:58px auto 0;padding-top:25px;border-top:1px solid rgba(23,26,20,.15)}.article-cta{max-width:920px;margin:64px auto 0;padding:clamp(24px,4vw,40px);display:flex;align-items:center;justify-content:space-between;gap:25px;border:1px solid rgba(41,71,25,.15);border-radius:22px;background:linear-gradient(120deg,#e9eee2,#fffdf8)}.article-cta .eyebrow{font-size:9px}.article-cta h2{margin:0;font-size:clamp(24px,3vw,34px);line-height:1.1;letter-spacing:-.05em}.article-cta p:not(.eyebrow){margin:9px 0 0;color:#5d635a;font-size:14px}.article-cta>a{flex:0 0 auto;padding:13px 17px;border-radius:999px;background:#294719;color:white;text-decoration:none;font-size:12px;font-weight:700}.article-cta>a span{margin-left:12px;color:#c8ff00}.related{margin:90px auto 45px}.related-heading{margin-bottom:20px}.related-heading .eyebrow{margin-bottom:8px}.related-heading h2{margin:0;font-size:clamp(26px,4vw,40px);letter-spacing:-.055em}.related-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.related-card{display:flex;min-height:190px;flex-direction:column;align-items:flex-start;gap:13px;padding:20px;border:1px solid rgba(23,26,20,.12);border-radius:18px;background:#fffdf8;text-decoration:none;transition:transform .18s,box-shadow .18s}.related-card:hover{transform:translateY(-3px);box-shadow:0 12px 30px rgba(23,26,20,.08)}.related-card span{color:#294719;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.related-card strong{font-size:20px;line-height:1.18;letter-spacing:-.04em}.related-card small{margin-top:auto;color:#294719;font-size:11px;font-weight:700}.back-link{margin:0 0 55px;font-size:13px}.footer{flex-wrap:wrap}.topbar{position:sticky;top:12px;z-index:20;width:min(1360px,calc(100% - 32px));min-height:62px;margin:12px auto 0;padding:9px 17px 9px 22px;border-radius:21px;background:rgba(250,249,243,.9);backdrop-filter:blur(18px) saturate(150%)}.brand{display:inline-flex;align-items:center;min-height:42px;padding:0 13px 1px;background:#294719;color:#fff;font-size:21px;letter-spacing:-.052em}.site-nav a:hover,.site-nav a[aria-current="page"]{color:#294719}@media(max-width:760px){.topbar{top:8px;width:calc(100% - 24px);min-height:57px;margin-top:8px;padding:7px 10px 7px 16px;border-radius:18px}.menu-toggle{display:grid;place-items:center;width:44px;height:44px;margin-left:auto;border:1px solid rgba(23,26,20,.12);border-radius:50%;background:rgba(255,255,255,.58);color:#171a14;font:600 12px/1 "DM Sans",system-ui,sans-serif}.site-nav{display:none;position:absolute;top:calc(100% + 9px);left:0;right:0;z-index:10;margin:0;padding:10px;border:1px solid rgba(23,26,20,.1);border-radius:19px;background:rgba(250,249,243,.98);box-shadow:0 18px 42px rgba(24,29,19,.16);backdrop-filter:blur(18px)}.site-nav.is-open{display:flex;flex-direction:column;align-items:stretch;gap:2px}.site-nav a{padding:13px 14px;border-radius:11px}.site-nav a:hover{background:rgba(200,255,0,.2)}}@media(max-width:850px){.reading-grid{grid-template-columns:1fr;gap:8px}.toc{position:static;padding:14px;border:1px solid rgba(23,26,20,.12);border-radius:14px;background:#fffdf8}.toc nav{grid-template-columns:repeat(2,minmax(0,1fr))}.related-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.article-shell{width:calc(100% - 36px)}.story-hero{padding:46px 0 25px}.story-hero h1{font-size:clamp(41px,12vw,58px)}.story-meta{gap:8px;flex-wrap:wrap}.cover-frame,.cover-fallback{aspect-ratio:1.25/1;border-radius:18px}.reading-grid{padding-top:8px}.body{font-size:16px;line-height:1.8}.body>p:first-child{font-size:17px}.toc nav{grid-template-columns:1fr}.article-cta{align-items:flex-start;flex-direction:column;margin-top:44px}.related{margin-top:62px}.related-grid{grid-template-columns:1fr}.related-card{min-height:145px}.footer{flex-direction:column}}.universal-footer{width:100vw;margin:72px 0 0 calc(50% - 50vw);background:#172318;color:#eef2e9}.universal-footer *{box-sizing:border-box}.universal-footer-inner{width:min(100%,1440px);margin:auto;padding:58px clamp(24px,6vw,92px) 22px}.universal-footer-top{display:grid;grid-template-columns:1.25fr .7fr .75fr 1fr;gap:clamp(22px,4vw,60px);padding-bottom:42px}.universal-brand{color:#fff;font-size:29px;font-weight:850;letter-spacing:-.07em;text-decoration:none}.universal-brand span{color:#c8ff00}.universal-brand-block>p{max-width:310px;margin:18px 0;color:rgba(238,242,233,.68);font-size:13px;line-height:1.65}.universal-contact{color:#d8ff5d;font-size:13px;font-weight:700;text-decoration:none}.universal-link-group h2{margin:4px 0 16px;color:rgba(238,242,233,.55);font-size:10px;letter-spacing:.14em;text-transform:uppercase}.universal-link-group>a{display:block;margin-bottom:12px;color:#eef2e9;font-size:13px;text-decoration:none}.universal-link-group>a:hover{color:#c8ff00}.universal-office-group p{margin:0 0 13px}.universal-office-group strong,.universal-office-group span{display:block}.universal-office-group strong{color:#fff;font-size:12px}.universal-office-group span{margin-top:3px;color:rgba(238,242,233,.58);font-size:10px;line-height:1.5}.universal-footer-cta{display:flex;align-items:end;justify-content:space-between;gap:24px;padding:27px;border:1px solid rgba(216,255,93,.25);border-radius:20px;background:linear-gradient(112deg,rgba(200,255,0,.13),rgba(200,255,0,.035))}.universal-footer-cta>div:first-child>span{display:block;margin-bottom:10px;color:#d8ff5d;font-size:9px;font-weight:800;letter-spacing:.14em}.universal-footer-cta strong{font-size:clamp(26px,3vw,40px);line-height:1;letter-spacing:-.06em}.universal-footer-cta em{color:#c8ff00;font-style:normal}.universal-cta-actions{display:flex;gap:9px;flex-wrap:wrap}.universal-cta-actions a{display:inline-flex;gap:18px;align-items:center;padding:12px 15px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:rgba(255,255,255,.07);color:#fff;font-size:12px;text-decoration:none}.universal-cta-actions a:hover{background:#c8ff00;color:#172318}.universal-footer-bottom{display:flex;justify-content:space-between;gap:16px;margin-top:23px;padding-top:20px;border-top:1px solid rgba(255,255,255,.12);color:rgba(238,242,233,.55);font-size:10px}.universal-footer-bottom a{color:rgba(238,242,233,.8);text-decoration:none}@media(max-width:760px){.universal-footer-top{grid-template-columns:1fr 1fr;gap:28px 20px}.universal-brand-block,.universal-office-group{grid-column:1/-1}.universal-footer-cta{align-items:flex-start;flex-direction:column;padding:22px}.universal-cta-actions{width:100%;display:grid;grid-template-columns:1fr}.universal-footer-bottom{display:grid;gap:8px}}.story-hero{position:relative;isolation:isolate;width:100vw;max-width:none;margin:38px 0 0 calc(50% - 50vw);padding:clamp(56px,8vw,92px) max(24px,calc((100vw - 1080px)/2)) 46px;overflow:hidden;background:radial-gradient(ellipse at 88% 22%,rgba(200,255,0,.12),transparent 27%),linear-gradient(130deg,#20371d,#294719 62%,#355626);color:#fff}.story-hero:after{position:absolute;z-index:-1;inset:0;content:"";opacity:.13;background-image:linear-gradient(90deg,transparent 97%,rgba(255,255,255,.3) 98%),linear-gradient(transparent 97%,rgba(255,255,255,.24) 98%);background-size:54px 54px;mask-image:linear-gradient(90deg,transparent,black)}.story-tools,.story-hero h1,.story-hero .deck,.story-meta{position:relative;z-index:1}.story-tools .eyebrow{color:#d7f681}.copy-link{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:#fff}.story-hero h1{max-width:950px;color:#fff}.story-hero .deck{color:rgba(255,255,255,.8)}.story-meta{max-width:900px;color:rgba(255,255,255,.8)}.story-meta strong{color:#fff}.story-meta small{color:rgba(255,255,255,.68)}.author-mark{background:#d7f681;color:#20371d}.author-avatar{border:2px solid rgba(255,255,255,.7)}.cover-frame{max-width:1080px;margin:32px auto 0}.cover-frame+.reading-grid{padding-top:28px}.cover-frame{background:#e9eee2}.reading-grid{max-width:1080px;margin:0 auto}.takeaways{background:#fff}.story-hero .meta-spacer{min-width:20px}.rss-link:hover,.copy-link:hover{opacity:.78}
@media(prefers-reduced-motion:reduce){.related-card{transition:none}}</style></head>
<body><header class="topbar"><a class="brand" href="/">click<span>sable.</span></a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="learning-site-nav">Menu</button><nav class="site-nav" id="learning-site-nav" aria-label="Main navigation"><a href="/">Home</a><a href="/creator/">For creators</a><a href="/business/">For businesses</a><a href="/company/">Company</a><a href="/learning/" aria-current="page">Learning Center</a></nav></header><main class="shell article-shell"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/learning/">Learning Center</a><span>/</span><span>${esc(article.category || 'Insights')}</span></nav><article><header class="story-hero"><div class="story-tools"><p class="eyebrow">${esc(article.category || 'Insights')}</p><button class="copy-link" type="button" onclick="navigator.clipboard.writeText(location.href).then(()=>{this.textContent='Link copied'})">Copy link ↗</button></div><h1>${esc(article.title)}</h1><p class="deck">${esc(article.excerpt)}</p><div class="story-meta">${avatar ? `<img class="author-avatar" src="${esc(avatar)}" alt="" onerror="this.remove()">` : `<span class="author-mark">${authorMark}</span>`}<span><strong>${esc(author)}</strong><small>${esc(authorRole)}</small></span><span class="meta-spacer"></span><span>${esc(dateText(article.published_at))}<small>${readMinutes} min read</small></span></div></header>${cover ? `<figure class="cover-frame"><img class="cover" src="${esc(cover)}" alt="${esc(coverAlt)}" fetchpriority="high" onerror="this.closest('figure').remove()"></figure>` : ''}<div class="reading-grid">${tocHtml}<div>${takeawaysHtml}<div class="body" id="article-body">${articleBody}</div></div></div>${faqHtml}<section class="article-cta"><div><p class="eyebrow">PUT THE IDEAS TO WORK</p><h2>Ready for a clearer next step?</h2><p>Talk with clicksable. about building a growth system that fits your business.</p></div><a href="/#business">Explore business growth <span>↗</span></a></section></article>${relatedHtml}<p class="back-link"><a href="/learning/">← Back to the Learning Center</a></p></main><footer class="universal-footer"><div class="universal-footer-inner"><div class="universal-footer-top"><div class="universal-brand-block"><a class="universal-brand" href="/">click<span>sable.</span></a><p>Distribution systems for creators and businesses building their next chapter of growth.</p><a class="universal-contact" href="mailto:hello@clicksable.com">hello@clicksable.com</a></div><div class="universal-link-group"><h2>Solutions</h2><a href="/creator/">For creators</a><a href="/business/">For businesses</a><a href="/learning/">Learning Center</a></div><div class="universal-link-group"><h2>Company</h2><a href="/company/">About us</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div><div class="universal-link-group universal-office-group"><h2>Global offices</h2><p><strong>Dubai · Head office</strong><span>Iris Bay, Business Bay, Dubai, United Arab Emirates</span></p><p><strong>Muscat</strong><span>WEmeet Oman, Mall of Oman, Level 1, Muscat, Oman</span></p><p><strong>London</strong><span>69 Old Broad St, London EC2M 1QS, United Kingdom</span></p><p><strong>Islamabad</strong><span>Office: I-9 Sector, I-9/3, Islamabad, Pakistan</span></p><p><strong>New York</strong><span>31 Hudson Yards, 11th Floor, New York, NY 10001, United States</span></p></div></div><div class="universal-footer-cta"><div><span>READY WHEN YOU ARE</span><strong>Make your next move<br><em>more visible.</em></strong></div><div class="universal-cta-actions"><a href="/creator/">I’m a creator <b>→</b></a><a href="/business/">I’m a business <b>→</b></a></div></div><div class="universal-footer-bottom"><span>© ${new Date().getUTCFullYear()} clicksable. The Distribution Engine.</span><span>Dubai · Muscat · London · Islamabad · New York</span><a href="/">Back to clicksable. ↑</a></div></div></footer><script>document.querySelector('.menu-toggle')?.addEventListener('click',event=>{const button=event.currentTarget,nav=document.getElementById(button.getAttribute('aria-controls'));const open=nav.classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));});document.querySelectorAll('.site-nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelector('.site-nav')?.classList.remove('is-open');document.querySelector('.menu-toggle')?.setAttribute('aria-expanded','false')}));document.querySelectorAll('.toc a').forEach(link=>link.addEventListener('click',event=>{const target=document.querySelector(link.getAttribute('href'));if(target){event.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});history.replaceState(null,'',link.getAttribute('href'))}}));</script></body></html>`;
  const target = path.join(outputRoot, 'learning', article.slug, 'index.html');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, html);
  articlePages.push({ url: articleUrl(article.slug), lastmod: modifiedIso || publishedIso, canonicalIsLocal: new URL(canonical).origin === siteUrl });
}

// Make the listing's initial HTML crawlable even before the browser hydrates Supabase.
const cards = articles.filter(a => validSlug(a.slug)).map(a => `<article class="article-card"><div class="article-card-body"><div class="article-meta"><time datetime="${esc(a.published_at)}">${esc(dateText(a.published_at))}</time><span>·</span><span>${esc(a.category || 'Insights')}</span></div><h3><a href="/learning/${encodeURIComponent(a.slug)}/">${esc(a.title)}</a></h3><p>${esc(a.excerpt)}</p></div></article>`).join('');
const listingTarget = path.join(outputRoot, 'learning', 'index.html');
let listingHtml = await fs.readFile(listingTarget, 'utf8');
listingHtml = listingHtml.replace(/<!-- ARTICLES_START -->[\s\S]*?<!-- ARTICLES_END -->/, `<!-- ARTICLES_START -->${cards || '<div class="empty">New articles are coming soon.</div>'}<!-- ARTICLES_END -->`);
await fs.writeFile(listingTarget, listingHtml);

const xmlEsc = value => esc(value).replace(/&#39;/g, '&apos;');
const rssItems = articles.filter(a => validSlug(a.slug)).map(a => `<item><title>${xmlEsc(a.title)}</title><link>${xmlEsc(articleUrl(a.slug))}</link><guid isPermaLink="true">${xmlEsc(articleUrl(a.slug))}</guid><pubDate>${new Date(a.published_at).toUTCString()}</pubDate><category>${xmlEsc(a.category || 'Insights')}</category><description>${xmlEsc(a.excerpt || '')}</description></item>`).join('');
const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>clicksable. Learning Center</title><link>${siteUrl}/learning/</link><description>Ideas on creator growth, AI visibility, and building durable digital businesses.</description><language>en</language>${rssItems}</channel></rss>\n`;
await fs.writeFile(path.join(outputRoot, 'learning', 'feed.xml'), rss);

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
