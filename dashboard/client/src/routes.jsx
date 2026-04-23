import { Routes, Route, Navigate } from 'react-router-dom';
import Overview from './pages/Overview';
import Cases from './pages/Cases';
import Warnings from './pages/Warnings';
import AutoMod from './pages/AutoMod';
import Config from './pages/Config';
import Messages from './pages/Messages';
import Login from './pages/Login';
import { ROUTES } from './ui';

const MAP = {
  overview: Overview,
  cases: Cases,
  warnings: Warnings,
  automod: AutoMod,
  config: Config,
  messages: Messages,
};

function ProtectedRoute({ isAuthenticated, authLoading, children }) {
  if (authLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function AppRoutes(props) {
  const { isAuthenticated, authLoading } = props;

  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? '/overview' : '/login'} replace />}
      />

      <Route path="/login" element={<Login {...props} />} />

      {ROUTES.map((routeItem) => {
        const Page = MAP[routeItem.key];

        return (
          <Route
            key={routeItem.key}
            path={routeItem.path}
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} authLoading={authLoading}>
                <Page {...props} />
              </ProtectedRoute>
            }
          />
        );
      })}

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? '/overview' : '/login'} replace />}
      />
    </Routes>
  );
}
