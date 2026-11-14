# Error reporting

Sentry, wired for one purpose: to answer questions we currently cannot, like
"why can this dealer not use the microphone?".

**Live since 14 Jul 2026.** Sentry org `mdg-services`, project `mdg-client`, on the
free Developer plan (5,000 events a month); no paid features in use.

## Setting it up again (e.g. a new Vercel project)

It is **off** until a DSN exists. With `VITE_SENTRY_DSN` unset, Sentry is not
imported, not bundled, and every call in `lib/monitoring` is a no-op.

1. Create a **Browser / React** project in Sentry and copy its DSN.
2. Set these on the `mdg-client` Vercel project (Production, and Preview if you want):

   | Variable | Value |
   | --- | --- |
   | `VITE_SENTRY_DSN` | the DSN from Sentry |
   | `VITE_SENTRY_ENV` | `production` |
   | `SENTRY_AUTH_TOKEN` | optional — enables source-map upload (see below) |

   `VITE_RELEASE` is set for you: the build reads Vercel's `VERCEL_GIT_COMMIT_SHA`,
   so every report already names the deploy it came from.

3. Redeploy. Vite inlines env vars at **build** time, so setting the variable
   without a rebuild changes nothing.

## What it costs

The SDK is **106 kB gzipped** — around 60% on top of the app — and the audience is
on low-end Android over 2G with metered data. So:

- **It is not downloaded on a healthy session.** `initMonitoring()` installs a few
  hundred bytes of `error` / `unhandledrejection` listeners and nothing else. The
  SDK is imported the first time an issue is actually raised. Anything reported
  before it lands is buffered and flushed.
- No Session Replay, no performance tracing, four integrations. `Sentry.init()`
  with its defaults measured 119 kB; hand-building the client got it to 106.
- **Each phone rations itself:** at most 3 reports per issue and 12 per session,
  counted before the SDK is fetched, so a crash loop cannot trigger the download or
  eat the month's 5,000. Up to 40 reports are held while the SDK loads.

There is a test (`lib/monitoring.test.ts`) pinning both properties. If someone
"simplifies" this by importing Sentry at the top of a module, it will fail.

## Source maps

Without them, a stack trace in Sentry reads `a.b.c is not a function` at
`index-Jq4LYgWJ.js:1:48210` — which is close to useless for the thing Sentry was
added to answer.

Set **`SENTRY_AUTH_TOKEN`** on the Vercel project (an *org* auth token from
Sentry → Settings → Auth Tokens, scope `org:ci`; the live one is named
`vercel-sourcemaps-mdg-client`) and the build uploads source maps automatically.

Three things make this safe:

- **Nothing reaches the phone.** The plugin is build-time only; the bundle is
  byte-for-byte identical.
- **No `.map` is ever served.** They are uploaded and then deleted from `dist/`
  (`filesToDeleteAfterUpload`). A public `.map` hands anyone the app's full source.
- **A bad or expired token cannot break a deploy** — the build still exits 0. This
  was tested, not assumed.

With no token the maps are never even generated, so local builds and forks are
unaffected.

## What it will not send

- **No Session Replay.** It records the DOM, and the DOM here is dealers' chat
  messages, their staff names, and photographs of their paperwork.
- **No name, email, phone or IP.** A user is `{ id, role, dealerId }`.
- **No query strings** (that is where tokens end up) and **no console breadcrumbs**
  (we log message text in development).

## The microphone

The reason this exists. `getUserMedia` fails in ways that look identical on screen
and are completely different problems:

| `error.name` | What is actually wrong | Does "allow it in Settings" help? |
| --- | --- | --- |
| `NotAllowedError` | permission refused | **yes** — this is the only one |
| `NotReadableError` | the mic is allowed but would not **start**. On Android this is almost never another app (since Android 10 a second app gets silence, not a failure). In the Android phone app up to 0.1.x it is the missing `MODIFY_AUDIO_SETTINGS` permission, on every press — see below. On an iPhone it can be a real call or Siri | no — it is already granted |
| `AbortError` | the browser engine gave up on the start: a timeout, a page being shut down, or (WebKit) an unnamed capture failure. **Not** a busy mic, in either engine | no |
| `NotFoundError` | the device has no microphone | no |
| `SecurityError` / `TypeError` | not a secure context, or no `mediaDevices` | no |
| `RecorderStartError` | the mic opened, but the phone's recorder would not start (ours, not getUserMedia's) | no |
| *(never settles)* | the request hangs and never resolves | no |

The recorder used to swallow every one of these with a bare `catch {}` and show the
same "allow microphone access in Settings" message. After that it showed "the
microphone is being used by another app" for every `NotReadableError` and
`AbortError` — which, on Android, was nearly every press, for a reason that had
nothing to do with another app.

