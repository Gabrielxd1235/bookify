import React,{useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import {Link} from '../lib/router.jsx';
import {Icon} from './Icon.jsx';
import {categoryIcon} from '../lib/format.js';
export function useBusinessMedia(id){const [media,setMedia]=useState(null);useEffect(()=>{let active=true;if(!id)return;api(`/api/businesses/${id}/media`).then(d=>{if(active)setMedia(d);}).catch(()=>{});return()=>{active=false;};},[id]);return media;}
export function BusinessCard({business,categoryName}){const media=useBusinessMedia(business.id);const href=`/business/${business.id}`;return <article className="business-card"><Link to={href} className="business-visual" aria-label={`View ${business.name}`}>
{(media?.cover_url||media?.logo_url)?<img src={media.cover_url||media.logo_url} alt={`${business.name} establishment`} loading="lazy"/>:<div className="business-visual-fallback"><span><Icon name={categoryIcon(categoryName)} size={46} strokeWidth={1.2}/></span><small>BOOKIFY COLLECTION</small></div>}
<span className="visual-pill"><Icon name="check" size={12}/> Book online</span></Link><div className="business-card-body"><div className="business-meta"><span>{categoryName||'Local service'}</span>{business.is_active===false&&<span>Inactive</span>}</div><Link to={href} className="business-name">{business.name}</Link><p className="business-address"><Icon name="pin" size={15}/>{business.address||'Address available on request'}</p><div className="business-card-footer"><span>Explore services</span><Link to={href} className="circle-arrow" aria-label={`See ${business.name}`}><Icon name="arrow" size={17}/></Link></div></div></article>;}
