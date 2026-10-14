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
  html = html.replace(/\b(href|src|action|poster)=(['"])(?!#|\/|\?|[a-z][a-z0-9+.-]*:)([^'"]*)\2/gi, '$1=$2/$3$2');
  return html;
}
const pages = [
  { id: 'creator', section: 'creator', title: 'Creator Growth & Monetization | clicksable.', description: 'Turn your audience into a business you own. Build a clear offer, stronger audience relationships, and a path from attention to revenue with clicksable.' },
  { id: 'business', section: 'business', title: 'AI Visibility for Businesses | clicksable.', description: 'Help buyers and AI understand what your business does. Build a clearer, more credible presence across AI search and discovery with clicksable.' },
  { id: 'company', section: 'about', title: 'About clicksable. | Our Mission and Global Offices', description: 'Meet clicksable., a Dubai-founded growth company helping creators and businesses build connected systems for visibility, revenue, and long-term growth.' },
];

for (const page of pages) {
  let html = rewritePageLinks(source);
  const canonical = `https://clicksable.com/${page.id}/`;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${page.title}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${page.description}">`);
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
  const output = path.join(outputRoot, page.id, 'index.html');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, html);
}
await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(path.join(outputRoot, 'index.html'), rewritePageLinks(source));
console.log(`Generated ${pages.map(page => `/${page.id}/`).join(', ')}`);
