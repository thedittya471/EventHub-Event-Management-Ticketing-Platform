import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatEventDateTime,
  getBookingState,
  isEventCancelled,
  isEventFree,
  isEventPaid,
  isEventSoldOut,
  isRegistrationClosed,
} from '../src/pages/eventDetailsUtils.js';

const now = new Date('2026-11-11T00:00:00.000Z');

function createEvent(overrides = {}) {
  return {
    status: 'PUBLISHED',
    priceMinor: 0,
    availability: 5,
    startAt: '2026-12-24T18:00:00.000Z',
    registrationClosesAt: '2026-12-20T00:00:00.000Z',
    ...overrides,
  };
}

test('free event with available seats can be booked', () => {
  const event = createEvent();

  assert.equal(isEventFree(event), true);
  assert.equal(isEventPaid(event), false);
  assert.deepEqual(getBookingState(event, now), {
    status: 'available',
    canBook: true,
  });
});

test('paid event with available seats can be booked', () => {
  const event = createEvent({ priceMinor: 2500 });

  assert.equal(isEventFree(event), false);
  assert.equal(isEventPaid(event), true);
  assert.deepEqual(getBookingState(event, now), {
    status: 'available',
    canBook: true,
  });
});

test('event with missing, invalid, or negative price cannot be booked', () => {
  for (const priceMinor of [undefined, 'invalid', NaN, -1]) {
    assert.deepEqual(
      getBookingState(createEvent({ priceMinor }), now),
      { status: 'unavailable', canBook: false },
      `priceMinor: ${String(priceMinor)}`
    );
  }
});

test('sold-out event cannot be booked', () => {
  const event = createEvent({ availability: 0 });

  assert.equal(isEventSoldOut(event), true);
  assert.deepEqual(getBookingState(event, now), {
    status: 'sold_out',
    canBook: false,
  });
});

test('registration deadline already passed closes booking', () => {
  const event = createEvent({
    registrationClosesAt: '2026-11-10T23:59:59.999Z',
  });

  assert.equal(isRegistrationClosed(event, now), true);
  assert.deepEqual(getBookingState(event, now), {
    status: 'registration_closed',
    canBook: false,
  });
});

test('registration deadline exactly at the current time closes booking', () => {
  const event = createEvent({ registrationClosesAt: now });

  assert.equal(isRegistrationClosed(event, now), true);
  assert.deepEqual(getBookingState(event, now), {
    status: 'registration_closed',
    canBook: false,
  });
});

test('cancelled event cannot be booked and takes precedence over other gates', () => {
  const event = createEvent({
    status: 'CANCELLED',
    registrationClosesAt: '2026-11-10T23:59:59.999Z',
    availability: 0,
  });

  assert.equal(isEventCancelled(event), true);
  assert.deepEqual(getBookingState(event, now), {
    status: 'cancelled',
    canBook: false,
  });
});

test('missing and invalid event dates are handled safely', () => {
  assert.equal(
    isRegistrationClosed(
      createEvent({
        registrationClosesAt: 'not-a-date',
        startAt: undefined,
      }),
      now
    ),
    false
  );
  assert.equal(
    formatEventDateTime(undefined, 'Asia/Kolkata'),
    'Date unavailable'
  );
  assert.equal(
    formatEventDateTime('not-a-date', 'Asia/Kolkata'),
    'Date unavailable'
  );
});

test('event date and time are formatted in the supplied IANA timezone', () => {
  assert.equal(
    formatEventDateTime('2026-12-24T18:00:00.000Z', 'Asia/Kolkata'),
    'Thursday, 24 December 2026 at 11:30 pm'
  );
});

test('invalid timezone falls back to the runtime timezone', () => {
  const value = '2026-12-24T18:00:00.000Z';
  const expected = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));

  assert.equal(formatEventDateTime(value, 'Not/A_Timezone'), expected);
});

test('invalid current time does not incorrectly close registration', () => {
  assert.equal(
    isRegistrationClosed(
      createEvent({ registrationClosesAt: '2026-11-10' }),
      'invalid'
    ),
    false
  );
});
