import { apiClient } from "./client";
import type {
  Application,
  CreateApplicationPayload,
  UpdateApplicationPayload,
} from "../types/application";

export async function getApplications(): Promise<Application[]> {
  const response = await apiClient.get<Application[]>("/applications");
  return response.data;
}

export async function createApplication(
  payload: CreateApplicationPayload
): Promise<Application> {
  const response = await apiClient.post<Application>("/applications", payload);
  return response.data;
}

export async function updateApplication(
  id: string,
  payload: UpdateApplicationPayload
): Promise<Application> {
  const response = await apiClient.patch<Application>(
    `/applications/${id}`,
    payload
  );
  return response.data;
}

export async function deleteApplication(
  id: string
): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(
    `/applications/${id}`
  );
  return response.data;
}