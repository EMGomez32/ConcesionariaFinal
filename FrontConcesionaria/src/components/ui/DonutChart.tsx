interface DonutSlice {
    label: string;
    value: number;
    color: string;
}

interface DonutChartProps {
    data: DonutSlice[];
    size?: number;
    thickness?: number;
    centerLabel?: string;
    centerValue?: string | number;
}

const DonutChart = ({ data, size = 180, thickness = 22, centerLabel, centerValue }: DonutChartProps) => {
    const radius = (size - thickness) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * radius;
    const total = data.reduce((sum, d) => sum + d.value, 0);

    let offset = 0;
    const segments = data.map((slice, idx) => {
        const portion = total > 0 ? slice.value / total : 0;
        const length = portion * circumference;
        const seg = (
            <circle
                key={idx}
                cx={cx}
                cy={cy}
                r={radius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={thickness}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap={portion < 1 && portion > 0 ? 'butt' : 'round'}
                style={{ transition: 'stroke-dasharray 480ms var(--easing-soft), stroke-dashoffset 480ms var(--easing-soft)' }}
            />
        );
        offset += length;
        return seg;
    });

    return (
        <div className="donut-chart" role="img" aria-label={`Distribución total: ${total}`}>
            <div className="donut-chart-svg-wrapper" style={{ width: size, height: size }}>
                <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    style={{ transform: 'rotate(-90deg)' }}
                >
                    <circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        fill="transparent"
                        stroke="var(--bg-secondary)"
                        strokeWidth={thickness}
                    />
                    {total > 0 && segments}
                </svg>
                <div className="donut-chart-center">
                    {centerValue !== undefined && (
                        <span className="donut-chart-value">{centerValue}</span>
                    )}
                    {centerLabel && (
                        <span className="donut-chart-label">{centerLabel}</span>
                    )}
                </div>
            </div>

            <ul className="donut-chart-legend">
                {data.map((slice, idx) => {
                    const portion = total > 0 ? Math.round((slice.value / total) * 100) : 0;
                    return (
                        <li key={idx}>
                            <span className="donut-chart-dot" style={{ background: slice.color }} aria-hidden="true" />
                            <span className="donut-chart-legend-label">{slice.label}</span>
                            <span className="donut-chart-legend-value">{slice.value}</span>
                            <span className="donut-chart-legend-pct">{portion}%</span>
                        </li>
                    );
                })}
            </ul>

            <style>{`
                .donut-chart {
                    display: flex;
                    align-items: center;
                    gap: var(--space-6);
                    flex-wrap: wrap;
                }
                .donut-chart-svg-wrapper {
                    position: relative;
                    flex-shrink: 0;
                }
                .donut-chart-center {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                }
                .donut-chart-value {
                    font-family: var(--font-display);
                    font-size: 1.875rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    line-height: 1;
                    font-variant-numeric: tabular-nums;
                }
                .donut-chart-label {
                    font-family: var(--font-sans);
                    font-size: 0.65rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.16em;
                    font-weight: 600;
                    margin-top: 0.4rem;
                }
                .donut-chart-legend {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    flex: 1;
                    min-width: 220px;
                }
                .donut-chart-legend li {
                    display: grid;
                    grid-template-columns: 12px 1fr auto auto;
                    align-items: center;
                    gap: 0.625rem;
                    padding: 0.4rem 0.5rem;
                    border-radius: var(--radius-sm);
                    font-family: var(--font-sans);
                    font-size: var(--text-sm);
                }
                .donut-chart-legend li:hover {
                    background: var(--bg-secondary);
                }
                .donut-chart-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    box-shadow: 0 0 6px currentColor;
                }
                .donut-chart-legend-label {
                    color: var(--text-secondary);
                }
                .donut-chart-legend-value {
                    font-family: var(--font-display);
                    font-weight: 600;
                    color: var(--text-primary);
                    font-variant-numeric: tabular-nums;
                }
                .donut-chart-legend-pct {
                    color: var(--text-muted);
                    font-size: var(--text-xs);
                    font-weight: 600;
                    min-width: 36px;
                    text-align: right;
                    font-variant-numeric: tabular-nums;
                }

                @media (max-width: 640px) {
                    .donut-chart { justify-content: center; }
                    .donut-chart-legend { min-width: 100%; }
                }
            `}</style>
        </div>
    );
};

export default DonutChart;
