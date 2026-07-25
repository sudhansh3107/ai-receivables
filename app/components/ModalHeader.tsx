type ModalHeaderProps = {
    title: string;
    onClose: () => void;
    showBack?: boolean;
    onBack?: () => void;
};

export default function ModalHeader({
    title,
    onClose,
    showBack = false,
    onBack,
}: ModalHeaderProps) {
    return (
        <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
                {showBack && (
                    <button
                        onClick={onBack}
                        className="text-lg font-semibold hover:text-blue-600"
                    >
                        ←
                    </button>
                )}

                <h2 className="text-2xl font-bold">
                    {title}
                </h2>
            </div>

            <button
                onClick={onClose}
                className="text-2xl hover:text-red-500"
            >
                ×
            </button>
        </div>
    );
}