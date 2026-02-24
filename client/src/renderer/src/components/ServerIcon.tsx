function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join('')
}

interface ServerIconProps {
  name: string
  size?: number
  active?: boolean
}

export default function ServerIcon({ name, size = 48, active = false }: ServerIconProps) {
  const hue = hashCode(name) % 360
  const bg = `hsl(${hue}, 55%, 40%)`
  const initials = getInitials(name)
  const fontSize = size * 0.36

  return (
    <div
      className="flex items-center justify-center font-semibold text-white shrink-0 transition-[border-radius] duration-200"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        borderRadius: active ? 16 : size / 2,
        fontSize,
      }}
      title={name}
    >
      {initials}
    </div>
  )
}
