import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { useLangStore } from "@/store/lang";
import {
  makeComplaintOption,
  makeComplaintQuestion,
  makeComplaintView,
  makeComplaintsMe,
} from "@/test/complaintsFixtures";
import { renderWithProviders, signIn } from "@/test/utils";
import { complaintAnswerSchema } from "@dk/shared/schemas";
import type { ComplaintVendorMailView } from "@dk/shared/types";

import { ComplaintBox } from "./ComplaintBox";
import { VendorMailCard } from "./VendorMailCard";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  copy: vi.fn(),
  openWebPage: vi.fn(),
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, post: h.post },
}));
vi.mock("@/lib/clipboard", () => ({ copyText: h.copy }));
vi.mock("@/lib/legalLinks", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  openWebPage: h.openWebPage,
}));

const TO = "vendor@example.com";
const SUBJECT = "Change of Bank Account - TID 39141775 - RO 123 Test & Sons";
const BODY =
  "Hello Support Team,\n\nNew account 5010 #12 & IFSC HDFC0001\n100% + more";
const enc = encodeURIComponent;

const dealerMail = (
  over: Partial<ComplaintVendorMailView> = {},
): ComplaintVendorMailView => ({
  who: "dealer",
  to: TO,
  subject: SUBJECT,
  body: BODY,
  attachmentsHint: {
    en: "Attach a photo of a cancelled cheque",
    hi: "चेक की फ़ोटो लगाएँ",
    hl: "Cheque ki photo lagayein",
  },
  gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(TO)}&su=${enc(SUBJECT)}&body=${enc(BODY)}`,
  mailtoUrl: `mailto:${TO}?subject=${enc(SUBJECT)}&body=${enc(BODY.replace(/\n/g, "\r\n"))}`,
  ...over,
});

const mdgMail = (): ComplaintVendorMailView => ({
  who: "mdg",
  to: TO,
  cc: "owner@example.com",
  subject: SUBJECT,
  body: BODY,
  gmailUrl: "",
  mailtoUrl: "",
  sentAt: "2026-11-22T06:00:00.000Z",
});

beforeEach(() => {
  useLangStore.setState({ lang: "en", explicit: false });
  h.copy.mockReset();
  h.copy.mockResolvedValue(true);
  h.openWebPage.mockReset();
});
afterEach(() => cleanup());

describe("VendorMailCard: the dealer sends the e-mail himself", () => {
  it("shows To, Subject and the message, what to attach, and a copy button for each part", () => {
    const { container } = renderWithProviders(
      <VendorMailCard mail={dealerMail()} />,
    );
    expect(container.querySelector('[data-mail-field="to"]')?.textContent).toBe(
      TO,
    );
    expect(
      container.querySelector('[data-mail-field="subject"]')?.textContent,
    ).toBe(SUBJECT);
    expect(
      container.querySelector('[data-mail-field="body"]')?.textContent,
    ).toBe(BODY);
    expect(screen.getByText(/cancelled cheque/i)).toBeTruthy();
    for (const part of ["to", "subject", "body"]) {
      expect(
        container.querySelector(`[data-mail-copy="${part}"]`),
      ).not.toBeNull();
    }
  });

  it("keeps the long message in a block that scrolls instead of growing the box", () => {
    const { container } = renderWithProviders(
      <VendorMailCard mail={dealerMail()} />,
    );
    const body = container.querySelector(
      '[data-mail-field="body"]',
    ) as HTMLElement;
    expect(body.className).toContain("max-h-44");
    expect(body.className).toContain("overflow-y-auto");
  });

  it("copies exactly the part it belongs to, and says Copied", async () => {
    const { container } = renderWithProviders(
      <VendorMailCard mail={dealerMail()} />,
    );
    fireEvent.click(
      container.querySelector('[data-mail-copy="subject"]') as HTMLElement,
    );
    await waitFor(() => expect(h.copy).toHaveBeenCalledWith(SUBJECT));
    await screen.findByText("Copied");
    fireEvent.click(
      container.querySelector('[data-mail-copy="body"]') as HTMLElement,
    );
    await waitFor(() => expect(h.copy).toHaveBeenLastCalledWith(BODY));
    fireEvent.click(
      container.querySelector('[data-mail-copy="to"]') as HTMLElement,
    );
    await waitFor(() => expect(h.copy).toHaveBeenLastCalledWith(TO));
  });

  it("opens Gmail with everything filled in and encoded, through the app's one road for web pages", () => {
    const { container } = renderWithProviders(
      <VendorMailCard mail={dealerMail()} />,
    );
    fireEvent.click(
      container.querySelector('[data-mail-open="gmail"]') as HTMLElement,
    );
    expect(h.openWebPage).toHaveBeenCalledTimes(1);
    const url = h.openWebPage.mock.calls[0]?.[0] as string;
    expect(
      url.startsWith("https://mail.google.com/mail/?view=cm&fs=1&to="),
    ).toBe(true);
    const u = new URL(url);
    expect(u.searchParams.get("to")).toBe(TO);
    expect(u.searchParams.get("su")).toBe(SUBJECT);
    expect(u.searchParams.get("body")).toBe(BODY);
    // an ampersand or hash typed in the text must not split or cut the link
    expect(url.split("&")).toHaveLength(5);
    expect(url).not.toContain("#");
  });

  it("opens the phone's mail app with the subject and message", () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, assign },
    });
    try {
      const { container } = renderWithProviders(
        <VendorMailCard mail={dealerMail()} />,
      );
      fireEvent.click(
        container.querySelector('[data-mail-open="app"]') as HTMLElement,
      );
      expect(assign).toHaveBeenCalledTimes(1);
      const url = assign.mock.calls[0]?.[0] as string;
      expect(url.startsWith(`mailto:${TO}?subject=`)).toBe(true);
      expect(new URLSearchParams(url.split("?")[1]).get("subject")).toBe(
        SUBJECT,
      );
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });

  it("has the buttons in all three languages", () => {
    useLangStore.setState({ lang: "hi", explicit: false });
    const { unmount } = renderWithProviders(
      <VendorMailCard mail={dealerMail()} />,
    );
    expect(screen.getByText("Gmail में खोलें")).toBeTruthy();
    unmount();
    useLangStore.setState({ lang: "hl", explicit: false });
    renderWithProviders(<VendorMailCard mail={dealerMail()} />);
    expect(screen.getByText("Gmail mein kholein")).toBeTruthy();
    expect(screen.getByText("Mail app kholein")).toBeTruthy();
  });
});

describe("VendorMailCard: MDG sent the e-mail", () => {
  it("says who it went to and who was copied, with nothing to press and no link", () => {
    const { container } = renderWithProviders(
      <VendorMailCard mail={mdgMail()} />,
    );
    const line = container.querySelector("[data-mail-sent-by-mdg]");
    expect(line?.textContent).toContain(TO);
    expect(line?.textContent).toContain("owner@example.com");
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[data-mail-open]")).toBeNull();
    expect(container.querySelector("[data-mail-card]")).toBeNull();
    expect(container.innerHTML).not.toContain("mail.google.com");
    expect(container.innerHTML).not.toContain("mailto:");
  });
});

describe("ComplaintBox: the e-mail questions", () => {
  const ASK_SENT = makeComplaintQuestion({
    id: "q-sent",
    field: "vendor_mail_sent",
    prompt: {
      en: "Have you sent it?",
      hi: "क्या भेज दिया?",
      hl: "Kya bhej diya?",
    },
    options: [
      makeComplaintOption("sent:today", "Yes, sent today"),
      makeComplaintOption("sent:other", "Yes, on another day"),
    ],
  });
  const ASK_DAY = makeComplaintQuestion({
    id: "q-day",
    field: "vendor_mail_date",
    prompt: {
      en: "Which day did you send it?",
      hi: "किस दिन भेजा था?",
      hl: "Kis din bheja tha?",
    },
    options: [
      makeComplaintOption("day:today", "Today"),
      makeComplaintOption("day:yesterday", "Yesterday"),
    ],
    input: "date",
  });

  beforeEach(() => {
    signIn({ role: "dealer-owner", dealerId: "d1" });
    h.get.mockReset();
    h.post.mockReset();
    h.post.mockImplementation(async (_path: string, body: unknown) => {
      expect(
        complaintAnswerSchema.safeParse(body).success,
        JSON.stringify(body),
      ).toBe(true);
      return makeComplaintsMe(makeComplaintView());
    });
  });

  it('puts the mail above "Have you sent it?" with its two answers', async () => {
    h.get.mockResolvedValue(
      makeComplaintsMe(
        makeComplaintView({ question: ASK_SENT, vendorMail: dealerMail() }),
      ),
    );
    const { container } = renderWithProviders(
      <ComplaintBox complaintId="c1" messageId="m1" />,
    );
    await screen.findByText("Have you sent it?");
    const card = container.querySelector("[data-mail-card]") as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByText("Open in Gmail")).toBeTruthy();
    // the card comes before the question
    const order = container.innerHTML;
    expect(order.indexOf("data-mail-card")).toBeLessThan(
      order.indexOf("Have you sent it?"),
    );
    fireEvent.click(screen.getByText("Yes, sent today"));
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    expect(h.post.mock.calls[0]?.[1]).toEqual({
      step: "option",
      complaintId: "c1",
      questionId: "q-sent",
      optionId: "sent:today",
    });
  });

  it("asks the day with a date that stops at today and refuses a day after it", async () => {
    h.get.mockResolvedValue(
      makeComplaintsMe(
        makeComplaintView({ question: ASK_DAY, vendorMail: dealerMail() }),
      ),
    );
    const { container } = renderWithProviders(
      <ComplaintBox complaintId="c1" messageId="m1" />,
    );
    await screen.findByText("Which day did you send it?");
    const input = container.querySelector(
      '[data-complaint-input="date"]',
    ) as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const send = within(input.parentElement as HTMLElement).getByRole("button");
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "2099-01-01" } });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: input.max } });
    expect((send as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    expect(h.post.mock.calls[0]?.[1]).toEqual({
      step: "text",
      complaintId: "c1",
      questionId: "q-day",
      text: input.max,
    });
  });

  it("shows only MDG's one line, on the summary, when MDG sent it", async () => {
    h.get.mockResolvedValue(
      makeComplaintsMe(
        makeComplaintView({
          screen: "confirm",
          stage: "confirming",
          question: undefined,
          summary: [
            {
              label: { en: "Problem", hi: "दिक्कत", hl: "Dikkat" },
              value: {
                en: "Change of bank account",
                hi: "बैंक खाता बदलना",
                hl: "Bank account badalna",
              },
            },
          ],
          vendorMail: mdgMail(),
        }),
      ),
    );
    const { container } = renderWithProviders(
      <ComplaintBox complaintId="c1" messageId="m1" />,
    );
    await screen.findByText("Change of bank account");
    expect(container.querySelector("[data-mail-sent-by-mdg]")).not.toBeNull();
    expect(container.querySelector("[data-mail-open]")).toBeNull();
  });
});
