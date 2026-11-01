const fs = require('node:fs');
const path = require('node:path');

const sourceDirectory = path.resolve(__dirname, '..', 'prisma', 'frontend');
const publicDirectory = path.resolve(__dirname, '..', 'public');
const assets = ['index.html', 'app.js', 'Logo.png', 'hero-jesus-2024.jpg'];

fs.mkdirSync(publicDirectory, { recursive: true });

for (const asset of assets) {
  fs.copyFileSync(
    path.join(sourceDirectory, asset),
    path.join(publicDirectory, asset)
  );
}
