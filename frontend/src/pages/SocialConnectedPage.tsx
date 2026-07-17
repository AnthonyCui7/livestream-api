import { useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

/** Name of the BroadcastChannel used to tell other tabs (the still-open
 *  PostModal) that a social account just got linked. */
export const SOCIAL_CONNECT_CHANNEL = 'clipfarm:social-connect'

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
}

/**
 * Where Zernio lands the user after the platform's OAuth consent screen
 * (the router passes this page as redirect_url on /connect). By the time the
 * user is here the account is associated with their profile — this page only
 * confirms it, pings the original tab so its PostModal refreshes instantly,
 * and offers to close. Deliberately public: it renders no user data, and the
 * OAuth tab shares the browser session anyway.
 */
export default function SocialConnectedPage() {
  const [params] = useSearchParams()
  const platform = PLATFORM_LABELS[params.get('platform') ?? ''] ?? 'Account'

  useEffect(() => {
    try {
      const channel = new BroadcastChannel(SOCIAL_CONNECT_CHANNEL)
      channel.postMessage('connected')
      channel.close()
    } catch {
      // BroadcastChannel unavailable — the opener still refreshes on focus.
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="bg-[#171717] ring-1 ring-white/[0.08] rounded-[12px] w-full max-w-sm p-6 text-center">
        <CheckCircle2 size={40} className="mx-auto text-[#22E55F]" />
        <h1 className="mt-3 text-[#F5F5F3] text-[16px] font-semibold">{platform} connected</h1>
        <p className="mt-1.5 text-[12.5px] text-neutral-400">
          Your account is linked — head back to clipfarm and hit Post. You can close this tab.
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="mt-4 h-9 px-4 text-[13px] font-semibold text-[#0A0A0A] bg-[#22E55F] hover:bg-[#35f16d] rounded-[8px] transition-colors"
        >
          Close tab
        </button>
      </div>
    </div>
  )
}
