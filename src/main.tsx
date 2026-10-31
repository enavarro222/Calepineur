import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyHash, installPersistence } from './store/bootstrap';
import './styles.css';

applyHash(location.hash);
installPersistence();
window.addEventListener('hashchange', () => applyHash(location.hash));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
