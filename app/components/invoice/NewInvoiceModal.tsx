import { useState } from "react";
import ChooseMethod from "./ChooseMethod";
import UploadInvoice from "./UploadInvoice";
import ManualInvoice from "./ManualInvoice";
import ModalHeader from "./ModalHeader";

type Step = "choose" | "upload" | "manual";

type NewInvoiceModalProps = {
    onClose: () => void;
};

export default function NewInvoiceModal({
    onClose,
}: NewInvoiceModalProps) {
    const [step, setStep] = useState<Step>("choose");

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow-xl">

                {step === "choose" && (
                    <ChooseMethod
                        onUpload={() => setStep("upload")}
                        onManual={() => setStep("manual")}
                        onClose={onClose}
                    />
                )}

                {step === "upload" && (
    <UploadInvoice
        onBack={() => setStep("choose")}
        onClose={onClose}
    />
)}

{step === "manual" && (
    <ManualInvoice
        onBack={() => setStep("choose")}
        onClose={onClose}
    />
)}

            </div>
        </div>
    );
}