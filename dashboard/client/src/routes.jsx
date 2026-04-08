import { Navigate, Routes, Route } from 'react-router-dom';
import Overview from './pages/Overview';
import Cases from './pages/Cases';
import Warnings from './pages/Warnings';
import AutoMod from './pages/AutoMod';
import Config from './pages/Config';
import Messages from './pages/Messages';

export default function AppRoutes({ pageProps }) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="/overview" element={<Overview {...pageProps} />} />
      <Route path="/cases" element={<Cases {...pageProps} />} />
      <Route path="/warnings" element={<Warnings {...pageProps} />} />
      <Route path="/automod" element={<AutoMod {...pageProps} />} />
      <Route path="/config" element={<Config {...pageProps} />} />
      <Route path="/messages" element={<Messages {...pageProps} />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}