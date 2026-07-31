/** Tarjeta de estadística compartida por los tabs de Reportes y Objetivos. */
export const StatCard = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="card stat-card">
        <div className="stat-content">
            <span className="text-muted font-bold text-xs uppercase tracking-wider mb-1">{label}</span>
            <span className="stat-value" style={color ? { color } : undefined}>{value}</span>
        </div>
    </div>
);
