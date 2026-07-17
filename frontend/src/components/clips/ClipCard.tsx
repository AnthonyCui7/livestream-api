import { useState } from 'react'
import { Flame, Play } from 'lucide-react'
import type { Clip, SocialPlatform } from '../../types'
import { formatDuration, viralityScore, viralityTone } from '../../lib/format'
import { colorFor } from '../../lib/placeholder'
import { postClip } from '../../services/projects'
import { PLATFORMS } from './platformIcons'
import { PostModal } from './PostModal'

/**
 * One generated clip: a portrait "short" with its virality score and a row of
 * one-click social post buttons (TikTok / YouTube / Instagram), in the spirit
 * of narrative's clip cards. In demo there's no real media, so the poster is a
 * solid color and posting is simulated.
 */
export function ClipCard({ clip }: { clip: Clip }) {
  const duration = formatDuration(clip.endSeconds - clip.startSeconds)
  const score = viralityScore(clip.score)
  const tone = viralityTone(score)
  const [postingTo, setPostingTo] = useState<SocialPlatform | null>(null)
  const posted = new Set(clip.postedPlatforms ?? [])

  return (
    <div className="group relative flex flex-col">
      <div
        className="relative aspect-[9/16] rounded-[8px] overflow-hidden ring-1 ring-white/[0.06]"
        style={clip.posterUrl ? undefined : { backgroundColor: colorFor(clip.id) }}
      >
        {clip.posterUrl && <img src={clip.posterUrl} alt="" className="w-full h-full object-cover" />}

        {/* Virality score — the headline metric. */}
        <div
          className={`absolute top-2 left-2 inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-full ring-1 ${tone.bg} ${tone.ring} ${tone.text} backdrop-blur-sm`}
        >
          <Flame size={12} />
          <span className="text-[12px] font-semibold tabular-nums leading-none">{score}</span>
        </div>

        {/* Duration. */}
        <div className="absolute top-2 right-2 h-6 px-1.5 grid place-items-center rounded-full bg-black/55 backdrop-blur-sm">
          <span className="text-[10.5px] font-medium tabular-nums text-neutral-200 leading-none">{duration}</span>
        </div>

        {/* Play affordance (inert in demo — no media). */}
        <button
          type="button"
          className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 bg-black/25 transition-opacity"
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
        <h3 className="text-neutral-200 text-[12.5px] font-medium leading-snug line-clamp-2">{clip.title}</h3>

        {/* One-click social post buttons. */}
        <div className="mt-2 flex items-center gap-1.5">
          {PLATFORMS.map(({ key, label, Icon, color }) => {
            const isPosted = posted.has(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPostingTo(key)}
                title={isPosted ? `Posted to ${label} — post again` : `Post to ${label}`}
                aria-label={`Post to ${label}`}
                className={`relative grid place-items-center w-7 h-7 rounded-[6px] ring-1 transition-colors ${
                  isPosted
                    ? 'bg-white/[0.10] ring-white/15'
                    : 'bg-white/[0.04] ring-white/[0.06] text-neutral-400 hover:text-white hover:bg-white/[0.08]'
                }`}
                style={isPosted ? { color } : undefined}
              >
                <Icon size={14} />
                {isPosted && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0a0a0b]" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {postingTo && (
        <PostModal
          open
          clip={clip}
          platform={postingTo}
          onClose={() => setPostingTo(null)}
          onPost={(platform) => postClip(clip.id, platform)}
        />
      )}
    </div>
  )
}
