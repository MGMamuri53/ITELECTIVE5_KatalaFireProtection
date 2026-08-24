import StaffLayout from './StaffLayout';
import CompletedPage from './pages/CompletedPage';
import MaintenancePage from './pages/MaintenancePage';
import MessagesPage from './pages/MessagesPage';
import ServiceCalendarPage from './pages/ServiceCalendarPage';
import WorkQueuePage from './pages/WorkQueuePage';

function StaffRoute({ activePage, children }) {
  return <StaffLayout activePage={activePage}>{children}</StaffLayout>;
}

export function StaffWorkQueue() {
  return <StaffRoute activePage="Work Queue"><WorkQueuePage /></StaffRoute>;
}

export function StaffMessages() {
  return <StaffRoute activePage="Messages"><MessagesPage /></StaffRoute>;
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

export default StaffWorkQueue;
