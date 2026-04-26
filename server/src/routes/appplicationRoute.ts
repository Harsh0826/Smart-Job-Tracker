import { Router } from "express";
import {
  createApplicationHandler,
  deleteApplicationHandler,
  getAllApplicationsHandler,
  getApplicationByIdHandler,
  updateApplicationHandler,
} from "../controllers/application.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.post("/", createApplicationHandler);
router.get("/", getAllApplicationsHandler);
router.get("/:id", getApplicationByIdHandler);
router.patch("/:id", updateApplicationHandler);
router.delete("/:id", deleteApplicationHandler);

export default router;