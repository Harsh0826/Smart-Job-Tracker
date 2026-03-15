type Props = {
  label: string;
  value?: string | number | null;
};

export default function DetailItem({ label, value }: Props) {
  return (
    <div className="detail-item">
      <p className="detail-item-label">{label}</p>
      <p className="detail-item-value">{value ?? "-"}</p>
    </div>
  );
}