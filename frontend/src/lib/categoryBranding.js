import { api } from './api.js';

/** Pure merge used by the public catalog and the admin category editor. */
export function mergeCategoryBranding(categories = [], branding = []) {
  const byId = new Map(branding.map(entry => [String(entry.id), entry]));
  return categories.map(category => ({
    ...category,
    ...(byId.get(String(category.id)) || {}),
  }));
}

/**
 * The primary category list continues to work if the branding add-on is not
 * installed yet. Category images appear once the backend serves metadata.
 */
export async function getCategoriesWithBranding() {
  const primary = await api('/api/categories?limit=100');
  const categories = primary.categories || [];
  try {
    const result = await api('/api/categories/branding');
    return mergeCategoryBranding(categories, result.categories || []);
  } catch (error) {
    // Do not hide the public catalog just because the optional media service
    // has not been deployed. The admin interface reports that problem clearly.
    console.warn('Category images unavailable:', error.message);
    return categories;
  }
}
