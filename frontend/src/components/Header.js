import React, { useState, useRef, useEffect } from 'react';
import './Header.css';

function Header({ user, onLogout, theme, onToggleTheme }) {
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
                        <h1 className="header__title">AWS IAM Identity Center - <span className="header__title-accent">Security Governance Dashboard</span></h1>
                    </div>
                </div>

                <div className="header__actions">
                    <button
                        className="header__theme-toggle"
                        onClick={onToggleTheme}
                        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        type="button"
                    >
                        {theme === 'dark' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="5" />
                                <line x1="12" y1="1" x2="12" y2="3" />
                                <line x1="12" y1="21" x2="12" y2="23" />
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                <line x1="1" y1="12" x2="3" y2="12" />
                                <line x1="21" y1="12" x2="23" y2="12" />
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                            </svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                            </svg>
                        )}
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
