import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { CalendarDays, MapPin, Ticket, Users, ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { api } from '../lib/api.js';

function getBookingErrorMessage(error) {
  if (error?.status === 401 || error?.code === 'UNAUTHENTICATED') {
    return 'Your session has expired. Sign in again to continue booking.';
  }

  if (error?.status === 403 || error?.code === 'FORBIDDEN') {
    return 'You do not have permission to book this event.';
  }

  if (error?.code === 'EVENT_SOLD_OUT') {
    return 'This event is sold out.';
  }

  if (error?.code === 'REGISTRATION_CLOSED') {
    return 'Registration for this event is closed.';
  }

  if (error?.code === 'EVENT_UNAVAILABLE') {
    return 'This event is no longer available for booking.';
  }

  if (error?.code === 'PAYMENT_REQUIRED') {
    return 'This event requires payment. Refresh the page and try again.';
  }

  if (error?.code === 'PAYMENT_NOT_REQUIRED') {
    return 'This event no longer requires payment. Refresh the page and try again.';
  }

  if (error?.code === 'PAYMENT_HOLD_EXPIRED') {
    return 'Your payment hold expired. Please try booking the event again.';
  }

  if (error?.code === 'BOOKING_NOT_PAYABLE') {
    return 'This booking is no longer awaiting payment. View its booking details for the latest status.';
  }

  if (
    error?.code === 'BOOKING_NOT_FOUND' ||
    error?.code === 'PAYMENT_NOT_FOUND'
  ) {
    return 'We could not find this booking or its payment. Please try booking again.';
  }

  if (error?.status >= 500) {
    return 'We could not complete your booking right now. Please try again.';
  }

  return 'We could not complete your booking. Please try again.';
}

function formatDate(value) {
  if (!value) return 'To be announced';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'To be announced';

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

function formatPrice(event) {
  const amount = Number(event.priceMinor ?? 0) / 100;
  const currency = event.currency || 'INR';

  if (amount === 0) return 'Free';

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function EventDetails() {
  const { eventId } = useParams();
  const { isAuthenticated, loading: authLoading, setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingRequiresSignIn, setBookingRequiresSignIn] = useState(false);
  const bookingLock = useRef(false);
  const eventUrl = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      setLoading(true);
      setError('');
      setEvent(null);

      try {
        const result = await api(`/events/${encodeURIComponent(eventId)}`);
        if (!cancelled) setEvent(result.data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err.status === 404
              ? 'This event could not be found or is no longer available.'
              : err.message || 'Unable to load event details.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEvent();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function handleBooking() {
    if (bookingLock.current || bookingLoading || authLoading) return;

    if (!isAuthenticated) {
      navigate('/login', { state: { from: eventUrl } });
      return;
    }

    bookingLock.current = true;
    setBookingLoading(true);
    setBookingError('');
    setBookingRequiresSignIn(false);

    try {
      if (Number(event.priceMinor ?? 0) > 0) {
        const bookingResponse = await api(
          `/events/${encodeURIComponent(eventId)}/bookings/paid`,
          { method: 'POST' }
        );
        const booking = bookingResponse.data?.booking;
        const alreadyBooked = bookingResponse.created === false;

        if (!booking?.id) {
          throw new Error('The booking response did not include a booking ID.');
        }

        if (booking.status !== 'PENDING_PAYMENT') {
          navigate(`/bookings/${encodeURIComponent(booking.id)}`, {
            state: alreadyBooked
              ? { notice: 'You already have an active booking for this event.' }
              : undefined,
          });
          return;
        }

        const checkoutResponse = await api(
          `/bookings/${encodeURIComponent(booking.id)}/checkout`,
          { method: 'POST' }
        );
        const checkoutId = checkoutResponse.data?.checkout?.id;

        if (!checkoutId) {
          throw new Error(
            'The checkout response did not include a checkout ID.'
          );
        }

        navigate(
          `/checkout/test/${encodeURIComponent(checkoutId)}?bookingId=${encodeURIComponent(booking.id)}`,
          {
            state: alreadyBooked
              ? {
                  notice:
                    'You already have an active booking. Continue its checkout below.',
                }
              : undefined,
          }
        );
        return;
      }

      const bookingResponse = await api(
        `/events/${encodeURIComponent(eventId)}/bookings`,
        { method: 'POST' }
      );
      const booking = bookingResponse.data ?? bookingResponse.ticket;

      if (!booking?.id) {
        throw new Error('The booking response did not include a booking ID.');
      }

      navigate(`/bookings/${encodeURIComponent(booking.id)}`, {
        state:
          bookingResponse.created === false
            ? { notice: 'You already have an active booking for this event.' }
            : undefined,
      });
    } catch (requestError) {
      if (
        requestError?.status === 401 ||
        requestError?.code === 'UNAUTHENTICATED'
      ) {
        setUser(null);
        setBookingRequiresSignIn(true);
      }
      setBookingError(getBookingErrorMessage(requestError));
    } finally {
      bookingLock.current = false;
      setBookingLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black px-4 py-20 text-white">
        <div role="status" className="mx-auto max-w-4xl animate-pulse">
          <div className="h-8 w-2/3 rounded bg-gray-800" />
          <div className="mt-6 h-48 rounded-2xl bg-gray-900 sm:h-72" />
          <div className="mt-6 h-5 w-1/2 rounded bg-gray-800" />
          <span className="sr-only">Loading event details...</span>
        </div>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="max-w-lg rounded-2xl border border-gray-800 bg-gray-950 p-8 text-center">
          <Ticket className="mx-auto h-10 w-10 text-purple-400" />
          <h1 className="mt-4 text-2xl font-bold">Event unavailable</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-gray-400">
            {error || 'We could not find this event.'}
          </p>
          <Link
            to="/events"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold hover:bg-purple-500"
          >
            <ArrowLeft className="h-4 w-4" /> Browse events
          </Link>
        </div>
      </main>
    );
  }

  const available = Number(event.availability);
  const hasAvailability = Number.isFinite(available) && available > 0;
  const soldOut = Number.isFinite(available) && available <= 0;

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-gray-800 bg-gradient-to-br from-purple-950/70 via-black to-black">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <Link
            to="/events"
            className="inline-flex items-center gap-2 text-sm text-purple-300 hover:text-purple-200"
          >
            <ArrowLeft className="h-4 w-4" /> All events
          </Link>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-300">
              {event.category || 'Event'}
            </span>
            {event.status && (
              <span className="text-xs capitalize text-gray-400">
                {String(event.status).toLowerCase()}
              </span>
            )}
          </div>

          <h1 className="mt-4 max-w-4xl text-3xl font-extrabold tracking-tight sm:text-5xl">
            {event.title}
          </h1>

          <p className="mt-4 flex items-center gap-2 text-sm text-gray-300 sm:text-base">
            <MapPin className="h-5 w-5 shrink-0 text-purple-400" />
            {[event.venue, event.address, event.city]
              .filter(Boolean)
              .join(', ') || 'Location to be announced'}
          </p>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px] lg:py-12">
        <div>
          <div className="flex min-h-52 items-center justify-center rounded-2xl border border-gray-800 bg-gradient-to-br from-purple-950 via-gray-900 to-indigo-950 sm:min-h-72">
            <Ticket className="h-16 w-16 text-purple-300/70" />
          </div>

          <section className="mt-8">
            <h2 className="text-xl font-bold">About this event</h2>
            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-gray-300 sm:text-base">
              {event.description ||
                'More information about this event will be available soon.'}
            </p>
          </section>

          <section className="mt-8 rounded-2xl border border-gray-800 bg-gray-950 p-5 sm:p-6">
            <h2 className="text-lg font-bold">Event information</h2>
            <div className="mt-5 space-y-5">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-purple-400" />
                <div>
                  <p className="text-sm font-medium">Start</p>
                  <p className="mt-1 text-sm text-gray-400">
                    {formatDate(event.startAt)}
                  </p>
                </div>
              </div>

              {event.endAt && (
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-purple-400" />
                  <div>
                    <p className="text-sm font-medium">End</p>
                    <p className="mt-1 text-sm text-gray-400">
                      {formatDate(event.endAt)}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-purple-400" />
                <div>
                  <p className="text-sm font-medium">Venue</p>
                  <p className="mt-1 text-sm text-gray-400">
                    {[event.venue, event.address, event.city]
                      .filter(Boolean)
                      .join(', ') || 'To be announced'}
                  </p>
                </div>
              </div>

              {event.organizer?.name && (
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-5 w-5 shrink-0 text-purple-400" />
                  <div>
                    <p className="text-sm font-medium">Organizer</p>
                    <p className="mt-1 text-sm text-gray-400">
                      {event.organizer.name}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside>
          <div className="sticky top-6 rounded-2xl border border-gray-800 bg-gray-950 p-5 sm:p-6">
            <p className="text-sm text-gray-400">Ticket price</p>
            <p className="mt-2 text-3xl font-extrabold">{formatPrice(event)}</p>

            <div className="mt-5 border-t border-gray-800 pt-5">
              <p className="text-sm text-gray-300">
                {Number.isFinite(available)
                  ? available > 0
                    ? `${available} places available`
                    : 'No places currently available'
                  : 'Availability subject to confirmation'}
              </p>

              <p className="mt-2 text-xs leading-5 text-gray-500">
                {event.registrationClosesAt
                  ? `Registration closes ${formatDate(event.registrationClosesAt)}`
                  : 'Check event details before booking.'}
              </p>
            </div>

            {hasAvailability ? (
              <button
                type="button"
                onClick={handleBooking}
                disabled={bookingLoading || authLoading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 font-semibold hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bookingLoading
                  ? 'Processing booking...'
                  : authLoading
                    ? 'Checking sign-in...'
                    : 'Continue to book'}{' '}
                {!bookingLoading && <Ticket className="h-4 w-4" />}
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="mt-6 w-full cursor-not-allowed rounded-xl bg-gray-800 px-4 py-3 font-semibold text-gray-500"
              >
                {soldOut ? 'Sold out' : 'Unavailable'}
              </button>
            )}

            {soldOut && (
              <p role="alert" className="mt-3 text-center text-sm text-red-300">
                This event is sold out.
              </p>
            )}
            {bookingError && (
              <p role="alert" className="mt-3 text-sm leading-5 text-red-300">
                {bookingError}{' '}
                {bookingRequiresSignIn && (
                  <Link
                    className="font-semibold underline underline-offset-2"
                    to="/login"
                    state={{ from: eventUrl }}
                  >
                    Sign in
                  </Link>
                )}
              </p>
            )}

            <p className="mt-3 text-center text-xs leading-5 text-gray-500">
              Booking and payment availability are confirmed in the next step.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
