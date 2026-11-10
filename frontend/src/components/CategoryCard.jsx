import React, {useEffect, useState} from 'react';
import {Link} from '../lib/router.jsx';
import {Icon} from './Icon.jsx';
import {categoryPresentation} from '../lib/categoryPresentation.js';

/** Public categories use Supabase image_url, never local image paths. */
export function CategoryCard({category}) {
  const presentation=categoryPresentation(category);
  const [brokenImage,setBrokenImage]=useState(null);
  useEffect(()=>setBrokenImage(null),[presentation.imageUrl]);
  const imageUrl=presentation.imageUrl && presentation.imageUrl!==brokenImage ? presentation.imageUrl : null;
  return <Link to={`/discover?category=${encodeURIComponent(category.id)}`} className={`category-card category-theme-${presentation.key}`}>
    {imageUrl && <img className="category-photo" src={imageUrl} alt="" loading="lazy" decoding="async" onError={()=>setBrokenImage(imageUrl)}/>}
    <span className="category-shade" aria-hidden="true"/>
    <span className="category-card-top"><span className="category-icon"><Icon name={presentation.icon} size={25}/></span><span className="category-arrow"><Icon name="arrow" size={18}/></span></span>
    <span className="category-caption"><strong>{presentation.title}</strong><span>{presentation.description}</span></span>
  </Link>;
}
