import React,{useState} from 'react';
import {Link} from '../lib/router.jsx';
import {Icon} from './Icon.jsx';
import {categoryPresentation} from '../lib/categoryPresentation.js';

export function CategoryCard({category}) {
  const theme=categoryPresentation(category);const [fallback,setFallback]=useState(0);
  const src=fallback===0?theme.localImage:fallback===1?theme.image:null;
  return <Link to={`/discover?category=${encodeURIComponent(category.id)}`} className={`category-card category-theme-${theme.key}`}>
    {src&&<img className="category-photo" src={src} alt="" loading="lazy" decoding="async" onError={()=>setFallback(value=>value+1)}/>}
    <span className="category-shade" aria-hidden="true"/>
    <span className="category-card-top"><span className="category-icon"><Icon name={theme.icon} size={25}/></span><span className="category-arrow"><Icon name="arrow" size={18}/></span></span>
    <span className="category-caption"><strong>{theme.title}</strong><span>{theme.description}</span></span>
  </Link>;
}
