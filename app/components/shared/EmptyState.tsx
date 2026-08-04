type EmptyStateProps = {
  heading: string;
  description: string;
};

export default function EmptyState({
  heading,
  description,
}: EmptyStateProps) {
  return (
    <div>
      <h2>{heading}</h2>
      <p>{description}</p>
    </div>
  );
}