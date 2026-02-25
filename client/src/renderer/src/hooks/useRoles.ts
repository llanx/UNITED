import { useEffect } from 'react'
import { useStore } from '../stores'

export function useRoles() {
  const roles = useStore((s) => s.roles)
  const loading = useStore((s) => s.rolesLoading)
  const fetchRoles = useStore((s) => s.fetchRoles)

  useEffect(() => {
    fetchRoles()
    const cleanup = window.united.onRoleEvent((event) => {
      useStore.getState().handleRoleEvent(event)
    })
    return cleanup
  }, [fetchRoles])

  return { roles, loading, fetchRoles }
}
