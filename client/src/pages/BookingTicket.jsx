import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../lib/api.js';
import {
  Alert,
  BookingPageFrame,
  ErrorMessage,
  LoadingState,
  Panel,
} from './BookingUI.jsx';
import {
  formatEventDate,
  getEventDetails,
  primaryButtonClass,
} from './bookingUtils.js';

function BookingTicket() {
  const { bookingId } = useParams();

  const [booking, setBooking] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function fetchTicket() {
      try {
        const bookingResponse = await api(
          `/bookings/${encodeURIComponent(bookingId)}`
        );

        if (active) {
          setBooking(bookingResponse.data);
        }

        const ticketResponse = await api(
          `/bookings/${encodeURIComponent(bookingId)}/ticket`
        );

        const ticketData = ticketResponse.data;

        if (
          bookingResponse.data.status !== 'CONFIRMED' ||
          ticketData?.status !== 'CONFIRMED' ||
          typeof ticketData?.ticketCode !== 'string' ||
          ticketData.ticketCode.length === 0
        ) {
          const ticketError = new Error(
            'A valid ticket is not available for this booking.'
          );
          ticketError.status = 409;
          ticketError.code = 'BOOKING_NOT_CONFIRMED';
          throw ticketError;
        }

        if (active) {
          setTicket(ticketData);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchTicket();

    return () => {
      active = false;
    };
  }, [bookingId, retry]);

  function retryTicket() {
    setLoading(true);
    setError(null);
    setTicket(null);
    setCopyMessage('');
    setRetry((value) => value + 1);
  }

  async function copyTicketCode() {
    if (!ticket?.ticketCode) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ticket.ticketCode);
        setCopyMessage('Ticket code copied successfully.');
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      // Fallback: select the code so the user can copy it manually.
      const codeElement = document.getElementById('ticket-code');

      if (codeElement) {
        const selection = window.getSelection();
        const range = document.createRange();

        range.selectNodeContents(codeElement);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      setCopyMessage(
        'Automatic copying is unavailable. Your ticket code is selected; copy it manually.'
      );
    }
  }

  if (loading) {
    return (
      <BookingPageFrame title="Your ticket">
        <Panel>
          <LoadingState label="Checking ticket availability…" />
        </Panel>
      </BookingPageFrame>
    );
  }

  const event = ticket?.event ?? getEventDetails(booking);
  const attendeeName = ticket?.attendee?.name || 'Attendee';
  const ticketCode = ticket?.ticketCode || '';

  const ticketAvailable =
    !error &&
    booking?.status === 'CONFIRMED' &&
    ticket?.status === 'CONFIRMED' &&
    ticketCode.length > 0;

  return (
    <BookingPageFrame
      subtitle="Keep your ticket code ready for event check-in."
      title="Your ticket"
    >
      <div className="space-y-5">
        {error ? (
          <div className="space-y-4">
            {error.status === 409 ? (
              <Alert tone="info">
                This booking does not currently have an available ticket.
                Tickets are available only after successful confirmation. If you
                recently completed payment, check your booking status again.
              </Alert>
            ) : (
              <ErrorMessage error={error} />
            )}

            {error.status !== 401 && error.status !== 404 && (
              <button
                className={primaryButtonClass}
                onClick={retryTicket}
                type="button"
              >
                Check again
              </button>
            )}
          </div>
        ) : ticketAvailable ? (
          <Panel className="ticket-print mx-auto max-w-2xl border-purple-500/30 bg-gradient-to-br from-gray-950 via-gray-950 to-purple-950/30">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-800 pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">
                  EventHub admission
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  {event?.title ?? 'Event'}
                </h2>
              </div>

              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                Confirmed
              </span>
            </div>

            <div className="border-b border-gray-800 py-5">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Attendee
              </p>

              <p className="mt-1 text-lg font-semibold text-white">
                {attendeeName}
              </p>
            </div>

            <dl className="grid gap-5 py-5 sm:grid-cols-2">
              <TicketDetail
                label="Start date and time"
                value={formatEventDate(event?.startAt, event?.timezone)}
              />

              <TicketDetail
                label="End date and time"
                value={formatEventDate(event?.endAt, event?.timezone)}
              />

              <TicketDetail
                label="Venue"
                value={event?.venue ?? 'Not available'}
              />

              <TicketDetail
                label="City"
                value={event?.city ?? 'Not available'}
              />

              <TicketDetail
                label="Timezone"
                value={event?.timezone ?? 'Not available'}
              />

              <TicketDetail
                label="Check-in status"
                value={
                  booking?.checkedInAt
                    ? `Checked in · ${formatEventDate(
                        booking.checkedInAt,
                        event?.timezone
                      )}`
                    : 'Not checked in'
                }
              />

              <TicketDetail label="Booking ID" value={ticket.bookingId} />
            </dl>

            <div className="rounded-xl border border-purple-400/20 bg-black/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Ticket code
              </p>

              <p
                id="ticket-code"
                className="mt-2 select-all break-all font-mono text-lg font-semibold tracking-wide text-purple-200"
              >
                {ticketCode}
              </p>

              <button
                className="print:hidden mt-4 inline-flex min-h-10 items-center rounded-lg border border-purple-400/40 px-4 py-2 text-sm font-semibold text-purple-200 hover:bg-purple-500/10"
                onClick={copyTicketCode}
                type="button"
              >
                Copy ticket code
              </button>

              {copyMessage && (
                <p
                  aria-live="polite"
                  className="print:hidden mt-3 text-sm text-gray-300"
                >
                  {copyMessage}
                </p>
              )}
            </div>

            <p className="mt-5 text-xs text-gray-500">
              Please present this ticket code at the event entrance.
            </p>
          </Panel>
        ) : null}

        <div className="flex flex-wrap gap-3 print:hidden">
          {ticketAvailable && (
            <button
              className={primaryButtonClass}
              onClick={() => window.print()}
              type="button"
            >
              Print ticket
            </button>
          )}

          {booking && (
            <Link
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-200 hover:border-purple-500/60"
              to={`/bookings/${encodeURIComponent(booking.id)}`}
            >
              Booking details
            </Link>
          )}

          <Link
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-200 hover:border-purple-500/60"
            to="/my-bookings"
          >
            My bookings
          </Link>
        </div>
      </div>
    </BookingPageFrame>
  );
}

function TicketDetail({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>

      <dd className="mt-1 break-words text-sm text-gray-100">{value}</dd>
    </div>
  );
}

export default BookingTicket;
