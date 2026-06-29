const db = require('../db');

const SERVICE_FEE_USD = 1.0;

async function getWalletByDriverId(driverId) {
  const result = await db.query(
    `select id, driver_id, balance_usd, currency, status
     from wallets
     where driver_id = $1`,
    [driverId]
  );

  return result.rows[0] || null;
}

async function getWalletMovements(driverId, limit) {
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);

  const result = await db.query(
    `select id, type, amount_usd, balance_before, balance_after, service_id, payment_id, created_at
     from wallet_movements
     where driver_id = $1
     order by created_at desc
     limit $2`,
    [driverId, safeLimit]
  );

  return result.rows;
}

async function createTopupIntent({ driverId, amountUsd, provider }) {
  if (!Number.isFinite(amountUsd) || amountUsd < 1 || amountUsd > 200) {
    const error = new Error('Invalid amountUsd. Must be between 1 and 200');
    error.statusCode = 400;
    throw error;
  }

  const wallet = await getWalletByDriverId(driverId);
  if (!wallet) {
    const error = new Error('Wallet not found for driver');
    error.statusCode = 404;
    throw error;
  }

  const idempotencyKey = `topup:${driverId}:${Date.now()}`;

  const insert = await db.query(
    `insert into payments (driver_id, wallet_id, provider, idempotency_key, amount_usd, status)
     values ($1, $2, $3, $4, $5, 'pending')
     returning id, status, provider`,
    [driverId, wallet.id, provider, idempotencyKey, amountUsd]
  );

  const payment = insert.rows[0];

  return {
    paymentId: payment.id,
    status: payment.status,
    provider: payment.provider,
    checkout: {
      publicKey: 'replace_with_provider_public_key',
      clientToken: `demo_token_${payment.id}`,
      sessionId: `demo_session_${Date.now()}`,
    },
  };
}

async function completeServiceAndCharge({ driverId, serviceId }) {
  const client = await db.pool.connect();

  try {
    await client.query('begin');

    const walletResult = await client.query(
      `select id, balance_usd
       from wallets
       where driver_id = $1
       for update`,
      [driverId]
    );

    if (!walletResult.rows[0]) {
      const error = new Error('Wallet not found for driver');
      error.statusCode = 404;
      throw error;
    }

    const wallet = walletResult.rows[0];
    const currentBalance = Number(wallet.balance_usd);

    if (currentBalance < SERVICE_FEE_USD) {
      const error = new Error('Driver balance is below 1.00 USD');
      error.statusCode = 402;
      error.code = 'insufficient_balance';
      throw error;
    }

    const existingCharge = await client.query(
      `select id
       from wallet_movements
       where driver_id = $1 and service_id = $2 and type = 'service_fee'
       limit 1`,
      [driverId, serviceId]
    );

    if (existingCharge.rows[0]) {
      await client.query('rollback');
      return {
        serviceId,
        charged: false,
        feeUsd: SERVICE_FEE_USD,
        walletBalanceUsd: currentBalance,
        message: 'Service fee already charged for this service',
      };
    }

    const newBalance = Number((currentBalance - SERVICE_FEE_USD).toFixed(2));

    await client.query(
      `update wallets
       set balance_usd = $1
       where id = $2`,
      [newBalance, wallet.id]
    );

    await client.query(
      `insert into wallet_movements (
         wallet_id, driver_id, type, amount_usd, balance_before, balance_after, service_id, note
       ) values ($1, $2, 'service_fee', $3, $4, $5, $6, $7)`,
      [wallet.id, driverId, -SERVICE_FEE_USD, currentBalance, newBalance, serviceId, 'Automatic service completion fee']
    );

    await client.query(
      `update services
       set status = 'completed', completed_at = now()
       where id = $1 and driver_id = $2`,
      [serviceId, driverId]
    );

    await client.query('commit');

    return {
      serviceId,
      charged: true,
      feeUsd: SERVICE_FEE_USD,
      walletBalanceUsd: newBalance,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function handleWebhook({ provider, eventId, eventType, payload, signature }) {
  const client = await db.pool.connect();

  try {
    await client.query('begin');

    const existing = await client.query(
      `select id, processed
       from webhook_events
       where provider = $1 and event_id = $2
       limit 1`,
      [provider, eventId]
    );

    if (existing.rows[0]) {
      await client.query('commit');
      return { ok: true, duplicate: true };
    }

    await client.query(
      `insert into webhook_events (provider, event_id, event_type, payload, signature, processed, processed_at)
       values ($1, $2, $3, $4, $5, true, now())`,
      [provider, eventId, eventType, payload, signature]
    );

    if (eventType === 'payment.paid') {
      const paymentId = payload.paymentId;
      if (paymentId) {
        const paymentResult = await client.query(
          `select id, driver_id, wallet_id, amount_usd, status
           from payments
           where id = $1
           for update`,
          [paymentId]
        );

        const payment = paymentResult.rows[0];
        if (payment && payment.status !== 'paid') {
          const walletResult = await client.query(
            `select id, balance_usd
             from wallets
             where id = $1
             for update`,
            [payment.wallet_id]
          );

          const wallet = walletResult.rows[0];
          if (wallet) {
            const before = Number(wallet.balance_usd);
            const amount = Number(payment.amount_usd);
            const after = Number((before + amount).toFixed(2));

            await client.query(
              `update wallets set balance_usd = $1 where id = $2`,
              [after, wallet.id]
            );

            await client.query(
              `update payments
               set status = 'paid', provider_payment_id = coalesce($1, provider_payment_id)
               where id = $2`,
              [payload.providerPaymentId || null, payment.id]
            );

            await client.query(
              `insert into wallet_movements (
                 wallet_id, driver_id, type, amount_usd, balance_before, balance_after, payment_id, note
               ) values ($1, $2, 'topup', $3, $4, $5, $6, $7)`,
              [wallet.id, payment.driver_id, amount, before, after, payment.id, `Topup via ${provider}`]
            );
          }
        }
      }
    }

    await client.query('commit');
    return { ok: true, duplicate: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getWalletByDriverId,
  getWalletMovements,
  createTopupIntent,
  completeServiceAndCharge,
  handleWebhook,
};
