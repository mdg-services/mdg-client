import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { PaperRejected } from '@/lib/uploadDuOtpPaper';
import { useLangStore } from '@/store/lang';
import {
  makeDuOtpEntry,
  makeDuOtpFile,
  makeDuOtpGroup,
  makeDuOtpInputs,
  makeDuOtpView,
} from '@/test/duOtpFixtures';
import { renderWithProviders } from '@/test/utils';
import { DU_OTP_REMARKS_MAX, duOtpAnswerSchema } from '@dk/shared/schemas';
import type { DuOtpAckView, DuOtpGroupView } from '@dk/shared/types';

import { DuOtpAckBox } from './DuOtpAckBox';

// The hooks are doubles: these tests are about what the box draws and sends in
// each state. How the hooks talk to the server (paths, polling, the upload) has
// its own test, and the whole road through the real hooks is in the bubble test.
const h = vi.hoisted(() => ({
  view: {
    data: undefined as DuOtpAckView | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  answer: { mutateAsync: vi.fn(), isPending: false },
  paper: { mutateAsync: vi.fn(), isPending: false },
  deliver: vi.fn(),
}));
// The PDF reader draws with pdf.js, which jsdom cannot run: a stand-in that
// fetches what it is given and offers its Save.
const reader = vi.hoisted(() => ({ bytes: vi.fn() }));
vi.mock('@/lib/pdf', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchPdfBytes: reader.bytes,
}));
vi.mock('@/components/PdfViewer', () => ({
  PdfViewer: ({
    title,
    load,
    onSave,
  }: {
    title: string;
    load: () => Promise<ArrayBuffer>;
    onSave?: () => void;
  }) => {
    React.useEffect(() => {
      void load();
    }, []);
    return (
      <div role="dialog" aria-label={title}>
        <button type="button" onClick={onSave}>
          Save
        </button>
      </div>
    );
  },
}));
vi.mock('@/lib/downloadAttachment', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  deliverDownload: h.deliver,
}));
vi.mock('@/hooks/api/useDuOtp', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useDuOtp: () => h.view,
  useAnswerDuOtp: () => h.answer,
  useAnswerDuOtpPaper: () => h.paper,
}));

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  h.view.data = makeDuOtpView();
  h.view.isPending = false;
  h.view.isError = false;
  h.view.refetch.mockReset();
  h.deliver.mockReset();
  reader.bytes.mockReset();
  reader.bytes.mockResolvedValue(new ArrayBuffer(8));
  h.deliver.mockResolvedValue('browser');
  for (const m of [h.answer, h.paper]) {
    m.mutateAsync.mockReset();
    m.mutateAsync.mockResolvedValue(undefined);
    m.isPending = false;
  }
});
afterEach(() => cleanup());

const box = () => renderWithProviders(<DuOtpAckBox />);

/** Show the box this view. */
function show(...groups: DuOtpGroupView[]) {
  h.view.data = makeDuOtpView({ groups });
}

/** A group on a given step of the questions. */
const collecting = (step: DuOtpGroupView['step'], over: Partial<DuOtpGroupView> = {}) =>
  makeDuOtpGroup({ state: 'collecting', step, ...over });

