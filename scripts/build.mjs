/**
 * Build script - copies references to dist folder
 */

import { cpSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url);
const SRC = join(ROOT.pathname, 'src');
const DIST = join(ROOT.pathname, 'dist');
const REFERENCES = join(ROOT.pathname, 'references');
const DIST_REFERENCES = join(DIST, 'references');

// Ensure dist directory exists
if (!existsSync(DIST)) {
  mkdirSync(DIST, { recursive: true });
}

// Copy references folder to dist
if (existsSync(REFERENCES)) {
  cpSync(REFERENCES, DIST_REFERENCES, { recursive: true });
  console.log('Copied references to dist');
}

console.log('Build complete!');
