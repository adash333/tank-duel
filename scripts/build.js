const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const file of ['index.html', 'styles.css', 'src']) {
  fs.cpSync(path.join(root, file), path.join(root, 'dist', file), { recursive: true });
}
console.log('Built static game in dist/');
