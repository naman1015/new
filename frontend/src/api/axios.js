import axios from 'axios';

const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL?.trim();
  if (envUrl) {
    const clean = envUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return 'https://new-d966.onrender.com/api';
  }
  return 'https://new-d966.onrender.com/api';
};

const api = axios.create({
  baseURL: getBaseUrl(),
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
