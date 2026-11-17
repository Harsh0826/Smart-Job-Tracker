import type { JobFilters } from "../../api/discovery";

type Props = {
  filters: JobFilters;
  onChange: (patch: Partial<JobFilters>) => void;
};

export default function DiscoveryFilters({ filters, onChange }: Props) {
  function handlePostedWithinChange(value: string) {
    if (value) {
      onChange({ postedWithinHours: Number(value) });
    } else {
      onChange({ postedWithinHours: undefined });
    }
  }

  return (
    <section className="card discovery-filters">
      <input
        className="input"
        placeholder="Job title"
        onChange={(e) => onChange({ q: e.target.value })}
      />

      <input
        className="input"
        placeholder="Company"
        onChange={(e) => onChange({ company: e.target.value })}
      />

      <input
        className="input"
        placeholder="Location"
        onChange={(e) => onChange({ location: e.target.value })}
      />

      <input
        className="input"
        placeholder="Required skill (e.g. React)"
        onChange={(e) => onChange({ skill: e.target.value })}
      />

      <select
        className="select"
        onChange={(e) =>
          onChange({
            workArrangement: e.target.value as JobFilters["workArrangement"],
          })
        }
      >
        <option value="">Any arrangement</option>
        <option value="remote">Remote</option>
        <option value="hybrid">Hybrid</option>
        <option value="onsite">Onsite</option>
      </select>

      <select
        className="select"
        onChange={(e) => handlePostedWithinChange(e.target.value)}
      >
        <option value="">Any posting date</option>
        <option value="24">Last 24 hours</option>
        <option value="72">Last 3 days</option>
        <option value="168">Last 7 days</option>
      </select>

      <select
        className="select"
        value={filters.shortlisted}
        onChange={(e) =>
          onChange({
            shortlisted: e.target.value as JobFilters["shortlisted"],
          })
        }
      >
        <option value="true">Shortlisted only</option>
        <option value="all">All stored postings</option>
      </select>
    </section>
  );
}
