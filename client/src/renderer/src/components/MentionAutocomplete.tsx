/**
 * @mention autocomplete dropdown.
 *
 * Appears when user types '@' in the composer. Filters members and roles
 * by substring match. Supports keyboard navigation (Arrow keys, Enter/Tab
 * to select, Escape to dismiss).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useStore } from '../stores'

export interface MentionItem {
  type: 'user' | 'role'
  id: string
  displayName: string
  color?: string | null
}

interface MentionAutocompleteProps {
  query: string
  onSelect: (item: MentionItem) => void
  onClose: () => void
  anchorX: number
  anchorY: number
}

const MAX_RESULTS = 10
const DEBOUNCE_MS = 100

export default function MentionAutocomplete({
  query,
  onSelect,
  onClose,
  anchorX,
  anchorY,
}: MentionAutocompleteProps) {
  const members = useStore((s) => s.members)
  const roles = useStore((s) => s.roles)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const listRef = useRef<HTMLDivElement>(null)

  // Debounce filter query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // Filter and combine results
  const items: MentionItem[] = useMemo(() => {
    const lowerQuery = debouncedQuery.toLowerCase()

    const matchedMembers: MentionItem[] = members
      .filter((m) => m.display_name.toLowerCase().includes(lowerQuery))
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .map((m) => ({
        type: 'user' as const,
        id: m.id,
        displayName: m.display_name,
      }))

    const matchedRoles: MentionItem[] = roles
      .filter((r) => !r.is_default && r.name.toLowerCase().includes(lowerQuery))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({
        type: 'role' as const,
        id: r.id,
        displayName: r.name,
        color: r.color,
      }))

    return [...matchedMembers, ...matchedRoles].slice(0, MAX_RESULTS)
  }, [debouncedQuery, members, roles])

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0)
  }, [items.length])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % Math.max(items.length, 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev <= 0 ? Math.max(items.length - 1, 0) : prev - 1
          )
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          if (items[selectedIndex]) {
            onSelect(items[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [items, selectedIndex, onSelect, onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const selectedEl = container.children[selectedIndex] as HTMLElement | undefined
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (items.length === 0) return null

  // Position above the caret
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(anchorX, window.innerWidth - 280),
    bottom: window.innerHeight - anchorY + 4,
    zIndex: 100,
  }

  return (
    <div
      ref={listRef}
      className="max-h-[300px] w-[260px] overflow-y-auto rounded-lg border border-white/10 bg-[var(--color-bg-rail)] py-1 shadow-xl"
      style={style}
    >
      {items.map((item, index) => (
        <button
          key={`${item.type}-${item.id}`}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
            index === selectedIndex
              ? 'bg-white/10 text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-muted)] hover:bg-white/5'
          }`}
          onClick={() => onSelect(item)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {item.type === 'user' ? (
            // User avatar placeholder
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-[var(--color-text-primary)]">
              {item.displayName.charAt(0).toUpperCase()}
            </div>
          ) : (
            // Role color dot
            <div
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: item.color || '#888' }}
            />
          )}
          <span className="truncate">{item.displayName}</span>
          <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
            {item.type === 'user' ? 'User' : 'Role'}
          </span>
        </button>
      ))}
    </div>
  )
}
