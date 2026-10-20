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

// Auto refresh default session on 401 instead of redirecting to /login
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const orig = err.config;
    if (err.response?.status === 401 && orig && !orig._retry && !orig.url?.includes('/auth/')) {
      orig._retry = true;
      try {
        const { data } = await api.get('/auth/default-session');
        if (data?.token) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          orig.headers.Authorization = `Bearer ${data.token}`;
          return api(orig);
        }
      } catch {
        // ignore
      }
    }
    return Promise.reject(err);
  }
);

export default api;
