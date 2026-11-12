import { prisma } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { parsePagination } from '../lib/pagination.js';
import { ACTIVE_STATUSES } from './booking.service.js';

const EVENT_FIELDS = [
  'title',
  'description',
  'category',
  'coverKey',
  'venue',
  'address',
  'city',
  'timezone',
  'startAt',
  'endAt',
  'registrationClosesAt',
  'capacity',
  'priceMinor',
  'currency',
];

const REQUIRED_FIELDS = [
  'title',
  'description',
  'category',
  'venue',
  'address',
  'city',
  'timezone',
  'startAt',
  'endAt',
  'registrationClosesAt',
  'capacity',
  'priceMinor',
  'currency',
];

const STRING_LIMITS = {
  title: 150,
  description: 5000,
  category: 50,
  venue: 150,
  address: 300,
  city: 100,
  timezone: 64,
  currency: 3,
};

const DATE_FIELDS = ['startAt', 'endAt', 'registrationClosesAt'];

const LOCKED_FIELDS = [
  'priceMinor',
  'capacity',
  'startAt',
  'endAt',
  'registrationClosesAt',
];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidInput(message, fields = {}) {
  throw new HttpError(400, 'VALIDATION_ERROR', message, fields);
}

function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalidInput('Request body must be a JSON object.');
  }
}

function parseDate(value, field) {
  const hasTimezone =
    typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);

  if (typeof value !== 'string' || value.trim() === '' || !hasTimezone) {
    invalidInput(`Invalid ${field}.`, {
      [field]: 'A valid date with an explicit timezone is required.',
    });
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    invalidInput(`Invalid ${field}.`, {
      [field]: 'A valid date is required.',
    });
  }

  return date;
}

function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone: value,
    });

    return true;
  } catch {
    return false;
  }
}

function validateEventFields(body, { partial = false } = {}) {
  const errors = {};
  const cleaned = {};

  if (!partial) {
    for (const field of REQUIRED_FIELDS) {
      if (body[field] === undefined) {
        errors[field] = 'This field is required.';
      }
    }
  }

  for (const field of EVENT_FIELDS) {
    if (body[field] === undefined) continue;

    const value = body[field];

    if (Object.hasOwn(STRING_LIMITS, field)) {
      if (typeof value !== 'string' || value.trim() === '') {
        errors[field] = 'Must be a non-empty string.';
        continue;
      }

      const normalized =
        field === 'currency' ? value.trim().toUpperCase() : value.trim();

      if (normalized.length > STRING_LIMITS[field]) {
        errors[field] = `Must not exceed ${STRING_LIMITS[field]} characters.`;
        continue;
      }

      if (field === 'currency' && !/^[A-Z]{3}$/.test(normalized)) {
        errors[field] = 'Must be a three-letter currency code.';
        continue;
      }

      if (field === 'timezone' && !isValidTimeZone(normalized)) {
        errors[field] = 'Enter a valid IANA timezone.';
        continue;
      }

      cleaned[field] = normalized;
      continue;
    }

    if (field === 'coverKey') {
      if (value !== null && (typeof value !== 'string' || value.length > 100)) {
        errors[field] = 'Must be a string of at most 100 characters or null.';
      } else {
        cleaned[field] = value;
      }

      continue;
    }

    if (DATE_FIELDS.includes(field)) {
      try {
        cleaned[field] = parseDate(value, field);
      } catch (error) {
        errors[field] = error.message;
      }

      continue;
    }

    if (field === 'capacity') {
      if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
        errors[field] = 'Must be a positive integer within the allowed limit.';
      } else {
        cleaned[field] = value;
      }

      continue;
    }

    if (field === 'priceMinor') {
      if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
        errors[field] =
          'Must be a non-negative integer within the allowed limit.';
      } else {
        cleaned[field] = value;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    invalidInput('Please correct the invalid event fields.', errors);
  }

  return cleaned;
}

