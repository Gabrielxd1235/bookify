import React from 'react';
import {useAuth} from './context/AuthContext.jsx';
import {navigate,useRoute,Link} from './lib/router.jsx';
import {PublicLayout,DashboardLayout} from './components/Layout.jsx';
import {Loading,Empty,Button,PageHead} from './components/UI.jsx';
import {Icon} from './components/Icon.jsx';
import {Landing,Discover,BusinessDetail} from './pages/Public.jsx';
import {AuthPage,Profile,Bookings,BecomeOwner} from './pages/Account.jsx';
import {ClientHome} from './pages/Client.jsx';
import {Checkout} from './pages/Checkout.jsx';
import {OwnerHome,OwnerBusinesses,OwnerServices,OwnerHours,OwnerReservations,OwnerMedia} from './pages/Owner.jsx';
import {AdminHome,AdminApplications,AdminUsers,AdminBusinesses,AdminCategories,AdminReservations} from './pages/Admin.jsx';

const ownerRoutes = {
  '/owner':OwnerHome,
  '/owner/businesses':OwnerBusinesses,
  '/owner/services':OwnerServices,
  '/owner/hours':OwnerHours,
  '/owner/reservations':OwnerReservations,
  '/owner/media':OwnerMedia,
};
const adminRoutes = {
  '/admin':AdminHome,
  '/admin/applications':AdminApplications,
  '/admin/users':AdminUsers,
  '/admin/businesses':AdminBusinesses,
  '/admin/categories':AdminCategories,
  '/admin/reservations':AdminReservations,
};
function SignInRedirect({pathname}){React.useEffect(()=>{navigate(`/auth?next=${encodeURIComponent(pathname)}`,true);},[pathname]);return <Loading label="Redirecting to sign in..."/>;}
function AccessDenied({role}){return <main className="page-public container"><Empty icon="shield" title="Access restricted" description={role==='ADMIN'?'This area is reserved for BOOKIFY administrators.':'Only approved business owners can access this workspace.'} action={<Link to="/" className="btn btn-primary">Return home <Icon name="arrow" size={18}/></Link>}/></main>;}
export default function App(){const {pathname,search}=useRoute();const {user,loading}=useAuth();if(loading)return <div className="app-loading"><div className="loading-brand"><Icon name="calendar-check" size={37}/><strong>bookify<span>.</span></strong></div><Loading label="Preparing your experience..."/></div>;
if(pathname==='/auth')return <PublicLayout><AuthPage search={search}/></PublicLayout>;
if(pathname==='/')return <PublicLayout><Landing/></PublicLayout>;
if(pathname==='/discover')return <PublicLayout><Discover search={search}/></PublicLayout>;
if(/^\/business\/[1-9]\d*$/.test(pathname))return <PublicLayout><BusinessDetail key={pathname} id={pathname.split('/')[2]}/></PublicLayout>;
if(/^\/checkout\/[1-9]\d*$/.test(pathname)){
  if(!user)return <SignInRedirect pathname={pathname}/>;
  return <DashboardLayout kind={user.role==='ADMIN'?'admin':user.role==='BUSINESS_OWNER'?'owner':'client'} path='/bookings'><Checkout key={pathname} id={pathname.split('/')[2]}/></DashboardLayout>;
}
if(pathname==='/dashboard'||pathname==='/bookings'||pathname==='/profile'||pathname==='/become-owner'){
  if(!user)return <SignInRedirect pathname={pathname}/>;
  const Page=pathname==='/dashboard'?ClientHome:pathname==='/bookings'?Bookings:pathname==='/profile'?Profile:BecomeOwner;
  return <DashboardLayout kind={user.role==='ADMIN'?'admin':user.role==='BUSINESS_OWNER'?'owner':'client'} path={pathname}><Page/></DashboardLayout>;
}
if(Object.hasOwn(ownerRoutes,pathname)){
  if(!user)return <SignInRedirect pathname={pathname}/>;
  if(user.role!=='BUSINESS_OWNER')return <PublicLayout><AccessDenied role="BUSINESS_OWNER"/></PublicLayout>;
  const Page=ownerRoutes[pathname];return <DashboardLayout kind="owner" path={pathname}><Page/></DashboardLayout>;
}
if(Object.hasOwn(adminRoutes,pathname)){
  if(!user)return <SignInRedirect pathname={pathname}/>;
  if(user.role!=='ADMIN')return <PublicLayout><AccessDenied role="ADMIN"/></PublicLayout>;
  const Page=adminRoutes[pathname];return <DashboardLayout kind="admin" path={pathname}><Page/></DashboardLayout>;
}
return <PublicLayout><main className="page-public container"><Empty icon="search" title="We couldn't find that page" description="The link may be outdated, or the page may have moved." action={<Button onClick={()=>navigate('/')} icon="arrow">Back to BOOKIFY</Button>}/></main></PublicLayout>;
}
