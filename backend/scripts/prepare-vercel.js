const fs = require('node:fs');
const path = require('node:path');

const sourceDirectory = path.resolve(__dirname, '..', 'prisma', 'frontend');
const publicDirectory = path.resolve(__dirname, '..', 'public');
const assets = [
  'index.html',
  'app.js',
  'Logo.png',
  'favicon.png',
  'style.css',
  'hero-jesus-2024.jpg'
];
const imageDirectories = ['pastor', 'pastora'];

fs.mkdirSync(publicDirectory, { recursive: true });

for (const asset of assets) {
  fs.copyFileSync(
    path.join(sourceDirectory, asset),
    path.join(publicDirectory, asset)
  );
}

for (const imageDirectory of imageDirectories) {
  const sourceAssetsDirectory = path.join(sourceDirectory, 'assets', imageDirectory);
  const publicAssetsDirectory = path.join(publicDirectory, 'assets', imageDirectory);
  fs.mkdirSync(publicAssetsDirectory, { recursive: true });

  for (const image of fs.readdirSync(sourceAssetsDirectory)) {
    fs.copyFileSync(
      path.join(sourceAssetsDirectory, image),
      path.join(publicAssetsDirectory, image)
    );
  }
}

const routePages = [
  'admin/developer.html',
  'admin/church-dashboard.html',
  'dashboard.html'
];

for (const routePage of routePages) {
  const destination = path.join(publicDirectory, routePage);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(
    path.join(sourceDirectory, 'index.html'),
    destination
  );
}
