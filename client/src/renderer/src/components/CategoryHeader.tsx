import { useState, useRef, useEffect } from 'react'

interface CategoryHeaderProps {
  name: string
  channelCount: number
  collapsed: boolean
  isAdmin: boolean
  onToggle: () => void
  onRename?: (newName: string) => void
  onDelete?: () => void
}

export default function CategoryHeader({
  name,
  channelCount,
  collapsed,
  isAdmin,
  onToggle,
  onRename,
  onDelete
}: CategoryHeaderProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(name)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  // Focus input when renaming
  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renaming])

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isAdmin) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== name && onRename) {
      onRename(trimmed)
    }
    setRenaming(false)
  }

  if (renaming) {
    return (
      <div className="flex items-center gap-1 px-1 py-1">
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit()
            if (e.key === 'Escape') { setRenaming(false); setRenameValue(name) }
          }}
          maxLength={32}
          className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        className="flex w-full items-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
        onClick={onToggle}
        onContextMenu={handleContextMenu}
      >
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="truncate">{name}</span>
        {collapsed && (
          <span className="ml-auto shrink-0 text-[10px] font-normal text-[var(--color-text-muted)]">
            {channelCount}
          </span>
        )}
      </button>

      {/* Context menu (admin only) */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[140px] rounded-lg border border-white/10 bg-[var(--color-bg-rail)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full items-center px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
            onClick={() => {
              setRenameValue(name)
              setRenaming(true)
              setContextMenu(null)
            }}
          >
            Rename Category
          </button>
          <button
            className="flex w-full items-center px-3 py-1.5 text-sm text-red-400 hover:bg-white/5 hover:text-red-300"
            onClick={() => {
              onDelete?.()
              setContextMenu(null)
            }}
          >
            Delete Category
          </button>
        </div>
      )}
    </div>
  )
}
