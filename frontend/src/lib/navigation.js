/** Client-side navigation presentation. Server-side RBAC remains authoritative. */
export const workspaceNames = Object.freeze({
  CLIENT: 'My BOOKIFY',
  BUSINESS_OWNER: 'Business workspace',
  ADMIN: 'Administration',
});

const publicItems = Object.freeze([
  {to: '/', label: 'Home', icon: 'home'},
  {to: '/discover', label: 'Explore services', icon: 'search'},
  {to: '/#how-it-works', label: 'How it works', icon: 'calendar-check'},
  {to: '/#why-bookify', label: 'Why BOOKIFY', icon: 'star'},
]);

const clientItems = Object.freeze([
  {to: '/dashboard', label: 'Overview', icon: 'grid'},
  {to: '/discover', label: 'Explore services', icon: 'search'},
  {to: '/bookings', label: 'My bookings', icon: 'calendar-check'},
  {to: '/profile', label: 'My profile', icon: 'user'},
  {to: '/become-owner', label: 'Become a business owner', icon: 'store'},
]);

const ownerItems = Object.freeze([
  {to: '/owner', label: 'Overview', icon: 'grid'},
  {to: '/owner/businesses', label: 'My businesses', icon: 'store'},
  {to: '/owner/services', label: 'Services', icon: 'scissors'},
  {to: '/owner/hours', label: 'Business hours', icon: 'clock'},
  {to: '/owner/reservations', label: 'Bookings received', icon: 'calendar'},
  {to: '/owner/media', label: 'Photos & branding', icon: 'image'},
  {to: '/bookings', label: 'My appointments', icon: 'calendar-check'},
  {to: '/profile', label: 'My profile', icon: 'user'},
]);

const adminItems = Object.freeze([
  {to: '/admin', label: 'Overview', icon: 'grid'},
  {to: '/admin/applications', label: 'Owner applications', icon: 'shield'},
  {to: '/admin/users', label: 'Users', icon: 'users'},
  {to: '/admin/businesses', label: 'Businesses', icon: 'store'},
  {to: '/admin/categories', label: 'Categories', icon: 'tag'},
  {to: '/admin/reservations', label: 'Reservations', icon: 'calendar'},
  {to: '/profile', label: 'My profile', icon: 'user'},
]);

export function workspaceForRole(role) {
  if (role === 'ADMIN') return '/admin';
  if (role === 'BUSINESS_OWNER') return '/owner';
  return '/dashboard';
}

export function roleLabel(role) {
  if (role === 'ADMIN') return 'Administrator';
  if (role === 'BUSINESS_OWNER') return 'Business owner';
  return 'Client';
}

export function publicNavigation() { return publicItems; }
export function workspaceNavigation(kind = 'client') {
  if (kind === 'admin') return adminItems;
  if (kind === 'owner') return ownerItems;
  return clientItems;
}

export function workspaceTitle(kind) {
  return kind === 'admin' ? workspaceNames.ADMIN : kind === 'owner' ? workspaceNames.BUSINESS_OWNER : workspaceNames.CLIENT;
}

export function currentSection(kind, path) {
  const items = workspaceNavigation(kind);
  const exact = items.find(item => item.to === path);
  if (exact) return exact.label;
  if (path.startsWith('/checkout/')) return 'Checkout';
  return 'Overview';
}

export function isNavigationActive(to, pathname) {
  if (to === '/') return pathname === '/';
  if (to.includes('#')) return false;
  if (to === '/discover') return pathname === '/discover' || pathname.startsWith('/business/');
  if (to === '/owner' || to === '/admin' || to === '/dashboard') return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}
