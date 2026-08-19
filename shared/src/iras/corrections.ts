/**
 * The correction overlay algebra — pure, shared by the engine and the editor.
 *
 * One implementation, two callers. The backend applies this to build the rows the
 * DSR computes from; the admin applies the same function to render the grid. If
 * the two ever diverged, the operator would be shown a number the report is not
 * using, which is the one thing a data-correction screen cannot afford.
 *
 * Everything here is a pure function of plain data — no dates, no randomness, no
 * IO — so a stored correction resolves the same way today and in six months.
 */
import type {
  IrasDataCorrection,
  IrasDataset,
  IrasReportCode,
  IrasRow,
  IrasRowKeyStrength,
} from '../types/irasData';
import { IRAS_REPORT_LABELS, IRAS_ROW_LEVEL_FIELD } from '../types/irasData';

/**
 * The portal's own transaction id per report — the strongest row identity
 * available, and the one that survives everything that matters.
 *
 * These are IRAS's own primary keys for the records (verified against live data:
 * the same `REC_TXN_ID` appears on the same decantation across two consecutive
 * days' collections, so they are portal-side ids, not per-response artifacts).
 * They also fail SAFE in the one case a natural key fails dangerously: if the
 * pipeline selects a different closing shift, every row gets a different
 * transaction id and the corrections orphan for review — where keying on
 * `NOZZLE_NO` would silently re-apply yesterday's correction to a different
 * shift's reading.
 */
const TXN_FIELD: Record<IrasReportCode, string> = {
  TOT: 'FCC_TXN_ID',
  STK: 'STK_TXN_ID',
  REC: 'REC_TXN_ID',
};

/**
 * The fallback identity when the portal sends no usable transaction id. One row
 * per nozzle and one per tank is the shape of the data; `REC` is the exception —
 * a tank can legitimately take two tankers in a day — so its key needs an
 * ordinal, which is the one position-bound key here and is treated as such.
 */
const NATURAL_FIELD: Record<IrasReportCode, string> = {
  TOT: 'NOZZLE_NO',
  STK: 'TANK_NO',
  REC: 'TANK_NO',
};

/** The prefix that marks a hand-added row, which no portal row can collide with. */
export const IRAS_ADDED_ROW_PREFIX = 'add:';

export function isAddedRowKey(rowKey: string): boolean {
  return rowKey.startsWith(IRAS_ADDED_ROW_PREFIX);
}

export interface IrasRowKeying {
  /** One key per row, in portal order. */
  keys: string[];
  /** How each key was derived, parallel to `keys`. */
  strengths: IrasRowKeyStrength[];
}

function blank(v: string | undefined): boolean {
  return v === undefined || v === null || String(v).trim() === '';
}

/**
 * A stable key for every row in a dataset.
 *
 * Rows arrive as loose key/value pairs with no id of our own, and a positional
 * index is not survivable — the portal can re-send a day with a different row
 * count or order, and a correction that slides onto a neighbouring nozzle is
 * worse than no correction at all. So: the portal's transaction id when every
 * row has a distinct one, else the natural key (with a `#n` ordinal where that
 * repeats), else the position with the weakness recorded.
 */
export function irasRowKeys(code: IrasReportCode, rows: readonly IrasRow[]): IrasRowKeying {
  const txnField = TXN_FIELD[code];
  const txnValues = rows.map((r) => String(r[txnField] ?? '').trim());
  const txnUsable =
    rows.length > 0 &&
    txnValues.every((v) => v !== '') &&
    new Set(txnValues).size === txnValues.length;

  if (txnUsable) {
    return {
      keys: txnValues.map((v) => `txn:${v}`),
      strengths: rows.map(() => 'txn'),
    };
  }

  const natField = NATURAL_FIELD[code];
  const natValues = rows.map((r) => String(r[natField] ?? '').trim());
  const seen = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const v of natValues) counts.set(v, (counts.get(v) ?? 0) + 1);

  const keys: string[] = [];
  const strengths: IrasRowKeyStrength[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const v = natValues[i]!;
    if (v === '') {
      keys.push(`idx:${i}`);
      strengths.push('index');
      continue;
    }
    if ((counts.get(v) ?? 0) > 1) {
      const ordinal = (seen.get(v) ?? 0) + 1;
      seen.set(v, ordinal);
      keys.push(`nat:${natField}=${v}#${ordinal}`);
      strengths.push('ordinal');
      continue;
    }
    keys.push(`nat:${natField}=${v}`);
    strengths.push('natural');
  }
  return { keys, strengths };
}

