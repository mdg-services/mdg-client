import * as React from 'react';

/**
 * Where the ask bar is drawn: directly under whichever screen's top bar is on
 * screen, the way WhatsApp hangs its own banners under the header.
 *
 * The bar's ENGINE — the ask socket, the offline photo queue, the capture sheet
 * — has to keep running on every screen, so it stays mounted once in the app
 * frame (`AppShell`). Only the visible strip moves: the frame publishes it here
 * and every `AppBar` renders `<AskBarSlot />` beneath itself. A screen with no
 * top bar shows no strip, and the engine keeps working regardless.
 */
export const AskBarSlotContext = React.createContext<React.ReactNode>(null);

export function AskBarSlot() {
  return <>{React.useContext(AskBarSlotContext)}</>;
}
