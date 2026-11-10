import React, { useEffect, useMemo, useState } from 'react';
import { api, upload } from '../lib/api.js';
import { Icon } from './Icon.jsx';
import '../styles/CategoryBranding.css';

const ICONS = [
  ['tag','General'], ['scissors','Barbershop'], ['sparkles','Beauty'],
  ['leaf','Wellness'], ['heart','Massage'], ['store','Business'],
  ['star','Fitness'], ['calendar','Appointments'], ['building','Facilities'],
  ['users','Community'], ['clock','Time'], ['pin','Location']
];
const blank = { name:'', description:'', icon_key:'tag' };

/** Independent admin view. Uses the existing BOOKIFY JWT API client. */
export function AdminCategoryManager() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // null=closed; 'new'=new; object=existing
  const [form, setForm] = useState(blank);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const [base, brand] = await Promise.all([
        api('/api/categories?limit=100'),
        api('/api/categories/branding')
      ]);
      const map = new Map((brand.categories || []).map(c => [String(c.id), c]));
      setCategories((base.categories || []).map(c => ({ ...c, ...map.get(String(c.id)) })));
    } catch (e) { setError(e.message || 'Unable to load categories.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const filtered = useMemo(() => categories.filter(c =>
    `${c.name} ${c.description || ''}`.toLowerCase().includes(query.toLowerCase())
  ), [categories, query]);

  function openEditor(category) {
    setEditing(category || 'new');
    setForm(category ? { name:category.name || '', description:category.description || '', icon_key:category.icon_key || 'tag' } : blank);
    setFile(null); setRemoveImage(false); setNotice(''); setError('');
  }

  function onChooseFile(event) {
    const selected = event.target.files?.[0];
    if (!selected) { setFile(null); return; }
    if (!['image/jpeg','image/png','image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG or WebP image up to 5 MB.');
      event.target.value = '';
      return;
    }
    setError(''); setFile(selected); setRemoveImage(false);
  }

  async function save(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (name.length < 2 || name.length > 100) { setError('Category name must contain 2–100 characters.'); return; }
    setBusy(true); setNotice(''); setError('');
    try {
      const created = editing === 'new';
      const response = await api(created ? '/api/categories' : `/api/categories/${editing.id}`, {
        method: created ? 'POST' : 'PUT',
        body: { name, description: form.description.trim() || null }
      });
      const categoryId = created ? response.category?.id : editing.id;
      if (!categoryId) throw Error('Category was saved, but the API did not return its ID. Refresh and edit it.');
      await api(`/api/categories/${categoryId}/icon`, { method:'PATCH', body: { icon_key: form.icon_key } });
      if (file) await upload(`/api/categories/${categoryId}/image`, file);
      else if (removeImage) await api(`/api/categories/${categoryId}/image`, { method:'DELETE' });
      setEditing(null); setFile(null); setRemoveImage(false);
      setNotice(created ? 'Category created successfully.' : 'Category updated successfully.');
      await load();
    } catch (e) {
      setError(`${e.message || 'Unable to save category.'} Some preceding steps may already be saved; refresh before retrying.`);
    } finally { setBusy(false); }
  }

  async function deleteCategory() {
    if (!confirmDelete) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/categories/${confirmDelete.id}`, { method:'DELETE' });
      setConfirmDelete(null);
      setNotice('Category deleted.'); await load();
    } catch (e) { setError(e.message || 'Could not delete category.'); }
    finally { setBusy(false); }
  }

  const shownImage = preview || (!removeImage && editing && editing !== 'new' ? editing.image_url : null);
  return <section className="bcategories">
    <header className="bcategories-head">
      <div><div className="bcategories-kicker">CONTENT MANAGEMENT</div><h1>Service categories</h1><p>Manage category names, icons and images shown across BOOKIFY.</p></div>
      <button className="bcategories-primary" type="button" onClick={() => openEditor(null)}><Icon name="plus" size={17}/> Add category</button>
    </header>
    {notice && <div role="status" className="bcategories-success">{notice}</div>}
    {error && <div role="alert" className="bcategories-error">{error}</div>}
    <div className="bcategories-search"><Icon name="search" size={17}/><input aria-label="Search categories" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search categories..."/></div>
    {loading ? <p>Loading categories...</p> : <div className="bcategories-grid">
      {filtered.map(category => <article className="bcategories-card" key={category.id}>
        <div className="bcategories-cover">{category.image_url ? <img alt="" src={category.image_url} loading="lazy" onError={e => {e.currentTarget.style.display='none';}}/> : <div className="bcategories-placeholder"><Icon name={category.icon_key || 'tag'} size={44}/></div>}</div>
        <div className="bcategories-card-body"><div className="bcategories-card-title"><Icon name={category.icon_key || 'tag'} size={19}/><strong>{category.name}</strong></div><p>{category.description || 'No description'}</p><div className="bcategories-actions"><button type="button" onClick={() => openEditor(category)}><Icon name="edit" size={16}/> Edit</button><button type="button" onClick={() => setConfirmDelete(category)}><Icon name="trash" size={16}/> Delete</button></div></div>
      </article>)}
      {!filtered.length && <div className="bcategories-empty">No categories found.</div>}
    </div>}

    {editing && <div className="bcategories-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setEditing(null); }}><section className="bcategories-dialog" role="dialog" aria-modal="true" aria-label="Edit category">
      <header><h2>{editing === 'new' ? 'Add category' : 'Edit category'}</h2><button type="button" aria-label="Close" disabled={busy} onClick={() => setEditing(null)}><Icon name="x"/></button></header>
      <form onSubmit={save} className="bcategories-form">
        <label>Category name<input required minLength={2} maxLength={100} value={form.name} onChange={e => setForm(s => ({ ...s, name:e.target.value }))} placeholder="Barbershops"/></label>
        <label>Description<textarea rows={3} maxLength={500} value={form.description} onChange={e => setForm(s => ({ ...s, description:e.target.value }))} placeholder="Professional hair and grooming services"/></label>
        <fieldset><legend>Category icon</legend><div className="bcategories-icons">{ICONS.map(([key,label]) => <button key={key} type="button" title={label} aria-label={label} aria-pressed={form.icon_key === key} className={form.icon_key === key ? 'selected' : ''} onClick={() => setForm(s => ({ ...s, icon_key:key }))}><Icon name={key} size={22}/><small>{label}</small></button>)}</div></fieldset>
        <label>Category photograph (JPG, PNG or WebP, max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onChooseFile}/></label>
        {shownImage ? <div className="bcategories-image-preview"><img src={shownImage} alt="Category photo preview"/></div> : <div className="bcategories-no-photo"><Icon name="image" size={32}/> No photograph selected</div>}
        {editing !== 'new' && editing.image_url && <label className="bcategories-check"><input type="checkbox" checked={removeImage} onChange={e => {setRemoveImage(e.target.checked); if(e.target.checked)setFile(null);}}/> Remove current category photograph</label>}
        <footer><button type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button><button type="submit" className="bcategories-primary" disabled={busy}>{busy ? 'Saving...' : 'Save category'}</button></footer>
      </form>
    </section></div>}
    {confirmDelete && <div className="bcategories-backdrop" role="presentation"><div className="bcategories-dialog bcate-small" role="dialog" aria-modal="true" aria-label="Delete category"><h2>Delete category?</h2><p>Delete <strong>{confirmDelete.name}</strong>? This may be blocked if businesses still use this category.</p><footer><button disabled={busy} type="button" onClick={() => setConfirmDelete(null)}>Cancel</button><button disabled={busy} className="bcategories-danger" type="button" onClick={deleteCategory}>{busy ? 'Deleting...' : 'Delete category'}</button></footer></div></div>}
  </section>;
}
