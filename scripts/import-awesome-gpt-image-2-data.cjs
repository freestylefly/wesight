#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'refer', 'awesome-gpt-image-2');
const casesPath = path.join(sourceDir, 'data', 'cases.json');
const styleLibraryPath = path.join(sourceDir, 'data', 'style-library.json');
const outputDir = path.join(rootDir, 'src', 'renderer', 'data', 'creatorStudio');
const thumbnailDir = path.join(rootDir, 'public', 'creator-studio', 'images');
const publicThumbnailPrefix = './creator-studio/images';
const packageJsonPath = path.join(rootDir, 'package.json');
const thumbnailMaxSize = 640;

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const fail = (message) => {
  console.error(`[CreatorStudioImport] ${message}`);
  process.exit(1);
};

const assertArray = (value, label) => {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }
};

const getSourceCommit = () => {
  try {
    return childProcess.execFileSync('git', ['-C', sourceDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

const normalizeImagePath = (imagePath) => {
  if (typeof imagePath !== 'string' || imagePath.trim() === '') {
    return null;
  }
  return imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
};

const getImageSourcePath = (imagePath) => {
  const normalized = normalizeImagePath(imagePath);
  if (!normalized) {
    return null;
  }
  return path.join(sourceDir, 'data', normalized.replace(/^\/+/, ''));
};

const getThumbnailName = (imagePath) => {
  const normalized = normalizeImagePath(imagePath);
  if (!normalized) {
    return null;
  }
  return normalized.replace(/^\/images\//, '').replace(/[^\w.-]/g, '_');
};

const getThumbnailPublicPath = (imagePath) => {
  const name = getThumbnailName(imagePath);
  return name ? `${publicThumbnailPrefix}/${name}` : null;
};

const getThumbnailOutputPath = (imagePath) => {
  const name = getThumbnailName(imagePath);
  return name ? path.join(thumbnailDir, name) : null;
};

const getMimeType = (filePath, buffer) => {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg';
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
};

const readPngDimensions = (buffer) => {
  if (
    buffer.length < 24
    || buffer[0] !== 0x89
    || buffer[1] !== 0x50
    || buffer[2] !== 0x4e
    || buffer[3] !== 0x47
  ) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const readJpegDimensions = (buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) {
      return null;
    }

    const isStartOfFrame = [
      0xc0, 0xc1, 0xc2, 0xc3,
      0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb,
      0xcd, 0xce, 0xcf,
    ].includes(marker);
    if (isStartOfFrame) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
};

const readImageMetadata = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const buffer = fs.readFileSync(filePath);
  const dimensions = readPngDimensions(buffer) || readJpegDimensions(buffer);
  if (!dimensions || !dimensions.width || !dimensions.height) {
    return null;
  }
  return {
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: Number((dimensions.width / dimensions.height).toFixed(4)),
    mimeType: getMimeType(filePath, buffer),
    byteSize: buffer.length,
  };
};

const commandExists = (command) => {
  try {
    childProcess.execFileSync(command, ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
};

const sipsExists = () => {
  try {
    childProcess.execFileSync('sips', ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
};

const createThumbnail = (sourcePath, outputPath) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (sipsExists()) {
    childProcess.execFileSync('sips', ['-Z', String(thumbnailMaxSize), sourcePath, '--out', outputPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return;
  }

  if (commandExists('magick')) {
    childProcess.execFileSync('magick', [sourcePath, '-resize', `${thumbnailMaxSize}x${thumbnailMaxSize}>`, outputPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return;
  }

  if (commandExists('convert')) {
    childProcess.execFileSync('convert', [sourcePath, '-resize', `${thumbnailMaxSize}x${thumbnailMaxSize}>`, outputPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return;
  }

  fail('no thumbnail tool found; install macOS sips or ImageMagick');
};

const ensureThumbnail = (imagePath) => {
  const sourcePath = getImageSourcePath(imagePath);
  const thumbnailName = getThumbnailName(imagePath);
  if (!sourcePath || !thumbnailName) {
    return null;
  }
  if (!fs.existsSync(sourcePath)) {
    fail(`missing source image: ${path.relative(rootDir, sourcePath)}`);
  }

  const outputPath = getThumbnailOutputPath(imagePath);
  const shouldGenerate = !fs.existsSync(outputPath)
    || fs.statSync(outputPath).mtimeMs < fs.statSync(sourcePath).mtimeMs;
  if (shouldGenerate) {
    try {
      createThumbnail(sourcePath, outputPath);
    } catch (error) {
      fail(`failed to create thumbnail for ${path.relative(rootDir, sourcePath)}: ${error.message}`);
    }
  }
  return getThumbnailPublicPath(imagePath);
};

const validateUnique = (items, getId, label) => {
  const seen = new Set();
  for (const item of items) {
    const id = getId(item);
    if (id === undefined || id === null || String(id).trim() === '') {
      fail(`${label} contains an item without id`);
    }
    if (seen.has(id)) {
      fail(`${label} contains duplicate id: ${id}`);
    }
    seen.add(id);
  }
  return seen;
};

const validateLocalizedText = (value, label) => {
  if (!value || typeof value.en !== 'string' || typeof value.zh !== 'string') {
    fail(`${label} must include en and zh text`);
  }
};

if (!fs.existsSync(casesPath)) {
  fail(`missing source cases file: ${path.relative(rootDir, casesPath)}`);
}

if (!fs.existsSync(styleLibraryPath)) {
  fail(`missing source style library file: ${path.relative(rootDir, styleLibraryPath)}`);
}

const sourceCasesData = readJson(casesPath);
const sourceStyleLibrary = readJson(styleLibraryPath);
const packageJson = readJson(packageJsonPath);

assertArray(sourceCasesData.cases, 'cases.json cases');
assertArray(sourceStyleLibrary.categories, 'style-library categories');
assertArray(sourceStyleLibrary.styles, 'style-library styles');
assertArray(sourceStyleLibrary.scenes, 'style-library scenes');
assertArray(sourceStyleLibrary.templates, 'style-library templates');

const categoryValues = new Set(sourceStyleLibrary.categories.map((category) => category.value));
const styleValues = new Set(sourceStyleLibrary.styles.map((style) => style.value));
const sceneValues = new Set(sourceStyleLibrary.scenes.map((scene) => scene.value));
const sourceCaseIds = validateUnique(sourceCasesData.cases, (item) => item.id, 'cases');
validateUnique(sourceStyleLibrary.templates, (item) => item.id, 'templates');

for (const category of sourceStyleLibrary.categories) {
  validateLocalizedText(category.title, `category ${category.id} title`);
}

for (const style of sourceStyleLibrary.styles) {
  validateLocalizedText(style.title, `style ${style.id} title`);
}

for (const scene of sourceStyleLibrary.scenes) {
  validateLocalizedText(scene.title, `scene ${scene.id} title`);
}

const cases = sourceCasesData.cases.map((item) => {
  if (!item.prompt || typeof item.prompt !== 'string' || item.prompt.trim() === '') {
    fail(`case ${item.id} has an empty prompt`);
  }
  if (!categoryValues.has(item.category)) {
    fail(`case ${item.id} references unknown category: ${item.category}`);
  }
  for (const style of item.styles ?? []) {
    if (!styleValues.has(style)) {
      fail(`case ${item.id} references unknown style: ${style}`);
    }
  }
  for (const scene of item.scenes ?? []) {
    if (!sceneValues.has(scene)) {
      fail(`case ${item.id} references unknown scene: ${scene}`);
    }
  }

  const image = ensureThumbnail(item.image);
  const imageSourcePath = getImageSourcePath(item.image);
  const thumbnailOutputPath = getThumbnailOutputPath(item.image);

  return {
    id: `case-${item.id}`,
    sourceCaseId: item.id,
    title: item.title || `Case ${item.id}`,
    image,
    imageOriginal: readImageMetadata(imageSourcePath),
    imageThumbnail: readImageMetadata(thumbnailOutputPath),
    imageAlt: item.imageAlt || item.title || `Case ${item.id}`,
    sourceLabel: item.sourceLabel || '',
    sourceUrl: item.sourceUrl || null,
    githubUrl: item.githubUrl || null,
    prompt: item.prompt,
    promptPreview: item.promptPreview || item.prompt.slice(0, 180),
    category: item.category,
    styles: item.styles ?? [],
    scenes: item.scenes ?? [],
    featured: Boolean(item.featured),
    tags: Array.from(new Set([item.category, ...(item.styles ?? []), ...(item.scenes ?? [])])),
  };
});

for (const template of sourceStyleLibrary.templates) {
  if (!template.id || typeof template.id !== 'string') {
    fail('template contains an invalid id');
  }
  validateLocalizedText(template.title, `template ${template.id} title`);
  validateLocalizedText(template.description, `template ${template.id} description`);
  if (!categoryValues.has(template.category)) {
    fail(`template ${template.id} references unknown category: ${template.category}`);
  }
  for (const style of template.styles ?? []) {
    if (!styleValues.has(style)) {
      fail(`template ${template.id} references unknown style: ${style}`);
    }
  }
  for (const scene of template.scenes ?? []) {
    if (!sceneValues.has(scene)) {
      fail(`template ${template.id} references unknown scene: ${scene}`);
    }
  }
  for (const exampleCase of template.exampleCases ?? []) {
    if (!sourceCaseIds.has(exampleCase)) {
      fail(`template ${template.id} references unknown example case: ${exampleCase}`);
    }
  }
}

const styleLibrary = {
  version: sourceStyleLibrary.version,
  repository: sourceStyleLibrary.repository,
  templateDocument: sourceStyleLibrary.templateDocument,
  tagLabels: sourceStyleLibrary.tagLabels ?? {},
  categories: sourceStyleLibrary.categories,
  styles: sourceStyleLibrary.styles,
  scenes: sourceStyleLibrary.scenes,
  templates: sourceStyleLibrary.templates.map((template) => ({
    ...template,
    cover: ensureThumbnail(template.cover),
  })),
};

const manifest = {
  schemaVersion: 1,
  appVersion: packageJson.version || null,
  source: {
    name: 'awesome-gpt-image-2',
    repository: sourceStyleLibrary.repository || sourceCasesData.repository,
    version: sourceStyleLibrary.version ?? null,
    commit: getSourceCommit(),
    paths: {
      cases: 'refer/awesome-gpt-image-2/data/cases.json',
      styleLibrary: 'refer/awesome-gpt-image-2/data/style-library.json',
    },
  },
  importedAt: new Date().toISOString(),
  counts: {
    cases: cases.length,
    categories: styleLibrary.categories.length,
    styles: styleLibrary.styles.length,
    scenes: styleLibrary.scenes.length,
    templates: styleLibrary.templates.length,
  },
  runtimeDependency: {
    referPathRequired: false,
    imageAssetsCopied: false,
    thumbnailsCopied: true,
    thumbnailMaxSize,
    thumbnailPath: 'public/creator-studio/images',
  },
  skillStrategy: {
    gptImage2StyleLibrary: 'skillhub_recommendation',
    copiedToSkills: false,
    note: 'Phase 0-2 keeps the style library as structured renderer data. The Agent skill can be recommended or generated in Phase 3 when Cowork integration starts.',
  },
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'cases.json'), `${JSON.stringify(cases, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'style-library.json'), `${JSON.stringify(styleLibrary, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`[CreatorStudioImport] imported ${cases.length} cases and ${styleLibrary.templates.length} templates`);
