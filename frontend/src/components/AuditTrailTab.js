import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './AuditTrailTab.css';

const EVENT_DISPLAY = {
    CreateAccountAssignment: { label: 'Assigned Permission Set', category: 'assignment' },
    DeleteAccountAssignment: { label: 'Removed Assignment', category: 'assignment' },
    CreatePermissionSet: { label: 'Created Permission Set', category: 'permission_set' },
    DeletePermissionSet: { label: 'Deleted Permission Set', category: 'permission_set' },
    UpdatePermissionSet: { label: 'Updated Permission Set', category: 'permission_set' },
    PutInlinePolicyToPermissionSet: { label: 'Added Inline Policy', category: 'permission_set' },
    DeleteInlinePolicyFromPermissionSet: { label: 'Removed Inline Policy', category: 'permission_set' },
    AttachManagedPolicyToPermissionSet: { label: 'Attached Managed Policy', category: 'permission_set' },
    DetachManagedPolicyFromPermissionSet: { label: 'Detached Managed Policy', category: 'permission_set' },
    AttachCustomerManagedPolicyReferenceToPermissionSet: { label: 'Attached Customer Policy', category: 'permission_set' },
    DetachCustomerManagedPolicyReferenceFromPermissionSet: { label: 'Detached Customer Policy', category: 'permission_set' },
    PutPermissionsBoundaryToPermissionSet: { label: 'Set Permissions Boundary', category: 'permission_set' },
    DeletePermissionsBoundaryFromPermissionSet: { label: 'Removed Permissions Boundary', category: 'permission_set' },
    ProvisionPermissionSet: { label: 'Provisioned Permission Set', category: 'permission_set' },
};

const CATEGORIES = [
    { value: 'all', label: 'All Changes' },
    { value: 'assignments', label: 'Assignment Changes' },
    { value: 'permission_sets', label: 'Permission Set Changes' },
];

function formatDateTime(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    } catch {
        return isoString;
    }
}

function extractActorShort(arn) {
    if (!arn) return 'Unknown';
    if (arn.includes('/')) return arn.split('/').pop();
    if (arn.includes(':')) return arn.split(':').pop();
    return arn;
}

function parseRequestParams(paramsStr) {
    if (!paramsStr) return null;
    try {
        return JSON.parse(paramsStr);
    } catch {
        return null;
    }
}

