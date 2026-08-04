type LoadingStateProps = {
  message: string;
};

export default function LoadingState({ message }: LoadingStateProps) {
  return (
    <div>
      <h2>{message}</h2>
    </div>
  );
}