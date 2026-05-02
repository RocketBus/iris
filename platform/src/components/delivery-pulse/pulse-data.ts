// Anonymized sample data from examples/sample-report.md
export const pulseData = [
  { week: "01/12", commits: 5, stabilization: 0.79 },
  { week: "01/19", commits: 1, stabilization: null },
  { week: "01/26", commits: 5, stabilization: 0.70 },
  { week: "02/02", commits: 15, stabilization: 0.61 },
  { week: "02/09", commits: 12, stabilization: 0.79 },
  { week: "02/16", commits: 11, stabilization: 0.58 },
  { week: "02/23", commits: 5, stabilization: 0.79 },
  { week: "03/02", commits: 54, stabilization: 0.59 },
  { week: "03/09", commits: 12, stabilization: 0.74 },
  { week: "03/16", commits: 17, stabilization: 0.61 },
  { week: "03/23", commits: 24, stabilization: 0.39 },
];

export function getColor(stabilization: number | null): string {
  if (stabilization === null) return "#374151"; // gray
  if (stabilization >= 0.70) return "#A528FF";  // green
  if (stabilization >= 0.50) return "#eab308";  // yellow
  return "#ef4444";                              // red
}

export function getColorClass(stabilization: number | null): string {
  if (stabilization === null) return "bg-signal-gray";
  if (stabilization >= 0.70) return "bg-signal-purple";
  if (stabilization >= 0.50) return "bg-signal-yellow";
  return "bg-signal-red";
}
