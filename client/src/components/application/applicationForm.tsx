import { useEffect, useMemo, useState } from "react";
import {
  APPLICATION_STATUSES,
  type Application,
  type CreateApplicationPayload,
} from "../../types/application";
import InputField from "../ui/InputField";
import SelectField from "../ui/SelectField";
import TextareaField from "../ui/TextAreaField";

type Props = {
  onSubmit: (payload: CreateApplicationPayload) => Promise<void>;
  editingApplication?: Application | null;
  onCancelEdit?: () => void;
};

type FormErrors = Partial<Record<keyof CreateApplicationPayload, string>>;

const initialForm: CreateApplicationPayload = {
  resume_id: null,
  company: "",
  role: "",
  job_description: "",
  job_url: "",
  status: "APPLIED",
  applied_date: "",
  follow_up_date: "",
  salary_min: null,
  salary_max: null,
  source: "",
  contact_name: "",
  contact_email: "",
  notes: "",
};

const statusOptions = APPLICATION_STATUSES.map((status) => ({
  label: status,
  value: status,
}));

function mapApplicationToForm(
  application: Application
): CreateApplicationPayload {
  return {
    resume_id: application.resume_id ?? null,
    company: application.company,
    role: application.role,
    job_description: application.job_description,
    job_url: application.job_url ?? "",
    status: application.status,
    applied_date: application.applied_date ?? "",
    follow_up_date: application.follow_up_date ?? "",
    salary_min: application.salary_min ?? null,
    salary_max: application.salary_max ?? null,
    source: application.source ?? "",
    contact_name: application.contact_name ?? "",
    contact_email: application.contact_email ?? "",
    notes: application.notes ?? "",
  };
}

function validateForm(form: CreateApplicationPayload): FormErrors {
  const errors: FormErrors = {};

  if (!form.company?.trim()) {
    errors.company = "Company is required.";
  }

  if (!form.role?.trim()) {
    errors.role = "Role is required.";
  }

  if (!form.job_description?.trim()) {
    errors.job_description = "Job description is required.";
  }

  if (form.contact_email && !/^\S+@\S+\.\S+$/.test(form.contact_email)) {
    errors.contact_email = "Enter a valid email address.";
  }

  if (
    form.salary_min != null &&
    form.salary_max != null &&
    form.salary_min > form.salary_max
  ) {
    errors.salary_max =
      "Salary max should be greater than or equal to salary min.";
  }

  return errors;
}

