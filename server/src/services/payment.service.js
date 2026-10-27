import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { HttpError } from '../lib/errors.js';
import {
  createTestCheckoutSession,
  getTestCheckoutSession,
  recordTestWebhookStatus,
  verifyPaymentWebhookSignature,
} from './test-payment-provider.js';
import { createTicketCode } from './booking.service.js';

const checkoutPaymentSelect = {
  id: true,
  bookingId: true,
  provider: true,
  providerCheckoutId: true,
  providerPaymentId: true,
  status: true,
  amountMinor: true,
  currency: true,
};

const testCheckoutIdPattern =
  /^test_checkout_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
}

function lockEvent(tx, eventId) {
  return tx.$queryRaw`
    SELECT "id"
    FROM "Event"
    WHERE "id" = ${eventId}::uuid
    FOR UPDATE
  `;
}

function lockBooking(tx, bookingId) {
  return tx.$queryRaw`
    SELECT "id"
    FROM "Booking"
    WHERE "id" = ${bookingId}::uuid
    FOR UPDATE
  `;
}

function lockPayment(tx, paymentId) {
  return tx.$queryRaw`
    SELECT "id"
    FROM "Payment"
    WHERE "id" = ${paymentId}::uuid
    FOR UPDATE
  `;
}

async function findOwnedBooking(bookingId, userId) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    select: {
      id: true,
      eventId: true,
    },
  });

  if (!booking) {
    notFound();
  }

  return booking;
}

function serializeCheckout(session) {
  return {
    id: session.id,
    status: session.status,
    testMode: session.testMode,
  };
}

export async function createBookingCheckout(bookingId, userId) {
  const reference = await findOwnedBooking(bookingId, userId);

  const result = await prisma.$transaction(async (tx) => {
    const lockedEvents = await lockEvent(tx, reference.eventId);
    if (lockedEvents.length === 0) notFound();

    const lockedBookings = await lockBooking(tx, bookingId);
    if (lockedBookings.length === 0) notFound();

    const booking = await tx.booking.findFirst({
      where: { id: bookingId, userId },
      select: {
        id: true,
        eventId: true,
        status: true,
        holdExpiresAt: true,
        amountMinor: true,
        currency: true,
        payment: { select: checkoutPaymentSelect },
      },
    });

    if (!booking?.payment) notFound();

    const lockedPayments = await lockPayment(tx, booking.payment.id);
    if (lockedPayments.length === 0) notFound();

    const currentBooking = await tx.booking.findFirst({
      where: { id: bookingId, userId },
      select: {
        id: true,
        eventId: true,
        status: true,
        holdExpiresAt: true,
        amountMinor: true,
        currency: true,
        payment: { select: checkoutPaymentSelect },
      },
    });

    if (!currentBooking?.payment) notFound();

    const now = new Date();
    if (
      currentBooking.status === 'PENDING_PAYMENT' &&
      currentBooking.holdExpiresAt <= now
    ) {
      await tx.payment.updateMany({
        where: { id: currentBooking.payment.id, status: 'OPEN' },
        data: { status: 'EXPIRED' },
      });
      await tx.booking.updateMany({
        where: { id: bookingId, status: 'PENDING_PAYMENT' },
        data: { status: 'EXPIRED' },
      });
      return { expired: true };
    }

    if (
      currentBooking.status !== 'PENDING_PAYMENT' ||
      currentBooking.payment.status !== 'OPEN'
    ) {
      throw new HttpError(
        409,
        'BOOKING_NOT_PAYABLE',
        'This booking is not awaiting payment.'
      );
    }

    const session =
      (currentBooking.payment.providerCheckoutId
        ? getTestCheckoutSession(currentBooking.payment.providerCheckoutId)
        : null) ??
      createTestCheckoutSession({
        paymentId: currentBooking.payment.id,
        amountMinor: currentBooking.payment.amountMinor,
        currency: currentBooking.payment.currency,
      });

    if (!currentBooking.payment.providerCheckoutId) {
      await tx.payment.update({
        where: { id: currentBooking.payment.id },
        data: { providerCheckoutId: session.id },
      });
    }

    return { paymentId: currentBooking.payment.id, session };
  });

  if (result.expired) {
    throw new HttpError(
      409,
      'PAYMENT_HOLD_EXPIRED',
      'The payment hold for this booking has expired.'
    );
  }

  return {
    paymentId: result.paymentId,
    checkout: serializeCheckout(result.session),
  };
}

