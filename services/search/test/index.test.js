const test = require('node:test');
const assert = require('node:assert/strict');
const { searchCatalog, getCatalogItem } = require('../index.js');

test('search/searchCatalog matches item names', () => {
  const results = searchCatalog('server');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'item_1');
});

test('search/searchCatalog matches tags', () => {
  const results = searchCatalog('postgres');
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Managed Database');
});

test('search/searchCatalog handles empty or null queries safely', () => {
  assert.deepEqual(searchCatalog(''), []);
  assert.deepEqual(searchCatalog(null), []);
});

test('search/getCatalogItem retrieves correct item', () => {
  const item = getCatalogItem('item_3');
  assert.notEqual(item, null);
  assert.equal(item.name, 'Global CDN');
});
