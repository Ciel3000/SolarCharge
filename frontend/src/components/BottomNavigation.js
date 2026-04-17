// frontend/src/components/BottomNavigation.js
// Mobile-first bottom navigation bar — Apple Liquid Glass aesthetic
// Place this file at: frontend/src/components/BottomNavigation.js

import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // adjust path if needed

// ─── SVG Icons (inline, no icon library needed) ──────────────────────────────

const HomeIcon = ({ filled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {filled ? (
      <path
        d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
        fill="currentColor"
      />
    ) : (
      <path
        d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

const StationsIcon = ({ filled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {filled ? (
      <>
        <circle cx="12" cy="12" r="3" fill="currentColor" />
        <path
          d="M6.34 6.34a8 8 0 000 11.32M17.66 6.34a8 8 0 010 11.32M4.22 4.22a11 11 0 000 15.56M19.78 4.22a11 11 0 010 15.56"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </>
    ) : (
      <>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M6.34 6.34a8 8 0 000 11.32M17.66 6.34a8 8 0 010 11.32M4.22 4.22a11 11 0 000 15.56M19.78 4.22a11 11 0 010 15.56"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </>
    )}
  </svg>
);

const UsageIcon = ({ filled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {filled ? (
      <>
        <rect x="3" y="10" width="4" height="11" rx="1" fill="currentColor" />
        <rect x="10" y="6" width="4" height="15" rx="1" fill="currentColor" />
        <rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor" />
      </>
    ) : (
      <>
        <rect x="3" y="10" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.75" />
        <rect x="10" y="6" width="4" height="15" rx="1" stroke="currentColor" strokeWidth="1.75" />
        <rect x="17" y="3" width="4" height="18" rx="1" stroke="currentColor" strokeWidth="1.75" />
      </>
    )}
  </svg>
);

const SubscriptionIcon = ({ filled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {filled ? (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" fill="currentColor" />
        <path d="M2 10h20" stroke="white" strokeWidth="1.75" />
        <path d="M6 15h4M6 17h2" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ) : (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
        <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
        <path d="M6 15h4M6 17h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const ProfileIcon = ({ filled }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {filled ? (
      <>
        <circle cx="12" cy="8" r="4" fill="currentColor" />
        <path
          d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
        />
      </>
    ) : (
      <>
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </>
    )}
  </svg>
);

// ─── Nav Items Config ─────────────────────────────────────────────────────────

const USER_NAV_ITEMS = [
  { path: '/home',         label: 'Home',         Icon: HomeIcon },
  { path: '/stations',    label: 'Stations',     Icon: StationsIcon },
  { path: '/usage',       label: 'Usage',        Icon: UsageIcon },
  { path: '/subscription',label: 'Plans',        Icon: SubscriptionIcon },
  { path: '/profile',     label: 'Profile',      Icon: ProfileIcon },
];

// ─── Component ────────────────────────────────────────────────────────────────

const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { subscription } = useAuth(); // only show Usage/Subscription if subscribed

  const isActive = useCallback(
    (path) => location.pathname === path || location.pathname.startsWith(path + '/'),
    [location.pathname]
  );

  // Filter nav items: hide Usage & Subscription if user has no subscription
  const navItems = USER_NAV_ITEMS.filter((item) => {
    if (!subscription && (item.path === '/usage' || item.path === '/subscription')) {
      return false;
    }
    return true;
  });

  return (
    <>
      {/* ── Inline styles injected once ───────────────────────────────── */}
      <style>{`
        /* Liquid Glass Bottom Nav */
        .bn-root {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 9999;

          /* Safe area for iPhone home indicator */
          padding-bottom: env(safe-area-inset-bottom, 0px);

          /* Only shown on mobile */
          display: flex;
        }

        @media (min-width: 768px) {
          .bn-root { display: none; }
        }

        /* Glass pill container */
        .bn-bar {
          width: calc(100% - 32px);
          margin: 0 auto 12px;
          display: flex;
          align-items: center;
          justify-content: space-around;

          /* Liquid Glass surface */
          background: rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(28px) saturate(180%) brightness(1.08);
          -webkit-backdrop-filter: blur(28px) saturate(180%) brightness(1.08);

          /* Refraction border — thin highlight on top */
          border: 1px solid rgba(255, 255, 255, 0.45);
          border-bottom-color: rgba(255, 255, 255, 0.12);

          border-radius: 26px;
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.18),
            0 2px 8px rgba(0, 0, 0, 0.10),
            inset 0 1px 0 rgba(255, 255, 255, 0.55),
            inset 0 -1px 0 rgba(255, 255, 255, 0.10);

          padding: 6px 8px;
          height: 62px;
          overflow: hidden;
        }

        /* Each tab button */
        .bn-tab {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          flex: 1;
          min-width: 0;
          padding: 6px 4px;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 18px;
          position: relative;
          transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
          -webkit-tap-highlight-color: transparent;
          outline: none;
        }

        .bn-tab:active {
          transform: scale(0.88);
        }

        /* Active pill highlight */
        .bn-tab.active::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.30);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.50);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.60),
            0 2px 6px rgba(0,0,0,0.08);
        }

        /* Icon wrapper */
        .bn-icon {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          transition: color 0.18s ease;
        }

        .bn-tab.active .bn-icon {
          /* Use existing brand color — falls back to a vivid teal */
          color: var(--color-primary, #0ea5e9);
          filter: drop-shadow(0 0 4px var(--color-primary-glow, rgba(14,165,233,0.45)));
        }

        .bn-tab:not(.active) .bn-icon {
          color: rgba(100, 116, 139, 0.75);
        }

        /* Label */
        .bn-label {
          position: relative;
          z-index: 1;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          line-height: 1;
          white-space: nowrap;
          transition: color 0.18s ease, font-weight 0.18s ease;
          font-family: -apple-system, 'SF Pro Rounded', 'SF Pro Text', BlinkMacSystemFont, sans-serif;
        }

        .bn-tab.active .bn-label {
          color: var(--color-primary, #0ea5e9);
          font-weight: 700;
        }

        .bn-tab:not(.active) .bn-label {
          color: rgba(100, 116, 139, 0.65);
        }

        /* Spring bounce keyframe for active icon */
        @keyframes bn-bounce {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.25) translateY(-2px); }
          70%  { transform: scale(0.92); }
          100% { transform: scale(1); }
        }

        .bn-tab.active .bn-icon {
          animation: bn-bounce 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
      `}</style>

      {/* ── Markup ──────────────────────────────────────────────────────── */}
      <nav className="bn-root" aria-label="Mobile navigation">
        <div className="bn-bar">
          {navItems.map(({ path, label, Icon }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                className={`bn-tab${active ? ' active' : ''}`}
                onClick={() => navigate(path)}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                <span className="bn-icon">
                  <Icon filled={active} />
                </span>
                <span className="bn-label">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default BottomNavigation;