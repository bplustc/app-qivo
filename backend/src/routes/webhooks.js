const express = require('express');
const walletService = require('../services/walletService');

const router = express.Router();

router.post('/:provider', async (req, res, next) => {
  try {
    const provider = req.params.provider;
    const signature = req.header('x-signature') || '';
    const eventId = String(req.body.eventId || '');
    const eventType = String(req.body.eventType || 'unknown');

    if (!eventId) {
      return res.status(400).json({
        error: 'invalid_event',
        message: 'eventId is required',
      });
    }

    const response = await walletService.handleWebhook({
      provider,
      eventId,
      eventType,
      payload: req.body,
      signature,
    });

    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
