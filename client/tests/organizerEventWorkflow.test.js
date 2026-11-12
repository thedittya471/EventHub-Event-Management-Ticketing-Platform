import test from 'node:test';
import assert from 'node:assert/strict';
import { saveOrganizerEvent } from '../src/lib/organizerEventWorkflow.js';

test('preserves draft when publishing fails', async () => {
  const navigations = [];

  const api = async (url) => {
    if (url === '/organizer/events') {
      return { data: { id: 'draft-123' } };
    }

    if (url.endsWith('/publish')) {
      throw new Error('Publishing temporarily unavailable.');
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  await assert.rejects(
    saveOrganizerEvent({
      api,
      payload: { title: 'Test event' },
      publish: true,
      navigate: (...args) => navigations.push(args),
    }),
    (error) => {
      assert.equal(error.workflowStage, 'publish');
      assert.equal(error.eventId, 'draft-123');
      return true;
    }
  );

  assert.equal(navigations.length, 1);
  assert.equal(navigations[0][0], '/organizer/events/draft-123/edit');
});

test('retry updates the existing draft and publishes it', async () => {
  const requests = [];
  const navigations = [];

  const api = async (url, options) => {
    requests.push({ url, method: options.method });

    if (url === '/organizer/events/draft-123') {
      return { data: { id: 'draft-123' } };
    }

    if (url.endsWith('/publish')) {
      return { data: { id: 'draft-123', status: 'PUBLISHED' } };
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await saveOrganizerEvent({
    api,
    eventId: 'draft-123',
    payload: { title: 'Updated event' },
    publish: true,
    navigate: (...args) => navigations.push(args),
  });

  assert.equal(result.id, 'draft-123');

  assert.deepEqual(requests, [
    {
      url: '/organizer/events/draft-123',
      method: 'PATCH',
    },
    {
      url: '/organizer/events/draft-123/publish',
      method: 'POST',
    },
  ]);

  assert.equal(navigations.length, 1);
  assert.equal(navigations[0][0], '/organizer/events/draft-123');
});

test('does not navigate when saving fails', async () => {
  const navigations = [];

  const api = async () => {
    throw new Error('Save failed.');
  };

  await assert.rejects(
    saveOrganizerEvent({
      api,
      payload: {},
      publish: false,
      navigate: (...args) => navigations.push(args),
    }),
    (error) => {
      assert.equal(error.workflowStage, 'save');
      assert.equal(error.message, 'Save failed.');
      return true;
    }
  );

  assert.equal(navigations.length, 0);
});

test('navigates to event details after successful publishing', async () => {
  const navigations = [];

  const api = async (url) => {
    if (url === '/organizer/events') {
      return { data: { id: 'event-456' } };
    }

    if (url.endsWith('/publish')) {
      return { data: { id: 'event-456' } };
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  await saveOrganizerEvent({
    api,
    payload: {},
    publish: true,
    navigate: (...args) => navigations.push(args),
  });

  assert.equal(navigations.length, 2);
  assert.equal(navigations[0][0], '/organizer/events/event-456/edit');
  assert.equal(navigations[1][0], '/organizer/events/event-456');
});
