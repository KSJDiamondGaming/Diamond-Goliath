import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import Appeals from './pages/moderation/Appeals';

window.__GOLIATH_APPEALS_ENTRY_V2__ = 'GOLIATH_APPEALS_ENTRY_V2';
window.__GOLIATH_DEV_ROOT_VERIFIED__ = true;

const root = ReactDOM.createRoot(document.getElementById('root'));

function getAppealReference() {
  const candidates = [window.location.search, window.location.hash];
  for (const candidate of candidates) {
    const raw = String(candidate || '').replace(/^[#?]/, '');
    if (!raw) continue;
    const params = new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw);
    const guild = String(params.get('guild') || '').trim();
    const caseId = String(params.get('case') || '').trim();
    if (/^\d{16,20}$/.test(guild) && /^\d{1,12}$/.test(caseId) && Number(caseId) > 0) {
      return { guild, caseId: String(Number(caseId)) };
    }
  }
  return null;
}

let pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const appealReference = getAppealReference();
const isAppealsPath = pathname === '/appeals' || pathname.endsWith('/appeals');
const isRecoveredAppealPath = Boolean(appealReference) && (pathname === '/overview' || pathname === '/');

if ((isAppealsPath || isRecoveredAppealPath) && pathname !== '/appeals') {
  const params = new URLSearchParams();
  if (appealReference) {
    params.set('guild', appealReference.guild);
    params.set('case', appealReference.caseId);
  }
  const query = params.toString();
  window.history.replaceState({}, '', query ? `/appeals?${query}` : '/appeals');
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
