// Store Settings save path: what updateStoreSettings sends to updateStore.
// sanitizeStoreLogoSvg -> normalizeStoreLogoColor -> mutation payload. Offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(relative) {
  const filename = path.resolve(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  // Store-logo defaults now come from the registry, so relative imports load the same way.
  const req = (name) => (name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts'))) : require(name));
  vm.runInNewContext(output, { module, exports: module.exports, require: req }, { filename });
  return module.exports;
}

const { sanitizeStoreLogoSvg } = load('features/keystone/utils/storeLogo.ts');
const { DEFAULT_STORE_LOGO_COLOR, normalizeStoreLogoColor } = load('features/lib/store-logo.ts');
const { LOGO_ICONS } = load('features/platform/store-settings/lib/icon-registry.ts');

// Mirrors updateStoreSettings in features/platform/store-settings/actions/index.ts.
function payload(data) {
  const sanitizedData = {
    ...data,
    logoIcon: data.logoIcon ? sanitizeStoreLogoSvg(data.logoIcon) : undefined,
    logoColor: data.logoColor === undefined ? undefined : normalizeStoreLogoColor(data.logoColor),
  };
  if (data.logoIcon && !sanitizedData.logoIcon) return { success: false, error: 'Invalid SVG format' };
  return { success: true, data: sanitizedData };
}

test('the action composes sanitize, normalize, updateDealershipProfile and revalidate', () => {
  const source = fs.readFileSync(path.join(root, 'features/platform/store-settings/actions/index.ts'), 'utf8');
  assert.match(source, /const logoIcon = sanitizeStoreLogoSvg\(submittedMark\)/);
  assert.match(source, /logoColor: normalizeStoreLogoColor\(input\.logoColor\)/);
  assert.match(source, /updateDealershipProfile\(where: \{ id: \$id \}, data: \$data\)/);
  assert.match(source, /revalidatePath\('\/', 'layout'\)/);
  // The old path is the E-commerce sanitizer.
  assert.match(fs.readFileSync(path.join(root, 'features/lib/sanitize-store-logo.ts'), 'utf8'), /from '\.\.\/keystone\/utils\/storeLogo'/);
});

test('a preset icon and hue reach the mutation unchanged', () => {
  const icon = LOGO_ICONS.find((entry) => entry.id === 'acme-corp').lightSvg;
  assert.deepEqual(payload({ name: 'Impossible', logoIcon: icon, logoColor: '120' }).data,
    { name: 'Impossible', logoIcon: icon, logoColor: '120' });
});

test('every preset survives the sanitizer', () => {
  for (const icon of LOGO_ICONS) assert.equal(payload({ logoIcon: icon.lightSvg }).success, true, icon.id);
});

test('a pasted custom SVG is kept, trimmed', () => {
  const svg = '<svg fill="none" height="100%" viewBox="0 0 48 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path d="m48 11h-17z" fill="#087443"/></svg>';
  assert.equal(payload({ logoIcon: `\n${svg} ` }).data.logoIcon, svg);
});

test('the hue is normalized to 0-359', () => {
  assert.equal(payload({ logoColor: '-90' }).data.logoColor, '270');
  assert.equal(payload({ logoColor: '400' }).data.logoColor, '40');
  assert.equal(payload({ logoColor: 'red' }).data.logoColor, DEFAULT_STORE_LOGO_COLOR);
});

test('an unsafe SVG rejects the save', () => {
  assert.deepEqual(payload({ logoIcon: '<svg onload="alert(1)"></svg>' }), { success: false, error: 'Invalid SVG format' });
});

test('the storefront always keeps an icon beside the name; the text lockup stays', () => {
  const business = fs.readFileSync(path.join(root, 'features/storefront/lib/business.ts'), 'utf8');
  assert.doesNotMatch(business, /svg !== DEFAULT_STORE_LOGO_ICON \? svg : ''/);
  assert.match(business, /sanitizeStoreLogoSvg\(DEFAULT_STORE_LOGO_ICON\)/);
  const mark = fs.readFileSync(path.join(root, 'features/storefront/components/BrandMark.tsx'), 'utf8');
  assert.match(mark, /<StoreLogo svg=\{business\.logoIcon\}/);
  assert.match(mark, /splitBrandName\(business\.shortName\)/);
  const { DEFAULT_STORE_LOGO_ICON } = load('features/lib/store-logo.ts');
  assert.ok(sanitizeStoreLogoSvg(DEFAULT_STORE_LOGO_ICON));
});