### Why the Android phone app could never record (Nov 2026)

Every Android build of the Dealer Kavach phone app up to 0.1.x was made without the
permission `android.permission.MODIFY_AUDIO_SETTINGS` (checked in the real `.aab` and
`.apk` files). Chromium inside the WebView checks it on every input stream it opens
and refuses to open the mic without it, so getUserMedia rejects with
`NotReadableError` "Could not start audio source" on every press. No page-side change
can avoid it; only the new store build (0.2.0, which declares the permission) fixes
it. In about three weeks of server logs before the fix, no voice note had ever been
sent from an Android phone.

Builds from 0.2.0 say so with the shell feature `mic-ready`. When an Android phone app
**without** it fails to start the mic, the chat shows an "app update needed" card
instead of the general strip (`src/lib/micPolicy.ts`). Until the 0.2.0 Android build is
live on Play, `ANDROID_MIC_UPDATE_ON_PLAY` stays `false` and the card only says the fix
comes with the next update; flip it to `true` in a one-line deploy once the build is
live, and the card shows "Update from Play Store".

### What the chat does on a failed start

1. The recorder tries once more, quietly, on `NotReadableError` or `AbortError`: it
   waits until the app is on screen (up to 3 s), pauses 400 ms, and asks again — only
   if the press is still wanted. Refusals, a missing mic and hangs are never retried.
2. If that fails too, the composer shows an inline strip (not a toast) with one button
   that helps: Try again, Allow, Open settings, or Update. "Another app or a call" is
   named only when the phone itself told us — a track that went muted.
3. A refused mic never fires a second permission dialog by itself. The page asks the
   phone app where the permission stands (`permission:micStatus`, no prompt) and offers
   "Allow" or "Open settings" accordingly.

Each failure is reported with `lib/micDiagnostics` attached: the error name and message,
the permission state, the platform, the browser engine version, whether the page was
visible, the last app state the phone app sent and how long ago it became active,
whether a voice note was playing, the shell's feature list, how many audio inputs
exist, which MIME types the device can record, and the user agent.

**Issues to watch for, in Sentry:**

- `mic.blocked` — **one per press**, after the quiet retry. Tags:
  - `mic.error` — the DOMException name; group by this first.
  - `mic.message` — the engine's message. "Could not start audio source" is Android;
    "Failed starting capture of a audio track" is an iPhone.
  - `mic.retries` — 0 or 1. `mic.retryOutcome` — `none` (not retryable),
    `failed-again`, or `superseded` (the dealer moved on during the wait).
  - `mic.needsAppUpdate` — `true` on an Android phone app without `mic-ready`.
    **Count old-build failures with this tag**: it says how many dealers still need
    the Play update. It should fall to zero as 0.2.0 rolls out.
  - `mic.platform`, `mic.permission`, `audioInputs`, `nativeShell`.
- `mic.retry-recovered` (info) — the first try failed and the quiet retry worked.
  Tagged with the first error. Tells us how often the retry is what saved a note.
- `mic.never-settled` — `getUserMedia` never resolved or rejected, in the
  foreground, for the whole watchdog (6 s when the mic has worked on this phone
  before and no dialog can be up; 12 s, 30 s on an iPhone, otherwise). No error
  name will ever explain this one.
- `mic.granted-but-unopenable` — the dealer tapped Allow, the phone granted the
  permission, and the mic still would not open. The permission was never the problem.
- `mic.recorder-failed` — the mic opened but MediaRecorder would not start, even
  with the phone's default format.
- `mic.muted-mid-recording` (info) — the phone took the mic during a recording
  (a call, Siri). The take goes to review.
- `mic.silent-recording` (info) — a take longer than a second with no sound in it
  (loudest moment under 0.02). The dealer is asked before it is sent.
- `mic.unsupported` — the mic button was reachable on a device that cannot record.

The free Sentry plan keeps only a few events per issue, so counts understate.

## Push notifications

Two more issues, raised only when this web app runs inside the Dealer Kavach phone
app (see `mdg-app/README.md` → Push notifications):

- `push.register-failed` — the phone had a token, but saving it to our server
  failed. Tagged `platform`.
- `push.token-unavailable` — the phone could not get a token at all. Tagged
  `platform` and `reason`:
  - `expo-go` — running in Expo Go, which has no remote push. Expected.
  - `no-module` — an over-the-air update landed on a binary without the
    notifications module. Needs a new build.
  - `permission` — the person refused notifications, or Android stopped asking.
  - `token-failed` — the phone had no token to give. On Android this almost always
    means the build is missing its Firebase config. The `detail` field holds the error.
