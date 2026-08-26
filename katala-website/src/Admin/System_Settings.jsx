import SettingsPanel from '../shared/SettingsPanel';

function SystemSettings() {
  return (
    <SettingsPanel
      title="System Settings"
      copy="Manage account preferences and system configurations."
      settingsKey="katala-admin-settings"
      themeKey="katala-admin-theme"
      showDatabaseBackup
    />
  );
}

export default SystemSettings;