export default function ApplicationForm({
  onSubmit,
  editingApplication = null,
  onCancelEdit,
}: Props) {
  const [form, setForm] = useState<CreateApplicationPayload>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const isEditing = useMemo(
    () => Boolean(editingApplication),
    [editingApplication]
  );

  useEffect(() => {
    if (editingApplication) {
      setForm(mapApplicationToForm(editingApplication));
      setErrors({});
      return;
    }

    setForm(initialForm);
    setErrors({});
  }, [editingApplication]);

  function handleInputChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = e.target;

    if (name === "salary_min" || name === "salary_max") {
      setForm((prev) => ({
        ...prev,
        [name]: value === "" ? null : Number(value),
      }));

      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));

      return;
    }

    if (name === "resume_id") {
      setForm((prev) => ({
        ...prev,
        resume_id: value === "" ? null : Number(value),
      }));

      setErrors((prev) => ({
        ...prev,
        resume_id: undefined,
      }));

      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: undefined,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const validationErrors = validateForm(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    try {
      setSubmitting(true);

      await onSubmit({
        ...form,
        resume_id: form.resume_id ?? null,
        company: form.company.trim(),
        role: form.role.trim(),
        job_description: form.job_description.trim(),
        job_url: form.job_url?.trim() || null,
        applied_date: form.applied_date || null,
        follow_up_date: form.follow_up_date || null,
        source: form.source?.trim() || null,
        contact_name: form.contact_name?.trim() || null,
        contact_email: form.contact_email?.trim() || null,
        notes: form.notes?.trim() || null,
      });

      if (!isEditing) {
        setForm(initialForm);
      }

      setErrors({});
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card">
      <div className="card-content">
        <h2 className="card-title">
          {isEditing ? "Edit Application" : "Add Application"}
        </h2>

        <p className="card-subtitle">
          {isEditing
            ? "Update the selected application details."
            : "Save a new role and track its progress."}
        </p>

        <form onSubmit={handleSubmit} className="form">
          <div className="form-section">
            <h3 className="form-section-title">Job Details</h3>
            <p className="form-section-description">
              Basic role information and the original job posting.
            </p>

            <div className="form-grid">
              <InputField
                id="company"
                name="company"
                label="Company"
                placeholder="Shopify"
                value={form.company}
                onChange={handleInputChange}
                error={errors.company}
              />

              <InputField
                id="role"
                name="role"
                label="Role"
                placeholder="Frontend Developer"
                value={form.role}
                onChange={handleInputChange}
                error={errors.role}
              />

              <TextareaField
                id="job_description"
                name="job_description"
                label="Job Description"
                placeholder="Paste the job description here..."
                value={form.job_description}
                onChange={handleInputChange}
                full
                rows={6}
                error={errors.job_description}
              />

              <InputField
                id="job_url"
                name="job_url"
                label="Job URL"
                placeholder="https://company.com/jobs/123"
                value={form.job_url ?? ""}
                onChange={handleInputChange}
                full
                error={errors.job_url}
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Application Tracking</h3>
            <p className="form-section-description">
              Keep status, dates, salary range, and source organized.
            </p>

            <div className="form-grid">
              <SelectField
                id="status"
                name="status"
                label="Status"
                value={form.status ?? "APPLIED"}
                onChange={handleInputChange}
                options={statusOptions}
                error={errors.status}
              />

              <InputField
                id="source"
                name="source"
                label="Source"
                placeholder="LinkedIn"
                value={form.source ?? ""}
                onChange={handleInputChange}
                error={errors.source}
              />

              <InputField
                id="applied_date"
                name="applied_date"
                label="Applied Date"
                type="date"
                value={form.applied_date ?? ""}
                onChange={handleInputChange}
                error={errors.applied_date}
              />

              <InputField
                id="follow_up_date"
                name="follow_up_date"
                label="Follow-up Date"
                type="date"
                value={form.follow_up_date ?? ""}
                onChange={handleInputChange}
                error={errors.follow_up_date}
              />

              <InputField
                id="salary_min"
                name="salary_min"
                label="Salary Min"
                type="number"
                placeholder="80000"
                value={form.salary_min ?? ""}
                onChange={handleInputChange}
                error={errors.salary_min}
              />

              <InputField
                id="salary_max"
                name="salary_max"
                label="Salary Max"
                type="number"
                placeholder="100000"
                value={form.salary_max ?? ""}
                onChange={handleInputChange}
                error={errors.salary_max}
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Contact</h3>
            <p className="form-section-description">
              Store recruiter or hiring manager information.
            </p>

            <div className="form-grid">
              <InputField
                id="contact_name"
                name="contact_name"
                label="Contact Name"
                placeholder="Recruiter Name"
                value={form.contact_name ?? ""}
                onChange={handleInputChange}
                error={errors.contact_name}
              />

              <InputField
                id="contact_email"
                name="contact_email"
                label="Contact Email"
                placeholder="recruiter@example.com"
                value={form.contact_email ?? ""}
                onChange={handleInputChange}
                error={errors.contact_email}
              />

              <InputField
                id="resume_id"
                name="resume_id"
                label="Resume ID"
                type="number"
                placeholder="Optional resume id"
                value={form.resume_id ?? ""}
                onChange={handleInputChange}
                full
                error={errors.resume_id}
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Notes</h3>
            <p className="form-section-description">
              Add reminders, prep notes, referrals, or follow-up context.
            </p>

            <div className="form-grid">
              <TextareaField
                id="notes"
                name="notes"
                label="Notes"
                placeholder="Add recruiter response, interview prep notes, referral context, or follow-up details..."
                value={form.notes ?? ""}
                onChange={handleInputChange}
                full
                rows={4}
                error={errors.notes}
              />
            </div>
          </div>

          <div className="form-actions form-actions--split">
            {isEditing && onCancelEdit ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCancelEdit}
              >
                Cancel
              </button>
            ) : null}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting
                ? isEditing
                  ? "Updating..."
                  : "Saving..."
                : isEditing
                  ? "Update Application"
                  : "Save Application"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}