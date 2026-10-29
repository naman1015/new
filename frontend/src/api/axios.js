import axios from 'axios';

const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // When served directly from Render backend, use same-origin /api
    if (host.endsWith('.onrender.com')) {
      return `${window.location.origin}/api`;
    }
    // Never use a local HTTP IP when loaded over HTTPS
    if (window.location.protocol === 'https:') {
      const envUrl = import.meta.env.VITE_API_URL?.trim();
      if (envUrl && envUrl.startsWith('https://')) {
        const clean = envUrl.replace(/\/+$/, '');
        return clean.endsWith('/api') ? clean : `${clean}/api`;
      }
      return 'https://new-d966.onrender.com/api';
    }
  }
  const envUrl = import.meta.env.VITE_API_URL?.trim();
  if (envUrl) {
    const clean = envUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
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

// Auto refresh default session on 401 instead of redirecting to /login (unless user explicitly logged out)
api.interceptors.request.use(async (config) => {
  if (
    !localStorage.getItem('token') &&
    localStorage.getItem('loggedOut') !== 'true' &&
    !config.url?.includes('/auth/')
  ) {
    try {
      const { data } = await axios.get(`${getBaseUrl()}/auth/default-session`);
      if (data?.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        config.headers.Authorization = `Bearer ${data.token}`;
      }
    } catch {
      // ignore
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const orig = err.config;
    if (
      err.response?.status === 401 &&
      localStorage.getItem('loggedOut') !== 'true' &&
      orig &&
      !orig._retry &&
      !orig.url?.includes('/auth/')
    ) {
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
