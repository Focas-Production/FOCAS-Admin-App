// Lightweight fetch helper used by the Manual Pro dashboard.
// Mirrors the rest of the admin app: same backend origin (VITE_API_BASE_URL)
// and bearer token from localStorage, but exposes fetch/PDF helpers the
// axios-based services/api.js doesn't provide.
const BACKEND = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7000';

const baseHeaders = () => {
  const h = {
    'Content-Type':                'application/json',
    'ngrok-skip-browser-warning': 'true',
  };
  const token = localStorage.getItem('admin_token');
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

export const api = {
  get: (path) =>
    fetch(`${BACKEND}${path}`, { headers: baseHeaders() }),

  post: (path, body) =>
    fetch(`${BACKEND}${path}`, {
      method:  'POST',
      headers: baseHeaders(),
      body:    JSON.stringify(body),
    }),

  // Fetches a PDF (with auth/ngrok headers) and returns its raw bytes.
  getPdfBytes: async (path) => {
    const res = await fetch(`${BACKEND}${path}`, { headers: baseHeaders() });
    if (!res.ok) {
      let msg = `Fetch failed (${res.status})`;
      try { const j = await res.json(); if (j.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    return res.arrayBuffer();
  },

  // Triggers a browser download for an in-memory blob/bytes.
  saveBlob: (data, filename, type = 'application/pdf') => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // Fetches a PDF (with auth/ngrok headers) and triggers a browser download.
  downloadPdf: async (path, filename) => {
    const res = await fetch(`${BACKEND}${path}`, { headers: baseHeaders() });
    if (!res.ok) {
      let msg = `Download failed (${res.status})`;
      try { const j = await res.json(); if (j.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export { BACKEND };
