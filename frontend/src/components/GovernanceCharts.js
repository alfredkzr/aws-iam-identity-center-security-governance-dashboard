import React, { useMemo, useState } from 'react';
import './GovernanceCharts.css';

/* ================================================================
   Colour palettes for chart segments
   ================================================================ */
const ACCOUNT_COLORS = [
    '#0073bb', '#0d7c8a', '#1d8102', '#6b2fa0',
    '#ec7211', '#d13212', '#8a6d14', '#37475a',
];


const PS_COLORS = [
    '#6b2fa0', '#9b59b6', '#8e44ad', '#7d3c98',
    '#a569bd', '#c39bd3', '#d2b4de', '#e8daef',
];

/* ================================================================
   GovernanceCharts — main wrapper
   ================================================================ */
function GovernanceCharts({ assignments = [], stats = {} }) {
    /* ---- Pre-compute all chart data ---- */
    const accountData = useMemo(() => {
        const map = {};
        assignments.forEach(a => {
            const name = a.account_name || a.account_id || 'Unknown';
            map[name] = (map[name] || 0) + 1;
        });
        return Object.entries(map)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [assignments]);

    const permissionData = useMemo(() => {
        const map = {};
        assignments.forEach(a => {
            const name = a.permission_set_name || 'Unknown';
            map[name] = (map[name] || 0) + 1;
        });
        return Object.entries(map)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [assignments]);


    const [accountPage, setAccountPage] = useState(1);
    const [permissionPage, setPermissionPage] = useState(1);
    const pageSize = 10;

    const paginatedAccountData = useMemo(() => {
        const start = (accountPage - 1) * pageSize;
        return accountData.slice(start, start + pageSize);
    }, [accountData, accountPage]);

    const paginatedPermissionData = useMemo(() => {
        const start = (permissionPage - 1) * pageSize;
        return permissionData.slice(start, start + pageSize);
    }, [permissionData, permissionPage]);

    const accountTotalPages = Math.max(1, Math.ceil(accountData.length / pageSize));
    const permissionTotalPages = Math.max(1, Math.ceil(permissionData.length / pageSize));

    const accountMax = accountData.length > 0 ? accountData[0].count : 1;
    const permissionMax = permissionData.length > 0 ? permissionData[0].count : 1;

    if (assignments.length === 0) return null;

    return (
        <section className="charts-grid" id="governance-charts">
            <ChartPanel
                title="Assignments by Account"
                subtitle="Distribution across AWS accounts"
                page={accountPage}
                totalPages={accountTotalPages}
                onPrev={() => setAccountPage(p => p - 1)}
                onNext={() => setAccountPage(p => p + 1)}
            >
                <HorizontalBarChart data={paginatedAccountData} colors={ACCOUNT_COLORS} maxTotal={accountMax} />
            </ChartPanel>

            <ChartPanel
                title="Permission Set Usage"
                subtitle="Assignment count per permission set"
                page={permissionPage}
                totalPages={permissionTotalPages}
                onPrev={() => setPermissionPage(p => p - 1)}
                onNext={() => setPermissionPage(p => p + 1)}
            >
                <HorizontalBarChart data={paginatedPermissionData} colors={PS_COLORS} maxTotal={permissionMax} />
            </ChartPanel>

            <div className="chart-panel chart-panel--wide">
                <div className="chart-panel__header">
                    <div className="chart-panel__header-text">
                        <h3 className="chart-panel__title">Access Heatmap</h3>
                        <p className="chart-panel__subtitle">Principals per account × permission set</p>
                    </div>
                </div>
                <div className="chart-panel__body">
                    <AccessHeatmap assignments={assignments} />
                </div>
            </div>
        </section>
    );
}

/* ================================================================
   ChartPanel — reusable card wrapper
   ================================================================ */
function ChartPanel({ title, subtitle, page, totalPages, onPrev, onNext, children }) {
    return (
        <div className="chart-panel">
            <div className="chart-panel__header">
                <div className="chart-panel__header-text">
                    <h3 className="chart-panel__title">{title}</h3>
                    {subtitle && <p className="chart-panel__subtitle">{subtitle}</p>}
                </div>
                {totalPages > 1 && (
                    <div className="chart-panel__pagination">
                        <button className="chart-pagination__btn" disabled={page === 1} onClick={onPrev} title="Previous">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M10.854 3.146a.5.5 0 00-.708 0l-4.5 4.5a.5.5 0 000 .708l4.5 4.5a.5.5 0 00.708-.708L6.707 8l4.147-4.146a.5.5 0 000-.708z" /></svg>
                        </button>
                        <span className="chart-pagination__info">{page} of {totalPages}</span>
                        <button className="chart-pagination__btn" disabled={page === totalPages} onClick={onNext} title="Next">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.146 3.146a.5.5 0 01.708 0l4.5 4.5a.5.5 0 010 .708l-4.5 4.5a.5.5 0 01-.708-.708L9.293 8 5.146 3.854a.5.5 0 010-.708z" /></svg>
                        </button>
                    </div>
                )}
            </div>
            <div className="chart-panel__body">
                {children}
            </div>
        </div>
    );
}

/* ================================================================
   HorizontalBarChart — pure-CSS bar chart
   ================================================================ */
function HorizontalBarChart({ data, colors, maxTotal }) {
    const max = maxTotal || Math.max(...data.map(d => d.count), 1);

    return (
        <div className="bar-chart">
            {data.map((d, i) => (
                <div className="bar-chart__row" key={d.name}>
                    <span className="bar-chart__label" title={d.name}>{d.name}</span>
                    <div className="bar-chart__track">
                        <div
                            className="bar-chart__fill"
                            style={{
                                width: `${(d.count / max) * 100}%`,
                                backgroundColor: colors[i % colors.length],
                                animationDelay: `${i * 60}ms`,
                            }}
                        />
                    </div>
                    <span className="bar-chart__value">{d.count}</span>
                </div>
            ))}
        </div>
    );
}


/* ================================================================
   AccessHeatmap — Permission Set (rows) × Account (cols) matrix
   Axes swapped so the longer permission set names read horizontally.
   ================================================================ */
function AccessHeatmap({ assignments }) {
    const { accounts, permSets, matrix } = useMemo(() => {
        const acctSet = new Set();
        const psSet = new Set();
        const countMap = {};

        assignments.forEach(a => {
            const acct = a.account_name || a.account_id || 'Unknown';
            const ps = a.permission_set_name || 'Unknown';
            acctSet.add(acct);
            psSet.add(ps);
            const key = `${ps}|||${acct}`;
            countMap[key] = (countMap[key] || 0) + 1;
        });

        const accounts = [...acctSet].sort();
        const permSets = [...psSet].sort();

        // rows = permSets, cols = accounts
        const matrix = permSets.map(ps =>
            accounts.map(acct => countMap[`${ps}|||${acct}`] || 0)
        );

        return { accounts, permSets, matrix };
    }, [assignments]);

    const HEAT_COLORS = [
        'transparent', '#e3f2fd', '#bbdefb', '#90caf9', '#42a5f5', '#1e88e5',
    ];

    const getColor = (count) => {
        if (count === 0) return HEAT_COLORS[0];
        return HEAT_COLORS[Math.min(count, HEAT_COLORS.length - 1)];
    };

    const getTextColor = (count) =>
        count >= 4 ? '#fff' : count >= 1 ? '#0d47a1' : 'transparent';

    // Short column label: first 3 chars
    const shortLabel = (name) => name.length > 8 ? name.slice(0, 7) + '…' : name;

    return (
        <div className="heatmap-wrapper">
            <div className="heatmap-scroll">
                <table className="heatmap">
                    <thead>
                        <tr>
                            <th className="heatmap__corner"></th>
                            {accounts.map(acct => (
                                <th className="heatmap__col-header" key={acct} title={acct}>
                                    {shortLabel(acct)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {permSets.map((ps, ri) => (
                            <tr key={ps}>
                                <td className="heatmap__row-header" title={ps}>{ps}</td>
                                {matrix[ri].map((count, ci) => (
                                    <td
                                        className={`heatmap__cell${count > 0 ? ' heatmap__cell--active' : ''}`}
                                        key={ci}
                                        style={{
                                            backgroundColor: getColor(count),
                                            color: getTextColor(count),
                                        }}
                                        title={`${ps} → ${accounts[ci]}: ${count} principal${count !== 1 ? 's' : ''}`}
                                    >
                                        {count > 0 ? count : ''}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="heatmap-legend">
                <span className="heatmap-legend__label">Less</span>
                {HEAT_COLORS.slice(1).map((c, i) => (
                    <span key={i} className="heatmap-legend__swatch" style={{ backgroundColor: c }} />
                ))}
                <span className="heatmap-legend__label">More</span>
            </div>
        </div>
    );
}

export default GovernanceCharts;
