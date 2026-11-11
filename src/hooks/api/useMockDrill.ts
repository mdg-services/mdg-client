import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api';
import { uploadMockDrillPhoto } from '@/lib/uploadMockDrillPhoto';
import { useAuthStore } from '@/store/auth';
import type { MockDrillAnswer } from '@dk/shared/schemas';
import type { MockDrillView } from '@dk/shared/types';

/**
 * Where the outlet's Mock Drill stands, for the box MDG posts in the chat
 * (`message.mockDrill`, ADR 0034).
 *
 * The box is posted once and never edited, so it keeps no copy of what was true
 * when it was posted: every box in the thread draws this one live view. The server
 * says when it moved (`mockDrill:changed`, see `useMockDrillSocket`) and when a new
 * box arrives (`useConversationSocket`), and every answer returns the whole view
 * again, which goes straight into the cache.
 *
 * Asked for only by a box that is on screen.
 */
export const mockDrillKey = ['mock-drill', 'me'] as const;

const VIEW_PATH = '/v1/me/mock-drill';
const ANSWER_PATH = '/v1/me/mock-drill/answer';

/** How often the box looks again while a person or a robot is working and the socket may have missed it. */
export const MOCK_DRILL_POLL_MS = 5_000;

/** Whether the report is with MDG's team or the robot: the owner has nothing to do but wait. */
export function mockDrillIsBusy(view: MockDrillView | undefined): boolean {
  return view?.screen === 'waiting';
}

export function useMockDrill() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: mockDrillKey,
    // The dealer app's own route: an admin who happens to sign in here has no outlet.
    enabled: !!token && role !== 'admin',
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (mockDrillIsBusy(query.state.data) ? MOCK_DRILL_POLL_MS : false),
    queryFn: () => api.get<MockDrillView>(VIEW_PATH),
  });
}

/** Ask the server again: an event, an answer or a submit moved something. */
export function invalidateMockDrill(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: mockDrillKey });
}

/**
 * Give one answer. The reply is the outlet's whole fresh view, so it replaces the
 * cache at once and every box in the thread moves together. Never retried: an
 * answer that went through twice would walk the steps on past where the owner is.
 *
 * A 409 means the step had already moved (another phone answered, or an admin
 * acted); the box looks again at once so it draws where things really stand.
 */
export function useAnswerMockDrill() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (body: MockDrillAnswer) => api.post<MockDrillView>(ANSWER_PATH, body),
    onSuccess: (view) => {
      qc.setQueryData(mockDrillKey, view);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) invalidateMockDrill(qc);
    },
  });
}

export interface AnswerMockDrillPhotoVars {
  /** The outlet the photo belongs to: `MockDrillView.dealerId`. */
  dealerId: string;
  /** 1 or 2. */
  slot: 1 | 2;
  file: File;
}

/**
 * Hand over one photo: put the file in storage with the ordinary presigned upload
 * (scope `mock-drill`), then tell the server which key it landed under. One
 * mutation for both, so "uploading" covers the whole thing, and a failed upload
 * never reaches the server as an answer.
 */
export function useAnswerMockDrillPhoto() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async ({ dealerId, slot, file }: AnswerMockDrillPhotoVars) => {
      const { key, filename } = await uploadMockDrillPhoto(file, dealerId);
      return api.post<MockDrillView>(ANSWER_PATH, { step: 'photo', slot, key, filename });
    },
    onSuccess: (view) => {
      qc.setQueryData(mockDrillKey, view);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) invalidateMockDrill(qc);
    },
  });
}
