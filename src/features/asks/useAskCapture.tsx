import * as React from 'react';

import { useToast } from '@/components/ui';
import { useT } from '@/lib/i18n';
import {
  DOCUMENT_ASK_ACCEPT,
  isAskFileTooBig,
  resolveAskFile,
  type DocumentAskMime,
} from '@/lib/uploadDocumentAsk';
import type { DealerDocumentAskList, DealerDocumentAskRow } from '@dk/shared/types';

import { AskSheet } from './AskSheet';

/**
 * One camera, one file picker and one confirm sheet, shared by the ask bar and
 * the ask list.
 *
 * WHY A HOOK THAT RETURNS MARKUP RATHER THAN A COMPONENT
 * -----------------------------------------------------
 * A file input must be `.click()`ed INSIDE the tap that asked for it — the
 * Android System WebView drops a picker opened from an effect or a state change,
 * which is the constraint `DensityTodayCard` documents and works around by
 * handing its own callback down to the week strip through a ref. The same
 * problem here has two callers (a bar at the top of the app and the cards on the
 * list), so the input has to live somewhere both can reach SYNCHRONOUSLY. A hook
 * gives them a plain function to call in their own handler, and hands back the
 * inputs and the sheet to render once.
 *
 * The alternative — an input per card — is what the app does for Kavach and
 * density, and it means a screen with eight rows mounts sixteen hidden file
 * inputs. On the phones this runs on that is worth avoiding, and it is also two
 * more stops per row in a keyboard user's Tab order.
 */
export interface AskCapture {
  /** Open the camera for this row. Call it INSIDE the tap; never from an effect. */
  openCamera: (row: DealerDocumentAskRow) => void;
  /** Open the phone's files (photos or a PDF) for this row. Same rule. */
  openFiles: (row: DealerDocumentAskRow) => void;
  /** The hidden inputs and the confirm sheet. Render this once. */
  elements: React.ReactNode;
}

/** What the dealer picked, once it is something MDG can actually accept. */
interface Picked {
  file: File;
  contentType: DocumentAskMime;
  kind: 'image' | 'file';
}

export function useAskCapture(
  list: DealerDocumentAskList,
  opts?: { onQueued?: (row: DealerDocumentAskRow) => void },
): AskCapture {
  const t = useT();
  const toast = useToast();
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const filesRef = React.useRef<HTMLInputElement>(null);

  const [target, setTarget] = React.useState<DealerDocumentAskRow | null>(null);
  const [picked, setPicked] = React.useState<Picked | null>(null);

  const onQueuedRef = React.useRef(opts?.onQueued);
  onQueuedRef.current = opts?.onQueued;

  const openCamera = React.useCallback((row: DealerDocumentAskRow) => {
    setTarget(row);
    cameraRef.current?.click();
  }, []);

  const openFiles = React.useCallback((row: DealerDocumentAskRow) => {
    setTarget(row);
    filesRef.current?.click();
  }, []);

  const onPick = React.useCallback(
    (fromCamera: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset FIRST, or picking the same file twice never fires `change` again
      // and the dealer's second attempt does nothing at all.
      e.target.value = '';
      if (!file) return;

      // Judged here, at pick time, rather than after a minute of uploading.
      // `resolveAskFile` also recovers the type an Android camera capture does
      // not set — left alone it presigns as application/octet-stream and the
      // dealer is told their photo is not a photo.
      const resolved = resolveAskFile(file, { fromCamera });
      if (!resolved) {
        toast.error(t('asks.notAFile'));
        return;
      }
      if (isAskFileTooBig(file)) {
        // The advice is the actionable half: a 30 MB scan cannot be shrunk by
        // this app, but a photograph of the same paper can be, and will go.
        toast.error(t('asks.tooBig'));
        return;
      }
      setPicked({ file, contentType: resolved.contentType, kind: resolved.kind });
    },
    [t, toast],
  );

  const close = React.useCallback(() => {
    setPicked(null);
    setTarget(null);
  }, []);

  // "Take again" drops the photograph and reopens the camera for the SAME row,
  // in the same tap — closing the sheet and making the dealer find the button
  // again is the version that gets abandoned.
  const retake = React.useCallback(() => {
    setPicked(null);
    cameraRef.current?.click();
  }, []);

  const elements = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick(true)}
      />
      <input
        ref={filesRef}
        type="file"
        // The four types the shared declaration names, so this input and the
        // presign route cannot come to disagree about what may be sent.
        accept={DOCUMENT_ASK_ACCEPT}
        className="hidden"
        onChange={onPick(false)}
      />
      {target && picked ? (
        <AskSheet
          list={list}
          row={target}
          file={picked.file}
          contentType={picked.contentType}
          kind={picked.kind}
          onClose={close}
          onRetake={retake}
          onQueued={(row) => onQueuedRef.current?.(row)}
        />
      ) : null}
    </>
  );

  return { openCamera, openFiles, elements };
}
