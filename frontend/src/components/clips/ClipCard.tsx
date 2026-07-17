import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crop, Flame, Play, Scissors } from 'lucide-react'
import type { Clip, ClipEdits, SocialPlatform } from '../../types'
import { formatDuration, viralityScore, viralityTone } from '../../lib/format'
import { colorFor } from '../../lib/placeholder'
import { showToast } from '../../lib/toast'
import { postClip, saveClipEdits } from '../../services/projects'
import { PLATFORMS } from './platformIcons'
import { ClipPlayerModal } from './ClipPlayerModal'
import { ClipThumbnail } from './ClipThumbnail'
import { PostModal } from './PostModal'

/**
 * One generated clip: a portrait "short" with its virality score and a row of
 * one-click social post buttons (TikTok / YouTube / Instagram), in the spirit
 * of narrative's clip cards. Rendered clips play in a modal; posting is still
 * simulated. The tile shows the clip's thumbnail (metadata.thumbnail_url),
 * falling back to the video's first frame, then a solid color (ClipThumbnail).
 */
export function ClipCard({ clip }: { clip: Clip }) {
  const navigate = useNavigate()
  // Reflect any saved trim in the duration shown on the tile.
  const fullDuration = clip.endSeconds - clip.startSeconds
  const trimmed =
    clip.edits && (clip.edits.trimStart != null || clip.edits.trimEnd != null)
      ? (clip.edits.trimEnd ?? fullDuration) - (clip.edits.trimStart ?? 0)
      : fullDuration
  const duration = formatDuration(trimmed)
  const edited = !!clip.edits
  const score = viralityScore(clip.score)
  const tone = viralityTone(score)
  const [postingTo, setPostingTo] = useState<SocialPlatform | null>(null)
  const [playing, setPlaying] = useState(false)
  const posted = new Set(clip.postedPlatforms ?? [])
  const playable = clip.status === 'rendered' && !!clip.videoUrl

  // Center-crop toggle — optimistic override so the tile flips instantly
  // while the save round-trips; the refreshed clip prop takes over after.
  const [cropOverride, setCropOverride] = useState<'center' | null | undefined>(undefined)
  const [cropSaving, setCropSaving] = useState(false)
  const crop = cropOverride !== undefined ? cropOverride : (clip.edits?.crop ?? null)

  const toggleCrop = async () => {
    if (cropSaving) return
    const next = crop === 'center' ? null : ('center' as const)
    setCropOverride(next)
    setCropSaving(true)
    try {
      const base = clip.edits
      const edits: ClipEdits = {
        title: base?.title,
        trimStart: base?.trimStart,
        trimEnd: base?.trimEnd,
        captions: base?.captions ?? [],
        crop: next ?? undefined,
        updatedAt: new Date().toISOString(),
      }
      await saveClipEdits(clip.id, edits)
    } catch (err) {
      setCropOverride(undefined)
      showToast(err instanceof Error ? err.message : 'Failed to save the crop')
    } finally {
      setCropSaving(false)
    }
  }

  return (
    <div className="group relative flex flex-col">
      <div
        className="relative aspect-[9/16] rounded-[8px] overflow-hidden ring-1 ring-white/[0.06]"
        // Always painted — the under-layer if a thumbnail 404s or loads slowly.
        style={{ backgroundColor: colorFor(clip.id) }}
      >
        <ClipThumbnail clip={clip} crop={crop} />

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

        {/* Play affordance — only clips with rendered media are playable;
            the rest get a non-interactive status hint instead of a button. */}
        {playable ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 bg-black/25 transition-opacity"
            aria-label="Play clip"
          >
            <span className="grid place-items-center w-11 h-11 rounded-full bg-[#22E55F] text-[#0A0A0A] shadow-lg">
              <Play size={18} className="ml-0.5 fill-current" />
            </span>
          </button>
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 bg-black/25 transition-opacity pointer-events-none"
          >
            <span className="h-6 px-2.5 grid place-items-center rounded-full bg-black/55 backdrop-blur-sm text-[10.5px] font-medium text-neutral-300 leading-none">
              {clip.status === 'failed'
                ? 'Render failed'
                : clip.status === 'detected'
                  ? 'Not rendered'
                  : 'Rendering…'}
            </span>
          </div>
        )}

        {/* Edited marker — this clip has saved trim/caption edits. */}
        {edited && (
          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 h-5 px-1.5 rounded-full bg-black/55 backdrop-blur-sm ring-1 ring-white/10">
            <Scissors size={9} className="text-[#22E55F]" />
            <span className="text-[9.5px] font-medium text-neutral-200 leading-none">Edited</span>
          </div>
        )}

        {/* Virality bar. */}
        <div className="absolute bottom-0 inset-x-0 h-1 bg-black/30">
          <div className="h-full" style={{ width: `${score}%`, backgroundColor: tone.bar }} />
        </div>
      </div>

      <div className="pt-2 px-0.5">
        <h3 className="text-neutral-200 text-[12.5px] font-medium leading-snug line-clamp-2">{clip.title}</h3>

        {/* One-click social post buttons, then the editor entry point. */}
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
                    : 'bg-white/[0.04] ring-white/[0.06] text-neutral-400 hover:text-[#F5F5F3] hover:bg-white/[0.08]'
                }`}
                style={isPosted ? { color } : undefined}
              >
                <Icon size={14} />
                {isPosted && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#22E55F] ring-2 ring-[#0A0A0A]" />
                )}
              </button>
            )
          })}

          {/* Center-crop to vertical — previews on this tile and persists. */}
          {playable && (
            <button
              type="button"
              onClick={() => void toggleCrop()}
              disabled={cropSaving}
              title={crop === 'center' ? 'Center crop on — show full frame' : 'Center crop to 9:16'}
              aria-label="Toggle center crop"
              aria-pressed={crop === 'center'}
              className={`ml-auto grid place-items-center w-7 h-7 rounded-[6px] ring-1 transition-colors disabled:opacity-50 ${
                crop === 'center'
                  ? 'bg-[#22E55F]/15 ring-[#22E55F]/30 text-[#22E55F] hover:bg-[#22E55F]/25'
                  : 'bg-white/[0.04] ring-white/[0.06] text-neutral-400 hover:text-[#F5F5F3] hover:bg-white/[0.08]'
              }`}
            >
              <Crop size={14} />
            </button>
          )}

          {/* Edit — trim length + add captions. Only for rendered clips. */}
          {playable && (
            <button
              type="button"
              onClick={() =>
                navigate(`/projects/${clip.projectId}/clips/${clip.id}/edit`, { state: { clip } })
              }
              title="Edit clip"
              aria-label="Edit clip"
              className={`ml-auto grid place-items-center w-7 h-7 rounded-[6px] ring-1 transition-colors ${
                edited
                  ? 'bg-[#22E55F]/15 ring-[#22E55F]/30 text-[#22E55F] hover:bg-[#22E55F]/25'
                  : 'bg-white/[0.04] ring-white/[0.06] text-neutral-400 hover:text-[#F5F5F3] hover:bg-white/[0.08]'
              }`}
            >
              <Scissors size={14} />
            </button>
          )}
        </div>
      </div>

      {playing && <ClipPlayerModal clip={clip} onClose={() => setPlaying(false)} />}

      {postingTo && (
        <PostModal
          open
          clip={clip}
          platform={postingTo}
          onClose={() => setPostingTo(null)}
          onPost={(platform, caption) => postClip(clip.id, platform, caption)}
        />
      )}
    </div>
  )
}
