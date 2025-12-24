"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { getLeaderboard, removeFromLeaderboard, type LeaderboardEntry } from "@/lib/api"
import { FilterBar } from "@/components/filter-bar"
import { DataTable, type Column } from "@/components/data-table"
import { DropdownMenu } from "@/components/dropdown-menu"

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState("")
  const [selectedProviders, setSelectedProviders] = useState<string[]>([])
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>([])

  useEffect(() => {
    loadLeaderboard()
  }, [])

  async function loadLeaderboard() {
    try {
      setLoading(true)
      const data = await getLeaderboard()
      setEntries(data.entries)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leaderboard")
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(id: number) {
    if (!confirm("Remove this entry from the leaderboard?")) return

    try {
      await removeFromLeaderboard(id)
      setEntries(entries.filter(e => e.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to remove entry")
    }
  }

  // Get unique providers and benchmarks for filter options
  const providers = useMemo(() => {
    const counts: Record<string, number> = {}
    entries.forEach(e => {
      counts[e.provider] = (counts[e.provider] || 0) + 1
    })
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: value,
      count,
    }))
  }, [entries])

  const benchmarks = useMemo(() => {
    const counts: Record<string, number> = {}
    entries.forEach(e => {
      counts[e.benchmark] = (counts[e.benchmark] || 0) + 1
    })
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: value,
      count,
    }))
  }, [entries])

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesSearch =
          e.version.toLowerCase().includes(searchLower) ||
          e.runId.toLowerCase().includes(searchLower) ||
          e.provider.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      // Provider filter
      if (selectedProviders.length > 0 && !selectedProviders.includes(e.provider)) {
        return false
      }

      // Benchmark filter
      if (selectedBenchmarks.length > 0 && !selectedBenchmarks.includes(e.benchmark)) {
        return false
      }

      return true
    })
  }, [entries, search, selectedProviders, selectedBenchmarks])

  // Get question types and registry - only when exactly one benchmark is selected
  const { visibleQuestionTypes, typeRegistry } = useMemo((): { visibleQuestionTypes: string[]; typeRegistry: LeaderboardEntry["questionTypeRegistry"] } => {
    if (selectedBenchmarks.length !== 1) {
      return { visibleQuestionTypes: [], typeRegistry: null }
    }

    // Get all question types present in filtered entries for the selected benchmark
    const types = new Set<string>()
    let registry: LeaderboardEntry["questionTypeRegistry"] = null

    filteredEntries.forEach(e => {
      Object.keys(e.byQuestionType).forEach(t => types.add(t))
      if (!registry && e.questionTypeRegistry) {
        registry = e.questionTypeRegistry
      }
    })

    return {
      visibleQuestionTypes: Array.from(types).sort(),
      typeRegistry: registry,
    }
  }, [selectedBenchmarks, filteredEntries])

  // Build columns
  const columns: Column<LeaderboardEntry>[] = useMemo(() => {
    const cols: Column<LeaderboardEntry>[] = [
      {
        key: "rank",
        header: "Rank",
        width: "60px",
        render: (_, idx) => (
          <span className="font-mono text-text-muted">{idx + 1}</span>
        ),
      },
      {
        key: "provider",
        header: "Provider",
        render: (entry) => (
          <span className="capitalize">{entry.provider}</span>
        ),
      },
      {
        key: "benchmark",
        header: "Benchmark",
        render: (entry) => (
          <span className="capitalize">{entry.benchmark}</span>
        ),
      },
      {
        key: "version",
        header: "Version",
        render: (entry) => (
          <Link
            href={`/leaderboard/${entry.id}`}
            className="font-mono text-accent hover:underline cursor-pointer text-sm"
          >
            {entry.version}
          </Link>
        ),
      },
      {
        key: "date",
        header: "Date",
        render: (entry) => {
          const date = new Date(entry.addedAt)
          return (
            <span className="text-text-secondary font-mono text-xs">
              {date.getFullYear()}-{String(date.getMonth() + 1).padStart(2, "0")}
            </span>
          )
        },
      },
    ]

    // Add question type columns only when single benchmark is selected
    visibleQuestionTypes.forEach(type => {
      const alias = typeRegistry?.[type]?.alias || type.replace(/[-_]/g, " ")
      cols.push({
        key: type,
        header: alias,
        align: "center",
        render: (entry) => {
          const stats = entry.byQuestionType[type]
          if (!stats) {
            return <span className="text-text-muted">—</span>
          }
          return (
            <span className="font-mono">
              {(stats.accuracy * 100).toFixed(0)}%
            </span>
          )
        },
      })
    })

    // Accuracy column (always last)
    cols.push({
      key: "accuracy",
      header: "Accuracy",
      align: "right",
      render: (entry) => (
        <span className="font-mono font-medium text-accent">
          {(entry.accuracy * 100).toFixed(1)}%
        </span>
      ),
    })

    // Actions column
    cols.push({
      key: "actions",
      header: "",
      width: "40px",
      align: "right",
      render: (entry) => (
        <DropdownMenu
          items={[
            {
              label: "view details",
              href: `/leaderboard/${entry.id}`,
            },
            { divider: true },
            {
              label: "remove from leaderboard",
              onClick: () => handleRemove(entry.id),
              danger: true,
            },
          ]}
        />
      ),
    })

    return cols
  }, [visibleQuestionTypes, typeRegistry])

  const clearFilters = () => {
    setSearch("")
    setSelectedProviders([])
    setSelectedBenchmarks([])
  }

  if (error) {
    return (
      <div className="animate-fade-in">
        <div className="mb-6">
          <h1 className="text-2xl font-display font-semibold text-text-primary">Leaderboard</h1>
        </div>
        <div className="text-center py-12">
          <p className="text-status-error">{error}</p>
          <button className="btn btn-secondary mt-3" onClick={loadLeaderboard}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-text-primary">Leaderboard</h1>
      </div>

      {/* Filter Bar */}
      {!loading && entries.length > 0 && (
        <div className="mb-0">
          <FilterBar
            totalCount={entries.length}
            filteredCount={filteredEntries.length}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search leaderboard..."
            filters={[
              {
                key: "providers",
                label: "Select providers",
                options: providers,
                selected: selectedProviders,
                onChange: setSelectedProviders,
              },
              {
                key: "benchmarks",
                label: "Select benchmarks",
                options: benchmarks,
                selected: selectedBenchmarks,
                onChange: setSelectedBenchmarks,
              },
            ]}
            onClearAll={clearFilters}
          />
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-text-secondary mt-3">Loading leaderboard...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-bg-elevated flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">No entries yet</h3>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            Add runs to the leaderboard from the Runs page by clicking the three-dot menu on a completed run and selecting "Add to leaderboard".
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredEntries}
          emptyMessage="No entries match your filters"
          getRowKey={(entry) => entry.id}
        />
      )}
    </div>
  )
}
