import express from "express";
import cors from "cors";
import applicationRoutes from "./routes/appplicationRoute";
import analyticsRoutes from "./routes/analyticsRoute";
import resumeRoutes from "./routes/resumeRoute";
import { errorHandler } from "./middleware/erroHandler";
import aiAnalysisRoutes from "./routes/aiAnalysisRoute";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://smart-job-tracker-git-main-harsh0826s-projects.vercel.app",
  "https://smart-job-tracker-dusky.vercel.app"
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({ message: "Server is running" });
});

app.use("/api/applications", applicationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/ai", aiAnalysisRoutes);
app.use(errorHandler);

export default app;