import { Response, NextFunction } from "express";
import {
  createApplication,
  deleteApplication,
  getAllApplications,
  getApplicationById,
  updateApplication,
} from "../services/application.service";
import { AuthRequest } from "../middleware/auth";

export async function createApplicationHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      resume_id,
      company,
      role,
      job_description,
      job_url,
      status,
      applied_date,
      follow_up_date,
      salary_min,
      salary_max,
      source,
      contact_name,
      contact_email,
      notes,
    } = req.body;

    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!company || !role || !job_description) {
      return res.status(400).json({
        message: "company, role, and job_description are required",
      });
    }

    const payload = {
      user_id: req.user.id,
      resume_id: resume_id ? Number(resume_id) : null,

      company: String(company).trim(),
      role: String(role).trim(),
      job_description: String(job_description).trim(),

      job_url:
        typeof job_url === "string" && job_url.trim() ? job_url.trim() : null,

      status: status || "APPLIED",

      applied_date: applied_date || null,
      follow_up_date: follow_up_date || null,

      salary_min:
        salary_min === "" || salary_min === undefined || salary_min === null
          ? null
          : Number(salary_min),

      salary_max:
        salary_max === "" || salary_max === undefined || salary_max === null
          ? null
          : Number(salary_max),

      source: typeof source === "string" && source.trim() ? source.trim() : null,

      contact_name:
        typeof contact_name === "string" && contact_name.trim()
          ? contact_name.trim()
          : null,

      contact_email:
        typeof contact_email === "string" && contact_email.trim()
          ? contact_email.trim()
          : null,

      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    };

    const application = await createApplication(payload);

    return res.status(201).json(application);
  } catch (error) {
    next(error);
  }
}

export async function getAllApplicationsHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const applications = await getAllApplications(req.user.id);
    return res.status(200).json(applications);
  } catch (error) {
    next(error);
  }
}

export async function getApplicationByIdHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const application = await getApplicationById(req.params.id as string, req.user.id);
    return res.status(200).json(application);
  } catch (error) {
    next(error);
  }
}

export async function updateApplicationHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updated = await updateApplication(
      req.params.id as string,
      req.user.id,
      req.body
    );

    return res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

export async function deleteApplicationHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await deleteApplication(req.params.id as string, req.user.id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}