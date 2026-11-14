import React,{useEffect,useState} from 'react';
import {api,endpoint} from '../lib/api.js';
import {useToast} from '../context/ToastContext.jsx';
import {dateTime,money,compact,statusTone,statusLabel,initials} from '../lib/format.js';
import {Link} from '../lib/router.jsx';
import {Tabs,Button,PageHead,Card,Stat,Input,Textarea,Select,Status,Loading,Alert,Empty,Pagination,Confirm,Skeleton,Breakdown} from '../components/UI.jsx';
import {useReservationNames,clientLabel} from '../lib/reservationNames.js';
import {Icon} from '../components/Icon.jsx';

const adminStatusOrder=['CONFIRMED','COMPLETED','PENDING_PAYMENT','CANCELLED','EXPIRED','PAYMENT_FAILED','NO_SHOW'];
function useCategoryNames(){const [names,setNames]=useState({});useEffect(()=>{let live=true;api('/api/categories').then(d=>{if(live)setNames(Object.fromEntries((d.categories||[]).map(c=>[String(c.id),c.name])));}).catch(()=>{});return()=>{live=false;};},[]);return id=>names[String(id)]||`Category #${id}`;}

export function AdminHome(){
  const [overview,setOverview]=useState(null);
  const [recent,setRecent]=useState([]);
  const [legacy,setLegacy]=useState({users:null,businesses:null,categories:null});
  const [applications,setApplications]=useState([]);
  const [pending,setPending]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let live=true;
    (async()=>{
      const [o,a]=await Promise.allSettled([api('/api/admin/overview'),api('/api/admin/business-applications?status=PENDING&page=1&limit=5')]);
      if(!live)return;
      if(a.status==='fulfilled'){setApplications(a.value.applications||[]);setPending(a.value.pagination?.total??a.value.applications?.length??0);}
      if(o.status==='fulfilled'&&o.value.overview){setOverview(o.value.overview);setRecent(o.value.recentReservations||[]);}
      else{
        // Older API versions do not expose the overview: fall back to the public counters.
        const [u,b,c]=await Promise.allSettled([api('/api/admin/users?page=1&limit=1'),api('/api/businesses?page=1&limit=1'),api('/api/categories')]);
        if(!live)return;
        setLegacy({users:u.status==='fulfilled'?(u.value.pagination?.total??null):null,businesses:b.status==='fulfilled'?(b.value.pagination?.total??null):null,categories:c.status==='fulfilled'?(c.value.categories?.length??null):null});
      }
      setLoading(false);
    })();
    return()=>{live=false;};
  },[]);
  const names=useReservationNames(recent);
  const pendingCount=overview?.pendingApplications??pending;
  const show=value=>loading?'—':value??'N/A';
  const statusItems=adminStatusOrder.filter(status=>overview?.reservations?.byStatus?.[status]).map(status=>({label:statusLabel(status),value:overview.reservations.byStatus[status],tone:statusTone(status)}));
  const communityItems=overview?[{label:'Clients',value:overview.users.clients,tone:'info'},{label:'Business owners',value:overview.users.owners,tone:'good'},{label:'Administrators',value:overview.users.admins,tone:'accent'}]:[];

  return <>
    <PageHead eyebrow="PLATFORM OVERVIEW" title="Welcome, administrator." description="The health of the BOOKIFY marketplace, in one place." action={<Link to="/admin/applications" className="btn btn-primary"><Icon name="shield" size={17}/>Review applications</Link>}/>
    {!loading&&pendingCount>0&&<Link to="/admin/applications" className="pending-callout"><span className="pending-callout-icon"><Icon name="shield" size={19}/></span><div><strong>{pendingCount===1?'1 owner application is waiting for review':`${pendingCount} owner applications are waiting for review`}</strong><small>New businesses stay hidden from the catalog until an administrator approves them.</small></div><span className="pending-callout-action">Review now <Icon name="arrow" size={15}/></span></Link>}
    <div className="stats-grid">
      <Stat icon="users" label="Registered users" value={show(overview?overview.users.total:legacy.users)} foot={overview?`${compact(overview.users.owners)} business owners`:'All account types'}/>
      <Stat icon="store" label="Published businesses" value={show(overview?overview.businesses.active:legacy.businesses)} foot={overview?`${overview.businesses.inactive} inactive`:'Active in the catalog'}/>
      <Stat icon="calendar-check" label={overview?'Reservations':'Categories'} value={show(overview?overview.reservations.total:legacy.categories)} foot={overview?`${overview.reservations.byStatus?.CONFIRMED||0} confirmed`:'Available business categories'}/>
      <Stat icon="credit" label={overview?'Deposits processed':'Pending applications'} value={show(overview?money(overview.confirmedDeposits,overview.currency):pendingCount)} foot={overview?'Confirmed 50% demo deposits':'Requests awaiting review'}/>
    </div>
    <div className="dashboard-content-grid">
      <div>
        <Card title="Latest reservations" subtitle="Most recent bookings across the platform." action={<Link to="/admin/reservations" className="text-arrow">Browse by business <Icon name="arrow" size={16}/></Link>}>
          {loading?<Skeleton variant="rows" count={4}/>:recent.length?<div className="compact-list">{recent.map(r=><div key={r.id}><span className="list-icon"><Icon name="calendar" size={20}/></span><div><strong>{names.serviceName(r.service_id)}</strong><small>{names.businessName(r.business_id)} · {clientLabel(r)} · {dateTime(r.starts_at)}</small></div><Status value={r.status}/></div>)}</div>:<Empty icon="calendar" title="No reservations to show" description="Recent platform activity will appear here."/>}
        </Card>
        <Card title="Owner applications" subtitle="Requests to join BOOKIFY as a business owner." action={<Link to="/admin/applications" className="text-arrow">Manage requests <Icon name="arrow" size={16}/></Link>}>
          {loading?<Skeleton variant="rows" count={2}/>:applications.length?<div className="compact-list">{applications.map(a=><div key={a.id}><span className="list-icon"><Icon name="store" size={20}/></span><div><strong>{a.business_name}</strong><small>{dateTime(a.created_at)}</small></div><Status value={a.status}/></div>)}</div>:<Empty icon="check" title="All caught up" description="There are no pending applications right now."/>}
        </Card>
      </div>
      <div>
        {overview&&<Card title="Reservation activity" subtitle={`${overview.reservations.total} reservations · ${money(overview.confirmedValue,overview.currency)} in confirmed services`}>
          {statusItems.length?<Breakdown items={statusItems}/>:<p className="muted">No reservations yet.</p>}
        </Card>}
        {overview&&<Card title="Community" subtitle={`${compact(overview.users.total)} accounts · ${overview.categories} categories`}>
          <Breakdown items={communityItems}/>
        </Card>}
        <Card title="Admin shortcuts" subtitle="Manage the essentials of BOOKIFY."><div className="quick-actions">{[['/admin/applications','Owner applications','shield','Approve or reject new business owners'],['/admin/users','User directory','users','Check registered accounts'],['/admin/categories','Manage categories','tag','Organize the service catalog'],['/admin/businesses','Published businesses','store','Review listed establishments']].map(([url,name,icon,desc])=><Link to={url} key={url}><span><Icon name={icon} size={19}/></span><div><strong>{name}</strong><small>{desc}</small></div><Icon name="chevron-right" size={18}/></Link>)}</div></Card>
      </div>
    </div>
  </>;
}

