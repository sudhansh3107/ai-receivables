"use client";

import { ChevronRight, FileUp, PenLine } from "lucide-react";

import ModalHeader from "@/app/components/shared/ModalHeader";
import { tokens } from "@/lib/theme/tokens";

type ChooseMethodProps = {
    stepLabel?: string;
    onUpload: () => void;
    onManual: () => void;
    onClose: () => void;
};

export default function ChooseMethod({
    stepLabel,
    onUpload,
    onManual,
    onClose,
}: ChooseMethodProps) {
    return (
        <>
            <ModalHeader
                title="New Invoice"
                stepLabel={stepLabel}
                onClose={onClose}
            />

            <p
                className="mb-6 text-[15px]"
                style={{
                    color: tokens.semantic.textSecondary,
                }}
            >
                How would you like to create this invoice?
            </p>

            <div className="space-y-3">

                <button
                    type="button"
                    onClick={onUpload}
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[#F2EBE2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F6B4A]/40"
                    style={{
                        borderRadius: tokens.radius.container,
                        border: `1px solid ${tokens.semantic.border}`,
                        background: tokens.semantic.surface,
                    }}
                >
                    <div className="flex items-center gap-4">

                        <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                            style={{
                                background: tokens.semantic.surfaceWarm,
                            }}
                        >
                            <FileUp
                                size={20}
                                strokeWidth={1.8}
                                color={tokens.brand.primary}
                            />
                        </div>

                        <div>

                            <div className="flex items-center gap-2">

                                <h3
                                    className="text-[15px] font-semibold"
                                    style={{
                                        color: tokens.semantic.textPrimary,
                                    }}
                                >
                                    Upload Invoice PDF
                                </h3>

                                <span
                                    className="rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.08em]"
                                    style={{
                                        background: tokens.semantic.surfaceWarm,
                                        color: tokens.brand.primary,
                                    }}
                                >
                                    Recommended
                                </span>

                            </div>

                            <p
                                className="mt-1 text-[13px]"
                                style={{
                                    color: tokens.semantic.textMuted,
                                }}
                            >
                                I&apos;ll read the file and extract the
                                invoice details automatically.
                            </p>

                        </div>

                    </div>

                    <ChevronRight
                        size={18}
                        strokeWidth={2}
                        style={{
                            color: tokens.semantic.textMuted,
                        }}
                    />
                </button>

                <button
                    type="button"
                    onClick={onManual}
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[#F2EBE2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F6B4A]/40"
                    style={{
                        borderRadius: tokens.radius.container,
                        border: `1px solid ${tokens.semantic.border}`,
                        background: tokens.semantic.surface,
                    }}
                >
                    <div className="flex items-center gap-4">

                        <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                            style={{
                                background: tokens.semantic.surfaceWarm,
                            }}
                        >
                            <PenLine
                                size={20}
                                strokeWidth={1.8}
                                color={tokens.brand.primary}
                            />
                        </div>

                        <div>

                            <h3
                                className="text-[15px] font-semibold"
                                style={{
                                    color: tokens.semantic.textPrimary,
                                }}
                            >
                                Create Manually
                            </h3>

                            <p
                                className="mt-1 text-[13px]"
                                style={{
                                    color: tokens.semantic.textMuted,
                                }}
                            >
                                Enter the invoice information yourself.
                            </p>

                        </div>

                    </div>

                    <ChevronRight
                        size={18}
                        strokeWidth={2}
                        style={{
                            color: tokens.semantic.textMuted,
                        }}
                    />
                </button>

            </div>
        </>
    );
}
