import { useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { api } from '../lib/api.js';
import { Alert, BookingPageFrame, Panel } from './BookingUI.jsx';
import { primaryButtonClass, secondaryButtonClass } from './bookingUtils.js';

function TestCheckout() {
  const { checkoutId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const bookingId = searchParams.get('bookingId')?.trim() ?? '';
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const processingLock = useRef(false);

  async function submitOutcome(status) {
    if (processingLock.current || processing) return;
    processingLock.current = true;
    setProcessing(true);
    setError('');

    try {
      const response = await api(
        `/test-checkouts/${encodeURIComponent(checkoutId)}/outcome`,
        { method: 'POST', body: { status } }
      );
      const verifiedBookingId = response.data?.bookingId;

      if (!verifiedBookingId || verifiedBookingId !== bookingId) {
        setError(
          'We could not verify this checkout against its booking. Please open checkout again from your booking details.'
        );
        return;
      }

      navigate(
        `/checkout/return?bookingId=${encodeURIComponent(verifiedBookingId)}`
      );
    } catch (requestError) {
      if (
        requestError.status === 401 ||
        requestError.code === 'UNAUTHENTICATED'
      ) {
        setError('Your session has expired. Sign in again to continue.');
      } else if (
        requestError.status === 404 ||
        requestError.code === 'CHECKOUT_NOT_FOUND'
      ) {
        setError(
          'This test checkout is unavailable. Open your booking details to start a new checkout.'
        );
      } else if (
        requestError.status === 503 ||
        requestError.code === 'PAYMENT_PROVIDER_UNAVAILABLE' ||
        requestError.code === 'PAYMENT_WEBHOOK_NOT_CONFIGURED'
      ) {
        setError(
          'Test payments are temporarily unavailable. Please contact the event organizer or try again later.'
        );
      } else {
        setError(
          'We could not process this test payment. Please try again or return to your booking details.'
        );
      }
    } finally {
      processingLock.current = false;
      setProcessing(false);
    }
  }

  return (
    <BookingPageFrame
      subtitle="This is a simulated test payment. No real payment gateway or charge is involved."
      title="Test checkout"
    >
      <Panel className="max-w-2xl">
        <div className="space-y-5">
          <Alert tone="info">
            Choose an outcome to simulate the payment provider response. Your
            booking status will be determined by the server after it verifies
            and processes the signed test webhook.
          </Alert>
          {typeof location.state?.notice === 'string' && (
            <Alert tone="info">{location.state.notice}</Alert>
          )}
          <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Test checkout session
            </p>
            <p className="mt-2 break-all font-mono text-sm text-purple-200">
              {checkoutId}
            </p>
          </div>
          {!bookingId && (
            <Alert>
              The booking reference is missing. Return to your booking details
              and open checkout again.
            </Alert>
          )}
          {error && <Alert>{error}</Alert>}
          {processing && (
            <p
              aria-live="polite"
              role="status"
              className="text-sm text-gray-300"
            >
              Processing test payment…
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              className={primaryButtonClass}
              disabled={processing || !bookingId || !checkoutId}
              onClick={() => submitOutcome('PAID')}
              type="button"
            >
              {processing ? 'Processing…' : 'Pay'}
            </button>
            <button
              className={secondaryButtonClass}
              disabled={processing || !bookingId || !checkoutId}
              onClick={() => submitOutcome('FAILED')}
              type="button"
            >
              Fail payment
            </button>
            <Link
              className={secondaryButtonClass}
              to={
                bookingId
                  ? `/bookings/${encodeURIComponent(bookingId)}`
                  : '/my-bookings'
              }
            >
              Return to booking
            </Link>
          </div>
        </div>
      </Panel>
    </BookingPageFrame>
  );
}

export default TestCheckout;
