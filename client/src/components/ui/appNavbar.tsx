import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

export default function AppNavbar() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    setIsLoggedIn(!!token);
  }, []);

  function handleLogout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");

    setIsLoggedIn(false);
    navigate("/login");
  }

  return (
    <nav className="app-navbar">
      <div className="app-navbar-inner">
        <div
          className="app-navbar-brand"
          onClick={() => navigate("/")}
          style={{ cursor: "pointer" }}
        >
          Smart Job Tracker
        </div>

        <div className="app-navbar-links">
          {isLoggedIn ? (
            <>
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

              <button className="app-nav-logout" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `app-nav-link ${isActive ? "app-nav-link-active" : ""}`
                }
              >
                Login
              </NavLink>

              <NavLink
                to="/register"
                className={({ isActive }) =>
                  `app-nav-link ${isActive ? "app-nav-link-active" : ""}`
                }
              >
                Register
              </NavLink>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}