import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import './LoginPage.css';

function LoginPage() {
    const { authMode, loginWithOkta, loginLocal, error, clearError } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleLocalSubmit = (e) => {
        e.preventDefault();
        loginLocal(username, password);
    };

    return (
        <div className="login-page">
            <div className="login-card">
                {/* Logo */}
                <div className="login-card__logo">
                    <svg width="48" height="48" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15 2L4 7v7c0 7.1 4.7 13.3 11 15 6.3-1.7 11-7.9 11-15V7L15 2z" stroke="#FF9900" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
                        <path d="M10.5 15l3 3 6-6.5" stroke="#0073bb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                </div>

                <h1 className="login-card__title">IAM Identity Center</h1>
                <p className="login-card__subtitle">Governance Dashboard</p>

                {error && (
                    <div className="login-card__error" role="alert">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.25a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                        </svg>
                        <span>{error}</span>
                        <button className="login-card__error-dismiss" onClick={clearError}>×</button>
                    </div>
                )}

                {authMode === 'okta' ? (
                    /* Okta SSO Login */
                    <div className="login-card__sso">
                        <button className="login-card__btn login-card__btn--okta" onClick={loginWithOkta}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.389 0 0 5.389 0 12s5.389 12 12 12 12-5.389 12-12S18.611 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z" />
                            </svg>
                            Sign in with Okta
                        </button>
                        <p className="login-card__hint">You'll be redirected to your organization's Okta login page</p>
                    </div>
                ) : (
                    /* Local Login */
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
    );
}

export default LoginPage;
