import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const PUBLIC_EVENT_FIELDS = [
  'id',
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
  'status',
  'createdAt',
  'organizer',
  'availability',
];
const PRIVATE_EVENT_FIELDS = [
  'organizerId',
  'hiddenAt',
  'passwordHash',
  'email',
  'role',
  'ticketCode',
  'payment',
  'payments',
  'providerPaymentId',
];
const PRIVATE_ORGANIZER_FIELDS = ['email', 'passwordHash', 'role', 'createdAt'];

function assertPublicEvent(event) {
  for (const field of PUBLIC_EVENT_FIELDS) {
    assert.ok(
      Object.hasOwn(event, field),
      `expected public event field ${field}`
    );
  }
  for (const field of PRIVATE_EVENT_FIELDS) {
    assert.equal(
      Object.hasOwn(event, field),
      false,
      `private event field ${field} must not be public`
    );
  }

  assert.ok(event.organizer);
  assert.equal(typeof event.organizer.id, 'string');
  assert.equal(typeof event.organizer.name, 'string');
  for (const field of PRIVATE_ORGANIZER_FIELDS) {
    assert.equal(
      Object.hasOwn(event.organizer, field),
      false,
      `private organizer field ${field} must not be public`
    );
  }
}

test(
  'public catalog includes the entire selected end date',
  {
    skip:
      !process.env.DATABASE_URL &&
      'DATABASE_URL is required for integration tests.',
  },
  async (t) => {
    const [{ listPublicEvents }, { prisma }] = await Promise.all([
      import('../src/services/event.service.js'),
      import('../src/db.js'),
    ]);
    let organizerId;

    t.after(async () => {
      const cleanupErrors = [];
      const cleanup = async (operation) => {
        try {
          await operation();
        } catch (error) {
          cleanupErrors.push(error);
        }
      };

      if (organizerId) {
        await cleanup(() =>
          prisma.event.deleteMany({ where: { organizerId } })
        );
        await cleanup(() =>
          prisma.user.deleteMany({ where: { id: organizerId } })
        );
      }
      await cleanup(() => prisma.$disconnect());

      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Catalog test cleanup failed.');
      }
    });

    await prisma.$connect();
    const organizer = await prisma.user.create({
      data: {
        name: 'Catalog Test Organizer',
        email: `catalog-test-${randomUUID()}@example.test`,
        passwordHash: 'not-used',
        role: 'ORGANIZER',
      },
    });
    organizerId = organizer.id;

    const startTimes = [
      '2027-04-15T00:00:00.000Z',
      '2027-04-15T23:59:59.999Z',
      '2027-04-16T00:00:00.000Z',
    ];
    const events = await Promise.all(
      startTimes.map((startTime) => {
        const startAt = new Date(startTime);
        return prisma.event.create({
          data: {
            organizerId: organizer.id,
            title: `Inclusive catalog test ${randomUUID()}`,
            description: 'Catalog date-boundary integration test.',
            category: 'Test',
            venue: 'Test venue',
            address: 'Test address',
            city: 'Test city',
            timezone: 'UTC',
            startAt,
            endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
            registrationClosesAt: startAt,
            capacity: 10,
            priceMinor: 0,
            currency: 'INR',
            status: 'PUBLISHED',
            hiddenAt: null,
          },
        });
      })
    );

    const result = await listPublicEvents({
      q: 'Inclusive catalog test',
      to: '2027-04-15',
      limit: '12',
      page: '1',
    });

    assert.ok(result.data.some((event) => event.id === events[0].id));
    assert.ok(result.data.some((event) => event.id === events[1].id));
    assert.ok(!result.data.some((event) => event.id === events[2].id));
    assert.equal(result.pagination.total, 2);
  }
);

test('public catalog rejects invalid date filters', async () => {
  const { listPublicEvents } = await import('../src/services/event.service.js');

  await assert.rejects(
    listPublicEvents({ to: '2027-02-31' }),
    (error) => error.status === 400 && error.code === 'INVALID_QUERY'
  );
  await assert.rejects(
    listPublicEvents({ from: 'not-a-date' }),
    (error) => error.status === 400 && error.code === 'INVALID_QUERY'
  );
});

test(
  'public event listing exposes public fields without internal data',
  {
    skip:
      !process.env.DATABASE_URL &&
      'DATABASE_URL is required for integration tests.',
  },
  async (t) => {
    const [{ listPublicEvents }, fixtures] = await Promise.all([
      import('../src/services/event.service.js'),
      createCatalogFixtures(t, 'Public Event Listing'),
    ]);
    const { createEvent } = fixtures;
    const event = await createEvent({
      title: `Public Event Listing ${randomUUID()}`,
    });

    const result = await listPublicEvents({
      q: event.title,
      limit: '12',
      page: '1',
    });
    const publicEvent = result.data.find((item) => item.id === event.id);

    assert.ok(publicEvent);
    assertPublicEvent(publicEvent);
  }
);

