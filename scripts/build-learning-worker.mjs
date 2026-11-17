import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerRoot = path.join(repoRoot, 'workers', 'learning-edge');
const source = await fs.readFile(path.join(workerRoot, 'src', 'index.js'), 'utf8');
const styles = await fs.readFile(path.join(repoRoot, 'learning', 'article.css'), 'utf8');
if (!source.includes('__ARTICLE_STYLES__')) throw new Error('Worker source is missing the article CSS bundle marker');
const output = source.replace('__ARTICLE_STYLES__', JSON.stringify(styles));
const outputPath = path.join(workerRoot, 'dist', 'index.js');
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, output);
console.log(`Built self-contained Worker bundle: ${path.relative(repoRoot, outputPath)}`);
