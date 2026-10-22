import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

const site = 'https://clicksable.com';
const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
  console.log('No GitHub push event is available; IndexNow submission skipped.');
  process.exit(0);
}

const event = JSON.parse(await readFile(eventPath, 'utf8'));
const before = event.before;
const after = event.after;
if (!before || /^0+$/.test(before)) {
  console.log('No previous commit is available; IndexNow submission skipped.');
  process.exit(0);
}

const changedPaths = execFileSync('git', ['diff', '--name-only', '-z', before, after], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const urls = new Set();

function add(url) {
  const parsed = new URL(url, site);
  if (parsed.origin === site && !parsed.search && !parsed.hash) urls.add(parsed.href);
}

function addPrimaryPages() {
  for (const route of ['/', '/creator/', '/business/', '/company/']) add(route);
}

function addSitemapUrls() {
  return readFile('sitemap.xml', 'utf8').then(xml => {
    for (const [, url] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) add(url);
  });
}

for (const file of changedPaths) {
  if (file === 'index.html' || file === 'scripts/build-public-pages.mjs') {
    addPrimaryPages();
  } else if (file === 'scripts/build-learning-pages.mjs' || file === 'sitemap.xml') {
    await addSitemapUrls();
  } else if (file === 'scripts/build-discovery-pages.mjs') {
    for (const route of ['/sitemap/', '/ai-info/', '/entity-map.html', '/llms.txt', '/sitemap.xml']) add(route);
  } else if (/^[a-f0-9]{32}\.txt$/i.test(file)) {
    // A newly deployed key enables IndexNow; announce the existing canonical URLs once.
    await addSitemapUrls();
  } else if (/\.html$/i.test(file)) {
    const route = file.endsWith('/index.html')
      ? `/${file.slice(0, -'index.html'.length)}`
      : `/${file}`;
    add(route);
  }
}

if (urls.size === 0) {
  console.log('No changed public pages found; IndexNow submission skipped.');
  process.exit(0);
}

const keyFile = changedPaths.find(file => /^[a-f0-9]{32}\.txt$/i.test(file))
  ?? (await readdir('.')).find(file => /^[a-f0-9]{32}\.txt$/i.test(file));
if (!keyFile) {
  console.warn('IndexNow key file was not found; URLs were not submitted.');
  process.exit(0);
}

const key = (await readFile(keyFile, 'utf8')).trim();
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: 'clicksable.com',
    key,
    keyLocation: `${site}/${keyFile}`,
    urlList: [...urls].slice(0, 10000),
  }),
});

console.log(`IndexNow response: HTTP ${response.status}; submitted ${Math.min(urls.size, 10000)} changed URL(s).`);
if (response.status !== 200 && response.status !== 202) {
  console.warn('IndexNow did not accept the notification. The site deployment remains successful.');
}