/** How a row reads to a person — used wherever the row itself is not on screen. */
export function irasRowLabel(code: IrasReportCode, row: IrasRow): string {
  const tank = String(row.TANK_NO ?? '').trim();
  if (code === 'TOT') {
    const nozzle = String(row.NOZZLE_NO ?? '').trim();
    return nozzle ? `Nozzle ${nozzle}` : 'Unnumbered nozzle';
  }
  if (code === 'STK') return tank ? `Tank ${tank}` : 'Unnumbered tank';
  const invoice = String(row.INVOICE_NUMBER ?? '').trim();
  const base = tank ? `Tank ${tank}` : 'Unnumbered tank';
  return invoice ? `${base} · invoice ${invoice}` : base;
}

/**
 * Whether a key is only meaningful at the position it was made — in which case
 * its correction must not survive the dataset changing shape underneath it.
 *
 * Read off the KEY rather than off the correction's recorded `keyStrength` or the
 * current row's, because the key's own format determines it: only an ordinal key
 * carries `#n`, only a positional one starts `idx:`. Deriving it means neither a
 * stale stored strength nor a caller's claim can talk the guard out of firing.
 */
export function irasRowKeyIsPositionBound(rowKey: string): boolean {
  return rowKey.startsWith('idx:') || /#\d+$/.test(rowKey);
}

export interface IrasApplyResult {
  /**
   * The rows a consumer should compute from: portal rows with field corrections
   * applied and excluded rows dropped, then hand-added rows appended.
   */
  rows: IrasRow[];
  /**
   * For each row in {@link rows}, the fields on it a person set by hand — every
   * field of a hand-added row, the corrected fields of a patched one, and
   * nothing for a row the portal sent untouched.
   *
   * Parallel to `rows` on purpose. A consumer that needs to tell an operator's
   * figure from the portal's would otherwise have to re-key the rows, and a
   * second keying does not reliably agree with this one: `irasRowKeys` chooses
   * its strategy from the rows it is handed, so a single hand-added row without
   * a transaction id drops the whole dataset from `txn:` keys to positional
   * ones and a correction stored against `txn:1536` stops resolving.
   */
  handSetFields: string[][];
  /** Applied corrections, in the order given. */
  applied: IrasDataCorrection[];
  /**
   * Corrections whose row is not in this dataset any more. Not applied, and
   * never re-pointed at another row — surfaced for a human instead.
   */
  orphaned: IrasDataCorrection[];
  /**
   * Applied field corrections whose portal value has changed since the edit.
   * The correction still wins (it is an override), but the operator is told the
   * ground moved so they can decide whether it is still needed.
   */
  portalChanged: IrasDataCorrection[];
  /** Row keys excluded from `rows`, for the grid's strikethrough state. */
  excludedRowKeys: string[];
  /** Row keys appended by hand, for the grid's "Added" chip. */
  addedRowKeys: string[];
  /**
   * Hand-added rows the portal may since have caught up with — the one way this
   * mechanism can DOUBLE a figure rather than merely get it wrong.
   *
   * A hand-added row is an addition, not an override. The commonest correction of
   * all is a delivery the outlet forgot to enter, and outlets routinely enter it
   * a day or two late: when the portal finally sends that decantation, the report
   * would count both, the variation would swing by a whole tanker, and a positive
   * variation beyond the band suspends sales of every product the same day.
   *
   * Flagged, never auto-resolved: silently dropping the hand-added row would
   * throw away real litres if the portal's new row is a DIFFERENT delivery, which
   * on a tank that takes two tankers a day is entirely possible. Only a person
   * can tell those apart, so this exists to put it in front of one.
   */
  duplicateRisk: Array<{
    correction: IrasDataCorrection;
    /** The portal row(s) that now share this row's tank or nozzle. */
    portalRows: IrasRow[];
  }>;
}

/** The column whose value decides which product a row's figures land on. */
const IDENTITY_FIELD: Record<IrasReportCode, string> = {
  TOT: 'NOZZLE_NO',
  STK: 'TANK_NO',
  REC: 'TANK_NO',
};

/**
 * Resolve a dataset plus its corrections into the rows that are actually in
 * force.
 *
 * Values are written back as STRINGS, keeping the generic `Record<string,string>`
 * contract intact so `parse.ts` remains the single place that coerces a portal
 * value to a number — every existing blank-handling and `Number.isFinite` guard
 * applies unchanged to a corrected value.
 */
