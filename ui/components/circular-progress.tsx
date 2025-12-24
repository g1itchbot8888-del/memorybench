"use client"

interface CircularProgressProps {
  progress: number // 0 to 1
  size?: number
  strokeWidth?: number
  showPercentage?: boolean
}

export function CircularProgress({
  progress,
  size = 20,
  strokeWidth = 2.5,
  showPercentage = false,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - progress * circumference

  // Unique ID for gradient (needed when multiple instances on page)
  const gradientId = `progress-gradient-${Math.random().toString(36).substr(2, 9)}`

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="transform -rotate-90"
    >
      <defs>
        {/* Same gradient as New Run button: rgb(38, 123, 241) → rgb(21, 70, 139) */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(38, 123, 241)" />
          <stop offset="100%" stopColor="rgb(21, 70, 139)" />
        </linearGradient>
      </defs>

      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-[#333333]"
      />

      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />

      {/* Optional percentage text */}
      {showPercentage && (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-text-primary text-[8px] font-mono transform rotate-90"
          style={{ transformOrigin: "center" }}
        >
          {Math.round(progress * 100)}
        </text>
      )}
    </svg>
  )
}
