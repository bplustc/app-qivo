const express = require('express');
const { requireDriver, requireAdmin } = require('../middleware/auth');
const walletService = require('../services/walletService');

const router = express.Router();

router.get('/me', requireDriver, async (req, res, next) => {
  try {
    const wallet = await walletService.getWalletByDriverId(req.user.driverId);
    if (!wallet) {
      return res.status(404).json({
        error: 'wallet_not_found',
        message: 'Wallet not found for driver',
      });
    }

    return res.json({
      walletId: wallet.id,
      driverId: wallet.driver_id,
      balanceUsd: Number(wallet.balance_usd),
      currency: wallet.currency,
      status: wallet.status,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/movements', requireDriver, async (req, res, next) => {
  try {
    const rows = await walletService.getWalletMovements(req.user.driverId, req.query.limit);

    return res.json({
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        amountUsd: Number(row.amount_usd),
        balanceBefore: Number(row.balance_before),
        balanceAfter: Number(row.balance_after),
        serviceId: row.service_id,
        paymentId: row.payment_id,
        createdAt: row.created_at,
      })),
      nextCursor: null,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/topup/create-intent', requireDriver, async (req, res, next) => {
  try {
    const amountUsd = Number(req.body.amountUsd);
    const provider = String(req.body.provider || 'kushki');

    const response = await walletService.createTopupIntent({
      driverId: req.user.driverId,
      amountUsd,
      provider,
    });

    return res.status(201).json(response);
  } catch (error) {
    return next(error);
  }
});

router.post('/adjustment/admin', requireAdmin, async (_req, res) => {
  return res.status(501).json({
    error: 'not_implemented',
    message: 'Admin manual adjustment endpoint is reserved for phase 4',
  });
});

module.exports = router;
