import React from 'react';
import { Icon } from './Icon.jsx';
import '../styles/CategoryBranding.css';

/** Use with GET /api/categories/branding merged by category id. No local image paths. */
export function CategoryVisual({ category, onClick }) {
  return <button type="button" className="bcategory-visual" onClick={onClick}>
    <span className="bcategory-visual-picture">
      {category.image_url ? <img src={category.image_url} alt="" loading="lazy" /> : <Icon name={category.icon_key || 'tag'} size={30}/>} 
    </span>
    <span className="bcategory-visual-title"><Icon name={category.icon_key || 'tag'} size={18}/>{category.name}</span>
  </button>;
}
