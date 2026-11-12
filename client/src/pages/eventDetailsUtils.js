function toValidDate(value) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value !== 'string' &&
      typeof value !== 'number' &&
      !(value instanceof Date))
  ) {
    return null;
  }

  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isEventFree(event) {
  return Number.isFinite(event?.priceMinor) && event.priceMinor === 0;
}

export function isEventPaid(event) {
  return Number.isFinite(event?.priceMinor) && event.priceMinor > 0;
}

export function isEventCancelled(event) {
  return event?.status === 'CANCELLED';
}

export function isEventSoldOut(event) {
  return Number.isFinite(event?.availability) && event.availability <= 0;
}

export function isRegistrationClosed(event, now = new Date()) {
  const currentTime = toValidDate(now);
  if (!currentTime) return false;

  return ['registrationClosesAt', 'startAt'].some((field) => {
    const deadline = toValidDate(event?.[field]);
    return deadline !== null && deadline.getTime() <= currentTime.getTime();
  });
}

export function getBookingState(event, now = new Date()) {
  // Booking endpoints remain authoritative; this state is presentation-only.
  if (isEventCancelled(event)) {
    return { status: 'cancelled', canBook: false };
  }

  if (isRegistrationClosed(event, now)) {
    return { status: 'registration_closed', canBook: false };
  }

  if (isEventSoldOut(event)) {
    return { status: 'sold_out', canBook: false };
  }

  if (event?.status && event.status !== 'PUBLISHED') {
    return { status: 'unavailable', canBook: false };
  }

  if (!isEventFree(event) && !isEventPaid(event)) {
    return { status: 'unavailable', canBook: false };
  }

  if (Number.isFinite(event?.availability) && event.availability > 0) {
    return { status: 'available', canBook: true };
  }

  return { status: 'unavailable', canBook: false };
}

export function formatEventDateTime(value, timezone) {
  const date = toValidDate(value);
  if (!date) return 'Date unavailable';

  const options = {
    dateStyle: 'full',
    timeStyle: 'short',
  };

  try {
    return new Intl.DateTimeFormat('en-IN', {
      ...options,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-IN', options).format(date);
  }
}
