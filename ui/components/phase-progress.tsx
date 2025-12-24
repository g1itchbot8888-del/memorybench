"use client"

import { cn } from "@/lib/utils"

interface PhaseProgressProps {
  summary: {
    total: number
    ingested: number
    indexed: number
    searched: number
    answered: number
    evaluated: number
  }
}

const phases = [
  { key: "ingested", label: "Ingest" },
  { key: "indexed", label: "Index" },
  { key: "searched", label: "Search" },
  { key: "answered", label: "Answer" },
  { key: "evaluated", label: "Evaluate" },
] as const

export function PhaseProgress({ summary }: PhaseProgressProps) {
  return (
    <div className="card">
      <h3 className="text-sm font-medium text-text-primary mb-4">Pipeline Progress</h3>
      <div className="flex items-center gap-2">
        {phases.map((phase, idx) => {
          const count = summary[phase.key]
          const progress = (count / summary.total) * 100
          const isComplete = count === summary.total
          const isInProgress = count > 0 && count < summary.total
          const isPending = count === 0

          return (
            <div key={phase.key} className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-text-secondary">{phase.label}</span>
                <span className="text-xs font-mono text-text-muted">
                  {count}/{summary.total}
                </span>
              </div>
              <div className="h-2 bg-bg-elevated rounded-sm overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-sm transition-all duration-500",
                    isComplete && "bg-status-success",
                    isInProgress && "bg-accent",
                    isPending && "bg-transparent"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {idx < phases.length - 1 && (
                <div className="hidden md:block absolute top-1/2 right-0 w-4 h-0.5 bg-border transform translate-x-full -translate-y-1/2" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
