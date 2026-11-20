import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Link } from '../lib/router.jsx';
import { Icon } from './Icon.jsx';
import { Alert, Button } from './UI.jsx';

const shortDate = value => {
  try { return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'America/Lima' }).format(new Date(value)); }
  catch { return ''; }
};

const AVATAR_COLORS = [['#e4f0eb', '#245e54'], ['#fdeee3', '#b4541b'], ['#eae8fd', '#5b47c5'], ['#fde8ef', '#b03a63'], ['#e3f1fb', '#1f6a96'], ['#fff3d6', '#8a6100']];
function avatarStyle(name = '') {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const [background, color] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return { background, color };
}
const initialsOf = name => name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'B';
function timeAgo(value) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (!Number.isFinite(days)) return '';
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) { const w = Math.floor(days / 7); return `${w} week${w > 1 ? 's' : ''} ago`; }
  if (days < 365) { const m = Math.floor(days / 30); return `${m} month${m > 1 ? 's' : ''} ago`; }
  return shortDate(value);
}
export function Avatar({ name, size = 40 }) {
  return <span className="review-avatar" style={{ ...avatarStyle(name), width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">{initialsOf(name || 'B')}</span>;
}

/** Long text with a "Read more" toggle. */
function Clamp({ text, lines = 4 }) {
  const [open, setOpen] = useState(false);
  const long = (text || '').length > lines * 70;
  return <div className="review-text">
    <p className={!open && long ? 'clamped' : ''} style={{ WebkitLineClamp: lines }}>{text}</p>
    {long && <button type="button" className="review-more" onClick={() => setOpen(o => !o)}>{open ? 'Show less' : 'Read more'}</button>}
  </div>;
}

/** Read-only stars, supports halves (4.5 -> 4 full + 1 half). */
export function Stars({ value = 0, size = 16, label }) {
  const rounded = Math.round(Number(value) * 2) / 2;
  return <span className="stars" role="img" aria-label={label || `${rounded} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map(n => <span key={n} className={`star ${rounded >= n ? 'full' : rounded >= n - 0.5 ? 'half' : ''}`} style={{ width: size, height: size }}>
      <Icon name="star" size={size}/>
    </span>)}
  </span>;
}

/** Clickable 1-5 star picker. */
export function StarInput({ value, onChange, disabled }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const words = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  return <div className="star-input" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
    {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} disabled={disabled}
      className={`star-pick ${shown >= n ? 'on' : ''}`} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => onChange(n)}>
      <Icon name="star" size={26}/>
    </button>)}
    <span className="star-input-word">{words[shown] || 'Choose a rating'}</span>
  </div>;
}

// One request per page load for every business card
let ratingsPromise = null;
let ratingsAt = 0;
export function useBusinessRatings() {
  const [ratings, setRatings] = useState({});
  useEffect(() => {
    let live = true;
    if (!ratingsPromise || Date.now() - ratingsAt > 60000) {
      ratingsAt = Date.now();
      ratingsPromise = api('/api/reviews/business-ratings').then(d => Object.fromEntries((d.ratings || []).map(r => [String(r.business_id), r]))).catch(() => ({}));
    }
    ratingsPromise.then(map => { if (live) setRatings(map); });
    return () => { live = false; };
  }, []);
  return ratings;
}
export function invalidateBusinessRatings() { ratingsPromise = null; }

/** Small "★ 4.7 (23)" badge for cards. */
export function RatingBadge({ rating, compact = false }) {
  if (!rating || !rating.count) return compact ? null : <span className="rating-badge rating-new"><Icon name="sparkles" size={13}/>New on BOOKIFY</span>;
  return <span className="rating-badge" title={`${rating.average} out of 5 from ${rating.count} review${rating.count === 1 ? '' : 's'}`}>
    <Icon name="star" size={13}/><strong>{Number(rating.average).toFixed(1)}</strong><small>({rating.count})</small>
  </span>;
}

function Distribution({ summary, active, onPick }) {
  return <div className="rating-bars">
    {[5, 4, 3, 2, 1].map(n => {
      const count = summary.distribution?.[n] || 0;
      const pct = summary.count ? Math.round(count / summary.count * 100) : 0;
      return <button type="button" key={n} className={`rating-bar ${active === n ? 'active' : ''}`} disabled={!count} onClick={() => onPick?.(n)} aria-pressed={active === n} title={count ? `Show ${n}-star reviews` : undefined}>
        <span>{n}<Icon name="star" size={11}/></span><div><i style={{ width: `${pct}%` }}/></div><small>{pct}%</small>
      </button>;
    })}
  </div>;
}

function ReviewCard({ review }) {
  return <article className="review-card">
    <header>
      <Avatar name={review.author}/>
      <div className="review-who"><strong>{review.author}</strong><small title={shortDate(review.created_at)}>{timeAgo(review.created_at)}{review.edited ? ' · edited' : ''}</small></div>
      <span className={`review-score score-${review.rating}`}><Icon name="star" size={12}/>{review.rating}.0</span>
    </header>
    <Stars value={review.rating} size={15}/>
    {review.comment ? <Clamp text={review.comment}/> : <p className="muted review-empty">Rated without a written comment.</p>}
    {review.is_verified && <footer><span className="review-verified" title="Booked and paid on BOOKIFY"><Icon name="shield" size={12}/>Verified booking</span></footer>}
  </article>;
}

/** Ratings summary, review list and "write a review" form for one business. */
export function BusinessReviews({ businessId }) {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [stars, setStars] = useState(0);
  const [sort, setSort] = useState('newest');
  const [mine, setMine] = useState(null);
  const [form, setForm] = useState({ rating: 0, comment: '' });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canWrite = user && (user.role === 'CLIENT' || user.role === 'BUSINESS_OWNER');

  const load = (nextPage = page, nextStars = stars, nextSort = sort) => api(`/api/businesses/${businessId}/reviews?page=${nextPage}&limit=4&sort=${nextSort}${nextStars ? `&rating=${nextStars}` : ''}`).then(setData).catch(e => setError(e.message));
  useEffect(() => { setPage(1); setStars(0); setSort('newest'); load(1, 0, 'newest'); }, [businessId]);
  const filterBy = value => { const next = stars === value ? 0 : value; setStars(next); setPage(1); load(1, next, sort); };
  const sortBy = value => { setSort(value); setPage(1); load(1, stars, value); };
  useEffect(() => {
    if (!canWrite) { setMine(null); return; }
    api(`/api/businesses/${businessId}/reviews/mine`).then(d => {
      setMine(d);
      if (d.review) setForm({ rating: d.review.rating, comment: d.review.comment || '' });
    }).catch(() => setMine(null));
  }, [businessId, user?.id]);

  async function save(event) {
    event.preventDefault();
    if (!form.rating) { toast('Choose between 1 and 5 stars.', 'error'); return; }
    setBusy(true); setError('');
    try {
      const result = await api(`/api/businesses/${businessId}/reviews`, { method: 'PUT', body: { rating: form.rating, comment: form.comment.trim() || null } });
      setMine(m => ({ ...(m || {}), review: result.review, canReview: true }));
      setEditing(false);
      invalidateBusinessRatings();
      toast(result.message || 'Thank you for your review!');
      setPage(1); load(1);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/businesses/${businessId}/reviews/mine`, { method: 'DELETE' });
      setMine(m => ({ ...(m || {}), review: null }));
      setForm({ rating: 0, comment: '' });
      invalidateBusinessRatings();
      toast('Your review was removed.');
      setPage(1); load(1);
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  const summary = data?.summary || { average: 0, count: 0, distribution: {} };
  const totalPages = data?.pagination?.totalPages || 1;
  const showForm = canWrite && mine?.canReview && (!mine.review || editing);

  return <section className="detail-section reviews-section" id="reviews">
    <div className="detail-section-head"><h2>Ratings & reviews</h2><span>{summary.count} review{summary.count === 1 ? '' : 's'}</span></div>
    <div className="reviews-overview">
      <div className="reviews-score"><strong>{summary.count ? summary.average.toFixed(1) : '–'}</strong><Stars value={summary.average} size={18}/><small>{summary.count ? `Based on ${summary.count} review${summary.count === 1 ? '' : 's'}` : 'No reviews yet'}</small></div>
      <Distribution summary={summary} active={stars} onPick={filterBy}/>
    </div>
    {summary.count > 0 && <div className="review-toolbar">
      <div className="review-chips" role="group" aria-label="Filter by rating">
        <button type="button" className={!stars ? 'active' : ''} onClick={() => filterBy(0)}>All</button>
        {[5, 4, 3, 2, 1].filter(n => summary.distribution?.[n]).map(n => <button type="button" key={n} className={stars === n ? 'active' : ''} onClick={() => filterBy(n)}>{n}<Icon name="star" size={12}/></button>)}
      </div>
      <label className="review-sort"><span>Sort by</span><select value={sort} onChange={e => sortBy(e.target.value)}><option value="newest">Newest</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option></select></label>
    </div>}

    {mine?.review && !editing && <div className="my-review">
      <div><strong>Your review</strong><Stars value={mine.review.rating} size={14}/>{mine.review.comment && <p>{mine.review.comment}</p>}</div>
      <div className="my-review-actions"><Button variant="outline" icon="edit" onClick={() => setEditing(true)}>Edit</Button><Button variant="danger-outline" busy={busy} onClick={remove}>Delete</Button></div>
    </div>}

    {showForm && <form className="review-form" onSubmit={save}>
      <strong>{mine?.review ? 'Edit your review' : 'How was your experience?'}</strong>
      <StarInput value={form.rating} onChange={rating => setForm(f => ({ ...f, rating }))} disabled={busy}/>
      <textarea rows={3} maxLength={800} value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder="Tell other clients about the service, the place and the attention (optional)"/>
      <Alert message={error}/>
      <div className="review-form-actions">{editing && <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>}<Button type="submit" icon="star" busy={busy}>{mine?.review ? 'Save changes' : 'Publish review'}</Button></div>
    </form>}

    {!user && <p className="review-hint"><Icon name="info" size={15}/><Link to={`/auth?next=${encodeURIComponent(`/business/${businessId}#reviews`)}`}>Sign in</Link>&nbsp;to rate this business after your visit.</p>}
    {canWrite && mine && !mine.canReview && !mine.review && <p className="review-hint"><Icon name="info" size={15}/>{mine.reason}</p>}

    {data?.reviews?.length ? <div className="review-list">{data.reviews.map(r => <ReviewCard key={r.id} review={r}/>)}</div>
      : data && <p className="muted">{stars ? `No ${stars}-star reviews yet.` : 'Be the first to share your experience with this business.'}</p>}
    {totalPages > 1 && <div className="review-pager">
      <Button variant="outline" icon="arrow-left" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }}>Previous</Button>
      <span>Page {page} of {totalPages}</span>
      <Button variant="outline" disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); load(p); }}>Next</Button>
    </div>}
  </section>;
}

