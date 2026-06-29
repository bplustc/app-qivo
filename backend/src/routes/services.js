const express = require('express');
const { requireDriver } = require('../middleware/auth');
const walletService = require('../services/walletService');

const router = express.Router();

router.post('/:serviceId/complete-and-charge', requireDriver, async (req, res, next) => {
  try {
    const result = await walletService.completeServiceAndCharge({
      driverId: req.user.driverId,
      serviceId: req.params.serviceId,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
