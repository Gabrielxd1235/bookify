import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, upload } from '../lib/api.js';
import { Icon } from './Icon.jsx';
import { mergeCategoryBranding } from '../lib/categoryBranding.js';
import { categoryKey } from '../lib/categoryPresentation.js';
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
  const [brandingReady, setBrandingReady] = useState(false);
  const [brandingWarning, setBrandingWarning] = useState('');
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
  const fileInputRef = useRef(null);
  const nameInputRef = useRef(null);

  async function load() {
    setLoading(true); setError(''); setBrandingWarning('');
    try {
      const [base, branding] = await Promise.allSettled([
        api('/api/categories?limit=100'),
        api('/api/categories/branding')
      ]);
      if (base.status === 'rejected') throw base.reason;
      if (branding.status === 'fulfilled') {
        setBrandingReady(true);
        setCategories(mergeCategoryBranding(base.value.categories || [], branding.value.categories || []));
      } else {
        setBrandingReady(false);
        setCategories(base.value.categories || []);
        setBrandingWarning(`Category media API is unavailable: ${branding.reason?.message || 'Check /api/categories/branding'}. Names and descriptions remain available, but icon and photo changes require the backend add-on.`);
      }
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

  useEffect(() => {
    if (!editing && !confirmDelete) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) { setEditing(null); setConfirmDelete(null); setError(''); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [editing, confirmDelete, busy]);
  useEffect(() => { if (editing) nameInputRef.current?.focus(); }, [editing]);

  const filtered = useMemo(() => categories.filter(c =>
    `${c.name} ${c.description || ''}`.toLowerCase().includes(query.toLowerCase())
  ), [categories, query]);

  function openEditor(category) {
    setEditing(category || 'new');
    setForm(category ? { name:category.name || '', description:category.description || '', icon_key:category.icon_key || 'tag' } : blank);
    setFile(null); setRemoveImage(false); setNotice(''); setError('');
  }

  function selectPhoto(selected) {
    if (!selected) { setFile(null); return; }
    if (!['image/jpeg','image/png','image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG or WebP image up to 5 MB.');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setError(''); setFile(selected); setRemoveImage(false);
  }

  function onChooseFile(event) { selectPhoto(event.target.files?.[0]); }
  function onDropPhoto(event) {
    event.preventDefault();
    if (brandingReady && !busy) selectPhoto(event.dataTransfer.files?.[0]);
  }
  function discardPhoto() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (editing && editing !== 'new' && editing.image_url) setRemoveImage(true);
  }

  async function save(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (name.length < 2 || name.length > 100) { setError('Category name must contain 2–100 characters.'); return; }
    const iconChanged = editing === 'new' ? form.icon_key !== 'tag' : form.icon_key !== (editing.icon_key || 'tag');
    if (!brandingReady && (iconChanged || file || removeImage)) { setError('Enable the category branding backend and Storage bucket before saving icon or photo changes.'); return; }
    setBusy(true); setNotice(''); setError('');
    try {
      const created = editing === 'new';
      const response = await api(created ? '/api/categories' : `/api/categories/${editing.id}`, {
        method: created ? 'POST' : 'PUT',
        body: { name, description: form.description.trim() || null }
      });
      const categoryId = created ? response.category?.id : editing.id;
      if (!categoryId) throw Error('Category was saved, but the API did not return its ID. Refresh and edit it.');
      // The new category already exists now. If an icon/photo upload fails, a
      // retry edits this record instead of creating a duplicate category.
      if (created) setEditing({ id: categoryId, name, description: form.description.trim() || null, icon_key: 'tag', image_url: null });
      if (brandingReady && iconChanged) await api(`/api/categories/${categoryId}/icon`, { method:'PATCH', body: { icon_key: form.icon_key } });
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

  // Optional one-time import of the five bundled demo photos. The browser uploads
  // them through the ADMIN API; no Supabase secret or service key is exposed.
  const importCandidates = categories.filter(category => !category.image_url && categoryKey(category.name));
  async function importExistingPhotos() {
    if (!brandingReady || busy || !importCandidates.length) return;
    if (!window.confirm(`Upload ${importCandidates.length} existing category photo(s) to Supabase Storage? Categories with cloud images will not be overwritten.`)) return;
    setBusy(true); setError(''); setNotice('');
    let succeeded=0;
    const failed=[];
    try {
      for (const category of importCandidates) {
        try {
          const key=categoryKey(category.name);
          const response=await fetch(`/images/categories/${key}.jpg`, { credentials:'same-origin' });
          if (!response.ok) throw new Error(`Local image not found (${response.status})`);
          const blob=await response.blob();
          if (!['image/jpeg','image/png','image/webp'].includes(blob.type)) throw new Error('The local file is not a supported image');
          await upload(`/api/categories/${category.id}/image`, new File([blob],`${key}.jpg`,{type:blob.type}));
          succeeded++;
        } catch(e) { failed.push(`${category.name}: ${e.message}`); }
      }
      await load();
      setNotice(`${succeeded} existing photo(s) uploaded to Supabase Storage.`);
      if (failed.length) setError(`${failed.length} photo(s) could not be uploaded: ${failed.join(' | ')}`);
    } finally { setBusy(false); }
  }

  const shownImage = preview || (!removeImage && editing && editing !== 'new' ? editing.image_url : null);
  const modalPortal = (content) => createPortal(<div className="bcategories bcategories-modal-portal">{content}</div>, document.body);

  return <section className="bcategories">
    <header className="bcategories-head">
      <div><div className="bcategories-kicker">CONTENT MANAGEMENT</div><h1>Service categories</h1><p>Manage category names, icons and images shown across BOOKIFY.</p></div>
      <div className="bcategories-head-actions">
        {brandingReady && importCandidates.length>0 && <button className="bcategories-secondary" type="button" onClick={importExistingPhotos} disabled={busy} title="Move the existing local example photos to Supabase Storage"><Icon name="upload" size={17}/> Import {importCandidates.length} existing photo{importCandidates.length!==1?'s':''}</button>}
        <button className="bcategories-primary" type="button" onClick={() => openEditor(null)} disabled={busy}><Icon name="plus" size={17}/> Add category</button>
      </div>
    </header>
    {notice && <div role="status" className="bcategories-success">{notice}</div>}
    {!editing && error && <div role="alert" className="bcategories-error">{error}</div>}
    {brandingWarning && <div role="status" className="bcategories-warning">{brandingWarning}</div>}
    <div className="bcategories-search"><Icon name="search" size={17}/><input aria-label="Search categories" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search categories..."/></div>
    {loading ? <p>Loading categories...</p> : <div className="bcategories-grid">
      {filtered.map(category => <article className="bcategories-card" key={category.id}>
        <div className="bcategories-cover">{category.image_url ? <img alt="" src={category.image_url} loading="lazy" onError={e => {e.currentTarget.style.display='none';}}/> : <div className="bcategories-placeholder"><Icon name={category.icon_key || 'tag'} size={44}/></div>}</div>
        <div className="bcategories-card-body"><div className="bcategories-card-title"><Icon name={category.icon_key || 'tag'} size={19}/><strong>{category.name}</strong></div><p>{category.description || 'No description'}</p><div className="bcategories-actions"><button type="button" onClick={() => openEditor(category)}><Icon name="edit" size={16}/> Edit</button><button type="button" onClick={() => setConfirmDelete(category)}><Icon name="trash" size={16}/> Delete</button></div></div>
      </article>)}
      {!filtered.length && <div className="bcategories-empty">No categories found.</div>}
    </div>}

    {editing && modalPortal(<div className="bcategories-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setEditing(null); }}>
      <section className="bcategories-dialog" role="dialog" aria-modal="true" aria-labelledby="bcategories-modal-title" aria-describedby="bcategories-modal-subtitle">
        <header className="bcategories-modal-head">
          <div className="bcategories-modal-title"><span className="bcategories-modal-eyebrow">CATEGORY MANAGEMENT</span><h2 id="bcategories-modal-title">{editing === 'new' ? 'Add a new category' : 'Edit category'}</h2><p id="bcategories-modal-subtitle">Set how this category appears throughout BOOKIFY.</p></div>
          <button className="bcategories-close" type="button" aria-label="Close editor" disabled={busy} onClick={() => setEditing(null)}><Icon name="x" size={19}/></button>
        </header>
        <form id="bcategories-editor-form" onSubmit={save} className="bcategories-form">
          <div className="bcategories-modal-body">
            {error && <div role="alert" className="bcategories-error bcategories-modal-alert">{error}</div>}
            <div className="bcategories-editor-grid">
              <div className="bcategories-editor-column">
                <div className="bcategories-section-heading"><span className="bcategories-section-number">01</span><div><h3>Category details</h3><p>Information visitors will see when browsing services.</p></div></div>
                <label className="bcategories-field">Category name <span className="bcategories-required">*</span><input ref={nameInputRef} required minLength={2} maxLength={100} value={form.name} onChange={e => setForm(s => ({ ...s, name:e.target.value }))} placeholder="e.g. Barbershops"/></label>
                <label className="bcategories-field">Description <span className="bcategories-optional">Optional</span><textarea rows={3} maxLength={500} value={form.description} onChange={e => setForm(s => ({ ...s, description:e.target.value }))} placeholder="Describe the services offered in this category..."/><small>{form.description.length}/500 characters</small></label>
                <fieldset className="bcategories-icon-fieldset" disabled={!brandingReady || busy}>
                  <legend>Category icon</legend>
                  <p className="bcategories-help">Choose a symbol that represents this category.</p>
                  <div className="bcategories-icons">{ICONS.map(([key,label]) => <button key={key} type="button" title={label} aria-label={label} aria-pressed={form.icon_key === key} className={form.icon_key === key ? 'selected' : ''} onClick={() => setForm(s => ({ ...s, icon_key:key }))}><Icon name={key} size={21}/><small>{label}</small>{form.icon_key === key && <span className="bcategories-icon-check"><Icon name="check" size={11}/></span>}</button>)}</div>
                </fieldset>
              </div>
              <div className="bcategories-editor-column bcategories-editor-right">
                <div className="bcategories-section-heading"><span className="bcategories-section-number">02</span><div><h3>Category photograph</h3><p>Use a clear, horizontal image that looks good in the catalog.</p></div></div>
                <div className="bcategories-photo-drop" onDragOver={event => event.preventDefault()} onDrop={onDropPhoto}>
                  <div className="bcategories-photo-canvas">
                    {shownImage ? <img src={shownImage} alt="Category photograph preview"/> : <div className="bcategories-photo-empty"><span className="bcategories-photo-empty-icon"><Icon name="image" size={29}/></span><strong>No image selected</strong><span>Recommended: landscape photograph, 16:9</span></div>}
                  </div>
                  <input ref={fileInputRef} id="bcategories-file" className="bcategories-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={onChooseFile} disabled={!brandingReady || busy}/>
                  <div className="bcategories-photo-controls">
                    <button type="button" className="bcategories-upload-button" disabled={!brandingReady || busy} onClick={() => fileInputRef.current?.click()}><Icon name={shownImage ? 'refresh' : 'upload'} size={16}/>{shownImage ? 'Replace photo' : 'Choose a photo'}</button>
                    {shownImage && <button type="button" className="bcategories-remove-photo" disabled={busy || !brandingReady} onClick={discardPhoto}><Icon name="trash" size={15}/> Remove</button>}
                  </div>
                  <p className="bcategories-photo-hint">JPG, PNG or WebP · Maximum 5 MB · Stored in Supabase</p>
                  {file && <p className="bcategories-photo-filename"><Icon name="check" size={14}/> {file.name} selected</p>}
                  {removeImage && !file && <p className="bcategories-photo-filename">Current photograph will be removed after saving.</p>}
                </div>
                <div className="bcategories-live-preview"><div><span className="bcategories-preview-label">LIVE PREVIEW</span><p>Your category card</p></div><div className="bcategories-preview-card"><div className="bcategories-preview-thumb">{shownImage ? <img src={shownImage} alt=""/> : <Icon name={form.icon_key || 'tag'} size={24}/>}</div><div><strong>{form.name.trim() || 'Category name'}</strong><small>{form.description.trim() || 'Your description will appear here'}</small></div></div></div>
                {!brandingReady && <p className="bcategories-media-unavailable">Category media requires the Supabase Storage backend extension.</p>}
              </div>
            </div>
          </div>
          <footer className="bcategories-modal-footer"><p>Changes will appear in the public catalog.</p><div className="bcategories-modal-footer-buttons"><button className="bcategories-cancel" type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button><button type="submit" className="bcategories-primary" disabled={busy}>{busy ? 'Saving...' : <><Icon name="check" size={17}/>{editing === 'new' ? 'Create category' : 'Save changes'}</>}</button></div></footer>
        </form>
      </section>
    </div>)}

    {confirmDelete && modalPortal(<div className="bcategories-backdrop" onMouseDown={e => { if(e.target===e.currentTarget && !busy)setConfirmDelete(null); }}><div className="bcategories-dialog bcate-small" role="dialog" aria-modal="true" aria-labelledby="bcategories-delete-title"><header className="bcategories-modal-head"><div><h2 id="bcategories-delete-title">Delete category?</h2><p>This action cannot be easily undone.</p></div></header><div className="bcategories-delete-body">Delete <strong>{confirmDelete.name}</strong>? This may be blocked if businesses still use this category.</div><footer className="bcategories-modal-footer"><p></p><div className="bcategories-modal-footer-buttons"><button className="bcategories-cancel" disabled={busy} type="button" onClick={() => setConfirmDelete(null)}>Cancel</button><button disabled={busy} className="bcategories-danger" type="button" onClick={deleteCategory}>{busy ? 'Deleting...' : 'Delete category'}</button></div></footer></div></div>)}
  </section>;
}
