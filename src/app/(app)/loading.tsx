export default function AppLoading() {
    return (
        <div className="h-full w-full px-4 py-6">
            <div className="mb-6 h-16 w-full animate-pulse rounded-3xl bg-white/40 dark:bg-slate-800/60" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                    <div
                        key={index}
                        className="h-36 animate-pulse rounded-3xl bg-white/35 dark:bg-slate-800/55"
                    />
                ))}
            </div>
        </div>
    );
}
