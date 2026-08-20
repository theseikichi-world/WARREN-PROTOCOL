// ─── The soundtrack — one switch, tied to the clock ───────────────────────────
// The rule is simple and it is the whole feature: WHILE THE SESSION RUNS, MUSIC
// RUNS. Pause the timer and the music pauses with it; end the session and it
// stops. You never touch a second app mid-hold, which is the entire point —
// reaching for a phone during a wall sit ends the wall sit.
//
// This is deliberately an interface with one implementation. A local file needs
// no account, no network and no permission, so it works for everyone today.
// Spotify can only honour the pause half of the rule through its Web API, which
// means OAuth and a Premium subscription — see SPOTIFY.md. When that lands it
// implements this same interface and the timer never learns which one it drives.

export interface MusicSource {
  /** Shown in the UI so you know what will play. */
  readonly label: string
  play():  Promise<void>
  pause(): Promise<void>
  stop():  Promise<void>
  /** Release anything held (object URLs, sockets). */
  dispose(): void
}

/** A file the user picked off their own disk. No account, no network. */
export class LocalAudio implements MusicSource {
  readonly label: string
  private el: HTMLAudioElement
  private url: string

  constructor(blob: Blob, name: string) {
    this.label = name
    this.url = URL.createObjectURL(blob)
    this.el = new Audio(this.url)
    this.el.loop = true          // a 3-minute track must not die mid-session
    this.el.preload = 'auto'
  }

  async play(): Promise<void> {
    // A browser can refuse playback until the page has been interacted with.
    // Pressing START is that interaction, so this normally resolves — but a
    // rejection must never take the workout timer down with it.
    try { await this.el.play() } catch { /* silent session */ }
  }

  async pause(): Promise<void> {
    try { this.el.pause() } catch { /* already stopped */ }
  }

  async stop(): Promise<void> {
    try { this.el.pause(); this.el.currentTime = 0 } catch { /* already stopped */ }
  }

  dispose(): void {
    try {
      this.el.pause()
      this.el.src = ''
      URL.revokeObjectURL(this.url)
    } catch { /* nothing to release */ }
  }

  setVolume(v: number): void {
    this.el.volume = Math.max(0, Math.min(1, v))
  }
}
