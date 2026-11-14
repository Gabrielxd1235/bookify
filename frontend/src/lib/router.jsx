import {useEffect,useState} from 'react';
import {flushSync} from 'react-dom';
const event='bookify:navigate';
let initialized=false,index=0,activeTransition=null,stopRestoring=()=>{};
const positions=new Map(),routePositions=new Map();
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const routeKey=()=>window.location.pathname+window.location.search;

function restoreScroll(top){
  stopRestoring();let observer,timer;
  const stop=()=>{observer?.disconnect();clearTimeout(timer);window.removeEventListener('wheel',stop);window.removeEventListener('touchstart',stop);window.removeEventListener('keydown',stop);};
  const apply=()=>{window.scrollTo({top,behavior:'instant'});};
  requestAnimationFrame(()=>{apply();});
  // A returning catalog can grow after its API request completes.
  if(top>0&&typeof ResizeObserver!=='undefined'){
    observer=new ResizeObserver(apply);observer.observe(document.body);timer=setTimeout(stop,1800);
    window.addEventListener('wheel',stop,{passive:true});window.addEventListener('touchstart',stop,{passive:true});window.addEventListener('keydown',stop);
  }
  stopRestoring=stop;
}
function publish(direction,after,animate=true){
  document.documentElement.dataset.navigation=direction;
  const update=()=>{window.dispatchEvent(new Event(event));};
  activeTransition?.skipTransition();
  if(animate&&!reduced()&&typeof document.startViewTransition==='function'){
    const transition=document.startViewTransition(()=>{flushSync(update);after();});activeTransition=transition;
    document.documentElement.dataset.transitioning='true';
    // A skipped transition rejects these promises; the navigation itself already happened.
    transition.ready?.catch(()=>{});transition.updateCallbackDone?.catch(()=>{});
    transition.finished.catch(()=>{}).finally(()=>{if(activeTransition===transition){activeTransition=null;delete document.documentElement.dataset.transitioning;}});
  }else{update();after();}
}
export function initializeRouter(){
  if(initialized)return;initialized=true;
  index=window.history.state?.bookifyIndex??0;
  window.history.replaceState({...window.history.state,bookifyIndex:index},'');
  window.history.scrollRestoration='manual';
  window.addEventListener('scroll',()=>{positions.set(index,window.scrollY);routePositions.set(routeKey(),window.scrollY);},{passive:true});
  window.addEventListener('popstate',event=>{
    stopRestoring();const next=event.state?.bookifyIndex??0;const direction=next<index?'back':'forward';index=next;
    publish(direction,()=>restoreScroll(positions.get(index)??0));
  });
}
export function navigate(path,replace=false,{direction='forward'}={}) {
  const resolved=new URL(typeof path==='string'?path:'/',window.location.href);
  if(resolved.origin!==window.location.origin)return;
  const url=resolved.pathname+resolved.search+resolved.hash;
  const current=window.location.pathname+window.location.search+window.location.hash;
  if(url===current&&!replace)return;
  stopRestoring();positions.set(index,window.scrollY);routePositions.set(routeKey(),window.scrollY);
  const samePage=resolved.pathname===window.location.pathname;
  if(replace)window.history.replaceState({...window.history.state,bookifyIndex:index},'',url);
  else window.history.pushState({bookifyIndex:++index},'',url);
  publish(direction,()=>{
    if(resolved.hash){requestAnimationFrame(()=>{let id;try{id=decodeURIComponent(resolved.hash.slice(1));}catch{return;}document.getElementById(id)?.scrollIntoView({behavior:reduced()?'auto':'smooth'});});}
    else restoreScroll(direction==='back'?(routePositions.get(resolved.pathname+resolved.search)??0):0);
  },!samePage);
}
export function useRoute(){
  const read=()=>({pathname:window.location.pathname,search:window.location.search});
  const [location,setLocation]=useState(read);
  useEffect(()=>{const update=()=>setLocation(read());window.addEventListener(event,update);return()=>window.removeEventListener(event,update);},[]);
  return location;
}
export function Link({to,children,onClick,direction,...props}){
  return <a href={to} {...props} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&(!props.target||props.target==='_self')&&props.download==null&&new URL(to,window.location.href).origin===window.location.origin&&e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey){e.preventDefault();navigate(to,false,{direction});}}}>{children}</a>;
}
