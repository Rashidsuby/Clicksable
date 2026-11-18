const SITE_URL = 'https://clicksable.com';
const ARTICLE_STYLES = __ARTICLE_STYLES__;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeUrl = value => {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};
const safeLink = value => /^mailto:[^\s@/]+@[^\s@/]+\.[^\s@/]+$/i.test(String(value || '').trim()) ? String(value).trim() : safeUrl(value);
const safeColor = value => { const color=String(value||'').trim(); return /^(?:#[\da-f]{3,4}(?:[\da-f]{3,4})?|(?:rgb|rgba|hsl|hsla)\([\d.%+\-,\s/]+\)|[a-z]+)$/i.test(color) ? color : ''; };
const safeInlineStyle = value => String(value||'').split(';').map(part=>{const i=part.indexOf(':');if(i<0)return '';const property=part.slice(0,i).trim().toLowerCase(),raw=part.slice(i+1).trim();if(['color','background-color','border-color'].includes(property)){const color=safeColor(raw);return color?`${property}: ${color}`:'';}if(property==='text-align'&&/^(left|right|center|justify|start|end)$/i.test(raw))return `${property}: ${raw.toLowerCase()}`;if(property==='vertical-align'&&/^(top|middle|bottom|baseline|sub|super)$/i.test(raw))return `${property}: ${raw.toLowerCase()}`;return '';}).filter(Boolean).join('; ');
const validSlug = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120;
const articleUrl = slug => `${SITE_URL}/learning/${encodeURIComponent(slug)}/`;
const dateText = value => new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value));

const decodeArticleMarkup = value => String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, entity => {
  const key = entity.slice(1, -1).toLowerCase();
  if (key[0] === '#') {
    const code = key[1] === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" })[key] || entity;
});

function cleanBody(value) {
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
    const match = token.match(/^<\/?\s*([a-zA-Z0-9-]+)/);
    if (!match) { if (!blocked) output.push(token === '<' ? '&lt;' : token); continue; }
    const tag = match[1].toLowerCase();
    const closing = /^<\//.test(token);
    if (dropContent.has(tag)) { blocked = closing ? Math.max(0, blocked - 1) : blocked + 1; continue; }
    if (blocked || !allowed.has(tag)) continue;
    if (closing) { if (tag === 'div') output.push('</p>'); else if (!voidTags.has(tag)) output.push(`</${tag}>`); continue; }
    if (tag === 'div') { output.push('<p>'); continue; }
    const styleAttr = token.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const style = safeInlineStyle(styleAttr?.[1] ?? styleAttr?.[2] ?? styleAttr?.[3] ?? '');
    if (tag === 'a') {
      const href = token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const url = safeLink((href?.[1] ?? href?.[2] ?? href?.[3] ?? '').replace(/&amp;/gi, '&'));
      output.push(`<a${url ? ` href="${esc(url)}" rel="noopener noreferrer"` : ''}${style ? ` style="${esc(style)}"` : ''}>`);
    } else if (tag === 'img') {
      const src = token.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const alt = token.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const url = safeUrl((src?.[1] ?? src?.[2] ?? src?.[3] ?? '').replace(/&amp;/gi, '&'));
      if (url) output.push(`<img src="${esc(url)}" alt="${esc(alt?.[1] ?? alt?.[2] ?? alt?.[3] ?? '')}" loading="lazy">`);
    } else if (tag === 'th') output.push(`<th scope="col"${style ? ` style="${esc(style)}"` : ''}>`);
    else if (tag === 'td') output.push(`<td${style ? ` style="${esc(style)}"` : ''}>`);
    else output.push(`<${tag}${style ? ` style="${esc(style)}"` : ''}>`);
  }
  return output.join('');
}

