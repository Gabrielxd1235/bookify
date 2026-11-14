import {categoryPresentation} from './categoryPresentation.js';
export const money = (value,currency='PEN') => {
  const n=Number(value);if(!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-PE',{style:'currency',currency:currency||'PEN',maximumFractionDigits:2}).format(n);
};
export const dateTime = (value, opts={}) => {
  if(!value) return '—'; const d=new Date(value);if(Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short',...opts}).format(d);
};
export const clock = value => value ? new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit'}).format(new Date(value)) : '—';
export const todayInLima = () => { const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); const p=Object.fromEntries(parts.map(x=>[x.type,x.value])); return `${p.year}-${p.month}-${p.day}`; };
export const initials = (name='B') => name.trim().split(/\s+/).slice(0,2).map(s=>s.charAt(0)).join('').toUpperCase();
export const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const compact = v => new Intl.NumberFormat('en-US').format(Number(v)||0);
export const statusClass = s => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-');
export const categoryIcon = name => categoryPresentation({name}).icon;

// Presentation helpers shared by the dashboards.
export const statusTone = status => ['CONFIRMED','COMPLETED','APPROVED','ACTIVE'].includes(status) ? 'good' : ['PENDING_PAYMENT','PENDING'].includes(status) ? 'warn' : 'bad';
export const statusLabel = status => String(status||'Unknown').replace(/_/g,' ').toLowerCase().replace(/^./,c=>c.toUpperCase());
const limaPart = (value,options) => new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',...options}).format(new Date(value));
export const dayParts = value => {
  if(!value||Number.isNaN(new Date(value).getTime())) return {day:'—',month:'',weekday:'',time:''};
  return {day:limaPart(value,{day:'numeric'}),month:limaPart(value,{month:'short'}),weekday:limaPart(value,{weekday:'short'}),time:limaPart(value,{hour:'numeric',minute:'2-digit'})};
};
export const limaHour = value => Number(limaPart(value,{hour:'numeric',hourCycle:'h23'}));
export const firstName = (name,fallback='there') => (String(name||'').trim().split(/\s+/)[0]) || fallback;
