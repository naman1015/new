import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    if (localStorage.getItem('loggedOut') === 'true') return null;
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : { name: 'Patient', role: 'patient', device: { deviceId: 'DISPENSER_01' } };
  });

  useEffect(() => {
    const ensureSession = async () => {
      if (!localStorage.getItem('token') && localStorage.getItem('loggedOut') !== 'true') {
        try {
          const { data } = await api.get('/auth/default-session');
          if (data?.token && data?.user) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            setUser(data.user);
          }
        } catch (e) {
          console.error('Auto-session init warning:', e);
        }
      }
    };
    ensureSession();
  }, []);

  const login = (userData, token) => {
    localStorage.removeItem('loggedOut');
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.setItem('loggedOut', 'true');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
