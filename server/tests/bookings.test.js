import 'dotenv/config';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_ACCESS_SECRET ||= 'booking-integration-test-secret';

test(
  'bookings are authenticated, idempotent, owner-only, and capacity-safe',
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
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const emailPrefix = `booking-test-${randomUUID()}`;
    const [organizer, attendee, secondAttendee] = await Promise.all(
      ['organizer', 'attendee-1', 'attendee-2'].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `${emailPrefix}-${name}@example.test`,
            passwordHash: 'not-used',
          },
        })
      )
    );
    const userIds = [organizer.id, attendee.id, secondAttendee.id];

    t.after(async () => {
      await prisma.booking.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.event.deleteMany({ where: { organizerId: organizer.id } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await new Promise((resolve) => server.close(resolve));
      await prisma.$disconnect();
    });

    const DAY = 24 * 60 * 60 * 1000;
    function createEvent(overrides = {}) {
      const startAt = new Date(Date.now() + 7 * DAY);
      return prisma.event.create({
        data: {
          organizerId: organizer.id,
          title: `Booking test ${randomUUID()}`,
          description: 'Test event',
          category: 'Test',
          venue: 'Test venue',
          address: 'Test address',
          city: 'Test city',
          timezone: 'Asia/Kolkata',
          startAt,
          endAt: new Date(startAt.getTime() + 3600 * 1000),
          registrationClosesAt: startAt,
          capacity: 5,
          priceMinor: 0,
          currency: 'INR',
          status: 'PUBLISHED',
          ...overrides,
        },
      });
    }

    function call(method, path, userId) {
      const token = userId
        ? jwt.sign({ id: userId }, process.env.JWT_ACCESS_SECRET, {
            expiresIn: '5m',
          })
        : undefined;
      return fetch(`${baseUrl}/api${path}`, {
        method,
        headers: token ? { cookie: `accessToken=${token}` } : {},
      });
    }
    const book = (eventId, userId) =>
      call('POST', `/events/${eventId}/bookings`, userId);

    const activeCount = (eventId) =>
      prisma.booking.count({
        where: { eventId, status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] } },
      });

    await t.test(
      'books a free event and returns the same booking on retry',
      async () => {
        const event = await createEvent();
        const first = await book(event.id, attendee.id);
        const firstBody = await first.json();
        const retry = await book(event.id, attendee.id);
        const retryBody = await retry.json();

        assert.equal(first.status, 201);
        assert.equal(firstBody.created, true);
        assert.equal(firstBody.data.status, 'CONFIRMED');
        assert.equal(retry.status, 200);
        assert.equal(retryBody.created, false);
        assert.equal(retryBody.data.id, firstBody.data.id);
        assert.equal(await activeCount(event.id), 1);
      }
    );

    await t.test('one user double-clicking gets one booking', async () => {
      const event = await createEvent();
      const responses = await Promise.all([
        book(event.id, attendee.id),
        book(event.id, attendee.id),
      ]);
      const bodies = await Promise.all(responses.map((r) => r.json()));

      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
      assert.equal(bodies[0].data.id, bodies[1].data.id);
      assert.equal(await activeCount(event.id), 1);
    });

    await t.test('only one of two attendees gets the last seat', async () => {
      const event = await createEvent({ capacity: 1 });
      const responses = await Promise.all([
        book(event.id, attendee.id),
        book(event.id, secondAttendee.id),
      ]);

      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      assert.equal(await activeCount(event.id), 1);
    });

    await t.test(
      'rejects closed, paid, draft, hidden, and unknown events',
      async () => {
        const closed = await createEvent({
          registrationClosesAt: new Date(Date.now() - 1000),
        });
        const paid = await createEvent({ priceMinor: 49900 });
        const draft = await createEvent({ status: 'DRAFT' });
        const hidden = await createEvent({ hiddenAt: new Date() });

        const codes = async (eventId) => {
          const res = await book(eventId, attendee.id);
          return [res.status, (await res.json()).error.code];
        };

        assert.deepEqual(await codes(closed.id), [409, 'REGISTRATION_CLOSED']);
        assert.deepEqual(await codes(paid.id), [409, 'PAYMENT_REQUIRED']);
        assert.deepEqual(await codes(draft.id), [404, 'EVENT_UNAVAILABLE']);
        assert.deepEqual(await codes(hidden.id), [404, 'EVENT_UNAVAILABLE']);
        assert.deepEqual(await codes(randomUUID()), [404, 'EVENT_UNAVAILABLE']);
        assert.deepEqual(await codes('not-a-uuid'), [404, 'EVENT_UNAVAILABLE']);
      }
    );

    await t.test('rejects anonymous users', async () => {
      const event = await createEvent();
      assert.equal((await book(event.id)).status, 401);
      assert.equal((await call('GET', '/bookings')).status, 401);
    });

    await t.test('users only see their own bookings and tickets', async () => {
      const event = await createEvent();
      const { data: booking } = await (
        await book(event.id, attendee.id)
      ).json();

      const list = await (await call('GET', '/bookings', attendee.id)).json();
      assert.ok(list.data.some((b) => b.id === booking.id));
      assert.ok(list.pagination.total >= 1);

      const otherList = await (
        await call('GET', '/bookings', secondAttendee.id)
      ).json();
      assert.ok(!otherList.data.some((b) => b.id === booking.id));

      assert.equal(
        (await call('GET', `/bookings/${booking.id}`, attendee.id)).status,
        200
      );
      assert.equal(
        (await call('GET', `/bookings/${booking.id}`, secondAttendee.id))
          .status,
        404
      );

      const ticket = await call(
        'GET',
        `/bookings/${booking.id}/ticket`,
        attendee.id
      );
      assert.equal(ticket.status, 200);
      assert.ok((await ticket.json()).data.ticketCode);
      assert.equal(
        (await call('GET', `/bookings/${booking.id}/ticket`, secondAttendee.id))
          .status,
        404
      );
    });

    await t.test('cancelling frees the seat and kills the ticket', async () => {
      const event = await createEvent({ capacity: 1 });
      const { data: booking } = await (
        await book(event.id, attendee.id)
      ).json();
      const { ticketCode: oldCode } = (
        await (
          await call('GET', `/bookings/${booking.id}/ticket`, attendee.id)
        ).json()
      ).data;

      assert.equal(
        (
          await call(
            'POST',
            `/bookings/${booking.id}/cancel`,
            secondAttendee.id
          )
        ).status,
        404
      );

      const cancel = await call(
        'POST',
        `/bookings/${booking.id}/cancel`,
        attendee.id
      );
      assert.equal(cancel.status, 200);
      assert.equal((await cancel.json()).data.status, 'CANCELLED');
      assert.equal(
        (await call('POST', `/bookings/${booking.id}/cancel`, attendee.id))
          .status,
        200
      );
      assert.equal(
        (await call('GET', `/bookings/${booking.id}/ticket`, attendee.id))
          .status,
        409
      );

      // Seat is free again: someone else can take it, and rebooking gets a new code.
      const rebook = await book(event.id, secondAttendee.id);
      assert.equal(rebook.status, 201);
      const rebooked = await prisma.booking.findFirst({
        where: { eventId: event.id, status: 'CONFIRMED' },
      });
      assert.notEqual(rebooked.ticketCode, oldCode);
    });
  }
);
