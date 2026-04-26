import type { ApplicationStatus } from "../../types/application";

type Props = {
  status: ApplicationStatus;
};

function formatStatus(status: ApplicationStatus) {
  return status
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export default function StatusBadge({ status }: Props) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      {formatStatus(status)}
    </span>
  );
}