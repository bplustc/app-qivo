const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { getAuthContext } = require('./middleware/auth');
const walletRoutes = require('./routes/wallet');
const serviceRoutes = require('./routes/services');
const webhookRoutes = require('./routes/webhooks');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(getAuthContext);

app.get('/api/v1/health', (_req, res) => {
  res.json({ ok: true, service: 'qivo-wallet-backend' });
});

app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/payments/webhook', webhookRoutes);

app.use((err, _req, res, _next) => {
  const statusCode = Number(err.statusCode || 500);
  const code = err.code || 'internal_error';

  res.status(statusCode).json({
    error: code,
    message: err.message || 'Unexpected error',
  });
});

module.exports = app;
