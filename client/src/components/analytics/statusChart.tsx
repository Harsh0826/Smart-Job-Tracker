import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StatusDistributionItem } from "../../api/analytics";

type Props = {
  data: StatusDistributionItem[];
};

export default function StatusChart({ data }: Props) {
  return (
    <section className="card chart-card">
      <div className="card-content">
        <h2 className="card-title">Status Distribution</h2>
        <p className="card-subtitle">
          A quick view of how applications are distributed across stages.
        </p>

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="status" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}