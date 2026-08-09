"use client";

import { ArrowLeft, X } from "lucide-react";

import { tokens } from "@/lib/theme/tokens";

type ModalHeaderProps = {
    title: string;
    subtitle?: string;
    stepLabel?: string;

    onClose: () => void;

    showBack?: boolean;
    onBack?: () => void;
};

export default function ModalHeader({
    title,
    subtitle,
    stepLabel,
    onClose,
    showBack = false,
    onBack,
}: ModalHeaderProps) {
    return (
        <div className="mb-8 flex items-start justify-between">

            <div className="flex items-start gap-3">

                {showBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label="Back"
                        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:text-[#8F6B4A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F6B4A]/40"
                        style={{
                            color: tokens.semantic.textSecondary,
                        }}
                    >
                        <ArrowLeft size={18} strokeWidth={2} />
                    </button>
                )}

                <div>

                    {stepLabel && (
                        <p
                            style={{
                                fontSize: tokens.typography.eyebrow.fontSize,
                                fontWeight: tokens.typography.eyebrow.fontWeight,
                                letterSpacing:
                                    tokens.typography.eyebrow.letterSpacing,
                                textTransform: "uppercase",
                                color: tokens.semantic.textMuted,
                            }}
                        >
                            {stepLabel}
                        </p>
                    )}

                    <h2
                        id="invoice-modal-title"
                        className="text-2xl font-semibold tracking-[-0.03em]"
                        style={{
                            color: tokens.semantic.textPrimary,
                            marginTop: stepLabel ? "4px" : undefined,
                        }}
                    >
                        {title}
                    </h2>

                    {subtitle && (
                        <p
                            className="mt-1 text-[14px]"
                            style={{
                                color: tokens.semantic.textMuted,
                            }}
                        >
                            {subtitle}
                        </p>
                    )}

                </div>

            </div>

            <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:text-[#8F6B4A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F6B4A]/40"
                style={{
                    color: tokens.semantic.textSecondary,
                }}
            >
                <X size={20} strokeWidth={2} />
            </button>

        </div>
    );
}
