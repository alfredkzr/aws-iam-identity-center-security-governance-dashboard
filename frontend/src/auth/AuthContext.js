import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/* ================================================================
   Auth Configuration
   ================================================================ */

const OKTA_DOMAIN = process.env.REACT_APP_OKTA_DOMAIN || '';
const OKTA_CLIENT_ID = process.env.REACT_APP_OKTA_CLIENT_ID || '';
const REDIRECT_URI = process.env.REACT_APP_OKTA_REDIRECT_URI || `${window.location.origin}/callback`;
const OKTA_ENABLED = Boolean(OKTA_DOMAIN && OKTA_CLIENT_ID);

// Local fallback credentials (when Okta is not configured)
const LOCAL_USERS = [
    { username: 'admin', password: 'admin123', name: 'Admin User', email: 'admin@local' },
];

/* ================================================================
   PKCE Helpers
   ================================================================ */

function generateRandomString(length = 64) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/* ================================================================
   Token Helpers
   ================================================================ */

function parseJwt(token) {
    try {
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64));
    } catch {
        return null;
    }
}

function isTokenExpired(token) {
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return true;
    return Date.now() >= payload.exp * 1000;
}

/* ================================================================
   Auth Context
   ================================================================ */

const AuthContext = createContext(null);

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const isAuthenticated = Boolean(user);
    const authMode = OKTA_ENABLED ? 'okta' : 'local';

    /* ---- Restore session on mount ---- */
    useEffect(() => {
        const stored = sessionStorage.getItem('auth_user');
        const token = sessionStorage.getItem('id_token');

        if (stored) {
            // For Okta sessions, also check token expiry
            if (token && !isTokenExpired(token)) {
                setUser(JSON.parse(stored));
            } else if (!token) {
                // Local auth (no token)
                setUser(JSON.parse(stored));
            } else {
                // Token expired — clear
                sessionStorage.removeItem('auth_user');
                sessionStorage.removeItem('id_token');
                sessionStorage.removeItem('access_token');
            }
        }
        setLoading(false);
    }, []);

    /* ---- Handle Okta callback ---- */
    const handleOktaCallback = useCallback(async () => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const storedState = sessionStorage.getItem('okta_state');
        const returnedState = params.get('state');
        const codeVerifier = sessionStorage.getItem('okta_code_verifier');

        if (!code || !codeVerifier) {
            setError('Missing authorization code or verifier');
            setLoading(false);
            return false;
        }

        if (storedState && storedState !== returnedState) {
            setError('State mismatch — possible CSRF attack');
            setLoading(false);
            return false;
        }

        try {
            const tokenResponse = await fetch(`https://${OKTA_DOMAIN}/oauth2/default/v1/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: OKTA_CLIENT_ID,
                    redirect_uri: REDIRECT_URI,
                    code,
                    code_verifier: codeVerifier,
                }),
            });

            if (!tokenResponse.ok) {
                const err = await tokenResponse.json().catch(() => ({}));
                throw new Error(err.error_description || `Token exchange failed (${tokenResponse.status})`);
            }

            const tokens = await tokenResponse.json();
            const idPayload = parseJwt(tokens.id_token);

            const userData = {
                name: idPayload?.name || idPayload?.preferred_username || 'Okta User',
                email: idPayload?.email || '',
                sub: idPayload?.sub || '',
            };

            sessionStorage.setItem('id_token', tokens.id_token);
            sessionStorage.setItem('access_token', tokens.access_token || '');
            sessionStorage.setItem('auth_user', JSON.stringify(userData));
            sessionStorage.removeItem('okta_state');
            sessionStorage.removeItem('okta_code_verifier');

            setUser(userData);
            setLoading(false);

            // Clean the URL
            window.history.replaceState({}, document.title, '/');
            return true;
        } catch (err) {
            console.error('Okta token exchange failed:', err);
            setError(err.message);
            setLoading(false);
            return false;
        }
    }, []);

    /* ---- Okta Login ---- */
    const loginWithOkta = useCallback(async () => {
        const state = generateRandomString(32);
        const codeVerifier = generateRandomString(64);
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        sessionStorage.setItem('okta_state', state);
        sessionStorage.setItem('okta_code_verifier', codeVerifier);

        const authUrl = new URL(`https://${OKTA_DOMAIN}/oauth2/default/v1/authorize`);
        authUrl.searchParams.set('client_id', OKTA_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid profile email');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        window.location.href = authUrl.toString();
    }, []);

    /* ---- Local Login ---- */
    const loginLocal = useCallback((username, password) => {
        const found = LOCAL_USERS.find(u => u.username === username && u.password === password);
        if (!found) {
            setError('Invalid username or password');
            return false;
        }
        const userData = { name: found.name, email: found.email };
        sessionStorage.setItem('auth_user', JSON.stringify(userData));
        setUser(userData);
        setError(null);
        return true;
    }, []);

    /* ---- Logout ---- */
    const logout = useCallback(() => {
        const idToken = sessionStorage.getItem('id_token');
        sessionStorage.removeItem('auth_user');
        sessionStorage.removeItem('id_token');
        sessionStorage.removeItem('access_token');
        setUser(null);

        if (OKTA_ENABLED && idToken) {
            const logoutUrl = new URL(`https://${OKTA_DOMAIN}/oauth2/default/v1/logout`);
            logoutUrl.searchParams.set('id_token_hint', idToken);
            logoutUrl.searchParams.set('post_logout_redirect_uri', window.location.origin);
            window.location.href = logoutUrl.toString();
        }
    }, []);

    const value = {
        user,
        loading,
        error,
        isAuthenticated,
        authMode,
        loginWithOkta,
        loginLocal,
        handleOktaCallback,
        logout,
        clearError: () => setError(null),
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
