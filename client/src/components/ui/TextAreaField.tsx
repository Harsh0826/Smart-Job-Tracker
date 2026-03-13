import FieldError from "./fieldError";

type Props = {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  full?: boolean;
  error?: string;
};

export default function TextareaField({
  id,
  name,
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
  full = false,
  error,
}: Props) {
  return (
    <div className={`field ${full ? "field--full" : ""}`}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        className="textarea"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
      />
      <FieldError message={error} />
    </div>
  );
}