/** "What people say about BOOKIFY" on the landing page, with a form for signed-in users. */
export function PlatformTestimonials() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [mine, setMine] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ rating: 0, comment: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canWrite = user && (user.role === 'CLIENT' || user.role === 'BUSINESS_OWNER');

  const load = () => api('/api/platform-reviews?limit=6').then(setData).catch(() => setData({ summary: { count: 0, average: 0 }, reviews: [] }));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!canWrite) return;
    api('/api/platform-reviews/mine').then(d => { setMine(d.review); if (d.review) setForm({ rating: d.review.rating, comment: d.review.comment }); }).catch(() => {});
  }, [user?.id]);

  async function save(event) {
    event.preventDefault();
    if (!form.rating) { setError('Choose between 1 and 5 stars.'); return; }
    if (form.comment.trim().length < 10) { setError('Write at least 10 characters.'); return; }
    setBusy(true); setError('');
    try {
      const result = await api('/api/platform-reviews/mine', { method: 'PUT', body: { rating: form.rating, comment: form.comment.trim() } });
      setMine(result.review); setOpen(false); toast(result.message || 'Thanks for your opinion!'); load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const summary = data?.summary || { count: 0, average: 0 };
  return <section className="section testimonials-section" id="opinions">
    <div className="container">
      <div className="section-top">
        <div><span className="eyebrow">WHAT OUR USERS SAY</span><h2>Loved by people who <em>make time.</em></h2>
          <p>{summary.count ? <><Stars value={summary.average} size={16}/> <strong>{summary.average.toFixed(1)}</strong> out of 5 from {summary.count} opinion{summary.count === 1 ? '' : 's'}</> : 'Opinions from clients and business owners using BOOKIFY.'}</p></div>
        {canWrite ? <Button variant="outline" icon={mine ? 'edit' : 'star'} onClick={() => setOpen(o => !o)}>{mine ? 'Edit my opinion' : 'Share your opinion'}</Button>
          : !user && <Link to="/auth?next=%2F%23opinions" className="text-arrow">Sign in to give your opinion <Icon name="arrow" size={18}/></Link>}
      </div>
      {open && <form className="review-form testimonial-form" onSubmit={save}>
        <strong>How has BOOKIFY worked for you?</strong>
        <StarInput value={form.rating} onChange={rating => setForm(f => ({ ...f, rating }))} disabled={busy}/>
        <textarea rows={3} maxLength={600} value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder="Booking, payments, finding new places..." required/>
        <Alert message={error}/>
        <div className="review-form-actions"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" icon="check" busy={busy}>Publish opinion</Button></div>
      </form>}
      {data?.reviews?.length ? <div className="testimonial-grid">{data.reviews.map(r => <figure key={r.id} className="testimonial-card">
        <span className="testimonial-quote" aria-hidden="true">“</span>
        <Stars value={r.rating} size={15}/>
        <blockquote><Clamp text={r.comment} lines={5}/></blockquote>
        <figcaption><Avatar name={r.author} size={42}/><div><strong>{r.author}</strong><small>{r.role || 'Client'} · {timeAgo(r.created_at)}</small></div></figcaption>
      </figure>)}</div> : data && <p className="muted">No opinions yet. Be the first to tell us how BOOKIFY works for you.</p>}
    </div>
  </section>;
}