/** The body of the last answer posted, which must be one the server's schema accepts. */
function lastBody(): unknown {
  const calls = h.answer.mutateAsync.mock.calls;
  const body = calls[calls.length - 1]?.[0];
  expect(duOtpAnswerSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
  return body;
}

const pdf = (name = 'certificate.pdf') =>
  new File(['%PDF-1.4'], name, { type: 'application/pdf' });

describe('DuOtpAckBox — what it draws before there is anything to do', () => {
  it('shows only a spinner and the title while the first answer is on its way', () => {
    h.view.data = undefined;
    h.view.isPending = true;
    const { container } = box();
    expect(container.querySelector('[data-du-otp]')).toHaveAttribute('data-status', 'loading');
    expect(screen.getByText('DU OTP Acknowledgement')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says so and offers Try again when the view could not be fetched', () => {
    h.view.data = undefined;
    h.view.isError = true;
    box();
    expect(screen.getByText("Couldn't check this just now")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.view.refetch).toHaveBeenCalledTimes(1);
  });

  it('says in one quiet line that nothing is pending, with no title and no button', () => {
    const { container } = box();
    expect(screen.getByText('No DU OTP acknowledgement is pending')).toBeInTheDocument();
    expect(container.querySelector('[data-du-otp]')).toHaveAttribute('data-status', 'none');
    expect(screen.queryByText('DU OTP Acknowledgement')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says it in Hindi when the app is in Hindi', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    box();
    expect(screen.getByText('कोई DU OTP acknowledgement बाकी नहीं है')).toBeInTheDocument();
  });

  it('is marked no-swipe, and a touch in it never reaches the bubble underneath', () => {
    const onPointerDown = vi.fn();
    show(makeDuOtpGroup());
    renderWithProviders(
      <div onPointerDown={onPointerDown}>
        <DuOtpAckBox />
      </div>,
    );
    const root = document.querySelector('[data-du-otp]')!;
    expect(root).toHaveAttribute('data-no-swipe');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Do it for me' }));
    expect(onPointerDown).not.toHaveBeenCalled();
  });
});

describe('DuOtpAckBox — a unit waiting for "do it" (pending)', () => {
  beforeEach(() => {
    show(
      makeDuOtpGroup({
        entries: [
          makeDuOtpEntry({ id: 'e1', nozzleNo: '3', transactionDate: '2026-10-22' }),
        ],
      }),
    );
  });

  it('lists the event: the DU, its nozzle and the OTP date as dd-mm-yyyy', () => {
    box();
    expect(screen.getByText('DU Gilbarco Encore 300 · serial GB12345')).toBeInTheDocument();
    expect(screen.getByText('Nozzle 3 · OTP date 22-10-2026')).toBeInTheDocument();
  });

  it('lists everything MDG will need, once, in the order it asks', () => {
    box();
    const items = within(document.querySelector('[data-du-start]')!)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toEqual([
      'Why the DU was opened',
      'Calibration certificate (PDF or photo)',
      'DU service report (PDF or photo)',
      'Any other paper (only if you have one)',
      'A short remark',
      'Calibration date: the OTP date, filled in by us',
    ]);
  });

  it('has ONE primary button, "Do it for me", and it posts the start answer', async () => {
    box();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const start = screen.getByRole('button', { name: 'Do it for me' });
    expect(start.className).toContain('bg-wa-accent');
    expect(start.className).toContain('min-h-11');
    fireEvent.click(start);
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'start' });
  });

  it('says plainly that IndianOil has stopped the supply, when it has', () => {
    h.view.data = { ...h.view.data!, supplyBlockedForOtp: true };
    box();
    expect(
      screen.getByText('IndianOil has stopped your fuel supply until this is done.'),
    ).toBeInTheDocument();
  });

  it.each([false, null])('says nothing about the supply when it is %s', (blocked) => {
    h.view.data = { ...h.view.data!, supplyBlockedForOtp: blocked };
    box();
    expect(screen.queryByText(/stopped your fuel supply/)).toBeNull();
  });

  it('says all of it in Hindi, Hindi first', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    h.view.data = { ...h.view.data!, supplyBlockedForOtp: true };
    box();
    expect(screen.getByText('DU Gilbarco Encore 300 · सीरियल GB12345')).toBeInTheDocument();
    expect(screen.getByText('नोज़ल 3 · OTP की तारीख 22-10-2026')).toBeInTheDocument();
    expect(
      screen.getByText('जब तक यह नहीं होता, IndianOil ने आपकी सप्लाई रोक रखी है।'),
    ).toBeInTheDocument();
    expect(screen.getByText('MDG को आपसे ये चाहिए')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'मेरे लिए कर दो' })).toBeInTheDocument();
  });

  it('shows the words when starting is refused, and the button works again', async () => {
    h.answer.mutateAsync.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Only the owner can do this'));
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Do it for me' }));
    expect(await screen.findByText('Only the owner can do this')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Do it for me' })).toBeEnabled();
  });
});

describe('DuOtpAckBox — collecting: only the current step is drawn', () => {
  it('shows "Step N of 5" and the step title, and nothing from the other steps', () => {
    show(collecting('certificate'));
    box();
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(screen.getAllByText('Calibration certificate').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('e-Calibration')).toBeNull();
    expect(screen.queryByLabelText('Remark')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Do it for me' })).toBeNull();
  });

  it.each([
    ['reasons', 'Step 1 of 5'],
    ['certificate', 'Step 2 of 5'],
    ['serviceReport', 'Step 3 of 5'],
    ['other', 'Step 4 of 5'],
    ['remarks', 'Step 5 of 5'],
  ] as const)('step %s is "%s"', (step, words) => {
    show(collecting(step));
    box();
    expect(screen.getByText(words)).toBeInTheDocument();
  });

  it('says "Step 2 of 5" in Hindi', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    show(collecting('certificate'));
    box();
    expect(screen.getByText('कदम 2 / 5')).toBeInTheDocument();
  });

  it('a group in collecting with no step yet starts at the first question', () => {
    show(collecting(null));
    box();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('e-Calibration')).toBeInTheDocument();
  });

  it('turns every control off while an answer is on its way', () => {
    h.answer.isPending = true;
    show(collecting('reasons', { inputs: makeDuOtpInputs({ reasons: ['Others'] }) }));
    box();
    // The spinner inside the button is part of its name, so match on the words.
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    expect(screen.getByLabelText('Something else')).toBeDisabled();
  });
});

