import React, { useState, useRef, useEffect } from 'react';
import './Header.css';

function Header({ user, onRefresh, onLogout }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!menuOpen) return;
        const handleClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [menuOpen]);

    return (
        <header className="header" id="app-header">
            {/* AWS top bar */}
            <div className="header__top-bar">
                <div className="header__brand">
                    <div className="header__logo" aria-label="AWS IAM Identity Center">
                        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* Shield outline */}
                            <path d="M15 2L4 7v7c0 7.1 4.7 13.3 11 15 6.3-1.7 11-7.9 11-15V7L15 2z" stroke="#FF9900" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
                            {/* Checkmark */}
                            <path d="M10.5 15l3 3 6-6.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                    </div>
                    <div className="header__title-group">
                        <h1 className="header__title">IAM Identity Center <span className="header__title-accent">Governance Dashboard</span></h1>
                    </div>
                </div>

                <div className="header__actions">
                    <button
                        className="header__btn header__btn--secondary"
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

                    {user && (
                        <div className="header__user-menu" ref={menuRef}>
                            <button
                                className="header__user-trigger"
                                onClick={() => setMenuOpen(!menuOpen)}
                                id="user-menu-button"
                                aria-expanded={menuOpen}
                                aria-haspopup="true"
                            >
                                <div className="header__avatar">
                                    {(user.name || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="header__user-info">
                                    <span className="header__user-name">{user.name}</span>
                                    {user.email && (
                                        <span className="header__user-email">{user.email}</span>
                                    )}
                                </div>
                                <svg className={`header__chevron ${menuOpen ? 'header__chevron--open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                    <path d="M2.5 4.5l3.5 3 3.5-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>

                            {menuOpen && (
                                <div className="header__dropdown" role="menu">
                                    <div className="header__dropdown-user">
                                        <div className="header__dropdown-avatar">
                                            {(user.name || 'U').charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="header__dropdown-name">{user.name}</div>
                                            {user.email && <div className="header__dropdown-email">{user.email}</div>}
                                        </div>
                                    </div>
                                    <div className="header__dropdown-divider" />
                                    <button
                                        className="header__dropdown-item header__dropdown-item--danger"
                                        onClick={() => { setMenuOpen(false); onLogout(); }}
                                        role="menuitem"
                                        id="sign-out-button"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H6" />
                                        </svg>
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

export default Header;
