import React, { useState, useMemo, useDeferredValue, useEffect, useRef, useCallback } from 'react';
import './PermissionSetsTable.css';

// Default column definitions: key, label, sortable, initial width (px)
const COLUMNS = [
    { key: 'name',        label: 'Name',        sortable: true,  initWidth: 140 },
    { key: 'description', label: 'Description', sortable: false, initWidth: 200 },
    { key: 'provisioned', label: 'Provisioned', sortable: true,  initWidth: 90 },
    { key: 'session',     label: 'Session',     sortable: true,  initWidth: 65 },
    { key: 'policies',    label: 'Policies',    sortable: true,  initWidth: 220 },
    { key: 'inline',      label: 'Inline',      sortable: false, initWidth: 65 },
    { key: 'boundary',    label: 'Boundary',    sortable: false, initWidth: 130 },
    { key: 'tags',        label: 'Tags',        sortable: false, initWidth: 140 },
    { key: 'created',     label: 'Created',     sortable: true,  initWidth: 90 },
];

const SORT_FIELD_MAP = {
    name: 'name',
    provisioned: 'provisioned_accounts',
    session: 'session_duration',
    policies: 'aws_managed_policies',
    created: 'created_date',
};

function PermissionSetsTable({ data, loading, availableDates = [], selectedDate, onDateChange, onRefresh }) {
    const [searchQuery, setSearchQuery] = useState('');
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [sortField, setSortField] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [expandedRow, setExpandedRow] = useState(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [exportOpen, setExportOpen] = useState(false);
    const exportRef = useRef(null);

    // Column resize state
    const [colWidths, setColWidths] = useState(() => COLUMNS.map(c => c.initWidth));
    const resizeRef = useRef(null); // { colIndex, startX, startWidth }

    const handleResizeStart = useCallback((e, colIndex) => {
        e.preventDefault();
        e.stopPropagation();
        resizeRef.current = { colIndex, startX: e.clientX, startWidth: colWidths[colIndex] };

        const handleMove = (moveEvt) => {
            if (!resizeRef.current) return;
            const { colIndex: ci, startX, startWidth } = resizeRef.current;
            const delta = moveEvt.clientX - startX;
            const newWidth = Math.max(40, startWidth + delta);
            setColWidths(prev => {
                const next = [...prev];
                next[ci] = newWidth;
                return next;
            });
        };

        const handleUp = () => {
            resizeRef.current = null;
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
    }, [colWidths]);

    // Close export dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (exportRef.current && !exportRef.current.contains(e.target)) {
                setExportOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const permissionSets = data?.permission_sets || [];
    const stats = data?.stats || {};

    // Filter and sort
    const filteredSets = useMemo(() => {
        let result = [...permissionSets];

        if (deferredSearchQuery) {
            const q = deferredSearchQuery.toLowerCase();
            result = result.filter(ps =>
                ps.name?.toLowerCase().includes(q) ||
                ps.arn?.toLowerCase().includes(q) ||
                ps.description?.toLowerCase().includes(q) ||
                ps.aws_managed_policies?.some(p => p.name?.toLowerCase().includes(q)) ||
                ps.customer_managed_policies?.some(p => p.name?.toLowerCase().includes(q)) ||
                ps.tags?.some(t => t.Key?.toLowerCase().includes(q) || t.Value?.toLowerCase().includes(q))
            );
        }

        result.sort((a, b) => {
            let aVal, bVal;
            if (sortField === 'aws_managed_policies') {
                aVal = (a.aws_managed_policies || []).length;
                bVal = (b.aws_managed_policies || []).length;
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }
            if (sortField === 'provisioned_accounts') {
                aVal = a.provisioned_accounts || 0;
                bVal = b.provisioned_accounts || 0;
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }
            aVal = (a[sortField] || '').toString().toLowerCase();
            bVal = (b[sortField] || '').toString().toLowerCase();
            const cmp = aVal.localeCompare(bVal);
            return sortDirection === 'asc' ? cmp : -cmp;
        });

        return result;
    }, [permissionSets, deferredSearchQuery, sortField, sortDirection]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [deferredSearchQuery, sortField, sortDirection]);

    const paginatedSets = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredSets.slice(startIndex, startIndex + pageSize);
    }, [filteredSets, currentPage, pageSize]);

    const totalPages = Math.max(1, Math.ceil(filteredSets.length / pageSize));

    const handleSort = (colKey) => {
        const field = SORT_FIELD_MAP[colKey] || colKey;
        if (sortField === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const toggleExpand = (idx) => {
        setExpandedRow(expandedRow === idx ? null : idx);
    };

    // Format ISO 8601 duration like PT1H, PT4H, PT12H
    const formatDuration = (duration) => {
        if (!duration) return '—';
        const match = duration.match(/PT(\d+)H/);
        if (match) return `${match[1]}h`;
        const matchM = duration.match(/PT(\d+)M/);
        if (matchM) return `${matchM[1]}m`;
        return duration;
    };

    // Format JSON for display
    const formatJSON = (jsonStr) => {
        if (!jsonStr) return '';
        try {
            return JSON.stringify(JSON.parse(jsonStr), null, 2);
        } catch {
            return jsonStr;
        }
    };

    // Build AWS managed policy documentation URL
    const getAwsPolicyDocUrl = (policyName) => {
        return `https://docs.aws.amazon.com/aws-managed-policy/latest/reference/${policyName}.html`;
    };

    // ---- Export Functions ----
    const exportCSV = () => {
        const headers = [
            'Name', 'Description', 'ARN', 'Provisioned Accounts', 'Session Duration',
            'AWS Managed Policies', 'Customer Managed Policies', 'Has Inline Policy',
            'Permissions Boundary', 'Tags', 'Created Date'
        ];
        const rows = filteredSets.map(ps => [
            ps.name || '',
            ps.description || '',
            ps.arn || '',
            String(ps.provisioned_accounts || 0),
            ps.session_duration || '',
            (ps.aws_managed_policies || []).map(p => p.name).join('; '),
            (ps.customer_managed_policies || []).map(p => p.name).join('; '),
            ps.inline_policy ? 'Yes' : 'No',
            ps.permissions_boundary
                ? (ps.permissions_boundary.managed_policy_arn || '')
                  + (ps.permissions_boundary.customer_managed_policy_reference?.name || '')
                : '',
            (ps.tags || []).map(t => `${t.Key}=${t.Value}`).join('; '),
            ps.created_date || '',
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `permission-sets-${new Date().toISOString().slice(0, 10)}.csv`;
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
        return <PSLoadingSkeleton />;
    }

    return (
        <div className="ps-container" id="permission-sets-view">
            {/* Stats */}
            <section className="ps-stats" id="ps-stats-section">
                <div className="ps-stat-card ps-stat-card--purple" id="stat-total-ps">
                    <div className="ps-stat-card__icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0110 0v4" />
                        </svg>
                    </div>
                    <div className="ps-stat-card__content">
                        <span className="ps-stat-card__value">{stats.total_permission_sets || permissionSets.length}</span>
                        <span className="ps-stat-card__label">Permission Sets</span>
                    </div>
                </div>
                <div className="ps-stat-card ps-stat-card--blue" id="stat-with-inline">
                    <div className="ps-stat-card__icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                    </div>
                    <div className="ps-stat-card__content">
                        <span className="ps-stat-card__value">{permissionSets.filter(ps => ps.inline_policy).length}</span>
                        <span className="ps-stat-card__label">With Inline Policy</span>
                    </div>
                </div>
                <div className="ps-stat-card ps-stat-card--teal" id="stat-with-boundary">
                    <div className="ps-stat-card__icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    </div>
                    <div className="ps-stat-card__content">
                        <span className="ps-stat-card__value">{permissionSets.filter(ps => ps.permissions_boundary).length}</span>
                        <span className="ps-stat-card__label">With Boundary</span>
                    </div>
                </div>
                <div className="ps-stat-card ps-stat-card--green" id="stat-provisioned">
                    <div className="ps-stat-card__icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                    </div>
                    <div className="ps-stat-card__content">
                        <span className="ps-stat-card__value">{permissionSets.filter(ps => (ps.provisioned_accounts || 0) > 0).length}</span>
                        <span className="ps-stat-card__label">Provisioned</span>
                    </div>
                </div>
            </section>

            {/* Toolbar */}
            <section className="ps-toolbar" id="ps-toolbar">
                <div className="toolbar__left">
                    <div className="toolbar__search">
                        <svg className="toolbar__search-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
                        </svg>
                        <input
                            type="text"
                            className="toolbar__input"
                            placeholder="Search by name, policy, tag..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            id="ps-search-input"
                        />
                    </div>
                </div>
                <div className="toolbar__right">
                    <span className="toolbar__count">
                        {filteredSets.length} permission set{filteredSets.length !== 1 ? 's' : ''}
                    </span>

                    {availableDates.length > 0 && (
                        <div className="toolbar__snapshot-selector">
                            <label htmlFor="ps-snapshot-date" className="toolbar__snapshot-label">Snapshot:</label>
                            <select
                                id="ps-snapshot-date"
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
                        id="ps-refresh-button"
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
                            id="ps-export-button"
                        >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z" />
                                <path d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z" />
                            </svg>
                            <span>Export</span>
                            <svg className="export-dropdown__caret" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                <path d="M2.5 4l2.5 3 2.5-3h-5z" />
                            </svg>
                        </button>
                        {exportOpen && (
                            <div className="export-dropdown__menu">
                                <button className="export-dropdown__item" onClick={exportCSV} id="ps-export-csv">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M14 14V4.5L9.5 0H4a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2zM9.5 3A1.5 1.5 0 0011 4.5h2V14a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1h5.5v2z" />
                                    </svg>
                                    <div>
                                        <div className="export-dropdown__item-title">Download CSV</div>
                                        <div className="export-dropdown__item-desc">Comma-separated spreadsheet</div>
                                    </div>
                                </button>
                                <button className="export-dropdown__item" onClick={exportPDF} id="ps-export-pdf">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M5 1a2 2 0 00-2 2v1h10V3a2 2 0 00-2-2H5zm6 4H5a3 3 0 00-3 3v3a3 3 0 003 3h6a3 3 0 003-3V8a3 3 0 00-3-3z" />
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

            {/* Table */}
            <section className="ps-table-wrapper" id="ps-table-section">
                <div className="ps-table-header">
                    <h2 className="ps-table-title">Permission Sets</h2>
                    <span className="ps-table-badge">{filteredSets.length}</span>
                </div>
                <div className="ps-legend">
                    <span className="ps-legend__item">
                        <span className="ps-legend__swatch ps-legend__swatch--aws"></span> AWS Managed Policy
                    </span>
                    <span className="ps-legend__item">
                        <span className="ps-legend__swatch ps-legend__swatch--customer"></span> Customer Managed Policy
                    </span>
                    <span className="ps-legend__sep">|</span>
                    <span className="ps-legend__hint">Click policy names to view AWS docs · Drag column edges to resize</span>
                </div>
                <div className="ps-table-scroll">
                    <table className="ps-table" id="permission-sets-table">
                        <colgroup>
                            {colWidths.map((w, i) => (
                                <col key={i} style={{ width: w }} />
                            ))}
                        </colgroup>
                        <thead>
                            <tr>
                                {COLUMNS.map((col, i) => (
                                    <th
                                        key={col.key}
                                        className={`ps-th ${col.sortable ? 'ps-th--sortable' : ''} ${sortField === (SORT_FIELD_MAP[col.key] || col.key) ? 'ps-th--active' : ''}`}
                                        onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                    >
                                        <span className="ps-th__label">{col.label}</span>
                                        {col.sortable && (
                                            <svg className="sort-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                                {sortField === (SORT_FIELD_MAP[col.key] || col.key) && sortDirection === 'asc' ? (
                                                    <path d="M5 2l3 4H2l3-4z" />
                                                ) : sortField === (SORT_FIELD_MAP[col.key] || col.key) && sortDirection === 'desc' ? (
                                                    <path d="M5 8l3-4H2l3 4z" />
                                                ) : (
                                                    <>
                                                        <path d="M5 2l2.5 3H2.5L5 2z" opacity="0.25" />
                                                        <path d="M5 8l2.5-3H2.5L5 8z" opacity="0.25" />
                                                    </>
                                                )}
                                            </svg>
                                        )}
                                        {/* Resize handle */}
                                        <div
                                            className="ps-resize-handle"
                                            onMouseDown={(e) => handleResizeStart(e, i)}
                                            title="Drag to resize column"
                                        />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedSets.map((ps, i) => {
                                const globalIdx = (currentPage - 1) * pageSize + i;
                                const isExpanded = expandedRow === globalIdx;
                                const isProvisioned = (ps.provisioned_accounts || 0) > 0;
                                const allPolicies = [
                                    ...(ps.aws_managed_policies || []).map(p => ({ ...p, type: 'aws' })),
                                    ...(ps.customer_managed_policies || []).map(p => ({ ...p, type: 'customer' })),
                                ];
                                return (
                                    <React.Fragment key={ps.arn || i}>
                                        <tr className={`ps-tr ${isExpanded ? 'ps-tr--expanded' : ''}`}>
                                            {/* Name + ARN */}
                                            <td className="ps-td">
                                                <span className="ps-name">{ps.name}</span>
                                                <span className="ps-arn" title={ps.arn}>
                                                    {ps.arn ? `…${ps.arn.split('/').pop()}` : ''}
                                                </span>
                                            </td>
                                            {/* Description */}
                                            <td className="ps-td">
                                                {ps.description ? (
                                                    <span className="ps-desc">{ps.description}</span>
                                                ) : (
                                                    <span className="ps-empty">—</span>
                                                )}
                                            </td>
                                            {/* Provisioned */}
                                            <td className="ps-td">
                                                {isProvisioned ? (
                                                    <span className="ps-prov-badge ps-prov-badge--yes" title={`Provisioned to ${ps.provisioned_accounts} account(s)`}>
                                                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 01.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/></svg>
                                                        {ps.provisioned_accounts}
                                                    </span>
                                                ) : (
                                                    <span className="ps-prov-badge ps-prov-badge--no" title="Not provisioned">
                                                        No
                                                    </span>
                                                )}
                                            </td>
                                            {/* Session */}
                                            <td className="ps-td">
                                                <span className="ps-duration">{formatDuration(ps.session_duration)}</span>
                                            </td>
                                            {/* Policies (combined AWS + Customer) */}
                                            <td className="ps-td">
                                                {allPolicies.length > 0 ? (
                                                    <div className="ps-policy-list">
                                                        {allPolicies.map((p, j) => (
                                                            p.type === 'aws' ? (
                                                                <a key={j} href={getAwsPolicyDocUrl(p.name)} target="_blank" rel="noopener noreferrer"
                                                                    className="ps-policy ps-policy--aws" title={p.arn}>
                                                                    {p.name}
                                                                    <svg className="ps-ext-icon" width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
                                                                        <path d="M8.636 3.5a.5.5 0 00-.5-.5H1.5A1.5 1.5 0 000 4.5v10A1.5 1.5 0 001.5 16h10a1.5 1.5 0 001.5-1.5V7.864a.5.5 0 00-1 0V14.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5v-10a.5.5 0 01.5-.5h6.636a.5.5 0 00.5-.5z"/>
                                                                        <path d="M16 .5a.5.5 0 00-.5-.5h-5a.5.5 0 000 1h3.793L6.146 9.146a.5.5 0 10.708.708L15 1.707V5.5a.5.5 0 001 0v-5z"/>
                                                                    </svg>
                                                                </a>
                                                            ) : (
                                                                <span key={j} className="ps-policy ps-policy--customer" title={`Customer Managed Policy — Path: ${p.path}`}>
                                                                    {p.name}
                                                                </span>
                                                            )
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="ps-empty">—</span>
                                                )}
                                            </td>
                                            {/* Inline Policy */}
                                            <td className="ps-td">
                                                {ps.inline_policy ? (
                                                    <button
                                                        className={`ps-json-btn ${isExpanded ? 'ps-json-btn--active' : ''}`}
                                                        onClick={() => toggleExpand(globalIdx)}
                                                        id={`inline-toggle-${globalIdx}`}
                                                    >
                                                        {isExpanded ? '▾ Hide' : '▸ JSON'}
                                                    </button>
                                                ) : (
                                                    <span className="ps-empty">—</span>
                                                )}
                                            </td>
                                            {/* Boundary */}
                                            <td className="ps-td">
                                                {ps.permissions_boundary ? (
                                                    <>
                                                        {ps.permissions_boundary.managed_policy_arn && (
                                                            <a
                                                                href={getAwsPolicyDocUrl(ps.permissions_boundary.managed_policy_arn.split('/').pop())}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="ps-policy ps-policy--aws"
                                                                title={ps.permissions_boundary.managed_policy_arn}
                                                            >
                                                                {ps.permissions_boundary.managed_policy_arn.split('/').pop()}
                                                                <svg className="ps-ext-icon" width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
                                                                    <path d="M8.636 3.5a.5.5 0 00-.5-.5H1.5A1.5 1.5 0 000 4.5v10A1.5 1.5 0 001.5 16h10a1.5 1.5 0 001.5-1.5V7.864a.5.5 0 00-1 0V14.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5v-10a.5.5 0 01.5-.5h6.636a.5.5 0 00.5-.5z"/>
                                                                    <path d="M16 .5a.5.5 0 00-.5-.5h-5a.5.5 0 000 1h3.793L6.146 9.146a.5.5 0 10.708.708L15 1.707V5.5a.5.5 0 001 0v-5z"/>
                                                                </svg>
                                                            </a>
                                                        )}
                                                        {ps.permissions_boundary.customer_managed_policy_reference && (
                                                            <span className="ps-policy ps-policy--customer" title={`Customer Managed Policy — ${ps.permissions_boundary.customer_managed_policy_reference.name}`}>
                                                                {ps.permissions_boundary.customer_managed_policy_reference.name}
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="ps-empty">—</span>
                                                )}
                                            </td>
                                            {/* Tags */}
                                            <td className="ps-td">
                                                {(ps.tags || []).length > 0 ? (
                                                    <div className="ps-tag-list">
                                                        {ps.tags.map((t, j) => (
                                                            <span key={j} className="ps-tag">
                                                                <span className="ps-tag__k">{t.Key}</span>
                                                                <span className="ps-tag__v">{t.Value}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="ps-empty">—</span>
                                                )}
                                            </td>
                                            {/* Created */}
                                            <td className="ps-td">
                                                {ps.created_date ? new Date(ps.created_date).toLocaleDateString() : '—'}
                                            </td>
                                        </tr>
                                        {/* Expanded inline policy row */}
                                        {isExpanded && ps.inline_policy && (
                                            <tr className="ps-tr ps-tr--inline-expand">
                                                <td colSpan={COLUMNS.length} className="ps-td ps-inline-cell">
                                                    <div className="ps-json-viewer">
                                                        <div className="ps-json-viewer__head">
                                                            <span>Inline Policy — {ps.name}</span>
                                                            <button className="ps-json-viewer__close" onClick={() => setExpandedRow(null)}>✕</button>
                                                        </div>
                                                        <pre className="ps-json-viewer__code"><code>{formatJSON(ps.inline_policy)}</code></pre>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            {paginatedSets.length === 0 && (
                                <tr>
                                    <td colSpan={COLUMNS.length} className="ps-td ps-table-empty">
                                        No permission sets match your search criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredSets.length > 0 && (
                    <div className="dashboard__pagination">
                        <div className="pagination__left">
                            <label htmlFor="ps-page-size">Items per page</label>
                            <select id="ps-page-size" className="pagination__select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                                <option value={10}>10</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                        <div className="pagination__right">
                            <span className="pagination__info">
                                {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredSets.length)} of {filteredSets.length}
                            </span>
                            <div className="pagination__buttons">
                                <button className="pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>&laquo;</button>
                                <button className="pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>&lsaquo;</button>
                                <span className="pagination__current-page">{currentPage}</span>
                                <button className="pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>&rsaquo;</button>
                                <button className="pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>&raquo;</button>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

/* ---- Sub-components ---- */

function PSLoadingSkeleton() {
    return (
        <div className="ps-container" id="ps-loading">
            <section className="ps-stats">
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className="ps-stat-card ps-stat-card--loading shimmer" />
                ))}
            </section>
            <section className="ps-table-wrapper">
                <div className="ps-table-header">
                    <div className="skeleton-line" style={{ width: 180, height: 20 }} />
                </div>
                <div style={{ padding: '12px 16px' }}>
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="skeleton-row shimmer" style={{ animationDelay: `${i * 80}ms` }} />
                    ))}
                </div>
            </section>
        </div>
    );
}

export default PermissionSetsTable;
