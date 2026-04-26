import { Router } from "express";
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  getMeHandler,
} from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.post("/register", registerHandler);
router.post("/login", loginHandler);

router.post("/logout", authMiddleware, logoutHandler);
router.get("/me", authMiddleware, getMeHandler);

export default router;