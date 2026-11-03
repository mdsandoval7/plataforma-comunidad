const fs = require('node:fs');
const path = require('node:path');

const sourceDirectory = path.resolve(__dirname, '..', 'prisma', 'frontend');
const publicDirectory = path.resolve(__dirname, '..', 'public');
const assets = ['index.html', 'app.js', 'Logo.png', 'hero-jesus-2024.jpg'];
const pastorImages = Array.from({ length: 6 }, (_, index) => `pastor-${index + 1}.jpeg`);

fs.mkdirSync(publicDirectory, { recursive: true });

for (const asset of assets) {
  fs.copyFileSync(
    path.join(sourceDirectory, asset),
    path.join(publicDirectory, asset)
  );
}

const publicAssetsDirectory = path.join(publicDirectory, 'assets');
fs.mkdirSync(publicAssetsDirectory, { recursive: true });

for (const image of pastorImages) {
  fs.copyFileSync(
    path.join(sourceDirectory, 'assets', image),
    path.join(publicAssetsDirectory, image)
  );
}
