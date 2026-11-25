/**
 * The longest delay `setTimeout` accepts (about 24 days). The pinned bar's timer
 * reads it (`ticketBarView.msUntilBarChange`).
 *
 * This file used to hold the line under a bubble — "#42 · Sent to the MDG team" —
 * and the timer that kept it honest. ADR 0055 took that line off the bubbles
 * (a ticket number under a message tells the dealer a machine raised it); where a
 * question stands is told by the pinned bar alone, in the team's own words.
 */
export const MAX_TIMER_MS = 2 ** 31 - 1;
