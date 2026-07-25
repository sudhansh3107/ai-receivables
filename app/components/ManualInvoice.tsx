import ModalHeader from "./ModalHeader";

type ManualInvoiceProps = {
    onBack: () => void;
    onClose: () => void;
};

export default function ManualInvoice({
    onBack,
    onClose,
}: ManualInvoiceProps) {
    return (
        <>
            <ModalHeader
    title="Create Invoice"
    showBack
    onBack={onBack}
    onClose={onClose}
/>
                        <p>Form coming next...</p>
        </>
    );
}