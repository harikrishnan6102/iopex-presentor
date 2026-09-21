import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/extras.css';

// No StrictMode on purpose: the scene, voice agent and gesture layer are
// heavy imperative singletons and double-mounting them in dev only costs time.
createRoot(document.getElementById('root')!).render(<App />);
