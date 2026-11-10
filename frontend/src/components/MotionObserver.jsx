import {useEffect} from 'react';

// Content remains visible if animations or observers are unavailable.
export function MotionObserver(){
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(!('IntersectionObserver' in window)||!Element.prototype.animate)return;
    const seen=new WeakSet();const animations=new Set();
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){if(!entry.isIntersecting)continue;observer.unobserve(entry.target);
        if(preference.matches||document.documentElement.dataset.navigation==='back')continue;
        const siblings=entry.target.parentElement?.children;const index=siblings?Array.prototype.indexOf.call(siblings,entry.target):0;
        const animation=entry.target.animate([{opacity:.12,transform:'translateY(20px)'},{opacity:1,transform:'translateY(0)'}],{duration:540,delay:Math.min(index,4)*45,easing:'cubic-bezier(.22,1,.36,1)'});
        animations.add(animation);animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));
      }
    },{threshold:.08});
    const selector='.section-top,.category-card,.step,.benefit-items>span,.stat-card,.owner-cta-inner>div';
    const scan=()=>document.querySelectorAll(selector).forEach(element=>{if(!seen.has(element)){seen.add(element);observer.observe(element);}});
    let frame;const mutations=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(scan);});
    scan();mutations.observe(document.getElementById('root'),{childList:true,subtree:true});
    const stop=()=>{if(preference.matches)animations.forEach(animation=>animation.cancel());};preference.addEventListener('change',stop);
    return()=>{observer.disconnect();mutations.disconnect();cancelAnimationFrame(frame);animations.forEach(animation=>animation.cancel());preference.removeEventListener('change',stop);};
  },[]);
  return null;
}
