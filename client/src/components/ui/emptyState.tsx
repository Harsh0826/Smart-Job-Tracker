type Props = {
  title: string;
  description?: string;
};

export default function EmptyState({ title, description }: Props) {
  return (
    <div className="empty-state">
      <h3 className="empty-state-title">{title}</h3>
      {description ? <p className="empty-state-description">{description}</p> : null}
    </div>
  );
}