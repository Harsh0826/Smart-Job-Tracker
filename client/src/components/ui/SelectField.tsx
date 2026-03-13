import FieldError from "./fieldError";

type Option = {
  label: string;
  value: string;
};

type Props = {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: Option[];
  full?: boolean;
  error?: string;
};

export default function SelectField({
  id,
  name,
  label,
  value,
  onChange,
  options,
  full = false,
  error,
}: Props) {
  return (
    <div className={`field ${full ? "field--full" : ""}`}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        className="select"
        value={value}
        onChange={onChange}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}