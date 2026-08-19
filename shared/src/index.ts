// Public surface of @dk/shared.
// Re-export types and Zod schemas. Consumers can import everything from
// the package root, or from the sub-paths "@dk/shared/types" and
// "@dk/shared/schemas" when they want to be explicit.

export * from './types';
export * from './onboarding';
export * from './data/kavachTemplate';
export * from './data/staffWorkCatalog';
export * from './data/festivals';
export * from './points/staffPoints';
export * from './dsr/guideline';
export * from './dsr/products';
export * from './iras/fields';
export * from './iras/corrections';
export * from './iras/decant';
export * from './dealer/code';
export * as schemas from './schemas';
