/**
 * How "Needs you" lays out its rows (spec 4.1, owner decision Q1).
 *
 *  - `'slider'`: one card at a time, swiped or moved with the arrows (what the owner chose on 25 Nov
 *    2026: two upload boxes stacked took the whole first screen).
 *  - `'list'`: up to four rows, then "N more".
 *
 * Both are built; flipping is this one line. Until the owner answers Q1 it stays `'slider'`.
 */
export type WorkLayout = 'slider' | 'list';

export const TODAY_WORK_LAYOUT: WorkLayout = 'slider';
