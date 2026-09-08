import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import Appeals from './pages/moderation/Appeals';

const root = ReactDOM.createRoot(document.getElementById('root'));
let pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const isAppealsRoute = pathname === '/appeals' || pathname.endsWith('/appeals');

if (isAppealsRoute && pathname !== '/appeals') {
  const canonical = `/appeals${window.location.search || ''}${window.location.hash || ''}`;
  window.history.replaceState({}, '', canonical);
  pathname = '/appeals';
}

const RootComponent = pathname === '/appeals' ? Appeals : App;

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <RootComponent />
    </BrowserRouter>
  </React.StrictMode>
);
