import React, { useState, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import './Dashboard.css';
import GovernanceCharts from './GovernanceCharts';

function Dashboard({ data, loading, error, availableDates = [], selectedDate, onDateChange, onRefresh }) {
    const [searchQuery, setSearchQuery] = useState('');
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [filterType, setFilterType] = useState('all');
    const [sortField, setSortField] = useState('account_name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [exportOpen, setExportOpen] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    const exportRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (exportRef.current && !exportRef.current.contains(e.target)) {
                setExportOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Computed stats
    const stats = data?.stats || {};
    const assignments = data?.assignments || [];

    // Filter and sort assignments
    const filteredAssignments = useMemo(() => {
        let result = [...assignments];

        if (filterType === 'USER') {
            result = result.filter(a => a.principal_type === 'USER');
        } else if (filterType === 'GROUP') {
            result = result.filter(a => a.principal_type === 'GROUP' || a.principal_type === 'USER_VIA_GROUP');
        }

        if (deferredSearchQuery) {
            const q = deferredSearchQuery.toLowerCase();
            result = result.filter(a =>
                a.account_name?.toLowerCase().includes(q) ||
                a.principal_name?.toLowerCase().includes(q) ||
                a.principal_email?.toLowerCase().includes(q) ||
                a.permission_set_name?.toLowerCase().includes(q) ||
                a.group_name?.toLowerCase().includes(q) ||
                a.account_id?.includes(q)
            );
        }

        result.sort((a, b) => {
            const aVal = (a[sortField] || '').toLowerCase();
            const bVal = (b[sortField] || '').toLowerCase();
            const cmp = aVal.localeCompare(bVal);
            return sortDirection === 'asc' ? cmp : -cmp;
        });

        return result;
    }, [assignments, filterType, deferredSearchQuery, sortField, sortDirection]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [deferredSearchQuery, filterType, sortField, sortDirection]);

    const paginatedAssignments = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredAssignments.slice(startIndex, startIndex + pageSize);
    }, [filteredAssignments, currentPage, pageSize]);

    const totalPages = Math.max(1, Math.ceil(filteredAssignments.length / pageSize));

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // ---- Export Functions ----
    const exportCSV = () => {
        const headers = ['Account Name', 'Account ID', 'Principal Type', 'Principal Name', 'Email', 'Permission Set', 'Group'];
        const rows = filteredAssignments.map(a => [
            a.account_name || '',
            a.account_id || '',
            a.principal_type || '',
            a.principal_name || '',
            a.principal_email || '',
            a.permission_set_name || '',
            a.group_name || '',
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `idc-governance-report-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setExportOpen(false);
    };

    const exportPDF = () => {
        setExportOpen(false);
        window.print();
    };

    if (loading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="dashboard" id="dashboard">
            {/* Print-only header */}
            <div className="print-header" style={{ display: 'none' }}>
                <h1>IAM Identity Center — Governance Report</h1>
                <p>Generated: {new Date().toLocaleString()} • {filteredAssignments.length} assignments</p>
            </div>

            {/* Error banner */}
            {error && (
                <div className="dashboard__alert dashboard__alert--warning" id="error-banner">
                    <svg className="dashboard__alert-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8.982 1.566a1.13 1.13 0 00-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 01-1.1 0L7.1 5.995A.905.905 0 018 5zm.002 6a1 1 0 110 2 1 1 0 010-2z" />
                    </svg>
                    <div className="dashboard__alert-content">
                        <strong>API unavailable</strong> — Showing demonstration data. <span className="dashboard__alert-detail">{error}</span>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            <section className="dashboard__stats" id="stats-section">
                <StatCard
                    label="Total Assignments"
                    value={stats.total_assignments || 0}
                    icon="assignments"
                    color="blue"
                />
                <StatCard
                    label="AWS Accounts"
                    value={stats.total_accounts || 0}
                    icon="accounts"
                    color="teal"
                />
                <StatCard
                    label="Unique Principals"
                    value={stats.total_principals || 0}
                    icon="principals"
                    color="green"
                />
                <StatCard
                    label="Permission Sets"
                    value={stats.total_permission_sets || 0}
                    icon="permissions"
                    color="purple"
                />
            </section>

            {/* Governance Charts */}
            <GovernanceCharts assignments={assignments} stats={stats} />

            {/* Toolbar */}
            <section className="dashboard__toolbar" id="toolbar">
                <div className="toolbar__left">
                    <div className="toolbar__search">
                        <svg className="toolbar__search-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
                        </svg>
                        <input
                            type="text"
                            className="toolbar__input"
                            placeholder="Search by account, principal, permission set..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            id="search-input"
                        />
                    </div>

                    <div className="toolbar__filters">
                        {['all', 'USER', 'GROUP'].map(type => (
                            <button
                                key={type}
                                className={`toolbar__filter ${filterType === type ? 'toolbar__filter--active' : ''}`}
                                onClick={() => setFilterType(type)}
                                id={`filter-${type.toLowerCase()}`}
                            >
                                {type === 'all' ? 'All' : type === 'USER' ? 'Users' : 'Groups'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="toolbar__right">
                    <span className="toolbar__count">
                        {filteredAssignments.length} result{filteredAssignments.length !== 1 ? 's' : ''}
                    </span>

                    {/* Snapshot Date Selector */}
                    {availableDates.length > 0 && (
                        <div className="toolbar__snapshot-selector">
                            <label htmlFor="snapshot-date" className="toolbar__snapshot-label">Snapshot:</label>
                            <select
                                id="snapshot-date"
                                className="toolbar__snapshot-select"
                                value={selectedDate}
                                onChange={(e) => onDateChange(e.target.value)}
                            >
                                {availableDates.map(date => (
                                    <option key={date} value={date}>{date}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {data?.generated_at && (
                        <span className="toolbar__timestamp">
                            Last scan: {new Date(data.generated_at).toLocaleString()}
                        </span>
                    )}

                    <button
                        className="toolbar__action-btn"
                        onClick={onRefresh}
                        title="Refresh data"
                        id="refresh-button"
                    >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M14 8a6 6 0 11-1.06-3.39l.5-1.93A8 8 0 108 16a8 8 0 00.01 0h-.02A6 6 0 0114 8z" />
                            <path d="M14.5 1v3.5H11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>Refresh</span>
                    </button>

                    {/* Export dropdown */}
                    <div className="export-dropdown" ref={exportRef}>
                        <button
                            className="export-dropdown__trigger"
                            onClick={() => setExportOpen(!exportOpen)}
                            id="export-button"
                        >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M4.406 1.342A5.53 5.53 0 018 0c2.69 0 4.923 2 5.166 4.579C14.758 4.804 16 6.137 16 7.773 16 9.569 14.502 11 12.687 11H10a.5.5 0 010-1h2.688C13.979 10 15 8.988 15 7.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 2.825 10.328 1 8 1a4.53 4.53 0 00-2.941 1.1c-.757.652-1.153 1.438-1.153 2.055v.448l-.445.049C2.064 4.805 1 5.952 1 7.318 1 8.785 2.23 10 3.781 10H6a.5.5 0 010 1H3.781C1.708 11 0 9.366 0 7.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383z" />
                                <path d="M7.646 4.146a.5.5 0 01.708 0l3 3a.5.5 0 01-.708.708L8.5 5.707V14.5a.5.5 0 01-1 0V5.707L5.354 7.854a.5.5 0 11-.708-.708l3-3z" />
                            </svg>
                            <span>Export</span>
                            <svg className="export-dropdown__caret" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>

                        {exportOpen && (
                            <div className="export-dropdown__menu">
                                <button className="export-dropdown__item" onClick={exportCSV} id="export-csv">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M14 14.5a.5.5 0 01-.5.5h-11a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5H5v1H3v10h10V4h-2V3h2.5a.5.5 0 01.5.5v11z" />
                                        <path d="M6.854 8.146a.5.5 0 10-.708.708L7.293 10H4.5a.5.5 0 000 1h2.793l-1.147 1.146a.5.5 0 00.708.708l2-2a.5.5 0 000-.708l-2-2z" />
                                    </svg>
                                    <div>
                                        <div className="export-dropdown__item-title">Download CSV</div>
                                        <div className="export-dropdown__item-desc">Comma-separated spreadsheet</div>
                                    </div>
                                </button>
                                <button className="export-dropdown__item" onClick={exportPDF} id="export-pdf">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M5 1a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2V5.414A2 2 0 0012.414 4L10 1.586A2 2 0 008.586 1H5zm1 7a1 1 0 100 2h4a1 1 0 100-2H6zm-1 4a1 1 0 011-1h4a1 1 0 110 2H6a1 1 0 01-1-1zm1-8a1 1 0 000 2h1a1 1 0 100-2H6z" />
                                    </svg>
                                    <div>
                                        <div className="export-dropdown__item-title">Print / Save as PDF</div>
                                        <div className="export-dropdown__item-desc">Opens print dialog</div>
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Assignments Table */}
            <section className="dashboard__table-wrapper" id="assignments-table-section">
                <div className="dashboard__table-header">
                    <h2 className="dashboard__table-title">SSO Assignments</h2>
                    <span className="dashboard__table-badge">{filteredAssignments.length}</span>
                </div>
                <div className="dashboard__table-scroll">
                    <table className="dashboard__table" id="assignments-table">
                        <thead>
                            <tr>
                                <SortHeader field="account_name" label="Account" current={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortHeader field="principal_type" label="Type" current={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortHeader field="principal_name" label="Principal" current={sortField} direction={sortDirection} onSort={handleSort} />
                                <th className="dashboard__th">Email</th>
                                <SortHeader field="permission_set_name" label="Permission Set" current={sortField} direction={sortDirection} onSort={handleSort} />
                                <SortHeader field="group_name" label="Group" current={sortField} direction={sortDirection} onSort={handleSort} />
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedAssignments.map((a, i) => (
                                <tr key={`${a.account_id}-${a.principal_id || a.principal_name}-${a.permission_set_arn}-${i}`}
                                    className="dashboard__tr">
                                    <td className="dashboard__td">
                                        <div className="cell__account">
                                            <span className="cell__account-name">{a.account_name}</span>
                                            <span className="cell__account-id">{a.account_id}</span>
                                        </div>
                                    </td>
                                    <td className="dashboard__td">
                                        <span className={`badge badge--${a.principal_type === 'USER_VIA_GROUP' ? 'group' : a.principal_type?.toLowerCase()}`}>
                                            {a.principal_type === 'USER_VIA_GROUP' ? 'GROUP' : a.principal_type}
                                        </span>
                                    </td>
                                    <td className="dashboard__td cell__principal">{a.principal_name}</td>
                                    <td className="dashboard__td cell__email">{a.principal_email || '—'}</td>
                                    <td className="dashboard__td">
                                        <span className="cell__permission">{a.permission_set_name}</span>
                                    </td>
                                    <td className="dashboard__td cell__group">{a.group_name || '—'}</td>
                                </tr>
                            ))}
                            {paginatedAssignments.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="dashboard__td dashboard__empty">
                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <circle cx="10" cy="10" r="8" />
                                            <path d="M7 13s1-1.5 3-1.5 3 1.5 3 1.5M7.5 7.5h.01M12.5 7.5h.01" />
                                        </svg>
                                        <span>No assignments match your search criteria.</span>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {filteredAssignments.length > 0 && (
                    <div className="dashboard__pagination">
                        <div className="pagination__left">
                            <label htmlFor="page-size">Items per page</label>
                            <select
                                id="page-size"
                                className="pagination__select"
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                }}
                            >
                                <option value={10}>10</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={500}>500</option>
                            </select>
                        </div>
                        <div className="pagination__right">
                            <span className="pagination__info">
                                {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredAssignments.length)} of {filteredAssignments.length}
                            </span>
                            <div className="pagination__buttons">
                                <button
                                    className="pagination__btn"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(1)}
                                    title="First page"
                                >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M12.854 3.146a.5.5 0 00-.708 0l-4.5 4.5a.5.5 0 000 .708l4.5 4.5a.5.5 0 00.708-.708L8.707 8l4.147-4.146a.5.5 0 000-.708z" />
                                        <path d="M7.854 3.146a.5.5 0 00-.708 0l-4.5 4.5a.5.5 0 000 .708l4.5 4.5a.5.5 0 00.708-.708L4.707 8l4.147-4.146a.5.5 0 000-.708z" />
                                    </svg>
                                </button>
                                <button
                                    className="pagination__btn"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                    title="Previous page"
                                >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M10.854 3.146a.5.5 0 00-.708 0l-4.5 4.5a.5.5 0 000 .708l4.5 4.5a.5.5 0 00.708-.708L6.707 8l4.147-4.146a.5.5 0 000-.708z" />
                                    </svg>
                                </button>
                                <span className="pagination__current-page">{currentPage}</span>
                                <button
                                    className="pagination__btn"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    title="Next page"
                                >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M5.146 3.146a.5.5 0 01.708 0l4.5 4.5a.5.5 0 010 .708l-4.5 4.5a.5.5 0 01-.708-.708L9.293 8 5.146 3.854a.5.5 0 010-.708z" />
                                    </svg>
                                </button>
                                <button
                                    className="pagination__btn"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(totalPages)}
                                    title="Last page"
                                >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M3.146 3.146a.5.5 0 01.708 0l4.5 4.5a.5.5 0 010 .708l-4.5 4.5a.5.5 0 01-.708-.708L7.293 8 3.146 3.854a.5.5 0 010-.708z" />
                                        <path d="M8.146 3.146a.5.5 0 01.708 0l4.5 4.5a.5.5 0 010 .708l-4.5 4.5a.5.5 0 01-.708-.708L12.293 8 8.146 3.854a.5.5 0 010-.708z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

/* ---- Sub-components ---- */

function StatCard({ label, value, icon, color }) {
    const icons = {
        assignments: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="M9 14l2 2 4-4" />
            </svg>
        ),
        accounts: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 3h-8l-2 4h12l-2-4z" />
            </svg>
        ),
        principals: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
        ),
        permissions: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
        ),
    };

    return (
        <div className={`stat-card stat-card--${color}`} id={`stat-${icon}`}>
            <div className="stat-card__icon">{icons[icon]}</div>
            <div className="stat-card__content">
                <span className="stat-card__value">{value.toLocaleString()}</span>
                <span className="stat-card__label">{label}</span>
            </div>
        </div>
    );
}

function SortHeader({ field, label, current, direction, onSort }) {
    const isActive = current === field;

    return (
        <th className={`dashboard__th dashboard__th--sortable ${isActive ? 'dashboard__th--active' : ''}`}
            onClick={() => onSort(field)}>
            <span>{label}</span>
            <svg className="sort-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                {isActive && direction === 'asc' ? (
                    <path d="M5 2l3 4H2l3-4z" />
                ) : isActive && direction === 'desc' ? (
                    <path d="M5 8l3-4H2l3 4z" />
                ) : (
                    <>
                        <path d="M5 2l2.5 3H2.5L5 2z" opacity="0.25" />
                        <path d="M5 8l2.5-3H2.5L5 8z" opacity="0.25" />
                    </>
                )}
            </svg>
        </th>
    );
}

function LoadingSkeleton() {
    return (
        <div className="dashboard" id="dashboard-loading">
            <section className="dashboard__stats">
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className="stat-card stat-card--loading shimmer" />
                ))}
            </section>
            <section className="dashboard__table-wrapper">
                <div className="dashboard__table-header">
                    <div className="skeleton-line" style={{ width: 140, height: 20 }} />
                </div>
                <div className="dashboard__table-scroll" style={{ padding: '12px 16px' }}>
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="skeleton-row shimmer" style={{ animationDelay: `${i * 80}ms` }} />
                    ))}
                </div>
            </section>
        </div>
    );
}

export default Dashboard;
