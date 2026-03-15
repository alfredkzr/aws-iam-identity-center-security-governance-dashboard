import React from 'react';
import { useAuth } from '../auth/AuthContext';
import './SettingsTab.css';

export default function SettingsTab({ auditTrailEnabled, theme, onToggleTheme }) {
    const { user, authMode, authProvider } = useAuth();

    return (
        <div className="settings-container">
            <div className="settings-main">
                {/* Appearance */}
                <section className="settings-section">
                    <div className="settings-section__header">
                        <h2 className="settings-section__title">Appearance</h2>
                        <p className="settings-section__desc">Customize the look of the dashboard.</p>
                    </div>

                    <div className="settings-group">
                        <div className="settings-row">
                            <div className="settings-row__label-group">
                                <div className="settings-row__label">Theme</div>
                                <div className="settings-row__desc">Switch between light and dark mode</div>
                            </div>
                            <div className="settings-row__control">
                                <div className="settings-theme-picker">
                                    <button
                                        className={`settings-theme-btn ${theme === 'light' ? 'settings-theme-btn--active' : ''}`}
                                        onClick={() => theme !== 'light' && onToggleTheme()}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="5" />
                                            <line x1="12" y1="1" x2="12" y2="3" />
                                            <line x1="12" y1="21" x2="12" y2="23" />
                                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                            <line x1="1" y1="12" x2="3" y2="12" />
                                            <line x1="21" y1="12" x2="23" y2="12" />
                                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                                        </svg>
                                        Light
                                    </button>
                                    <button
                                        className={`settings-theme-btn ${theme === 'dark' ? 'settings-theme-btn--active' : ''}`}
                                        onClick={() => theme !== 'dark' && onToggleTheme()}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                                        </svg>
                                        Dark
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Profile */}
                <section className="settings-section">
                    <div className="settings-section__header">
                        <h2 className="settings-section__title">Profile</h2>
                        <p className="settings-section__desc">Your account and authentication details.</p>
                    </div>

                    <div className="settings-group">
                        <div className="settings-profile-card">
                            <div className="settings-profile-card__avatar">
                                {(user?.name || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="settings-profile-card__info">
                                <div className="settings-profile-card__name">{user?.name || 'Unknown'}</div>
                                {user?.email && (
                                    <div className="settings-profile-card__email">{user.email}</div>
                                )}
                            </div>
                        </div>

                        <InfoRow label="Authentication" value={authMode === 'oidc' ? `SSO (${authProvider || 'OIDC'})` : 'Local'} />
                        {user?.sub && <InfoRow label="User ID" value={user.sub} mono />}
                        <InfoRow
                            label="Session"
                            value={sessionStorage.getItem('auth_user') ? 'Active' : 'None'}
                            badge={sessionStorage.getItem('auth_user') ? 'active' : 'inactive'}
                        />
                    </div>
                </section>

                {/* System Info */}
                <section className="settings-section">
                    <div className="settings-section__header">
                        <h2 className="settings-section__title">System Information</h2>
                        <p className="settings-section__desc">Configuration and connection status.</p>
                    </div>

                    <div className="settings-group">
                        <InfoRow label="App version" value="1.0.0" />
                        <InfoRow
                            label="API endpoint"
                            value={process.env.REACT_APP_API_ENDPOINT || 'Not configured (demo mode)'}
                            mono={Boolean(process.env.REACT_APP_API_ENDPOINT)}
                            badge={process.env.REACT_APP_API_ENDPOINT ? 'connected' : 'demo'}
                        />
                        <InfoRow
                            label="Auth provider"
                            value={
                                process.env.REACT_APP_OKTA_DOMAIN ? `Okta (${process.env.REACT_APP_OKTA_DOMAIN})` :
                                process.env.REACT_APP_AZURE_TENANT_ID ? 'Microsoft Entra ID' :
                                'Local (development)'
                            }
                        />
                        <InfoRow
                            label="CloudTrail audit"
                            value={auditTrailEnabled ? 'Enabled' : 'Not configured'}
                            badge={auditTrailEnabled ? 'active' : 'inactive'}
                        />
                        <InfoRow label="Data storage" value="Amazon S3 + Athena" />
                        <InfoRow label="Cache TTL" value="1 hour" />
                    </div>
                </section>
            </div>
        </div>
    );
}

function InfoRow({ label, value, mono, badge }) {
    return (
        <div className="settings-row settings-row--info">
            <div className="settings-row__label">{label}</div>
            <div className="settings-row__value">
                {badge && <span className={`settings-badge settings-badge--${badge}`} />}
                <span className={mono ? 'settings-mono' : ''}>{value}</span>
            </div>
        </div>
    );
}
