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
import {SERVICE_MODELS,BILLING_PERIODS,serviceModel,recommendedModel,priceUnit,describeService,isAppointment,reservationKindLabel,reservationWhen,isActivePlan} from '../lib/serviceModels.js';

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
          <div><span className="eyebrow">YOUR BUSINESS</span><h2>{business?.name||'Loading your business...'}</h2>{business&&<p><Icon name="pin" size={15}/>{business.address||'No address provided'}<span className="live-dot">Live in the catalog</span>{summary?.activePlans>0&&<span className="live-dot plans-dot">{summary.activePlans} active {summary.activePlans===1?'plan':'plans'}</span>}</p>}</div>
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

const blankService={name:'',description:'',price:'',service_type:'APPOINTMENT',duration_minutes:'30',billing_period:'MONTH',sessions_included:'10',validity_days:'90'};
export function OwnerServices(){
  const {businesses,loading,error}=useMyBusinesses();
  const [selected]=useSelectedBusiness(businesses);
  const toast=useToast();
  const [items,setItems]=useState([]);
  const [loadingItems,setLoadingItems]=useState(false);
  const [categories,setCategories]=useState([]);
  const [edit,setEdit]=useState(null);
  const [form,setForm]=useState(blankService);
  const [busy,setBusy]=useState(false);
  const [remove,setRemove]=useState(null);
  const load=()=>{if(!selected)return;setLoadingItems(true);api(endpoint.services({business_id:selected,page:1,limit:100})).then(d=>setItems(d.services||[])).catch(e=>toast(e.message,'error')).finally(()=>setLoadingItems(false));};
  useEffect(load,[selected]);
  useEffect(()=>{api('/api/categories').then(d=>setCategories(d.categories||[])).catch(()=>{});},[]);

  const business=activeBusinesses(businesses).find(b=>String(b.id)===String(selected));
  const categoryName=categories.find(c=>String(c.id)===String(business?.category_id))?.name||'';
  const recommended=recommendedModel(categoryName);
  const model=serviceModel(form.service_type);
  const set=(key,value)=>setForm(current=>({...current,[key]:value}));

  function open(service){
    setEdit(service||'new');
    setForm(service?{name:service.name||'',description:service.description||'',price:String(service.price??''),service_type:service.service_type||'APPOINTMENT',duration_minutes:String(service.duration_minutes??30),billing_period:service.billing_period||'MONTH',sessions_included:String(service.sessions_included??10),validity_days:String(service.validity_days??90)}:{...blankService,service_type:recommended});
  }
  async function save(e){
    e.preventDefault();setBusy(true);
    try{
      // Only the fields that belong to the chosen model are sent; the API clears the rest.
      const payload={name:form.name.trim(),description:form.description.trim()||null,price:Number(form.price),service_type:form.service_type,...(edit==='new'?{business_id:Number(selected)}:{})};
      if(form.service_type==='APPOINTMENT')payload.duration_minutes=Number(form.duration_minutes);
      if(form.service_type==='SUBSCRIPTION')payload.billing_period=form.billing_period;
      if(form.service_type==='PACKAGE'){payload.sessions_included=Number(form.sessions_included);payload.validity_days=Number(form.validity_days);}
      await api(edit==='new'?'/api/services':`/api/services/${edit.id}`,{method:edit==='new'?'POST':'PUT',body:payload});
      toast(edit==='new'?'Service created.':'Service updated.');setEdit(null);load();
    }catch(e){toast(e.message,'error');}finally{setBusy(false);}
  }
  async function deactivate(){setBusy(true);try{await api(`/api/services/${remove.id}`,{method:'DELETE'});toast('Service deactivated.');setRemove(null);load();}catch(e){toast(e.message,'error');}finally{setBusy(false);}}

  const preview={...form,price:Number(form.price)||0,duration_minutes:Number(form.duration_minutes)||0,sessions_included:Number(form.sessions_included)||0,validity_days:Number(form.validity_days)||0};

  return <>
    <PageHead eyebrow="SERVICE CATALOG" title="Manage services" description="Sell appointments, memberships, session packages or day passes." action={<Button icon="plus" disabled={!selected} onClick={()=>open(null)}>Add service</Button>}/>
    <Alert message={error}/>
    {loading?<Loading/>:!selected?<OwnerEmpty hasInactive={businesses.length>0}/>:<>
      <div className="toolbar-card"><BusinessWorkspace businesses={businesses} value={selected}/><span className="toolbar-hint">{categoryName?`${categoryName} · `:''}Showing active services for this business</span></div>
      {edit&&<Card title={edit==='new'?'Create a service':'Edit service'} subtitle="Choose how clients pay for it, then fill in the details.">
        <form className="stacked-form" onSubmit={save}>
          <div className="form-field"><span className="field-label">How is this service sold?</span>
            <div className="model-picker" role="radiogroup" aria-label="Service model">{SERVICE_MODELS.map(option=><button type="button" key={option.type} role="radio" aria-checked={form.service_type===option.type} className={`model-option ${form.service_type===option.type?'active':''}`} onClick={()=>set('service_type',option.type)}>
              <span className="model-option-icon"><Icon name={option.icon} size={20}/></span>
              <strong>{option.label}{option.type===recommended&&<em>Suggested</em>}</strong>
              <small>{option.tagline}</small>
              <small className="model-option-example">{option.example}</small>
            </button>)}</div>
          </div>
          <Input id="service-name" label="Service name" value={form.name} onChange={e=>set('name',e.target.value)} minLength={2} maxLength={150} placeholder={form.service_type==='SUBSCRIPTION'?'e.g. Monthly membership':form.service_type==='PACKAGE'?'e.g. 10-class pack':form.service_type==='DAY_PASS'?'e.g. Day pass':'e.g. Premium haircut'} required/>
          <div className="two-col">
            <Input id="service-price" label={`${model.priceLabel} (S/)`} type="number" min={form.service_type==='APPOINTMENT'?'0':'0.01'} step="0.01" required value={form.price} onChange={e=>set('price',e.target.value)}/>
            {form.service_type==='APPOINTMENT'&&<Input id="service-duration" label="Duration (minutes)" type="number" min="1" max="1440" step="1" required value={form.duration_minutes} onChange={e=>set('duration_minutes',e.target.value)} hint="Used to build the available time slots."/>}
            {form.service_type==='SUBSCRIPTION'&&<Select id="service-period" label="Billing period" value={form.billing_period} onChange={e=>set('billing_period',e.target.value)}>{BILLING_PERIODS.map(period=><option key={period.value} value={period.value}>{period.label} — renews {period.adverb}</option>)}</Select>}
            {form.service_type==='PACKAGE'&&<Input id="service-sessions" label="Sessions included" type="number" min="1" max="500" step="1" required value={form.sessions_included} onChange={e=>set('sessions_included',e.target.value)}/>}
            {form.service_type==='DAY_PASS'&&<div className="form-field"><span className="field-label">Access</span><p className="model-note"><Icon name="sun" size={16}/>Valid for the whole day the client chooses.</p></div>}
          </div>
          {form.service_type==='PACKAGE'&&<Input id="service-validity" label="Valid for (days)" type="number" min="1" max="730" step="1" required value={form.validity_days} onChange={e=>set('validity_days',e.target.value)} hint="Sessions must be used within this period after purchase."/>}
          <Textarea id="service-description" label="Description" value={form.description} onChange={e=>set('description',e.target.value)} rows={3} maxLength={1000} placeholder="What is included?"/>
          <div className="model-preview" aria-live="polite"><span className="model-option-icon"><Icon name={model.icon} size={18}/></span><div><small>CLIENTS WILL SEE</small><strong>{form.name.trim()||'Your service'} · {money(preview.price)} <span>{priceUnit(preview)}</span></strong><p>{describeService(preview)}{form.service_type==='APPOINTMENT'?'':' · bought with a start date, no time slot'}</p></div></div>
          <div className="form-actions"><Button variant="outline" onClick={()=>setEdit(null)}>Cancel</Button><Button type="submit" busy={busy} icon="check">Save service</Button></div>
        </form>
      </Card>}
      <Card title="Available services" subtitle={`${items.length} active ${items.length===1?'service':'services'}`}>
        {loadingItems?<Skeleton variant="rows" count={3}/>:items.length?<div className="service-manage-list">{items.map(s=><div key={s.id}>
          <div className="service-manage-icon"><Icon name={serviceModel(s.service_type).icon} size={22}/></div>
          <div className="service-manage-content"><strong>{s.name}<span className={`model-badge model-${String(s.service_type||'APPOINTMENT').toLowerCase().replace('_','-')}`}>{serviceModel(s.service_type).label}</span></strong><small>{describeService(s)}{s.description?` · ${s.description}`:''}</small></div>
          <strong className="service-manage-price">{money(s.price)} <small>{priceUnit(s)}</small></strong>
          <div className="table-actions"><button title="Edit" aria-label={`Edit ${s.name}`} onClick={()=>open(s)}><Icon name="edit" size={18}/></button><button title="Deactivate" aria-label={`Deactivate ${s.name}`} onClick={()=>setRemove(s)}><Icon name="trash" size={18}/></button></div>
        </div>)}</div>:<Empty icon="scissors" title="No active services" description="Add your first service so clients can book." action={<Button onClick={()=>open(null)}>Add service</Button>}/>}
      </Card>
    </>}
    <Confirm open={!!remove} title="Deactivate this service?" description="This service will no longer be available for new reservations." danger busy={busy} confirmLabel="Deactivate service" onCancel={()=>setRemove(null)} onConfirm={deactivate}/>
  </>;
}

