import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSafeRedirectDestination } from '../src/auth/redirectUtils.js';

test('preserves a valid event path with query and hash', () => {
  const destination = '/events/summer-festival?category=music&page=2#tickets';

  assert.equal(getSafeRedirectDestination(undefined, destination), destination);
});

test('uses a valid from candidate ahead of a valid next candidate', () => {
  assert.equal(
    getSafeRedirectDestination('/bookings/123', '/events/summer-festival'),
    '/bookings/123'
  );
});

test('uses a valid next candidate when from is invalid', () => {
  assert.equal(
    getSafeRedirectDestination('https://attacker.example', '/events/123'),
    '/events/123'
  );
});

test('falls back to the root when both candidates are invalid', () => {
  assert.equal(
    getSafeRedirectDestination('//attacker.example', 'events/123'),
    '/'
  );
});

test('rejects absolute external and protocol-relative URLs', () => {
  for (const candidate of [
    'https://attacker.example/events',
    'http://attacker.example/events',
    '//attacker.example/events',
  ]) {
    assert.equal(
      getSafeRedirectDestination(candidate, undefined),
      '/',
      candidate
    );
  }
});

test('rejects raw and encoded backslashes', () => {
  for (const candidate of ['/events\\123', '/events%5c123', '/events%5C123']) {
    assert.equal(
      getSafeRedirectDestination(candidate, undefined),
      '/',
      candidate
    );
  }
});

test('rejects malformed percent encodings', () => {
  for (const candidate of ['/events/%', '/events/%GG', '/events/%FF']) {
    assert.equal(
      getSafeRedirectDestination(candidate, undefined),
      '/',
      candidate
    );
  }
});

test('rejects control characters and malformed paths', () => {
  for (const candidate of [
    '/events/\n123',
    '/events/%0A123',
    'events/123',
    '',
    null,
    '///attacker.example',
  ]) {
    assert.equal(
      getSafeRedirectDestination(candidate, undefined),
      '/',
      String(candidate)
    );
  }
});
