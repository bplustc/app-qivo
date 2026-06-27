const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');

function run(command) {
  const currentPath = process.env.PATH || process.env.Path || '';
  const nodePath = 'C:\\Program Files\\nodejs';
  const env = {
    ...process.env,
    PATH: `${nodePath};${currentPath}`,
  };

  execSync(command, { stdio: 'inherit', env });
}

const htmlMinifierBin = path.join(projectRoot, 'node_modules', '.bin', 'html-minifier-terser.cmd');
const terserBin = path.join(projectRoot, 'node_modules', '.bin', 'terser.cmd');

function copyIfExists(sourceRelative, targetRelative) {
  const source = path.join(projectRoot, sourceRelative);
  const target = path.join(distDir, targetRelative || sourceRelative);

  if (!fs.existsSync(source)) {
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

run(`"${htmlMinifierBin}" index.html --collapse-whitespace --remove-comments --remove-redundant-attributes --remove-script-type-attributes --remove-tag-whitespace --use-short-doctype --minify-css true --minify-js true -o dist/index.html`);
run(`"${terserBin}" app.js -c -m -o dist/app.js`);

copyIfExists('styles.css');
copyIfExists('Images');
copyIfExists('robots.txt');
copyIfExists('sitemap.xml');

console.log('Build listo en dist/');
