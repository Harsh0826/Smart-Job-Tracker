type Props = {
  message?: string;
};

export default function FieldError({ message }: Props) {
  if (!message) return null;

  return <p className="field-error">{message}</p>;
}