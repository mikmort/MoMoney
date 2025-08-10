const { createProxyMiddleware } = require('http-proxy-middleware');

// Dev proxy: forward /api requests to the Azure Function and strip Origin to avoid custom origin blocks
module.exports = function (app) {
  const target = process.env.REACT_APP_FUNCTION_BASE_URL || 'https://mortongroupaicred-hugxh8drhqabbphb.canadacentral-01.azurewebsites.net';

  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: true,
      // Keep the /api path intact so it matches the function route
      // Remove origin/referer to bypass server-side origin allowlist checks
      onProxyReq(proxyReq) {
        try {
          if (typeof proxyReq.removeHeader === 'function') {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          }
        } catch (_) {}
      },
      onProxyRes(proxyRes) {
        // Ensure no conflicting CORS headers are passed back through
        try {
          if (proxyRes.headers) {
            delete proxyRes.headers['access-control-allow-origin'];
            delete proxyRes.headers['access-control-allow-credentials'];
          }
        } catch (_) {}
      },
      logLevel: 'silent',
    })
  );
};
