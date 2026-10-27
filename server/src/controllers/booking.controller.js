import {
  cancelUserBooking,
  createFreeBooking,
  createPaidBooking as createPaidBookingReservation,
  getUserBooking,
  getUserBookingTicket,
  listUserBookings,
} from '../services/booking.service.js';
import {
  createBookingCheckout,
  processPaymentWebhook,
  processTestCheckoutOutcome,
  reconcileBookingPayment,
} from '../services/payment.service.js';
import { HttpError } from '../lib/errors.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createBooking(req, res) {
  const { eventId } = req.params;
  if (!uuidPattern.test(eventId)) {
    throw new HttpError(
      404,
      'EVENT_UNAVAILABLE',
      'Event not found or unavailable.'
    );
  }

  const { booking, created } = await createFreeBooking(eventId, req.user.id);
  return res.status(created ? 201 : 200).json({
    success: true,
    ticket: booking,
    data: booking,
    created,
  });
}

export async function createPaidBooking(req, res) {
  const { eventId } = req.params;
  if (!uuidPattern.test(eventId)) {
    throw new HttpError(
      404,
      'EVENT_UNAVAILABLE',
      'Event not found or unavailable.'
    );
  }

  const { booking, payment, created } = await createPaidBookingReservation(
    eventId,
    req.user.id
  );

  return res.status(created ? 201 : 200).json({
    data: { booking, payment },
    created,
  });
}

export async function createCheckout(req, res) {
  const { bookingId } = req.params;
  validateBookingId(bookingId);

  const checkout = await createBookingCheckout(bookingId, req.user.id);
  return res.status(200).json({ data: checkout });
}

export async function processTestCheckout(req, res) {
  const result = await processTestCheckoutOutcome(
    req.params.checkoutId,
    req.user.id,
    req.body?.status
  );
  return res.status(200).json({ data: result });
}

export async function reconcilePayment(req, res) {
  const { bookingId } = req.params;
  validateBookingId(bookingId);

  const result = await reconcileBookingPayment(bookingId, req.user.id);
  return res.status(200).json({ data: result });
}

export async function paymentWebhook(req, res) {
  const result = await processPaymentWebhook(
    req.body,
    req.get('x-payment-signature')
  );

  return res.status(200).json({ data: result });
}

function validateBookingId(bookingId) {
  if (!uuidPattern.test(bookingId)) {
    throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
  }
}

export async function listBookings(req, res) {
  const result = await listUserBookings(req.user.id, req.query);

  return res.status(200).json(result);
}

export async function getBooking(req, res) {
  validateBookingId(req.params.bookingId);
  const booking = await getUserBooking(req.params.bookingId, req.user.id);

  return res.status(200).json({ data: booking });
}

export async function getBookingTicket(req, res) {
  validateBookingId(req.params.bookingId);
  const ticket = await getUserBookingTicket(req.params.bookingId, req.user.id);

  return res.status(200).json({ data: ticket });
}

export async function cancelBooking(req, res) {
  validateBookingId(req.params.bookingId);
  const booking = await cancelUserBooking(req.params.bookingId, req.user.id);

  return res.status(200).json({ data: booking });
}
