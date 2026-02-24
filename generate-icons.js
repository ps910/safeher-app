const sharp = require('sharp');
const path = require('path');

async function createIcon(size, filename) {
  const svg = [
    '<svg width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg">',
    '<rect width="' + size + '" height="' + size + '" fill="#E91E63"/>',
    '<circle cx="' + (size / 2) + '" cy="' + (size * 0.4) + '" r="' + (size * 0.22) + '" fill="white" opacity="0.2"/>',
    '<text x="' + (size / 2) + '" y="' + (size * 0.45) + '" text-anchor="middle" font-size="' + (size * 0.18) + '" font-weight="bold" fill="white" font-family="Arial">SOS</text>',
    '<text x="' + (size / 2) + '" y="' + (size * 0.7) + '" text-anchor="middle" font-size="' + (size * 0.07) + '" fill="white" font-family="Arial" opacity="0.9">Girl Safety</text>',
    '</svg>'
  ].join('\n');

  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join('assets', filename));
  console.log('Created ' + filename + ' (' + size + 'x' + size + ')');
}

async function main() {
  await createIcon(1024, 'icon.png');
  await createIcon(1024, 'adaptive-icon.png');
  await createIcon(1024, 'splash.png');
  await createIcon(48, 'favicon.png');
  console.log('All icons created successfully!');
}

main().catch(console.error);
