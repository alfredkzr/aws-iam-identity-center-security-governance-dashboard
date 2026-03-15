import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import useTheme from './hooks/useTheme';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import PermissionSetsTable from './components/PermissionSetsTable';
import SecurityTab from './components/SecurityTab';
import AuditTrailTab from './components/AuditTrailTab';
import LoginPage from './components/LoginPage';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || '';
const LOCAL_API_KEY = process.env.REACT_APP_LOCAL_API_KEY || '';
const AUDIT_TRAIL_ENABLED = process.env.REACT_APP_AUDIT_TRAIL_ENABLED === 'true';

/** Wraps fetch() to attach auth headers.
 *  Uses X-Auth-Token (Okta) or X-Api-Key (local) because CloudFront OAC
 *  replaces the Authorization header with its own SigV4 signature. */
function apiFetch(url, options = {}) {
    const token = sessionStorage.getItem('access_token');
    const headers = { ...options.headers };
    if (token) {
        headers['X-Auth-Token'] = token;
    }
    if (LOCAL_API_KEY) {
        headers['X-Api-Key'] = LOCAL_API_KEY;
    }
    return fetch(url, { ...options, headers });
}

function AppContent() {
    const { user, isAuthenticated, loading: authLoading, logout, handleOidcCallback } = useAuth();
    const { theme, toggleTheme } = useTheme();

    // Tab state
    const [activeTab, setActiveTab] = useState('assignments');

    // Assignments state
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [availableDates, setAvailableDates] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');

    // Permission Sets state
    const [psData, setPsData] = useState(null);
    const [psLoading, setPsLoading] = useState(false);
    const [psAvailableDates, setPsAvailableDates] = useState([]);
    const [psSelectedDate, setPsSelectedDate] = useState('');

    // Risk policy state
    const [riskPolicies, setRiskPolicies] = useState(null);
    const [riskSource, setRiskSource] = useState('default');
    const [riskLoading, setRiskLoading] = useState(false);

    const fetchData = useCallback(async (dateToFetch = null, force = false) => {
        setLoading(true);
        setError(null);

        try {
            if (API_ENDPOINT) {
                // Always fetch latest available dates
                const datesResponse = await apiFetch(`${API_ENDPOINT}?type=dates${force ? '&force=true' : ''}`);
                let dates = [];
                if (datesResponse.ok) {
                    const datesResult = await datesResponse.json();
                    dates = datesResult.dates || [];
                    setAvailableDates(dates);
                }

                // Determine which date to query
                const targetDate = dateToFetch || (dates.length > 0 ? dates[0] : '');

                // Fetch assignments for target date
                const url = `${API_ENDPOINT}?type=all${targetDate ? `&date=${targetDate}` : ''}${force ? '&force=true' : ''}`;
                const response = await apiFetch(url);
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
                setAvailableDates(dates);

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

    const fetchPermissionSets = useCallback(async (dateToFetch = null, force = false) => {
        setPsLoading(true);

        try {
            if (API_ENDPOINT) {
                // Fetch available dates for permission sets
                const datesResponse = await apiFetch(`${API_ENDPOINT}?type=permission_sets_dates${force ? '&force=true' : ''}`);
                let dates = [];
                if (datesResponse.ok) {
                    const datesResult = await datesResponse.json();
                    dates = datesResult.dates || [];
                    setPsAvailableDates(dates);
                }

                const targetDate = dateToFetch || (dates.length > 0 ? dates[0] : '');

                const url = `${API_ENDPOINT}?type=permission_sets${targetDate ? `&date=${targetDate}` : ''}${force ? '&force=true' : ''}`;
                const response = await apiFetch(url);
                if (!response.ok) throw new Error(`API returned ${response.status}`);
                const result = await response.json();

                setPsData(result);
                if (targetDate && targetDate !== psSelectedDate) {
                    setPsSelectedDate(targetDate);
                }
            } else {
                // Demo data
                const demoInfo = getDemoPermissionSetsData();
                const dates = demoInfo.availableDates;
                setPsAvailableDates(dates);

                const targetDate = dateToFetch || dates[0];
                setPsData(demoInfo.dataByDate[targetDate]);

                if (targetDate !== psSelectedDate) {
                    setPsSelectedDate(targetDate);
                }
            }
        } catch (err) {
            console.error('Failed to fetch permission sets:', err);
            // Fallback to demo
            const demoInfo = getDemoPermissionSetsData();
            const dates = demoInfo.availableDates;
            if (psAvailableDates.length === 0) {
                setPsAvailableDates(dates);
            }
            const targetDate = dateToFetch || dates[0];
            setPsData(demoInfo.dataByDate[targetDate]);
            if (targetDate !== psSelectedDate) {
                setPsSelectedDate(targetDate);
            }
        } finally {
            setPsLoading(false);
        }
    }, [psAvailableDates.length, psSelectedDate]);

    // Handle OIDC callback
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('code')) {
            console.log('App: Detected "code" parameter in URL, triggering callback handler');
            handleOidcCallback();
        }
    }, [handleOidcCallback]);

    // Fetch data once authenticated (assignments + permission sets for risk column)
    useEffect(() => {
        if (isAuthenticated && data === null) {
            fetchData();
        }
        if (isAuthenticated && psData === null) {
            fetchPermissionSets();
        }
    }, [isAuthenticated, fetchData, data, fetchPermissionSets, psData]);

    // Fetch risk policies when user switches to security tab
    const fetchRiskPolicies = useCallback(async () => {
        setRiskLoading(true);
        try {
            if (API_ENDPOINT) {
                const response = await apiFetch(`${API_ENDPOINT}?type=risk_policies`);
                if (response.ok) {
                    const result = await response.json();
                    setRiskPolicies(result.policies || null);
                    setRiskSource(result.source || 'default');
                }
            }
        } catch (err) {
            console.error('Failed to fetch risk policies:', err);
        } finally {
            setRiskLoading(false);
        }
    }, []);

    const saveRiskPolicies = useCallback(async (policies) => {
        if (API_ENDPOINT) {
            if (policies === null) {
                // Reset to defaults — delete the custom file by saving defaults
                const response = await apiFetch(`${API_ENDPOINT}?type=risk_policies`);
                const result = await response.json();
                // Just re-fetch to get defaults
                setRiskPolicies(result.policies || null);
                setRiskSource('default');
                return;
            }
            const response = await apiFetch(`${API_ENDPOINT}?type=save_risk_policies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(policies),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save');
            }
            const result = await response.json();
            setRiskPolicies(result.policies || policies);
            setRiskSource('custom');
        }
    }, []);

    const refreshSecurityData = useCallback(() => {
        setPsData(null);
        setRiskPolicies(null);
        fetchPermissionSets(psSelectedDate, true);
        fetchRiskPolicies();
    }, [psSelectedDate, fetchPermissionSets, fetchRiskPolicies]);

    useEffect(() => {
        if (isAuthenticated && activeTab === 'security' && riskPolicies === null) {
            fetchRiskPolicies();
            // Also ensure permission sets data is loaded for risk stats
            if (psData === null) {
                fetchPermissionSets();
            }
        }
    }, [isAuthenticated, activeTab, fetchRiskPolicies, riskPolicies, psData, fetchPermissionSets]);

    // Show loading while auth is initializing
    if (authLoading) {
        return (
            <div className="app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page)' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid var(--border-divider)', borderTop: '3px solid var(--aws-blue)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 600ms linear infinite' }} />
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
            <Header user={user} onLogout={logout} theme={theme} onToggleTheme={toggleTheme} />

            {/* Tab Navigation */}
            <nav className="tab-nav" id="tab-navigation">
                <div className="tab-nav__inner">
                    <button
                        className={`tab-nav__tab ${activeTab === 'assignments' ? 'tab-nav__tab--active' : ''}`}
                        onClick={() => setActiveTab('assignments')}
                        id="tab-assignments"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                            <rect x="9" y="3" width="6" height="4" rx="1" />
                            <path d="M9 14l2 2 4-4" />
                        </svg>
                        Assignments
                    </button>
                    <button
                        className={`tab-nav__tab ${activeTab === 'permission_sets' ? 'tab-nav__tab--active' : ''}`}
                        onClick={() => setActiveTab('permission_sets')}
                        id="tab-permission-sets"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0110 0v4" />
                        </svg>
                        Permission Sets
                    </button>
                    <button
                        className={`tab-nav__tab ${activeTab === 'security' ? 'tab-nav__tab--active' : ''}`}
                        onClick={() => setActiveTab('security')}
                        id="tab-security"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        Security
                    </button>
                    {AUDIT_TRAIL_ENABLED && (
                        <button
                            className={`tab-nav__tab ${activeTab === 'audit_trail' ? 'tab-nav__tab--active' : ''}`}
                            onClick={() => setActiveTab('audit_trail')}
                            id="tab-audit-trail"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                            </svg>
                            Audit Trail
                        </button>
                    )}
                </div>
            </nav>

            {!API_ENDPOINT && (
                <div className="demo-banner">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    You are viewing demo data. Connect an API endpoint to see live AWS IAM Identity Center assignments.
                </div>
            )}

            <main className="main-content">
                {activeTab === 'assignments' ? (
                    <Dashboard
                        data={data}
                        loading={loading}
                        error={error}
                        availableDates={availableDates}
                        selectedDate={selectedDate}
                        onDateChange={(newDate) => fetchData(newDate)}
                        onRefresh={() => fetchData(selectedDate, true)}
                        permissionSetsData={psData}
                    />
                ) : activeTab === 'permission_sets' ? (
                    <PermissionSetsTable
                        data={psData}
                        loading={psLoading}
                        availableDates={psAvailableDates}
                        selectedDate={psSelectedDate}
                        onDateChange={(newDate) => fetchPermissionSets(newDate)}
                        onRefresh={() => fetchPermissionSets(psSelectedDate, true)}
                    />
                ) : activeTab === 'audit_trail' ? (
                    <AuditTrailTab apiFetch={apiFetch} apiEndpoint={API_ENDPOINT} />
                ) : (
                    <SecurityTab
                        permissionSetsData={psData}
                        riskPolicies={riskPolicies}
                        riskSource={riskSource}
                        onSaveRiskPolicies={saveRiskPolicies}
                        onRefresh={refreshSecurityData}
                        loading={riskLoading}
                    />
                )}
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

/**
 * Demo data for permission sets when the API is not configured.
 */
function getDemoPermissionSetsData() {
    const today = new Date();
    const formatDate = (date) => date.toISOString().slice(0, 10);
    const d1 = formatDate(today);

    const demoSets = [
        {
            name: 'AdministratorAccess',
            arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-administrator',
            description: 'Provides full access to AWS services and resources.',
            session_duration: 'PT1H',
            created_date: '2024-01-15T10:00:00Z',
            aws_managed_policies: [
                { name: 'AdministratorAccess', arn: 'arn:aws:iam::aws:policy/AdministratorAccess' }
            ],
            customer_managed_policies: [],
            inline_policy: '',
            permissions_boundary: null,
            tags: [{ Key: 'env', Value: 'production' }, { Key: 'team', Value: 'platform' }],
            provisioned_accounts: 120
        },
        {
            name: 'PowerUserAccess',
            arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-poweruser',
            description: 'Provides full access except IAM and Organizations.',
            session_duration: 'PT4H',
            created_date: '2024-01-20T08:30:00Z',
            aws_managed_policies: [
                { name: 'PowerUserAccess', arn: 'arn:aws:iam::aws:policy/PowerUserAccess' }
            ],
            customer_managed_policies: [],
            inline_policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Sid: 'DenyIAM',
                    Effect: 'Deny',
                    Action: ['iam:*', 'organizations:*'],
                    Resource: '*'
                }]
            }),
            permissions_boundary: {
                managed_policy_arn: 'arn:aws:iam::aws:policy/PowerUserAccess'
            },
            tags: [{ Key: 'env', Value: 'production' }],
            provisioned_accounts: 85
        },
        {
            name: 'ReadOnlyAccess',
            arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-readonly',
            description: 'Provides read-only access to all AWS services.',
            session_duration: 'PT12H',
            created_date: '2024-02-01T14:00:00Z',
            aws_managed_policies: [
                { name: 'ReadOnlyAccess', arn: 'arn:aws:iam::aws:policy/ReadOnlyAccess' },
                { name: 'SecurityAudit', arn: 'arn:aws:iam::aws:policy/SecurityAudit' }
            ],
            customer_managed_policies: [],
            inline_policy: '',
            permissions_boundary: null,
            tags: [],
            provisioned_accounts: 120
        },
        {
            name: 'SecurityAudit',
            arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-securityaudit',
            description: 'Access for security audit reviews.',
            session_duration: 'PT8H',
            created_date: '2024-02-10T09:00:00Z',
            aws_managed_policies: [
                { name: 'SecurityAudit', arn: 'arn:aws:iam::aws:policy/SecurityAudit' },
                { name: 'AWSCloudTrail_ReadOnlyAccess', arn: 'arn:aws:iam::aws:policy/AWSCloudTrail_ReadOnlyAccess' }
            ],
            customer_managed_policies: [
                { name: 'custom-security-read', path: '/' }
            ],
            inline_policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Sid: 'AllowGuardDuty',
                    Effect: 'Allow',
                    Action: ['guardduty:Get*', 'guardduty:List*'],
                    Resource: '*'
                }, {
                    Sid: 'AllowConfigRead',
                    Effect: 'Allow',
                    Action: ['config:Describe*', 'config:Get*', 'config:List*'],
                    Resource: '*'
                }]
            }),
            permissions_boundary: null,
            tags: [{ Key: 'compliance', Value: 'required' }, { Key: 'team', Value: 'security' }],
            provisioned_accounts: 45
        },
        {
            name: 'BillingAccess',
            arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-billing',
            description: 'Access to billing and cost management.',
            session_duration: 'PT1H',
            created_date: '2024-02-15T11:00:00Z',
            aws_managed_policies: [
                { name: 'AWSBillingReadOnlyAccess', arn: 'arn:aws:iam::aws:policy/AWSBillingReadOnlyAccess' }
            ],
            customer_managed_policies: [],
            inline_policy: '',
            permissions_boundary: null,
            tags: [{ Key: 'team', Value: 'finance' }],
            provisioned_accounts: 3
        },
        {
            name: 'NetworkAdministrator',
            arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-networkadmin',
            description: 'Full access to VPC, Route53, CloudFront, and networking services.',
            session_duration: 'PT4H',
            created_date: '2024-03-01T16:00:00Z',
            aws_managed_policies: [
                { name: 'NetworkAdministrator', arn: 'arn:aws:iam::aws:policy/job-function/NetworkAdministrator' }
            ],
            customer_managed_policies: [
                { name: 'custom-network-guardrails', path: '/network/' }
            ],
            inline_policy: '',
            permissions_boundary: {
                customer_managed_policy_reference: { name: 'network-boundary-policy', path: '/' }
            },
            tags: [{ Key: 'team', Value: 'networking' }, { Key: 'env', Value: 'all' }],
            provisioned_accounts: 12
        },
        {
            name: 'DatabaseAdministrator',
            arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-dba',
            description: 'Full access to RDS, DynamoDB, and other database services.',
            session_duration: 'PT4H',
            created_date: '2024-03-05T12:00:00Z',
            aws_managed_policies: [
                { name: 'AmazonRDSFullAccess', arn: 'arn:aws:iam::aws:policy/AmazonRDSFullAccess' },
                { name: 'AmazonDynamoDBFullAccess', arn: 'arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess' }
            ],
            customer_managed_policies: [],
            inline_policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Sid: 'AllowSecretsManager',
                    Effect: 'Allow',
                    Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
                    Resource: 'arn:aws:secretsmanager:*:*:secret:rds-*'
                }]
            }),
            permissions_boundary: null,
            tags: [{ Key: 'team', Value: 'data' }],
            provisioned_accounts: 8
        },
        {
            name: 'DeveloperAccess',
            arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-developer',
            description: 'Access for application developers with guardrails.',
            session_duration: 'PT8H',
            created_date: '2024-03-10T09:00:00Z',
            aws_managed_policies: [
                { name: 'PowerUserAccess', arn: 'arn:aws:iam::aws:policy/PowerUserAccess' }
            ],
            customer_managed_policies: [
                { name: 'deny-production-writes', path: '/developers/' },
                { name: 'restrict-regions', path: '/developers/' }
            ],
            inline_policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Sid: 'DenyIAMAdmin',
                    Effect: 'Deny',
                    Action: ['iam:CreateUser', 'iam:DeleteUser', 'iam:CreateRole', 'iam:DeleteRole'],
                    Resource: '*'
                }, {
                    Sid: 'DenyOrganizations',
                    Effect: 'Deny',
                    Action: 'organizations:*',
                    Resource: '*'
                }]
            }),
            permissions_boundary: {
                managed_policy_arn: 'arn:aws:iam::aws:policy/PowerUserAccess'
            },
            tags: [{ Key: 'team', Value: 'engineering' }, { Key: 'env', Value: 'dev' }, { Key: 'tier', Value: 'standard' }],
            provisioned_accounts: 30
        },
        {
            name: 'ViewOnlyAccess',
            arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-viewonly',
            description: 'Read-only access via AWS console.',
            session_duration: 'PT12H',
            created_date: '2024-01-25T10:00:00Z',
            aws_managed_policies: [
                { name: 'ViewOnlyAccess', arn: 'arn:aws:iam::aws:policy/job-function/ViewOnlyAccess' }
            ],
            customer_managed_policies: [],
            inline_policy: '',
            permissions_boundary: null,
            tags: [],
            provisioned_accounts: 0
        },
        {
            name: 'SupportUser',
            arn: 'arn:aws:sso:::permissionSet/ssoins-xxx/ps-support',
            description: 'Support center access for creating and managing support cases.',
            session_duration: 'PT4H',
            created_date: '2024-02-28T13:00:00Z',
            aws_managed_policies: [
                { name: 'AWSSupportAccess', arn: 'arn:aws:iam::aws:policy/AWSSupportAccess' }
            ],
            customer_managed_policies: [],
            inline_policy: '',
            permissions_boundary: null,
            tags: [{ Key: 'team', Value: 'support' }],
            provisioned_accounts: 5
        }
    ];

    return {
        availableDates: [d1],
        dataByDate: {
            [d1]: {
                generated_at: today.toISOString(),
                snapshot_date: d1,
                stats: { total_permission_sets: demoSets.length },
                permission_sets: demoSets
            }
        }
    };
}

export default App;
