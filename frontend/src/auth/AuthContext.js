import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/* ================================================================
   Auth Configuration
   ================================================================ */

/* ---- OIDC Provider Registry ---- */
const OIDC_PROVIDERS = {
    okta: {
        name: 'Okta',
        domain: process.env.REACT_APP_OKTA_DOMAIN || '',
        clientId: process.env.REACT_APP_OKTA_CLIENT_ID || '',
        isConfigured: () => Boolean(process.env.REACT_APP_OKTA_DOMAIN && process.env.REACT_APP_OKTA_CLIENT_ID),
        authorizeUrl: (domain) => `https://${domain}/oauth2/default/v1/authorize`,
        tokenUrl: (domain) => `https://${domain}/oauth2/default/v1/token`,
        logoutUrl: (domain) => `https://${domain}/oauth2/default/v1/logout`,
        scopes: 'openid profile email',
    },
    azure: {
        name: 'Microsoft',
        domain: process.env.REACT_APP_AZURE_TENANT_ID || '',
        clientId: process.env.REACT_APP_AZURE_CLIENT_ID || '',
        isConfigured: () => Boolean(process.env.REACT_APP_AZURE_TENANT_ID && process.env.REACT_APP_AZURE_CLIENT_ID),
        authorizeUrl: (tenantId) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
        tokenUrl: (tenantId) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        logoutUrl: (tenantId) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout`,
        scopes: 'openid profile email',
    },
};

function detectProvider() {
    for (const [key, provider] of Object.entries(OIDC_PROVIDERS)) {
        if (provider.isConfigured()) return { key, ...provider };
    }
    return null;
}

const ACTIVE_PROVIDER = detectProvider();
const OIDC_ENABLED = Boolean(ACTIVE_PROVIDER);
// Always use the current origin for redirect URI
const getRedirectUri = () => `${window.location.origin}/callback`;


// Local fallback credentials (when OIDC is not configured)
// WARNING: These are baked into the JS bundle at build time and visible to anyone
// who can view page source. Local auth is a development convenience, NOT a security
// boundary. Use OIDC SSO for production deployments.
const LOCAL_USERS = [
    {
        username: process.env.REACT_APP_LOCAL_ADMIN_USERNAME || 'admin',
        password: process.env.REACT_APP_LOCAL_ADMIN_PASSWORD || 'admin123',
        name: 'Admin User',
        email: 'admin@local',
    },
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
    const authMode = OIDC_ENABLED ? 'oidc' : 'local';

    /* ---- Restore session on mount ---- */
    useEffect(() => {
        const stored = sessionStorage.getItem('auth_user');
        const token = sessionStorage.getItem('id_token');

        if (stored) {
            // For OIDC sessions, also check token expiry
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

    /* ---- Handle OIDC callback ---- */
    const handleOidcCallback = useCallback(async () => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const storedState = sessionStorage.getItem('oidc_state');
        const returnedState = params.get('state');
        const codeVerifier = sessionStorage.getItem('oidc_code_verifier');

        console.log('Handling OIDC callback...', { code: !!code, verifier: !!codeVerifier, state: !!returnedState });

        if (!code || !codeVerifier) {
            const msg = !code ? 'Missing authorization code' : 'Missing verifier (session may have expired)';
            console.error('OIDC callback error:', msg);
            setError(msg);
            setLoading(false);
            return false;
        }

        if (storedState && storedState !== returnedState) {
            console.error('OIDC callback error: State mismatch', { stored: storedState, returned: returnedState });
            setError('State mismatch — possible CSRF attack');
            setLoading(false);
            return false;
        }

        try {
            const tokenResponse = await fetch(ACTIVE_PROVIDER.tokenUrl(ACTIVE_PROVIDER.domain), {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: ACTIVE_PROVIDER.clientId,
                    redirect_uri: getRedirectUri(),
                    code,
                    code_verifier: codeVerifier,
                    scope: ACTIVE_PROVIDER.scopes,
                }),
            });

            if (!tokenResponse.ok) {
                const err = await tokenResponse.json().catch(() => ({}));
                throw new Error(err.error_description || `Token exchange failed (${tokenResponse.status})`);
            }

            const tokens = await tokenResponse.json();
            const idPayload = parseJwt(tokens.id_token);

            const userData = {
                name: idPayload?.name || idPayload?.preferred_username || 'SSO User',
                email: idPayload?.email || idPayload?.preferred_username || '',
                sub: idPayload?.sub || '',
            };

            sessionStorage.setItem('id_token', tokens.id_token);
            sessionStorage.setItem('access_token', tokens.access_token || '');
            sessionStorage.setItem('auth_user', JSON.stringify(userData));
            sessionStorage.removeItem('oidc_state');
            sessionStorage.removeItem('oidc_code_verifier');

            console.log('OIDC token exchange successful');
            setUser(userData);
            setLoading(false);

            // Clean the URL
            window.history.replaceState({}, document.title, '/');
            return true;
        } catch (err) {
            console.error('OIDC token exchange failed:', err);
            setError(`Authentication failed: ${err.message}`);
            setLoading(false);
            return false;
        }
    }, []);

    /* ---- OIDC Login ---- */
    const loginWithOidc = useCallback(async () => {
        const state = generateRandomString(32);
        const codeVerifier = generateRandomString(64);
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        sessionStorage.setItem('oidc_state', state);
        sessionStorage.setItem('oidc_code_verifier', codeVerifier);

        const redirectUri = getRedirectUri();
        const authUrl = new URL(ACTIVE_PROVIDER.authorizeUrl(ACTIVE_PROVIDER.domain));
        authUrl.searchParams.set('client_id', ACTIVE_PROVIDER.clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', ACTIVE_PROVIDER.scopes);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        console.log('Starting OIDC login...', {
            provider: ACTIVE_PROVIDER.name,
            clientId: ACTIVE_PROVIDER.clientId,
            redirectUri: redirectUri,
            authUrl: authUrl.toString()
        });

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

        if (OIDC_ENABLED && idToken) {
            const logoutEndpoint = ACTIVE_PROVIDER?.logoutUrl(ACTIVE_PROVIDER.domain);
            if (logoutEndpoint) {
                const logoutUrl = new URL(logoutEndpoint);
                logoutUrl.searchParams.set('id_token_hint', idToken);
                logoutUrl.searchParams.set('post_logout_redirect_uri', window.location.origin);
                window.location.href = logoutUrl.toString();
            }
        }
    }, []);

    const value = {
        user,
        loading,
        error,
        isAuthenticated,
        authMode,
        loginWithOidc,
        loginLocal,
        handleOidcCallback,
        logout,
        clearError: () => setError(null),
        authProvider: ACTIVE_PROVIDER?.name || null,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
