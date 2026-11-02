// Photos are part of the approved listing: a real photo change must reopen review (the storefront would
// otherwise hide the unit on a stale hash), while a no-op arrange must leave the approval alone.
// Run: node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(output, { module: loaded, exports: loaded.exports, require: id => mocks[id] || require(id) }, { filename });
  return loaded.exports;
}

const events = load('features/keystone/lifecycle/domainEvents.ts');
const publication = load('features/keystone/lifecycle/inventoryPublication.ts', { './domainEvents': events });
const { merchandisingSnapshot, assertCurrentInventoryApproval, photoArrangementUnchanged } = publication;

function approvedStock(images) {
  const stock = {
    stockNumber: 'SMC-2401', merchandisingStatus: 'approved',
    vehicle: { id: 'veh1', vin: 'WBA43FJ05R7903417', year: 2024, make: 'BMW', model: '530i', trim: 'M Sport', description: 'Certified', priceCents: 4890000, images },
  };
  const snapshot = merchandisingSnapshot(stock);
  stock.approvedRevisionHash = events.domainEventRequestHash(snapshot);
  stock.merchandisingVersions = [{ id: 'v1', version: 1, status: 'approved', snapshot }];
  return stock;
}

const photos = () => [
  { id: 'a', imagePath: '', image_id: 'hero', image_extension: 'jpg', sortOrder: 0, isPrimary: true },
  { id: 'b', imagePath: '', image_id: 'side', image_extension: 'jpg', sortOrder: 1, isPrimary: false },
  { id: 'c', imagePath: '', image_id: 'cabin', image_extension: 'jpg', sortOrder: 2, isPrimary: false },
];

test('an approved listing passes the storefront approval check as reviewed', () => {
  assert.doesNotThrow(() => assertCurrentInventoryApproval(approvedStock(photos())));
});

test('adding, removing, swapping or reordering a photo invalidates the approval, so review must reopen', () => {
  const changes = {
    add: images => [...images, { id: 'd', imagePath: '', image_id: 'rear', image_extension: 'jpg', sortOrder: 3, isPrimary: false }],
    remove: images => images.slice(0, 2),
    swapFile: images => images.map(image => image.id === 'a' ? { ...image, image_id: 'other' } : image),
    newPrimary: images => images.map(image => ({ ...image, isPrimary: image.id === 'b', sortOrder: image.id === 'b' ? 0 : image.id === 'a' ? 1 : 2 })),
  };
  for (const [name, change] of Object.entries(changes)) {
    const stock = approvedStock(photos());
    stock.vehicle.images = change(stock.vehicle.images);
    assert.throws(() => assertCurrentInventoryApproval(stock), /changed after review/, name);
  }
});

test('arranging photos into the order they already have is a no-op', () => {
  assert.equal(photoArrangementUnchanged(photos(), ['a', 'b', 'c']), true);
});

test('a real reorder, a new primary, or normalising stored sort gaps is a change', () => {
  assert.equal(photoArrangementUnchanged(photos(), ['a', 'c', 'b']), false);
  assert.equal(photoArrangementUnchanged(photos(), ['b', 'a', 'c']), false);
  const gapped = photos().map((image, index) => ({ ...image, sortOrder: index + 1 }));
  assert.equal(photoArrangementUnchanged(gapped, ['a', 'b', 'c']), false);
  assert.equal(photoArrangementUnchanged(photos(), ['a', 'b']), false);
});

test('the photo commands keep the rule: real changes return to draft, a no-op arrange returns first', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../features/keystone/mutations/inventoryPhotoCommands.ts'), 'utf8');
  assert.equal(source.match(/await returnListingToDraft\(/g).length, 3);
  const arrange = source.slice(source.indexOf('async function arrangeInventoryVehiclePhotosCommand'), source.indexOf('async function removeInventoryVehiclePhotoCommand'));
  assert.ok(arrange.indexOf('photoArrangementUnchanged(current, imageIds)) return false') < arrange.indexOf('returnListingToDraft('));
});
