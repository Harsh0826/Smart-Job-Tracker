import { Request, Response, NextFunction } from "express";
import {
  createApplication,
  deleteApplication,
  getAllApplications,
  getApplicationById,
  updateApplication,
} from "../services/application.service";

export async function createApplicationHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    console.log("Incoming application payload:", req.body);

    const {
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

      resume_version,

      required_skills,
      missing_skills,
      suggestions,

      notes,
    } = req.body;

    if (!company || !role || !job_description) {
      return res.status(400).json({
        message: "company, role, and job_description are required",
      });
    }

    const payload = {
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
      resume_version:
        typeof resume_version === "string" && resume_version.trim()
          ? resume_version.trim()
          : null,

      required_skills: required_skills ?? null,
      missing_skills: missing_skills ?? null,
      suggestions: suggestions ?? null,

      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    };

    const application = await createApplication(payload);

    return res.status(201).json(application);
  } catch (error) {
    next(error);
  }
}

export async function getAllApplicationsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const applications = await getAllApplications();
    return res.status(200).json(applications);
  } catch (error) {
    next(error);
  }
}

export async function getApplicationByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const application = await getApplicationById(req.params.id as string);
    return res.status(200).json(application);
  } catch (error) {
    next(error);
  }
}

export async function updateApplicationHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const updated = await updateApplication(req.params.id as string, req.body);
    return res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

export async function deleteApplicationHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await deleteApplication(req.params.id as string);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}