import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputRoot = path.resolve(process.argv[2] || root);
const articleStyles = await fs.readFile(path.join(root, 'learning', 'article.css'), 'utf8');
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
const safeLinkUrl = value => {
  const text = String(value ?? '').trim();
  if (/^mailto:/i.test(text)) {
    try { const parsed = new URL(text); return parsed.protocol === 'mailto:' && /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(parsed.pathname) ? parsed.href : ''; }
    catch { return ''; }
  }
  return safeUrl(text);
};const safeImageUrl = value => {
  const url = safeUrl(value);
  if (!url) return '';
  const parsed = new URL(url);
  return parsed.origin === siteUrl && parsed.pathname.startsWith('/hq/') ? '' : url;
};
const materializeInlineImages = async (html, slug) => {
  let output = String(html || ''), index = 0;
  const sources = [...output.matchAll(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
    .map(match => match[1] ?? match[2]).filter(src => /^data:image\/(?:png|jpeg|webp|avif);base64,/i.test(src));
  for (const source of sources) {
    const match = source.match(/^data:image\/(png|jpeg|webp|avif);base64,([A-Za-z0-9+/]+={0,2})$/i);
    if (!match) continue;
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) continue;
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    const name = `inline-${String(++index).padStart(2, '0')}.${ext}`;
    const directory = path.join(outputRoot, 'learning', slug, 'media');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, name), bytes);
    output = output.split(source).join(`${siteUrl}/learning/${encodeURIComponent(slug)}/media/${name}`);
  }
  return output;
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
  const safeColor = color => /^(?:#[\da-f]{3,4}(?:[\da-f]{3,4})?|(?:rgb|rgba|hsl|hsla)\([\d.%+\-,\s/]+\)|[a-z]+)$/i.test(String(color||'').trim()) ? String(color).trim() : '';
  const safeInlineStyle = value => String(value||'').split(';').map(part=>{const i=part.indexOf(':');if(i<0)return '';const property=part.slice(0,i).trim().toLowerCase(),raw=part.slice(i+1).trim();if(['color','background-color','border-color'].includes(property)){const color=safeColor(raw);return color?`${property}: ${color}`:'';}if(property==='text-align'&&/^(left|right|center|justify|start|end)$/i.test(raw))return `${property}: ${raw.toLowerCase()}`;if(property==='vertical-align'&&/^(top|middle|bottom|baseline|sub|super)$/i.test(raw))return `${property}: ${raw.toLowerCase()}`;return '';}).filter(Boolean).join('; ');
  const allowed = new Set(['p', 'br', 'div', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'blockquote', 'a', 'hr', 'code', 'pre', 'figure', 'figcaption', 'img', 'table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td']);
  const voidTags = new Set(['br', 'hr', 'img']);
  const dropContent = new Set(['script', 'style', 'iframe', 'svg', 'math', 'object', 'template']);
  const raw = String(value || '');
  const source = /&lt;\/?(?:p|div|h[2-4]|ul|ol|li|blockquote|strong|b|em|i|u|s|del|a|hr|code|pre|figure|figcaption|img|table|caption|thead|tbody|tr|th|td)\b/i.test(raw) ? decodeArticleMarkup(raw) : raw;
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
    if (closing) { if (name === 'div') output.push('</p>'); else if (!voidTags.has(name)) output.push(`</${name}>`); continue; }
    if (name === 'div') { output.push('<p>'); continue; }
    const styleAttr = token.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const style = safeInlineStyle(styleAttr?.[1] ?? styleAttr?.[2] ?? styleAttr?.[3] ?? '');
    if (name === 'a') {
      const attr = token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = safeLinkUrl((attr?.[1] ?? attr?.[2] ?? attr?.[3] ?? '').replace(/&amp;/gi, '&'));
      output.push('<a' + (href ? ' href="' + esc(href) + '" rel="noopener noreferrer"' : '') + (style ? ' style="' + esc(style) + '"' : '') + '>');
    } else if (name === 'img') {
      const srcAttr = token.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const altAttr = token.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const src = safeImageUrl((srcAttr?.[1] ?? srcAttr?.[2] ?? srcAttr?.[3] ?? '').replace(/&amp;/gi, '&'));
      const alt = (altAttr?.[1] ?? altAttr?.[2] ?? altAttr?.[3] ?? '').slice(0, 180);
      if (src) output.push('<img src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy">');
    } else if (name === 'th') output.push('<th scope="col"' + (style ? ' style="' + esc(style) + '"' : '') + '>');
    else if (name === 'td') output.push('<td' + (style ? ' style="' + esc(style) + '"' : '') + '>');
    else output.push('<' + name + (style ? ' style="' + esc(style) + '"' : '') + '>');
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
  const title = String(article.seo_title || article.title || 'Learning Center article')
    .trim()
    .replace(/\s*[|–—-]\s*clicksable\.\s*$/i, '')
    .slice(0, 180);
  const description = String(article.seo_description || article.excerpt || '').trim().slice(0, 320);
  const cover = safeImageUrl(article.cover_image_url);
  const published = new Date(article.published_at);
  const modified = new Date(article.updated_at || article.published_at);
  const publishedIso = Number.isNaN(published.getTime()) ? '' : published.toISOString();
  const modifiedIso = Number.isNaN(modified.getTime()) ? publishedIso : modified.toISOString();
  const faqs = faqFor(article).filter(f => !/^question$/i.test(String(f.question || '').trim()) && !/^answer$/i.test(String(f.answer || '').trim()));
  const takeaways = Array.isArray(article.key_takeaways) ? article.key_takeaways.map(item => String(item || '').trim().replace(/^-\s*/, '')).filter(item => item && !/^key takeaways$/i.test(item)).slice(0, 8) : [];
  const author = String(article.author_name || 'clicksable.').trim();
  const authorRole = String(article.author_role || '').trim();
  const avatar = safeImageUrl(article.author_avatar_url);
  const authorMark = esc(author.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toLowerCase() || 'c.');
  const takeawaysHtml = takeaways.length ? `<section class="takeaways"><p class="eyebrow">THE SHORT VERSION</p><h2>Key takeaways</h2><ul>${takeaways.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>` : '';
  const coverAlt = String(article.cover_image_alt || article.title || '').trim();
  const faqHtml = faqs.length ? `<section class="faq"><h2>Common questions</h2>${faqs.map(f => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join('')}</section>` : '';
  let headingIndex = 0;
  const bodyWithPublishedImages = await materializeInlineImages(article.body_html, article.slug);
  let articleBody = cleanBody(bodyWithPublishedImages)
    .replace(/<p[^>]*>\s*Missing information that would make this stronger\s*<\/p>[\s\S]*$/i, '')
    .replace(/<h2>([\s\S]*?)<\/h2>/gi, (match, inner) => {
    const label = inner.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const id = `${label.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'}-${++headingIndex}`;
    return `<h2 id="${esc(id)}">${inner}</h2>`;
  });
  // Promote short standalone labels from plain-text drafts into real sections.
  // Tables are temporarily protected so labels inside cells stay as cell text.
  const savedTables = [];
  articleBody = articleBody.replace(/<table\b[\s\S]*?<\/table>/gi, table => {
    const token = `LEARNINGTABLE${savedTables.length}TOKEN`;
    savedTables.push(table);
    return token;
  }).replace(/<p>([\s\S]*?)<\/p>/gi, (paragraph, inner) => {
    const label = inner.replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|#39);/g, ' ').trim();
    const words = label.split(/\s+/).filter(Boolean);
    if (label.length < 4 || label.length > 88 || words.length > 12 || /[.!?;:]$/.test(label) || /^(?:figure|table)\s+\d/i.test(label) || /^\d+[.)]/.test(label)) return paragraph;
    return `<h2>${inner}</h2>`;
  });
  savedTables.forEach((table, index) => { articleBody = articleBody.replace(`LEARNINGTABLE${index}TOKEN`, table); });
  headingIndex = 0;
  articleBody = articleBody.replace(/<h2>([\s\S]*?)<\/h2>/gi, (match, inner) => {
    const label = inner.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const id = `${label.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'}-${++headingIndex}`;
    return `<h2 id="${esc(id)}">${inner}</h2>`;
  });
  const tocItems = [...articleBody.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/gi)];
  const tocHtml = tocItems.length ? `<aside class="toc"><p class="toc-title">IN THIS ARTICLE</p><nav aria-label="Article contents">${tocItems.map(([, id, label]) => `<a href="#${esc(id)}">${esc(label.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&'))}</a>`).join('')}</nav></aside>` : '';
  const wordCount = articleBody.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.ceil(wordCount / 220));
  // Weave links within a topic cluster first, then fall back to recent posts.
  const topicTokens = value => String(value || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const currentTopics = new Set([article.category, ...(Array.isArray(article.tags) ? article.tags : [])].flatMap(topicTokens));
  const related = articles.filter(item => item.slug !== article.slug && validSlug(item.slug))
    .map((item, index) => ({ item, index, score: [item.category, ...(Array.isArray(item.tags) ? item.tags : [])].flatMap(topicTokens).reduce((sum, token) => sum + Number(currentTopics.has(token)), 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 3).map(entry => entry.item);
  const relatedHtml = related.length ? `<section class="related"><div class="related-heading"><p class="eyebrow">KEEP EXPLORING</p><h2>More ideas for what comes next.</h2></div><div class="related-grid">${related.map(item => `<a class="related-card" href="/learning/${encodeURIComponent(item.slug)}/"><span>${esc(item.category || 'Insights')}</span><strong>${esc(item.title)}</strong><small>Read article ↗</small></a>`).join('')}</div></section>` : '';
  const categoryText = `${article.category || ''} ${(Array.isArray(article.tags) ? article.tags : []).join(' ')}`.toLowerCase();
  const creatorTopic = /creator|audience|monetiz|brand deal|influenc/.test(categoryText);
  const serviceHref = creatorTopic ? '/creator/' : '/business/';
  const serviceName = creatorTopic ? 'Creator growth' : 'AI visibility';
  const serviceDescription = creatorTopic ? 'Build an offer and a revenue path around the audience you have earned.' : 'Make your business and expertise clearer to buyers searching with AI.';
  const authorIsOrganization = /^clicksable\.?$/i.test(author);
  const structuredAuthor = authorIsOrganization
    ? { '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: 'clicksable.' }
    : { '@type': 'Person', name: author, ...(authorRole ? { jobTitle: authorRole } : {}), ...(avatar ? { image: avatar } : {}) };
  const structured = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', '@id': `${canonical}#article`, headline: article.title,
    description, datePublished: publishedIso, dateModified: modifiedIso,
    author: structuredAuthor,
    publisher: { '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: 'clicksable.' },
    mainEntityOfPage: { '@id': canonical },
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
<meta name="theme-color" content="#f7f5ed"><link rel="icon" type="image/svg+xml" href="/assets/clicksable-pointer.svg?v=4"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>${faqStructured ? `<script type="application/ld+json">${JSON.stringify(faqStructured).replace(/</g, '\\u003c')}</script>` : ''}
<style>${articleStyles}</style></head>
<body><header class="topbar"><a class="brand" href="/">click<span>sable.</span></a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="learning-site-nav">Menu</button><nav class="site-nav" id="learning-site-nav" aria-label="Main navigation"><a href="/">Home</a><a href="/creator/">For creators</a><a href="/business/">For businesses</a><a href="/company/">Company</a><a href="/learning/" aria-current="page">Learning Center</a></nav></header><main class="shell article-shell"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/learning/">Learning Center</a><span>/</span><span>${esc(article.category || 'Insights')}</span></nav><article><header class="story-hero"><div class="story-tools"><p class="eyebrow">${esc(article.category || 'Insights')}</p><button class="copy-link" type="button" onclick="navigator.clipboard.writeText(location.href).then(()=>{this.textContent='Link copied'})">Copy link ↗</button></div><h1>${esc(article.title)}</h1><p class="deck">${esc(article.excerpt)}</p><div class="story-meta">${avatar ? `<img class="author-avatar" src="${esc(avatar)}" alt="" onerror="this.remove()">` : `<span class="author-mark">${authorMark}</span>`}<span><strong>${esc(author)}</strong><small>${esc(authorRole)}</small></span><span class="meta-spacer"></span><span>${esc(dateText(article.published_at))}<small>${readMinutes} min read</small></span></div></header>${cover ? `<figure class="cover-frame"><img class="cover" src="${esc(cover)}" alt="${esc(coverAlt)}" fetchpriority="high" onerror="this.closest('figure').remove()"></figure>` : ''}<div class="reading-grid${tocHtml ? '' : ' reading-grid-no-toc'}">${tocHtml}<div>${takeawaysHtml}<div class="body" id="article-body">${articleBody}</div></div></div>${faqHtml}<section class="article-cta"><div><p class="eyebrow">PUT THE IDEAS TO WORK</p><h2>Ready for a clearer next step?</h2><p>${esc(serviceDescription)}</p></div><a href="${serviceHref}">Explore ${esc(serviceName)} <span>↗</span></a></section></article>${relatedHtml}<p class="back-link"><a href="/learning/">← Back to the Learning Center</a></p></main><footer class="universal-footer"><div class="universal-footer-inner"><div class="universal-footer-top"><div class="universal-brand-block"><a class="universal-brand" href="/">click<span>sable.</span></a><p>Distribution systems for creators and businesses building their next chapter of growth.</p><a class="universal-contact" href="mailto:hello@clicksable.com">hello@clicksable.com</a></div><div class="universal-link-group"><h2>Solutions</h2><a href="/creator/">For creators</a><a href="/business/">For businesses</a><a href="/learning/">Learning Center</a></div><div class="universal-link-group"><h2>Company</h2><a href="/company/">About us</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/sitemap/">HTML sitemap</a><a href="/ai-info/">AI information</a><a href="/entity-map.html">Entity map</a></div><div class="universal-link-group universal-office-group"><h2>Global offices</h2><p><strong>Dubai · Head office</strong><span>Iris Bay, Business Bay, Dubai, United Arab Emirates</span></p><p><strong>Muscat</strong><span>WEmeet Oman, Mall of Oman, Level 1, Muscat, Oman</span></p><p><strong>London</strong><span>69 Old Broad St, London EC2M 1QS, United Kingdom</span></p><p><strong>Islamabad</strong><span>Office: I-9 Sector, I-9/3, Islamabad, Pakistan</span></p><p><strong>New York</strong><span>31 Hudson Yards, 11th Floor, New York, NY 10001, United States</span></p></div></div><div class="universal-footer-cta"><div><span>READY WHEN YOU ARE</span><strong>Make your next move<br><em>more visible.</em></strong></div><div class="universal-cta-actions"><a href="/creator/">I’m a creator <b>→</b></a><a href="/business/">I’m a business <b>→</b></a></div></div><div class="universal-footer-bottom"><span>© ${new Date().getUTCFullYear()} clicksable. The Distribution Engine.</span><span>Dubai · Muscat · London · Islamabad · New York</span><a href="/">Back to clicksable. ↑</a></div></div></footer><script>document.querySelector('.menu-toggle')?.addEventListener('click',event=>{const button=event.currentTarget,nav=document.getElementById(button.getAttribute('aria-controls'));const open=nav.classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));});document.querySelectorAll('.site-nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelector('.site-nav')?.classList.remove('is-open');document.querySelector('.menu-toggle')?.setAttribute('aria-expanded','false')}));document.querySelectorAll('.toc a').forEach(link=>link.addEventListener('click',event=>{const target=document.querySelector(link.getAttribute('href'));if(target){event.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});history.replaceState(null,'',link.getAttribute('href'))}}));</script></body></html>`;
  const target = path.join(outputRoot, 'learning', article.slug, 'index.html');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, html.replace('</head>', '<script src="/assets/clicksable-pointer-contrast.js?v=2" defer></script></head>'));
  await fs.writeFile(path.join(path.dirname(target), 'publish-ready.json'), JSON.stringify({
    slug: article.slug,
    title: article.title,
    published_at: publishedIso,
    generated_at: new Date().toISOString(),
  }) + '\n');
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
  { url: `${siteUrl}/learning/`, lastmod: articlePages
    .filter(page => page.canonicalIsLocal)
    .map(page => page.lastmod)
    .filter(Boolean)
    .sort()
    .at(-1) },
  { url: `${siteUrl}/ai-info/` },
  { url: `${siteUrl}/entity-map.html` },
  { url: `${siteUrl}/sitemap/` },
  { url: `${siteUrl}/privacy.html` },
  { url: `${siteUrl}/terms.html` },
  ...articlePages.filter(page => page.canonicalIsLocal),
];
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(entry => `  <url><loc>${esc(entry.url)}</loc>${entry.lastmod ? `<lastmod>${esc(entry.lastmod.slice(0, 10))}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
await fs.writeFile(path.join(outputRoot, 'sitemap.xml'), xml);
const robots = `# Google Search access.
User-agent: Googlebot
Allow: /

# Gemini access controls. Google-Extended governs use in Gemini and other
# Google AI products; Google-GeminiNotebook covers user-submitted sources.
User-agent: Google-Extended
Allow: /

User-agent: Google-GeminiNotebook
Allow: /

# OpenAI crawlers. Search visibility, training use, and user-triggered fetches
# have separate tokens and remain explicitly allowed.
User-agent: OAI-SearchBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

# Other search and AI crawlers already permitted.
User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: bingbot
Allow: /

# Explicitly permit user-requested page fetches.
User-agent: Google-Agent
Allow: /

User-agent: Perplexity-User
Allow: /

# Allow all other crawlers to discover public pages.
User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
# Factual service and source directory: ${siteUrl}/llms.txt
`;
await fs.writeFile(path.join(outputRoot, 'robots.txt'), robots);

const oneLine = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const llmsLines = [
  '# clicksable.',
  '',
  '> clicksable helps creators build revenue from their audiences and helps businesses build a clearer, more credible presence in AI search.',
  '',
  '## Core pages',
  `- [Home](${siteUrl}/): Overview of Clicksable’s creator and business growth services.`,
  `- [For creators](${siteUrl}/creator/): Creator Engine service for turning audience attention into owned revenue.`,
  `- [For businesses](${siteUrl}/business/): AI Visibility service for businesses that want to be easier for buyers and AI search systems to understand.`,
  `- [Company](${siteUrl}/company/): Clicksable’s mission, working principles, office locations, and contact details.`,
  `- [Contact](${siteUrl}/company/#about-contact): Contact Clicksable at hello@clicksable.com or begin a project enquiry.`,
  `- [AI information](${siteUrl}/ai-info/): Factual overview of Clicksable and its services with links to source pages.`,
  `- [Entity map](${siteUrl}/entity-map.html): Company identity, service descriptions, locations, and structured data.`,
  '',
  '## Learning Center',
  `- [Learning Center](${siteUrl}/learning/): Articles about creator growth, AI visibility, and durable digital businesses.`,
  ...articles.filter(article => validSlug(article.slug)).map(article => `- [${oneLine(article.title)}](${articleUrl(article.slug)}): ${oneLine(article.excerpt) || 'Learning Center article.'}`),
  '',
  '## Site information',
  `- [HTML sitemap](${siteUrl}/sitemap/): Human-readable list of important public pages and published Learning Center articles.`,
  `- [Privacy Notice](${siteUrl}/privacy.html): How Clicksable handles information submitted through the website and portals.`,
  `- [Terms of Use](${siteUrl}/terms.html): Terms for using the Clicksable website, forms, and Creator Reward portal.`,
  ''
];
await fs.writeFile(path.join(outputRoot, 'llms.txt'), `${llmsLines.join('\n')}\n`);

const sitemapLinks = [
  ['Home', `${siteUrl}/`, 'Overview of Clicksable’s creator and business growth services.'],
  ['For creators', `${siteUrl}/creator/`, 'Creator Engine: turn audience attention into owned revenue.'],
  ['For businesses', `${siteUrl}/business/`, 'AI Visibility: build a clearer, more credible presence in AI search.'],
  ['Company', `${siteUrl}/company/`, 'Mission, working principles, office locations, and contact details.'],
  ['Learning Center', `${siteUrl}/learning/`, 'Articles on creator growth, AI visibility, and digital business building.'],
  ['AI information', `${siteUrl}/ai-info/`, 'Factual overview of Clicksable and its services.'],
  ['Entity map', `${siteUrl}/entity-map.html`, 'Company identity, service descriptions, and office locations.'],
  ['Privacy Notice', `${siteUrl}/privacy.html`, 'How Clicksable handles submitted information.'],
  ['Terms of Use', `${siteUrl}/terms.html`, 'Terms for the website, forms, and Creator Reward portal.']
];
const sitemapPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="index,follow"><title>HTML Sitemap | clicksable.</title><meta name="description" content="Browse important public Clicksable pages and published Learning Center articles."><link rel="canonical" href="${siteUrl}/sitemap/"><style>body{margin:0;background:#f7f5ed;color:#171a14;font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}.wrap{width:min(900px,calc(100% - 40px));margin:auto;padding:56px 0 84px}nav{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:80px}.brand{font-size:24px;font-weight:850;letter-spacing:-.06em;color:#fff;background:#294719;border-radius:11px;padding:5px 12px;text-decoration:none}.brand span{color:#c8ff00}nav a:last-child{color:#294719;font-weight:700;text-decoration:none}h1{font-size:clamp(44px,8vw,76px);line-height:.95;letter-spacing:-.075em;margin:0 0 20px}p{color:#5d635a;max-width:620px}h2{margin:62px 0 18px;font-size:25px;letter-spacing:-.04em}.links{display:grid;gap:12px}.item{display:block;padding:20px 22px;border:1px solid rgba(23,26,20,.13);border-radius:16px;background:#fffdf8;color:#171a14;text-decoration:none}.item:hover{border-color:#294719}.item strong{display:block;font-size:18px}.item span{display:block;margin-top:3px;color:#5d635a;font-size:14px}.footer{margin-top:70px;padding-top:20px;border-top:1px solid rgba(23,26,20,.13);color:#5d635a;font-size:13px}@media(max-width:560px){.wrap{width:calc(100% - 32px);padding-top:28px}nav{margin-bottom:56px}}</style></head><body><main class="wrap"><nav><a class="brand" href="/">click<span>sable.</span></a><a href="/learning/">Learning Center</a></nav><h1>Browse<br>clicksable.</h1><p>Important public pages and published Learning Center articles.</p><h2>Website</h2><div class="links">${sitemapLinks.map(([title, url, description]) => `<a class="item" href="${esc(url)}"><strong>${esc(title)}</strong><span>${esc(description)}</span></a>`).join('')}</div><h2>Published articles</h2><div class="links">${articles.filter(article => validSlug(article.slug)).map(article => `<a class="item" href="${esc(articleUrl(article.slug))}"><strong>${esc(article.title)}</strong><span>${esc(oneLine(article.excerpt) || 'Learning Center article.')}</span></a>`).join('') || '<p>No articles have been published yet.</p>'}</div><p class="footer">© ${new Date().getUTCFullYear()} clicksable.</p></main></body></html>`;
await fs.mkdir(path.join(outputRoot, 'sitemap'), { recursive: true });
await fs.writeFile(path.join(outputRoot, 'sitemap', 'index.html'), sitemapPage);
console.log(`Generated ${articlePages.length} article pages and sitemap with ${entries.length} URLs.`);