function validateEventDates(event) {
  const errors = {};

  if (event.startAt && event.endAt && event.endAt <= event.startAt) {
    errors.endAt = 'The event end date must be after the start date.';
  }

  if (
    event.registrationClosesAt &&
    event.startAt &&
    event.registrationClosesAt > event.startAt
  ) {
    errors.registrationClosesAt =
      'Registration deadline cannot be after the event starts.';
  }

  if (Object.keys(errors).length > 0) {
    invalidInput('Please correct the invalid event dates.', errors);
  }
}

function validateEventId(eventId) {
  if (typeof eventId !== 'string' || !UUID_REGEX.test(eventId)) {
    throw new HttpError(
      404,
      'EVENT_UNAVAILABLE',
      'Event not found or unavailable.'
    );
  }
}

async function findOwnedEvent(eventId, organizerId, client = prisma) {
  validateEventId(eventId);

  const event = await client.event.findFirst({
    where: {
      id: eventId,
      organizerId,
    },
  });

  if (!event) {
    throw new HttpError(
      404,
      'EVENT_UNAVAILABLE',
      'Event not found or unavailable.'
    );
  }

  return event;
}

function eventEditLocked() {
  throw new HttpError(
    409,
    'EVENT_EDIT_LOCKED',
    'Price, capacity and dates cannot be changed after a published event has bookings.'
  );
}

async function hasAnyBookings(eventId, client = prisma) {
  return (await client.booking.count({ where: { eventId } })) > 0;
}

async function getEventCounts(eventIds) {
  if (eventIds.length === 0) return new Map();

  const counts = await prisma.booking.groupBy({
    by: ['eventId'],
    where: {
      eventId: { in: eventIds },
      status: { in: ACTIVE_STATUSES },
    },
    _count: { _all: true },
  });

  const checkedIn = await prisma.booking.groupBy({
    by: ['eventId'],
    where: {
      eventId: { in: eventIds },
      status: 'CONFIRMED',
      checkedInAt: { not: null },
    },
    _count: { _all: true },
  });

  const activeByEvent = new Map(
    counts.map((item) => [item.eventId, item._count._all])
  );

  const checkedInByEvent = new Map(
    checkedIn.map((item) => [item.eventId, item._count._all])
  );

  return new Map(
    eventIds.map((id) => [
      id,
      {
        bookings: activeByEvent.get(id) ?? 0,
        checkedIn: checkedInByEvent.get(id) ?? 0,
      },
    ])
  );
}

function addCounts(event, counts) {
  const count = counts.get(event.id) ?? { bookings: 0, checkedIn: 0 };

  return {
    ...event,
    counts: {
      bookings: count.bookings,
      checkedIn: count.checkedIn,
      seatsLeft: Math.max(0, event.capacity - count.bookings),
    },
  };
}

export async function createOrganizerEvent(organizerId, body) {
  validateBody(body);

  const data = validateEventFields(body);
  validateEventDates(data);

  return prisma.event.create({
    data: {
      ...data,
      organizerId,
      status: 'DRAFT',
    },
  });
}

export async function updateOrganizerEvent(eventId, organizerId, body) {
  validateBody(body);

  const event = await findOwnedEvent(eventId, organizerId);

  const editableFields = Object.keys(body).filter((field) =>
    EVENT_FIELDS.includes(field)
  );

  if (editableFields.length === 0) {
    invalidInput('Provide at least one editable event field.');
  }

  // Lock price, capacity, and dates for published events with bookings.
  if (
    event.status === 'PUBLISHED' &&
    editableFields.some((field) => LOCKED_FIELDS.includes(field)) &&
    (await hasAnyBookings(event.id))
  ) {
    eventEditLocked();
  }

  // Validate fields only after checking the booking lock.
  const data = validateEventFields(body, { partial: true });
  validateEventDates({ ...event, ...data });

  return prisma.event.update({
    where: { id: event.id },
    data,
  });
}

