import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputRoot = path.resolve(process.argv[2] || root);
const source = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const serviceQuestionStyles = `<style id="service-question-styles">
.service-questions{width:min(1120px,calc(100% - 48px));margin:clamp(64px,9vw,120px) auto 80px;padding:clamp(26px,5vw,58px);border:1px solid rgba(23,26,20,.12);border-radius:26px;background:linear-gradient(135deg,#edf1e7,#fffdf8 68%)}
.service-questions-intro{max-width:660px;margin-bottom:26px}.service-questions-kicker{margin:0 0 10px;color:#294719;font-size:10px;font-weight:800;letter-spacing:.15em}.service-questions-intro h2{margin:0;font-size:clamp(30px,5vw,52px);line-height:1.03;letter-spacing:-.06em}.service-questions-intro>p:last-child{margin:12px 0 0;color:#5d635a;font-size:15px;line-height:1.6}.service-questions-list{border-top:1px solid rgba(23,26,20,.14)}.service-questions-list details{padding:18px 0;border-bottom:1px solid rgba(23,26,20,.14)}.service-questions-list summary{display:flex;justify-content:space-between;gap:20px;cursor:pointer;color:#171a14;font-size:17px;font-weight:700;list-style:none}.service-questions-list summary::-webkit-details-marker{display:none}.service-questions-list summary::after{content:'+';flex:none;color:#294719;font-size:22px;line-height:1}.service-questions-list details[open] summary::after{content:'−'}.service-questions-list details p{max-width:760px;margin:12px 30px 0 0;color:#5d635a;font-size:15px;line-height:1.75}.service-related{position:static;inset:auto;z-index:auto;display:flex;flex-wrap:wrap;gap:10px;width:auto;margin:24px 0 0;padding:0;background:none;backdrop-filter:none}.service-related::before{display:none}.service-related a{padding:10px 13px;border:1px solid rgba(41,71,25,.19);border-radius:999px;color:#294719;font-size:12px;font-weight:700;text-decoration:none}.service-related a:hover{background:#294719;color:#fff}.service-related a span{color:#719a45}@media(max-width:600px){.service-questions{width:calc(100% - 32px);margin:52px auto;padding:22px 18px;border-radius:20px}.service-questions-list summary{font-size:15px}.service-questions-list details p{font-size:14px}}
</style>`;
const pagePaths = { gateway: '/', creator: '/creator/', business: '/business/', about: '/company/' };
function rewritePageLinks(html) {
  for (const [id, route] of Object.entries(pagePaths)) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`href=(['"])#(?:top)?\\1([^>]*onclick="goPage\\('${escapedId}'\\)(?:;return false)?")`, 'g'), `href="${route}"$2`);
    if (id !== 'gateway') html = html.replace(new RegExp(`href=(['"])#${escapedId}\\1([^>]*data-app-path="${escapedId}")`, 'g'), `href="${route}"$2`);
  }
  html = html.replace(/href="#about-mission" onclick="goPage\('about'\);/g, 'href="/company/#about-mission" onclick="goPage(\'about\');');
  html = html.replace(/href="#about-offices-title" onclick="goPage\('about'\);/g, 'href="/company/#about-offices-title" onclick="goPage(\'about\');');
  html = html.replace(/href="#about-contact" onclick="goPage\('about'\);/g, 'href="/company/#about-contact" onclick="goPage(\'about\');');
  html = html.replace(/\b(href|src|action|poster)=(['"])(?!#|\/|\?|[a-z][a-z0-9+.-]*:)([^'"]*)\2/gi, '$1=$2/$3$2');
  return html;
}
const pages = [
  {
    id: 'creator', section: 'creator', title: 'Creator Growth & Monetization | clicksable.',
    description: 'Turn your audience into a business you own. Build a clear offer, stronger audience relationships, and a path from attention to revenue with clicksable.',
    serviceName: 'Creator Growth', serviceDescription: 'Clicksable helps creators shape an offer, messaging, and a conversion path around their audience.',
    faqHeading: 'Questions about creator growth', relatedLinks: [['Explore the Creator Engine', '/creator/#creator-system-title'], ['See the Creator Blueprint', '/creator/#creator-path-form'], ['Read the Learning Center', '/learning/']],
    faqs: [
      ['Who is the Creator Engine for?', 'It is designed for creators who already have an audience and want to build an offer and a clearer path from attention to revenue.'],
      ['What does the Creator Blueprint provide?', 'The on-page form uses the details you provide to prepare a starting direction for your offer, launch message, and near-term focus. It is a strategy brief, not a promise of revenue.'],
      ['Does Clicksable guarantee creator income or sales?', 'No. Income and sales depend on your audience, offer, market, and execution. The site does not promise a particular financial result.'],
    ],
  },
  {
    id: 'business', section: 'business', title: 'AI Visibility for Businesses | clicksable.',
    description: 'Help buyers and AI understand what your business does. Build a clearer, more credible presence across AI search and discovery with clicksable.',
    serviceName: 'Business AI Visibility', serviceDescription: 'Clicksable helps businesses make their services, evidence, and buyer information clearer across search and AI-assisted discovery.',
    faqHeading: 'Questions about AI visibility', relatedLinks: [['Explore business services', '/business/#business-framework-title'], ['Read the AI search guide', '/learning/business-ai-search-visibility/'], ['See the Business Brief form', '/business/#business-path-form']],
    faqs: [
      ['What does Clicksable’s AI Visibility service do?', 'It helps businesses make their services, evidence, and buyer information clearer across search and AI-assisted discovery. The work focuses on understanding and discoverability; no placement is guaranteed.'],
      ['Does the Business Brief scan Google or AI platforms?', 'No. The Business Brief organizes the details you submit into positioning observations, example buyer questions, and suggested checks. It does not perform a live scan or measure rankings, citations, or visibility.'],
      ['Can Clicksable guarantee that an AI platform will recommend my business?', 'No. Search and AI platforms control their own results. Clicksable can improve the clarity and structure of information, but cannot guarantee a mention, citation, or recommendation.'],
    ],
  },
  { id: 'company', section: 'about', title: 'About clicksable. | Our Mission and Global Offices', description: 'Meet clicksable., a Dubai-founded growth company helping creators and businesses build connected systems for visibility, revenue, and long-term growth.' },
];

for (const page of pages) {
  let html = rewritePageLinks(source);
  const canonical = `https://clicksable.com/${page.id}/`;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${page.title}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${page.description}">`);
  html = html.replace(/<meta name="robots"[^>]*>\s*/gi, '');
  html = html.replace(/<meta name="description"[^>]*>/i, match => `${match}\n<meta name="robots" content="index,follow,max-image-preview:large">`);
  html = html.replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${canonical}">`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*(">)/i, `$1${page.title}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(">)/i, `$1${page.description}$2`);
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(">)/i, `$1${page.title}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(">)/i, `$1${page.description}$2`);

  const homeMarker = '<div class="page active" id="pg-gateway">';
  const pageMarker = `<div class="page" id="pg-${page.section}">`;
  if (!html.includes(homeMarker) || !html.includes(pageMarker)) throw new Error(`Missing page container while creating /${page.id}/`);
  html = html.replace(homeMarker, '<div class="page" id="pg-gateway">');
  html = html.replace(pageMarker, `<div class="page active visible" id="pg-${page.section}">`);
  html = html.replace('<body class="home-page">', '<body>');

  if (page.serviceName && page.faqs?.length) {
    const faqHtml = `<section class="service-questions" aria-labelledby="service-questions-title"><div class="service-questions-intro"><p class="service-questions-kicker">CLEAR ANSWERS</p><h2 id="service-questions-title">${page.faqHeading}</h2><p>Read how this service works and what it can—and cannot—promise.</p></div><div class="service-questions-list">${page.faqs.map(([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div><nav class="service-related" aria-label="Related pages">${page.relatedLinks.map(([label, href]) => `<a href="${href}">${label}<span aria-hidden="true"> →</span></a>`).join('')}</nav></section>`;
    const activePageStart = html.indexOf(`<div class="page active visible" id="pg-${page.section}">`);
    if (activePageStart < 0) throw new Error(`Missing active page container while adding service questions to /${page.id}/`);
    const formId = page.id === 'creator' ? 'creator-path-form' : 'business-path-form';
    const formMarker = `id="${formId}"`;
    const formStart = html.indexOf(formMarker, activePageStart);
    if (formStart < 0) throw new Error(`Missing enquiry form while adding service questions to /${page.id}/`);
    const faqInsert = html.lastIndexOf('<section', formStart);
    if (faqInsert < activePageStart) throw new Error(`Could not locate the enquiry form section while adding service questions to /${page.id}/`);
    html = html.slice(0, faqInsert) + faqHtml + html.slice(faqInsert);

    const schema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Service', '@id': `${canonical}#service`, name: page.serviceName,
          serviceType: page.serviceName, description: page.serviceDescription, url: canonical,
          provider: { '@id': 'https://clicksable.com/#organization' },
        },
        {
          '@type': 'FAQPage', '@id': `${canonical}#faq`, mainEntity: page.faqs.map(([question, answer]) => ({
            '@type': 'Question', name: question,
            acceptedAnswer: { '@type': 'Answer', text: answer },
          })),
        },
      ],
    };
    const schemaTag = `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
    html = html.replace('</head>', `${serviceQuestionStyles}\n${schemaTag}\n</head>`);
  }
  const output = path.join(outputRoot, page.id, 'index.html');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, html);
}
await fs.mkdir(outputRoot, { recursive: true });
let homeHtml = rewritePageLinks(source);
homeHtml = homeHtml.replace(/<meta name="robots"[^>]*>\s*/gi, '');
homeHtml = homeHtml.replace(/<meta name="description"[^>]*>/i, match => `${match}\n<meta name="robots" content="index,follow,max-image-preview:large">`);
await fs.writeFile(path.join(outputRoot, 'index.html'), homeHtml);
console.log(`Generated ${pages.map(page => `/${page.id}/`).join(', ')}`);
