type HeaderProps = {
    name: string;
    onNewInvoiceClick: () => void;
};

export default function Header({
    name,
    onNewInvoiceClick,
}: HeaderProps) {
    return (
        <div className="space-y-4">

            {/* Top Row */}
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">
                    {name} - 🤖 AI Employee
                </h1>

                <button
                    onClick={onNewInvoiceClick}
                    className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition cursor-pointer"
                >
                    + New Invoice
                </button>
            </div>

            {/* Welcome Section */}
            <div>
                <h2 className="text-xl font-semibold">
                    Welcome, Sudhansh
                </h2>

                <p className="text-gray-600">
                    Your AI Accounts Receivable Employee is ready.
                </p>
            </div>

        </div>
    );
}