type SearchBarProps = {
    searchTerm: string;
    setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
};

export default function SearchBar({
    searchTerm,
    setSearchTerm,
}: SearchBarProps) {
    return (
       <div>
    <input
        type="text"
        placeholder="Search invoices..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
    />
</div>
    );
}