// ---- Weekly schedule editor ----
const timeLabel=value=>{const [h,m]=String(value||'00:00').split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;};
const toMinutes=value=>{const [h,m]=String(value||'0:0').split(':').map(Number);return h*60+m;};
const dayMinutes=row=>!row.open?0:Math.max(0,toMinutes(row.closes_at)-toMinutes(row.opens_at)-(row.hasBreak?Math.max(0,toMinutes(row.break_ends_at)-toMinutes(row.break_starts_at)):0));
const hoursText=minutes=>{const hours=Math.floor(minutes/60),rest=minutes%60;return rest?`${hours} h ${rest} min`:`${hours} h`;};
const dayError=row=>{
  if(!row.open)return '';
  if(toMinutes(row.closes_at)<=toMinutes(row.opens_at))return 'Closing time must be after opening time.';
  if(row.hasBreak){
    if(toMinutes(row.break_ends_at)<=toMinutes(row.break_starts_at))return 'The break must end after it starts.';
    if(toMinutes(row.break_starts_at)<=toMinutes(row.opens_at)||toMinutes(row.break_ends_at)>=toMinutes(row.closes_at))return 'The break must fall inside the opening hours.';
  }
  return '';
};
const scheduleKey=row=>row.open?`${row.opens_at}-${row.closes_at}-${row.hasBreak?`${row.break_starts_at}-${row.break_ends_at}`:''}`:'closed';
// Monday first: the order most businesses think in. Weekday numbers stay 0 = Sunday for the API.
const weekOrder=[1,2,3,4,5,6,0];
const schedulePresets=[
  {label:'Mon – Fri',hint:'9:00 AM – 6:00 PM',days:[1,2,3,4,5],opens_at:'09:00',closes_at:'18:00'},
  {label:'Mon – Sat',hint:'9:00 AM – 7:00 PM',days:[1,2,3,4,5,6],opens_at:'09:00',closes_at:'19:00'},
  {label:'Every day',hint:'9:00 AM – 6:00 PM',days:[0,1,2,3,4,5,6],opens_at:'09:00',closes_at:'18:00'},
  {label:'With lunch break',hint:'9 – 1 · 3 – 7, Mon – Sat',days:[1,2,3,4,5,6],opens_at:'09:00',closes_at:'19:00',break_starts_at:'13:00',break_ends_at:'15:00'},
];
/** Free time entry: the owner types any hour and minute and picks AM or PM. Emits "HH:mm". */
function TimeSelect({value,onChange,label}){
  const pad=number=>String(number).padStart(2,'0');
  const [hour24,minute]=String(value||'09:00').split(':').map(Number);
  const isPm=hour24>=12;
  const [hourText,setHourText]=useState(String(hour24%12||12));
  const [minuteText,setMinuteText]=useState(pad(minute));
  // Keep the boxes in sync when the value changes from outside (presets, copy, discard).
  useEffect(()=>{setHourText(String(hour24%12||12));setMinuteText(pad(minute));},[value]);
  const emit=(hours,minutes,pm)=>{const h=Math.min(12,Math.max(1,Number(hours)||12));const m=Math.min(59,Math.max(0,Number(minutes)||0));onChange(`${pad(h%12+(pm?12:0))}:${pad(m)}`);};
  const typeHour=event=>{const text=event.target.value.replace(/\D/g,'').slice(0,2);setHourText(text);const number=Number(text);if(text&&number>=1&&number<=12)emit(number,minuteText,isPm);};
  const typeMinute=event=>{const text=event.target.value.replace(/\D/g,'').slice(0,2);setMinuteText(text);const number=Number(text);if(text&&number<=59)emit(hourText,number,isPm);};
  const settle=()=>{setHourText(String(hour24%12||12));setMinuteText(pad(minute));};
  const step=(event,part)=>{
    if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;
    event.preventDefault();const direction=event.key==='ArrowUp'?1:-1;
    if(part==='hour'){const current=hour24%12||12;emit((current-1+direction+12)%12+1,minute,isPm);}
    else emit(hour24%12||12,(minute+direction*5+60)%60,isPm);
  };
  return <span className="time-field" role="group" aria-label={label}>
    <input type="text" inputMode="numeric" autoComplete="off" maxLength={2} aria-label={`${label}, hour`} value={hourText} onChange={typeHour} onBlur={settle} onFocus={event=>event.target.select()} onKeyDown={event=>step(event,'hour')}/>
    <span aria-hidden="true">:</span>
    <input type="text" inputMode="numeric" autoComplete="off" maxLength={2} aria-label={`${label}, minutes`} value={minuteText} onChange={typeMinute} onBlur={settle} onFocus={event=>event.target.select()} onKeyDown={event=>step(event,'minute')}/>
    <span className="time-period"><button type="button" className={!isPm?'active':''} aria-pressed={!isPm} onClick={()=>emit(hour24%12||12,minute,false)}>AM</button><button type="button" className={isPm?'active':''} aria-pressed={isPm} onClick={()=>emit(hour24%12||12,minute,true)}>PM</button></span>
  </span>;
}

