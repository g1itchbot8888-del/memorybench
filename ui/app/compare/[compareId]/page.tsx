"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  getCompare,
  getCompareReport,
  stopCompare,
  type CompareDetail,
  type CompareReport
} from "@/lib/api"
import { formatDate, getStatusColor, cn } from "@/lib/utils"
import { AccuracyBarChart } from "@/components/accuracy-bar-chart"

const POLL_INTERVAL = 2000 // 2 seconds

export default function CompareDetailPage() {
  const params = useParams()
  const compareId = decodeURIComponent(params.compareId as string)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const [compare, setCompare] = useState<CompareDetail | null>(null)
  const [report, setReport] = useState<CompareReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)

  // Check if comparison is in progress
  const isRunning = compare?.status === "running" || compare?.status === "pending"
  const canStop = isRunning

  // Silent refresh (no loading state)
  const refreshData = useCallback(async () => {
    try {
      const [compareData, reportData] = await Promise.all([
        getCompare(compareId),
        getCompareReport(compareId).catch(() => null),
      ])
      setCompare(compareData)
      setReport(reportData)
      setError(null)
    } catch (e) {
      // Silent fail on poll
    }
  }, [compareId])

  // Initial load
  useEffect(() => {
    loadData()
  }, [compareId])

  // Polling when comparison is in progress
  useEffect(() => {
    if (isRunning) {
      pollIntervalRef.current = setInterval(refreshData, POLL_INTERVAL)
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [isRunning, refreshData])

  async function loadData() {
    try {
      setLoading(true)
      const [compareData, reportData] = await Promise.all([
        getCompare(compareId),
        getCompareReport(compareId).catch(() => null),
      ])
      setCompare(compareData)
      setReport(reportData)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comparison")
    } finally {
      setLoading(false)
    }
  }

  async function handleStop() {
    if (stopping) return
    setStopping(true)
    try {
      await stopCompare(compareId)
      await refreshData()
    } catch (e) {
      console.error("Failed to stop:", e)
    } finally {
      setStopping(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !compare) {
    return (
      <div className="text-center py-12">
        <p className="text-status-error">{error || "Comparison not found"}</p>
        <Link href="/compare" className="btn btn-secondary mt-4">
          Back to comparisons
        </Link>
      </div>
    )
  }

  // Get reports by provider for easier access
  const reportsByProvider = new Map(
    report?.reports.map(r => [r.provider, r.report]) || []
  )

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-secondary mb-4">
        <Link href="/compare" className="hover:text-text-primary">Comparisons</Link>
        <span>/</span>
        <span className="text-text-primary font-mono">{compareId}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-semibold text-text-primary flex items-center gap-3 flex-wrap">
          {compareId}
          <span className={cn("badge text-sm", getStatusColor(compare.status))}>
            {compare.status}
          </span>
        </h1>

        <div className="flex items-center gap-4 mt-3 text-sm text-text-secondary flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-text-muted">Providers:</span>
            <div className="flex gap-2">
              {(compare.providers || compare.runs?.map(r => r.provider) || []).map(provider => (
                <span key={provider} className="badge text-xs bg-accent/10 text-accent capitalize">
                  {provider}
                </span>
              ))}
            </div>
          </div>
          <span>
            <span className="text-text-muted">Benchmark:</span>{" "}
            <span className="capitalize">{compare.benchmark}</span>
          </span>
          <span>
            <span className="text-text-muted">Judge:</span>{" "}
            {compare.judge}
          </span>
          <span>
            <span className="text-text-muted">Created:</span>{" "}
            {formatDate(compare.createdAt)}
          </span>
        </div>

        {/* Run IDs - clickable links to individual runs */}
        {compare.runs && compare.runs.length > 0 && (
          <div className="flex gap-3 mt-3 flex-wrap">
            {compare.runs.map(run => (
              <Link
                key={run.runId}
                href={`/runs/${encodeURIComponent(run.runId)}`}
                target="_blank"
                className="group flex flex-col items-start px-3 py-2 border border-border rounded hover:border-text-secondary transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-accent group-hover:underline">
                    {run.runId.length > 16 ? `${run.runId.slice(0, 16)}...` : run.runId}
                  </span>
                  <svg
                    className="w-3 h-3 text-border group-hover:text-text-secondary transition-colors"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                  </svg>
                </div>
                <span className="text-[10px] text-text-muted capitalize mt-0.5">{run.provider}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Actions - only show Stop button when running */}
        {canStop && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleStop}
              disabled={stopping}
              className={cn(
                "px-4 py-2 text-sm rounded transition-colors cursor-pointer",
                "bg-status-error/10 text-status-error hover:bg-status-error/20",
                stopping && "opacity-50 cursor-not-allowed"
              )}
            >
              {stopping ? "Stopping..." : "Stop"}
            </button>
          </div>
        )}
      </div>

      {/* Individual Run Progress (when running) */}
      {isRunning && compare.runs && compare.runs.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-lg font-medium text-text-primary mb-4">Run Progress</h2>
          <div className="space-y-4">
            {compare.runs.map(run => {
              const progress = run.progress
              const total = progress?.total || 0
              const evaluated = progress?.evaluated || 0
              const percentage = total > 0 ? (evaluated / total) * 100 : 0

              return (
                <div key={run.provider} className="border border-border rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="capitalize text-text-primary font-medium">{run.provider}</span>
                      <span className={cn("badge text-xs", getStatusColor(run.status))}>
                        {run.status}
                      </span>
                    </div>
                    <span className="text-sm text-text-secondary font-mono">
                      {evaluated}/{total}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 bg-bg-primary rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  {/* Phase indicators */}
                  {progress && (
                    <div className="flex gap-3 text-xs">
                      <PhaseIndicator
                        label="ingest"
                        current={progress.ingested}
                        total={total}
                        completed={progress.ingested === total}
                      />
                      <PhaseIndicator
                        label="index"
                        current={progress.indexed}
                        total={total}
                        completed={progress.indexed === total}
                      />
                      <PhaseIndicator
                        label="search"
                        current={progress.searched}
                        total={total}
                        completed={progress.searched === total}
                      />
                      <PhaseIndicator
                        label="answer"
                        current={progress.answered}
                        total={total}
                        completed={progress.answered === total}
                      />
                      <PhaseIndicator
                        label="evaluate"
                        current={progress.evaluated}
                        total={total}
                        completed={progress.evaluated === total}
                      />
                    </div>
                  )}

                  {run.error && (
                    <div className="mt-3 text-sm text-status-error font-mono">
                      Error: {run.error}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Comparison Tables (when reports available) */}
      {report && report.reports.length > 0 && (
        <div className="space-y-8">
          {/* Overall Accuracy Table */}
          {/* Accuracy and Latency side by side */}
          <div className="flex gap-6">
            {/* Overall Accuracy - 35% width */}
            <div className="w-[35%]">
              <h3 className="text-sm font-medium text-text-primary font-display mb-3">Accuracy</h3>
              <div className="card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-text-muted font-medium uppercase text-xs">Provider</th>
                      <th className="text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows = report.reports.map(r => ({
                        provider: r.provider,
                        correct: r.report.summary?.correctCount ?? r.report.correctCount,
                        total: r.report.summary?.totalQuestions ?? r.report.totalQuestions,
                        accuracy: r.report.summary?.accuracy ?? r.report.accuracy
                      }))
                      const validAccuracies = rows.map(r => r.accuracy).filter((a): a is number => a != null)
                      const bestAccuracy = validAccuracies.length > 0 ? Math.max(...validAccuracies) : null
                      // Only highlight the FIRST occurrence of the best value
                      const firstBestIndex = bestAccuracy != null
                        ? rows.findIndex(r => r.accuracy === bestAccuracy)
                        : -1

                      return rows.map((row, index) => {
                        const isBest = index === firstBestIndex
                        return (
                          <tr key={row.provider} className="border-b border-border/50">
                            <td className="py-2 px-3 text-text-primary capitalize">{row.provider}</td>
                            <td className="py-2 px-3 text-right font-mono">
                              <span className={isBest ? "text-status-success font-semibold" : "text-text-primary"}>
                                {row.accuracy != null ? `${(row.accuracy * 100).toFixed(1)}%` : "—"}
                              </span>
                              {row.correct != null && row.total != null && (
                                <span className="ml-2 text-text-muted text-xs">({row.correct}/{row.total})</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Latency - 65% width */}
            {report.reports.some(r => r.report.latency || r.report.latencyStats) && (
              <div className="w-[65%]">
                <h3 className="text-sm font-medium text-text-primary font-display mb-3">Latency (median ms)</h3>
                <div className="card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 text-text-muted font-medium uppercase text-xs">Provider</th>
                          <th className="text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">Ingest</th>
                          <th className="text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">Search</th>
                          <th className="text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">Answer</th>
                          <th className="text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">Evaluate</th>
                          <th className="text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const phases = ["ingest", "search", "answer", "evaluate", "total"] as const
                          const rows = report.reports
                            .filter(r => r.report.latency || r.report.latencyStats)
                            .map(r => ({
                              provider: r.provider,
                              latency: (r.report.latency || r.report.latencyStats)!
                            }))

                          // Find best (lowest) for each phase and the FIRST index with that value
                          const bestByPhase = phases.reduce((acc, phase) => {
                            const values = rows.map(r => r.latency[phase]?.median)
                            const validValues = values.filter(v => v !== undefined && v !== null) as number[]
                            const bestValue = validValues.length > 0 ? Math.min(...validValues) : Infinity
                            const firstBestIndex = values.findIndex(v => v === bestValue)
                            acc[phase] = { value: bestValue, firstIndex: firstBestIndex }
                            return acc
                          }, {} as Record<string, { value: number; firstIndex: number }>)

                          return rows.map((row, rowIndex) => (
                            <tr key={row.provider} className="border-b border-border/50">
                              <td className="py-2 px-3 text-text-primary capitalize">{row.provider}</td>
                              {phases.map(phase => {
                                const value = row.latency[phase]?.median
                                // Only highlight the FIRST occurrence of the best value
                                const isBest = rowIndex === bestByPhase[phase].firstIndex
                                return (
                                  <td key={phase} className="py-2 px-3 text-right font-mono">
                                    {value !== undefined ? (
                                      <span className={isBest ? "text-white font-semibold" : "text-text-secondary"}>
                                        {value.toFixed(0)}
                                      </span>
                                    ) : (
                                      <span className="text-text-muted">—</span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Retrieval Metrics Table */}
          {report.reports.some(r => r.report.retrieval) && (
            <div>
              <h3 className="text-sm font-medium text-text-primary font-display mb-3">Retrieval Metrics</h3>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="w-[14.28%] text-left py-2 px-3 text-text-muted font-medium uppercase text-xs">Provider</th>
                      <th className="w-[14.28%] text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">Hit@K</th>
                      <th className="w-[14.28%] text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">Precision</th>
                      <th className="w-[14.28%] text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">Recall</th>
                      <th className="w-[14.28%] text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">F1</th>
                      <th className="w-[14.28%] text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">MRR</th>
                      <th className="w-[14.28%] text-right py-2 px-3 text-text-muted font-medium uppercase text-xs">NDCG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows = report.reports
                        .filter(r => r.report.retrieval)
                        .map(r => ({
                          provider: r.provider,
                          retrieval: r.report.retrieval!
                        }))

                      if (rows.length === 0) {
                        return (
                          <tr>
                            <td colSpan={7} className="py-4 px-3 text-center text-text-secondary">
                              Retrieval metrics not available
                            </td>
                          </tr>
                        )
                      }

                      // Find best values and FIRST index for each metric
                      const metrics = ["hitAtK", "precisionAtK", "recallAtK", "f1AtK", "mrr", "ndcg"] as const
                      const bestByMetric = metrics.reduce((acc, metric) => {
                        const values = rows.map(r => r.retrieval[metric])
                        const bestValue = Math.max(...values)
                        const firstBestIndex = values.findIndex(v => v === bestValue)
                        acc[metric] = { value: bestValue, firstIndex: firstBestIndex }
                        return acc
                      }, {} as Record<string, { value: number; firstIndex: number }>)

                      return rows.map((row, rowIndex) => (
                        <tr key={row.provider} className="border-b border-border/50">
                          <td className="py-2 px-3 text-text-primary capitalize">{row.provider}</td>
                          <td className="py-2 px-3 text-right font-mono">
                            <span className={rowIndex === bestByMetric.hitAtK.firstIndex ? "text-white font-semibold" : "text-text-secondary"}>
                              {(row.retrieval.hitAtK * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            <span className={rowIndex === bestByMetric.precisionAtK.firstIndex ? "text-white font-semibold" : "text-text-secondary"}>
                              {(row.retrieval.precisionAtK * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            <span className={rowIndex === bestByMetric.recallAtK.firstIndex ? "text-white font-semibold" : "text-text-secondary"}>
                              {(row.retrieval.recallAtK * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            <span className={rowIndex === bestByMetric.f1AtK.firstIndex ? "text-white font-semibold" : "text-text-secondary"}>
                              {(row.retrieval.f1AtK * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            <span className={rowIndex === bestByMetric.mrr.firstIndex ? "text-white font-semibold" : "text-text-secondary"}>
                              {row.retrieval.mrr.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            <span className={rowIndex === bestByMetric.ndcg.firstIndex ? "text-white font-semibold" : "text-text-secondary"}>
                              {row.retrieval.ndcg.toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By Question Type - Table and Chart */}
          {report.reports.some(r => r.report.byQuestionType && Object.keys(r.report.byQuestionType).length > 0) && (
            <div>
              <h3 className="text-sm font-medium text-text-primary font-display mb-3">Accuracy by Question Type</h3>
              <div className="flex gap-8 items-stretch" style={{ minHeight: 420 }}>
                {/* Left: Table (50%) */}
                <div className="w-[50%] flex flex-col">
                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-4 px-4 text-text-muted font-medium text-xs">Categories</th>
                          {report.reports.map(r => (
                            <th key={r.provider} className="text-right py-4 px-4 text-text-muted font-medium text-xs capitalize">
                              {r.provider}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // Collect all question types
                          const allTypes = new Set<string>()
                          report.reports.forEach(r => {
                            if (r.report.byQuestionType) {
                              Object.keys(r.report.byQuestionType).forEach(type => allTypes.add(type))
                            }
                          })

                          const rows = Array.from(allTypes).sort().map(type => {
                            const values = report.reports.map(r => ({
                              provider: r.provider,
                              accuracy: r.report.byQuestionType?.[type]?.accuracy
                            }))

                            const validValues = values
                              .map(v => v.accuracy)
                              .filter(a => a !== undefined) as number[]
                            const bestAccuracy = validValues.length > 0 ? Math.max(...validValues) : undefined

                            // Find the index of the FIRST best value (for tie-breaking)
                            const firstBestIndex = bestAccuracy !== undefined
                              ? values.findIndex(v => v.accuracy === bestAccuracy)
                              : -1

                            return (
                              <tr key={type} className="border-b border-border/30">
                                <td className="py-4 px-4 text-text-secondary">
                                  {type.replace(/[-_]/g, "-")}
                                </td>
                                {values.map(({ provider, accuracy }, index) => {
                                  // Only highlight the FIRST occurrence of the best value
                                  const isBest = index === firstBestIndex
                                  return (
                                    <td key={provider} className="py-4 px-4 text-right font-mono">
                                      {accuracy !== undefined ? (
                                        <span className={isBest ? "text-white font-semibold" : "text-text-secondary"}>
                                          {(accuracy * 100).toFixed(1)}%
                                        </span>
                                      ) : (
                                        <span className="text-text-muted">—</span>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })

                          // Calculate overall accuracy for each provider
                          const overallValues = report.reports.map(r => {
                            const accuracy = r.report.summary?.accuracy ?? r.report.accuracy
                            return {
                              provider: r.provider,
                              accuracy
                            }
                          })

                          const validOverall = overallValues
                            .map(v => v.accuracy)
                            .filter(a => a !== undefined) as number[]
                          const bestOverall = validOverall.length > 0 ? Math.max(...validOverall) : undefined
                          const firstBestOverallIndex = bestOverall !== undefined
                            ? overallValues.findIndex(v => v.accuracy === bestOverall)
                            : -1

                          return (
                            <>
                              {rows}
                              {/* Overall row */}
                              <tr className="border-t-2 border-border">
                                <td className="py-4 px-4 text-text-primary font-semibold">Overall</td>
                                {overallValues.map(({ provider, accuracy }, index) => {
                                  const isBest = index === firstBestOverallIndex
                                  return (
                                    <td key={provider} className="py-4 px-4 text-right font-mono">
                                      {accuracy !== undefined ? (
                                        <span className={isBest ? "text-white font-semibold" : "text-text-secondary"}>
                                          {(accuracy * 100).toFixed(1)}%
                                        </span>
                                      ) : (
                                        <span className="text-text-muted">—</span>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            </>
                          )
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right: Bar Chart (50%) */}
                <div className="w-[50%] flex flex-col">
                  {(() => {
                    // Prepare data for chart
                    const allTypes = new Set<string>()
                    report.reports.forEach(r => {
                      if (r.report.byQuestionType) {
                        Object.keys(r.report.byQuestionType).forEach(type => allTypes.add(type))
                      }
                    })

                    const chartData = Array.from(allTypes).sort().map(type => ({
                      type,
                      values: report.reports.map(r => ({
                        provider: r.provider,
                        accuracy: r.report.byQuestionType?.[type]?.accuracy
                      }))
                    }))

                    const providers = report.reports.map(r => r.provider)

                    return <AccuracyBarChart data={chartData} providers={providers} />
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state when no reports yet */}
      {!report && !isRunning && (
        <div className="card text-center py-12">
          <p className="text-text-secondary">No comparison results available yet.</p>
        </div>
      )}
    </div>
  )
}

// Phase indicator component
function PhaseIndicator({
  label,
  current,
  total,
  completed
}: {
  label: string
  current: number
  total: number
  completed: boolean
}) {
  const isActive = current > 0 && current < total
  const icon = completed ? "✓" : isActive ? "●" : "○"

  return (
    <div className={cn(
      "flex items-center gap-1.5",
      completed && "text-status-success",
      isActive && "text-accent",
      !completed && !isActive && "text-text-muted"
    )}>
      <span>{icon}</span>
      <span className="capitalize">{label}</span>
      <span className="text-text-muted">({current}/{total})</span>
    </div>
  )
}
