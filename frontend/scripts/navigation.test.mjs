import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceNavigation, workspaceForRole, roleLabel, publicNavigation, currentSection, isNavigationActive} from '../src/lib/navigation.js';

test('anonymous public navigation includes discovery and landing sections', () => {
  const links=publicNavigation().map(x=>x.to);
  assert.ok(links.includes('/discover'));
  assert.ok(links.includes('/#how-it-works'));
});
test('client navigation exposes bookings and business onboarding but not administration', () => {
  const urls=workspaceNavigation('client').map(item=>item.to);
  assert.ok(urls.includes('/bookings'));
  assert.ok(urls.includes('/become-owner'));
  assert.ok(!urls.includes('/admin'));
});
test('owner navigation exposes current establishment and appointments', () => {
  const urls=workspaceNavigation('owner').map(item=>item.to);
  assert.ok(urls.includes('/owner/media'));
  assert.ok(urls.includes('/bookings'));
  assert.ok(!urls.includes('/admin'));
});
test('admin links are only in admin presentation and not registration', () => {
  const urls=workspaceNavigation('admin').map(item=>item.to);
  assert.ok(urls.includes('/admin/applications'));
  assert.ok(urls.includes('/admin/categories'));
  assert.ok(!urls.includes('/become-owner'));
});
test('workspace destinations are based on authenticated role',()=>{
  assert.equal(workspaceForRole('ADMIN'),'/admin');
  assert.equal(workspaceForRole('BUSINESS_OWNER'),'/owner');
  assert.equal(workspaceForRole('CLIENT'),'/dashboard');
  assert.equal(roleLabel('BUSINESS_OWNER'),'Business owner');
});
test('active links do not highlight overview when inside another page',()=>{
  assert.equal(isNavigationActive('/owner','/owner/media'),false);
  assert.equal(isNavigationActive('/owner/media','/owner/media'),true);
  assert.equal(isNavigationActive('/discover','/business/12'),true);
  assert.equal(isNavigationActive('/','/discover'),false);
  assert.equal(isNavigationActive('/#why-bookify','/'),false);
  assert.equal(currentSection('admin','/admin/categories'),'Categories');
});
