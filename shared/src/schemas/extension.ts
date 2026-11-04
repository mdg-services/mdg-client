import { z } from 'zod';

import { PAGE_PICTURE_MAX_CHARS } from '../types/extension';
import { SUMMON_PORTALS } from '../types/laptopBridge';
import { SHARE_AUDIENCES } from '../types/share';

/** GET /extension/dealers?code= : an outlet code as typed ("15e", " 15E "). */
export const extensionDealerQuerySchema = z
  .object({ code: z.string().trim().toUpperCase().min(1).max(20) })
  .strict();
export type ExtensionDealerQuery = z.infer<typeof extensionDealerQuerySchema>;

/** POST /extension/page-picture. The image is a data URL from chrome.tabs.captureVisibleTab, shrunk by the extension to fit. */
export const extensionPagePictureSchema = z
  .object({
    dealerId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id'),
    audience: z.enum(SHARE_AUDIENCES),
    image: z
      .string()
      .max(PAGE_PICTURE_MAX_CHARS)
      .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/, 'Not a picture'),
    portal: z.enum(SUMMON_PORTALS).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type ExtensionPagePictureInput = z.infer<typeof extensionPagePictureSchema>;
