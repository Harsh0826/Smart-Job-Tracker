import FieldError from "./fieldError";

type Props = {
  id: string;
  name: string;
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
  full?: boolean;
  error?: string;
};

export default function InputField({
  id,
  name,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  full = false,
  error,
}: Props) {
  return (
    <div className={`field ${full ? "field--full" : ""}`}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        className="input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
      />
      <FieldError message={error} />
    </div>
  );
}