export async function publishOrganizerEvent(eventId, organizerId) {
  const event = await findOwnedEvent(eventId, organizerId);

  if (event.status !== 'DRAFT') {
    throw new HttpError(
      409,
      'EVENT_NOT_PUBLISHABLE',
      'Only draft events can be published.'
    );
  }

  if (event.hiddenAt) {
    throw new HttpError(
      409,
      'EVENT_NOT_PUBLISHABLE',
      'Hidden events cannot be published.'
    );
  }

  const errors = {};
  const now = new Date();

  if (event.startAt <= now) {
    errors.startAt = 'The event start date must be in the future.';
  }

  if (event.endAt <= event.startAt) {
    errors.endAt = 'The event end date must be after the start date.';
  }

  if (event.registrationClosesAt > event.startAt) {
    errors.registrationClosesAt =
      'Registration deadline cannot be after the event starts.';
  }

  if (event.capacity < 1 || event.capacity > 2147483647) {
    errors.capacity =
      'Capacity must be a positive integer within the allowed limit.';
  }

  if (
    !Number.isInteger(event.priceMinor) ||
    event.priceMinor < 0 ||
    event.priceMinor > 2147483647
  ) {
    errors.priceMinor =
      'Price must be a non-negative integer within the allowed limit.';
  }

  if (Object.keys(errors).length > 0) {
    invalidInput(
      'Event cannot be published until its fields are corrected.',
      errors
    );
  }

  return prisma.event.update({
    where: { id: event.id },
    data: { status: 'PUBLISHED' },
  });
}

export async function listOrganizerEvents(organizerId, query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const where = { organizerId };

  const [total, events] = await prisma.$transaction([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: limit,
    }),
  ]);

  const counts = await getEventCounts(events.map((event) => event.id));

  return {
    data: events.map((event) => addCounts(event, counts)),
    pagination: { page, limit, total },
  };
}

export async function getOrganizerEvent(eventId, organizerId) {
  const event = await findOwnedEvent(eventId, organizerId);
  const counts = await getEventCounts([event.id]);

  return addCounts(event, counts);
}

export async function deleteOrganizerEvent(eventId, organizerId) {
  return prisma.$transaction(async (tx) => {
    const event = await findOwnedEvent(eventId, organizerId, tx);

    if (event.status !== 'DRAFT') {
      throw new HttpError(
        409,
        'EVENT_NOT_DELETABLE',
        'Only draft events can be deleted.'
      );
    }

    if (await hasAnyBookings(event.id, tx)) {
      throw new HttpError(
        409,
        'EVENT_HAS_BOOKINGS',
        'An event with bookings cannot be deleted.'
      );
    }

    await tx.event.delete({ where: { id: event.id } });

    return { id: event.id, deleted: true };
  });
}

export async function cancelOrganizerEvent(eventId, organizerId) {
  return prisma.$transaction(async (tx) => {
    const event = await findOwnedEvent(eventId, organizerId, tx);

    if (event.status === 'CANCELLED') {
      return event;
    }

    if (event.status !== 'PUBLISHED') {
      throw new HttpError(
        409,
        'EVENT_NOT_CANCELLABLE',
        'Only published events can be cancelled.'
      );
    }

    const bookingCount = await tx.booking.count({
      where: { eventId: event.id },
    });

    if (event.priceMinor > 0 && bookingCount > 0) {
      throw new HttpError(
        409,
        'PAID_EVENT_HAS_BOOKINGS',
        'A paid event with bookings cannot be cancelled through this endpoint.'
      );
    }

    const now = new Date();

    await tx.booking.updateMany({
      where: {
        eventId: event.id,
        status: { in: ACTIVE_STATUSES },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        ticketCode: null,
      },
    });

    return tx.event.update({
      where: { id: event.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
      },
    });
  });
}

