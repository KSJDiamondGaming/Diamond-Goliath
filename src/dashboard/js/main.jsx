import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import Appeals from './pages/moderation/Appeals';

const root = ReactDOM.createRoot(document.getElementById('root'));
const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const RootComponent = pathname === '/appeals' ? Appeals : App;

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <RootComponent />
    </BrowserRouter>
  </React.StrictMode>
);
