// Bookify API client: access token in memory, refresh token in HttpOnly cookie.
// Never persist credentials to localStorage or embed private Supabase keys in Vite.
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
let accessToken = null;
let refreshPromise = null;
let sessionLostHandler = null;

export function setAccessToken(token) { accessToken = token || null; }
export function onSessionLost(handler) { sessionLostHandler = handler; }
export function getAccessToken() { return accessToken; }
export class ApiError extends Error {
  constructor(message, status, payload) { super(message); this.name = 'ApiError'; this.status = status; this.payload = payload; }
}
const fallback = {
  400: 'Please check the information you entered.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested information could not be found.',
  409: 'This action conflicts with the current state. Refresh and try again.',
  413: 'The uploaded file is too large.',
  429: 'Too many requests. Please try again later.',
  500: 'The server encountered an error. Please try again.',
};
async function fetchJson(path, { method = 'GET', body, headers = {}, token = accessToken, signal, timeout = 25000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const abort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  try {
    const isForm = body instanceof FormData;
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: { ...(!isForm && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload = {};
    if (raw) { try { payload = JSON.parse(raw); } catch { payload = { message: raw.slice(0, 220) }; } }
    if (!response.ok) throw new ApiError(payload.message || fallback[response.status] || `Request failed (${response.status})`, response.status, payload);
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('The request timed out. Check your connection.', 0, {});
    if (error instanceof TypeError) throw new ApiError('Could not reach BOOKIFY API. Ensure the backend is running.', 0, {});
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', abort);
  }
}
export async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetchJson('/api/auth/refresh', { method: 'POST', token: null }).then(data => {
      const token = data.accessToken || data.access_token || data.token;
      if (!token) throw new ApiError('Session renewal did not return an access token.', 401, data);
      setAccessToken(token);
      return data;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}
export async function api(path, options = {}) {
  try { return await fetchJson(path, options); }
  catch (error) {
    const authEndpoint = path.startsWith('/api/auth/');
    if (error.status !== 401 || options.skipRefresh || authEndpoint || !accessToken) throw error;
    try { await refreshSession(); return await fetchJson(path, options); }
    catch (refreshError) {
      if (refreshError.status === 401 || refreshError.status === 403) {
        setAccessToken(null); sessionLostHandler?.();
      }
      throw refreshError;
    }
  }
}
export function qs(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key,value]) => { if (value !== undefined && value !== null && value !== '') query.set(key, String(value)); });
  const str = query.toString(); return str ? `?${str}` : '';
}
export function upload(path, file, extras = {}) {
  if (!file) throw new ApiError('Select an image before uploading.', 400, {});
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new ApiError('Choose a JPG, PNG, or WebP image.',400,{});
  if (file.size > 5 * 1024 * 1024) throw new ApiError('Images must not exceed 5 MB.',400,{});
  const data = new FormData(); data.append('image',file);
  Object.entries(extras).forEach(([key,value]) => { if (value != null) data.append(key,String(value)); });
  return api(path,{method:'POST',body:data});
}
export const endpoint = {
  categories: (args={}) => `/api/categories${qs(args)}`,
  businesses: (args={}) => `/api/businesses${qs(args)}`,
  services: (args={}) => `/api/services${qs(args)}`,
  available: (serviceId,date) => `/api/reservations/availability${qs({service_id:serviceId,date})}`,
};
