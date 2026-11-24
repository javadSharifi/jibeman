import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { pwaManager } from './core/pwa';
import './index.css';

// Initialize PWA Service Worker lifecycle & update listeners
pwaManager.init();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
