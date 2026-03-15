import { Navigate, Route, Routes } from "react-router-dom";
import ApplicationsPage from "./pages/application";
import ApplicationDetailsPage from "./pages/applicationDetail";
import AnalyticsPage from "./pages/analytics";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/applications" replace />} />
      <Route path="/applications" element={<ApplicationsPage />} />
      <Route path="/applications/:id" element={<ApplicationDetailsPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
    </Routes>
  );
}