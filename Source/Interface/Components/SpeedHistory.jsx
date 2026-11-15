import React from 'react';

// Draw recent throughput and leave gaps where speed measurements are unavailable.
export default function SpeedHistory({ samples, label }) {
	const width = 144;
	const bottom = 38;
	const end = samples.at(-1)?.time ?? 0;
	const peak = Math.max(1, ...samples.map((sample) => sample.value ?? 0)) * 1.1;
	const segments = [];
	let segment = [];
	for (const sample of samples) {
		if (sample.value == null) {
			if (segment.length) {
				segments.push(segment);
			}
			segment = [];
			continue;
		}
		segment.push({
			x: Math.max(0, width * (1 - (end - sample.time) / 60000)),
			y: bottom - (sample.value / peak) * 34
		});
	}
	if (segment.length) {
		segments.push(segment);
	}
	const last = segments.at(-1)?.at(-1);

	return (
		<svg
			className="speed-chart"
			viewBox="0 0 144 42"
			role="img"
			aria-label={label}
		>
			<defs>
				<linearGradient
					id="speed-fill"
					x1="0"
					y1="0"
					x2="0"
					y2="1"
				>
					<stop
						offset="0%"
						stopColor="currentColor"
						stopOpacity="0.2"
					/>
					<stop
						offset="100%"
						stopColor="currentColor"
						stopOpacity="0"
					/>
				</linearGradient>
			</defs>
			<path
				className="speed-baseline"
				d="M0 38 H144"
			/>
			{segments.map((points, index) => {
				const line = points
					.map(
						(point, i) =>
							`${i ? 'L' : 'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
					)
					.join(' ');
				return (
					<g key={index}>
						<path
							fill="url(#speed-fill)"
							d={`${line} L${points.at(-1).x} ${bottom} L${points[0].x} ${bottom} Z`}
						/>
						<path
							className="speed-line"
							d={line}
						/>
					</g>
				);
			})}
			{last && samples.at(-1)?.value != null && (
				<circle
					cx={last.x}
					cy={last.y}
					r="2"
					fill="currentColor"
				/>
			)}
		</svg>
	);
}
