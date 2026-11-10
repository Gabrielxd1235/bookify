/** English presentation defaults for existing Spanish/English category names. */
export const categoryThemes = {
  barber: { title:'Barbershops', icon:'scissors', description:'Fresh cuts. Sharp details.' },
  beauty: { title:'Beauty Salons', icon:'sparkles', description:'Your next signature look.' },
  gym: { title:'Gyms', icon:'dumbbell', description:'Move well. Feel stronger.' },
  massage: { title:'Massage Centers', icon:'massage', description:'Unwind, reset and recharge.' },
  spa: { title:'Spas', icon:'lotus', description:'A little time to slow down.' },
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
  const key=categoryKey(category?.name);
  const theme=categoryThemes[key];
  const description=String(category?.description||'').trim();
  const isSpanishSeedDescription=/^servicios (de|del) /i.test(description);
  return {
    key:key||'other',
    title:theme ? theme.title : (category?.name || 'Local services'),
    description:description && !isSpanishSeedDescription ? description : (theme?.description || description || 'Discover your next experience.'),
    icon:category?.icon_key && category.icon_key!=='tag' ? category.icon_key : (theme?.icon||'tag'),
    imageUrl:typeof category?.image_url==='string' && /^https:\/\//i.test(category.image_url) ? category.image_url : null,
  };
}
