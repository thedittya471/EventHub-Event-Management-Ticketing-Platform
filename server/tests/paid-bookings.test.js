import 'dotenv/config';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_ACCESS_SECRET ||= 'paid-booking-integration-test-secret';

test(
  'paid booking reservations create atomic payment records and respect capacity',
  {
    skip:
      !process.env.DATABASE_URL &&
      'DATABASE_URL is required for integration tests.',
  },
  async (t) => {
    const [{ default: app }, { prisma }] = await Promise.all([
      import('../src/app.js'),
      import('../src/db.js'),
    ]);
    const server = createServer(app);
    const createdEventIds = [];
    const createdBookingIds = [];
    const createdUserIds = [];

    t.after(async () => {
      await prisma.payment.deleteMany({
        where: { bookingId: { in: createdBookingIds } },
      });
      await prisma.booking.deleteMany({
        where: { id: { in: createdBookingIds } },
      });
      await prisma.event.deleteMany({
        where: { id: { in: createdEventIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      if (server.listening) {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
      await prisma.$disconnect();
    });

    await prisma.$connect();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const organizer = await prisma.user.create({
      data: {
        name: 'Paid Booking Organizer',
        email: `paid-organizer-${randomUUID()}@example.test`,
        passwordHash: 'not-used',
        role: 'ORGANIZER',
      },
    });
    const attendee = await prisma.user.create({
      data: {
        name: 'Paid Booking Attendee',
        email: `paid-attendee-${randomUUID()}@example.test`,
        passwordHash: 'not-used',
      },
    });
    const secondAttendee = await prisma.user.create({
      data: {
        name: 'Second Paid Booking Attendee',
        email: `paid-attendee-${randomUUID()}@example.test`,
        passwordHash: 'not-used',
      },
    });
    createdUserIds.push(organizer.id, attendee.id, secondAttendee.id);

    async function createEvent(overrides = {}) {
      const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const event = await prisma.event.create({
        data: {
          organizerId: organizer.id,
          title: `Paid booking test ${randomUUID()}`,
          description: 'Paid booking integration test.',
          category: 'Test',
          venue: 'Test venue',
          address: '1 Test Street',
          city: 'Test City',
          timezone: 'UTC',
          startAt,
          endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
          registrationClosesAt: new Date(startAt.getTime() - 60 * 60 * 1000),
          capacity: 5,
          priceMinor: 2599,
          currency: 'INR',
          status: 'PUBLISHED',
          ...overrides,
        },
      });
      createdEventIds.push(event.id);
      return event;
    }

    async function createBooking(eventId, userId, overrides = {}) {
      const event = await prisma.event.findUnique({ where: { id: eventId } });
      const booking = await prisma.booking.create({
        data: {
          userId,
          eventId,
          status: 'CONFIRMED',
          amountMinor: event.priceMinor,
          currency: event.currency,
          eventSnapshot: {
            title: event.title,
            startAt: event.startAt.toISOString(),
            priceMinor: event.priceMinor,
            currency: event.currency,
          },
          ...overrides,
        },
      });
      createdBookingIds.push(booking.id);
      return booking;
    }

    function tokenFor(userId) {
      return jwt.sign({ id: userId }, process.env.JWT_ACCESS_SECRET, {
        expiresIn: '5m',
      });
    }

    function reserve(eventId, userId, body = {}) {
      return fetch(`${baseUrl}/api/events/${eventId}/bookings/paid`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `accessToken=${tokenFor(userId)}`,
        },
        body: JSON.stringify(body),
      });
    }

    await t.test(
      'creates a pending booking and one payment using the database price',
      async () => {
        const event = await createEvent();
        const requestStartedAt = Date.now();
        const response = await reserve(event.id, attendee.id, {
          amountMinor: 1,
          currency: 'USD',
        });
        const body = await response.json();
        const { booking, payment } = body.data;
        createdBookingIds.push(booking.id);

        assert.equal(response.status, 201);
        assert.equal(body.created, true);
        assert.equal(booking.status, 'PENDING_PAYMENT');
        assert.equal(booking.amountMinor, event.priceMinor);
        assert.equal(booking.currency, event.currency);
        assert.equal(booking.ticketCode, null);
        assert.equal(booking.eventSnapshot.priceMinor, event.priceMinor);
        const holdMinutes = Number(process.env.PAYMENT_HOLD_MINUTES ?? 15);
        assert.ok(
          new Date(booking.holdExpiresAt).getTime() >=
            requestStartedAt + holdMinutes * 60 * 1000
        );
        assert.equal(payment.provider, 'razorpay');
        assert.equal(payment.status, 'OPEN');
        assert.equal(payment.amountMinor, event.priceMinor);
        assert.equal(payment.currency, event.currency);
        assert.equal(payment.bookingId, booking.id);
        assert.equal(
          await prisma.payment.count({ where: { bookingId: booking.id } }),
          1
        );
      }
    );

    await t.test(
      'returns the existing reservation for concurrent duplicate requests',
      async () => {
        const event = await createEvent();
        const responses = await Promise.all([
          reserve(event.id, attendee.id),
          reserve(event.id, attendee.id),
        ]);
        const bodies = await Promise.all(
          responses.map((response) => response.json())
        );
        const bookings = bodies.map((body) => body.data.booking);

        assert.deepEqual(
          responses.map((response) => response.status).sort(),
          [200, 201]
        );
        assert.deepEqual(bodies.map((body) => body.created).sort(), [
          false,
          true,
        ]);
        assert.equal(bookings[0].id, bookings[1].id);
        assert.equal(bodies[0].data.payment.id, bodies[1].data.payment.id);
        createdBookingIds.push(bookings[0].id);
        assert.equal(
          await prisma.booking.count({
            where: { eventId: event.id, userId: attendee.id },
          }),
          1
        );
        assert.equal(
          await prisma.payment.count({
            where: { bookingId: bookings[0].id },
          }),
          1
        );
      }
    );

    await t.test(
      'rejects a reservation when confirmed bookings fill capacity',
      async () => {
        const event = await createEvent({ capacity: 1 });
        await createBooking(event.id, attendee.id);

        const response = await reserve(event.id, secondAttendee.id);
        const body = await response.json();

        assert.equal(response.status, 409);
        assert.equal(body.error.code, 'EVENT_SOLD_OUT');
        assert.equal(
          await prisma.booking.count({ where: { eventId: event.id } }),
          1
        );
      }
    );

    await t.test(
      'counts unexpired pending bookings against capacity',
      async () => {
        const event = await createEvent({ capacity: 1 });
        const pendingBooking = await createBooking(event.id, attendee.id, {
          status: 'PENDING_PAYMENT',
          holdExpiresAt: new Date(Date.now() + 60 * 1000),
          ticketCode: null,
        });
        await prisma.payment.create({
          data: {
            bookingId: pendingBooking.id,
            provider: 'razorpay',
            status: 'OPEN',
            amountMinor: pendingBooking.amountMinor,
            currency: pendingBooking.currency,
          },
        });

        const response = await reserve(event.id, secondAttendee.id);

        assert.equal(response.status, 409);
        assert.equal((await response.json()).error.code, 'EVENT_SOLD_OUT');
      }
    );

    await t.test(
      'expires stale holds and their open payments before reserving capacity',
      async () => {
        const event = await createEvent({ capacity: 1 });
        const expiredBooking = await createBooking(event.id, attendee.id, {
          status: 'PENDING_PAYMENT',
          holdExpiresAt: new Date(Date.now() - 60 * 1000),
          ticketCode: null,
        });
        const expiredPayment = await prisma.payment.create({
          data: {
            bookingId: expiredBooking.id,
            provider: 'razorpay',
            status: 'OPEN',
            amountMinor: expiredBooking.amountMinor,
            currency: expiredBooking.currency,
          },
        });

        const response = await reserve(event.id, secondAttendee.id);
        const body = await response.json();
        createdBookingIds.push(body.data.booking.id);

        assert.equal(response.status, 201);
        assert.equal(body.data.booking.status, 'PENDING_PAYMENT');
        assert.equal(
          (
            await prisma.booking.findUnique({
              where: { id: expiredBooking.id },
            })
          ).status,
          'EXPIRED'
        );
        assert.equal(
          (
            await prisma.payment.findUnique({
              where: { id: expiredPayment.id },
            })
          ).status,
          'EXPIRED'
        );
        assert.equal(
          await prisma.booking.count({
            where: { eventId: event.id, status: 'PENDING_PAYMENT' },
          }),
          1
        );
      }
    );

    await t.test('rejects free events from the paid booking flow', async () => {
      const event = await createEvent({ priceMinor: 0 });
      const response = await reserve(event.id, attendee.id);

      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, 'PAYMENT_NOT_REQUIRED');
      assert.equal(
        await prisma.booking.count({ where: { eventId: event.id } }),
        0
      );
    });
  }
);
