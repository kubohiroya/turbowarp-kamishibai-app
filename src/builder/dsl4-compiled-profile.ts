// The compiled profile is shared with the browser distribution build, so it lives in the core.
export {
  convertDsl4ProjectToCompiledProfile,
  dsl4DistributionProfiles,
  removeDsl4BlockSourceDeclarations,
} from '../dsl4/compiled-project.js';
export type {Dsl4DistributionProfile} from '../dsl4/compiled-project.js';
