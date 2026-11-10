import {useEffect,useState} from 'react';
const event='bookify:navigate';
export function navigate(path,replace=false) {
  const url=typeof path==='string'?path:'/';
  if(replace) window.history.replaceState({},'',url);
  else window.history.pushState({},'',url);
  window.dispatchEvent(new Event(event));
  if(url.includes('#')){requestAnimationFrame(()=>document.getElementById(url.split('#')[1])?.scrollIntoView({behavior:'smooth'}));}
  else window.scrollTo({top:0,behavior:'instant'});
}
export function useRoute(){
  const [location,setLocation]=useState(()=>({pathname:window.location.pathname,search:window.location.search}));
  useEffect(()=>{const update=()=>setLocation({pathname:window.location.pathname,search:window.location.search});window.addEventListener('popstate',update);window.addEventListener(event,update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener(event,update);};},[]);
  return location;
}
export function Link({to,children,onClick,...props}){
  return <a href={to} {...props} onClick={e=>{onClick?.(e);if(!e.defaultPrevented && e.button===0 && !e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey){e.preventDefault();navigate(to);}}}>{children}</a>;
}
