import ModalHeader from "@/app/components/shared/ModalHeader";

type ChooseMethodProps = {
    onUpload: () => void;
    onManual: () => void;
    onClose: () => void;
};

export default function ChooseMethod({
    onUpload,
    onManual,
    onClose,
}: ChooseMethodProps) {
    return (
        <>
           <ModalHeader
    title="New Invoice"
    onClose={onClose}
/>

            <p className="mb-8 text-gray-600">
                How would you like to create this invoice?
            </p>

            <button
                onClick={onUpload}
                className="mb-4 w-full rounded-lg border p-4 text-left hover:bg-gray-50 cursor-pointer"
            >
                <h3 className="font-semibold">
                    🤖 Upload Invoice PDF
                </h3>

                <p className="text-sm text-gray-500">
                    Recommended. AI extracts invoice details automatically.
                </p>
            </button>

            <button
                onClick={onManual}
                className="w-full rounded-lg border p-4 text-left hover:bg-gray-50 cursor-pointer"
            >
                <h3 className="font-semibold">
                    ✍️ Create Manually
                </h3>

                <p className="text-sm text-gray-500">
                    Enter invoice information yourself.
                </p>
            </button>
        </>
    );
}