export function OwnerHours(){
  const {businesses,loading,error}=useMyBusinesses();
  const [selected]=useSelectedBusiness(businesses);
  const [rows,setRows]=useState([]);
  const [saved,setSaved]=useState({});
  const [loadBusy,setLoadBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [menu,setMenu]=useState(null);
  const toast=useToast();
  const fetchHours=()=>{
    if(!selected)return;setLoadBusy(true);
    api(`/api/businesses/${selected}/hours`).then(d=>{
      const existing=d.hours||d.business_hours||[];
      const next=weekdays.map((label,weekday)=>{const h=existing.find(a=>Number(a.weekday)===weekday);const hasBreak=Boolean(h?.break_starts_at&&h?.break_ends_at);return {weekday,name:label,exists:!!h,open:h?!h.is_closed:false,opens_at:String(h?.opens_at||'09:00').slice(0,5),closes_at:String(h?.closes_at||'18:00').slice(0,5),hasBreak,break_starts_at:String(h?.break_starts_at||'13:00').slice(0,5),break_ends_at:String(h?.break_ends_at||'14:00').slice(0,5)};});
      setRows(next);setSaved(Object.fromEntries(next.map(row=>[row.weekday,row.exists?scheduleKey(row):'closed'])));
    }).catch(e=>toast(e.message,'error')).finally(()=>setLoadBusy(false));
  };
  useEffect(fetchHours,[selected]);
  useEffect(()=>{if(menu===null)return undefined;const close=()=>setMenu(null);document.addEventListener('click',close);return()=>document.removeEventListener('click',close);},[menu]);

  const update=(weekday,changes)=>setRows(current=>current.map(row=>row.weekday===weekday?{...row,...changes}:row));
  const changed=rows.filter(row=>saved[row.weekday]!==scheduleKey(row));
  const invalid=rows.filter(row=>dayError(row));
  const openDays=rows.filter(row=>row.open);
  const totalMinutes=rows.reduce((sum,row)=>sum+dayMinutes(row),0);
  function applyPreset(preset){setRows(current=>current.map(row=>preset.days.includes(row.weekday)?{...row,open:true,opens_at:preset.opens_at,closes_at:preset.closes_at,hasBreak:Boolean(preset.break_starts_at),break_starts_at:preset.break_starts_at||row.break_starts_at,break_ends_at:preset.break_ends_at||row.break_ends_at}:{...row,open:false}));}
  function copyFrom(source,targets){setRows(current=>current.map(row=>targets.includes(row.weekday)&&row.weekday!==source.weekday?{...row,open:source.open,opens_at:source.opens_at,closes_at:source.closes_at,hasBreak:source.hasBreak,break_starts_at:source.break_starts_at,break_ends_at:source.break_ends_at}:row));setMenu(null);}
  async function saveAll(){
    if(!changed.length||invalid.length||saving)return;
    setSaving(true);let done=0;
    try{
      for(const row of changed){
        const body={weekday:row.weekday,is_closed:!row.open,opens_at:row.open?row.opens_at:null,closes_at:row.open?row.closes_at:null,break_starts_at:row.open&&row.hasBreak?row.break_starts_at:null,break_ends_at:row.open&&row.hasBreak?row.break_ends_at:null};
        await api(row.exists?`/api/businesses/${selected}/hours/${row.weekday}`:`/api/businesses/${selected}/hours`,{method:row.exists?'PUT':'POST',body});
        done++;
      }
      toast(`Schedule saved (${done} ${done===1?'day':'days'} updated).`);
    }catch(e){toast(done?`${e.message} ${done} of ${changed.length} days were saved.`:e.message,'error');}
    finally{setSaving(false);fetchHours();}
  }

  return <>
    <PageHead eyebrow="AVAILABILITY" title="Business hours" description="Set when clients can book. Every day can have its own hours and a break."/>
    <Alert message={error}/>
    {loading?<Loading/>:!selected?<OwnerEmpty hasInactive={businesses.length>0}/>:<>
      <BusinessWorkspace businesses={businesses} value={selected}/>
      {loadBusy&&!rows.length?<Card><Skeleton variant="rows" count={5}/></Card>:<>
        <div className="schedule-summary">
          <div className="schedule-week" aria-hidden="true">{weekOrder.map(weekday=>{const row=rows.find(item=>item.weekday===weekday);return <span key={weekday} className={row?.open?'open':''}>{weekdays[weekday].slice(0,1)}</span>;})}</div>
          <div><strong>{openDays.length?`Open ${openDays.length} ${openDays.length===1?'day':'days'} a week`:'Closed all week'}</strong><small>{openDays.length?`${hoursText(totalMinutes)} of bookable time per week`:'Clients cannot book appointments yet'} · Peru local time (PET)</small></div>
        </div>
        <Card title="Quick setup" subtitle="Start from a common schedule, then adjust any day. Nothing is saved until you press Save schedule.">
          <div className="schedule-presets">{schedulePresets.map(preset=><button type="button" key={preset.label} onClick={()=>applyPreset(preset)}><strong>{preset.label}</strong><small>{preset.hint}</small></button>)}</div>
        </Card>
        <Card title="Weekly schedule" subtitle="Switch a day off to close it. Add a break for a split shift, such as closing at lunchtime.">
          <div className="schedule-list">{weekOrder.map(weekday=>{const row=rows.find(item=>item.weekday===weekday);if(!row)return null;const problem=dayError(row);const dirty=saved[row.weekday]!==scheduleKey(row);return <div key={weekday} className={`schedule-day ${row.open?'is-open':'is-closed'} ${problem?'has-error':''}`}>
            <div className="schedule-day-head">
              <label className={`access-toggle schedule-toggle ${row.open?'on':''}`}><input type="checkbox" checked={row.open} aria-label={`${row.name} open`} onChange={event=>update(weekday,{open:event.target.checked})}/><span className="access-switch" aria-hidden="true"/><span>{row.name}</span></label>
              {dirty&&<span className="schedule-dirty">Unsaved</span>}
            </div>
            {row.open?<div className="schedule-day-body">
              <div className="schedule-range"><TimeSelect label={`${row.name} opening time`} value={row.opens_at} onChange={value=>update(weekday,{opens_at:value})}/><span>to</span><TimeSelect label={`${row.name} closing time`} value={row.closes_at} onChange={value=>update(weekday,{closes_at:value})}/></div>
              {row.hasBreak?<div className="schedule-range schedule-break"><small>Break</small><TimeSelect label={`${row.name} break start`} value={row.break_starts_at} onChange={value=>update(weekday,{break_starts_at:value})}/><span>to</span><TimeSelect label={`${row.name} break end`} value={row.break_ends_at} onChange={value=>update(weekday,{break_ends_at:value})}/><button type="button" className="schedule-link danger" onClick={()=>update(weekday,{hasBreak:false})}>Remove</button></div>:<button type="button" className="schedule-link" onClick={()=>update(weekday,{hasBreak:true})}><Icon name="plus" size={14}/>Add a break</button>}
              {problem&&<small className="error-text" role="alert">{problem}</small>}
            </div>:<p className="schedule-closed">Closed — no appointments offered</p>}
            <div className="schedule-day-side">
              {row.open&&!problem&&<span className="schedule-hours">{hoursText(dayMinutes(row))}</span>}
              <div className="schedule-copy"><button type="button" className="icon-btn" aria-label={`Copy ${row.name} hours to other days`} aria-expanded={menu===weekday} onClick={event=>{event.stopPropagation();setMenu(menu===weekday?null:weekday);}}><Icon name="clipboard" size={17}/></button>
                {menu===weekday&&<div className="schedule-menu" role="menu"><span>Copy {row.name} to</span><button type="button" role="menuitem" onClick={()=>copyFrom(row,[0,1,2,3,4,5,6])}>Every day</button><button type="button" role="menuitem" onClick={()=>copyFrom(row,[1,2,3,4,5])}>Monday to Friday</button><button type="button" role="menuitem" onClick={()=>copyFrom(row,[6,0])}>Saturday and Sunday</button></div>}
              </div>
            </div>
          </div>;})}</div>
        </Card>
        <div className={`schedule-savebar ${changed.length?'visible':''}`} aria-live="polite">
          <span>{invalid.length?`Fix ${invalid.length} ${invalid.length===1?'day':'days'} before saving`:changed.length?`${changed.length} ${changed.length===1?'day':'days'} with unsaved changes`:'All changes saved'}</span>
          <div><Button variant="outline" disabled={!changed.length||saving} onClick={fetchHours}>Discard</Button><Button icon="check" busy={saving} disabled={!changed.length||invalid.length>0} onClick={saveAll}>Save schedule</Button></div>
        </div>
      </>}
    </>}
  </>;
}

export function OwnerReservations(){const {businesses,loading,error}=useMyBusinesses();const [selected]=useSelectedBusiness(businesses);const [page,setPage]=useState(1);const [items,setItems]=useState([]);const [pagination,setPagination]=useState(null);const [busy,setBusy]=useState(false);const [fetchError,setFetchError]=useState('');const names=useReservationNames(items);const reload=()=>{if(!selected)return;setBusy(true);setFetchError('');api(`/api/reservations/business/${selected}?page=${page}&limit=10`).then(d=>{setItems(d.reservations||[]);setPagination(d.pagination);}).catch(e=>setFetchError(e.message)).finally(()=>setBusy(false));};useEffect(()=>{setPage(1);},[selected]);useEffect(reload,[selected,page]);return <><PageHead eyebrow="YOUR APPOINTMENTS" title="Business bookings" description="See incoming reservations and their payment states."/><Alert message={error||fetchError}/>{loading?<Loading/>:!selected?<OwnerEmpty hasInactive={businesses.length>0}/>:<><BusinessWorkspace businesses={businesses} value={selected}/><div className="owner-refresh-row"><Button variant="outline" icon="refresh" onClick={reload}>Refresh bookings</Button></div><Card>{busy?<Skeleton variant="rows" count={5}/>:items.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Reservation</th><th>Service</th><th>Appointment</th><th>Amount</th><th>Deposit (50%)</th><th>Status</th></tr></thead><tbody>{items.map(r=><tr key={r.id}><td data-label="Reservation"><strong>#{r.id}</strong><small>{clientLabel(r)}</small></td><td data-label="Service">{names.serviceName(r.service_id)}</td><td data-label="Appointment">{reservationWhen(r)}{!isAppointment(r)&&<small>{reservationKindLabel(r)}</small>}</td><td data-label="Amount">{money(r.total_amount,r.currency||'PEN')}</td><td data-label="Deposit (50%)">{money(r.deposit_amount,r.currency||'PEN')}<small>{r.status==='CONFIRMED'?'Paid (Demo)':r.status==='PENDING_PAYMENT'?'Awaiting deposit':'Unpaid'}</small></td><td data-label="Status"><Status value={r.status}/></td></tr>)}</tbody></table></div>:<Empty icon="calendar" title="No bookings received" description="Customer reservations will appear here automatically."/>}<Pagination pagination={pagination} onChange={setPage}/></Card><p className="notice-line"><Icon name="info" size={16}/> An appointment is confirmed only after the server accepts the 50% demo deposit. Real payments and refunds are not supported.</p></>}</>;
}

export function OwnerMedia(){const {businesses,loading,error}=useMyBusinesses();const [selected]=useSelectedBusiness(businesses);const [media,setMedia]=useState(null);const [fetching,setFetching]=useState(false);const [busy,setBusy]=useState(false);const [logo,setLogo]=useState(null);const [cover,setCover]=useState(null);const [galleryFile,setGalleryFile]=useState(null);const [caption,setCaption]=useState('');const [remove,setRemove]=useState(null);const toast=useToast();const load=()=>{if(!selected){setMedia(null);return;}setMedia(null);setFetching(true);api(`/api/businesses/${selected}/media`).then(setMedia).catch(e=>{setMedia(null);toast(e.message,'error');}).finally(()=>setFetching(false));};useEffect(load,[selected]);async function send(kind,file){if(!file)return;setBusy(true);try{await upload(`/api/businesses/${selected}/${kind}`,file,kind==='images'?{caption}:{});toast(`${kind==='logo'?'Logo':kind==='cover'?'Cover photo':'Gallery photo'} uploaded.`);if(kind==='images'){setCaption('');setGalleryFile(null);}load();}catch(e){toast(e.message,'error');}finally{setBusy(false);}}async function erase(){if(!remove)return;setBusy(true);try{await api(`/api/businesses/${selected}/images/${remove.id}`,{method:'DELETE'});toast('Photo removed from gallery.');setRemove(null);load();}catch(e){toast(e.message,'error');}finally{setBusy(false);}}return <><PageHead eyebrow="YOUR VISUAL IDENTITY" title="Photos & branding" description="Show clients what makes your space special."/><Alert message={error}/>{loading?<Loading/>:!selected?<OwnerEmpty hasInactive={businesses.length>0}/>:<><BusinessWorkspace businesses={businesses} value={selected}/>{fetching?<Loading/>:<><div className="two-card-grid"><Card title="Business logo" subtitle="A clear visual identifier for your establishment."><FilePicker label="Choose logo" preview={media?.logo_url} onFile={setLogo}/><Button icon="upload" busy={busy} disabled={!logo} onClick={()=>send('logo',logo)}>Upload logo</Button></Card><Card title="Cover photograph" subtitle="The first photo visitors see on your business page."><FilePicker label="Choose cover photo" preview={media?.cover_url} onFile={setCover}/><Button icon="upload" busy={busy} disabled={!cover} onClick={()=>send('cover',cover)}>Upload cover</Button></Card></div><Card title="Photo gallery" subtitle={`Upload up to 10 images of your location. ${media?.gallery?.length||0}/10 photos`}><div className="gallery-editor">{media?.gallery?.map(photo=><div className="gallery-editor-item" key={photo.id}><img src={photo.url} alt={photo.caption||'Business gallery photo'}/><button title="Remove image" onClick={()=>setRemove(photo)}><Icon name="trash" size={16}/></button>{photo.caption&&<small>{photo.caption}</small>}</div>)}</div>{(media?.gallery?.length||0)<10&&<div className="gallery-new"><FilePicker label="Add a gallery photo" onFile={setGalleryFile}/><Input id="gallery-caption" label="Photo caption (optional)" value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Describe this image"/><Button icon="plus" busy={busy} disabled={!galleryFile} onClick={()=>send('images',galleryFile)}>Add photo</Button></div>}</Card></>}</>}<Confirm open={!!remove} title="Remove this photo?" description="The image will disappear from the business gallery." danger busy={busy} confirmLabel="Remove photo" onCancel={()=>setRemove(null)} onConfirm={erase}/></>;
}
