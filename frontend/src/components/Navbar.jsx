import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useAuth} from '../context/AuthContext.jsx';
import {Brand} from './UI.jsx';
import {Icon} from './Icon.jsx';
import {initials} from '../lib/format.js';
import {Link, navigate, useRoute} from '../lib/router.jsx';
import {publicNavigation, workspaceNavigation, workspaceForRole, roleLabel, isNavigationActive} from '../lib/navigation.js';

export function UserAvatar({user, className = ''}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user?.avatar_url]);
  return <span className={`avatar-sm bookify-nav-avatar ${className}`} aria-hidden="true">
    {user?.avatar_url && !failed
      ? <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : initials(user?.full_name || 'BOOKIFY')}
  </span>;
}

/** Compact account menu reused by the public navbar and all dashboard roles. */
export function AccountMenu({compact = false}) {
  const {user, logout} = useAuth();
  const {pathname, search} = useRoute();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const trigger = useRef(null);

  useEffect(() => setOpen(false), [pathname, search]);
  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector('.bookify-account-links a')?.focus();
    const outside = event => { if (!wrap.current?.contains(event.target)) setOpen(false); };
    const keydown = event => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keydown); };
  }, [open]);

  if (!user) return null;
  const workspace = workspaceForRole(user.role);
  const quick = user.role === 'ADMIN'
    ? [{to: workspace, label: 'Administration', icon: 'shield'}]
    : user.role === 'BUSINESS_OWNER'
      ? [{to: workspace, label: 'Business workspace', icon: 'store'}, {to: '/bookings', label: 'My appointments', icon: 'calendar-check'}]
      : [{to: '/dashboard', label: 'My dashboard', icon: 'grid'}, {to: '/bookings', label: 'My bookings', icon: 'calendar-check'}];
  const signOut = async () => { setOpen(false); await logout(); navigate('/'); };

  return <div className="bookify-account" ref={wrap}>
    <button type="button" className={`bookify-account-trigger ${compact ? 'is-compact' : ''}`} ref={trigger}
      aria-label="Open account menu" aria-haspopup="true" aria-expanded={open}
      onClick={() => setOpen(previous => !previous)}>
      <UserAvatar user={user}/>
      {!compact && <span className="bookify-account-summary"><strong>{user.full_name?.split(' ')[0] || 'Account'}</strong><small>{roleLabel(user.role)}</small></span>}
      <Icon name="chevron-down" size={15} className="bookify-account-chevron"/>
    </button>
    {open && <div className="bookify-account-popover" role="group" aria-label="Account options">
      <div className="bookify-account-intro"><UserAvatar user={user}/><div><strong>{user.full_name || 'BOOKIFY user'}</strong><small>{user.email || roleLabel(user.role)}</small></div></div>
      <span className="bookify-account-role"><Icon name="shield" size={13}/>{roleLabel(user.role)}</span>
      <div className="bookify-account-links">
        {quick.map((item, i) => <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="bookify-account-link">
          <Icon name={item.icon} size={17}/>{item.label}
        </Link>)}
        <Link to="/profile" onClick={() => setOpen(false)} className="bookify-account-link"><Icon name="user" size={17}/>My profile</Link>
        <Link to="/discover" onClick={() => setOpen(false)} className="bookify-account-link"><Icon name="search" size={17}/>Explore BOOKIFY</Link>
      </div>
      <button type="button" className="bookify-account-logout" onClick={signOut}><Icon name="logout" size={17}/>Log out</button>
    </div>}
  </div>;
}

