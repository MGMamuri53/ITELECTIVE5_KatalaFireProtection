import StaffLayout from './StaffLayout';
import CompletedPage from './pages/CompletedPage';
import MaintenancePage from './pages/MaintenancePage';
import PaymentConfirmationsPage from './pages/PaymentConfirmationsPage';
import PaidAssignmentsPage from './pages/PaidAssignmentsPage';
import ServiceCalendarPage from './pages/ServiceCalendarPage';
import SettingsPage from './pages/SettingsPage';
import WorkQueuePage from './pages/WorkQueuePage';

function StaffRoute({ activePage, children }) {
  return <StaffLayout activePage={activePage}>{children}</StaffLayout>;
}

export function StaffWorkQueue() {
  return <StaffRoute activePage="Work Queue"><WorkQueuePage /></StaffRoute>;
}

export function StaffPaymentConfirmations() {
  return <StaffRoute activePage="Payment Confirmation"><PaymentConfirmationsPage /></StaffRoute>;
}

export function StaffPaidAssignments() {
  return <StaffRoute activePage="Paid Assignments"><PaidAssignmentsPage /></StaffRoute>;
}

export function StaffServiceCalendar() {
  return <StaffRoute activePage="Service Calendar"><ServiceCalendarPage /></StaffRoute>;
}

export function StaffMaintenance() {
  return <StaffRoute activePage="Maintenance"><MaintenancePage /></StaffRoute>;
}

export function StaffCompleted() {
  return <StaffRoute activePage="Completed"><CompletedPage /></StaffRoute>;
}

export function StaffSettings() {
  return <StaffRoute activePage="Settings"><SettingsPage /></StaffRoute>;
}

export default StaffWorkQueue;
