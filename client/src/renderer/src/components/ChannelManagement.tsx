import { useState } from 'react'
import { useStore } from '../stores'
import { useChannels } from '../hooks/useChannels'

export default function ChannelManagement() {
  const { categoriesWithChannels } = useChannels()

  const createChannel = useStore((s) => s.createChannel)
  const renameChannel = useStore((s) => s.renameChannel)
  const deleteChannel = useStore((s) => s.deleteChannel)
  const reorderChannels = useStore((s) => s.reorderChannels)
  const createCategory = useStore((s) => s.createCategory)
  const renameCategory = useStore((s) => s.renameCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)
  const reorderCategories = useStore((s) => s.reorderCategories)

  // Create channel form
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text')
  const [newChannelCategoryId, setNewChannelCategoryId] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')

  // Editing state
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null)
  const [editingChannelName, setEditingChannelName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'channel' | 'category'; id: string; name: string } | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const sortedCategories = [...categoriesWithChannels]
    .sort((a, b) => a.category.position - b.category.position)

  // Default category for new channel
  const defaultCategoryId = sortedCategories[0]?.category.id ?? ''

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createChannel(newChannelName.trim(), newChannelType, newChannelCategoryId || defaultCategoryId)
      setNewChannelName('')
      setNewChannelType('text')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createCategory(newCategoryName.trim())
      setNewCategoryName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category')
    } finally {
      setSaving(false)
    }
  }

  const handleRenameChannel = async (id: string) => {
    if (!editingChannelName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await renameChannel(id, editingChannelName.trim())
      setEditingChannelId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename channel')
    } finally {
      setSaving(false)
    }
  }

  const handleRenameCategory = async (id: string) => {
    if (!editingCategoryName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await renameCategory(id, editingCategoryName.trim())
      setEditingCategoryId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename category')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setSaving(true)
    setError(null)
    try {
      if (deleteConfirm.type === 'channel') {
        await deleteChannel(deleteConfirm.id)
      } else {
        await deleteCategory(deleteConfirm.id)
      }
      setDeleteConfirm(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  const handleMoveChannel = async (categoryChannels: typeof sortedCategories[0]['channels'], index: number, direction: -1 | 1) => {
    const sorted = [...categoryChannels].sort((a, b) => a.position - b.position)
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= sorted.length) return

    const positions = sorted.map((ch, i) => {
      if (i === index) return { id: ch.id, position: sorted[targetIndex].position }
      if (i === targetIndex) return { id: ch.id, position: sorted[index].position }
      return { id: ch.id, position: ch.position }
    })

    try {
      await reorderChannels(positions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder channels')
    }
  }

  const handleMoveCategory = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= sortedCategories.length) return

    const positions = sortedCategories.map((cwc, i) => {
      if (i === index) return { id: cwc.category.id, position: sortedCategories[targetIndex].category.position }
      if (i === targetIndex) return { id: cwc.category.id, position: sortedCategories[index].category.position }
      return { id: cwc.category.id, position: cwc.category.position }
    })

    try {
      await reorderCategories(positions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder categories')
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-white/5 px-4">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          Channel Management
        </span>
        <button
          onClick={() => useStore.setState({ activePanel: 'chat' })}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl flex flex-col gap-8">
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {/* Delete confirmation dialog */}
          {deleteConfirm && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="mb-3 text-sm text-[var(--color-text-primary)]">
                Delete {deleteConfirm.type} <strong>{deleteConfirm.name}</strong>?
                {deleteConfirm.type === 'category' && ' All channels in this category will also be deleted.'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="rounded bg-red-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="rounded px-4 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Create Category section */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Create Category
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory() }}
                maxLength={32}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
              />
              <button
                onClick={handleCreateCategory}
                disabled={saving || !newCategoryName.trim()}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </section>

          {/* Create Channel section */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Create Channel
            </h3>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Channel name"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChannel() }}
                  maxLength={32}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={newChannelType}
                  onChange={(e) => setNewChannelType(e.target.value as 'text' | 'voice')}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none"
                >
                  <option value="text">Text</option>
                  <option value="voice">Voice</option>
                </select>
                <select
                  value={newChannelCategoryId || defaultCategoryId}
                  onChange={(e) => setNewChannelCategoryId(e.target.value)}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none"
                >
                  {sortedCategories.map((cwc) => (
                    <option key={cwc.category.id} value={cwc.category.id}>
                      {cwc.category.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleCreateChannel}
                  disabled={saving || !newChannelName.trim()}
                  className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </section>

          {/* Categories & Channels list */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Categories & Channels
            </h3>
            <div className="flex flex-col gap-4">
              {sortedCategories.map((cwc, catIndex) => {
                const sortedChannels = [...cwc.channels].sort((a, b) => a.position - b.position)

                return (
                  <div key={cwc.category.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    {/* Category header */}
                    <div className="mb-2 flex items-center gap-2">
                      {/* Reorder arrows */}
                      <div className="flex flex-col">
                        <button
                          onClick={() => handleMoveCategory(catIndex, -1)}
                          disabled={catIndex === 0}
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleMoveCategory(catIndex, 1)}
                          disabled={catIndex === sortedCategories.length - 1}
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>

                      {editingCategoryId === cwc.category.id ? (
                        <input
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          onBlur={() => handleRenameCategory(cwc.category.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameCategory(cwc.category.id)
                            if (e.key === 'Escape') setEditingCategoryId(null)
                          }}
                          maxLength={32}
                          autoFocus
                          className="flex-1 rounded border border-white/20 bg-white/5 px-2 py-0.5 text-sm font-semibold uppercase text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                        />
                      ) : (
                        <span className="flex-1 text-sm font-semibold uppercase text-[var(--color-text-muted)]">
                          {cwc.category.name}
                          <span className="ml-2 text-xs font-normal">({cwc.channels.length})</span>
                        </span>
                      )}

                      <button
                        onClick={() => {
                          setEditingCategoryId(cwc.category.id)
                          setEditingCategoryName(cwc.category.name)
                        }}
                        className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ type: 'category', id: cwc.category.id, name: cwc.category.name })}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>

                    {/* Channel list within category */}
                    <div className="flex flex-col gap-1 pl-6">
                      {sortedChannels.map((ch, chIndex) => (
                        <div key={ch.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/5">
                          {/* Reorder arrows */}
                          <div className="flex flex-col">
                            <button
                              onClick={() => handleMoveChannel(cwc.channels, chIndex, -1)}
                              disabled={chIndex === 0}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
                            >
                              <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleMoveChannel(cwc.channels, chIndex, 1)}
                              disabled={chIndex === sortedChannels.length - 1}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
                            >
                              <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>

                          {/* Channel type icon */}
                          {ch.channel_type === 'voice' ? (
                            <svg className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                          ) : (
                            <span className="shrink-0 text-sm text-[var(--color-text-muted)]">#</span>
                          )}

                          {editingChannelId === ch.id ? (
                            <input
                              value={editingChannelName}
                              onChange={(e) => setEditingChannelName(e.target.value)}
                              onBlur={() => handleRenameChannel(ch.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameChannel(ch.id)
                                if (e.key === 'Escape') setEditingChannelId(null)
                              }}
                              maxLength={32}
                              autoFocus
                              className="flex-1 rounded border border-white/20 bg-white/5 px-2 py-0.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                            />
                          ) : (
                            <span className="flex-1 truncate text-sm text-[var(--color-text-primary)]">
                              {ch.name}
                            </span>
                          )}

                          <button
                            onClick={() => {
                              setEditingChannelId(ch.id)
                              setEditingChannelName(ch.name)
                            }}
                            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ type: 'channel', id: ch.id, name: ch.name })}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                      {sortedChannels.length === 0 && (
                        <p className="py-1 text-xs text-[var(--color-text-muted)]">No channels</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
