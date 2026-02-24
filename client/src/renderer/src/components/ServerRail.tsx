import ServerIcon from './ServerIcon'
import { useStore } from '../stores'

export default function ServerRail() {
  const serverName = useStore((s) => s.name)

  return (
    <div className="flex h-full w-[56px] shrink-0 flex-col items-center gap-2 bg-[var(--color-bg-rail)] py-3">
      {/* Home button */}
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-white cursor-pointer hover:rounded-2xl transition-[border-radius] duration-200">
        <span className="text-lg font-bold">U</span>
      </div>

      <div className="mx-auto my-1 h-px w-8 bg-white/10" />

      {/* Server list — only active server for now */}
      {serverName && (
        <div className="relative flex items-center">
          {/* Active pill indicator */}
          <div className="absolute -left-1 h-5 w-1 rounded-r-full bg-white" />
          <ServerIcon name={serverName} size={48} active />
        </div>
      )}
    </div>
  )
}