export default function AuditTrailTab({ apiFetch, apiEndpoint }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [category, setCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().slice(0, 10);
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedRow, setExpandedRow] = useState(null);
    const pageSize = 50;

    const fetchData = useCallback(async () => {
        if (!apiEndpoint) return;
        setLoading(true);
        setError(null);
        try {
            const url = `${apiEndpoint}?type=change_history&start_date=${startDate}&end_date=${endDate}&category=${category}`;
            const resp = await apiFetch(url);
            if (!resp.ok) {
                const body = await resp.json().catch(() => ({}));
                throw new Error(body.error || `API returned ${resp.status}`);
            }
            const data = await resp.json();
            setEvents(data.events || []);
        } catch (err) {
            setError(err.message);
            setEvents([]);
        } finally {
            setLoading(false);
        }
    }, [apiEndpoint, apiFetch, startDate, endDate, category]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Filter by search
    const filteredEvents = useMemo(() => {
        if (!searchQuery) return events;
        const q = searchQuery.toLowerCase();
        return events.filter(e => {
            const r = e.resolved || {};
            return (
                (e.event_display || e.eventname || '').toLowerCase().includes(q) ||
                (e.actor_short || '').toLowerCase().includes(q) ||
                (e.actor_arn || '').toLowerCase().includes(q) ||
                (r.principal || '').toLowerCase().includes(q) ||
                (r.permission_set || '').toLowerCase().includes(q) ||
                (r.account || '').toLowerCase().includes(q) ||
                (r.policy || '').toLowerCase().includes(q) ||
                (e.sourceipaddress || '').toLowerCase().includes(q)
            );
        });
    }, [events, searchQuery]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
    const paginatedEvents = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredEvents.slice(start, start + pageSize);
    }, [filteredEvents, currentPage, pageSize]);

    useEffect(() => { setCurrentPage(1); }, [searchQuery, category]);

    // Stats
    const stats = useMemo(() => {
        const assignmentNames = new Set(['CreateAccountAssignment', 'DeleteAccountAssignment']);
        return {
            total: events.length,
            assignments: events.filter(e => assignmentNames.has(e.eventname)).length,
            permissionSets: events.filter(e => !assignmentNames.has(e.eventname)).length,
        };
    }, [events]);

    // Export CSV
    const exportCSV = useCallback(() => {
        const headers = ['Date/Time', 'Event', 'API Action', 'Actor', 'Actor ARN', 'Principal', 'Permission Set', 'Account', 'Source IP', 'Status'];
        const rows = filteredEvents.map(e => {
            const r = e.resolved || {};
            return [
                e.eventtime || '',
                (EVENT_DISPLAY[e.eventname]?.label || e.eventname || ''),
                e.eventname || '',
                extractActorShort(e.actor_arn),
                e.actor_arn || '',
                r.principal ? `${r.principal_type === 'GROUP' ? 'Group' : 'User'}: ${r.principal}` : '',
                r.permission_set || '',
                r.account || '',
                e.sourceipaddress || '',
                e.errorcode || 'Success',
            ];
        });
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-trail-${startDate}-to-${endDate}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [filteredEvents, startDate, endDate]);

    if (!apiEndpoint) {
        return (
            <div className="audit-container">
                <div className="audit-empty">
                    <p>Audit Trail requires a live API endpoint. Connect to a deployed backend to view change history.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="audit-container">
            {/* Stats Cards */}
            <div className="audit-stats">
                <div className="audit-stat-card audit-stat-card--total">
                    <div className="audit-stat-card__value">{stats.total}</div>
                    <div className="audit-stat-card__label">Total Events</div>
                </div>
                <div className="audit-stat-card audit-stat-card--assignments">
                    <div className="audit-stat-card__value">{stats.assignments}</div>
                    <div className="audit-stat-card__label">Assignment Changes</div>
                </div>
                <div className="audit-stat-card audit-stat-card--permsets">
                    <div className="audit-stat-card__value">{stats.permissionSets}</div>
                    <div className="audit-stat-card__label">Permission Set Changes</div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="audit-toolbar">
                <div className="audit-toolbar__filters">
                    <label className="audit-toolbar__date-label">
                        From
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="audit-toolbar__date" />
                    </label>
                    <label className="audit-toolbar__date-label">
                        To
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="audit-toolbar__date" />
                    </label>
                    <select value={category} onChange={e => setCategory(e.target.value)} className="audit-toolbar__select">
                        {CATEGORIES.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                    </select>
                </div>
                <div className="audit-toolbar__actions">
                    <input
                        type="text"
                        placeholder="Search by actor, event, IP..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="audit-toolbar__search"
                    />
                    <button onClick={fetchData} className="audit-toolbar__btn" title="Refresh">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                        </svg>
                    </button>
                    <button onClick={exportCSV} className="audit-toolbar__btn" title="Export CSV">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Error state */}
            {error && (
                <div className="audit-error">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {/* Loading */}
            {loading ? (
                <div className="audit-loading">
                    <div className="audit-loading__spinner" />
                    Querying CloudTrail logs...
                </div>
            ) : filteredEvents.length === 0 ? (
                <div className="audit-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <p>No events found for the selected date range and filters.</p>
                </div>
            ) : (
                <>
                    {/* Events Table */}
                    <div className="audit-table-wrap">
                        <table className="audit-table">
                            <thead>
                                <tr>
                                    <th>Date / Time</th>
                                    <th>Event</th>
                                    <th>Actor</th>
                                    <th>Principal</th>
                                    <th>Permission Set</th>
                                    <th>Account</th>
                                    <th>Status</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedEvents.map((evt, idx) => {
                                    const display = EVENT_DISPLAY[evt.eventname] || { label: evt.eventname, category: 'other' };
                                    const params = parseRequestParams(evt.requestparameters);
                                    const resolved = evt.resolved || {};
                                    const globalIdx = (currentPage - 1) * pageSize + idx;
                                    const isExpanded = expandedRow === globalIdx;

                                    return (
                                        <React.Fragment key={evt.eventid || globalIdx}>
                                            <tr className={evt.errorcode ? 'audit-table__row--error' : ''}>
                                                <td className="audit-table__time">{formatDateTime(evt.eventtime)}</td>
                                                <td>
                                                    <span className={`audit-badge audit-badge--${display.category}`}>
                                                        {display.label}
                                                    </span>
                                                </td>
                                                <td className="audit-table__actor" title={evt.actor_arn || ''}>
                                                    {extractActorShort(evt.actor_arn)}
                                                </td>
                                                <td className="audit-table__principal">
                                                    {resolved.principal ? (
                                                        <>
                                                            <span className={`audit-badge audit-badge--${resolved.principal_type === 'GROUP' ? 'group' : 'user'}`}>
                                                                {resolved.principal_type === 'GROUP' ? 'Group' : 'User'}
                                                            </span>{' '}
                                                            {resolved.principal}
                                                        </>
                                                    ) : (resolved.policy || '\u2014')}
                                                </td>
                                                <td>{resolved.permission_set || '\u2014'}</td>
                                                <td>{resolved.account || '\u2014'}</td>
                                                <td>
                                                    {evt.errorcode ? (
                                                        <span className="audit-badge audit-badge--error" title={evt.errormessage || ''}>
                                                            {evt.errorcode}
                                                        </span>
                                                    ) : (
                                                        <span className="audit-badge audit-badge--success">Success</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {params && (
                                                        <button
                                                            className="audit-table__expand-btn"
                                                            onClick={() => setExpandedRow(isExpanded ? null : globalIdx)}
                                                            title="Toggle details"
                                                        >
                                                            {isExpanded ? '\u25BE' : '\u25B8'} {isExpanded ? 'Hide' : 'Show'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                            {isExpanded && params && (
                                                <tr className="audit-table__detail-row">
                                                    <td colSpan="8">
                                                        <pre className="audit-table__json">
                                                            {JSON.stringify(params, null, 2)}
                                                        </pre>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="audit-pagination">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => p - 1)}
                                className="audit-pagination__btn"
                            >
                                Previous
                            </button>
                            <span className="audit-pagination__info">
                                Page {currentPage} of {totalPages} ({filteredEvents.length} events)
                            </span>
                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => p + 1)}
                                className="audit-pagination__btn"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
