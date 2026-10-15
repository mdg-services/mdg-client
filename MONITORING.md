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
| `NotReadableError` | mic is allowed, but a call/another app has it | no — it is already granted |
| `NotFoundError` | the device has no microphone | no |
| `SecurityError` / `TypeError` | not a secure context, or no `mediaDevices` | no |
| *(never settles)* | the request hangs and never resolves | no |

The recorder used to swallow every one of these with a bare `catch {}` and show the
same "allow microphone access in Settings" message. A dealer whose mic was busy went
to Settings, found the permission already on, and reported the mic as broken again.

Now each cause gets its own message, and each failure is reported with
`lib/micDiagnostics` attached: the error name, the permission state, whether we are
in the WebView, whether the context is secure, how many audio inputs exist, which
MIME types the device can record, and the user agent (which carries the Android and
WebView versions).

**Issues to watch for, in Sentry:**

- `mic.blocked` — tagged `mic.error`, `mic.permission`, `audioInputs`. Group by
  `mic.error` first; that single tag says which of the table rows above we are in.
- `mic.never-settled` — `getUserMedia` never resolved or rejected, in the
  foreground, for 12 seconds. No error name will ever explain this one.
- `mic.granted-but-unopenable` — the OS granted RECORD_AUDIO and the mic still would
  not open. If this appears, the permission was never the problem.
- `mic.unsupported` — the mic button was reachable on a device that cannot record.

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
