import { useState, useRef, useEffect } from 'react'
import { useStore } from '../stores'
import { useChannels } from '../hooks/useChannels'
import { useRoles } from '../hooks/useRoles'
import ConnectionDot from './ConnectionDot'
import ChannelList from './ChannelList'
import SkeletonShimmer from './SkeletonShimmer'

export default function ChannelSidebar() {
  const serverName = useStore((s) => s.name)
  const isOwner = useStore((s) => s.isOwner)
  const displayName = useStore((s) => s.displayName)

  const { categoriesWithChannels, activeChannelId, loading, setActiveChannel } = useChannels()
  useRoles() // Initialize roles fetching and WS subscription

  // Determine admin status: owner always has admin. Could also check role permissions.
  const isAdmin = isOwner

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showCreateCategory, setShowCreateCategory] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const createMenuRef = useRef<HTMLDivElement>(null)

  // New channel form state
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text')
  const [newChannelCategoryId, setNewChannelCategoryId] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creating, setCreating] = useState(false)

  // Store actions
  const createChannel = useStore((s) => s.createChannel)
  const renameChannel = useStore((s) => s.renameChannel)
  const deleteChannel = useStore((s) => s.deleteChannel)
  const createCategory = useStore((s) => s.createCategory)
  const renameCategory = useStore((s) => s.renameCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  // Close create menu when clicking outside
  useEffect(() => {
    if (!showCreateMenu) return
    const handleClick = (e: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showCreateMenu])

  // Set default category for new channel form
  useEffect(() => {
    if (categoriesWithChannels.length > 0 && !newChannelCategoryId) {
      setNewChannelCategoryId(categoriesWithChannels[0].category.id)
    }
  }, [categoriesWithChannels, newChannelCategoryId])

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !newChannelCategoryId) return
    setCreating(true)
    try {
      await createChannel(newChannelName.trim(), newChannelType, newChannelCategoryId)
      setNewChannelName('')
      setNewChannelType('text')
      setShowCreateChannel(false)
    } catch (err) {
      console.error('Failed to create channel:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    setCreating(true)
    try {
      await createCategory(newCategoryName.trim())
      setNewCategoryName('')
      setShowCreateCategory(false)
    } catch (err) {
      console.error('Failed to create category:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleRenameChannel = async (id: string, name: string) => {
    try {
      await renameChannel(id, name)
    } catch (err) {
      console.error('Failed to rename channel:', err)
    }
  }

  const handleDeleteChannel = async (id: string) => {
    try {
      await deleteChannel(id)
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
  }

  const handleRenameCategory = async (id: string, name: string) => {
    try {
      await renameCategory(id, name)
    } catch (err) {
      console.error('Failed to rename category:', err)
    }
  }

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteCategory(id)
    } catch (err) {
      console.error('Failed to delete category:', err)
    }
  }

  return (
    <div className="flex h-full w-[240px] shrink-0 flex-col bg-[var(--color-bg-secondary)]">
      {/* Server name header with dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          className="flex h-12 w-full items-center justify-between border-b border-white/5 px-4 transition-colors hover:bg-white/5"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {serverName ?? 'No Server'}
          </h2>
          <svg
            className={`h-4 w-4 text-[var(--color-text-muted)] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {dropdownOpen && (
          <div className="absolute left-2 right-2 top-[calc(100%+2px)] z-50 rounded-lg border border-white/10 bg-[var(--color-bg-rail)] py-1 shadow-lg">
            {isAdmin && (
              <>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                  onClick={() => {
                    useStore.setState({ activePanel: 'settings' })
                    setDropdownOpen(false)
                  }}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Server Settings
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                  onClick={() => {
                    useStore.setState({ activePanel: 'channel-management' })
                    setDropdownOpen(false)
                  }}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  Channel Management
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                  onClick={() => {
                    useStore.setState({ activePanel: 'role-management' })
                    setDropdownOpen(false)
                  }}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Role Management
                </button>
              </>
            )}
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)]"
              onClick={() => {
                useStore.setState({ activePanel: 'members' })
                setDropdownOpen(false)
              }}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Members
            </button>
          </div>
        )}
      </div>

      {/* Channel list with optional create button */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Admin: create button */}
        {isAdmin && (
          <div className="relative mb-2" ref={createMenuRef}>
            <button
              className="flex w-full items-center justify-between rounded px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-text-primary)]"
              onClick={() => setShowCreateMenu(!showCreateMenu)}
            >
              <span>Create</span>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {showCreateMenu && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-white/10 bg-[var(--color-bg-rail)] py-1 shadow-lg">
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                  onClick={() => {
                    setShowCreateChannel(true)
                    setShowCreateCategory(false)
                    setShowCreateMenu(false)
                  }}
                >
                  <span className="text-base">#</span>
                  Create Channel
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                  onClick={() => {
                    setShowCreateCategory(true)
                    setShowCreateChannel(false)
                    setShowCreateMenu(false)
                  }}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Create Category
                </button>
              </div>
            )}
          </div>
        )}

        {/* Inline create channel form */}
        {showCreateChannel && (
          <div className="mb-2 rounded-lg border border-white/10 bg-white/5 p-2">
            <input
              type="text"
              placeholder="Channel name"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChannel() }}
              maxLength={32}
              className="mb-1.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
              autoFocus
            />
            <div className="mb-1.5 flex gap-1">
              <button
                className={`flex-1 rounded px-2 py-0.5 text-xs ${
                  newChannelType === 'text'
                    ? 'bg-[var(--color-accent)]/20 text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-muted)] hover:bg-white/5'
                }`}
                onClick={() => setNewChannelType('text')}
              >
                # Text
              </button>
              <button
                className={`flex-1 rounded px-2 py-0.5 text-xs ${
                  newChannelType === 'voice'
                    ? 'bg-[var(--color-accent)]/20 text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-muted)] hover:bg-white/5'
                }`}
                onClick={() => setNewChannelType('voice')}
              >
                Voice
              </button>
            </div>
            <select
              value={newChannelCategoryId}
              onChange={(e) => setNewChannelCategoryId(e.target.value)}
              className="mb-1.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none"
            >
              {categoriesWithChannels.map((cwc) => (
                <option key={cwc.category.id} value={cwc.category.id}>
                  {cwc.category.name}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              <button
                onClick={handleCreateChannel}
                disabled={creating || !newChannelName.trim()}
                className="flex-1 rounded bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreateChannel(false); setNewChannelName('') }}
                className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Inline create category form */}
        {showCreateCategory && (
          <div className="mb-2 rounded-lg border border-white/10 bg-white/5 p-2">
            <input
              type="text"
              placeholder="Category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory() }}
              maxLength={32}
              className="mb-1.5 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
              autoFocus
            />
            <div className="flex gap-1">
              <button
                onClick={handleCreateCategory}
                disabled={creating || !newCategoryName.trim()}
                className="flex-1 rounded bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreateCategory(false); setNewCategoryName('') }}
                className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Channel list content */}
        {loading && categoriesWithChannels.length === 0 ? (
          <SkeletonShimmer lines={5} />
        ) : categoriesWithChannels.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-[var(--color-text-muted)]">
            No channels yet
          </p>
        ) : (
          <ChannelList
            categoriesWithChannels={categoriesWithChannels}
            activeChannelId={activeChannelId}
            isAdmin={isAdmin}
            onSelectChannel={setActiveChannel}
            onRenameChannel={isAdmin ? handleRenameChannel : undefined}
            onDeleteChannel={isAdmin ? handleDeleteChannel : undefined}
            onRenameCategory={isAdmin ? handleRenameCategory : undefined}
            onDeleteCategory={isAdmin ? handleDeleteCategory : undefined}
          />
        )}
      </div>

      {/* Footer with connection status and display name */}
      <div className="flex h-[52px] items-center justify-between border-t border-white/5 px-3">
        <div className="flex items-center gap-2">
          <ConnectionDot />
        </div>
        {displayName && (
          <span className="truncate text-xs text-[var(--color-text-muted)]">
            {displayName}
          </span>
        )}
      </div>
    </div>
  )
}
