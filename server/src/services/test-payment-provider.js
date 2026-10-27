import crypto from 'node:crypto';
import { HttpError } from '../lib/errors.js';

const sessions = new Map();
const CHECKOUT_ID_PREFIX = 'test_checkout_';

function assertTestMode() {
  if ((process.env.PAYMENT_PROVIDER_MODE ?? 'test') !== 'test') {
    throw new HttpError(
      503,
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'The configured payment provider is unavailable.'
    );
  }
}

function parseStatus(status) {
  if (!['OPEN', 'PAID', 'FAILED'].includes(status)) {
    throw new HttpError(
      400,
      'INVALID_PAYMENT_STATUS',
      'Invalid payment status.'
    );
  }
  return status;
}

export function createTestCheckoutSession({
  paymentId,
  amountMinor,
  currency,
}) {
  assertTestMode();
  const id = `${CHECKOUT_ID_PREFIX}${paymentId}`;
  const existing = sessions.get(id);

  if (existing) {
    if (
      existing.amountMinor !== amountMinor ||
      existing.currency !== currency
    ) {
      throw new Error('Test checkout session amount mismatch.');
    }
    return existing;
  }

  const session = {
    id,
    status: 'OPEN',
    amountMinor,
    currency,
    testMode: true,
  };
  sessions.set(id, session);
  return session;
}

export function getTestCheckoutSession(checkoutId) {
  assertTestMode();
  if (!checkoutId.startsWith(CHECKOUT_ID_PREFIX)) {
    throw new HttpError(
      404,
      'CHECKOUT_NOT_FOUND',
      'Checkout session not found.'
    );
  }

  return sessions.get(checkoutId) ?? null;
}

export function setTestCheckoutStatus(checkoutId, status) {
  assertTestMode();
  if (!checkoutId.startsWith(CHECKOUT_ID_PREFIX)) {
    throw new HttpError(
      404,
      'CHECKOUT_NOT_FOUND',
      'Checkout session not found.'
    );
  }

  const session = sessions.get(checkoutId);
  const updated = {
    id: checkoutId,
    status: parseStatus(status),
    amountMinor: session?.amountMinor,
    currency: session?.currency,
    testMode: true,
  };
  sessions.set(checkoutId, updated);
  return updated;
}

export function clearTestCheckoutSessions() {
  sessions.clear();
}

export function verifyPaymentWebhookSignature(rawBody, signature) {
  assertTestMode();
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!secret) {
    throw new HttpError(
      503,
      'PAYMENT_WEBHOOK_NOT_CONFIGURED',
      'Payment webhooks are not configured.'
    );
  }

  if (
    typeof signature !== 'string' ||
    !/^sha256=[0-9a-f]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')}`;
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function recordTestWebhookStatus(checkoutId, status) {
  return setTestCheckoutStatus(checkoutId, status);
}