function articleBody(value) {
  const tables = [];
  let body = cleanBody(value).replace(/<table\b[\s\S]*?<\/table>/gi, table => {
    const token = `LEARNINGTABLE${tables.length}TOKEN`;
    tables.push(table);
    return token;
  }).replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (paragraph, inner) => {
    const label = inner.replace(/<[^>]*>/g, '').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").trim();
    const words = label.split(/\s+/).filter(Boolean);
    if (label.length < 4 || label.length > 88 || words.length > 12 || /[.!?;:]$/.test(label) || /^(?:figure|table)\s+\d/i.test(label) || /^\d+[.)]/.test(label)) return paragraph;
    return `<h2>${inner}</h2>`;
  }).replace(/<span\b[^>]*>([\s\S]*?)<\/span>/gi, (span, inner, offset, source) => {
    const before = source.slice(0, offset).trimEnd();
    const after = source.slice(offset + span.length).trimStart();
    const standalone = (!before || /<\/(?:p|h[2-4]|li|blockquote|figure)>$/i.test(before))
      && (!after || /^(?:<(?:p|h[2-4]|ul|ol|li|table|figure|blockquote|hr)\b|<\/(?:div|body|article)>)/i.test(after));
    const label = inner.replace(/<[^>]*>/g, '').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").trim();
    const words = label.split(/\s+/).filter(Boolean);
    if (!standalone || label.length < 4 || label.length > 88 || words.length > 12 || /[.!?;:]$/.test(label) || /^(?:figure|table)\s+\d/i.test(label) || /^\d+[.)]/.test(label)) return span;
    return `<h2>${inner}</h2>`;
  });
  tables.forEach((table, index) => { body = body.replace(`LEARNINGTABLE${index}TOKEN`, table); });
  let index = 0;
  return body.replace(/<h2>([\s\S]*?)<\/h2>/gi, (_match, label) => {
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

function renderArticle(article, sharedStyles) {
  const slug = article.slug;
  const title = String(article.seo_title || article.title || 'Learning Center article')
    .trim()
    .replace(/\s*[|–—-]\s*clicksable\.?\s*$/i, '')
    .slice(0, 180);
  const description = String(article.seo_description || article.excerpt || '').trim().slice(0, 320);
  const canonicalInput = safeUrl(article.canonical_url);
  const canonicalParsed = canonicalInput ? new URL(canonicalInput) : null;
  const canonical = canonicalParsed?.origin === SITE_URL && canonicalParsed.pathname.startsWith('/hq/') ? articleUrl(slug) : canonicalInput || articleUrl(slug);
  const cover = safeUrl(article.cover_image_url);
  const author = String(article.author_name || 'Clicksable').trim();
  const role = String(article.author_role || '').trim();
  const avatar = safeUrl(article.author_avatar_url);
  const body = articleBody(article.body_html);
  const takeaways = Array.isArray(article.key_takeaways) ? article.key_takeaways.filter(Boolean).slice(0, 8) : [];
  const faqs = Array.isArray(article.geo_faq) ? article.geo_faq.filter(item => item?.question && item?.answer).slice(0, 30) : [];
  const headings = [...body.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/gi)];
  const tocLinks = headings.map(([, id, label]) => `<a href="#${esc(id)}">${esc(label.replace(/<[^>]*>/g, ''))}</a>`);
  if (faqs.length) tocLinks.push('<a href="#common-questions">Common questions</a>');
  const toc = tocLinks.length ? `<aside class="toc"><p class="toc-title">IN THIS ARTICLE</p><nav aria-label="Article contents">${tocLinks.join('')}</nav></aside>` : '';
  const takeawaysHtml = takeaways.length ? `<section class="takeaways"><p class="eyebrow">THE SHORT VERSION</p><h2>Key takeaways</h2><ul>${takeaways.map(item => `<li>${esc(item)}</li>`).join('')}</ul></section>` : '';
  const faqHtml = faqs.length ? `<section class="faq"><h2 id="common-questions">Common questions</h2>${faqs.map(item => `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('')}</section>` : '';
  const authorMark = esc(author.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toLowerCase() || 'c.');
  const wordCount = body.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.ceil(wordCount / 220));
  const topic = `${article.category || ''} ${(Array.isArray(article.tags) ? article.tags : []).join(' ')}`.toLowerCase();
  const creatorTopic = /creator|audience|monetiz|brand deal|influenc/.test(topic);
  const serviceHref = creatorTopic ? '/creator/' : '/business/';
  const serviceName = creatorTopic ? 'Creator growth' : 'AI visibility';
  const serviceDescription = creatorTopic ? 'Build an offer and a revenue path around the audience you have earned.' : 'Make your business and expertise clearer to buyers searching with AI.';
  const schema = { '@context': 'https://schema.org', '@type': 'BlogPosting', '@id': `${canonical}#article`, headline: article.title, description, datePublished: article.published_at, dateModified: article.updated_at || article.published_at, author: { '@type': /^clicksable\.?$/i.test(author) ? 'Organization' : 'Person', name: author, ...(role ? { jobTitle: role } : {}), ...(avatar ? { image: avatar } : {}) }, publisher: { '@type': 'Organization', name: 'clicksable.', '@id': `${SITE_URL}/#organization` }, mainEntityOfPage: canonical, ...(cover ? { image: [cover] } : {}) };
  const faqSchema = faqs.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) } : null;
  const universalFooter = `<footer class="universal-footer"><div class="universal-footer-inner"><div class="universal-footer-top"><div class="universal-brand-block"><a class="universal-brand" href="/">click<span>sable.</span></a><p>Distribution systems for creators and businesses building their next chapter of growth.</p><a class="universal-contact" href="mailto:hello@clicksable.com">hello@clicksable.com</a></div><div class="universal-link-group"><h2>Solutions</h2><a href="/creator/">For creators</a><a href="/business/">For businesses</a><a href="/learning/">Learning Center</a></div><div class="universal-link-group"><h2>Company</h2><a href="/company/">About us</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/sitemap/">HTML sitemap</a><a href="/ai-info/">AI information</a><a href="/entity-map.html">Entity map</a></div><div class="universal-link-group universal-office-group"><h2>Global offices</h2><p><strong>Dubai · Head office</strong><span>Iris Bay, Business Bay, Dubai, United Arab Emirates</span></p><p><strong>Muscat</strong><span>WEmeet Oman, Mall of Oman, Level 1, Muscat, Oman</span></p><p><strong>London</strong><span>69 Old Broad St, London EC2M 1QS, United Kingdom</span></p><p><strong>Islamabad</strong><span>Office: I-9 Sector, I-9/3, Islamabad, Pakistan</span></p><p><strong>New York</strong><span>31 Hudson Yards, 11th Floor, New York, NY 10001, United States</span></p></div></div><div class="universal-footer-cta"><div><span>READY WHEN YOU ARE</span><strong>Make your next move<br><em>more visible.</em></strong></div><div class="universal-cta-actions"><a href="/creator/">I’m a creator <b>→</b></a><a href="/business/">I’m a business <b>→</b></a></div></div><div class="universal-footer-bottom"><span>© ${new Date().getUTCFullYear()} clicksable. The Distribution Engine.</span><span>Dubai · Muscat · London · Islamabad · New York</span><a href="/">Back to clicksable. ↑</a></div></div></footer>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | clicksable.</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="article"><meta property="og:site_name" content="clicksable."><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">${cover ? `<meta property="og:image" content="${esc(cover)}">` : ''}<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>${faqSchema ? `<script type="application/ld+json">${JSON.stringify(faqSchema).replace(/</g, '\\u003c')}</script>` : ''}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.gstatic.com" rel="preconnect" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>${sharedStyles}</style></head><body><header class="topbar"><a class="brand" href="/">click<span>sable.</span></a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="learning-site-nav">Menu</button><nav class="site-nav" id="learning-site-nav" aria-label="Main navigation"><a href="/">Home</a><a href="/creator/">For creators</a><a href="/business/">For businesses</a><a href="/company/">Company</a><a href="/learning/" aria-current="page">Learning Center</a></nav></header><main class="shell article-shell"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/learning/">Learning Center</a><span>/</span><span>${esc(article.category || 'Insights')}</span></nav><article><header class="story-hero"><div class="story-tools"><p class="eyebrow">${esc(article.category || 'Insights')}</p><button class="copy-link" type="button" onclick="navigator.clipboard.writeText(location.href).then(()=>{this.textContent='Link copied'})">Copy link ↗</button></div><h1>${esc(article.title)}</h1><p class="deck">${esc(article.excerpt)}</p><div class="story-meta">${avatar ? `<img class="author-avatar" src="${esc(avatar)}" alt="">` : `<span class="author-mark">${authorMark}</span>`}<span><strong>${esc(author)}</strong><small>${esc(role)}</small></span><span class="meta-spacer"></span><span>${esc(dateText(article.published_at))}<small>${readMinutes} min read</small></span></div></header>${cover ? `<figure class="cover-frame"><img class="cover" src="${esc(cover)}" alt="${esc(article.cover_image_alt || article.title)}" fetchpriority="high"></figure>` : ''}<div class="reading-grid${toc ? '' : ' reading-grid-no-toc'}">${toc}<div>${takeawaysHtml}<div class="body" id="article-body">${body}</div></div></div>${faqHtml}<section class="article-cta"><div><p class="eyebrow">PUT THE IDEAS TO WORK</p><h2>Ready for a clearer next step?</h2><p>${esc(serviceDescription)}</p></div><a href="${serviceHref}">Explore ${esc(serviceName)} <span>↗</span></a></section></article><p class="back-link"><a href="/learning/">← Back to the Learning Center</a></p></main>${universalFooter}<script>document.querySelector('.menu-toggle')?.addEventListener('click',event=>{const button=event.currentTarget,nav=document.getElementById(button.getAttribute('aria-controls'));const open=nav.classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));});document.querySelectorAll('.site-nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelector('.site-nav')?.classList.remove('is-open');document.querySelector('.menu-toggle')?.setAttribute('aria-expanded','false')}));document.querySelectorAll('.toc a').forEach(link=>link.addEventListener('click',event=>{const target=document.querySelector(link.getAttribute('href'));if(target){event.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});history.replaceState(null,'',link.getAttribute('href'))}}));</script></body></html>`;
}

async function githubPagesFallback(request, env) {
  // Route Workers can forward the original request to the zone's configured
  // origin. Fetching GitHub Pages directly redirects back to this domain and
  // loops once the Learning route is attached.
  return fetch(request);
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
      const response = new Response(request.method === 'HEAD' ? null : renderArticle(article, ARTICLE_STYLES), { headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=60', 'X-Robots-Tag': 'index, follow' } });
      return response;
    } catch (error) {
      console.error('Learning edge render failed', error);
      return githubPagesFallback(request, env);
    }
  },
};
