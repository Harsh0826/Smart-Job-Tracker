import type { ApplicationStatus } from "../../types/application";

type Props = {
  status: ApplicationStatus;
};

export default function StatusBadge({ status }: Props) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      {status}
    </span>
  );
}