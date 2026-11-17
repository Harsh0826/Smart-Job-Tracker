type Props = {
  label: string;
  value?: number | string | null;
};

export default function DiscoveryStatCard({ label, value }: Props) {
  return (
    <div className="card discovery-stat">
      <div className="discovery-stat-value">{value ?? "-"}</div>
      <div className="discovery-stat-label">{label}</div>
    </div>
  );
}
