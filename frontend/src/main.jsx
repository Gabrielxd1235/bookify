import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import App from './App.jsx';
import {MotionObserver} from './components/MotionObserver.jsx';
import {initializeRouter} from './lib/router.jsx';
initializeRouter();
import './index.css';
import './styles/Navbar.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><ToastProvider><AuthProvider><App /><MotionObserver/></AuthProvider></ToastProvider></React.StrictMode>
);
import './polish.css';

import './motion.css';
import './styles/Experience.css';
import './styles/Workspace.css';
