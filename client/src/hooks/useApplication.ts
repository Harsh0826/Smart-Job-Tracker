import { useCallback, useEffect, useState } from "react";
import {
  createApplication as createApplicationApi,
  deleteApplication as deleteApplicationApi,
  getApplications,
  updateApplication as updateApplicationApi,
} from "../api/application";
import type {
  Application,
  CreateApplicationPayload,
  UpdateApplicationPayload,
} from "../types/application";

interface UseApplicationsReturn {
  applications: Application[];
  loading: boolean;
  error: string | null;
  fetchApplications: () => Promise<void>;
  createApplication: (payload: CreateApplicationPayload) => Promise<Application>;
  updateApplication: (
    id: string,
    payload: UpdateApplicationPayload
  ) => Promise<Application>;
  deleteApplication: (id: string) => Promise<void>;
}

export function useApplications(): UseApplicationsReturn {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getApplications();
      setApplications(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  const createApplication = useCallback(
    async (payload: CreateApplicationPayload) => {
      try {
        setError(null);

        const created = await createApplicationApi(payload);
        setApplications((prev) => [created, ...prev]);

        return created;
      } catch (err) {
        console.error(err);
        setError("Failed to create application.");
        throw err;
      }
    },
    []
  );

  const updateApplication = useCallback(
    async (id: string, payload: UpdateApplicationPayload) => {
      try {
        setError(null);

        const updated = await updateApplicationApi(id, payload);

        setApplications((prev) =>
          prev.map((item) => (item.id === id ? updated : item))
        );

        return updated;
      } catch (err) {
        console.error(err);
        setError("Failed to update application.");
        throw err;
      }
    },
    []
  );

  const deleteApplication = useCallback(async (id: string) => {
    try {
      setError(null);

      await deleteApplicationApi(id);

      setApplications((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error(err);
      setError("Failed to delete application.");
      throw err;
    }
  }, []);

  useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  return {
    applications,
    loading,
    error,
    fetchApplications,
    createApplication,
    updateApplication,
    deleteApplication,
  };
}