test(
  'public event detail exposes public fields without internal data',
  {
    skip:
      !process.env.DATABASE_URL &&
      'DATABASE_URL is required for integration tests.',
  },
  async (t) => {
    const [{ getPublicEvent }, fixtures] = await Promise.all([
      import('../src/services/event.service.js'),
      createCatalogFixtures(t, 'Public Event Detail'),
    ]);
    const { createEvent } = fixtures;
    const event = await createEvent({
      title: `Public Event Detail ${randomUUID()}`,
    });

    const publicEvent = await getPublicEvent(event.id);

    assertPublicEvent(publicEvent);
  }
);

async function createCatalogFixtures(t, name) {
  const { prisma } = await import('../src/db.js');
  let organizerId;
  let eventNumber = 0;

  t.after(async () => {
    const cleanupErrors = [];
    const cleanup = async (operation) => {
      try {
        await operation();
      } catch (error) {
        cleanupErrors.push(error);
      }
    };

    if (organizerId) {
      await cleanup(() => prisma.event.deleteMany({ where: { organizerId } }));
      await cleanup(() =>
        prisma.user.deleteMany({ where: { id: organizerId } })
      );
    }
    await cleanup(() => prisma.$disconnect());

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Catalog test cleanup failed.');
    }
  });

  await prisma.$connect();
  const organizer = await prisma.user.create({
    data: {
      name: `${name} Organizer`,
      email: `${name.toLowerCase()}-${randomUUID()}@example.test`,
      passwordHash: 'not-used',
      role: 'ORGANIZER',
    },
  });
  organizerId = organizer.id;

  async function createEvent(overrides = {}) {
    const startAt =
      overrides.startAt ??
      new Date(Date.now() + (14 + eventNumber++) * 86400000);
    return prisma.event.create({
      data: {
        organizerId: organizer.id,
        title: `${name} ${randomUUID()}`,
        description: 'Catalog integration test event.',
        category: 'Test',
        venue: 'Test venue',
        address: 'Test address',
        city: 'Test city',
        timezone: 'UTC',
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
        registrationClosesAt: startAt,
        capacity: 10,
        priceMinor: 0,
        currency: 'INR',
        status: 'PUBLISHED',
        hiddenAt: null,
        ...overrides,
      },
    });
  }

  return { prisma, organizer, createEvent };
}

test(
  'public catalog applies combined search and event filters',
  {
    skip:
      !process.env.DATABASE_URL &&
      'DATABASE_URL is required for integration tests.',
  },
  async (t) => {
    const [{ listPublicEvents }, fixtures] = await Promise.all([
      import('../src/services/event.service.js'),
      createCatalogFixtures(t, 'Combined Catalog'),
    ]);
    const { createEvent } = fixtures;

    const matchingEvent = await createEvent({
      title: `Advanced Catalog ${randomUUID()}`,
      category: 'Technology',
      city: 'Pune',
      priceMinor: 0,
    });
    await createEvent({
      title: `Different catalog title ${randomUUID()}`,
      category: 'Technology',
      city: 'Pune',
      priceMinor: 0,
    });
    await createEvent({
      title: `Advanced Catalog ${randomUUID()}`,
      category: 'Arts',
      city: 'Pune',
      priceMinor: 0,
    });
    await createEvent({
      title: `Advanced Catalog ${randomUUID()}`,
      category: 'Technology',
      city: 'Mumbai',
      priceMinor: 0,
    });
    await createEvent({
      title: `Advanced Catalog ${randomUUID()}`,
      category: 'Technology',
      city: 'Pune',
      priceMinor: 500,
    });

    const result = await listPublicEvents({
      q: 'Advanced Catalog',
      category: 'Technology',
      city: 'Pune',
      pricing: 'free',
    });

    assert.deepEqual(
      result.data.map((event) => event.id),
      [matchingEvent.id]
    );
    assert.equal(result.pagination.total, 1);
  }
);

test(
  'public catalog paginates matching events without duplicates',
  {
    skip:
      !process.env.DATABASE_URL &&
      'DATABASE_URL is required for integration tests.',
  },
  async (t) => {
    const [{ listPublicEvents }, fixtures] = await Promise.all([
      import('../src/services/event.service.js'),
      createCatalogFixtures(t, 'Catalog Pagination'),
    ]);
    const { createEvent } = fixtures;

    await Promise.all([
      createEvent({ title: `Catalog Pagination ${randomUUID()}` }),
      createEvent({ title: `Catalog Pagination ${randomUUID()}` }),
      createEvent({ title: `Catalog Pagination ${randomUUID()}` }),
    ]);

    const [pageOne, pageTwo] = await Promise.all([
      listPublicEvents({
        q: 'Catalog Pagination',
        limit: '2',
        page: '1',
      }),
      listPublicEvents({
        q: 'Catalog Pagination',
        limit: '2',
        page: '2',
      }),
    ]);
    const pageOneIds = pageOne.data.map((event) => event.id);
    const pageTwoIds = pageTwo.data.map((event) => event.id);

    assert.equal(pageOne.data.length, 2);
    assert.equal(pageTwo.data.length, 1);
    assert.equal(pageOne.pagination.total, 3);
    assert.equal(pageTwo.pagination.total, 3);
    assert.equal(
      new Set([...pageOneIds, ...pageTwoIds]).size,
      pageOneIds.length + pageTwoIds.length
    );
  }
);
