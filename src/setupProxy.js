const { createProxyMiddleware } = require('http-proxy-middleware');

// Production always uses the SWA-linked backend. Development must opt in to a local target.
module.exports = function (app) {
  const target = process.env.REACT_APP_FUNCTION_BASE_URL;
  if (!target) return;

  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: true,
      logLevel: 'warn',
    })
  );
};
