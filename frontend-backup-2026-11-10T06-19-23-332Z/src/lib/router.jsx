import {useEffect,useState} from 'react';
const event='bookify:navigate';
export function navigate(path,replace=false) {
  const resolved=new URL(typeof path==='string'?path:'/',window.location.href);if(resolved.origin!==window.location.origin)return;const url=resolved.pathname+resolved.search+resolved.hash;
  if(replace) window.history.replaceState({},'',url);
  else if(url!==window.location.pathname+window.location.search+window.location.hash)window.history.pushState({},'',url);
  window.dispatchEvent(new Event(event));
  if(url.includes('#')){requestAnimationFrame(()=>document.getElementById(url.split('#')[1])?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));}
  else window.scrollTo({top:0,behavior:'instant'});
}
export function useRoute(){
  const [location,setLocation]=useState(()=>({pathname:window.location.pathname,search:window.location.search}));
  useEffect(()=>{const update=()=>setLocation({pathname:window.location.pathname,search:window.location.search});window.addEventListener('popstate',update);window.addEventListener(event,update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener(event,update);};},[]);
  return location;
}
export function Link({to,children,onClick,...props}){
  return <a href={to} {...props} onClick={e=>{onClick?.(e);if(!e.defaultPrevented && (!props.target||props.target==='_self') && props.download==null && new URL(to,window.location.href).origin===window.location.origin && e.button===0 && !e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey){e.preventDefault();navigate(to);}}}>{children}</a>;
}