describe('DuOtpAckBox — step 1, the reasons', () => {
  beforeEach(() => show(collecting('reasons')));

  it('shows the four reasons as checkboxes in plain Hindi, in the portal order', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    box();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    expect(screen.getByLabelText('ई-कैलिब्रेशन')).toBe(boxes[0]);
    expect(screen.getByLabelText('पल्सर रिपेयर')).toBe(boxes[1]);
    expect(screen.getByLabelText('कोई पार्ट बदला गया')).toBe(boxes[2]);
    expect(screen.getByLabelText('कुछ और')).toBe(boxes[3]);
    expect(screen.getByRole('button', { name: 'आगे' })).toBeInTheDocument();
  });

  it('gives each reason a 44px row to tap', () => {
    box();
    for (const input of screen.getAllByRole('checkbox')) {
      expect(input.closest('label')!.className).toContain('min-h-11');
    }
  });

  it('needs at least one reason before Next', () => {
    box();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Pulsar repair'));
    expect(next).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Pulsar repair'));
    expect(next).toBeDisabled();
  });

  it('posts the ticked reasons, spelled as the portal spells them, in the portal order', async () => {
    box();
    // Ticked in the reverse of the portal's order.
    fireEvent.click(screen.getByLabelText('A part was replaced'));
    fireEvent.click(screen.getByLabelText('e-Calibration'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({
      step: 'reasons',
      group: 'GB12345',
      reasons: ['e_calibration', 'Replacement'],
    });
  });

  it('starts from what the server already holds (the owner came back to change it)', () => {
    show(collecting('reasons', { inputs: makeDuOtpInputs({ reasons: ['Pulsar Repair'] }) }));
    box();
    expect(screen.getByLabelText('Pulsar repair')).toBeChecked();
    expect(screen.getByLabelText('e-Calibration')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});

describe('DuOtpAckBox — step 2, the calibration certificate', () => {
  it('offers upload and "fetch it from eMaaptaul" — and no copy of MDG\'s own when there is none', () => {
    show(collecting('certificate'));
    box();
    expect(screen.getByLabelText('Upload PDF or photo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch it from eMaaptaul for me' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use the one MDG has/ })).toBeNull();
  });

  it('says that photos are made into a PDF, and how big a file may be', () => {
    show(collecting('certificate'));
    box();
    expect(
      screen.getByText('PDF or photo, up to 10 MB. Photos are made into a PDF for you.'),
    ).toBeInTheDocument();
  });

  it('takes a PDF or any photo from the phone, in a 44px button', () => {
    show(collecting('certificate'));
    box();
    const input = screen.getByLabelText('Upload PDF or photo');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'application/pdf,image/*');
    expect(input.closest('label')!.className).toContain('min-h-11');
  });

  it('posts the file the owner picked, with the outlet and the group', async () => {
    show(collecting('certificate'));
    box();
    const file = pdf('cert.pdf');
    fireEvent.change(screen.getByLabelText('Upload PDF or photo'), { target: { files: [file] } });
    await waitFor(() => expect(h.paper.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.paper.mutateAsync).toHaveBeenCalledWith({
      dealerId: 'd1',
      group: 'GB12345',
      slot: 'certificate',
      file,
    });
    // An upload is not a plain answer.
    expect(h.answer.mutateAsync).not.toHaveBeenCalled();
  });

  it('"fetch it from eMaaptaul" posts the fetch answer', async () => {
    show(collecting('certificate'));
    box();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch it from eMaaptaul for me' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'certificate_fetch', group: 'GB12345' });
  });

  describe('with a certificate MDG already holds', () => {
    beforeEach(() => {
      h.view.data = makeDuOtpView({
        groups: [collecting('certificate')],
        certificateOnFile: {
          vcNumber: '4521',
          calibrationDate: '2026-03-14',
          filename: 'vc-4521.pdf',
          url: 'https://files.example.test/vc-4521.pdf',
          source: 'claim',
        },
      });
    });

    it('offers it, with its VC number and date', () => {
      box();
      expect(
        screen.getByRole('button', { name: 'Use the one MDG has (VC 4521, dated 14-03-2026)' }),
      ).toBeInTheDocument();
    });

    it('posts the on-file answer', async () => {
      box();
      fireEvent.click(screen.getByRole('button', { name: /Use the one MDG has/ }));
      await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
      expect(lastBody()).toEqual({ step: 'certificate_on_file', group: 'GB12345' });
    });

    it('still reads when the copy has no VC number or date', () => {
      h.view.data = {
        ...h.view.data!,
        certificateOnFile: {
          vcNumber: null,
          calibrationDate: null,
          filename: 'x.pdf',
          url: null,
          source: 'dealer',
        },
      };
      box();
      expect(screen.getByRole('button', { name: 'Use the one MDG has' })).toBeInTheDocument();
    });

    it('says it in Hindi', () => {
      useLangStore.setState({ lang: 'hi', explicit: true });
      box();
      expect(
        screen.getByRole('button', {
          name: 'MDG के पास जो है, वही लगा दो (VC 4521, तारीख 14-03-2026)',
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'eMaaptaul से मँगवा दो' })).toBeInTheDocument();
    });
  });

  describe('the fetch from eMaaptaul', () => {
    const withFetch = (fetch: DuOtpAckView['fetch']) => {
      h.view.data = makeDuOtpView({ groups: [collecting('certificate')], fetch });
    };

    it('working: a spinner line, and the fetch button is off', () => {
      withFetch({ state: 'working', message: null, at: null });
      box();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Fetching it from eMaaptaul… this can take a few minutes',
      );
      expect(screen.getByRole('button', { name: 'Fetch it from eMaaptaul for me' })).toBeDisabled();
      // Uploading is still possible.
      expect(screen.getByLabelText('Upload PDF or photo')).toBeEnabled();
    });

    it("needs_login: the app's own words, not the server's English line", () => {
      withFetch({ state: 'needs_login', message: 'Please save your eMaaptaul login above.', at: null });
      box();
      expect(screen.getByText('We need your eMaaptaul login first.')).toBeInTheDocument();
      expect(screen.queryByText('Please save your eMaaptaul login above.')).toBeNull();
    });

    it("failed: the app's own words, and they can upload instead", () => {
      withFetch({ state: 'failed', message: 'eMaaptaul did not answer.', at: null });
      box();
      expect(screen.queryByText('eMaaptaul did not answer.')).toBeNull();
      expect(screen.getByText('You can upload it yourself instead.')).toBeInTheDocument();
      expect(screen.getByLabelText('Upload PDF or photo')).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Fetch it from eMaaptaul for me' })).toBeEnabled();
    });

    it.each(['idle', 'done'] as const)('%s: says nothing about the fetch', (state) => {
      withFetch({ state, message: null, at: null });
      box();
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('is not drawn on the other papers', () => {
      h.view.data = makeDuOtpView({
        groups: [collecting('serviceReport')],
        fetch: { state: 'working', message: null, at: null },
      });
      box();
      expect(screen.queryByText(/Fetching it from eMaaptaul/)).toBeNull();
    });
  });

  it('shows the paper already given, openable, when the owner came back to this step', () => {
    show(collecting('certificate', { inputs: makeDuOtpInputs({ certificate: makeDuOtpFile() }) }));
    box();
    expect(screen.getByText('Added')).toBeInTheDocument();
    // Not a new-tab link: inside the phone app that left the app for the browser.
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /certificate\.pdf/ }));
    // Read in the app's own reader, from the paper's link.
    const viewer = screen.getByRole('dialog', { name: 'certificate.pdf' });
    expect(reader.bytes).toHaveBeenCalledWith('https://files.example.test/certificate.pdf');
    expect(h.deliver).not.toHaveBeenCalled();
    // Save takes the road every chat file takes.
    fireEvent.click(within(viewer).getByRole('button', { name: 'Save' }));
    expect(h.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://files.example.test/certificate.pdf',
        filename: 'certificate.pdf',
        kind: 'file',
      }),
    );
  });

  it('says "Uploading…" while the file is on its way, and turns upload off', () => {
    h.paper.isPending = true;
    show(collecting('certificate'));
    box();
    expect(screen.getByRole('status')).toHaveTextContent('Uploading…');
    expect(screen.getByLabelText('Upload PDF or photo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fetch it from eMaaptaul for me' })).toBeDisabled();
  });
});

