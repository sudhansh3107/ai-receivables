"use client";

import { useEffect, useRef, useState } from "react";

import ChooseMethod from "./ChooseMethod";
import UploadInvoice from "./UploadInvoice";
import ManualInvoice from "./ManualInvoice";
import { tokens } from "@/lib/theme/tokens";

type Step = "choose" | "upload" | "manual";

type NewInvoiceModalProps = {
    onClose: () => void;
};

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function NewInvoiceModal({
    onClose,
}: NewInvoiceModalProps) {
    const [step, setStep] = useState<Step>("choose");
    const panelRef = useRef<HTMLDivElement>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    const stepLabel = step === "choose" ? "Step 1 of 2" : "Step 2 of 2";

    // Capture the trigger element and move focus into the dialog on
    // mount; restore focus to the trigger when the dialog unmounts.
    useEffect(() => {
        previouslyFocused.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

        panelRef.current?.focus();

        return () => {
            previouslyFocused.current?.focus();
        };
    }, []);

    // Escape-to-close and a practical Tab focus trap within the panel.
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
                return;
            }

            if (event.key !== "Tab" || !panelRef.current) {
                return;
            }

            const focusable = Array.from(
                panelRef.current.querySelectorAll<HTMLElement>(
                    FOCUSABLE_SELECTOR
                )
            );

            if (focusable.length === 0) {
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (
                !event.shiftKey &&
                document.activeElement === last
            ) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="invoice-modal-title"
                tabIndex={-1}
                className="w-full max-w-lg p-8 outline-none"
                style={{
                    background: tokens.semantic.surface,
                    borderRadius: tokens.radius.card,
                    boxShadow: tokens.shadows.lg,
                }}
            >

                {step === "choose" && (
                    <ChooseMethod
                        stepLabel={stepLabel}
                        onUpload={() => setStep("upload")}
                        onManual={() => setStep("manual")}
                        onClose={onClose}
                    />
                )}

                {step === "upload" && (
                    <UploadInvoice
                        stepLabel={stepLabel}
                        onBack={() => setStep("choose")}
                        onClose={onClose}
                    />
                )}

                {step === "manual" && (
                    <ManualInvoice
                        stepLabel={stepLabel}
                        onBack={() => setStep("choose")}
                        onClose={onClose}
                    />
                )}

            </div>
        </div>
    );
}
