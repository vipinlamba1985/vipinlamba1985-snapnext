// The asset intelligence pipeline version, on its own so that modules which
// only need to filter by it — search, retrieval — do not have to import the
// whole enrichment pipeline (and through it every AI provider) just to read a
// string. Keeping this module import-free also lets those consumers be loaded
// directly by the Node test runner, which does not resolve the `@/` alias.
export const ASSET_INTELLIGENCE_PIPELINE_VERSION = 'universal-index-v1';
