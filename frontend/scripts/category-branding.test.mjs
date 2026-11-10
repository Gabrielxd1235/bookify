import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync('src/lib/categoryBranding.js','utf8');
const app=readFileSync('src/App.jsx','utf8');
const publicPage=readFileSync('src/pages/Public.jsx','utf8');
const cards=readFileSync('src/components/CategoryCard.jsx','utf8');
test('the admin route uses the image-and-icon editor, not the legacy editor',()=>{
  assert.match(app,/AdminCategoryManager as AdminCategories/);
  assert.match(app,/'\/admin\/categories':AdminCategories/);
});
test('the public catalog requests category branding metadata',()=>{
  assert.match(publicPage,/getCategoriesWithBranding\(/);
  assert.match(source,/\/api\/categories\/branding/);
});
test('category card does not reference local or stock category photos',()=>{
  assert.doesNotMatch(cards,/localImage|unsplash\.com|images\/categories/);
  assert.match(cards,/presentation\.imageUrl/);
});
test('category image upload is authenticated through the application API',()=>{
  const source=readFileSync('src/components/AdminCategoryManager.jsx','utf8');
  assert.match(source,/upload\(`\/api\/categories\/\$\{categoryId\}\/image`/);
  assert.match(source,/PATCH.*icon_key/);
  assert.match(source, /mergeCategoryBranding/);
});
