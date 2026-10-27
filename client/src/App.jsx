import { Route, Routes } from 'react-router';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import BookingDetails from './pages/BookingDetails.jsx';
import BookingTicket from './pages/BookingTicket.jsx';
import CheckoutReturn from './pages/CheckoutReturn.jsx';
import TestCheckout from './pages/TestCheckout.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Profile from './pages/Profile.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import Events from './pages/Events.jsx';
import EventDetails from './pages/EventDetails.jsx';
import OrganizerDashboard from './pages/OrganizerDashboard.jsx';
import OrganizerEventForm from './pages/OrganizerEventForm.jsx';
import OrganizerEventDetails from './pages/OrganizerEventDetails.jsx';
import OrganizerAttendees from './pages/OrganizerAttendees.jsx';

function Placeholder({ name }) {
  return <h1 className="p-8 text-2xl font-bold">{name} (coming soon)</h1>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route path="/events" element={<Events />} />
      <Route path="/events/:eventId" element={<EventDetails />} />

      <Route
        path="/profile"
        element={
          <RequireAuth>
            <Profile />
          </RequireAuth>
        }
      />

      <Route
        path="/admin"
        element={
          <RequireAuth role="ADMIN">
            <Placeholder name="Admin" />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAuth role="ADMIN">
            <Placeholder name="Admin users" />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/events"
        element={
          <RequireAuth role="ADMIN">
            <Placeholder name="Admin events" />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/payment-issues"
        element={
          <RequireAuth role="ADMIN">
            <Placeholder name="Payment issues" />
          </RequireAuth>
        }
      />

      <Route
        path="/organizer"
        element={
          <RequireAuth role="ORGANIZER">
            <OrganizerDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/organizer/events/new"
        element={
          <RequireAuth role="ORGANIZER">
            <OrganizerEventForm />
          </RequireAuth>
        }
      />
      <Route
        path="/organizer/events/:eventId/edit"
        element={
          <RequireAuth role="ORGANIZER">
            <OrganizerEventForm />
          </RequireAuth>
        }
      />
      <Route
        path="/organizer/events/:eventId/attendees"
        element={
          <RequireAuth role="ORGANIZER">
            <OrganizerAttendees />
          </RequireAuth>
        }
      />
      <Route
        path="/organizer/events/:eventId"
        element={
          <RequireAuth role="ORGANIZER">
            <OrganizerEventDetails />
          </RequireAuth>
        }
      />

      <Route
        path="/my-bookings"
        element={
          <RequireAuth>
            <MyBookings />
          </RequireAuth>
        }
      />
      <Route
        path="/bookings/:bookingId"
        element={
          <RequireAuth>
            <BookingDetails />
          </RequireAuth>
        }
      />
      <Route
        path="/bookings/:bookingId/ticket"
        element={
          <RequireAuth>
            <BookingTicket />
          </RequireAuth>
        }
      />
      <Route
        path="/checkout/test/:checkoutId"
        element={
          <RequireAuth>
            <TestCheckout />
          </RequireAuth>
        }
      />
      <Route
        path="/checkout/return"
        element={
          <RequireAuth>
            <CheckoutReturn />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Placeholder name="Page not found" />} />
    </Routes>
  );
}

export default App;
