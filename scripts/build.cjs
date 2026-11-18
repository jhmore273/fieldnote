const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'build-notification-evaluator.cjs')], { stdio: 'inherit', cwd: root });
const source = path.join(root, 'public');
const output = path.join(root, 'dist');
// Solo se limpia la carpeta dist del propio proyecto. Nunca se siguen enlaces.
if (root === path.parse(root).root || path.dirname(output) !== root || path.basename(output) !== 'dist')
  throw Error('La carpeta de salida no está dentro del proyecto.');
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())
  throw Error('dist no debe ser un enlace simbólico.');
if (!fs.existsSync(path.join(source, 'index.html'))) throw Error('Falta public/index.html.');
for (const file of fs.readdirSync(source).filter(file => file.endsWith('.js')))
  execFileSync(process.execPath, ['--check', path.join(source, file)], { stdio: 'inherit' });
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
console.log('Fieldnote preparado en dist/ para Cloudflare Pages.');
