import React, {useEffect, useRef, useState} from 'react';
import {useAuth} from '../context/AuthContext.jsx';
import {Brand} from './UI.jsx';
import {Link, navigate, useRoute} from '../lib/router.jsx';
import {Icon} from './Icon.jsx';
import {initials} from '../lib/format.js';
import {Navbar, AccountMenu, UserAvatar} from './Navbar.jsx';
import {workspaceNavigation, workspaceTitle, currentSection, isNavigationActive, roleLabel} from '../lib/navigation.js';

export const Header = Navbar;

export function Footer() {
  const {user} = useAuth();
  const bookingTarget = user ? '/bookings' : '/auth?next=%2Fbookings';
  const businessTarget = user?.role === 'BUSINESS_OWNER' ? '/owner' : user?.role === 'ADMIN' ? '/admin' : user ? '/become-owner' : '/auth?mode=register';
  return <footer className="footer">
    <div className="container footer-grid">
      <div><Brand light/><p>Your next great moment, thoughtfully booked.</p></div>
      <div><strong>Explore</strong><Link to="/discover">All services</Link><Link to="/discover">Local businesses</Link></div>
      <div><strong>Your account</strong><Link to={bookingTarget}>My bookings</Link><Link to={businessTarget}>{user?.role === 'ADMIN' ? 'Administration' : user?.role === 'BUSINESS_OWNER' ? 'My businesses' : 'List your business'}</Link></div>
      <div><strong>BOOKIFY</strong><span>Made for local communities.</span><span>Arequipa, Peru</span></div>
    </div>
    <div className="container footer-bottom"><span>© 2026 BOOKIFY. All rights reserved.</span><span>Find your moment.</span></div>
  </footer>;
}

export function PublicLayout({children}) {
  const {pathname} = useRoute();
  return <div className="app-root">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Navbar/>
    <div id="main-content" tabIndex={-1} className="public-content page-transition" key={pathname}>{children}</div>
    <Footer/>
  </div>;
}

export function DashboardLayout({kind = 'client', path, children}) {
  const {user, logout} = useAuth();
  const [open, setOpen] = useState(false);
  const openButton = useRef(null);
  const closeButton = useRef(null);
  const previousOpen = useRef(false);
  const rows = workspaceNavigation(kind);
  const title = workspaceTitle(kind);
  const section = currentSection(kind, path);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 761px)');
    const closeOnDesktop = event => {if (event.matches) setOpen(false);};
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!open) {
      if (previousOpen.current) openButton.current?.focus();
      previousOpen.current = false;
      return;
    }
    previousOpen.current = true;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') {event.preventDefault(); setOpen(false);}
      if (event.key === 'Tab') {
        const sidebar = document.getElementById('workspace-navigation');
        const nodes = [...(sidebar?.querySelectorAll('a[href],button:not(:disabled)') || [])];
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', onKey);};
  }, [open]);

  async function signOut() { setOpen(false); await logout(); navigate('/'); }

  return <div className="dashboard-shell bookify-dashboard">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside id="workspace-navigation" aria-label={`${title} navigation`} className={`sidebar bookify-sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-logo bookify-sidebar-head"><Brand small/>
        <button ref={closeButton} type="button" className="bookify-sidebar-close" onClick={() => setOpen(false)} aria-label="Close workspace navigation"><Icon name="x" size={20}/></button>
      </div>
      <div className="sidebar-section-label">{title.toUpperCase()}</div>
      <nav className="sidebar-nav" aria-label={title}>
        {rows.map(item => <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
          aria-current={isNavigationActive(item.to, path) ? 'page' : undefined}
          className={`sidebar-link ${isNavigationActive(item.to, path) ? 'selected' : ''}`}>
          <Icon name={item.icon} size={19}/><span>{item.label}</span>
          {isNavigationActive(item.to, path) ? <span className="selected-bar" aria-hidden="true"/> : null}
        </Link>)}
      </nav>
      <div className="sidebar-bottom">
        <Link className="sidebar-back" to="/discover" onClick={() => setOpen(false)}><Icon name="arrow-left" size={16}/>Browse BOOKIFY</Link>
        <button type="button" className="sidebar-link signout" onClick={signOut}><Icon name="logout" size={19}/>Log out</button>
        <div className="sidebar-person"><UserAvatar user={user}/><div><strong>{user?.full_name || 'BOOKIFY user'}</strong><small>{roleLabel(user?.role)}</small></div></div>
      </div>
    </aside>
    {open && <button type="button" className="sidebar-scrim" aria-label="Close workspace menu" onClick={() => setOpen(false)}/>}
    <div className="workspace">
      <header className="workspace-topbar bookify-workspace-topbar">
        <button ref={openButton} type="button" className="icon-btn workspace-menu bookify-workspace-menu" aria-label="Open workspace menu" aria-expanded={open}
          aria-controls="workspace-navigation" onClick={() => setOpen(true)}><Icon name="menu" size={22}/></button>
        <div className="workspace-crumb bookify-workspace-crumb"><span>BOOKIFY</span><Icon name="chevron-right" size={13}/><span className="bookify-crumb-workspace">{title}</span><Icon className="bookify-crumb-section-divider" name="chevron-right" size={13}/><strong className="bookify-crumb-section">{section}</strong></div>
        <div className="topbar-right bookify-workspace-actions">
          <span className="secure-indicator"><Icon name="shield" size={15}/>Secure workspace</span>
          <AccountMenu compact/>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="workspace-main"><div className="page-transition" key={path}>{children}</div></main>
    </div>
  </div>;
}
