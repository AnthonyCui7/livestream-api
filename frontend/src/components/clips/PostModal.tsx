import { useCallback, useEffect, useState } from 'react'
import { Check, ExternalLink, Flame, Link2, Loader2, RefreshCw, X } from 'lucide-react'
import type { Clip, SocialAccount, SocialPlatform } from '../../types'
import { linkSocialAccount, listSocialAccounts } from '../../lib/api'
import { viralityScore, viralityTone } from '../../lib/format'
import { colorFor } from '../../lib/placeholder'
import { platformMeta } from './platformIcons'
import { ClipThumbnail } from './ClipThumbnail'

interface Props {
  open: boolean
  clip: Clip
  platform: SocialPlatform
  onClose: () => void
  onPost: (platform: SocialPlatform, caption: string) => Promise<void>
}

/**
 * Post-a-clip-to-social modal. Real posting via the router → Zernio: the modal
 * checks the caller's linked accounts (GET /api/social/accounts) and gates the
 * Post button behind connecting one — the Connect button opens Zernio's hosted
 * OAuth in a new tab, then accounts are re-checked on window focus or the
 * refresh button.
 */
export function PostModal({ open, clip, platform, onClose, onPost }: Props) {
  const meta = platformMeta(platform)
  const [caption, setCaption] = useState('')
  const [phase, setPhase] = useState<'edit' | 'posting' | 'done'>('edit')
  const [postError, setPostError] = useState('')

  // null = loading; 'unavailable' = social not configured / unreachable.
  const [accounts, setAccounts] = useState<SocialAccount[] | 'unavailable' | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [linkStarted, setLinkStarted] = useState(false)

  const refreshAccounts = useCallback(async () => {
    try {
      setAccounts(await listSocialAccounts())
    } catch {
      setAccounts('unavailable')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setCaption(clip.title)
    setPhase('edit')
    setPostError('')
    setLinkStarted(false)
    setAccounts(null)
    void refreshAccounts()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, clip.title, onClose, refreshAccounts])

  // After the user goes off to Zernio's OAuth tab, re-check when they return.
  useEffect(() => {
    if (!open || !linkStarted) return
    const onFocus = () => void refreshAccounts()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [open, linkStarted, refreshAccounts])

  if (!open) return null

  const score = viralityScore(clip.score)
  const tone = viralityTone(score)
  const alreadyPosted = clip.postedPlatforms?.includes(platform)
  const loadingAccounts = accounts === null
  const unavailable = accounts === 'unavailable'
  const linkedAccount =
    Array.isArray(accounts) ? accounts.find((a) => a.platform === platform) : undefined
  const linked = !!linkedAccount

  const connect = async () => {
    if (connecting) return
    setConnecting(true)
    setPostError('')
    try {
      const url = await linkSocialAccount(platform)
      window.open(url, '_blank', 'noopener')
      setLinkStarted(true)
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Could not start the connect flow')
    } finally {
      setConnecting(false)
    }
  }

  const submit = async () => {
    if (phase !== 'edit' || !linked) return
    setPhase('posting')
    setPostError('')
    try {
      await onPost(platform, caption.trim())
      setPhase('done')
      setTimeout(onClose, 900)
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Posting failed')
      setPhase('edit')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#111113] ring-1 ring-white/[0.08] rounded-[12px] w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="flex items-center gap-2 text-white text-[15px] font-semibold">
            <span className="grid place-items-center w-6 h-6 rounded-[6px] bg-white/[0.06]" style={{ color: meta.color }}>
              <meta.Icon size={14} />
            </span>
            Post to {meta.label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 grid place-items-center rounded-[6px] text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex gap-4">
          {/* Clip preview */}
          <div
            className="relative w-24 shrink-0 aspect-[9/16] rounded-[8px] overflow-hidden ring-1 ring-white/[0.06]"
            style={{ backgroundColor: colorFor(clip.id) }}
          >
            <ClipThumbnail clip={clip} />
            <div className={`absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full ring-1 ${tone.bg} ${tone.ring} ${tone.text}`}>
              <Flame size={10} />
              <span className="text-[10px] font-semibold tabular-nums leading-none">{score}</span>
            </div>
          </div>

          {/* Caption + account state */}
          <div className="flex-1 min-w-0">
            <label className="block text-neutral-400 text-[12px] mb-1.5">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              disabled={phase !== 'edit'}
              className="w-full px-3 py-2 bg-white/[0.04] text-white text-[13px] rounded-[7px] outline-none focus:bg-white/[0.06] focus:ring-1 focus:ring-violet-500/40 placeholder-neutral-600 resize-none transition-colors disabled:opacity-60"
              placeholder="Write a caption…"
            />
            {alreadyPosted && phase === 'edit' && (
              <p className="mt-1.5 text-[11px] text-neutral-500">Already posted to {meta.label} — posting again.</p>
            )}
            {postError && <p className="mt-1.5 text-[11px] text-red-300/90">{postError}</p>}

            {/* Not linked yet — the connect flow, inline. */}
            {!loadingAccounts && !unavailable && !linked && (
              <div className="mt-2.5 px-3 py-2.5 bg-white/[0.03] ring-1 ring-white/[0.06] rounded-[8px]">
                <p className="text-[11.5px] text-neutral-400 mb-2">
                  No {meta.label} account linked yet. Connect one to post.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void connect()}
                    disabled={connecting}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-[6px] transition-colors disabled:opacity-50"
                  >
                    {connecting ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                    Connect {meta.label}
                  </button>
                  {linkStarted && (
                    <button
                      type="button"
                      onClick={() => void refreshAccounts()}
                      className="inline-flex items-center gap-1 h-7 px-2 text-[11.5px] text-neutral-300 hover:text-white rounded-[6px] hover:bg-white/[0.06] transition-colors"
                    >
                      <RefreshCw size={11} /> Check again
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.06]">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500 min-w-0">
            {loadingAccounts ? (
              <>
                <Loader2 size={11} className="animate-spin" /> Checking linked accounts…
              </>
            ) : unavailable ? (
              'Social posting unavailable'
            ) : linked ? (
              <>
                <Link2 size={11} className="text-emerald-400" />
                <span className="truncate">
                  {linkedAccount?.name ? `Linked: ${linkedAccount.name}` : `${meta.label} linked`}
                </span>
              </>
            ) : (
              `${meta.label} not linked`
            )}
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-[13px] text-neutral-300 hover:text-white rounded-[7px] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={phase !== 'edit' || !linked || caption.trim().length === 0}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-[7px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {phase === 'done' ? (
                <>
                  <Check size={15} /> Posted
                </>
              ) : phase === 'posting' ? (
                'Posting…'
              ) : (
                `Post to ${meta.label}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
