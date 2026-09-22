import { ProjectContext } from '../types';

/**
 * Stack-specific knowledge the AI prompts and file-gathering need.
 * Keyed off the detected projectTypes in ProjectContext.
 */
export interface StackProfile {
  id: string;
  /** Human label used in prompts, e.g. "Flutter". */
  label: string;
  /** Source file extensions worth reading for context. */
  sourceExtensions: string[];
  /** Generated/derived files that add noise rather than context. */
  ignoredSuffixes: string[];
  /** Root folders most likely to hold application source. */
  sourceRoots: string[];
  /** Folder under a source root that groups vertical slices, if any. */
  featureRoot?: string;
  /** Filename suffixes ranked by usefulness when reading a feature folder. */
  priorityFilePatterns: string[];
  /** Framework/architecture vocabulary injected into prompts. */
  conventionHints: string;
  /** Guidance for classifying a ticket's specialistType. */
  specialistHint: string;
  /** Example paths shown in the planner's JSON schema. */
  examplePaths: string[];
}

const FLUTTER: StackProfile = {
  id: 'flutter',
  label: 'Flutter',
  sourceExtensions: ['.dart'],
  ignoredSuffixes: ['.g.dart', '.freezed.dart'],
  sourceRoots: ['lib'],
  featureRoot: 'features',
  priorityFilePatterns: [
    '_bloc.dart',
    '_state.dart',
    '_event.dart',
    '_cubit.dart',
    '_screen.dart',
    '_repository.dart',
    '_repository_impl.dart',
    '_page.dart',
  ],
  conventionHints: 'BLoC/Cubit, clean architecture layers, GetIt, Freezed',
  specialistHint: '"ui" for widget/screen work, "logic" for BLoC/repository/data layer',
  examplePaths: ['lib/features/...', 'lib/core/...'],
};

const DART: StackProfile = {
  ...FLUTTER,
  id: 'dart',
  label: 'Dart',
  featureRoot: undefined,
  conventionHints: 'idiomatic Dart, package layout under lib/',
  specialistHint: '"logic" for most work; "ui" only if the package renders anything',
  examplePaths: ['lib/src/...', 'bin/...'],
};

const TYPESCRIPT: StackProfile = {
  id: 'typescript',
  label: 'TypeScript',
  sourceExtensions: ['.ts', '.tsx'],
  ignoredSuffixes: ['.d.ts', '.generated.ts'],
  sourceRoots: ['src', 'app', 'lib'],
  featureRoot: 'features',
  priorityFilePatterns: [
    '.service.ts',
    '.controller.ts',
    '.store.ts',
    '.hook.ts',
    '.context.tsx',
    '.component.tsx',
    '.tsx',
  ],
  conventionHints: 'module boundaries, typed interfaces, existing state-management choice',
  specialistHint: '"ui" for component/view work, "logic" for services/stores/data access',
  examplePaths: ['src/features/...', 'src/services/...'],
};

const JAVASCRIPT: StackProfile = {
  ...TYPESCRIPT,
  id: 'javascript',
  label: 'JavaScript',
  sourceExtensions: ['.js', '.jsx', '.mjs'],
  ignoredSuffixes: ['.min.js', '.bundle.js'],
  priorityFilePatterns: [
    '.service.js',
    '.controller.js',
    '.store.js',
    '.hook.js',
    '.component.jsx',
    '.jsx',
  ],
  examplePaths: ['src/features/...', 'src/services/...'],
};

const PYTHON: StackProfile = {
  id: 'python',
  label: 'Python',
  sourceExtensions: ['.py'],
  ignoredSuffixes: ['_pb2.py'],
  sourceRoots: ['src', 'app'],
  priorityFilePatterns: [
    '_service.py',
    '_repository.py',
    '_model.py',
    'views.py',
    'models.py',
    'routes.py',
  ],
  conventionHints: 'module/package layout, type hints, existing framework idioms',
  specialistHint: '"ui" only for template/view layers, "logic" for services/models/data access',
  examplePaths: ['src/...', 'app/...'],
};

const GENERIC: StackProfile = {
  id: 'generic',
  label: 'software',
  sourceExtensions: [],
  ignoredSuffixes: [],
  sourceRoots: ['src', 'lib', 'app'],
  priorityFilePatterns: [],
  conventionHints: 'the existing patterns visible in the codebase',
  specialistHint: '"general" unless the ticket is clearly UI or clearly data/logic',
  examplePaths: ['src/...'],
};

const PROFILES: StackProfile[] = [FLUTTER, DART, TYPESCRIPT, JAVASCRIPT, PYTHON];

/**
 * Picks the profile matching the project's detected types.
 * projectTypes is ordered by the detector, so the first match wins for
 * mixed repos (e.g. a Flutter app with a TypeScript backend).
 */
export function resolveStackProfile(ctx: ProjectContext): StackProfile {
  for (const type of ctx.projectTypes ?? []) {
    const match = PROFILES.find((p) => p.label.toLowerCase() === type.toLowerCase());
    if (match) return match;
  }
  return GENERIC;
}

/** Profiles for every detected type, so prompts can mention a mixed stack. */
export function resolveAllStackProfiles(ctx: ProjectContext): StackProfile[] {
  const matches = (ctx.projectTypes ?? [])
    .map((type) => PROFILES.find((p) => p.label.toLowerCase() === type.toLowerCase()))
    .filter((p): p is StackProfile => !!p);
  return matches.length > 0 ? matches : [GENERIC];
}

/**
 * Human-readable stack name for prompts, e.g. "Flutter" or "Flutter + Python".
 * Drops the detector's 'Unknown' sentinel so prompts never say "Unknown project".
 */
export function describeStack(ctx: ProjectContext): string {
  const named = (ctx.projectTypes ?? []).filter((t) => t && t.toLowerCase() !== 'unknown');
  return named.length > 0 ? named.join(' + ') : resolveStackProfile(ctx).label;
}

export function isSourceFile(profile: StackProfile, fileName: string): boolean {
  if (profile.ignoredSuffixes.some((s) => fileName.endsWith(s))) return false;
  if (profile.sourceExtensions.length === 0) return false;
  return profile.sourceExtensions.some((ext) => fileName.endsWith(ext));
}

export { GENERIC as GENERIC_PROFILE };
