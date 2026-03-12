import { Router } from "express";
import {
  createApplicationHandler,
  deleteApplicationHandler,
  getAllApplicationsHandler,
  getApplicationByIdHandler,
  updateApplicationHandler,
} from "../controller/application.controller";

const router = Router();

router.post("/", createApplicationHandler);
router.get("/", getAllApplicationsHandler);
router.get("/:id", getApplicationByIdHandler);
router.patch("/:id", updateApplicationHandler);
router.delete("/:id", deleteApplicationHandler);

export default router;