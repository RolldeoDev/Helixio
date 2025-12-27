import './ProgressRing.css';

export interface ProgressRingProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show percentage text inside ring */
  showLabel?: boolean;
  /** Additional CSS class */
  className?: string;
}

const sizeConfig = {
  sm: { diameter: 24, strokeWidth: 2, radius: 9, fontSize: 8 },
  md: { diameter: 32, strokeWidth: 3, radius: 12, fontSize: 10 },
  lg: { diameter: 40, strokeWidth: 3, radius: 14, fontSize: 11 },
};

export function ProgressRing({
  progress,
  size = 'md',
  showLabel = false,
  className = '',
}: ProgressRingProps) {
  const config = sizeConfig[size];
  const circumference = 2 * Math.PI * config.radius;
  const strokeDasharray = `${(progress / 100) * circumference} ${circumference}`;
  const viewBox = `0 0 ${config.diameter} ${config.diameter}`;
  const center = config.diameter / 2;
  // Background circle radius (fills the ring background)
  const bgRadius = center - 1;

  return (
    <svg
      className={`progress-ring progress-ring--${size} ${className}`}
      viewBox={viewBox}
      aria-label={`${Math.round(progress)}% complete`}
    >
      {/* Background fill circle */}
      <circle
        className="progress-ring__bg"
        cx={center}
        cy={center}
        r={bgRadius}
      />
      {/* Track circle */}
      <circle
        className="progress-ring__track"
        cx={center}
        cy={center}
        r={config.radius}
        fill="none"
        strokeWidth={config.strokeWidth}
      />
      {/* Progress arc */}
      <circle
        className="progress-ring__fill"
        cx={center}
        cy={center}
        r={config.radius}
        fill="none"
        strokeWidth={config.strokeWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />
      {/* Label text */}
      {showLabel && (
        <text
          className="progress-ring__label"
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: config.fontSize }}
        >
          {Math.round(progress)}%
        </text>
      )}
    </svg>
  );
}
