// PublicOrAppLayout: the frame of pages that everyone may open, such as the Posters page.
// Signed-in users see the page inside the normal app frame (sidebar + top bar), so it feels
// like any other page. Visitors see a light public frame with the GPMP logo and a Sign in button.
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import MainLayout from './MainLayout.jsx';
import Loading from '../components/common/Loading.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/auth.css';
import { asset } from '../config/demo.js';

function PublicLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="auth-landing public-frame">
      <a href="#public-content" className="skip-link">
        Skip to content
      </a>
      <header className="auth-topbar">
        <div className="auth-container auth-topbar-inner">
          <Link to="/" className="auth-logo" aria-label="GPMP home page">
            <img src={asset('logo.jpeg')} alt="" />
            <span>
              <strong>GPMP</strong>
              <small>Al-Yamamah University</small>
            </span>
          </Link>
          <nav className="auth-topnav" aria-label="Public pages">
            <Link to="/" className="auth-topnav-link">
              Home
            </Link>
            <Link to="/posters" className="auth-topnav-link" aria-current={pathname === '/posters' ? 'page' : undefined}>
              Posters
            </Link>
            <Link to="/login" state={{ from: { pathname } }} className="btn btn-primary btn-small">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main id="public-content" className="auth-container public-frame-main">
        <Outlet />
      </main>
      <footer className="auth-landing-footer">
        <div className="auth-container auth-landing-footer-inner">
          <span className="auth-landing-footer-brand">
            <img src={asset('logo.jpeg')} alt="" />
            GPMP — Graduation Project Management Platform
          </span>
          <span>Al-Yamamah University</span>
        </div>
      </footer>
    </div>
  );
}

export default function PublicOrAppLayout() {
  const { user, loading } = useAuth();
  if (loading) return <Loading fullPage text="Loading GPMP..." />;
  return user ? <MainLayout /> : <PublicLayout />;
}
