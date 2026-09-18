/**
 * Search Service
 * Standalone service with NO internal dependencies on other monorepo services.
 */

const mockCatalog = [
  { id: 'item_1', name: 'Cloud Server Pro', category: 'compute', tags: ['cloud', 'vm', 'linux'] },
  { id: 'item_2', name: 'Managed Database', category: 'storage', tags: ['sql', 'postgres', 'data'] },
  { id: 'item_3', name: 'Global CDN', category: 'network', tags: ['cdn', 'edge', 'cache'] },
  { id: 'item_4', name: 'AI Inference Node', category: 'compute', tags: ['ai', 'gpu', 'inference'] }
];

function searchCatalog(query) {
  if (!query || typeof query !== 'string') {
    return [];
  }

  const q = query.toLowerCase().trim();
  return mockCatalog.filter(item => {
    return (
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.tags.some(tag => tag.toLowerCase().includes(q))
    );
  });
}

function getCatalogItem(id) {
  return mockCatalog.find(item => item.id === id) || null;
}

module.exports = {
  searchCatalog,
  getCatalogItem,
  mockCatalog
};

// minor feature comment in search
