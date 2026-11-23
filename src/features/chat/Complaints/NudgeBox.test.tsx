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
  makeComplaintSteps,
  makeComplaintView,
  makeComplaintsMe,
} from "@/test/complaintsFixtures";
import { renderWithProviders, signIn } from "@/test/utils";
import { complaintAnswerSchema } from "@dk/shared/schemas";
import type { ComplaintVendorMailView } from "@dk/shared/types";

import { ComplaintBox } from "./ComplaintBox";

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

const TO = "fuelmerchantsupport@example.com";
const SUBJECT = "Reminder: complaint 4101201276 - TID 39141773 - RO 123 Test Pump";
const BODY = "Hello Support Team,\n\nThis is a reminder about complaint 4101201276.";
const enc = encodeURIComponent;

const reminderMail = (): ComplaintVendorMailView => ({
  who: "dealer",
  to: TO,
  subject: SUBJECT,
  body: BODY,
  gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(TO)}&su=${enc(SUBJECT)}&body=${enc(BODY)}`,
  mailtoUrl: `mailto:${TO}?subject=${enc(SUBJECT)}&body=${enc(BODY.replace(/\n/g, "\r\n"))}`,
});

const NUDGE = makeComplaintQuestion({
  id: "q-nudge",
  field: "nudge",
  prompt: {
    en: "Complaint 4101201276 has not moved for 3 days. IndianOil still shows it as: Filed, waiting for an engineer.",
    hi: "शिकायत 4101201276 3 दिन से आगे नहीं बढ़ी।",
    hl: "Complaint 4101201276 3 din se aage nahi badhi.",
  },
  options: [
    makeComplaintOption("nudge:remind", "Remind the card-machine company"),
    makeComplaintOption("nudge:team", "Tell MDG's team"),
    makeComplaintOption("nudge:wait", "I'll wait"),
  ],
});

const filed = (over: Parameters<typeof makeComplaintView>[0] = {}) =>
  makeComplaintView({
    stage: "filed",
    screen: "tracking",
    number: "4101201276",
    question: NUDGE,
    steps: makeComplaintSteps(["done", "current", "todo", "todo"]),
    canCheckNow: true,
    ...over,
  });

beforeEach(() => {
  useLangStore.setState({ lang: "en", explicit: false });
  h.copy.mockReset();
  h.copy.mockResolvedValue(true);
  h.openWebPage.mockReset();
  signIn({ role: "dealer-owner", dealerId: "d1" });
  h.get.mockReset();
  h.post.mockReset();
  h.post.mockImplementation(async (_path: string, body: unknown) => {
    expect(
      complaintAnswerSchema.safeParse(body).success,
      JSON.stringify(body),
    ).toBe(true);
    return makeComplaintsMe(filed({ question: undefined }));
  });
});
afterEach(() => cleanup());

describe("ComplaintBox: a filed complaint that has not moved", () => {
  it("keeps the step tracker and puts the question under it, with its three buttons", async () => {
    h.get.mockResolvedValue(makeComplaintsMe(filed()));
    const { container } = renderWithProviders(
      <ComplaintBox complaintId="c1" messageId="m1" />,
    );
    await screen.findByText(/has not moved for 3 days/);
    expect(container.querySelector("[data-complaint]")?.getAttribute("data-screen")).toBe("tracking");
    expect(container.querySelectorAll("[data-complaint-step]")).toHaveLength(4);
    for (const label of ["Remind the card-machine company", "Tell MDG's team", "I'll wait"])
      expect(screen.getByText(label)).toBeTruthy();
    // the tracker comes before the question
    const html = container.innerHTML;
    expect(html.indexOf("data-complaint-step")).toBeLessThan(html.indexOf("has not moved"));
    // no e-mail card until the owner chose to send it himself
    expect(container.querySelector("[data-mail-card]")).toBeNull();
  });

  it("sends the tapped button as an answer to that question", async () => {
    h.get.mockResolvedValue(makeComplaintsMe(filed()));
    renderWithProviders(<ComplaintBox complaintId="c1" messageId="m1" />);
    fireEvent.click(await screen.findByText("Tell MDG's team"));
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    expect(h.post.mock.calls[0]?.[1]).toEqual({
      step: "option",
      complaintId: "c1",
      questionId: "q-nudge",
      optionId: "nudge:team",
    });
  });

  it("leaves out the card-machine button when the server did not offer it", async () => {
    h.get.mockResolvedValue(
      makeComplaintsMe(
        filed({
          question: makeComplaintQuestion({
            ...NUDGE,
            options: NUDGE.options.filter((o) => o.id !== "nudge:remind"),
          }),
        }),
      ),
    );
    renderWithProviders(<ComplaintBox complaintId="c1" messageId="m1" />);
    await screen.findByText("I'll wait");
    expect(screen.queryByText("Remind the card-machine company")).toBeNull();
  });

  it('shows the reminder e-mail to copy under the tracker, above "Sent?", and answers it', async () => {
    const SENT = makeComplaintQuestion({
      id: "q-rsent",
      field: "reminder_sent",
      prompt: { en: "Have you sent it?", hi: "क्या भेज दिया?", hl: "Kya bhej diya?" },
      options: [
        makeComplaintOption("rsent:yes", "Yes, I sent it"),
        makeComplaintOption("rsent:no", "Not now"),
      ],
    });
    h.get.mockResolvedValue(
      makeComplaintsMe(filed({ question: SENT, reminderMail: reminderMail() })),
    );
    const { container } = renderWithProviders(
      <ComplaintBox complaintId="c1" messageId="m1" />,
    );
    await screen.findByText("Have you sent it?");
    const card = container.querySelector("[data-mail-card]") as HTMLElement;
    expect(card).not.toBeNull();
    expect(container.querySelector('[data-mail-field="to"]')?.textContent).toBe(TO);
    expect(container.querySelector('[data-mail-field="subject"]')?.textContent).toBe(SUBJECT);
    expect(container.querySelectorAll("[data-complaint-step]")).toHaveLength(4);
    const html = container.innerHTML;
    expect(html.indexOf("data-complaint-step")).toBeLessThan(html.indexOf("data-mail-card"));
    expect(html.indexOf("data-mail-card")).toBeLessThan(html.indexOf("Have you sent it?"));
    fireEvent.click(within(card).getByText("Open in Gmail"));
    expect(h.openWebPage).toHaveBeenCalledTimes(1);
    expect(new URL(h.openWebPage.mock.calls[0]?.[0] as string).searchParams.get("su")).toBe(SUBJECT);
    fireEvent.click(screen.getByText("Yes, I sent it"));
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    expect(h.post.mock.calls[0]?.[1]).toEqual({
      step: "option",
      complaintId: "c1",
      questionId: "q-rsent",
      optionId: "rsent:yes",
    });
  });

  it("shows no question once it is answered, only the tracker", async () => {
    h.get.mockResolvedValue(makeComplaintsMe(filed({ question: undefined })));
    const { container } = renderWithProviders(
      <ComplaintBox complaintId="c1" messageId="m1" />,
    );
    await waitFor(() => expect(container.querySelectorAll("[data-complaint-step]")).toHaveLength(4));
    expect(screen.queryByText("I'll wait")).toBeNull();
  });
});