describe('DuOtpAckBox — step 3, the DU service report', () => {
  beforeEach(() => show(collecting('serviceReport')));

  it('is an upload and nothing else', () => {
    box();
    expect(screen.getByLabelText('Upload PDF or photo')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('posts the file into the service-report slot', async () => {
    box();
    const file = pdf('service.pdf');
    fireEvent.change(screen.getByLabelText('Upload PDF or photo'), { target: { files: [file] } });
    await waitFor(() => expect(h.paper.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.paper.mutateAsync).toHaveBeenCalledWith({
      dealerId: 'd1',
      group: 'GB12345',
      slot: 'serviceReport',
      file,
    });
  });

  it('a photo goes the same way', async () => {
    box();
    const photo = new File([new Uint8Array([1, 2])], 'slip.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Upload PDF or photo'), { target: { files: [photo] } });
    await waitFor(() => expect(h.paper.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.paper.mutateAsync.mock.calls[0]![0].file).toBe(photo);
  });
});

describe('DuOtpAckBox — step 4, any other paper', () => {
  beforeEach(() => show(collecting('other')));

  it('is an upload, or "No other document"', () => {
    box();
    expect(screen.getByLabelText('Upload PDF or photo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No other document' })).toBeInTheDocument();
  });

  it('skipping posts the skip answer', async () => {
    box();
    fireEvent.click(screen.getByRole('button', { name: 'No other document' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'other_skip', group: 'GB12345' });
  });

  it('an upload goes into the other slot', async () => {
    box();
    const file = pdf('extra.pdf');
    fireEvent.change(screen.getByLabelText('Upload PDF or photo'), { target: { files: [file] } });
    await waitFor(() => expect(h.paper.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.paper.mutateAsync.mock.calls[0]![0]).toMatchObject({ slot: 'other', file });
  });

  it('says it in Hindi', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    box();
    expect(screen.getByRole('button', { name: 'कोई और कागज़ नहीं' })).toBeInTheDocument();
    expect(screen.getByLabelText('PDF या फ़ोटो अपलोड करें')).toBeInTheDocument();
  });
});

describe('DuOtpAckBox — step 5, the remark', () => {
  it('starts from the suggested remark', () => {
    show(collecting('remarks', { suggestedRemarks: 'DU re-calibrated, e-calibration done.' }));
    box();
    expect(screen.getByLabelText('Remark')).toHaveValue('DU re-calibrated, e-calibration done.');
  });

  it("prefers the owner's saved remark to the suggestion", () => {
    show(
      collecting('remarks', {
        suggestedRemarks: 'Suggested words',
        inputs: makeDuOtpInputs({ remarks: 'My own words' }),
      }),
    );
    box();
    expect(screen.getByLabelText('Remark')).toHaveValue('My own words');
  });

  it('is a 16px box that stops at the portal\'s limit, with a count', () => {
    show(collecting('remarks', { suggestedRemarks: 'Pulsar repaired' }));
    box();
    const field = screen.getByLabelText('Remark');
    expect(field).toHaveAttribute('maxlength', String(DU_OTP_REMARKS_MAX));
    expect(field.className).toContain('text-[16px]');
    expect(screen.getByText(`15 / ${DU_OTP_REMARKS_MAX}`)).toBeInTheDocument();
  });

  it('posts the remark, trimmed', async () => {
    show(collecting('remarks', { suggestedRemarks: 'x' }));
    box();
    fireEvent.change(screen.getByLabelText('Remark'), {
      target: { value: '  Pulsar changed by the engineer  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({
      step: 'remarks',
      group: 'GB12345',
      remarks: 'Pulsar changed by the engineer',
    });
  });

  it('turns a new line into a space: the portal\'s box is one line', () => {
    show(collecting('remarks'));
    box();
    fireEvent.change(screen.getByLabelText('Remark'), { target: { value: 'one\ntwo' } });
    expect(screen.getByLabelText('Remark')).toHaveValue('one two');
  });

  it('needs at least three characters', () => {
    show(collecting('remarks', { suggestedRemarks: '' }));
    box();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Remark'), { target: { value: 'ok' } });
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Remark'), { target: { value: 'ok.' } });
    expect(next).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Remark'), { target: { value: '   ' } });
    expect(next).toBeDisabled();
  });

  it('keeps what was typed when the view is asked again at the same step', () => {
    show(collecting('remarks', { suggestedRemarks: 'Start' }));
    const { rerender } = box();
    fireEvent.change(screen.getByLabelText('Remark'), { target: { value: 'Half way through' } });
    show(collecting('remarks', { suggestedRemarks: 'Start' }));
    rerender(<DuOtpAckBox />);
    expect(screen.getByLabelText('Remark')).toHaveValue('Half way through');
  });

  it('brings the field to the middle of the screen once the keyboard is up', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      show(collecting('remarks'));
      box();
      fireEvent.focus(screen.getByLabelText('Remark'));
      expect(spy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(spy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    } finally {
      Element.prototype.scrollIntoView = original;
      vi.useRealTimers();
    }
  });
});

describe('DuOtpAckBox — the review', () => {
  const full = (over: Partial<DuOtpGroupView> = {}) =>
    collecting('review', {
      inputs: makeDuOtpInputs({
        reasons: ['e_calibration', 'Replacement'],
        certificate: makeDuOtpFile({
          filename: 'certificate.pdf',
          url: 'https://files.example.test/certificate.pdf',
          source: 'emaaptaul',
        }),
        serviceReport: makeDuOtpFile({
          key: 'k2',
          filename: 'service-report.pdf',
          url: 'https://files.example.test/service-report.pdf',
        }),
        otherSkipped: true,
        remarks: 'DU re-calibrated and nozzle part replaced.',
      }),
      ...over,
    });

  it('shows every answer, with no step count', () => {
    show(full());
    box();
    expect(screen.getByText('Check and submit')).toBeInTheDocument();
    expect(screen.queryByText(/^Step \d of 5$/)).toBeNull();
    expect(screen.getByText('e-Calibration, A part was replaced')).toBeInTheDocument();
    expect(screen.getByText('certificate.pdf')).toBeInTheDocument();
    expect(screen.getByText('service-report.pdf')).toBeInTheDocument();
    expect(screen.getByText('No other document')).toBeInTheDocument();
    expect(screen.getByText('DU re-calibrated and nozzle part replaced.')).toBeInTheDocument();
  });

  it('says where a paper came from when MDG supplied it', () => {
    show(full());
    box();
    expect(screen.getByText('from eMaaptaul')).toBeInTheDocument();
  });

  it('shows the calibration date: the OTP date, filled in by us', () => {
    show(full());
    box();
    expect(screen.getByText('Calibration date')).toBeInTheDocument();
    expect(screen.getByText('22-10-2026')).toBeInTheDocument();
    expect(screen.getByText('the OTP date, filled in by us')).toBeInTheDocument();
    // It is MDG's to fill, so there is nothing to change.
    expect(screen.queryByRole('button', { name: 'Change Calibration date' })).toBeNull();
  });

  it('shows each date once when the events share a day, and both when they do not', () => {
    show(
      full({
        entries: [
          makeDuOtpEntry({ id: 'a', state: 'collecting', nozzleNo: '1', calibrationDate: '2026-10-22' }),
          makeDuOtpEntry({ id: 'b', state: 'collecting', nozzleNo: '2', calibrationDate: '2026-10-22' }),
        ],
      }),
    );
    box();
    expect(screen.getAllByText('22-10-2026')).toHaveLength(1);
    cleanup();
    show(
      full({
        entries: [
          makeDuOtpEntry({ id: 'a', state: 'collecting', nozzleNo: '1', calibrationDate: '2026-10-22' }),
          makeDuOtpEntry({ id: 'b', state: 'collecting', nozzleNo: '2', calibrationDate: '2026-10-25' }),
        ],
      }),
    );
    box();
    expect(screen.getByText('22-10-2026, 25-10-2026')).toBeInTheDocument();
  });

  it('opens a paper in the app, the way chat opens a PDF, not as a new-tab link', () => {
    show(full());
    box();
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /service-report\.pdf/ }));
    expect(screen.getByRole('dialog', { name: 'service-report.pdf' })).toBeInTheDocument();
    expect(reader.bytes).toHaveBeenCalledWith('https://files.example.test/service-report.pdf');
  });

  it('shows a paper whose link has not come as plain words, not a dead link', () => {
    show(
      full({
        inputs: makeDuOtpInputs({
          reasons: ['Others'],
          certificate: makeDuOtpFile({ url: null }),
          serviceReport: makeDuOtpFile({ key: 'k2', filename: 'r.pdf', url: null }),
          remarks: 'Done.',
        }),
      }),
    );
    box();
    expect(screen.queryByRole('button', { name: /certificate\.pdf/ })).toBeNull();
    expect(screen.getByText('certificate.pdf')).toBeInTheDocument();
  });

  it('has a Change on each answer, and each posts the edit for its own field', async () => {
    show(full());
    box();
    const cases = [
      ['Change Why it was opened', 'reasons'],
      ['Change Calibration certificate', 'certificate'],
      ['Change DU service report', 'serviceReport'],
      ['Change Other paper', 'other'],
      ['Change Remark', 'remarks'],
    ] as const;
    for (const [name, field] of cases) {
      h.answer.mutateAsync.mockClear();
      fireEvent.click(screen.getByRole('button', { name }));
      await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
      expect(lastBody()).toEqual({ step: 'edit', group: 'GB12345', field });
    }
    // A visible "Change" on every one of them.
    expect(screen.getAllByText('Change')).toHaveLength(5);
  });

  it('has the primary button "Submit to IndianOil", and it posts the submit', async () => {
    show(full());
    box();
    const submit = screen.getByRole('button', { name: 'Submit to IndianOil' });
    expect(submit.className).toContain('bg-wa-accent');
    fireEvent.click(submit);
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'submit', group: 'GB12345' });
  });

  it('says it in Hindi', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    show(full());
    box();
    expect(screen.getByRole('button', { name: 'IndianOil पर जमा करें' })).toBeInTheDocument();
    expect(screen.getByText('देखिए और जमा कीजिए')).toBeInTheDocument();
    expect(screen.getByText('ई-कैलिब्रेशन, कोई पार्ट बदला गया')).toBeInTheDocument();
    expect(screen.getAllByText('बदलें')).toHaveLength(5);
    expect(screen.getByText('OTP की तारीख, हम भर देंगे')).toBeInTheDocument();
  });
});

