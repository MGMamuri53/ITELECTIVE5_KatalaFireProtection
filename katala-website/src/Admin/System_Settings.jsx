import { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronRight, Database, KeyRound, Mail, Palette, UserRound, X } from 'lucide-react';
import { authApi, getStoredSession, schemaApi } from '../services/katalaApi';

const SETTINGS_KEY = 'katala-admin-settings';
const THEME_KEY = 'katala-admin-theme';

function savedSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

function splitName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('admin-theme-dark', theme === 'dark');
}

function SystemSettings() {
  const sessionUser = getStoredSession()?.user || {};
  const nameParts = useMemo(() => splitName(sessionUser.name), [sessionUser.name]);
  const stored = savedSettings();
  const [emailNotifications, setEmailNotifications] = useState(stored.emailNotifications ?? true);
  const [pushNotifications, setPushNotifications] = useState(stored.pushNotifications ?? false);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [activeModal, setActiveModal] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [profileForm, setProfileForm] = useState({
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    contactNumber: sessionUser.contactNumber || '',
    companyName: sessionUser.companyName || '',
    jobTitle: sessionUser.jobTitle || '',
    industry: sessionUser.industry || '',
    companyAddress: sessionUser.companyAddress || '',
  });
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ emailNotifications, pushNotifications }));
  }, [emailNotifications, pushNotifications]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }, [theme]);

  async function saveProfile(event) {
    event.preventDefault();
    if (status.type === 'loading') return;
    setStatus({ type: 'loading', message: 'Saving profile...' });
    try {
      await authApi.updateProfile(profileForm);
      setStatus({ type: 'success', message: 'Profile updated.' });
      setActiveModal('');
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to update profile.' });
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    if (status.type === 'loading') return;
    if (passwordForm.password.length < 8) {
      setStatus({ type: 'error', message: 'Password must be at least 8 characters.' });
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setStatus({ type: 'loading', message: 'Updating password...' });
    try {
      await authApi.updatePassword(passwordForm.password);
      setPasswordForm({ password: '', confirmPassword: '' });
      setStatus({ type: 'success', message: 'Password updated.' });
      setActiveModal('');
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to update password.' });
    }
  }

  async function downloadBackup() {
    if (status.type === 'loading') return;
    setStatus({ type: 'loading', message: 'Preparing database backup...' });
    try {
      const result = await schemaApi.downloadAdminDatabaseBackup();
      setStatus({ type: 'success', message: `Backup downloaded: ${result.filename}` });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to download backup.' });
    }
  }

  function updateProfileField(event) {
    setProfileForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">System Settings</h1>
        <p className="text-slate-500">Manage account preferences and system configurations.</p>
      </div>

      {status.type !== 'idle' && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
          status.type === 'error'
            ? 'bg-red-50 text-red-700 border-red-100'
            : status.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-slate-50 text-slate-600 border-slate-200'
        }`}>
          {status.message}
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <SettingsGroup label="Profile settings">
          <SettingsAction icon={UserRound} title="Edit Profile" copy="Update your personal information and organization details." onClick={() => setActiveModal('profile')} />
          <SettingsAction icon={KeyRound} title="Change Password" copy="Update your login credentials." onClick={() => setActiveModal('password')} />
        </SettingsGroup>

        <SettingsGroup label="Notifications">
          <SettingsToggle icon={Mail} title="Email Notifications" copy="Receive daily summaries of new requests." checked={emailNotifications} onChange={setEmailNotifications} />
          <SettingsToggle icon={Bell} title="Push Notifications" copy="Real-time alerts for incoming appointments." checked={pushNotifications} onChange={setPushNotifications} />
        </SettingsGroup>

        <SettingsGroup label="System data">
          <SettingsAction icon={Database} title="Database Backup" copy="Export core records to a CSV file." onClick={downloadBackup} />
          <SettingsToggle icon={Palette} title="Theme Customization" copy="Switch between light and dark mode." checked={theme === 'dark'} onChange={(checked) => setTheme(checked ? 'dark' : 'light')} />
        </SettingsGroup>
      </section>

      {activeModal === 'profile' && (
        <SettingsModal title="Edit Profile" onClose={() => setActiveModal('')}>
          <form className="settings-form" onSubmit={saveProfile}>
            <div className="settings-form-grid">
              <Field label="First name" name="firstName" value={profileForm.firstName} onChange={updateProfileField} required />
              <Field label="Last name" name="lastName" value={profileForm.lastName} onChange={updateProfileField} required />
            </div>
            <Field label="Contact number" name="contactNumber" value={profileForm.contactNumber} onChange={updateProfileField} />
            <Field label="Company / organization" name="companyName" value={profileForm.companyName} onChange={updateProfileField} />
            <div className="settings-form-grid">
              <Field label="Job title" name="jobTitle" value={profileForm.jobTitle} onChange={updateProfileField} />
              <Field label="Industry" name="industry" value={profileForm.industry} onChange={updateProfileField} />
            </div>
            <Field label="Company address" name="companyAddress" value={profileForm.companyAddress} onChange={updateProfileField} />
            <div className="settings-actions">
              <button type="button" onClick={() => setActiveModal('')}>Cancel</button>
              <button type="submit" disabled={status.type === 'loading'}>Save profile</button>
            </div>
          </form>
        </SettingsModal>
      )}

      {activeModal === 'password' && (
        <SettingsModal title="Change Password" onClose={() => setActiveModal('')}>
          <form className="settings-form" onSubmit={changePassword}>
            <Field label="New password" name="password" type="password" value={passwordForm.password} onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))} required />
            <Field label="Confirm password" name="confirmPassword" type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} required />
            <div className="settings-actions">
              <button type="button" onClick={() => setActiveModal('')}>Cancel</button>
              <button type="submit" disabled={status.type === 'loading'}>Update password</button>
            </div>
          </form>
        </SettingsModal>
      )}
    </div>
  );
}

function SettingsGroup({ label, children }) {
  return (
    <div className="mb-7 last:mb-0">
      <p className="text-[10px] font-bold text-[#b3000c] uppercase tracking-widest mb-3">{label}</p>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function SettingsAction({ icon: Icon, title, copy, onClick }) {
  return (
    <button type="button" className="w-full flex items-center gap-4 py-4 text-left hover:bg-slate-50 px-2 rounded-lg transition-colors" onClick={onClick}>
      <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1">
        <strong className="block text-sm text-slate-900">{title}</strong>
        <span className="block text-xs text-slate-500 mt-1">{copy}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-slate-300" />
    </button>
  );
}

function SettingsToggle({ icon: Icon, title, copy, checked, onChange }) {
  return (
    <label className="w-full flex items-center gap-4 py-4 hover:bg-slate-50 px-2 rounded-lg transition-colors cursor-pointer">
      <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1">
        <strong className="block text-sm text-slate-900">{title}</strong>
        <span className="block text-xs text-slate-500 mt-1">{copy}</span>
      </span>
      <input className="settings-toggle" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={title} />
    </label>
  );
}

function SettingsModal({ title, children, onClose }) {
  return (
    <div className="settings-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      <section className="settings-modal">
        <div className="settings-modal-header">
          <h2 id="settings-modal-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close settings dialog"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

export default SystemSettings;
