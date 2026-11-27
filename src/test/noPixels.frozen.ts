import type { Counts } from './noPixels.scan';

/**
 * The frozen list of the pixel guard (spec 5, `noPixels.test.ts`): the files that existed before the
 * redesign and still break a rule, with how many times. It ONLY SHRINKS:
 *
 *  - a file here may not break a rule more often than listed (the test fails if it does);
 *  - a file not here may not break any (a new file starts clean);
 *  - a file that has been cleaned up is removed from this list (or its numbers lowered) by whoever
 *    cleaned it, or by group Z at the end. `NO_PIXELS_STRICT=1 npx vitest run src/test/noPixels.test.ts`
 *    also fails on a stale entry, so the list can be checked for dead weight.
 *
 * Never raise a number and never add a file to make the test pass: fix the file.
 */
export const FROZEN: Record<string, Counts> = {
  'components/PdfViewer.tsx': { truncate: 1 },
  'components/PrivacyLink.tsx': { blank: 1 },
  'features/chat/AttachmentPreview.tsx': { heightPx: 1, widthPx: 5, truncate: 1, lineClamp: 1 },
  'features/chat/MediaSendPreview.tsx': { heightPx: 1 },
  'features/chat/MediaViewer.tsx': { widthPx: 1, truncate: 2, lineClamp: 1 },
  'features/chat/MessageBubble.tsx': { widthPx: 2, lineClamp: 1 },
  'features/chat/ReactionsSheet.tsx': { textPx: 1, truncate: 1 },
  'features/chat/ReplyChoices.tsx': { widthPx: 2 },
  'features/chat/VoiceNoteParts.tsx': { heightPx: 1 },
  'features/chat/VoiceTranscript.tsx': { lineClamp: 1 },
  'features/chat/WorkPermits/WorkPermitBox.tsx': { truncate: 1 },
  'features/chat/chatLook.ts': { truncate: 2 },
  'features/reports/kinds/announcement.tsx': { blank: 1 },
  'lib/linkify.tsx': { blank: 1 },
  'pages/ChatMediaPage.tsx': { blank: 1 },
};