describe('DuOtpAckBox — filing, failing, and done', () => {
  it.each(['ready', 'submitting'] as const)('%s: a spinner and "Submitting to IndianOil…"', (state) => {
    show(makeDuOtpGroup({ state, step: 'review' }));
    box();
    expect(screen.getByRole('status')).toHaveTextContent('Submitting to IndianOil…');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says the submitting line in Hindi', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    show(makeDuOtpGroup({ state: 'submitting', step: 'review' }));
    box();
    expect(screen.getByText('IndianOil पर जमा हो रहा है…')).toBeInTheDocument();
  });

  describe('failed', () => {
    const failed = (failure: string | null) =>
      makeDuOtpGroup({
        state: 'failed',
        step: 'review',
        entries: [makeDuOtpEntry({ state: 'failed', failure })],
      });

    it("shows the failure's own words, says the MDG team has been told, and offers Try again", () => {
      show(failed('IndianOil\'s page did not answer. Nothing was filed.'));
      box();
      expect(screen.getByText("IndianOil's page did not answer. Nothing was filed.")).toBeInTheDocument();
      expect(screen.getByText('The MDG team has been told.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('Try again posts the submit for that group', async () => {
      show(failed('Nothing was filed.'));
      box();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
      expect(lastBody()).toEqual({ step: 'submit', group: 'GB12345' });
    });

    it('has words of its own when the server sent none', () => {
      show(failed(null));
      box();
      expect(screen.getByText('IndianOil did not take it.')).toBeInTheDocument();
    });

    it("uses the first failed event's words when a unit has several nozzles", () => {
      show(
        makeDuOtpGroup({
          state: 'failed',
          step: 'review',
          entries: [
            makeDuOtpEntry({ id: 'a', nozzleNo: '1', state: 'submitted', submittedAt: '2026-11-05T09:00:00.000Z' }),
            makeDuOtpEntry({ id: 'b', nozzleNo: '2', state: 'failed', failure: 'Nozzle 2 was refused.' }),
          ],
        }),
      );
      box();
      expect(screen.getByText('Nozzle 2 was refused.')).toBeInTheDocument();
    });

    it('says it in Hindi', () => {
      useLangStore.setState({ lang: 'hi', explicit: true });
      show(failed('Nothing was filed.'));
      box();
      expect(screen.getByText('MDG टीम को बता दिया गया है।')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'फिर कोशिश करें' })).toBeInTheDocument();
    });
  });

  describe('done (recent)', () => {
    it('a filed event is a done line with the date', () => {
      h.view.data = makeDuOtpView({
        recent: [
          makeDuOtpEntry({
            state: 'submitted',
            nozzleNo: '1',
            submittedAt: '2026-11-05T09:00:00.000Z',
          }),
        ],
      });
      const { container } = box();
      expect(container.querySelector('[data-du-otp]')).toHaveAttribute('data-status', 'done');
      expect(screen.getByText('DU Gilbarco Encore 300 · serial GB12345 · Nozzle 1')).toBeInTheDocument();
      expect(screen.getByText('Done. Filed with IndianOil on 05-11-2026.')).toBeInTheDocument();
      // Nothing left to ask, so no quiet "nothing pending" line either.
      expect(screen.queryByText('No DU OTP acknowledgement is pending')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('nozzles of one unit filed together are one line', () => {
      h.view.data = makeDuOtpView({
        recent: [
          makeDuOtpEntry({ id: 'a', state: 'submitted', nozzleNo: '1', submittedAt: '2026-11-05T09:00:00.000Z' }),
          makeDuOtpEntry({ id: 'b', state: 'submitted', nozzleNo: '2', submittedAt: '2026-11-05T09:00:05.000Z' }),
        ],
      });
      box();
      expect(screen.getAllByText(/Filed with IndianOil/)).toHaveLength(1);
      expect(screen.getByText('DU Gilbarco Encore 300 · serial GB12345 · Nozzles 1, 2')).toBeInTheDocument();
    });

    it('an event that closed on the portal by itself says so', () => {
      h.view.data = makeDuOtpView({
        recent: [makeDuOtpEntry({ state: 'gone', lastSeenAt: '2026-11-04T05:00:00.000Z' })],
      });
      box();
      expect(screen.getByText('Closed on IndianOil on 04-11-2026.')).toBeInTheDocument();
    });

    it('sits under an open unit, after a divider', () => {
      h.view.data = makeDuOtpView({
        groups: [makeDuOtpGroup()],
        recent: [
          makeDuOtpEntry({
            id: 'old',
            duSerial: 'TK-9',
            duMake: 'Tokheim',
            duModel: 'Quantium',
            state: 'submitted',
            submittedAt: '2026-11-01T09:00:00.000Z',
          }),
        ],
      });
      box();
      expect(screen.getByRole('button', { name: 'Do it for me' })).toBeInTheDocument();
      expect(screen.getByText('Done. Filed with IndianOil on 01-11-2026.')).toBeInTheDocument();
    });

    it('says it in Hindi', () => {
      useLangStore.setState({ lang: 'hi', explicit: true });
      h.view.data = makeDuOtpView({
        recent: [makeDuOtpEntry({ state: 'submitted', submittedAt: '2026-11-05T09:00:00.000Z' })],
      });
      box();
      expect(screen.getByText('हो गया। 05-11-2026 को IndianOil पर जमा हुआ।')).toBeInTheDocument();
    });
  });
});

describe('DuOtpAckBox — several units', () => {
  const unitA = (over: Partial<DuOtpGroupView> = {}) =>
    makeDuOtpGroup({
      key: 'A1',
      duSerial: 'A1',
      entries: [
        makeDuOtpEntry({ id: 'a1', duSerial: 'A1', nozzleNo: '1', state: 'collecting' }),
        makeDuOtpEntry({ id: 'a2', duSerial: 'A1', nozzleNo: '2', state: 'collecting' }),
      ],
      ...over,
    });
  const unitB = (over: Partial<DuOtpGroupView> = {}) =>
    makeDuOtpGroup({
      key: 'B2',
      duMake: 'Tokheim',
      duModel: 'Quantium',
      duSerial: 'B2',
      entries: [
        makeDuOtpEntry({
          id: 'b1',
          duMake: 'Tokheim',
          duModel: 'Quantium',
          duSerial: 'B2',
          nozzleNo: '4',
          state: 'collecting',
        }),
      ],
      ...over,
    });

  it('draws each unit as its own section, in order', () => {
    show(unitA({ state: 'collecting', step: 'reasons' }), unitB({ state: 'collecting', step: 'remarks' }));
    const { container } = box();
    const sections = [...container.querySelectorAll('[data-du-group]')];
    expect(sections.map((s) => s.getAttribute('data-du-group'))).toEqual(['A1', 'B2']);
    expect(within(sections[0] as HTMLElement).getByText('DU Gilbarco Encore 300 · serial A1')).toBeInTheDocument();
    expect(within(sections[1] as HTMLElement).getByText('DU Tokheim Quantium · serial B2')).toBeInTheDocument();
  });

  it('a unit with several nozzles lists each of them', () => {
    show(unitA({ state: 'collecting', step: 'reasons' }));
    box();
    expect(screen.getByText('Nozzle 1 · OTP date 22-10-2026')).toBeInTheDocument();
    expect(screen.getByText('Nozzle 2 · OTP date 22-10-2026')).toBeInTheDocument();
  });

  it('each unit is on its own step, and answers for itself', async () => {
    show(unitA({ state: 'collecting', step: 'reasons' }), unitB({ state: 'collecting', step: 'remarks', suggestedRemarks: 'Pulsar repaired' }));
    const { container } = box();
    const a = container.querySelector('[data-du-group="A1"]') as HTMLElement;
    const b = container.querySelector('[data-du-group="B2"]') as HTMLElement;
    expect(within(a).getByText('Step 1 of 5')).toBeInTheDocument();
    expect(within(b).getByText('Step 5 of 5')).toBeInTheDocument();

    fireEvent.click(within(b).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
    expect(lastBody()).toEqual({ step: 'remarks', group: 'B2', remarks: 'Pulsar repaired' });

    fireEvent.click(within(a).getByLabelText('Something else'));
    fireEvent.click(within(a).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(2));
    expect(lastBody()).toEqual({ step: 'reasons', group: 'A1', reasons: ['Others'] });
  });

  it("an upload on one unit is filed against that unit's group", async () => {
    show(unitA({ state: 'collecting', step: 'reasons' }), unitB({ state: 'collecting', step: 'serviceReport' }));
    const { container } = box();
    const b = container.querySelector('[data-du-group="B2"]') as HTMLElement;
    const file = pdf('b-report.pdf');
    fireEvent.change(within(b).getByLabelText('Upload PDF or photo'), { target: { files: [file] } });
    await waitFor(() => expect(h.paper.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.paper.mutateAsync.mock.calls[0]![0]).toMatchObject({
      group: 'B2',
      slot: 'serviceReport',
      file,
    });
  });

  it('units waiting for "do it" are listed, and the one "Do it for me" is drawn once', () => {
    show(unitA(), unitB());
    box();
    expect(screen.getByText('DU Gilbarco Encore 300 · serial A1')).toBeInTheDocument();
    expect(screen.getByText('DU Tokheim Quantium · serial B2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Do it for me' })).toHaveLength(1);
    expect(screen.getAllByText('Why the DU was opened')).toHaveLength(1);
  });

  it('a unit still pending beside one being filled keeps the one "Do it for me" under both', () => {
    show(unitA({ state: 'submitting', step: 'review' }), unitB());
    box();
    expect(screen.getByText('Submitting to IndianOil…')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Do it for me' })).toHaveLength(1);
  });

  it('one unit failing does not stop the other from being asked', () => {
    show(
      unitA({
        state: 'failed',
        step: 'review',
        entries: [makeDuOtpEntry({ id: 'a1', duSerial: 'A1', state: 'failed', failure: 'A1 was refused.' })],
      }),
      unitB({ state: 'collecting', step: 'reasons' }),
    );
    box();
    expect(screen.getByText('A1 was refused.')).toBeInTheDocument();
    expect(screen.getByLabelText('e-Calibration')).toBeInTheDocument();
  });

  it('says plainly that supply is stopped once, not once per unit', () => {
    h.view.data = makeDuOtpView({ groups: [unitA(), unitB()], supplyBlockedForOtp: true });
    box();
    expect(screen.getAllByText('IndianOil has stopped your fuel supply until this is done.')).toHaveLength(1);
  });

  it('does not say supply is stopped once nothing is open', () => {
    h.view.data = makeDuOtpView({
      supplyBlockedForOtp: true,
      recent: [makeDuOtpEntry({ state: 'submitted', submittedAt: '2026-11-05T09:00:00.000Z' })],
    });
    box();
    expect(screen.queryByText(/stopped your fuel supply/)).toBeNull();
  });
});

describe('DuOtpAckBox — when an answer does not go through', () => {
  beforeEach(() => show(collecting('reasons', { inputs: makeDuOtpInputs({ reasons: ['Others'] }) })));

  const next = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(h.answer.mutateAsync).toHaveBeenCalledTimes(1));
  };

  it("shows the server's plain words for a refusal", async () => {
    h.answer.mutateAsync.mockRejectedValue(new ApiError(409, 'DU_OTP_MOVED', 'That step is already done. Look again.'));
    box();
    await next();
    expect(await screen.findByText('That step is already done. Look again.')).toBeInTheDocument();
  });

  it('says "try again in a little while" on a 429, never the server\'s own words', async () => {
    h.answer.mutateAsync.mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'internal detail'));
    box();
    await next();
    expect(await screen.findByText('Try again in a little while')).toBeInTheDocument();
    expect(screen.queryByText(/internal detail/)).toBeNull();
  });

  it('says "couldn\'t save" for a server fault or a dropped connection', async () => {
    h.answer.mutateAsync.mockRejectedValue(new ApiError(500, 'BOOM', 'stack trace'));
    box();
    await next();
    expect(await screen.findByText("Couldn't save — try again")).toBeInTheDocument();
    expect(screen.queryByText(/stack trace/)).toBeNull();
  });

  it('keeps the ticks, so the retry is one tap', async () => {
    h.answer.mutateAsync.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Failed to fetch'));
    box();
    await next();
    await screen.findByText("Couldn't save — try again");
    expect(screen.getByLabelText('Something else')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  describe('an upload', () => {
    beforeEach(() => show(collecting('serviceReport')));

    const pick = async () => {
      fireEvent.change(screen.getByLabelText('Upload PDF or photo'), { target: { files: [pdf()] } });
      await waitFor(() => expect(h.paper.mutateAsync).toHaveBeenCalledTimes(1));
    };

    it('a file of the wrong kind is told so in plain words', async () => {
      h.paper.mutateAsync.mockRejectedValue(new PaperRejected('type'));
      box();
      await pick();
      expect(await screen.findByText('Choose a PDF or a photo (JPEG, PNG or WebP).')).toBeInTheDocument();
    });

    it('a file that is too big is told so in plain words', async () => {
      h.paper.mutateAsync.mockRejectedValue(new PaperRejected('size'));
      box();
      await pick();
      expect(await screen.findByText('That file is over 10 MB. Choose a smaller one.')).toBeInTheDocument();
    });

    it('a refused or dropped upload says so, and the owner can pick again', async () => {
      h.paper.mutateAsync.mockRejectedValue(new Error('Upload failed: 500'));
      box();
      await pick();
      expect(
        await screen.findByText('The upload did not go through. Check your network and try again.'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Upload PDF or photo')).toBeEnabled();
    });

    it('the words go away when the next try is made', async () => {
      h.paper.mutateAsync.mockRejectedValueOnce(new PaperRejected('type'));
      box();
      await pick();
      await screen.findByText('Choose a PDF or a photo (JPEG, PNG or WebP).');
      h.paper.mutateAsync.mockResolvedValue(undefined);
      fireEvent.change(screen.getByLabelText('Upload PDF or photo'), { target: { files: [pdf('again.pdf')] } });
      await waitFor(() =>
        expect(screen.queryByText('Choose a PDF or a photo (JPEG, PNG or WebP).')).toBeNull(),
      );
    });
  });
});
