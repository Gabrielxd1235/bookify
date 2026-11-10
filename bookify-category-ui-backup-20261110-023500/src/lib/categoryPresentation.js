const image = id => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=720&q=82`;
export const categoryThemes = {
  barber: { title:'Barbershops', icon:'scissors', description:'Fresh cuts. Sharp details.', image:image('photo-1503951914875-452162b0f3f1') },
  beauty: { title:'Beauty Salons', icon:'sparkles', description:'Your next signature look.', image:image('photo-1562322140-8baeececf3df') },
  gym: { title:'Gyms', icon:'dumbbell', description:'Move well. Feel stronger.', image:image('photo-1728486145245-d4cb0c9c3470') },
  massage: { title:'Massage Centers', icon:'massage', description:'Unwind, reset and recharge.', image:image('photo-1519823551278-64ac92734fb1') },
  spa: { title:'Spas', icon:'lotus', description:'A little time to slow down.', image:image('photo-1540555700478-4be289fbecef') },
};
export function categoryKey(name) {
  const text=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/barber|haircut/.test(text))return 'barber';
  if(/salon|beauty|peluquer|belleza/.test(text))return 'beauty';
  if(/gym|fitness|gimnas/.test(text))return 'gym';
  if(/massage|masaj/.test(text))return 'massage';
  if(/spa|wellness/.test(text))return 'spa';
  return null;
}
export function categoryPresentation(category) {
  const key=categoryKey(category.name);const theme=categoryThemes[key];
  return theme?{...theme,key,localImage:`/images/categories/${key}.jpg`}:{title:category.name||'Local services',description:'Discover your next experience.',icon:'store',key:'other'};
}
