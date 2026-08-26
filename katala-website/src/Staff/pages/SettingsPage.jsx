import SettingsPanel from '../../shared/SettingsPanel';

function SettingsPage() {
  return (
    <SettingsPanel
      title="Staff Settings"
      copy="Manage your staff profile, password, notifications, and portal theme."
      settingsKey="katala-staff-settings"
      themeKey="katala-admin-theme"
    />
  );
}

export default SettingsPage;
