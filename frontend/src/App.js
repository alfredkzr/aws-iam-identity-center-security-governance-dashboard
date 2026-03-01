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
    const [availableDates, setAvailableDates] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');

    const fetchData = useCallback(async (dateToFetch = null) => {
        setLoading(true);
        setError(null);

        try {
            if (API_ENDPOINT) {
                // Fetch available dates first if we don't have them
                let dates = availableDates;
                if (dates.length === 0) {
                    const datesResponse = await fetch(`${API_ENDPOINT}?type=dates`);
                    if (datesResponse.ok) {
                        const datesResult = await datesResponse.json();
                        dates = datesResult.dates || [];
                        setAvailableDates(dates);
                    }
                }

                // Determine which date to query
                const targetDate = dateToFetch || (dates.length > 0 ? dates[0] : '');

                // Fetch assignments for target date
                const url = `${API_ENDPOINT}?type=all${targetDate ? `&date=${targetDate}` : ''}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error(`API returned ${response.status}`);
                const result = await response.json();

                setData(result);
                if (targetDate && targetDate !== selectedDate) {
                    setSelectedDate(targetDate);
                }
            } else {
                // Fallback to demo data handling
                const demoInfo = getDemoData();
                const dates = demoInfo.availableDates;

                if (availableDates.length === 0) {
                    setAvailableDates(dates);
                }

                const targetDate = dateToFetch || dates[0];
                setData(demoInfo.dataByDate[targetDate]);

                if (targetDate !== selectedDate) {
                    setSelectedDate(targetDate);
                }
            }
        } catch (err) {
            console.error('Failed to fetch data:', err);
            setError(err.message);

            const demoInfo = getDemoData();
            const dates = demoInfo.availableDates;

            if (availableDates.length === 0) {
                setAvailableDates(dates);
            }

            const targetDate = dateToFetch || dates[0];
            setData(demoInfo.dataByDate[targetDate]);

            if (targetDate !== selectedDate) {
                setSelectedDate(targetDate);
            }
        } finally {
            setLoading(false);
        }
    }, [availableDates.length, selectedDate]);

    // Handle OIDC callback
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('code')) {
            handleOktaCallback();
        }
    }, [handleOktaCallback]);

    // Fetch data once authenticated
    useEffect(() => {
        if (isAuthenticated && data === null) {
            fetchData();
        }
    }, [isAuthenticated, fetchData, data]);

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
            <Header user={user} onLogout={logout} />
            <main className="main-content">
                <Dashboard
                    data={data}
                    loading={loading}
                    error={error}
                    availableDates={availableDates}
                    selectedDate={selectedDate}
                    onDateChange={(newDate) => fetchData(newDate)}
                    onRefresh={() => fetchData(selectedDate)}
                />
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
 * Generates computationally large dataset to test UI scalability.
 */
function getDemoData() {
    // Generate dates formatting as YYYY-MM-DD
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const formatDate = (date) => date.toISOString().slice(0, 10);
    const d1 = formatDate(today);
    const d2 = formatDate(yesterday);
    const d3 = formatDate(twoDaysAgo);

    // Procedurally generate 120 accounts and ~1500 assignments
    const baseAssignments = [];
    const permissionSets = [
        'AdministratorAccess', 'PowerUserAccess', 'ReadOnlyAccess', 'ViewOnlyAccess',
        'SecurityAudit', 'BillingAccess', 'NetworkAdministrator', 'DatabaseAdministrator',
        'DeveloperAccess', 'SupportUser'
    ];

    const accountNames = ['Production', 'Staging', 'Development', 'Sandbox', 'Security', 'Logging', 'Network', 'SharedServices', 'DataLake', 'Analytics'];

    // Generate 120 Accounts
    for (let accIdx = 1; accIdx <= 120; accIdx++) {
        const accountId = String(accIdx).padStart(12, '0');
        const accountType = accountNames[accIdx % accountNames.length];
        const accountName = `${accountType}-${accIdx}`;

        // Assign 5-20 assignments per account
        const numAssignments = 5 + (accIdx % 16);

        for (let aIdx = 0; aIdx < numAssignments; aIdx++) {
            const isGroup = (aIdx % 3 === 0);
            const isUserViaGroup = (aIdx % 4 === 0) && !isGroup;

            let principalType = 'USER';
            if (isGroup) principalType = 'GROUP';
            else if (isUserViaGroup) principalType = 'USER_VIA_GROUP';

            const principalId = (accIdx + aIdx) % 200;
            const principalName = isGroup ? `Team-${principalId}` : `user.${principalId}`;
            const groupName = isUserViaGroup ? `Team-${principalId % 20}` : '';
            const email = isGroup ? '' : `${principalName}@example.com`;

            const permSetIdx = (accIdx + aIdx) % permissionSets.length;
            const permissionSetName = permissionSets[permSetIdx];

            baseAssignments.push({
                account_id: accountId,
                account_name: accountName,
                principal_type: principalType,
                principal_name: principalName,
                principal_email: email,
                permission_set_name: permissionSetName,
                permission_set_arn: `arn:aws:sso:::permissionSet/ssoins-xxx/ps-${permissionSetName.toLowerCase()}`,
                group_name: groupName
            });
        }
    }

    const uniqueAccounts = new Set(baseAssignments.map(a => a.account_id)).size;
    const uniquePrincipals = new Set(baseAssignments.map(a => a.principal_name)).size;
    const uniquePermSets = new Set(baseAssignments.map(a => a.permission_set_name)).size;

    return {
        availableDates: [d1, d2, d3],
        dataByDate: {
            [d1]: {
                generated_at: today.toISOString(),
                stats: { total_assignments: baseAssignments.length, total_accounts: uniqueAccounts, total_principals: uniquePrincipals, total_permission_sets: uniquePermSets },
                assignments: [...baseAssignments]
            },
            [d2]: {
                generated_at: yesterday.toISOString(),
                stats: { total_assignments: baseAssignments.length - 10, total_accounts: uniqueAccounts, total_principals: uniquePrincipals, total_permission_sets: uniquePermSets },
                assignments: baseAssignments.slice(0, baseAssignments.length - 10)
            },
            [d3]: {
                generated_at: twoDaysAgo.toISOString(),
                stats: { total_assignments: baseAssignments.length - 25, total_accounts: uniqueAccounts, total_principals: uniquePrincipals, total_permission_sets: uniquePermSets },
                assignments: baseAssignments.slice(0, baseAssignments.length - 25)
            }
        }
    };
}

export default App;
