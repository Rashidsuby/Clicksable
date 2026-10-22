import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputRoot = path.resolve(process.argv[2] || root);
const source = await fs.readFile(path.join(root, 'index.html'), 'utf8');
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
  // The standalone public pages include the shared SPA template. Keep links
  // as normal navigations so in-page routing cannot switch between page routes.
  html = html.replace(/<a\b[^>]*>/g, tag => tag.replace(/\s+onclick=(['"])goPage\('[^']+'\)(?:;return false)?\1/, ''));
  html = html.replace(/\b(href|src|action|poster)=(['"])(?!#|\/|\?|[a-z][a-z0-9+.-]*:)([^'"]*)\2/gi, '$1=$2/$3$2');
  return html;
}
const pages = [
  {
    id: 'creator', section: 'creator', title: 'Creator Growth & Monetization | clicksable.',
    description: 'Turn your audience into a business you own. Build a clear offer, stronger audience relationships, and a path from attention to revenue with clicksable.',
    serviceName: 'Creator Growth', serviceDescription: 'Clicksable helps creators shape an offer, messaging, and a conversion path around their audience.',
    faqHeading: 'Questions about creator growth',
    faqIntro: 'Clicksable helps creators turn an existing audience into a business they own. The Creator Engine brings together offer direction, launch messaging, and a practical first 14-day plan.',
    relatedLinks: [['Explore the Creator Engine', '/creator/#creator-system-title'], ['See the Creator Blueprint', '/creator/#creator-path-form'], ['Read the Learning Center', '/learning/']],
    faqs: [
      ['Who is the Creator Engine for?', 'It is for creators who want to build a business around their audience, ideas, and expertise—not rely on content or brand deals alone.'],
      ['What do I get in the Creator Blueprint?', 'We use your answers to outline an offer direction, a launch message, and the first actions to focus on over 14 days. It gives you a clearer place to start before deciding what to build.'],
      ['Can Clicksable help me earn more from my audience?', 'We help you shape an offer and a path for your audience to act on it. Results depend on the offer, audience, market, and how the plan is carried out, so we do not promise a specific income or sales figure.'],
    ],
  },
  {
    id: 'business', section: 'business', title: 'AI Visibility for Businesses | clicksable.',
    description: 'Generative Engine Optimization and AI search visibility services combining platform research, SEO audits, buyer-focused content, authority work, and ongoing measurement.',
    serviceName: 'Generative Engine Optimization and AI Search Visibility', serviceDescription: 'Clicksable helps businesses improve how clearly they are represented in AI-assisted and traditional search through buyer-question research, SEO and content reviews, authority work, and repeated visibility checks.',
    faqHeading: 'Questions about AI visibility',
    faqIntro: 'Learn what Generative Engine Optimization includes, how platform reviews are measured, and what a Clicksable engagement can cover.',
    relatedLinks: [['Explore the visibility system', '/business/#business-framework-title'], ['See the audit approach', '/business/#business-audit-title'], ['Request a proposal', '/business/#business-path-form']],
    faqs: [
      ['What are AI search optimization services?', 'They help businesses improve how clearly their information is represented in AI-assisted search and answer experiences. Work can include buyer-question research, SEO and content reviews, authority improvements, and repeated visibility checks.'],
      ['What does a GEO audit include?', 'We agree the buyer questions and platforms to review, inspect answers and cited sources, assess relevant SEO and content foundations, and prioritize opportunities for the engagement.'],
      ['Does GEO replace traditional SEO?', 'No. GEO works alongside technical SEO, useful content, page experience, and credible authority signals. Priorities depend on your audience, market, and starting point.'],
      ['Which platforms can be reviewed?', 'Potential surfaces include Google AI Overviews and AI Mode, ChatGPT Search, Perplexity, Microsoft Copilot, Gemini, Claude, Meta AI, and Grok. The set is agreed around your audience and engagement scope.'],
      ['How do you measure AI visibility?', 'We record the prompt, platform, date, market, answer presence, brand mentions, citations, competitors, and source URLs. Repeating agreed checks compares observations over time; it is not a universal score or guarantee.'],
      ['Can you guarantee that AI will recommend us?', 'No. Search and AI platforms control what they show, and answers can vary by query, location, and time. We strengthen the information available and report what we observe.'],
      ['How much does GEO cost?', 'Pricing depends on research depth, platform coverage, content needs, and implementation scope. Your proposal sets out the agreed deliverables, timing, and price before work begins.'],
      ['What is included in a proposal?', 'The proposal outlines goals, selected platforms and questions, audit and implementation scope, deliverables, reporting cadence, timing, and price.'],
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
    const faqId = `${page.id}-faq`;
    if (!html.includes(`id="${faqId}"`)) throw new Error(`Missing visible FAQ section for /${page.id}/`);

    const visibleFaqSection = html.match(new RegExp(`<section\\b[^>]*\\bid=["']${faqId}["'][^>]*>[\\s\\S]*?<\\/section>`, 'i'))?.[0] || '';
    const visibleFaqs = [...visibleFaqSection.matchAll(/<details\b[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/details>/gi)]
      .map(match => match.slice(1).map(value => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()));
    if (JSON.stringify(visibleFaqs) !== JSON.stringify(page.faqs)) {
      throw new Error(`FAQ structured data does not match visible FAQ content on /${page.id}/`);
    }

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
    html = html.replace('</head>', `${schemaTag}\n</head>`);
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
