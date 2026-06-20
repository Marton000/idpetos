const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
const v = pkg.version;
const date = new Date().toISOString();

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const sha512 = (f) => crypto.createHash('sha512').update(fs.readFileSync(f)).digest('hex');

const files = fs.readdirSync(distDir);
console.log('Files in dist:', files);

const entries = [];
let primaryPath = '';
let primarySha = '';

const addEntry = (filename) => {
  const full = path.join(distDir, filename);
  if (fs.existsSync(full)) {
    const size = fs.statSync(full).size.toString();
    const sha = sha512(full);
    entries.push({ url: filename, size: size, sha512: sha });
    console.log(`+ ${filename} (${size} bytes)`);
    return { filename, sha };
  }
  return null;
};

// Windows: nsis installer
files.forEach((f) => {
  if (f.startsWith('Idpetos Setup ') && f.endsWith('.exe')) {
    const r = addEntry(f);
    if (r) { primaryPath = r.filename; primarySha = r.sha; }
  }
});
// Windows: portable
files.forEach((f) => {
  if (f.startsWith('Idpetos ') && f.endsWith('.exe') && !f.includes('Setup')) {
    addEntry(f);
  }
});
// macOS: dmg
files.forEach((f) => {
  if (f.startsWith('Idpetos-') && f.endsWith('.dmg')) {
    const r = addEntry(f);
    if (r && !primaryPath) { primaryPath = r.filename; primarySha = r.sha; }
  }
});
// macOS: zip
files.forEach((f) => {
  if (f.startsWith('Idpetos-') && f.endsWith('.zip')) {
    const r = addEntry(f);
    if (r && !primaryPath) { primaryPath = r.filename; primarySha = r.sha; }
  }
});

let yml = `version: ${v}\n`;
yml += `releaseDate: "${date}"\n`;
yml += `files:\n`;
entries.forEach((e) => {
  yml += `  - url: ${e.url}\n    size: ${e.size}\n    sha512: ${e.sha512}\n`;
});
yml += `path: ${primaryPath}\n`;
yml += `sha512: ${primarySha}\n`;

fs.writeFileSync(path.join(distDir, 'latest.yml'), yml);
console.log('Generated dist/latest.yml');
