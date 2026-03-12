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
  next: NextFunction,
) {
  try {
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

    const application = await createApplication({
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
    });

    return res.status(201).json(application);
  } catch (error) {
    next(error);
  }
}

export async function getAllApplicationsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
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
  next: NextFunction,
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
  next: NextFunction,
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
  next: NextFunction,
) {
  try {
    const result = await deleteApplication(req.params.id as string);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
