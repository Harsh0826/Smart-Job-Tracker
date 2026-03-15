type Props = {
  title: string;
  value: string | number;
  subtitle?: string;
};

export default function StatsCard({ title, value, subtitle }: Props) {
  return (
    <section className="card stats-card">
      <div className="card-content">
        <p className="stats-card-label">{title}</p>
        <h3 className="stats-card-value">{value}</h3>
        {subtitle ? <p className="stats-card-subtitle">{subtitle}</p> : null}
      </div>
    </section>
  );
}