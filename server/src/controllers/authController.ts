import { NextFunction, Request, Response } from "express";
import {
  registerUserService,
  loginUserService,
} from "../services/authService";
import { AuthRequest } from "../middleware/auth";

export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const data = await registerUserService({
      email,
      password,
      firstName,
      lastName,
    });

    return res.status(201).json({
      message: "Check your email to confirm your account",
      user: {
        id: data.user?.id,
        email: data.user?.email,
        firstName: data.user?.user_metadata?.first_name ?? null,
        lastName: data.user?.user_metadata?.last_name ?? null,
        tier: "FREE",
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const data = await loginUserService({ email, password });

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        accessToken: data.session?.access_token,
        refreshToken: data.session?.refresh_token,
        expiresAt: data.session?.expires_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    return res.status(200).json({
      message: "Logout successful. Remove token from client storage.",
    });
  } catch (err) {
    next(err);
  }
}

export async function getMeHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    return res.status(200).json({
      user: req.user,
    });
  } catch (err) {
    next(err);
  }
}