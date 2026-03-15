import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import './LoginPage.css';

function LoginPage() {
    const { authMode, loginWithOidc, loginLocal, error, clearError, authProvider } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleLocalSubmit = (e) => {
        e.preventDefault();
        loginLocal(username, password);
    };

    const providerIcons = {
        'Okta': (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.389 0 0 5.389 0 12s5.389 12 12 12 12-5.389 12-12S18.611 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z" />
            </svg>
        ),
        'Microsoft': (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M0 0h11.5v11.5H0V0zm12.5 0H24v11.5H12.5V0zM0 12.5h11.5V24H0V12.5zm12.5 0H24V24H12.5V12.5z" />
            </svg>
        ),
    };

    return (
        <div className="login-page">
            {/* Left panel — branding */}
            <div className="login-hero">
                <div className="login-hero__content">
                    <div className="login-hero__logo">
                        <svg width="52" height="52" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M15 2L4 7v7c0 7.1 4.7 13.3 11 15 6.3-1.7 11-7.9 11-15V7L15 2z" stroke="#FF9900" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
                            <path d="M10.5 15l3 3 6-6.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                    </div>
                    <h1 className="login-hero__title">AWS IAM Identity Center</h1>
                    <p className="login-hero__subtitle">Security Governance Dashboard</p>
                    <div className="login-hero__features">
                        <div className="login-hero__feature">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                                <rect x="9" y="3" width="6" height="4" rx="1" />
                                <path d="M9 14l2 2 4-4" />
                            </svg>
                            <span>Audit SSO assignments across your entire AWS Organization</span>
                        </div>
                        <div className="login-hero__feature">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                            <span>Automated risk scoring for privilege escalation paths</span>
                        </div>
                        <div className="login-hero__feature">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                <path d="M7 11V7a5 5 0 0110 0v4" />
                            </svg>
                            <span>Deep-dive permission set policies, boundaries & tags</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right panel — login form */}
            <div className="login-form-panel">
                <div className="login-card">
                    <div className="login-card__header">
                        <h2 className="login-card__title">Welcome back</h2>
                        <p className="login-card__subtitle">Sign in to continue to the dashboard</p>
                    </div>

                    {error && (
                        <div className="login-card__error" role="alert">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.25a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                            </svg>
                            <span>{error}</span>
                            <button className="login-card__error-dismiss" onClick={clearError}>&times;</button>
                        </div>
                    )}

                    {authMode === 'oidc' ? (
                        <div className="login-card__sso">
                            <button className="login-card__btn login-card__btn--sso" onClick={loginWithOidc}>
                                {providerIcons[authProvider]}
                                Sign in with {authProvider}
                            </button>
                            <div className="login-card__divider">
                                <span>SSO</span>
                            </div>
                            <p className="login-card__hint">You'll be redirected to your organization's {authProvider} login page</p>
                        </div>
                    ) : (
                        <form className="login-card__form" onSubmit={handleLocalSubmit}>
                            <div className="login-card__field">
                                <label htmlFor="username">Username</label>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={e => { setUsername(e.target.value); clearError(); }}
                                    placeholder="Enter username"
                                    autoComplete="username"
                                    autoFocus
                                    required
                                />
                            </div>
                            <div className="login-card__field">
                                <label htmlFor="password">Password</label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); clearError(); }}
                                    placeholder="Enter password"
                                    autoComplete="current-password"
                                    required
                                />
                            </div>
                            <button type="submit" className="login-card__btn login-card__btn--primary">
                                Sign In
                            </button>
                        </form>
                    )}

                </div>
            </div>
        </div>
    );
}

export default LoginPage;