export function applyIrasCorrections(
  code: IrasReportCode,
  dataset: Pick<IrasDataset, 'rows'> | null | undefined,
  corrections: readonly IrasDataCorrection[],
): IrasApplyResult {
  const portalRows = dataset?.rows ?? [];
  const { keys } = irasRowKeys(code, portalRows);

  const indexByKey = new Map<string, number>();
  keys.forEach((key, i) => indexByKey.set(key, i));

  const mine = corrections.filter((c) => c.code === code);

  const applied: IrasDataCorrection[] = [];
  const orphaned: IrasDataCorrection[] = [];
  const portalChanged: IrasDataCorrection[] = [];
  const excludedRowKeys: string[] = [];
  const addedRowKeys: string[] = [];
  const duplicateRisk: IrasApplyResult['duplicateRisk'] = [];

  /** Per-row field patches, keyed by row index into `portalRows`. */
  const patches = new Map<number, Map<string, string | null>>();
  const addedRows: Array<{ key: string; row: IrasRow }> = [];
  const excluded = new Set<number>();

  for (const c of mine) {
    if (c.kind === 'ADDED_ROW') {
      // A hand-added row has nothing to match against, so it can never orphan.
      if (c.row) {
        addedRows.push({ key: c.rowKey, row: { ...c.row } });
        addedRowKeys.push(c.rowKey);
        applied.push(c);

        // …but it CAN come to duplicate a row the portal has since sent. Only
        // worth raising when the dataset's shape actually changed underneath it:
        // adding a second delivery to a tank that already had one is a normal,
        // deliberate act, and flagging that forever would be noise.
        if (c.rowCountAtEdit !== portalRows.length) {
          const field = IDENTITY_FIELD[code];
          const mine = String(c.row[field] ?? '').trim();
          const clashes = mine
            ? portalRows.filter((r) => String(r[field] ?? '').trim() === mine)
            : [];
          if (clashes.length > 0) duplicateRisk.push({ correction: c, portalRows: clashes });
        }
      }
      continue;
    }

    const idx = indexByKey.get(c.rowKey);
    if (idx === undefined) {
      orphaned.push(c);
      continue;
    }
    // A position-bound key that still resolves is not good enough: if the
    // dataset's row count changed, a second tanker on the same tank may have
    // inherited the first one's ordinal. Orphan rather than guess.
    if (irasRowKeyIsPositionBound(c.rowKey) && c.rowCountAtEdit !== portalRows.length) {
      orphaned.push(c);
      continue;
    }

    if (c.kind === 'EXCLUDED_ROW') {
      excluded.add(idx);
      excludedRowKeys.push(c.rowKey);
      applied.push(c);
      continue;
    }

    // FIELD
    const current = portalRows[idx]![c.field];
    const portalNow = current === undefined ? null : String(current);
    const wasSeen = c.portalValue === null ? null : String(c.portalValue);
    if (portalNow !== wasSeen) portalChanged.push(c);

    let byField = patches.get(idx);
    if (!byField) {
      byField = new Map();
      patches.set(idx, byField);
    }
    byField.set(c.field, c.value);
    applied.push(c);
  }

  const rows: IrasRow[] = [];
  // Which fields on each OUTPUT row a person set, in step with `rows`.
  //
  // Published rather than left for a consumer to work out, because working it
  // out means keying the rows a second time — and the second keying does not
  // always agree with this one. `irasRowKeys` picks its strategy from the rows
  // it is given: add one hand-entered row with no transaction id and the whole
  // dataset drops from `txn:` keys to positional ones, so a correction stored
  // against `txn:1536` no longer resolves. Excluding a row shifts every ordinal
  // after it, too. Here, inside the assembly, the mapping is simply known.
  const handSetFields: string[][] = [];
  for (let i = 0; i < portalRows.length; i += 1) {
    if (excluded.has(i)) continue;
    const patch = patches.get(i);
    if (!patch) {
      rows.push(portalRows[i]!);
      handSetFields.push([]);
      continue;
    }
    const next: IrasRow = { ...portalRows[i]! };
    for (const [field, value] of patch) {
      // A corrected value of null means "the portal's blank" — write the empty
      // string rather than deleting the key, so a consumer reading the field
      // sees a blank it already knows how to handle.
      next[field] = value ?? '';
    }
    rows.push(next);
    handSetFields.push([...patch.keys()]);
  }
  for (const added of addedRows) {
    rows.push(added.row);
    // The portal never sent this row, so every figure on it is a person's.
    handSetFields.push(Object.keys(added.row));
  }

  return {
    rows,
    handSetFields,
    applied,
    orphaned,
    portalChanged,
    excludedRowKeys,
    addedRowKeys,
    duplicateRisk,
  };
}

