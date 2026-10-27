import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { api } from '../lib/api.js';
import {
  Alert,
  BookingPageFrame,
  ErrorMessage,
  LoadingState,
  Panel,
  StatusBadge,
} from './BookingUI.jsx';
import {
  formatEventDate,
  formatMoney,
  getEventDetails,
  paymentStateLabel,
  primaryButtonClass,
  secondaryButtonClass,
} from './bookingUtils.js';

function BookingDetails() {
  const { bookingId } = useParams();
  const location = useLocation();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice ?? null);
  const [busyAction, setBusyAction] = useState('');
  const [checkout, setCheckout] = useState(null);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadBooking() {
      try {
        const response = await api(
          `/bookings/${encodeURIComponent(bookingId)}`
        );
        if (!active) return;
        setBooking(response.data);
        setCheckout(null);

        if (
          response.data.status === 'CONFIRMED' &&
          response.data.amountMinor > 0
        ) {
          try {
            const reconciliation = await api(
              `/bookings/${encodeURIComponent(bookingId)}/reconcile`,
              { method: 'POST' }
            );
            if (!active) return;
            setBooking(reconciliation.data.booking);
            setPaymentVerified(
              reconciliation.data.booking.status === 'CONFIRMED' &&
                reconciliation.data.payment.status === 'PAID'
            );
          } catch {
            if (active) {
              setVerificationMessage(
                'Payment must be verified by the server before the ticket is available.'
              );
            }
          }
        } else {
          setPaymentVerified(false);
        }
      } catch (requestError) {
        if (active) setError(requestError);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadBooking();

    return () => {
      active = false;
    };
  }, [bookingId, retry]);

  async function runAction(action, callback) {
    if (busyAction) return;
    setBusyAction(action);
    setActionError(null);
    setNotice(null);
    try {
      await callback();
    } catch (requestError) {
      setActionError(requestError);
    } finally {
      setBusyAction('');
    }
  }

  function resumeCheckout() {
    return runAction('checkout', async () => {
      const response = await api(
        `/bookings/${encodeURIComponent(bookingId)}/checkout`,
        { method: 'POST' }
      );
      setCheckout(response.data.checkout);
      setNotice('Your test checkout session is ready to resume.');
    });
  }

  function refreshPayment() {
    return runAction('refresh', async () => {
      const response = await api(
        `/bookings/${encodeURIComponent(bookingId)}/reconcile`,
        { method: 'POST' }
      );
      setBooking(response.data.booking);
      setCheckout(null);
      const isVerified =
        response.data.booking.status === 'CONFIRMED' &&
        response.data.payment.status === 'PAID';
      setPaymentVerified(isVerified);
      setVerificationMessage(
        isVerified
          ? ''
          : 'The server has not verified successful payment for this booking.'
      );
      setNotice(
        isVerified ? 'Payment status refreshed from the server.' : null
      );
    });
  }

  function cancelBooking() {
    return runAction('cancel', async () => {
      const response = await api(
        `/bookings/${encodeURIComponent(bookingId)}/cancel`,
        { method: 'POST' }
      );
      setBooking(response.data);
      setNotice('Your booking was cancelled.');
    });
  }

  function retryBooking() {
    setLoading(true);
    setError(null);
    setRetry((value) => value + 1);
  }

  function refreshPaymentStatus() {
    setVerificationMessage('');
    refreshPayment();
  }

  if (loading) {
    return (
      <BookingPageFrame title="Booking details">
        <Panel>
          <LoadingState />
        </Panel>
      </BookingPageFrame>
    );
  }

  if (error) {
    return (
      <BookingPageFrame title="Booking details">
        <div className="space-y-4">
          <ErrorMessage error={error} />
          {error.status !== 401 && error.status !== 404 && (
            <button
              className={primaryButtonClass}
              onClick={retryBooking}
              type="button"
            >
              Try again
            </button>
          )}
          <Link
            className="block text-sm text-purple-300 underline underline-offset-4"
            to="/my-bookings"
          >
            Back to my bookings
          </Link>
        </div>
      </BookingPageFrame>
    );
  }

  const event = getEventDetails(booking);
  const isPendingPaid =
    booking.status === 'PENDING_PAYMENT' && booking.amountMinor > 0;
  const canCancelFree =
    booking.status === 'CONFIRMED' &&
    booking.amountMinor === 0 &&
    !booking.checkedInAt;

  return (
    <BookingPageFrame
      subtitle="Booking details and available actions."
      title={event.title ?? 'Booking details'}
    >
      <div className="space-y-5">
        {notice && <Alert tone="success">{notice}</Alert>}
        {actionError?.code === 'CHECKOUT_NOT_CREATED' ? (
          <Alert tone="info">
            No checkout session exists yet. Resume checkout to create or reuse
            your test session, then refresh payment status.
            <button
              className={`${primaryButtonClass} mt-3`}
              disabled={Boolean(busyAction)}
              onClick={resumeCheckout}
              type="button"
            >
              Resume checkout
            </button>
          </Alert>
        ) : (
          actionError && <ErrorMessage error={actionError} />
        )}
        {verificationMessage && (
          <Alert tone="info">
            {verificationMessage}
            <button
              className={`${primaryButtonClass} mt-3`}
              disabled={Boolean(busyAction)}
              onClick={refreshPaymentStatus}
              type="button"
            >
              {busyAction === 'refresh' ? 'Checking…' : 'Verify payment status'}
            </button>
          </Alert>
        )}
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Booking summary</h2>
            <StatusBadge status={booking.status} />
          </div>
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <Detail label="Booking ID" value={booking.id} />
            <Detail
              label="Amount"
              value={formatMoney(booking.amountMinor, booking.currency)}
            />
            <Detail label="Payment state" value={paymentStateLabel(booking)} />
            <Detail
              label="Event date"
              value={formatEventDate(event.startAt, event.timezone)}
            />
            <Detail label="Venue" value={event.venue ?? 'Not available'} />
            <Detail
              label="Location"
              value={
                [event.address, event.city].filter(Boolean).join(', ') ||
                'Not available'
              }
            />
          </dl>
        </Panel>

        {isPendingPaid && (
          <Panel>
            <h2 className="text-lg font-semibold">Payment actions</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Your reservation is pending payment. The provider response
              contains a test session ID but no hosted checkout URL, so this
              page cannot redirect to a payment form.
            </p>
            {booking.holdExpiresAt && (
              <p className="mt-2 text-sm text-gray-300">
                Reservation hold expires{' '}
                {formatEventDate(booking.holdExpiresAt, event.timezone)}.
              </p>
            )}
            {checkout && (
              <div className="mt-4 rounded-lg border border-gray-800 bg-black/40 p-3 text-sm">
                <p>
                  Test session:{' '}
                  <code className="break-all text-purple-200">
                    {checkout.id}
                  </code>
                </p>
                <p className="mt-1 text-gray-400">
                  Session status: {checkout.status}
                  {checkout.testMode ? ' · test mode' : ''}
                </p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className={primaryButtonClass}
                disabled={Boolean(busyAction)}
                onClick={resumeCheckout}
                type="button"
              >
                {busyAction === 'checkout'
                  ? 'Preparing session…'
                  : 'Resume checkout'}
              </button>
              <button
                className={secondaryButtonClass}
                disabled={Boolean(busyAction)}
                onClick={refreshPayment}
                type="button"
              >
                {busyAction === 'refresh'
                  ? 'Refreshing…'
                  : 'Refresh payment status'}
              </button>
            </div>
          </Panel>
        )}

        {booking.status === 'CONFIRMED' &&
          (booking.amountMinor === 0 || paymentVerified) && (
            <div className="flex flex-wrap gap-3">
              <Link
                className={primaryButtonClass}
                to={`/bookings/${encodeURIComponent(booking.id)}/ticket`}
              >
                View ticket
              </Link>
            </div>
          )}

        {canCancelFree && (
          <Panel>
            <h2 className="text-lg font-semibold">Cancel free booking</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Free bookings can be cancelled before the event starts and before
              check-in. The server will verify eligibility when you submit.
            </p>
            <button
              className={`${secondaryButtonClass} mt-4`}
              disabled={Boolean(busyAction)}
              onClick={cancelBooking}
              type="button"
            >
              {busyAction === 'cancel' ? 'Cancelling…' : 'Cancel booking'}
            </button>
          </Panel>
        )}

        {booking.status === 'REFUND_REQUIRED' && (
          <Alert tone="info">
            This payment needs review. A ticket is not available while the
            booking is in this state.
          </Alert>
        )}
        {['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(booking.status) && (
          <Alert tone="info">
            This booking is no longer active. A valid ticket is not available.
          </Alert>
        )}
        <Link
          className="inline-block text-sm text-purple-300 underline underline-offset-4 hover:text-white"
          to="/my-bookings"
        >
          Back to my bookings
        </Link>
      </div>
    </BookingPageFrame>
  );
}

function Detail({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-gray-100">{value}</dd>
    </div>
  );
}

export default BookingDetails;
