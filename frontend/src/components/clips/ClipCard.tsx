import { Flame, Play } from 'lucide-react'
import type { Clip } from '../../types'
import { formatDuration, viralityScore, viralityTone } from '../../lib/format'
import { gradientFor } from '../../lib/placeholder'

/**
 * One generated clip: a portrait "short" poster with its virality score. In
 * DEMO mode there's no real media, so the poster is a deterministic gradient
 * and the play button is inert (wire it to `clip.url` when the API lands).
 */
export function ClipCard({ clip }: { clip: Clip }) {
  const duration = formatDuration(clip.endSeconds - clip.startSeconds)
  const score = viralityScore(clip.score)
  const tone = viralityTone(score)

  return (
    <div className="group relative flex flex-col">
      <div
        className="relative aspect-[9/16] rounded-[8px] overflow-hidden ring-1 ring-white/[0.06]"
        style={clip.posterUrl ? undefined : { backgroundImage: gradientFor(clip.id) }}
      >
        {clip.posterUrl && (
          <img src={clip.posterUrl} alt="" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

        {/* Virality score — the headline metric. */}
        <div
          className={`absolute top-2 left-2 inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-full ring-1 ${tone.bg} ${tone.ring} ${tone.text} backdrop-blur-sm`}
        >
          <Flame size={12} />
          <span className="text-[12px] font-semibold tabular-nums leading-none">{score}</span>
        </div>

        {/* Duration. */}
        <div className="absolute top-2 right-2 h-6 px-1.5 grid place-items-center rounded-full bg-black/55 backdrop-blur-sm">
          <span className="text-[10.5px] font-medium tabular-nums text-neutral-200 leading-none">
            {duration}
          </span>
        </div>

        {/* Play affordance (inert in demo — no media). */}
        <button
          type="button"
          className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Play clip"
        >
          <span className="grid place-items-center w-11 h-11 rounded-full bg-white/90 text-black shadow-lg">
            <Play size={18} className="ml-0.5 fill-current" />
          </span>
        </button>

        {/* Virality bar. */}
        <div className="absolute bottom-0 inset-x-0 h-1 bg-black/30">
          <div className="h-full" style={{ width: `${score}%`, backgroundColor: tone.bar }} />
        </div>
      </div>

      <div className="pt-2 px-0.5">
        <h3 className="text-neutral-200 text-[12.5px] font-medium leading-snug line-clamp-2">
          {clip.title}
        </h3>
      </div>
    </div>
  )
}