/** The same overlay, applied across every dataset in a snapshot. */
export function applyIrasCorrectionsToDatasets(
  datasets: Partial<Record<IrasReportCode, IrasDataset>>,
  corrections: readonly IrasDataCorrection[],
  codes: readonly IrasReportCode[],
): {
  datasets: Partial<Record<IrasReportCode, IrasDataset>>;
  /** Per report, the hand-set fields of each row — see {@link IrasApplyResult.handSetFields}. */
  handSetFields: Partial<Record<IrasReportCode, string[][]>>;
  orphaned: IrasDataCorrection[];
  portalChanged: IrasDataCorrection[];
  duplicateRisk: IrasApplyResult['duplicateRisk'];
  correctedCount: number;
} {
  const next: Partial<Record<IrasReportCode, IrasDataset>> = {};
  const handSetFields: Partial<Record<IrasReportCode, string[][]>> = {};
  const orphaned: IrasDataCorrection[] = [];
  const portalChanged: IrasDataCorrection[] = [];
  const duplicateRisk: IrasApplyResult['duplicateRisk'] = [];
  let correctedCount = 0;

  for (const code of codes) {
    const dataset = datasets[code];
    const result = applyIrasCorrections(code, dataset, corrections);
    orphaned.push(...result.orphaned);
    portalChanged.push(...result.portalChanged);
    duplicateRisk.push(...result.duplicateRisk);
    correctedCount += result.applied.length;
    handSetFields[code] = result.handSetFields;

    if (!dataset) {
      // No dataset, but rows all the same: this is the COMMONEST correction of
      // all — a tanker decanted and nobody entered it at the outlet, so the
      // portal returned no receipt report whatsoever and the whole row is
      // hand-added. Dropping it here because there was nothing to spread it over
      // would silently discard the correction an admin just made.
      if (result.rows.length === 0) continue;
      next[code] = {
        code,
        label: IRAS_REPORT_LABELS[code],
        window: { from: '', to: '' },
        columns: [...new Set(result.rows.flatMap((r) => Object.keys(r)))].map((field) => ({
          field,
          headerName: field,
        })),
        rows: result.rows,
        // Zero, both of them: the portal returned nothing, and these two fields
        // mean "what the portal returned" everywhere else in the Vault.
        rawRowCount: 0,
        rowCount: 0,
        filterDescription: 'The portal returned no rows for this report; these were added by hand.',
      };
      continue;
    }

    next[code] = {
      ...dataset,
      rows: result.rows,
      // `rowCount` and `rawRowCount` keep meaning "what the portal returned":
      // the Vault's own counters, the dropped-rows note and every existing
      // summary read them, and an added row is not something the portal sent.
      // The editor reports "13 rows · 1 added, 1 excluded" separately.
    };
  }

  // A correction for a report this snapshot does not carry at all is orphaned
  // too, and would otherwise be invisible.
  for (const c of corrections) {
    if (!codes.includes(c.code)) orphaned.push(c);
  }

  return { datasets: next, handSetFields, orphaned, portalChanged, duplicateRisk, correctedCount };
}

/** The field corrections in force for one row, keyed by field. */
export function correctionsByField(
  corrections: readonly IrasDataCorrection[],
  code: IrasReportCode,
  rowKey: string,
): Map<string, IrasDataCorrection> {
  const out = new Map<string, IrasDataCorrection>();
  for (const c of corrections) {
    if (c.code === code && c.rowKey === rowKey && c.kind === 'FIELD') out.set(c.field, c);
  }
  return out;
}

/** Whether a row is excluded by a correction. */
export function isRowExcluded(
  corrections: readonly IrasDataCorrection[],
  code: IrasReportCode,
  rowKey: string,
): boolean {
  return corrections.some(
    (c) =>
      c.code === code &&
      c.rowKey === rowKey &&
      c.kind === 'EXCLUDED_ROW' &&
      c.field === IRAS_ROW_LEVEL_FIELD,
  );
}