export function AdminApplications(){const toast=useToast();const categoryName=useCategoryNames();const [status,setStatus]=useState('PENDING');const [page,setPage]=useState(1);const [items,setItems]=useState([]);const [pagination,setPagination]=useState(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [review,setReview]=useState(null);const [note,setNote]=useState('');const [busy,setBusy]=useState(false);const load=()=>{setLoading(true);setError('');api(`/api/admin/business-applications?status=${status}&page=${page}&limit=10`).then(d=>{setItems(d.applications||[]);setPagination(d.pagination||null);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));};useEffect(load,[status,page]);async function decide(){if(!review)return;setBusy(true);try{await api(`/api/admin/business-applications/${review.application.id}`,{method:'PATCH',body:{decision:review.decision,admin_note:note.trim()||null}});toast(`Application ${review.decision.toLowerCase()}.`);setReview(null);setNote('');load();}catch(e){toast(e.message,'error');}finally{setBusy(false);}}return <><PageHead eyebrow="TRUST & VERIFICATION" title="Owner applications" description="Every new business owner must be approved by an administrator."/><div className="toolbar-card"><Tabs items={['PENDING','APPROVED','REJECTED'].map(s=>({value:s,label:s.charAt(0)+s.slice(1).toLowerCase()}))} value={status} onChange={value=>{setStatus(value);setPage(1);}}/><Button variant="outline" icon="refresh" onClick={load}>Refresh</Button></div><Card><Alert message={error}/>{loading?<Loading/>:items.length?<div className="application-list">{items.map(a=><div key={a.id} className="application-row"><div className="application-image">{a.logo_url?<img src={a.logo_url} alt={`${a.business_name} logo`}/>:<Icon name="store" size={29}/>}</div><div className="application-info"><div className="application-title"><strong>{a.business_name}</strong><Status value={a.status}/></div><small><Icon name="pin" size={14}/>{a.address}</small><small>{categoryName(a.category_id)} · Applicant #{a.user_id} · {dateTime(a.created_at)}</small>{a.description&&<p>{a.description}</p>}{a.cover_url&&<img className="application-cover" src={a.cover_url} alt={`${a.business_name} storefront`}/>}</div><div className="application-actions">{a.status==='PENDING'?<><Button onClick={()=>{setReview({application:a,decision:'APPROVED'});setNote('');}} icon="check">Approve</Button><Button variant="danger-outline" onClick={()=>{setReview({application:a,decision:'REJECTED'});setNote('');}} icon="x">Reject</Button></>:<span className="muted">{a.admin_note||'Reviewed'}</span>}</div></div>)}</div>:<Empty icon="clipboard" title="No applications in this category" description="Try another status filter or refresh your view."/>}<Pagination pagination={pagination} onChange={setPage}/></Card>{review&&<div className="modal-backdrop" onClick={()=>!busy&&setReview(null)}><div className="modal" role="dialog" aria-modal="true" aria-label="Review application" onClick={e=>e.stopPropagation()}><div className="modal-icon"><Icon name={review.decision==='APPROVED'?'check':'alert'} size={27}/></div><h2>{review.decision==='APPROVED'?'Approve business owner?':'Reject this application?'}</h2><p>{review.decision==='APPROVED'?`Approving ${review.application.business_name} promotes the applicant to BUSINESS_OWNER and creates the business. This action should be reviewed carefully.`:`The applicant for ${review.application.business_name} will remain a CLIENT.`}</p><Textarea id="admin-note" label="Admin note (optional)" rows={3} maxLength={1000} placeholder="Reason or guidance for the applicant" value={note} onChange={e=>setNote(e.target.value)}/><div className="modal-actions"><Button variant="outline" disabled={busy} onClick={()=>setReview(null)}>Cancel</Button><Button variant={review.decision==='APPROVED'?'primary':'danger'} busy={busy} onClick={decide}>{review.decision==='APPROVED'?'Approve application':'Reject application'}</Button></div></div></div>}</>;
}

/** Account editor for administrators: contact details, role, access and password recovery. */
function UserEditor({user,onClose,onSaved}){
  const toast=useToast();
  const [form,setForm]=useState({full_name:user.full_name||'',email:user.email||'',phone:user.phone||'',role:user.role,is_active:user.is_active!==false});
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [resetting,setResetting]=useState(false);
  const [error,setError]=useState('');
  const working=busy||resetting;
  useEffect(()=>{
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const onKey=event=>{if(event.key==='Escape'&&!working)onClose();};
    document.addEventListener('keydown',onKey);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',onKey);};
  },[working,onClose]);
  const set=(key,value)=>setForm(current=>({...current,[key]:value}));
  const details={};
  if(form.full_name.trim()!==(user.full_name||''))details.full_name=form.full_name.trim();
  if(form.email.trim().toLowerCase()!==(user.email||''))details.email=form.email.trim().toLowerCase();
  if(form.phone.trim()!==(user.phone||''))details.phone=form.phone.trim()||null;
  const roleChanged=form.role!==user.role;
  const statusChanged=form.is_active!==(user.is_active!==false);
  const dirty=Object.keys(details).length>0||roleChanged||statusChanged;

  async function save(event){
    event.preventDefault();if(!dirty||working)return;
    setBusy(true);setError('');
    const done=[];
    try{
      // Each change uses its own guarded endpoint, so the backend rules stay authoritative.
      if(Object.keys(details).length){await api(`/api/admin/users/${user.id}`,{method:'PATCH',body:details});done.push('details');}
      // Reactivate first: the API only changes the role of active accounts.
      if(statusChanged&&form.is_active){await api(`/api/admin/users/${user.id}/status`,{method:'PATCH',body:{is_active:true}});done.push('access');}
      if(roleChanged){await api(`/api/admin/users/${user.id}/role`,{method:'PATCH',body:{role:form.role}});done.push('role');}
      if(statusChanged&&!form.is_active){await api(`/api/admin/users/${user.id}/status`,{method:'PATCH',body:{is_active:false}});done.push('access');}
      toast(`${form.full_name.trim()||'Account'} updated.`);
      onSaved();onClose();
    }catch(err){
      setError(done.length?`${err.message} (Already saved: ${done.join(', ')}.)`:err.message);
      if(done.length)onSaved();
    }finally{setBusy(false);}
  }
  async function resetPassword(){
    if(password.length<8){setError('The temporary password needs at least 8 characters.');return;}
    setResetting(true);setError('');
    try{
      await api(`/api/admin/users/${user.id}/password`,{method:'PATCH',body:{new_password:password}});
      setPassword('');toast('Password reset. The user must sign in again with the temporary password.');
    }catch(err){setError(err.message);}finally{setResetting(false);}
  }

  return <div className="modal-backdrop" onClick={()=>{if(!working)onClose();}}>
    <div className="modal modal-wide user-editor" role="dialog" aria-modal="true" aria-label={`Manage ${user.full_name||'account'}`} onClick={event=>event.stopPropagation()}>
      <div className="user-editor-head">
        <span className="user-editor-avatar">{initials(user.full_name||user.email||'U')}</span>
        <div><h2>Manage account</h2><p>User #{user.id} · joined {dateTime(user.created_at,{timeStyle:undefined})}</p></div>
        <button type="button" className="icon-btn" aria-label="Close" disabled={working} onClick={onClose}><Icon name="x" size={18}/></button>
      </div>
      <Alert message={error}/>
      <form className="stacked-form" onSubmit={save}>
        <Input id="admin-user-name" label="Full name" required minLength={3} maxLength={100} value={form.full_name} onChange={event=>set('full_name',event.target.value)}/>
        <div className="two-col">
          <Input id="admin-user-email" label="Email address" type="email" required maxLength={254} value={form.email} onChange={event=>set('email',event.target.value)}/>
          <Input id="admin-user-phone" label="Phone (optional)" value={form.phone} onChange={event=>set('phone',event.target.value)} placeholder="+51 ..."/>
        </div>
        <div className="two-col">
          <Select id="admin-user-role" label="Role" value={form.role} onChange={event=>set('role',event.target.value)}><option value="CLIENT">Client</option><option value="BUSINESS_OWNER">Business owner</option></Select>
          <div className="form-field"><span className="field-label">Account access</span><label className={`access-toggle ${form.is_active?'on':''}`}><input type="checkbox" checked={form.is_active} onChange={event=>set('is_active',event.target.checked)}/><span className="access-switch" aria-hidden="true"/><span>{form.is_active?'Active — can sign in':'Suspended — cannot sign in'}</span></label></div>
        </div>
        <div className="modal-actions"><Button variant="outline" disabled={working} onClick={onClose}>Close</Button><Button type="submit" icon="check" busy={busy} disabled={!dirty||resetting}>Save changes</Button></div>
      </form>
      <div className="user-editor-reset">
        <div><strong>Password recovery</strong><p>Set a temporary password when someone is locked out. Their open sessions are closed and they should change it after signing in.</p></div>
        <div className="user-editor-reset-row">
          <div className="password-container"><input id="admin-user-password" type={showPassword?'text':'password'} aria-label="Temporary password" autoComplete="new-password" placeholder="Temporary password (8+ characters)" maxLength={72} value={password} onChange={event=>setPassword(event.target.value)}/><button type="button" className="password-toggle" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(value=>!value)}><Icon name={showPassword?'eye-off':'eye'} size={18}/></button></div>
          <Button variant="danger-outline" icon="lock" busy={resetting} disabled={busy||password.length<8} onClick={resetPassword}>Reset password</Button>
        </div>
      </div>
    </div>
  </div>;
}

export function AdminUsers(){const [items,setItems]=useState([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [unsupported,setUnsupported]=useState(false);const [page,setPage]=useState(1);const [pagination,setPagination]=useState(null);const [search,setSearch]=useState('');const [role,setRole]=useState('');const [editing,setEditing]=useState(null);const load=()=>{setLoading(true);setError('');api(`/api/admin/users?page=${page}&limit=20${role?`&role=${role}`:''}`).then(d=>{setUnsupported(false);setItems(d.users||d.data?.users||[]);setPagination(d.pagination||null);}).catch(e=>{if(e.status===404||e.status===405){setUnsupported(true);}else setError(e.message);}).finally(()=>setLoading(false));};useEffect(load,[page,role]);const filtered=items.filter(u=>(`${u.full_name||''} ${u.email||''}`).toLowerCase().includes(search.toLowerCase()));return <><PageHead eyebrow="MEMBER DIRECTORY" title="Users" description="View accounts and their authorized roles. Privileges are controlled by the backend."/><Card><Alert message={error}/>{unsupported?<Empty icon="users" title="User listing API not available" description="The current backend does not expose GET /api/admin/users in the files we could verify. This page is ready once that endpoint is confirmed; it never exposes private user data directly from Supabase."/>:<><div className="users-filter"><Tabs items={[{value:'',label:'All accounts'},{value:'CLIENT',label:'Clients'},{value:'BUSINESS_OWNER',label:'Business owners'},{value:'ADMIN',label:'Administrators'}]} value={role} onChange={value=>{setRole(value);setPage(1);}}/></div><div className="table-toolbar"><div className="search-input"><Icon name="search" size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search loaded users..." aria-label="Search loaded users"/></div><Button variant="outline" onClick={load} icon="refresh">Refresh</Button></div>{loading?<Skeleton variant="rows" count={5}/>:filtered.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Full name</th><th>Email</th><th>Role</th><th>Account</th><th>Manage</th></tr></thead><tbody>{filtered.map(u=><tr key={u.id}><td data-label="Full name"><strong>{u.full_name||'Unknown user'}</strong><small>#{u.id}</small></td><td data-label="Email">{u.email||'—'}</td><td data-label="Role"><Status value={u.role}/></td><td data-label="Account"><Status value={u.is_active===undefined?'UNKNOWN':u.is_active?'ACTIVE':'INACTIVE'}/></td><td data-label="Manage">{u.role==='ADMIN'?<span className="muted manage-locked" title="Administrator accounts are managed outside this dashboard"><Icon name="lock" size={14}/>Protected</span>:<Button variant="outline" icon="edit" className="btn-small" onClick={()=>setEditing(u)}>Edit</Button>}</td></tr>)}</tbody></table></div>:<Empty icon="users" title="No users found"/>}<Pagination pagination={pagination} onChange={setPage}/></>}</Card>{editing&&<UserEditor key={editing.id} user={editing} onClose={()=>setEditing(null)} onSaved={load}/>}<p className="notice-line"><Icon name="shield" size={16}/> You can correct contact details, change roles, suspend access and reset passwords for clients and business owners. ADMIN accounts can only be provisioned outside public registration, through authorized backend/database administration. This dashboard cannot grant ADMIN privileges.</p></>;
}

export function AdminBusinesses(){const [items,setItems]=useState([]);const [pagination,setPagination]=useState(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [page,setPage]=useState(1);const [deactivate,setDeactivate]=useState(null);const [busy,setBusy]=useState(false);const toast=useToast();const categoryName=useCategoryNames();const load=()=>{setLoading(true);setError('');api(endpoint.businesses({page,limit:15})).then(d=>{setItems(d.businesses||[]);setPagination(d.pagination);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));};useEffect(load,[page]);async function remove(){setBusy(true);try{await api(`/api/businesses/${deactivate.id}`,{method:'DELETE'});toast('Business deactivated.');setDeactivate(null);load();}catch(e){toast(e.message,'error');}finally{setBusy(false);}}return <><PageHead eyebrow="PLATFORM DIRECTORY" title="Businesses" description="Review businesses currently published in the BOOKIFY catalog."/><Card><Alert message={error}/>{loading?<Skeleton variant="rows" count={5}/>:items.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Business</th><th>Address</th><th>Owner</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map(b=><tr key={b.id}><td data-label="Business"><strong>{b.name}</strong><small>{categoryName(b.category_id)} · #{b.id}</small></td><td data-label="Address">{b.address||'—'}</td><td data-label="Owner">#{b.owner_id}</td><td data-label="Status"><Status value={b.is_active?'ACTIVE':'INACTIVE'}/></td><td data-label="Actions"><div className="table-actions"><Link to={`/business/${b.id}`} title="Public details"><Icon name="external" size={18}/></Link><button onClick={()=>setDeactivate(b)} title="Deactivate business"><Icon name="trash" size={17}/></button></div></td></tr>)}</tbody></table></div>:<Empty icon="store" title="No published businesses"/>}<Pagination pagination={pagination} onChange={setPage}/></Card><p className="notice-line"><Icon name="info" size={16}/> This directory uses the public businesses API and therefore shows active businesses only. An all-status administrative API is not verified.</p><Confirm open={!!deactivate} title="Deactivate this business?" description={`Deactivate ${deactivate?.name||'this business'}? It will disappear from the public catalog.`} danger busy={busy} confirmLabel="Deactivate" onCancel={()=>setDeactivate(null)} onConfirm={remove}/></>;
}

export function AdminReservations(){const [businesses,setBusinesses]=useState([]);const [selected,setSelected]=useState('');const [items,setItems]=useState([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [page,setPage]=useState(1);const [pagination,setPagination]=useState(null);const names=useReservationNames(items);useEffect(()=>{api('/api/businesses?page=1&limit=100').then(d=>{setBusinesses(d.businesses||[]);}).catch(e=>setError(e.message));},[]);useEffect(()=>{if(!selected){setItems([]);return;}let live=true;setLoading(true);setError('');api(`/api/reservations/business/${selected}?page=${page}&limit=15`).then(d=>{if(live){setItems(d.reservations||[]);setPagination(d.pagination);}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[selected,page]);return <><PageHead eyebrow="PLATFORM ACTIVITY" title="Reservations" description="Review reservations for a selected business using authorized backend queries."/><Card><Alert message={error}/><div className="toolbar-card toolbar-plain"><div className="business-select"><span className="field-label">Business</span><select value={selected} onChange={e=>{setSelected(e.target.value);setPage(1);}}><option value="">Select a business</option>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div></div>{!selected?<Empty icon="calendar" title="Choose a business" description="Select a published business to review its reservations."/>:loading?<Skeleton variant="rows" count={5}/>:items.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Reservation</th><th>Client</th><th>Appointment</th><th>Total</th><th>Status</th></tr></thead><tbody>{items.map(r=><tr key={r.id}><td data-label="Reservation"><strong>#{r.id}</strong><small>{names.serviceName(r.service_id)}</small></td><td data-label="Client">{clientLabel(r)}</td><td data-label="Appointment">{dateTime(r.starts_at)}</td><td data-label="Total">{money(r.total_amount,r.currency||'PEN')}</td><td data-label="Status"><Status value={r.status}/></td></tr>)}</tbody></table></div>:<Empty icon="calendar" title="No reservations found"/>}<Pagination pagination={pagination} onChange={setPage}/></Card><p className="notice-line"><Icon name="info" size={16}/> This view does not offer arbitrary reservation state changes because no matching administrative mutation endpoint was verified.</p></>;
}
