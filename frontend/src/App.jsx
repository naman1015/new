import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SeniorModeProvider } from './context/SeniorModeContext';
import BottomNav from './components/BottomNav';
import TopBar from './components/TopBar';
import Login       from './pages/Login';
import Register    from './pages/Register';
import Home        from './pages/Home';
import Doses       from './pages/Doses';
import History     from './pages/History';
import Profile     from './pages/Profile';
import Medications from './pages/Medications';

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user } = useAuth();
  return !user ? children : <Navigate to="/" replace />;
};

function AppRoutes() {
  const { user } = useAuth();
  return (
    <BrowserRouter>
      <div className="app-container">
        {user && <TopBar />}
        <Routes>
          <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/"         element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/medications" element={<ProtectedRoute><Medications /></ProtectedRoute>} />
          <Route path="/doses"       element={<ProtectedRoute><Doses /></ProtectedRoute>} />
          <Route path="/history"  element={<ProtectedRoute><History /></ProtectedRoute>} />
          <Route path="/profile"  element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
        {user && <BottomNav />}
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SeniorModeProvider>
        <AppRoutes />
      </SeniorModeProvider>
    </AuthProvider>
  );
}
