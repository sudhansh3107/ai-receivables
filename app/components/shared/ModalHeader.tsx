type ModalHeaderProps = {
    title: string;
    subtitle?: string;

    onClose: () => void;

    showBack?: boolean;
    onBack?: () => void;
};

export default function ModalHeader({
    title,
    subtitle,
    onClose,
    showBack = false,
    onBack,
}: ModalHeaderProps) 
{
    
    return (
        <div className="mb-8 flex items-start justify-between">

            <div className="flex items-start gap-3">

                {showBack && (
                    <button
                        onClick={onBack}
                        className="mt-1 text-lg font-semibold transition hover:text-[#A47A45]"
                    >
                        ←
                    </button>
                )}

                <div>

                    <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-[#23201D]">
                        {title}
                    </h2>

                    {subtitle && (
                        <p className="mt-1 text-[14px] text-[#7D7D7D]">
                            {subtitle}
                        </p>
                    )}

                </div>

            </div>

            <button
                onClick={onClose}
                className="text-2xl transition hover:text-[#A47A45]"
            >
                ×
            </button>

        </div>
    );
}