export async function processTestCheckoutOutcome(checkoutId, userId, status) {
  if (process.env.PAYMENT_PROVIDER_MODE !== 'test') {
    throw new HttpError(
      503,
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'The test payment provider is unavailable.'
    );
  }

  if (
    typeof checkoutId !== 'string' ||
    !testCheckoutIdPattern.test(checkoutId)
  ) {
    throw new HttpError(
      404,
      'CHECKOUT_NOT_FOUND',
      'Checkout session not found.'
    );
  }

  if (!['PAID', 'FAILED'].includes(status)) {
    throw new HttpError(
      400,
      'INVALID_TEST_PAYMENT_STATUS',
      'Test payment status must be PAID or FAILED.'
    );
  }

  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    throw new HttpError(
      503,
      'PAYMENT_WEBHOOK_NOT_CONFIGURED',
      'Payment webhooks are not configured.'
    );
  }

  const payment = await prisma.payment.findFirst({
    where: {
      provider: 'razorpay',
      providerCheckoutId: checkoutId,
      booking: { userId },
    },
    select: { bookingId: true },
  });

  if (!payment) {
    throw new HttpError(
      404,
      'CHECKOUT_NOT_FOUND',
      'Checkout session not found.'
    );
  }

  const payload = {
    eventId: `test_${checkoutId}_${crypto.randomUUID()}`,
    checkoutId,
    status,
    ...(status === 'PAID'
      ? { providerPaymentId: `test_payment_${crypto.randomUUID()}` }
      : {}),
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')}`;
  const result = await processPaymentWebhook(rawBody, signature);

  return { ...result, bookingId: payment.bookingId };
}

async function findPaymentReference(where) {
  const payment = await prisma.payment.findFirst({
    where,
    select: {
      id: true,
      bookingId: true,
      booking: { select: { eventId: true } },
    },
  });

  if (!payment?.booking) {
    throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  }

  return payment;
}

async function updatePaymentFromProvider({
  paymentReference,
  providerStatus,
  providerPaymentId,
  webhookEventId,
}) {
  return prisma.$transaction(async (tx) => {
    if (webhookEventId) {
      const inserted = await tx.processedWebhook.createMany({
        data: [{ provider: 'razorpay', providerEventId: webhookEventId }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        return { duplicate: true };
      }
    }

    const eventLocks = await lockEvent(tx, paymentReference.booking.eventId);
    if (eventLocks.length === 0) {
      throw new HttpError(404, 'EVENT_UNAVAILABLE', 'Event not found.');
    }

    const bookingLocks = await lockBooking(tx, paymentReference.bookingId);
    if (bookingLocks.length === 0) {
      throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    }

    const paymentLocks = await lockPayment(tx, paymentReference.id);
    if (paymentLocks.length === 0) {
      throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
    }

    const payment = await tx.payment.findUnique({
      where: { id: paymentReference.id },
      select: {
        ...checkoutPaymentSelect,
        booking: {
          select: {
            id: true,
            eventId: true,
            status: true,
            holdExpiresAt: true,
            ticketCode: true,
          },
        },
      },
    });

    if (!payment?.booking) {
      throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
    }

    const { booking } = payment;
    const now = new Date();

    if (
      payment.status === 'PAID' ||
      payment.status === 'REFUNDED' ||
      booking.status === 'CONFIRMED'
    ) {
      return { payment, booking, duplicate: true };
    }

    if (
      payment.status === 'REFUND_REQUIRED' ||
      booking.status === 'REFUND_REQUIRED'
    ) {
      return { payment, booking, duplicate: true };
    }

    if (providerStatus === 'PAID') {
      const holdExpired =
        booking.status === 'EXPIRED' ||
        payment.status === 'EXPIRED' ||
        (booking.status === 'PENDING_PAYMENT' && booking.holdExpiresAt <= now);

      if (holdExpired) {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'REFUND_REQUIRED',
            ...(providerPaymentId ? { providerPaymentId } : {}),
          },
        });
        const updatedBooking = await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'REFUND_REQUIRED' },
        });
        return {
          payment: updatedPayment,
          booking: updatedBooking,
          duplicate: false,
        };
      }

      if (booking.status !== 'PENDING_PAYMENT' || payment.status !== 'OPEN') {
        throw new HttpError(
          409,
          'PAYMENT_NOT_PROCESSABLE',
          'This payment can no longer be processed.'
        );
      }

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          ...(providerPaymentId ? { providerPaymentId } : {}),
        },
      });
      const updatedBooking = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CONFIRMED',
          ticketCode: createTicketCode(),
          holdExpiresAt: null,
        },
      });

      return {
        payment: updatedPayment,
        booking: updatedBooking,
        duplicate: false,
      };
    }

    if (providerStatus === 'FAILED') {
      if (booking.status === 'PENDING_PAYMENT' && payment.status === 'OPEN') {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'EXPIRED' },
        });
        const updatedBooking = await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'EXPIRED' },
        });
        return {
          payment: updatedPayment,
          booking: updatedBooking,
          duplicate: false,
        };
      }
    }

    return { payment, booking, duplicate: true };
  });
}

