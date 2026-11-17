type Props = {
  title: string;
  items: string[];
  tone?: "warn";
};

export default function SkillList({ title, items, tone }: Props) {
  if (!items || items.length === 0) return null;

  const tagClassName = tone === "warn" ? "tag tag-warn" : "tag";

  return (
    <>
      <h3 className="detail-heading">{title}</h3>

      <div className="skill-chips">
        {items.map((skill) => (
          <span key={skill} className={tagClassName}>
            {skill}
          </span>
        ))}
      </div>
    </>
  );
}
