import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, onSessionLost, refreshSession, setAccessToken } from '../lib/api.js';

const AuthContext = createContext(null);
const selectUser = (data) => data?.user || data?.data?.user || data?.data || null;
export function AuthProvider({children}) {
  const [user,setUser] = useState(null);
  const [loading,setLoading] = useState(true);
  const refreshProfile = useCallback(async () => {
    try {
      const data = await api('/api/profile/me');
      const profile = selectUser(data);
      if (profile) { setUser(profile); return profile; }
    } catch (e) {
      if (![404,403].includes(e.status)) throw e;
    }
    const data = await api('/api/auth/me');
    const profile = selectUser(data);
    if (profile) setUser(profile);
    return profile;
  }, []);
  useEffect(() => {
    let active = true;
    onSessionLost(() => { if (active) setUser(null); });
    (async () => {
      try {
        await refreshSession();
        if (active) await refreshProfile();
      } catch { /* No refresh cookie: anonymous visitor. */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; onSessionLost(null); };
  }, [refreshProfile]);
  const login = useCallback(async (credentials) => {
    const data = await api('/api/auth/login',{method:'POST',body:credentials,skipRefresh:true});
    const token = data.accessToken || data.access_token || data.token;
    if (!token) throw Error('The backend did not return an access token.');
    setAccessToken(token); setUser(selectUser(data));
    await refreshProfile().catch(() => {});
    return data;
  }, [refreshProfile]);
  const register = useCallback(async ({full_name,email,password}) => {
    return await api('/api/auth/register',{method:'POST',body:{full_name,email,password},skipRefresh:true});
  },[]);
  const logout = useCallback(async () => {
    try { await api('/api/auth/logout',{method:'POST',skipRefresh:true}); }
    catch { /* Clear browser state regardless of network. */ }
    setAccessToken(null); setUser(null);
  },[]);
  const value = {user,loading,login,register,logout,refreshProfile,authenticated: Boolean(user),isAdmin:user?.role==='ADMIN',isOwner:user?.role==='BUSINESS_OWNER'};
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx=useContext(AuthContext); if (!ctx) throw Error('Missing AuthProvider'); return ctx; }
