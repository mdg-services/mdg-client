// Public surface of @dk/shared.
// Re-export types and Zod schemas. Consumers can import everything from
// the package root, or from the sub-paths "@dk/shared/types" and
// "@dk/shared/schemas" when they want to be explicit.

export * from './types';
export * from './onboarding';
export * from './data/kavachTemplate';
export * from './data/staffWorkCatalog';
export * from './data/festivals';
export * from './data/documentKinds';
export * from './data/roSupplyConditions';
export * from './points/staffPoints';
export * from './dsr/cumulative';
export * from './dsr/guideline';
export * from './dsr/inspectionWindow';
export * from './dsr/products';
export * from './dsr/tanks';
export * from './dsr/receipts';
export * from './iras/fields';
export * from './iras/corrections';
export * from './iras/dayPlan';
export * from './iras/slip';
export * from './iras/decant';
export * from './iras/dayState';
export * from './dealer/code';
// The outlet's own paperwork: the twenty-five-row catalog, its resolver and its
// expiry arithmetic. Shared because the admin Info tab renders from it, the
// dealer PATCH schema is built from it, and the AI first line decides what a
// dealer may be told from it — three surfaces, one definition of a field.
export * from './dealer/profile';
export * from './tt/materials';
export * from './lib/serviceLabel';
// The admin's view of the AI first line: the inbox chip, the turn log's
// vocabulary, and the rule for whether a composed answer is still usable. Here
// rather than in `mdg-admin` because that app has no test runner at all — see
// the module header.
export * from './lib/aiFirstLineView';
// The one rule that decides whether a dealer may be shown their Kavach figure.
// Shared because the page, the API serializer and the AI first line's Kavach
// lookup all have to answer it the same way.
export * from './kavach/dealerFacing';
export * as schemas from './schemas';