export async function listOrganizerAttendees(eventId, organizerId, query = {}) {
  const event = await findOwnedEvent(eventId, organizerId);
  const { page, limit, skip } = parsePagination(query);

  const search =
    query.search === undefined
      ? ''
      : typeof query.search === 'string'
        ? query.search.trim()
        : null;

  if (search === null || search.length > 100) {
    throw new HttpError(
      400,
      'INVALID_QUERY',
      'Search must be a string of at most 100 characters.'
    );
  }

  const where = {
    eventId: event.id,
    status: 'CONFIRMED',
    ...(search
      ? {
          user: {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        }
      : {}),
  };

  const [total, bookings] = await prisma.$transaction([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      select: {
        id: true,
        checkedInAt: true,
        user: {
          select: { name: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: limit,
    }),
  ]);

  return {
    data: bookings.map((booking) => ({
      name: booking.user.name,
      bookingId: booking.id,
      checkedInAt: booking.checkedInAt,
    })),
    pagination: { page, limit, total },
  };
}

export async function checkInOrganizerTicket(eventId, organizerId, body) {
  validateEventId(eventId);
  validateBody(body);

  const ticketCode =
    typeof body.ticketCode === 'string' ? body.ticketCode.trim() : '';

  if (ticketCode === '' || ticketCode.length > 64) {
    invalidInput('Please provide a valid ticket code.', {
      ticketCode: 'Must be a non-empty string of at most 64 characters.',
    });
  }

  return prisma.$transaction(async (tx) => {
    const lockedEvents = await tx.$queryRaw`
      SELECT "id"
      FROM "Event"
      WHERE "id" = ${eventId}::uuid
      FOR UPDATE
    `;

    if (lockedEvents.length === 0) {
      throw new HttpError(
        404,
        'EVENT_UNAVAILABLE',
        'Event not found or unavailable.'
      );
    }

    const event = await tx.event.findFirst({
      where: { id: eventId, organizerId },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        hiddenAt: true,
      },
    });

    if (!event) {
      throw new HttpError(
        404,
        'EVENT_UNAVAILABLE',
        'Event not found or unavailable.'
      );
    }

    const lockedBookings = await tx.$queryRaw`
      SELECT "id"
      FROM "Booking"
      WHERE "ticketCode" = ${ticketCode}
        AND "eventId" = ${eventId}::uuid
      FOR UPDATE
    `;

    if (lockedBookings.length === 0) {
      throw new HttpError(
        404,
        'TICKET_NOT_FOUND',
        'Ticket not found for this event.'
      );
    }

    const booking = await tx.booking.findFirst({
      where: { ticketCode, eventId },
      select: { id: true, status: true, checkedInAt: true },
    });

    if (!booking) {
      throw new HttpError(
        404,
        'TICKET_NOT_FOUND',
        'Ticket not found for this event.'
      );
    }

    if (booking.status !== 'CONFIRMED') {
      throw new HttpError(
        409,
        'TICKET_NOT_CONFIRMED',
        'Only confirmed tickets can be checked in.'
      );
    }

    if (booking.checkedInAt) {
      return {
        checkedInAt: booking.checkedInAt,
        alreadyCheckedIn: true,
      };
    }

    if (event.status === 'CANCELLED') {
      throw new HttpError(
        409,
        'EVENT_UNAVAILABLE',
        'This event has been cancelled.'
      );
    }

    if (event.status !== 'PUBLISHED' || event.hiddenAt) {
      throw new HttpError(
        404,
        'EVENT_UNAVAILABLE',
        'Event not found or unavailable.'
      );
    }

    const now = new Date();
    const checkInOpensAt = new Date(event.startAt.getTime() - 60 * 60 * 1000);

    if (now < checkInOpensAt || now > event.endAt) {
      throw new HttpError(
        409,
        'CHECK_IN_CLOSED',
        'Check-in is available from one hour before the event until it ends.'
      );
    }

    const checkedInAt = now;

    await tx.booking.update({
      where: { id: booking.id },
      data: { checkedInAt },
    });

    return { checkedInAt, alreadyCheckedIn: false };
  });
}
