import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import './SecurityTab.css';

/* ================================================================
   Risk Level Definitions
   ================================================================ */
const RISK_CONFIG = {
    critical: { label: 'Critical', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🔴' },
    high:     { label: 'High',     color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', icon: '🟠' },
    medium:   { label: 'Medium',   color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '🟡' },
    low:      { label: 'Low',      color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', icon: '🟢' },
};

const RULE_TYPES = [
    { value: 'managed_policy_name', label: 'Managed Policy Name' },
    { value: 'inline_policy_action', label: 'Inline Policy Action' },
];

const RISK_LEVELS = [
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
];

/* ================================================================
   SecurityTab — Main Component
   ================================================================ */
export default function SecurityTab({
    permissionSetsData,
    riskPolicies,
    riskSource,
    onSaveRiskPolicies,
    loading,
}) {
    const permissionSets = permissionSetsData?.permission_sets || [];

    /* ---- Risk overview stats ---- */
    const riskStats = useMemo(() => {
        const counts = { critical: 0, high: 0, medium: 0, low: 0 };
        permissionSets.forEach(ps => {
            const level = ps.risk_level || 'low';
            counts[level] = (counts[level] || 0) + 1;
        });
        return counts;
    }, [permissionSets]);

    const totalPS = permissionSets.length;

    /* ---- Flagged permission sets list ---- */
    const flaggedPS = useMemo(() => {
        return permissionSets
            .filter(ps => ps.risk_level && ps.risk_level !== 'low')
            .sort((a, b) => {
                const order = { critical: 0, high: 1, medium: 2, low: 3 };
                return (order[a.risk_level] || 3) - (order[b.risk_level] || 3);
            });
    }, [permissionSets]);

    /* ---- Rule editor state ---- */
    const [editingRules, setEditingRules] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);

    /* ---- Pagination state ---- */
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    /* ---- Export state ---- */
    const [exportOpen, setExportOpen] = useState(false);
    const exportRef = useRef(null);

    const currentRules = editingRules || riskPolicies?.rules || [];

    const totalPages = Math.max(1, Math.ceil(currentRules.length / pageSize));

    const paginatedRules = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return currentRules.slice(startIndex, startIndex + pageSize);
    }, [currentRules, currentPage, pageSize]);

    /* Reset page when toggling edit mode */
    const isEditing = editingRules !== null;
    useEffect(() => {
        setCurrentPage(1);
    }, [isEditing]);

    /* Close export dropdown on outside click */
    useEffect(() => {
        const handleClick = (e) => {
            if (exportRef.current && !exportRef.current.contains(e.target)) {
                setExportOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const startEditing = useCallback(() => {
        setEditingRules([...(riskPolicies?.rules || [])]);
        setSaveMessage(null);
    }, [riskPolicies]);

    const cancelEditing = () => {
        setEditingRules(null);
        setSaveMessage(null);
    };

    const addRule = () => {
        setEditingRules(prev => {
            const updated = [
                ...(prev || []),
                { type: 'managed_policy_name', pattern: '', risk: 'medium', reason: '' },
            ];
            // Navigate to last page to show the new rule
            const newTotalPages = Math.max(1, Math.ceil(updated.length / pageSize));
            setCurrentPage(newTotalPages);
            return updated;
        });
    };

    const updateRule = (pageIndex, field, value) => {
        const globalIndex = (currentPage - 1) * pageSize + pageIndex;
        setEditingRules(prev => {
            const updated = [...prev];
            updated[globalIndex] = { ...updated[globalIndex], [field]: value };
            return updated;
        });
    };

    const deleteRule = (pageIndex) => {
        const globalIndex = (currentPage - 1) * pageSize + pageIndex;
        setEditingRules(prev => {
            const updated = prev.filter((_, i) => i !== globalIndex);
            // Adjust page if we deleted the last item on the current page
            const newTotalPages = Math.max(1, Math.ceil(updated.length / pageSize));
            if (currentPage > newTotalPages) {
                setCurrentPage(newTotalPages);
            }
            return updated;
        });
    };

    const saveRules = async () => {
        setSaving(true);
        setSaveMessage(null);
        try {
            await onSaveRiskPolicies({ version: 1, rules: editingRules });
            setSaveMessage({ type: 'success', text: `Saved ${editingRules.length} rules. Run a new crawl to apply risk scoring.` });
            setEditingRules(null);
        } catch (err) {
            setSaveMessage({ type: 'error', text: err.message || 'Failed to save rules' });
        } finally {
            setSaving(false);
        }
    };

    const resetToDefaults = () => {
        if (window.confirm('Reset all rules to industry-standard defaults? This will discard any custom rules.')) {
            setEditingRules(null);
            onSaveRiskPolicies(null);
            setSaveMessage({ type: 'success', text: 'Reset to defaults. Run a new crawl to apply.' });
        }
    };

    /* ---- Export functions ---- */
    const exportRulesCSV = () => {
        const headers = ['Type', 'Pattern', 'Risk Level', 'Reason'];
        const rows = currentRules.map(r => [
            r.type || '',
            r.pattern || '',
            r.risk || '',
            r.reason || '',
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `risk-policy-rules-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setExportOpen(false);
    };

    const exportRulesPDF = () => {
        setExportOpen(false);
        window.print();
    };

    if (loading) {
        return (
            <div className="security-container">
                <div className="security-loading">
                    <div className="security-loading__spinner" />
                    Loading security data…
                </div>
            </div>
        );
    }

    return (
        <div className="security-container">
            {/* Risk Overview Stats */}
            <section className="security-stats">
                {Object.entries(RISK_CONFIG).map(([level, config]) => (
                    <div
                        className={`security-stat-card security-stat-card--${level}`}
                        key={level}
                    >
                        <div className="security-stat-card__icon">{config.icon}</div>
                        <div className="security-stat-card__content">
                            <span className="security-stat-card__value">{riskStats[level]}</span>
                            <span className="security-stat-card__label">{config.label} Risk</span>
                        </div>
                    </div>
                ))}
            </section>

            {/* Flagged Permission Sets */}
            <section className="security-panel">
                <div className="security-panel__header">
                    <div>
                        <h3 className="security-panel__title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            Flagged Permission Sets
                        </h3>
                        <p className="security-panel__subtitle">
                            {flaggedPS.length} of {totalPS} permission sets flagged ({totalPS - flaggedPS.length} low risk)
                        </p>
                    </div>
                </div>
                <div className="security-panel__body">
                    {flaggedPS.length === 0 ? (
                        <p className="security-panel__empty">No flagged permission sets. All permission sets are low risk.</p>
                    ) : (
                        <table className="security-flagged-table">
                            <thead>
                                <tr>
                                    <th>Risk</th>
                                    <th>Permission Set</th>
                                    <th>Reasons</th>
                                </tr>
                            </thead>
                            <tbody>
                                {flaggedPS.map((ps, i) => {
                                    const config = RISK_CONFIG[ps.risk_level] || RISK_CONFIG.low;
                                    return (
                                        <tr key={ps.arn || i}>
                                            <td>
                                                <span
                                                    className="risk-badge"
                                                    style={{
                                                        background: config.bg,
                                                        color: config.color,
                                                        border: `1px solid ${config.border}`,
                                                    }}
                                                >
                                                    {config.icon} {config.label}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="security-ps-name">{ps.name}</span>
                                                <span className="security-ps-arn">{ps.arn}</span>
                                            </td>
                                            <td>
                                                <ul className="security-reasons">
                                                    {(ps.risk_reasons || []).map((r, j) => (
                                                        <li key={j}>
                                                            <code className="security-reason__rule">{r.rule}</code>
                                                            <span className="security-reason__text">{r.reason}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            {/* Risk Policy Editor */}
            <section className="security-panel">
                <div className="security-panel__header">
                    <div>
                        <h3 className="security-panel__title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                            Risk Policy Rules
                        </h3>
                        <p className="security-panel__subtitle">
                            {currentRules.length} rules · Source: {riskSource === 'custom' ? 'Custom (saved)' : 'Industry defaults'}
                        </p>
                    </div>
                    <div className="security-panel__actions">
                        {/* Export dropdown */}
                        <div className="security-export-dropdown" ref={exportRef}>
                            <button className="security-export-dropdown__trigger" onClick={() => setExportOpen(!exportOpen)}>
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8 1a.5.5 0 01.5.5v9.793l3.146-3.147a.5.5 0 01.708.708l-4 4a.5.5 0 01-.708 0l-4-4a.5.5 0 01.708-.708L7.5 11.293V1.5A.5.5 0 018 1z"/>
                                    <path d="M2 13.5a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11a.5.5 0 01-.5-.5z"/>
                                </svg>
                                <span>Export</span>
                                <svg className="security-export-dropdown__caret" width="8" height="8" viewBox="0 0 10 10" fill="none">
                                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>
                            {exportOpen && (
                                <div className="security-export-dropdown__menu">
                                    <button className="security-export-dropdown__item" onClick={exportRulesCSV}>
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                            <path d="M14 14.5H2a1 1 0 01-1-1v-11a1 1 0 011-1h5l2 2h5a1 1 0 011 1v9a1 1 0 01-1 1z"/>
                                        </svg>
                                        <div>
                                            <div className="security-export-dropdown__item-title">Download CSV</div>
                                            <div className="security-export-dropdown__item-desc">Comma-separated spreadsheet</div>
                                        </div>
                                    </button>
                                    <button className="security-export-dropdown__item" onClick={exportRulesPDF}>
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                            <path d="M5 1a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2V5l-4-4H5zm4 0v3a1 1 0 001 1h3"/>
                                        </svg>
                                        <div>
                                            <div className="security-export-dropdown__item-title">Print / Save as PDF</div>
                                            <div className="security-export-dropdown__item-desc">Opens print dialog</div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>

                        {editingRules === null ? (
                            <button className="security-btn security-btn--primary" onClick={startEditing}>
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M12.854 0.146a.5.5 0 00-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 000-.708l-3-3zM13.5 6.207L9.793 2.5 3.5 8.793V12.5h3.707l6.293-6.293z"/>
                                    <path d="M1 13.5A1.5 1.5 0 002.5 15h11a1.5 1.5 0 001.5-1.5v-6a.5.5 0 00-1 0v6a.5.5 0 01-.5.5h-11a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5H9a.5.5 0 000-1H2.5A1.5 1.5 0 001 2.5v11z"/>
                                </svg>
                                Edit Rules
                            </button>
                        ) : (
                            <>
                                <button className="security-btn security-btn--success" onClick={saveRules} disabled={saving}>
                                    {saving ? 'Saving…' : 'Save Rules'}
                                </button>
                                <button className="security-btn security-btn--ghost" onClick={cancelEditing}>
                                    Cancel
                                </button>
                            </>
                        )}
                        <button className="security-btn security-btn--ghost" onClick={resetToDefaults}>
                            Reset to Defaults
                        </button>
                    </div>
                </div>

                {saveMessage && (
                    <div className={`security-message security-message--${saveMessage.type}`}>
                        {saveMessage.text}
                    </div>
                )}

                <div className="security-panel__body">
                    <table className="security-rules-table">
                        <thead>
                            <tr>
                                <th style={{ width: 180 }}>Type</th>
                                <th style={{ width: 200 }}>Pattern</th>
                                <th style={{ width: 100 }}>Risk Level</th>
                                <th>Reason</th>
                                {editingRules !== null && <th style={{ width: 50 }}></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRules.map((rule, i) => (
                                <tr key={i}>
                                    <td>
                                        {editingRules !== null ? (
                                            <select value={rule.type} onChange={e => updateRule(i, 'type', e.target.value)}>
                                                {RULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                            </select>
                                        ) : (
                                            <span className="security-rule-type">{RULE_TYPES.find(t => t.value === rule.type)?.label || rule.type}</span>
                                        )}
                                    </td>
                                    <td>
                                        {editingRules !== null ? (
                                            <input
                                                type="text"
                                                value={rule.pattern}
                                                onChange={e => updateRule(i, 'pattern', e.target.value)}
                                                placeholder="e.g., AdministratorAccess"
                                            />
                                        ) : (
                                            <code className="security-rule-pattern">{rule.pattern}</code>
                                        )}
                                    </td>
                                    <td>
                                        {editingRules !== null ? (
                                            <select value={rule.risk} onChange={e => updateRule(i, 'risk', e.target.value)}>
                                                {RISK_LEVELS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                            </select>
                                        ) : (
                                            <span
                                                className="risk-badge risk-badge--sm"
                                                style={{
                                                    background: RISK_CONFIG[rule.risk]?.bg,
                                                    color: RISK_CONFIG[rule.risk]?.color,
                                                    border: `1px solid ${RISK_CONFIG[rule.risk]?.border}`,
                                                }}
                                            >
                                                {RISK_CONFIG[rule.risk]?.label || rule.risk}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        {editingRules !== null ? (
                                            <input
                                                type="text"
                                                value={rule.reason}
                                                onChange={e => updateRule(i, 'reason', e.target.value)}
                                                placeholder="Why is this risky?"
                                            />
                                        ) : (
                                            <span className="security-rule-reason">{rule.reason}</span>
                                        )}
                                    </td>
                                    {editingRules !== null && (
                                        <td>
                                            <button
                                                className="security-btn security-btn--danger security-btn--icon"
                                                onClick={() => deleteRule(i)}
                                                title="Delete rule"
                                            >
                                                ✕
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {editingRules !== null && (
                        <button className="security-btn security-btn--add" onClick={addRule}>
                            + Add Rule
                        </button>
                    )}
                </div>

                {/* Pagination controls */}
                {currentRules.length > 0 && (
                    <div className="security-rules-pagination">
                        <div className="pagination__left">
                            <label>Rules per page</label>
                            <select
                                className="pagination__select"
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                        <div className="pagination__right">
                            <span className="pagination__info">
                                {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, currentRules.length)} of {currentRules.length} rules
                            </span>
                            <div className="pagination__buttons">
                                <button className="pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage(1)} title="First page">
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8.354 1.646a.5.5 0 010 .708L2.707 8l5.647 5.646a.5.5 0 01-.708.708l-6-6a.5.5 0 010-.708l6-6a.5.5 0 01.708 0z"/><path d="M12.354 1.646a.5.5 0 010 .708L6.707 8l5.647 5.646a.5.5 0 01-.708.708l-6-6a.5.5 0 010-.708l6-6a.5.5 0 01.708 0z"/></svg>
                                </button>
                                <button className="pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} title="Previous page">
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.354 1.646a.5.5 0 010 .708L5.707 8l5.647 5.646a.5.5 0 01-.708.708l-6-6a.5.5 0 010-.708l6-6a.5.5 0 01.708 0z"/></svg>
                                </button>
                                <span className="pagination__current-page">{currentPage}</span>
                                <button className="pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} title="Next page">
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 1.646a.5.5 0 01.708 0l6 6a.5.5 0 010 .708l-6 6a.5.5 0 01-.708-.708L10.293 8 4.646 2.354a.5.5 0 010-.708z"/></svg>
                                </button>
                                <button className="pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)} title="Last page">
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.646 1.646a.5.5 0 01.708 0l6 6a.5.5 0 010 .708l-6 6a.5.5 0 01-.708-.708L9.293 8 3.646 2.354a.5.5 0 010-.708z"/><path d="M7.646 1.646a.5.5 0 01.708 0l6 6a.5.5 0 010 .708l-6 6a.5.5 0 01-.708-.708L13.293 8 7.646 2.354a.5.5 0 010-.708z"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

/* ================================================================
   Reusable RiskBadge component — exported for other tabs
   ================================================================ */
export function RiskBadge({ level, showLabel = true }) {
    const config = RISK_CONFIG[level] || RISK_CONFIG.low;
    if (level === 'low') return null; // Don't show badge for low risk

    return (
        <span
            className="risk-badge risk-badge--sm"
            style={{
                background: config.bg,
                color: config.color,
                border: `1px solid ${config.border}`,
            }}
            title={`${config.label} risk`}
        >
            {config.icon}{showLabel ? ` ${config.label}` : ''}
        </span>
    );
}
