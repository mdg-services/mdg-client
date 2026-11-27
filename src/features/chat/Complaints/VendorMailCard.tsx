import { Check, Copy, Mail } from "lucide-react";
import * as React from "react";

import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/cn";
import { useLang, useT } from "@/lib/i18n";
import { openWebPage } from "@/lib/legalLinks";
import { sayIn, type ComplaintVendorMailView } from "@dk/shared/types";

import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../DuOtpSteps";

type Part = "to" | "subject" | "body";

/** A small button that copies one part of the mail and says "Copied" for two seconds. */
function CopyButton({
  part,
  text,
  label,
}: {
  part: Part;
  text: string;
  label: string;
}) {
  const t = useT();
  const [done, setDone] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => void (timer.current && clearTimeout(timer.current)),
    [],
  );
  const copy = async () => {
    if (!(await copyText(text))) return;
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 2000);
  };
  return (
    <button
      type="button"
      data-mail-copy={part}
      aria-label={`${t("chat.complaintsMailCopy")}: ${label}`}
      onClick={() => void copy()}
      className="flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-meta font-medium text-wa-accent-strong transition-colors duration-150 active:bg-wa-row-active"
    >
      {done ? (
        <Check width={14} strokeWidth={3} />
      ) : (
        <Copy width={14} strokeWidth={2} />
      )}
      {done ? t("chat.complaintsMailCopied") : t("chat.complaintsMailCopy")}
    </button>
  );
}

function Field({
  part,
  label,
  text,
  scroll,
}: {
  part: Part;
  label: string;
  text: string;
  scroll?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-meta leading-snug text-wa-meta">{label}</span>
        <CopyButton part={part} text={text} label={label} />
      </div>
      <div
        data-mail-field={part}
        className={cn(
          "select-text whitespace-pre-wrap break-words rounded-md bg-wa-in px-2.5 py-1.5 text-meta leading-snug",
          scroll && "max-h-44 overflow-y-auto overscroll-contain",
        )}
      >
        {text}
      </div>
    </div>
  );
}

/**
 * The e-mail to the card machine company (ADR 0052). IndianOil wants it sent before it
 * takes a money or account request.
 *
 *  - `who 'dealer'`: the dealer sends it. The three parts to copy, what to attach, and two
 *    buttons that open Gmail or the phone's mail app with everything already filled in.
 *  - `who 'mdg'`: MDG already sent it. One calm line, nothing to press.
 */
export function VendorMailCard({ mail }: { mail: ComplaintVendorMailView }) {
  const t = useT();
  const lang = useLang();

  if (mail.who === "mdg") {
    return (
      <p
        data-mail-sent-by-mdg
        className="flex items-start gap-2 break-words rounded-lg bg-wa-in px-3 py-2 text-meta leading-snug text-wa-meta"
      >
        <Mail
          width={14}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <span className="min-w-0">
          {t("chat.complaintsMailSentByMdg", { to: mail.to })}
          {mail.cc
            ? ` · ${t("chat.complaintsMailCopyTo", { cc: mail.cc })}`
            : ""}
        </span>
      </p>
    );
  }

  const hint = mail.attachmentsHint ? sayIn(mail.attachmentsHint, lang) : "";
  return (
    <section
      data-mail-card
      aria-label={t("chat.complaintsMailTitle")}
      className="flex flex-col gap-2.5 rounded-lg border border-wa-divider bg-wa-chip p-2.5"
    >
      <h4 className="m-0 flex items-center gap-1.5 text-meta font-medium leading-snug">
        <Mail width={15} strokeWidth={2} aria-hidden className="shrink-0" />
        {t("chat.complaintsMailTitle")}
      </h4>
      <Field part="to" label={t("chat.complaintsMailTo")} text={mail.to} />
      <Field
        part="subject"
        label={t("chat.complaintsMailSubject")}
        text={mail.subject}
      />
      <Field
        part="body"
        label={t("chat.complaintsMailBody")}
        text={mail.body}
        scroll
      />
      {hint ? (
        <p
          data-mail-attach
          className="m-0 break-words text-meta leading-snug"
        >
          <span className="font-medium">
            {t("chat.complaintsMailAttach")}:{" "}
          </span>
          {hint}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          data-mail-open="gmail"
          onClick={() => openWebPage(mail.gmailUrl)}
          className={PRIMARY_BUTTON}
        >
          {t("chat.complaintsMailGmail")}
        </button>
        <button
          type="button"
          data-mail-open="app"
          // A mailto: address is handed to the phone's mail app (by the shell in the app,
          // by the browser on the web); the page itself stays where it is.
          onClick={() => window.location.assign(mail.mailtoUrl)}
          className={SECONDARY_BUTTON}
        >
          {t("chat.complaintsMailApp")}
        </button>
      </div>
    </section>
  );
}
