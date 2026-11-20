// Entry point: starts React and draws the app inside <div id="root"> in index.html.
// The providers below share things with every page:
//   BrowserRouter  -> moving between pages without reloading
//   ToastProvider  -> pop-up success/error messages
//   AuthProvider   -> the logged-in user
//   SocketProvider -> the real-time connection (chat, notifications)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// The shared styles are loaded FIRST, so each page's own stylesheet (styles/<page>.css)
// comes later and wins when both set the same thing.
// Fonts are bundled with the app (no request to Google), so they also work offline
// and on campus networks that block external font servers
import '@fontsource-variable/dm-sans/opsz.css';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-700.css';
import './styles/global.css';
import App from './App.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { IS_DEMO, BASE_URL } from './config/demo.js';
import DemoBadge from './demo/DemoBadge.jsx';

// "/GPMP/" -> "/GPMP" (the router wants the folder without the last slash; "/" stays undefined)
const basename = BASE_URL.replace(/\/$/, '') || undefined;

function start() {
  createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <App />
            {IS_DEMO && <DemoBadge />}
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
  );
}

// Demo mode answers /api requests in the browser (no server needed); see demo/mockApi.js
if (IS_DEMO) {
  import('./demo/mockApi.js').then(({ installMockApi }) => {
    installMockApi();
    start();
  });
} else {
  start();
}
