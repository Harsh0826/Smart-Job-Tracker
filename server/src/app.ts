import express from "express";
import cors from "cors";
import applicationRoutes from "./routes/appplicationRoute";
import analyticsRoutes from "./routes/analyticsRoute";
import resumeRoutes from "./routes/resumeRoute";
import { errorHandler } from "./middleware/erroHandler";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({ message: "Server is running" });
});

app.use("/api/applications", applicationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/resumes", resumeRoutes);

app.use(errorHandler);

export default app;