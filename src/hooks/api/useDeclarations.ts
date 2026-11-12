import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import { ImageRejected } from '@/lib/squeezeImage';
import { uploadDeclarationsPhoto } from '@/lib/uploadDeclarationsPhoto';
import { useAuthStore } from '@/store/auth';
import type { DeclarationsAnswer } from '@dk/shared/schemas';
import type { DeclarationsView, WashroomPhotoSlot } from '@dk/shared/types';

/**
 * Where the outlet's Dealer Declarations stand, for the box MDG posts in the chat
 * (`message.declarations`, ADR 0037).
 *
 * The box is posted once and never edited, so it keeps no copy of what was true
 * when it was posted: every box in the thread draws this one live view. The server
 * says when it moved (`declarations:changed`, see `useDeclarationsSocket`) and when
 * a new box arrives (`useConversationSocket`), and every answer returns the whole
 * view again, which goes straight into the cache.
 *
 * Asked for only by a box that is on screen.
 */
export const declarationsKey = ['declarations', 'me'] as const;

const VIEW_PATH = '/v1/me/declarations';
const ANSWER_PATH = '/v1/me/declarations/answer';

/** How often the box looks again while a robot is filing and the socket may have missed it. */
export const DECLARATIONS_POLL_MS = 5_000;

/** Whether the photos are with MDG's filing: the owner has nothing to do but wait. */
export function declarationsIsBusy(view: DeclarationsView | undefined): boolean {
  return view?.screen === 'waiting';
}

export function useDeclarations() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: declarationsKey,
    // The dealer app's own route: an admin who happens to sign in here has no outlet.
    enabled: !!token && role !== 'admin',
    staleTime: 30_000,
    // A phone that reports itself offline must end in the "could not check" line with its
    // retry, not park the read behind a spinner for good (the default for a query is to wait
    // for the network).
    networkMode: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      declarationsIsBusy(query.state.data) ? DECLARATIONS_POLL_MS : false,
    queryFn: () => api.get<DeclarationsView>(VIEW_PATH),
  });
}

/** Ask the server again: an event, an answer or a send moved something. */
export function invalidateDeclarations(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: declarationsKey });
}

/**
 * The mutation keys of the owner's two kinds of answer. Every box in the thread shares
 * one outlet and one view, so what is on its way is shared too ({@link useDeclarationsBusy}).
 */
const ANSWER_KEY = ['declarations', 'answer'] as const;
const PHOTO_KEY = ['declarations', 'photo'] as const;
const REUSE_KEY = ['declarations', 'reuse'] as const;

/**
 * An answer that did not go through leaves the box guessing: the request may or may not
 * have landed. Ask the server where things stand, so the box draws that and not a guess.
 * (Not for a photo the phone itself turned away: nothing was sent.)
 */
function reread(qc: QueryClient, err: unknown): void {
  if (err instanceof ImageRejected) return;
  invalidateDeclarations(qc);
}

/**
 * Give one plain answer (today: Send). The reply is the outlet's whole fresh view,
 * so it replaces the cache at once and every box in the thread moves together.
 * Never retried: an answer that went through twice could send the photos twice.
 *
 * `networkMode: 'always'`: with the phone reporting no network, the default is to park the
 * request and run it by itself when the signal returns, minutes later, possibly after the
 * owner has left or an admin has dropped the photos, while every control sat off. A dropped
 * link instead ends in the box's "did not go through" line at once.
 *
 * Any error asks the server again: a 409 means the cycle had already moved (another phone
 * answered, or an admin acted), and a dropped link leaves it unknown whether the answer
 * landed.
 */
export function useAnswerDeclarations() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ANSWER_KEY,
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    mutationFn: (body: DeclarationsAnswer) => api.post<DeclarationsView>(ANSWER_PATH, body),
    onSuccess: (view) => {
      qc.setQueryData(declarationsKey, view);
    },
    onError: (err) => reread(qc, err),
  });
}

/**
 * "Use the same photos as last time": the server puts last filing's two photos in the box,
 * replacing what the slots hold, and answers with the whole fresh view. No upload: the files
 * are already there. Its own mutation, so the box can show which button is on its way; it
 * counts as busy for every box in the thread like any other answer ({@link useDeclarationsBusy}).
 * Never retried, and on the same footing as {@link useAnswerDeclarations}: not parked while
 * the phone says it is offline, and any error asks the server where things stand (the photos
 * may be gone, or the cycle may have moved).
 */
export function useReuseDeclarationsPhotos() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: REUSE_KEY,
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    mutationFn: () =>
      api.post<DeclarationsView>(ANSWER_PATH, { step: 'reuse' } satisfies DeclarationsAnswer),
    onSuccess: (view) => {
      qc.setQueryData(declarationsKey, view);
    },
    onError: (err) => reread(qc, err),
  });
}

export interface AnswerDeclarationsPhotoVars {
  /** The outlet the photo belongs to: `DeclarationsView.dealerId`. */
  dealerId: string;
  slot: WashroomPhotoSlot;
  file: File;
}

/**
 * Hand over one photo: squeeze it on the phone and put it in storage with the
 * ordinary presigned upload (scope `declarations`), then tell the server which key
 * it landed under. One mutation for all of it, so "uploading" covers the whole
 * thing.
 *
 * A RETAKE is the same single call as a first photo: the server's `photo` step replaces
 * whatever the slot held. (It used to take the old photo out first. If the new one then
 * failed to arrive, the box still drew the old photo as "Added" while the server's slot was
 * empty, and Send was refused.) The new photo is squeezed and uploaded BEFORE the server is
 * told, so a photo the phone cannot squeeze, or an upload that drops, never costs the owner
 * the photo they already had.
 */
export function useAnswerDeclarationsPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: PHOTO_KEY,
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    mutationFn: async ({ dealerId, slot, file }: AnswerDeclarationsPhotoVars) => {
      const { key, filename } = await uploadDeclarationsPhoto(file, dealerId, slot);
      return api.post<DeclarationsView>(ANSWER_PATH, { step: 'photo', slot, key, filename });
    },
    onSuccess: (view) => {
      qc.setQueryData(declarationsKey, view);
    },
    onError: (err) => reread(qc, err),
  });
}

/**
 * Whether an answer is on its way, for ANY Declarations box on screen, which photo
 * slot is uploading, and whether the same-photos answer is. A reminder posts the box again, so a thread can hold several; each
 * draws the same live view and is fully interactive. If busy belonged to one box, a photo
 * could be uploading in one while the owner picks another in a second, and whichever reply
 * landed last would win the cache. Read here from the mutations themselves, it is the same
 * in every box.
 */
export function useDeclarationsBusy(): {
  busy: boolean;
  uploadingSlot: WashroomPhotoSlot | null;
  reusing: boolean;
} {
  const onTheWay = useIsMutating({ mutationKey: ['declarations'] });
  const reusing = useIsMutating({ mutationKey: REUSE_KEY });
  const photos = useMutationState({
    filters: { mutationKey: PHOTO_KEY, status: 'pending' },
    select: (m) => (m.state.variables as AnswerDeclarationsPhotoVars | undefined)?.slot ?? null,
  });
  return {
    busy: onTheWay > 0,
    uploadingSlot: photos.find((slot) => slot !== null) ?? null,
    reusing: reusing > 0,
  };
}
