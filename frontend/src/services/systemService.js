import api from './api.js';

export const systemService = {
  /**
   * Fetch live system and database operational health
   * Supports both direct /health and /api/v1/health endpoints
   */
  async getHealth() {
    try {
      // First attempt relative /health via Vite proxy / root
      const response = await api.get('/health');
      return response.data?.data || response.data;
    } catch {
      // Fallback to direct /health at root
      const healthUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
        ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/v1\/?$/, '/health')
        : '/health';
      const response = await api.get(healthUrl, { baseURL: '' });
      return response.data?.data || response.data;
    }
  },
};

export default systemService;

