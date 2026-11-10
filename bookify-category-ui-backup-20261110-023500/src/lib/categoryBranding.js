import { api } from '../lib/api.js';

/** Merge public category records with branding metadata from the new endpoint. */
export async function getCategoriesWithBranding() {
  const [base, branding] = await Promise.all([
    api('/api/categories?limit=100'),
    api('/api/categories/branding')
  ]);
  const map = new Map((branding.categories || []).map(c => [String(c.id), c]));
  return (base.categories || []).map(c => ({ ...c, ...map.get(String(c.id)) }));
}
