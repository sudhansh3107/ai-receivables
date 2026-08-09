"use client";

import { PenLine } from "lucide-react";

import ModalHeader from "@/app/components/shared/ModalHeader";
import { tokens } from "@/lib/theme/tokens";

type ManualInvoiceProps = {
    stepLabel?: string;
    onBack: () => void;
    onClose: () => void;
};

export default function ManualInvoice({
    stepLabel,
    onBack,
    onClose,
}: ManualInvoiceProps) {
    return (
        <>
            <ModalHeader
                title="Create Invoice"
                stepLabel={stepLabel}
                showBack
                onBack={onBack}
                onClose={onClose}
            />

            <div className="flex flex-col items-center py-6 text-center">

                <div
                    className="flex h-12 w-12 items-center justify-center rounded-full"
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

                <h3
                    className="mt-5 text-[17px] font-semibold"
                    style={{
                        color: tokens.semantic.textPrimary,
                    }}
                >
                    Manual entry isn&apos;t available yet
                </h3>

                <p
                    className="mt-2 max-w-[320px] text-[14px] leading-6"
                    style={{
                        color: tokens.semantic.textSecondary,
                    }}
                >
                    I don&apos;t have a manual entry form yet — upload
                    the PDF instead and I&apos;ll read it for you.
                </p>

            </div>
        </>
    );
}
