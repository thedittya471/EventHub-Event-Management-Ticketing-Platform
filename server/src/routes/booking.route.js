import { Router } from 'express';
import {
  cancelBooking,
  createBooking,
  createCheckout,
  createPaidBooking,
  getBooking,
  getBookingTicket,
  listBookings,
  paymentWebhook,
  processTestCheckout,
  reconcilePayment,
} from '../controllers/booking.controller.js';
import { requireAuth } from '../middleware/auth.js';

// Owner: Person C. Mounted at /api, so define full paths:
// /events/:eventId/bookings, /bookings/..., /organizer/events/:eventId/check-ins, /payments/webhook
// The webhook receives a raw Buffer body (see app.js) for signature checks.
const router = Router();

router.get('/bookings', requireAuth, listBookings);
router.get('/bookings/:bookingId', requireAuth, getBooking);
router.get('/bookings/:bookingId/ticket', requireAuth, getBookingTicket);
router.post('/bookings/:bookingId/cancel', requireAuth, cancelBooking);
router.post('/bookings/:bookingId/checkout', requireAuth, createCheckout);
router.post(
  '/test-checkouts/:checkoutId/outcome',
  requireAuth,
  processTestCheckout
);
router.post('/bookings/:bookingId/reconcile', requireAuth, reconcilePayment);
router.post('/events/:eventId/bookings', requireAuth, createBooking);
router.post('/events/:eventId/bookings/paid', requireAuth, createPaidBooking);
router.post('/payments/webhook', paymentWebhook);

export default router;
