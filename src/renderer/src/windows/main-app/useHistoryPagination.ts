import { useCallback, useEffect, useMemo, useState } from 'react'

import { getHistoryPage } from '@renderer/lib/ipc'

import type { MainAppHistoryEntry } from './types'

const HISTORY_PAGE_SIZE = 10

function clampPageIndex(pageIndex: number, totalCount: number): number {
  const pageCount = Math.max(1, Math.ceil(totalCount / HISTORY_PAGE_SIZE))
  return Math.min(Math.max(pageIndex, 0), pageCount - 1)
}

export function useHistoryPagination(input: {
  recentHistory: MainAppHistoryEntry[]
  totalCount: number
  open: boolean
}) {
  const { recentHistory, totalCount, open } = input
  const [pageIndex, setPageIndex] = useState(0)
  const [pages, setPages] = useState<Record<number, MainAppHistoryEntry[]>>({
    0: recentHistory
  })
  const [loading, setLoading] = useState(false)

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(totalCount / HISTORY_PAGE_SIZE)),
    [totalCount]
  )

  useEffect(() => {
    setPages({ 0: recentHistory })
    setPageIndex((currentPageIndex) => clampPageIndex(currentPageIndex, totalCount))
  }, [recentHistory, totalCount])

  useEffect(() => {
    if (!open) {
      setLoading(false)
      setPageIndex(0)
      return
    }

    if (pages[pageIndex]) {
      return
    }

    let cancelled = false
    setLoading(true)

    void getHistoryPage({
      offset: pageIndex * HISTORY_PAGE_SIZE,
      limit: HISTORY_PAGE_SIZE
    })
      .then((page) => {
        if (cancelled) {
          return
        }

        setPages((currentPages) => ({
          ...currentPages,
          [pageIndex]: page.items
        }))
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, pageIndex, pages])

  const goToNextPage = useCallback(() => {
    setPageIndex((currentPageIndex) => clampPageIndex(currentPageIndex + 1, totalCount))
  }, [totalCount])

  const goToPreviousPage = useCallback(() => {
    setPageIndex((currentPageIndex) => Math.max(currentPageIndex - 1, 0))
  }, [])

  return {
    history: pages[pageIndex] ?? [],
    loading,
    pageCount,
    pageIndex,
    goToNextPage,
    goToPreviousPage
  }
}