function MobileNavigation({open, close, opener}) {
  const {user, logout} = useAuth();
  const first = useRef(null);
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const formerFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    first.current?.focus();
    const keys = event => {
      if (event.key === 'Escape') {event.preventDefault(); close();}
      if (event.key === 'Tab') {
        const focusables = [...panel.current.querySelectorAll('a[href],button:not([disabled])')];
        const start = focusables[0]; const end = focusables.at(-1);
        if (event.shiftKey && document.activeElement === start) {event.preventDefault(); end?.focus();}
        else if (!event.shiftKey && document.activeElement === end) {event.preventDefault(); start?.focus();}
      }
    };
    document.addEventListener('keydown', keys);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', keys);
      if (opener.current?.isConnected) opener.current.focus();
      else if (formerFocus?.isConnected) formerFocus.focus();
    };
  }, [open, close, opener]);
  if (!open) return null;
  const roleKind = user?.role === 'ADMIN' ? 'admin' : user?.role === 'BUSINESS_OWNER' ? 'owner' : 'client';
  const destination = user ? workspaceForRole(user.role) : '/auth?mode=register';
  const items = user ? workspaceNavigation(roleKind) : [{to: '/auth', label: 'Sign in', icon: 'user'}, {to: '/auth?mode=register', label: 'Create an account', icon: 'plus'}];
  const signOut = async () => {close(); await logout(); navigate('/');};
  return createPortal(<div className="bookify-mobile-layer" id="bookify-mobile-navigation">
    <button className="bookify-mobile-backdrop" type="button" aria-label="Close navigation" onClick={close}/>
    <section className="bookify-mobile-panel" role="dialog" aria-modal="true" aria-label="Main navigation" ref={panel}>
      <div className="bookify-mobile-panel-head"><Brand small/><button ref={first} type="button" className="bookify-mobile-close" aria-label="Close navigation" onClick={close}><Icon name="x"/></button></div>
      {user && <div className="bookify-mobile-identity"><UserAvatar user={user}/><div><strong>{user.full_name || 'BOOKIFY user'}</strong><small>{roleLabel(user.role)}</small></div></div>}
      <div className="bookify-mobile-scroll">
        <div className="bookify-mobile-section-label">DISCOVER</div>
        {publicNavigation().map(item => <Link key={item.to} to={item.to} onClick={close} className="bookify-mobile-link"><Icon name={item.icon} size={19}/>{item.label}<Icon name="chevron-right" size={14}/></Link>)}
        <div className="bookify-mobile-section-label">{user ? 'YOUR BOOKIFY' : 'GET STARTED'}</div>
        {items.map(item => <Link key={item.to} to={item.to} onClick={close} className="bookify-mobile-link"><Icon name={item.icon} size={19}/>{item.label}<Icon name="chevron-right" size={14}/></Link>)}
      </div>
      <div className="bookify-mobile-panel-foot">
        {user ? <button type="button" className="bookify-mobile-signout" onClick={signOut}><Icon name="logout" size={19}/>Log out</button>
          : <Link to={destination} onClick={close} className="btn btn-primary bookify-mobile-cta">Get started <Icon name="arrow" size={17}/></Link>}
      </div>
    </section>
  </div>, document.body);
}

export function Navbar() {
  const {user} = useAuth();
  const {pathname, search} = useRoute();
  const [mobile, setMobile] = useState(false);
  const opener = useRef(null);
  const closeMobile = React.useCallback(() => setMobile(false), []);
  useEffect(() => setMobile(false), [pathname, search]);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1181px)');
    const closeOnDesktop = event => { if (event.matches) setMobile(false); };
    wide.addEventListener('change', closeOnDesktop);
    return () => wide.removeEventListener('change', closeOnDesktop);
  }, []);
  const roleDestination = user ? workspaceForRole(user.role) : null;
  const actionLabel = user?.role === 'ADMIN' ? 'Administration' : user?.role === 'BUSINESS_OWNER' ? 'Business workspace' : 'My bookings';
  const actionTo = user?.role === 'CLIENT' ? '/bookings' : roleDestination;

  return <>
    <header className="site-header bookify-public-header">
      <div className="container header-inner bookify-header-inner">
        <Brand/>
        <nav className="public-nav bookify-public-links" aria-label="Main navigation">
          {publicNavigation().slice(0, 4).map(item => <Link key={item.to} to={item.to}
            className={isNavigationActive(item.to, pathname) ? 'bookify-nav-active' : ''}
            aria-current={item.to === pathname ? 'page' : undefined}>{item.label === 'Explore services' ? 'Explore' : item.label}</Link>)}
          {user?.role === 'CLIENT' && <Link to="/bookings" className={pathname === '/bookings' ? 'bookify-nav-active' : ''}>My bookings</Link>}
        </nav>
        <div className="header-actions bookify-header-actions">
          {user ? <>
              <Link className="bookify-header-cta" to={actionTo}><Icon name={user.role === 'ADMIN' ? 'shield' : user.role === 'BUSINESS_OWNER' ? 'store' : 'calendar-check'} size={16}/>{actionLabel}</Link>
              <AccountMenu/>
            </> : <>
              <Link className="nav-login" to="/auth">Sign in</Link>
              <Link className="btn btn-primary btn-small bookify-register-cta" to="/auth?mode=register">Get started <Icon name="arrow" size={15}/></Link>
            </>}
          <button ref={opener} type="button" className="bookify-nav-toggle" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile}
            aria-controls={mobile ? "bookify-mobile-navigation" : undefined} onClick={() => setMobile(value => !value)}>
            <Icon name={mobile ? 'x' : 'menu'} size={23}/>
          </button>
        </div>
      </div>
    </header>
    <MobileNavigation open={mobile} close={closeMobile} opener={opener}/>
  </>;
}
