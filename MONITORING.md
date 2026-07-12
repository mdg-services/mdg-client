# Error reporting

Sentry, wired for one purpose: to answer questions we currently cannot, like
"why can this dealer not use the microphone?".

## Turning it on

It is **off** until a DSN exists. With `VITE_SENTRY_DSN` unset, Sentry is not
imported, not bundled, and every call in `lib/monitoring` is a no-op.

1. Create a **Browser / React** project in Sentry and copy its DSN.
2. Set these on the `mdg-client` Vercel project (Production, and Preview if you want):

   | Variable | Value |
   | --- | --- |
   | `VITE_SENTRY_DSN` | the DSN from Sentry |
   | `VITE_SENTRY_ENV` | `production` |
   | `VITE_RELEASE` | optional — a commit SHA, so a report names its bundle |

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

There is a test (`lib/monitoring.test.ts`) pinning both properties. If someone
"simplifies" this by importing Sentry at the top of a module, it will fail.

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
