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
    description: 'AI visibility and GEO for B2B software, cybersecurity, legal, financial services, healthcare, and high-end hospitality businesses.',
    serviceName: 'Business AI Visibility and GEO', serviceDescription: 'Clicksable specializes in AI visibility and Generative Engine Optimization (GEO) for B2B software, cybersecurity, legal, financial services, healthcare, and high-end hospitality businesses.',
    faqHeading: 'Questions about AI visibility',
    faqIntro: 'Clicksable specializes in AI visibility and GEO for B2B software, cybersecurity, legal and financial services, healthcare, and high-end hospitality. We help each business clarify its services, proof, and buyer information for search and AI discovery.',
    relatedLinks: [['Explore business services', '/business/#business-framework-title'], ['Read the AI search guide', '/learning/business-ai-search-visibility/'], ['See the Business Brief form', '/business/#business-path-form']],
    faqs: [
      ['What does Clicksable’s AI Visibility service do?', 'We map the questions your buyers ask, make your service pages and proof clearer, and connect useful information across your site. This gives search and AI systems better material to understand when they evaluate your business.'],
      ['What do I get in the Business Brief?', 'The free brief uses the details you submit to suggest positioning improvements, example buyer questions, and practical next steps. It does not crawl your website or check live rankings, AI answers, or citations.'],
      ['Can Clicksable make AI recommend my business?', 'No agency controls what an AI platform recommends. We can improve how clearly your business and evidence are presented, which gives platforms better information to work with, but recommendations are up to each platform.'],
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
