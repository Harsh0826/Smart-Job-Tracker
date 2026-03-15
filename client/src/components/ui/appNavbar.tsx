import { NavLink } from "react-router-dom";

export default function AppNavbar() {
  return (
    <nav className="app-navbar">
      <div className="app-navbar-inner">
        <div className="app-navbar-brand">Smart Job Tracker</div>

        <div className="app-navbar-links">
          <NavLink
            to="/applications"
            className={({ isActive }) =>
              `app-nav-link ${isActive ? "app-nav-link-active" : ""}`
            }
          >
            Applications
          </NavLink>

          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `app-nav-link ${isActive ? "app-nav-link-active" : ""}`
            }
          >
            Analytics
          </NavLink>
        </div>
      </div>
    </nav>
  );
}