export async function processPaymentWebhook(rawBody, signature) {
  if (!Buffer.isBuffer(rawBody)) {
    throw new HttpError(400, 'INVALID_WEBHOOK_BODY', 'Invalid webhook body.');
  }

  if (!verifyPaymentWebhookSignature(rawBody, signature)) {
    throw new HttpError(
      401,
      'INVALID_WEBHOOK_SIGNATURE',
      'Webhook signature is invalid.'
    );
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_WEBHOOK_BODY', 'Invalid webhook body.');
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    typeof payload.eventId !== 'string' ||
    payload.eventId.trim() === '' ||
    payload.eventId.length > 200 ||
    typeof payload.checkoutId !== 'string' ||
    payload.checkoutId.trim() === '' ||
    !['OPEN', 'PAID', 'FAILED'].includes(payload.status) ||
    (payload.providerPaymentId !== undefined &&
      (typeof payload.providerPaymentId !== 'string' ||
        payload.providerPaymentId.length > 200))
  ) {
    throw new HttpError(400, 'INVALID_WEBHOOK_BODY', 'Invalid webhook body.');
  }

  recordTestWebhookStatus(payload.checkoutId, payload.status);

  const paymentReference = await findPaymentReference({
    provider: 'razorpay',
    providerCheckoutId: payload.checkoutId,
  });

  const result = await updatePaymentFromProvider({
    paymentReference,
    providerStatus: payload.status,
    providerPaymentId: payload.providerPaymentId,
    webhookEventId: payload.eventId,
  });
  return { received: true, duplicate: result.duplicate };
}

export async function reconcileBookingPayment(bookingId, userId) {
  const reference = await findOwnedBooking(bookingId, userId);
  const payment = await prisma.payment.findUnique({
    where: { bookingId: reference.id },
    select: checkoutPaymentSelect,
  });

  if (!payment) {
    throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  }

  if (!payment.providerCheckoutId) {
    throw new HttpError(
      409,
      'CHECKOUT_NOT_CREATED',
      'A checkout session has not been created for this booking.'
    );
  }

  const paymentReference = await findPaymentReference({ id: payment.id });
  if (payment.status !== 'OPEN') {
    const result = await updatePaymentFromProvider({
      paymentReference,
      providerStatus: payment.status === 'PAID' ? 'PAID' : 'FAILED',
    });

    return {
      booking: result.booking,
      payment: result.payment,
    };
  }

  const session = getTestCheckoutSession(payment.providerCheckoutId);
  if (!session) {
    throw new HttpError(
      503,
      'CHECKOUT_SESSION_UNAVAILABLE',
      'The test checkout session is unavailable. Resume checkout to restore the session before reconciling payment.'
    );
  }

  const result = await updatePaymentFromProvider({
    paymentReference,
    providerStatus: session.status,
  });

  return {
    booking: result.booking,
    payment: result.payment,
  };
}
