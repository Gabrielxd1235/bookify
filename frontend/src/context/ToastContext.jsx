import { createContext,useContext,useState,useCallback } from 'react';
import { Icon } from '../components/Icon.jsx';
const Context = createContext(null);
export function ToastProvider({children}) {
  const [items,setItems] = useState([]);
  const toast = useCallback((message,type='success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems(current => [...current.slice(-3),{id,message,type}]);
    setTimeout(() => setItems(current => current.filter(item => item.id!==id)),5500);
  },[]);
  return <Context.Provider value={toast}>{children}<div className="toast-stack" aria-live="polite">{items.map(item=><div key={item.id} className={`toast toast-${item.type}`}><Icon name={item.type==='error'?'alert':'check'} size={19}/><span>{item.message}</span><button aria-label="Dismiss" onClick={()=>setItems(a=>a.filter(x=>x.id!==item.id))}><Icon name="x" size={16}/></button><span className="toast-progress" aria-hidden="true"/></div>)}</div></Context.Provider>;
}
export function useToast(){return useContext(Context);}
