import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import LoginPage from './components/LoginPage';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || '';

function AppContent() {
    const { user, isAuthenticated, loading: authLoading, logout, handleOktaCallback } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            if (API_ENDPOINT) {
                const response = await fetch(`${API_ENDPOINT}?type=all`);
                if (!response.ok) throw new Error(`API returned ${response.status}`);
                const result = await response.json();
                setData(result);
            } else {
                setData(getDemoData());
            }
        } catch (err) {
            console.error('Failed to fetch data:', err);
            setError(err.message);
            setData(getDemoData());
        } finally {
            setLoading(false);
        }
    }, []);

    // Handle OIDC callback
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('code')) {
            handleOktaCallback();
        }
    }, [handleOktaCallback]);

    // Fetch data once authenticated
    useEffect(() => {
        if (isAuthenticated) {
            fetchData();
        }
    }, [isAuthenticated, fetchData]);

    // Show loading while auth is initializing
    if (authLoading) {
        return (
            <div className="app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f2f3f3' }}>
                <div style={{ textAlign: 'center', color: '#687078' }}>
                    <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #eaeded', borderTop: '3px solid #0073bb', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 600ms linear infinite' }} />
                    Authenticating…
                </div>
            </div>
        );
    }

    // Show login page if not authenticated
    if (!isAuthenticated) {
        return <LoginPage />;
    }

    return (
        <div className="app">
            <Header user={user} onRefresh={fetchData} onLogout={logout} />
            <main className="main-content">
                <Dashboard data={data} loading={loading} error={error} />
            </main>
        </div>
    );
}

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

/**
 * Demo data for when the API is not configured.
 */
function getDemoData() {
    return {
        generated_at: new Date().toISOString(),
        stats: {
            total_assignments: 25,
            total_accounts: 8,
            total_principals: 28,
            total_permission_sets: 8,
        },
        assignments: [
            { account_id: '111111111111', account_name: 'Production', principal_type: 'USER', principal_name: 'jane.doe', principal_email: 'jane.doe@example.com', permission_set_name: 'AdministratorAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-admin', group_name: '' },
            { account_id: '111111111111', account_name: 'Production', principal_type: 'GROUP', principal_name: 'SRE-Team', principal_email: '', permission_set_name: 'PowerUserAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-power', group_name: '' },
            { account_id: '111111111111', account_name: 'Production', principal_type: 'USER_VIA_GROUP', principal_name: 'bob.sre', principal_email: 'bob.sre@example.com', permission_set_name: 'PowerUserAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-power', group_name: 'SRE-Team' },
            { account_id: '111111111111', account_name: 'Production', principal_type: 'USER_VIA_GROUP', principal_name: 'carol.ops', principal_email: 'carol.ops@example.com', permission_set_name: 'PowerUserAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-power', group_name: 'SRE-Team' },
            { account_id: '222222222222', account_name: 'Staging', principal_type: 'USER', principal_name: 'john.smith', principal_email: 'john.smith@example.com', permission_set_name: 'AdministratorAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-admin', group_name: '' },
            { account_id: '222222222222', account_name: 'Staging', principal_type: 'USER', principal_name: 'dev.user', principal_email: 'dev@example.com', permission_set_name: 'ReadOnlyAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-readonly', group_name: '' },
            { account_id: '333333333333', account_name: 'Development', principal_type: 'GROUP', principal_name: 'Dev-Team', principal_email: '', permission_set_name: 'PowerUserAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-power', group_name: '' },
            { account_id: '333333333333', account_name: 'Development', principal_type: 'USER_VIA_GROUP', principal_name: 'alice.dev', principal_email: 'alice.dev@example.com', permission_set_name: 'PowerUserAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-power', group_name: 'Dev-Team' },
            { account_id: '333333333333', account_name: 'Development', principal_type: 'USER_VIA_GROUP', principal_name: 'frank.eng', principal_email: 'frank.eng@example.com', permission_set_name: 'PowerUserAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-power', group_name: 'Dev-Team' },
            { account_id: '333333333333', account_name: 'Development', principal_type: 'USER', principal_name: 'alice.dev', principal_email: 'alice@example.com', permission_set_name: 'AdministratorAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-admin', group_name: '' },
            { account_id: '444444444444', account_name: 'Security', principal_type: 'GROUP', principal_name: 'Security-Auditors', principal_email: '', permission_set_name: 'SecurityAudit', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-audit', group_name: '' },
            { account_id: '444444444444', account_name: 'Security', principal_type: 'USER_VIA_GROUP', principal_name: 'eve.sec', principal_email: 'eve.sec@example.com', permission_set_name: 'SecurityAudit', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-audit', group_name: 'Security-Auditors' },
            { account_id: '555555555555', account_name: 'Sandbox', principal_type: 'USER', principal_name: 'intern.user', principal_email: 'intern@example.com', permission_set_name: 'ViewOnlyAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-view', group_name: '' },
            { account_id: '555555555555', account_name: 'Sandbox', principal_type: 'USER', principal_name: 'test.user', principal_email: 'test@example.com', permission_set_name: 'PowerUserAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-power', group_name: '' },
            { account_id: '666666666666', account_name: 'Logging', principal_type: 'GROUP', principal_name: 'Platform-Team', principal_email: '', permission_set_name: 'AdministratorAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-admin', group_name: '' },
            { account_id: '666666666666', account_name: 'Logging', principal_type: 'USER_VIA_GROUP', principal_name: 'dan.plat', principal_email: 'dan.plat@example.com', permission_set_name: 'AdministratorAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-admin', group_name: 'Platform-Team' },
            { account_id: '666666666666', account_name: 'Logging', principal_type: 'USER_VIA_GROUP', principal_name: 'grace.plat', principal_email: 'grace.plat@example.com', permission_set_name: 'AdministratorAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-admin', group_name: 'Platform-Team' },
            { account_id: '222222222222', account_name: 'Staging', principal_type: 'USER', principal_name: 'ops.admin', principal_email: 'ops.admin@example.com', permission_set_name: 'AdministratorAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-admin', group_name: '' },
            { account_id: '111111111111', account_name: 'Production', principal_type: 'USER', principal_name: 'alice.dev', principal_email: 'alice.dev@example.com', permission_set_name: 'ReadOnlyAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-readonly', group_name: '' },
            { account_id: '777777777777', account_name: 'Billing', principal_type: 'GROUP', principal_name: 'Finance-Team', principal_email: '', permission_set_name: 'BillingAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-billing', group_name: '' },
            { account_id: '777777777777', account_name: 'Billing', principal_type: 'USER_VIA_GROUP', principal_name: 'helen.fin', principal_email: 'helen.fin@example.com', permission_set_name: 'BillingAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-billing', group_name: 'Finance-Team' },
            { account_id: '777777777777', account_name: 'Billing', principal_type: 'USER_VIA_GROUP', principal_name: 'ivan.fin', principal_email: 'ivan.fin@example.com', permission_set_name: 'BillingAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-billing', group_name: 'Finance-Team' },
            { account_id: '555555555555', account_name: 'Sandbox', principal_type: 'USER', principal_name: 'alice.dev', principal_email: 'alice.dev@example.com', permission_set_name: 'PowerUserAccess', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-power', group_name: '' },
            { account_id: '888888888888', account_name: 'Network', principal_type: 'USER', principal_name: 'net.admin', principal_email: 'net.admin@example.com', permission_set_name: 'NetworkAdministrator', permission_set_arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-network', group_name: '' },
        ],
    };
}

export default App;
