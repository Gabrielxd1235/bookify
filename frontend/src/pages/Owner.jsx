import React,{useEffect,useMemo,useState,useCallback} from 'react';
import {useAuth} from '../context/AuthContext.jsx';
import {api,endpoint,upload} from '../lib/api.js';
import {useToast} from '../context/ToastContext.jsx';
import {money,dateTime,weekdays,compact,statusTone,statusLabel,dayParts,firstName} from '../lib/format.js';
import {Link,navigate} from '../lib/router.jsx';
import {Button,PageHead,Card,Stat,Input,Select,Textarea,Loading,Alert,Empty,Status,Confirm,FilePicker,Pagination,Skeleton,Breakdown} from '../components/UI.jsx';
import {Icon} from '../components/Icon.jsx';
import {useBusinessMedia} from '../components/BusinessCard.jsx';
import {useReservationNames,clientLabel} from '../lib/reservationNames.js';

export function useMyBusinesses(){const [businesses,setBusinesses]=useState([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const load=()=>{setLoading(true);setError('');api('/api/businesses/mine?page=1&limit=100').then(d=>setBusinesses(d.businesses||[])).catch(e=>setError(e.message)).finally(()=>setLoading(false));};useEffect(load,[]);return {businesses,loading,error,reload:load};}
// Inactive QA and deactivated records remain in PostgreSQL, but never become the workspace by default.
const activeBusinesses = businesses => businesses.filter(b => b.is_active !== false);
const ownerPreferenceKey = user => `bookify.owner.current.${user?.id || user?.email || 'anonymous'}`;

function useSelectedBusiness(businesses){
  const {user} = useAuth();
  const storageKey = ownerPreferenceKey(user);
  const [selected,setSelected] = useState('');
  useEffect(() => {
    const active = activeBusinesses(businesses);
    const stored = window.localStorage.getItem(storageKey);
    const current = active.find(b => String(b.id) === String(selected));
    const preferred = active.find(b => String(b.id) === stored);
    const next = String((current || preferred || active[0])?.id || '');
    if(next !== selected) setSelected(next);
    if(next) window.localStorage.setItem(storageKey,next);
    else window.localStorage.removeItem(storageKey);
  },[businesses,selected,storageKey]);
  const chooseBusiness = useCallback(id => {
    const match = activeBusinesses(businesses).find(b => String(b.id) === String(id));
    if(!match) return;
    const next = String(match.id);
    window.localStorage.setItem(storageKey,next);
    setSelected(next);
  },[businesses,storageKey]);
  return [selected,chooseBusiness];
}

// Read-only identity: the owner is already inside their workspace, not choosing from a list.
function BusinessWorkspace({businesses,value}){
  const business = activeBusinesses(businesses).find(b => String(b.id) === String(value));
  if(!business) return null;
  return <div className="owner-current-business"><span className="owner-current-icon"><Icon name="store" size={21}/></span><div className="owner-current-info"><span>YOUR BUSINESS</span><strong>{business.name}</strong></div>{activeBusinesses(businesses).length > 1 && <Link to="/owner/businesses" className="owner-current-link">Manage businesses <Icon name="chevron-right" size={15}/></Link>}</div>;
}
function OwnerEmpty({hasInactive=false}){return <Card><Empty icon="store" title={hasInactive?'No active business':'No businesses to manage'} description={hasInactive?'Your previous establishments are inactive. View them under My businesses, or create a new establishment.':'Once your business application is approved, your business will appear here.'} action={<Link to={hasInactive?'/owner/businesses':'/profile'} className="btn btn-outline">{hasInactive?'My businesses':'My profile'}</Link>}/></Card>;}

const emptyOwnerData={reservations:[],services:[],hours:[],summary:null,upcoming:[]};
const reservationStatusOrder=['CONFIRMED','COMPLETED','PENDING_PAYMENT','CANCELLED','EXPIRED','PAYMENT_FAILED','NO_SHOW'];
const toBreakdown=byStatus=>reservationStatusOrder.filter(status=>byStatus?.[status]).map(status=>({label:statusLabel(status),value:byStatus[status],tone:statusTone(status)}));

export function OwnerHome(){
  const {user}=useAuth();
  const {businesses,loading,error}=useMyBusinesses();
  const [selected]=useSelectedBusiness(businesses);
  const [data,setData]=useState(emptyOwnerData);
  const [loadingData,setLoadingData]=useState(false);
  const media=useBusinessMedia(selected);
  const names=useReservationNames([...data.reservations.slice(0,6),...data.upcoming]);
  useEffect(()=>{
    if(!selected){setData(emptyOwnerData);return;}
    let live=true;setLoadingData(true);
    Promise.allSettled([
      api(`/api/reservations/business/${selected}?page=1&limit=10`),
      api(endpoint.services({business_id:selected,page:1,limit:100})),
      api(`/api/businesses/${selected}/hours`),
      api(`/api/reservations/business/${selected}/summary`),
    ]).then(([r,s,h,m])=>{
      if(!live)return;
      setData({
        reservations:r.status==='fulfilled'?(r.value.reservations||[]):[],
        services:s.status==='fulfilled'?(s.value.services||[]):[],
        hours:h.status==='fulfilled'?(h.value.hours||h.value.business_hours||[]):[],
        summary:m.status==='fulfilled'?(m.value.summary||null):null,
        upcoming:m.status==='fulfilled'?(m.value.upcoming||[]):[],
      });
    }).finally(()=>{if(live)setLoadingData(false);});
    return()=>{live=false;};
  },[selected]);

  const business=activeBusinesses(businesses).find(b=>String(b.id)===String(selected));
  const busy=loading||loadingData;
  const summary=data.summary;
  // When the summary endpoint is unavailable, fall back to the latest reservations already loaded.
  const upcoming=summary?data.upcoming:data.reservations.filter(r=>r.status==='CONFIRMED'&&new Date(r.starts_at)>=new Date()).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
  const byStatus=summary?.byStatus||data.reservations.reduce((all,r)=>({...all,[r.status]:(all[r.status]||0)+1}),{});
  const breakdown=toBreakdown(byStatus);
  const next=upcoming[0];
  const checklist=[
    {done:data.services.length>0,label:'Add your services',hint:'Clients book a specific service, price and duration.',to:'/owner/services',icon:'scissors'},
    {done:data.hours.some(h=>!h.is_closed),label:'Set your opening hours',hint:'Available times are generated from your weekly schedule.',to:'/owner/hours',icon:'clock'},
    {done:Boolean(media?.cover_url||media?.logo_url),label:'Upload a cover photo',hint:'Listings with photos stand out in the catalog.',to:'/owner/media',icon:'image'},
  ];
  const ready=checklist.filter(step=>step.done).length;

  return <>
    <PageHead eyebrow="BUSINESS WORKSPACE" title={`Welcome back, ${firstName(user?.full_name)}.`} description="Your appointments, your services and your earnings at a glance."
      action={business&&<div className="head-actions"><Link to={`/business/${business.id}`} className="btn btn-outline"><Icon name="external" size={16}/>Public page</Link><Link to="/owner/reservations" className="btn btn-primary"><Icon name="calendar" size={17}/>All bookings</Link></div>}/>
    <Alert message={error}/>
    {!loading&&!selected?<OwnerEmpty hasInactive={businesses.length>0}/>:<>
      <section className="workspace-hero">
        <div className="workspace-hero-main">
          <span className="workspace-hero-icon">{media?.logo_url?<img src={media.logo_url} alt=""/>:<Icon name="store" size={26}/>}</span>
          <div><span className="eyebrow">YOUR BUSINESS</span><h2>{business?.name||'Loading your business...'}</h2>{business&&<p><Icon name="pin" size={15}/>{business.address||'No address provided'}<span className="live-dot">Live in the catalog</span></p>}</div>
        </div>
        <div className="workspace-hero-next">
          <small>NEXT APPOINTMENT</small>
          {busy?<span className="skeleton-block skeleton-line mid"/>:next?<><strong>{names.serviceName(next.service_id)}</strong><span>{dateTime(next.starts_at)} · {clientLabel(next)}</span></>:<><strong>Nothing scheduled</strong><span>New bookings will appear here.</span></>}
        </div>
      </section>
      <div className="stats-grid">
        <Stat icon="calendar-check" label="Upcoming appointments" value={busy?'—':summary?summary.upcomingCount:upcoming.length} foot="Confirmed and still ahead"/>
        <Stat icon="credit" label="Deposits collected" value={busy?'—':summary?money(summary.confirmedDeposits,summary.currency):'N/A'} foot="50% demo deposits confirmed"/>
        <Stat icon="calendar" label="Total bookings" value={busy?'—':summary?summary.total:data.reservations.length} foot={summary?'Since you joined BOOKIFY':'Latest 10 reservations'}/>
        <Stat icon="users" label={summary?'Clients served':'Active services'} value={busy?'—':summary?summary.uniqueClients:data.services.length} foot={summary?'Unique people who booked':'In your catalog'}/>
      </div>
      <div className="dashboard-content-grid">
        <Card title="Upcoming agenda" subtitle="Confirmed appointments, soonest first." action={<Link to="/owner/reservations" className="text-arrow">View all <Icon name="arrow" size={16}/></Link>}>
          {busy?<Skeleton variant="rows" count={3}/>:upcoming.length?<div className="agenda-list">{upcoming.slice(0,6).map(r=>{const parts=dayParts(r.starts_at);return <div key={r.id} className="agenda-item"><span className="date-chip"><small>{parts.month}</small><strong>{parts.day}</strong></span><div><strong>{names.serviceName(r.service_id)}</strong><small>{parts.weekday} · {parts.time} · {clientLabel(r)}</small></div><span className="agenda-amount">{money(r.total_amount,r.currency||'PEN')}</span></div>;})}</div>:<Empty icon="calendar" title="No upcoming appointments" description="Share your public page so clients can start booking." action={business&&<Link to={`/business/${business.id}`} className="btn btn-outline">Open public page</Link>}/>}
        </Card>
        <div>
          <Card title="Booking status" subtitle="How your reservations are distributed.">
            {busy?<Skeleton variant="rows" count={3}/>:breakdown.length?<Breakdown items={breakdown}/>:<p className="muted">No reservations yet.</p>}
          </Card>
          {!busy&&ready<checklist.length&&<Card title="Get ready for bookings" subtitle={`${ready} of ${checklist.length} steps completed`} className="setup-card">
            <div className="setup-progress"><span style={{width:`${ready/checklist.length*100}%`}}/></div>
            <div className="setup-list">{checklist.map(step=><Link key={step.to} to={step.to} className={step.done?'done':''}><span className="setup-mark"><Icon name={step.done?'check':step.icon} size={16}/></span><div><strong>{step.label}</strong><small>{step.hint}</small></div><Icon name="chevron-right" size={17}/></Link>)}</div>
          </Card>}
        </div>
      </div>
      <div className="dashboard-content-grid">
        <Card title="Recent activity" subtitle="Latest bookings received by your business.">
          {busy?<Skeleton variant="rows" count={3}/>:data.reservations.length?<div className="compact-list">{data.reservations.slice(0,5).map(r=><div key={r.id}><span className="list-icon"><Icon name="calendar" size={20}/></span><div><strong>{names.serviceName(r.service_id)}</strong><small>{clientLabel(r)} · {dateTime(r.starts_at)}</small></div><Status value={r.status}/></div>)}</div>:<Empty title="No bookings yet" description="When clients book, appointments will show up here."/>}
        </Card>
        <Card title="Quick actions" subtitle="Keep things running smoothly."><div className="quick-actions">{[['/owner/services','Manage services','scissors',`${data.services.length} active in your catalog`],['/owner/hours','Business hours','clock','Keep your schedule accurate'],['/owner/media','Branding & photos','image','Showcase your space'],['/owner/businesses','Business details','store','Edit your establishment']].map(([href,label,icon,desc])=><Link to={href} key={href}><span><Icon name={icon} size={19}/></span><div><strong>{label}</strong><small>{desc}</small></div><Icon name="chevron-right" size={18}/></Link>)}</div></Card>
      </div>
    </>}
  </>;
}

const emptyBusiness={name:'',category_id:'',address:'',phone:'',description:''};
export function OwnerBusinesses(){const {businesses,loading,error,reload}=useMyBusinesses();const [selected,chooseBusiness]=useSelectedBusiness(businesses);const [showInactive,setShowInactive]=useState(false);const inactiveBusinesses=businesses.filter(b=>b.is_active===false);const visibleBusinesses=showInactive?businesses:activeBusinesses(businesses);const toast=useToast();const [categories,setCategories]=useState([]);const [edit,setEdit]=useState(null);const [form,setForm]=useState(emptyBusiness);const [busy,setBusy]=useState(false);const [disable,setDisable]=useState(null);useEffect(()=>{api('/api/categories').then(d=>setCategories(d.categories||[])).catch(()=>{});},[]);function open(b){setEdit(b||'new');setForm(b?{name:b.name||'',category_id:String(b.category_id||''),address:b.address||'',phone:b.phone||'',description:b.description||''}:emptyBusiness);}async function save(e){e.preventDefault();setBusy(true);try{const editing=edit!=='new';const body={...form,category_id:Number(form.category_id),phone:form.phone.trim()||null,description:form.description.trim()||null};await api(editing?`/api/businesses/${edit.id}`:'/api/businesses',{method:editing?'PUT':'POST',body});toast(editing?'Business updated.':'Business created.');setEdit(null);reload();}catch(err){toast(err.message,'error');}finally{setBusy(false);}}async function remove(){setBusy(true);try{await api(`/api/businesses/${disable.id}`,{method:'DELETE'});toast('Business deactivated.');setDisable(null);reload();}catch(e){toast(e.message,'error');}finally{setBusy(false);}}return <><PageHead eyebrow="YOUR ESTABLISHMENTS" title="My businesses" description="Manage the details your customers see." action={<div className="owner-business-page-actions"><Button icon="plus" onClick={()=>open(null)}>Add business</Button>{inactiveBusinesses.length>0&&<Button variant="outline" onClick={()=>setShowInactive(v=>!v)}>{showInactive?'Hide inactive':`Show inactive (${inactiveBusinesses.length})`}</Button>}</div>}/><Alert message={error}/>{edit&&<Card title={edit==='new'?'Add a new business':`Edit ${edit.name}`} subtitle="Business information is published after backend validation."><form className="stacked-form" onSubmit={save}><div className="two-col"><Input id="business-name" label="Business name" required minLength={3} maxLength={150} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/><Select id="business-category" label="Category" value={form.category_id} required onChange={e=>setForm(f=>({...f,category_id:e.target.value}))}><option value="">Select category</option>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</Select></div><div className="two-col"><Input id="business-address" label="Address" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} maxLength={255}/><Input id="business-phone" label="Phone" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div><Textarea id="business-description" label="Description" rows={3} maxLength={2000} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/><div className="form-actions"><Button variant="outline" onClick={()=>setEdit(null)}>Cancel</Button><Button type="submit" busy={busy} icon="check">Save business</Button></div></form></Card>}{loading?<Loading/>:visibleBusinesses.length?<div className="manage-grid">{visibleBusinesses.map(b=><Card key={b.id} className="management-card"><div className="manage-card-title"><span className="manage-icon"><Icon name="store" size={25}/></span><Status value={b.is_active?'ACTIVE':'INACTIVE'}/></div><h3>{b.name}</h3><p>{b.description||'No description has been added yet.'}</p><div className="manage-address"><Icon name="pin" size={16}/>{b.address||'No address provided'}</div><div className="manage-actions">{b.is_active!==false&&(String(b.id)===String(selected)?<span className="owner-current-tag"><Icon name="check" size={14}/>Current business</span>:<Button variant="outline" icon="check" onClick={()=>{chooseBusiness(b.id);navigate('/owner');}}>Manage this business</Button>)}<Button variant="outline" icon="edit" onClick={()=>open(b)}>Edit</Button>{b.is_active!==false&&<Link className="btn btn-outline" to={`/business/${b.id}`}>View <Icon name="external" size={15}/></Link>}{b.is_active!==false&&<button className="text-danger" onClick={()=>setDisable(b)} title="Deactivate business"><Icon name="trash" size={18}/></button>}</div></Card>)}</div>:<OwnerEmpty/>}<Confirm open={!!disable} title="Deactivate this business?" description="The business will no longer appear in the public catalog. Existing reservations may be affected." danger busy={busy} confirmLabel="Deactivate" onCancel={()=>setDisable(null)} onConfirm={remove}/></>;
}

const blankService={name:'',description:'',price:'',duration_minutes:'30'};
export function OwnerServices(){const {businesses,loading,error}=useMyBusinesses();const [selected]=useSelectedBusiness(businesses);const toast=useToast();const [items,setItems]=useState([]);const [loadingItems,setLoadingItems]=useState(false);const [edit,setEdit]=useState(null);const [form,setForm]=useState(blankService);const [busy,setBusy]=useState(false);const [remove,setRemove]=useState(null);const load=()=>{if(!selected)return;setLoadingItems(true);api(endpoint.services({business_id:selected,page:1,limit:100})).then(d=>setItems(d.services||[])).catch(e=>toast(e.message,'error')).finally(()=>setLoadingItems(false));};useEffect(load,[selected]);function open(service){setEdit(service||'new');setForm(service?{name:service.name||'',description:service.description||'',price:String(service.price??''),duration_minutes:String(service.duration_minutes??30)}:blankService);}async function save(e){e.preventDefault();setBusy(true);try{const payload={name:form.name.trim(),description:form.description.trim()||null,price:Number(form.price),duration_minutes:Number(form.duration_minutes),...(edit==='new'?{business_id:Number(selected)}:{})};await api(edit==='new'?'/api/services':`/api/services/${edit.id}`,{method:edit==='new'?'POST':'PUT',body:payload});toast(edit==='new'?'Service created.':'Service updated.');setEdit(null);load();}catch(e){toast(e.message,'error');}finally{setBusy(false);}}async function deactivate(){setBusy(true);try{await api(`/api/services/${remove.id}`,{method:'DELETE'});toast('Service deactivated.');setRemove(null);load();}catch(e){toast(e.message,'error');}finally{setBusy(false);}}return <><PageHead eyebrow="SERVICE CATALOG" title="Manage services" description="Set your prices, descriptions and appointment durations." action={<Button icon="plus" disabled={!selected} onClick={()=>open(null)}>Add service</Button>}/><Alert message={error}/>{loading?<Loading/>:!selected?<OwnerEmpty hasInactive={businesses.length>0}/>:<><div className="toolbar-card"><BusinessWorkspace businesses={businesses} value={selected}/><span className="toolbar-hint">Showing active services for this business</span></div>{edit&&<Card title={edit==='new'?'Create a service':'Edit service'}><form className="stacked-form" onSubmit={save}><Input id="service-name" label="Service name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} minLength={2} required/><div className="two-col"><Input id="service-price" label="Price (PEN)" type="number" min="0" step="0.01" required value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/><Input id="service-duration" label="Duration (minutes)" type="number" min="1" step="1" required value={form.duration_minutes} onChange={e=>setForm(f=>({...f,duration_minutes:e.target.value}))}/></div><Textarea id="service-description" label="Description" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3}/><div className="form-actions"><Button variant="outline" onClick={()=>setEdit(null)}>Cancel</Button><Button type="submit" busy={busy} icon="check">Save service</Button></div></form></Card>}<Card title="Available services" subtitle={`${items.length} active services`}>{loadingItems?<Loading/>:items.length?<div className="service-manage-list">{items.map(s=><div key={s.id}><div className="service-manage-icon"><Icon name="scissors" size={22}/></div><div className="service-manage-content"><strong>{s.name}</strong><small>{s.description||'No description'} · {s.duration_minutes} min</small></div><strong>{money(s.price)}</strong><div className="table-actions"><button title="Edit" onClick={()=>open(s)}><Icon name="edit" size={18}/></button><button title="Deactivate" onClick={()=>setRemove(s)}><Icon name="trash" size={18}/></button></div></div>)}</div>:<Empty icon="scissors" title="No active services" description="Add your first service so clients can book." action={<Button onClick={()=>open(null)}>Add service</Button>}/>}</Card></>}<Confirm open={!!remove} title="Deactivate this service?" description="This service will no longer be available for new reservations." danger busy={busy} confirmLabel="Deactivate service" onCancel={()=>setRemove(null)} onConfirm={deactivate}/></>;
}

export function OwnerHours(){const {businesses,loading,error}=useMyBusinesses();const [selected]=useSelectedBusiness(businesses);const [rows,setRows]=useState([]);const [loadBusy,setLoadBusy]=useState(false);const [saving,setSaving]=useState(null);const toast=useToast();const fetchHours=()=>{if(!selected)return;setLoadBusy(true);api(`/api/businesses/${selected}/hours`).then(d=>{const existing=d.hours||d.business_hours||[];setRows(weekdays.map((label,weekday)=>{const h=existing.find(a=>Number(a.weekday)===weekday);return {weekday,name:label,exists:!!h,is_closed:h?.is_closed??false,opens_at:String(h?.opens_at||'09:00').slice(0,5),closes_at:String(h?.closes_at||'18:00').slice(0,5)};}));}).catch(e=>toast(e.message,'error')).finally(()=>setLoadBusy(false));};useEffect(fetchHours,[selected]);function update(day,field,value){setRows(a=>a.map(r=>r.weekday===day?{...r,[field]:value}:r));}async function save(row){setSaving(row.weekday);try{const payload={weekday:row.weekday,is_closed:row.is_closed,opens_at:row.is_closed?null:row.opens_at,closes_at:row.is_closed?null:row.closes_at};await api(row.exists?`/api/businesses/${selected}/hours/${row.weekday}`:`/api/businesses/${selected}/hours`,{method:row.exists?'PUT':'POST',body:payload});toast(`${row.name} hours saved.`);fetchHours();}catch(e){toast(e.message,'error');}finally{setSaving(null);}}async function erase(row){setSaving(row.weekday);try{await api(`/api/businesses/${selected}/hours/${row.weekday}`,{method:'DELETE'});toast(`${row.name} schedule removed.`);fetchHours();}catch(e){toast(e.message,'error');}finally{setSaving(null);}}return <><PageHead eyebrow="AVAILABILITY" title="Business hours" description="Set your opening hours so the booking calendar stays accurate."/><Alert message={error}/>{loading?<Loading/>:!selected?<OwnerEmpty hasInactive={businesses.length>0}/>:<><BusinessWorkspace businesses={businesses} value={selected}/><p className="toolbar-hint owner-timezone-hint">Time shown in Peru local time (PET)</p><Card title="Weekly schedule" subtitle="Save each day after editing. Closed days do not offer new appointments.">{loadBusy?<Loading/>:<div className="hours-editor">{rows.map(r=><div className="hours-row" key={r.weekday}><strong>{r.name}</strong><label className="switch-wrap"><input type="checkbox" checked={!r.is_closed} onChange={e=>update(r.weekday,'is_closed',!e.target.checked)}/><span>Open</span></label><input aria-label={`${r.name} opening time`} type="time" value={r.opens_at} disabled={r.is_closed} onChange={e=>update(r.weekday,'opens_at',e.target.value)}/><span className="hours-to">to</span><input aria-label={`${r.name} closing time`} type="time" value={r.closes_at} disabled={r.is_closed} onChange={e=>update(r.weekday,'closes_at',e.target.value)}/><Button variant="outline" disabled={saving!==null} busy={saving===r.weekday} onClick={()=>save(r)}>{r.exists?'Update':'Save'}</Button>{r.exists&&<button className="hour-delete" aria-label={`Delete ${r.name} hours`} onClick={()=>erase(r)} disabled={saving!==null}><Icon name="trash" size={17}/></button>}</div>)}</div>}</Card></>}</>;
}

export function OwnerReservations(){const {businesses,loading,error}=useMyBusinesses();const [selected]=useSelectedBusiness(businesses);const [page,setPage]=useState(1);const [items,setItems]=useState([]);const [pagination,setPagination]=useState(null);const [busy,setBusy]=useState(false);const [fetchError,setFetchError]=useState('');const names=useReservationNames(items);const reload=()=>{if(!selected)return;setBusy(true);setFetchError('');api(`/api/reservations/business/${selected}?page=${page}&limit=10`).then(d=>{setItems(d.reservations||[]);setPagination(d.pagination);}).catch(e=>setFetchError(e.message)).finally(()=>setBusy(false));};useEffect(()=>{setPage(1);},[selected]);useEffect(reload,[selected,page]);return <><PageHead eyebrow="YOUR APPOINTMENTS" title="Business bookings" description="See incoming reservations and their payment states."/><Alert message={error||fetchError}/>{loading?<Loading/>:!selected?<OwnerEmpty hasInactive={businesses.length>0}/>:<><BusinessWorkspace businesses={businesses} value={selected}/><div className="owner-refresh-row"><Button variant="outline" icon="refresh" onClick={reload}>Refresh bookings</Button></div><Card>{busy?<Skeleton variant="rows" count={5}/>:items.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Reservation</th><th>Service</th><th>Appointment</th><th>Amount</th><th>Deposit (50%)</th><th>Status</th></tr></thead><tbody>{items.map(r=><tr key={r.id}><td data-label="Reservation"><strong>#{r.id}</strong><small>{clientLabel(r)}</small></td><td data-label="Service">{names.serviceName(r.service_id)}</td><td data-label="Appointment">{dateTime(r.starts_at)}</td><td data-label="Amount">{money(r.total_amount,r.currency||'PEN')}</td><td data-label="Deposit (50%)">{money(r.deposit_amount,r.currency||'PEN')}<small>{r.status==='CONFIRMED'?'Paid (Demo)':r.status==='PENDING_PAYMENT'?'Awaiting deposit':'Unpaid'}</small></td><td data-label="Status"><Status value={r.status}/></td></tr>)}</tbody></table></div>:<Empty icon="calendar" title="No bookings received" description="Customer reservations will appear here automatically."/>}<Pagination pagination={pagination} onChange={setPage}/></Card><p className="notice-line"><Icon name="info" size={16}/> An appointment is confirmed only after the server accepts the 50% demo deposit. Real payments and refunds are not supported.</p></>}</>;
}

export function OwnerMedia(){const {businesses,loading,error}=useMyBusinesses();const [selected]=useSelectedBusiness(businesses);const [media,setMedia]=useState(null);const [fetching,setFetching]=useState(false);const [busy,setBusy]=useState(false);const [logo,setLogo]=useState(null);const [cover,setCover]=useState(null);const [galleryFile,setGalleryFile]=useState(null);const [caption,setCaption]=useState('');const [remove,setRemove]=useState(null);const toast=useToast();const load=()=>{if(!selected){setMedia(null);return;}setMedia(null);setFetching(true);api(`/api/businesses/${selected}/media`).then(setMedia).catch(e=>{setMedia(null);toast(e.message,'error');}).finally(()=>setFetching(false));};useEffect(load,[selected]);async function send(kind,file){if(!file)return;setBusy(true);try{await upload(`/api/businesses/${selected}/${kind}`,file,kind==='images'?{caption}:{});toast(`${kind==='logo'?'Logo':kind==='cover'?'Cover photo':'Gallery photo'} uploaded.`);if(kind==='images'){setCaption('');setGalleryFile(null);}load();}catch(e){toast(e.message,'error');}finally{setBusy(false);}}async function erase(){if(!remove)return;setBusy(true);try{await api(`/api/businesses/${selected}/images/${remove.id}`,{method:'DELETE'});toast('Photo removed from gallery.');setRemove(null);load();}catch(e){toast(e.message,'error');}finally{setBusy(false);}}return <><PageHead eyebrow="YOUR VISUAL IDENTITY" title="Photos & branding" description="Show clients what makes your space special."/><Alert message={error}/>{loading?<Loading/>:!selected?<OwnerEmpty hasInactive={businesses.length>0}/>:<><BusinessWorkspace businesses={businesses} value={selected}/>{fetching?<Loading/>:<><div className="two-card-grid"><Card title="Business logo" subtitle="A clear visual identifier for your establishment."><FilePicker label="Choose logo" preview={media?.logo_url} onFile={setLogo}/><Button icon="upload" busy={busy} disabled={!logo} onClick={()=>send('logo',logo)}>Upload logo</Button></Card><Card title="Cover photograph" subtitle="The first photo visitors see on your business page."><FilePicker label="Choose cover photo" preview={media?.cover_url} onFile={setCover}/><Button icon="upload" busy={busy} disabled={!cover} onClick={()=>send('cover',cover)}>Upload cover</Button></Card></div><Card title="Photo gallery" subtitle={`Upload up to 10 images of your location. ${media?.gallery?.length||0}/10 photos`}><div className="gallery-editor">{media?.gallery?.map(photo=><div className="gallery-editor-item" key={photo.id}><img src={photo.url} alt={photo.caption||'Business gallery photo'}/><button title="Remove image" onClick={()=>setRemove(photo)}><Icon name="trash" size={16}/></button>{photo.caption&&<small>{photo.caption}</small>}</div>)}</div>{(media?.gallery?.length||0)<10&&<div className="gallery-new"><FilePicker label="Add a gallery photo" onFile={setGalleryFile}/><Input id="gallery-caption" label="Photo caption (optional)" value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Describe this image"/><Button icon="plus" busy={busy} disabled={!galleryFile} onClick={()=>send('images',galleryFile)}>Add photo</Button></div>}</Card></>}</>}<Confirm open={!!remove} title="Remove this photo?" description="The image will disappear from the business gallery." danger busy={busy} confirmLabel="Remove photo" onCancel={()=>setRemove(null)} onConfirm={erase}/></>;
}
