const WIDTHS = ['w-3/4', 'w-1/2', 'w-5/6', 'w-2/3', 'w-3/5']

interface SkeletonShimmerProps {
  lines?: number
}

export default function SkeletonShimmer({ lines = 4 }: SkeletonShimmerProps) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`h-3 animate-pulse rounded bg-white/5 ${WIDTHS[i % WIDTHS.length]}`}
        />
      ))}
    </div>
  )
}
