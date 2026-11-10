export const money = (value,currency='PEN') => {
  const n=Number(value);if(!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-PE',{style:'currency',currency:currency||'PEN',maximumFractionDigits:2}).format(n);
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
export const categoryIcon = name => { const s=String(name||'').toLowerCase();return /barber|haircut|barbería/.test(s)?'scissors':/salon|beauty|peluquer|belleza/.test(s)?'sparkles':/spa|wellness/.test(s)?'leaf':/massage|masaje/.test(s)?'heart':'store'; };
