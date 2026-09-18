import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectContext } from '../types';

const CONTEXT_KEY = 'maestro.projectContext';
const MAX_FILE_SIZE = 8_000;

// Flutter/Dart package map
const FLUTTER_PACKAGE_MAP: Record<string, string> = {
  flutter_bloc:                'BLoC / flutter_bloc',
  riverpod:                    'Riverpod',
  provider:                    'Provider',
  get_it:                      'get_it (DI)',
  injectable:                  'injectable (DI)',
  freezed_annotation:          'freezed',
  drift:                       'Drift (SQLite ORM)',
  hive:                        'Hive',
  isar:                        'Isar',
  sqflite:                     'sqflite',
  go_router:                   'go_router',
  auto_route:                  'auto_route',
  dio:                         'dio',
  firebase_core:               'Firebase',
  firebase_auth:               'Firebase Auth',
  cloud_firestore:             'Firebase Firestore',
  firebase_storage:            'Firebase Storage',
  supabase_flutter:            'Supabase',
  json_serializable:           'json_serializable',
  retrofit:                    'Retrofit',
  objectbox:                   'ObjectBox',
  floor:                       'Floor',
  google_sign_in:              'Google Sign-In',
  sign_in_with_apple:          'Sign in with Apple',
  revenue_cat:                 'RevenueCat',
  purchases_flutter:           'RevenueCat',
  geolocator:                  'geolocator',
  sensors_plus:                'sensors_plus',
  connectivity_plus:           'connectivity_plus',
  flutter_local_notifications: 'flutter_local_notifications',
  flutter_background_service:  'flutter_background_service',
};

interface DetectedProject {
  projectTypes: string[];
  analyzeCommands: string[];
  testCommand: string;
  packageManager: string;
  entryPoint: string;
}

export class ContextService {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  // ── Public API ──────────────────────────────────────────────

  hasContext(): boolean {
    // Check .maestro/context.json first (source of truth)
    try {
      const wp = this._getWorkspacePath();
      if (fs.existsSync(path.join(wp, '.maestro', 'context.json'))) return true;
    } catch { }
    // Fallback to workspaceState
    return !!this._context.workspaceState.get<ProjectContext>(CONTEXT_KEY);
  }

  getContext(): ProjectContext | undefined {
    // File is source of truth — always freshest
    try {
      const wp = this._getWorkspacePath();
      const filePath = path.join(wp, '.maestro', 'context.json');
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ProjectContext;
      }
    } catch { }
    return this._context.workspaceState.get<ProjectContext>(CONTEXT_KEY);
  }

  saveContext(ctx: ProjectContext): void {
    // Save to both workspaceState and file
    this._context.workspaceState.update(CONTEXT_KEY, ctx);
    try {
      const wp = this._getWorkspacePath();
      const maestroDir = path.join(wp, '.maestro');
      if (!fs.existsSync(maestroDir)) fs.mkdirSync(maestroDir, { recursive: true });
      fs.writeFileSync(
        path.join(maestroDir, 'context.json'),
        JSON.stringify(ctx, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('[Maestro] Failed to persist context.json:', err);
    }
  }

  clearContext(): void {
    this._context.workspaceState.update(CONTEXT_KEY, undefined);
    try {
      const wp = this._getWorkspacePath();
      const filePath = path.join(wp, '.maestro', 'context.json');
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { }
  }

  addCompletedFeature(title: string): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (!ctx.existingFeatures.includes(title)) {
      ctx.existingFeatures = [...ctx.existingFeatures, title];
      this.saveContext(ctx);
    }
  }

  /**
   * Auto-scan workspace — no user prompts, no confirmation.
   * Detects project type, analyze commands, test command, package manager, entry point.
   * Shows a warning notification only if git is missing.
   */
  async generateFromWorkspace(onProgress: (msg: string) => void): Promise<ProjectContext> {
    const workspacePath = this._getWorkspacePath();

    // Git check — silent warning if absent
    if (!fs.existsSync(path.join(workspacePath, '.git'))) {
      vscode.window.showWarningMessage(
        '⚠️ Maestro: Git not found in this project. Run git init to enable branch management.'
      );
    }

    // Language-agnostic detection (runs for all project types)
    onProgress('Detecting project type...');
    const detected = this._detectProjectTypes(workspacePath);

    // Defaults — overridden by Flutter-specific scan below if needed
    let appName = path.basename(workspacePath);
    let appPurpose = detected.projectTypes.join(' + ') + ' project';
    let techStack: string[] = detected.projectTypes;
    let architecture = detected.projectTypes.join(' + ') + ' project';
    let folderStructure = '';
    let conventions = 'Standard conventions';
    let existingFeatures: string[] = [];
    let keyFiles: Record<string, string> = {};

    if (detected.projectTypes.includes('Flutter')) {
      // Deep Flutter scan — keeps all existing quality
      onProgress('Scanning Flutter project...');
      const pubspec = this._parsePubspec(workspacePath);
      appName = pubspec.name || appName;
      appPurpose = pubspec.description || appPurpose;
      techStack = this._detectTechStack(pubspec);
      architecture = this._detectArchitecture(workspacePath, techStack);
      conventions = this._readConventions(workspacePath);
      existingFeatures = this._scanExistingFeatures(workspacePath);
      keyFiles = this._buildKeyFilesMap(workspacePath);
      const libPath = path.join(workspacePath, 'lib');
      folderStructure = fs.existsSync(libPath)
        ? this._buildFolderTree(libPath, 0, 4)
        : 'lib/ not found';
    } else {
      // Generic scan for non-Flutter projects
      onProgress('Scanning project structure...');
      folderStructure = this._buildFolderTree(workspacePath, 0, 3);
    }

    const context: ProjectContext = {
      appName,
      appPurpose,
      techStack,
      architecture,
      folderStructure,
      codingConventions: conventions,
      existingFeatures,
      keyFiles,
      rawContent: '',
      // Language-agnostic fields
      projectTypes: detected.projectTypes,
      analyzeCommands: detected.analyzeCommands,
      testCommand: detected.testCommand,
      packageManager: detected.packageManager,
      entryPoint: detected.entryPoint,
    };

    this.saveContext(context);
    onProgress('✅ Project context ready!');
    return context;
  }

  /**
   * Generate context from a PRD / MD file.
   */
  async generateFromFile(
    filePath: string,
    onProgress: (msg: string) => void
  ): Promise<ProjectContext> {
    const workspacePath = this._getWorkspacePath();

    onProgress('Reading PRD file...');
    const fileContent = this._readFileSafe(filePath);

    // Also detect project type from disk (workspace may already exist)
    const detected = this._detectProjectTypes(workspacePath);

    onProgress('Extracting project info...');
    const context: ProjectContext = {
      appName: this._extractAppName(fileContent, filePath),
      appPurpose: this._extractPurpose(fileContent),
      techStack: this._extractTechStackFromText(fileContent),
      architecture: this._extractArchitectureFromText(fileContent),
      folderStructure: 'New project — not yet scaffolded',
      codingConventions: this._extractConventionsFromText(fileContent),
      existingFeatures: [],
      keyFiles: {},
      rawContent: fileContent.slice(0, 3000),
      // Language-agnostic fields (from disk scan, may be empty for new projects)
      projectTypes: detected.projectTypes,
      analyzeCommands: detected.analyzeCommands,
      testCommand: detected.testCommand,
      packageManager: detected.packageManager,
      entryPoint: detected.entryPoint,
    };

    this.saveContext(context);
    onProgress('✅ Context ready from PRD!');
    return context;
  }

  async refreshContext(onProgress: (msg: string) => void): Promise<ProjectContext> {
    return this.generateFromWorkspace(onProgress);
  }

  // ── Language-agnostic Detection ─────────────────────────────

  /**
   * Detects all project types present in the workspace.
   * Supports: Flutter, Dart, TypeScript, JavaScript, Python.
   * Multiple types supported — monorepos / full-stack projects.
   */
  private _detectProjectTypes(workspacePath: string): DetectedProject {
    const projectTypes: string[] = [];
    const analyzeCommands: string[] = [];
    const testCommands: string[] = [];
    let packageManager = '';
    let entryPoint = '';

    // ── 1. Flutter / Dart ──────────────────────────────────────
    const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      const pubspecContent = fs.readFileSync(pubspecPath, 'utf-8');
      const isFlutter =
        pubspecContent.includes('\nflutter:') ||
        pubspecContent.includes('  flutter:') ||
        pubspecContent.includes('flutter_');
      if (isFlutter) {
        projectTypes.push('Flutter');
        analyzeCommands.push('flutter analyze');
        testCommands.push('flutter test');
      } else {
        projectTypes.push('Dart');
        analyzeCommands.push('dart analyze');
        testCommands.push('dart test');
      }
      if (!packageManager) packageManager = 'pub';
      if (!entryPoint && fs.existsSync(path.join(workspacePath, 'lib', 'main.dart'))) {
        entryPoint = 'lib/main.dart';
      }
    }

    // ── 2. TypeScript ──────────────────────────────────────────
    if (fs.existsSync(path.join(workspacePath, 'tsconfig.json'))) {
      projectTypes.push('TypeScript');
      analyzeCommands.push('npx tsc --noEmit');
      const pkgPath = path.join(workspacePath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (deps['vitest']) testCommands.push('npx vitest run');
          else if (deps['jest'] || deps['ts-jest']) testCommands.push('npx jest');
        } catch { }
      }
      for (const ep of ['src/index.ts', 'src/main.ts', 'index.ts', 'app.ts']) {
        if (fs.existsSync(path.join(workspacePath, ep))) { entryPoint = entryPoint || ep; break; }
      }
      if (!packageManager) packageManager = this._detectNodePackageManager(workspacePath);
    }

    // ── 3. JavaScript (only if no tsconfig) ───────────────────
    const hasPackageJson = fs.existsSync(path.join(workspacePath, 'package.json'));
    const hasTsConfig = fs.existsSync(path.join(workspacePath, 'tsconfig.json'));
    if (hasPackageJson && !hasTsConfig) {
      projectTypes.push('JavaScript');
      const hasEslint = [
        '.eslintrc', '.eslintrc.js', '.eslintrc.json',
        '.eslintrc.yaml', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs',
      ].some(f => fs.existsSync(path.join(workspacePath, f)));
      if (hasEslint) analyzeCommands.push('npx eslint . --ext .js,.jsx');
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(workspacePath, 'package.json'), 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['vitest']) testCommands.push('npx vitest run');
        else if (deps['jest']) testCommands.push('npx jest');
      } catch { }
      for (const ep of ['src/index.js', 'src/index.jsx', 'index.js', 'app.js', 'server.js']) {
        if (fs.existsSync(path.join(workspacePath, ep))) { entryPoint = entryPoint || ep; break; }
      }
      if (!packageManager) packageManager = this._detectNodePackageManager(workspacePath);
    }

    // ── 4. Python ──────────────────────────────────────────────
    const hasPyproject = fs.existsSync(path.join(workspacePath, 'pyproject.toml'));
    const hasRequirements = fs.existsSync(path.join(workspacePath, 'requirements.txt'));
    if (hasPyproject || hasRequirements) {
      projectTypes.push('Python');
      // Prefer ruff (modern) over pylint
      analyzeCommands.push(hasPyproject ? 'ruff check .' : 'pylint src/');
      testCommands.push('pytest');
      if (!packageManager) packageManager = 'pip';
      for (const ep of ['main.py', 'app.py', 'src/main.py', 'src/app.py']) {
        if (fs.existsSync(path.join(workspacePath, ep))) { entryPoint = entryPoint || ep; break; }
      }
    }

    return {
      projectTypes: projectTypes.length > 0 ? projectTypes : ['Unknown'],
      analyzeCommands,
      testCommand: testCommands[0] || '',
      packageManager: packageManager || 'unknown',
      entryPoint,
    };
  }

  private _detectNodePackageManager(workspacePath: string): string {
    if (fs.existsSync(path.join(workspacePath, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(workspacePath, 'yarn.lock'))) return 'yarn';
    return 'npm';
  }

  // ── Flutter Parsing Helpers (unchanged) ─────────────────────

  private _parsePubspec(workspacePath: string): Record<string, any> {
    const pubspecPath = path.join(workspacePath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return {};
    const content = fs.readFileSync(pubspecPath, 'utf-8');
    const result: Record<string, any> = {};
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    if (nameMatch) result.name = nameMatch[1].trim();
    const descMatch = content.match(/^description:\s*['"]?(.+?)['"]?$/m);
    if (descMatch) result.description = descMatch[1].trim();
    const depsSection = content.match(/^dependencies:([\s\S]*?)(?=^dev_dependencies:|^flutter:|$)/m);
    if (depsSection) {
      const depLines = depsSection[1].match(/^\s{2}(\w+):/gm) || [];
      result.dependencies = depLines.map((l: string) => l.trim().replace(':', ''));
    }
    return result;
  }

  private _detectTechStack(pubspec: Record<string, any>): string[] {
    const stack = ['Flutter', 'Dart'];
    const deps: string[] = pubspec.dependencies || [];
    for (const dep of deps) {
      if (FLUTTER_PACKAGE_MAP[dep]) {
        const label = FLUTTER_PACKAGE_MAP[dep];
        if (!stack.includes(label)) stack.push(label);
      }
    }
    return stack;
  }

  private _detectArchitecture(workspacePath: string, techStack: string[]): string {
    const libPath = path.join(workspacePath, 'lib');
    if (!fs.existsSync(libPath)) return 'Flutter project';
    const entries = fs.readdirSync(libPath);
    const hasFeatures = entries.includes('features');
    const hasCore = entries.includes('core');
    const hasBloc = techStack.some(t => t.toLowerCase().includes('bloc'));
    const hasRiverpod = techStack.some(t => t.toLowerCase().includes('riverpod'));
    const hasGetIt = techStack.some(t => t.toLowerCase().includes('get_it'));
    const hasInjectable = techStack.some(t => t.toLowerCase().includes('injectable'));
    let arch = '';
    if (hasFeatures && hasCore) arch = 'Clean Architecture with feature-first folder structure';
    else if (hasFeatures) arch = 'Feature-first folder structure';
    else arch = 'Flutter project';
    if (hasBloc) arch += ', BLoC state management';
    if (hasRiverpod) arch += ', Riverpod state management';
    if (hasGetIt && hasInjectable) arch += ', get_it + injectable DI';
    else if (hasGetIt) arch += ', get_it DI';
    return arch;
  }

  private _readConventions(workspacePath: string): string {
    const sections: string[] = [];
    for (const name of ['CLAUDE.md', '.windsurfrules', '.cursorrules']) {
      const p = path.join(workspacePath, name);
      if (fs.existsSync(p)) {
        sections.push(`--- ${name} ---\n${this._readFileSafe(p).slice(0, 4000)}`);
        break;
      }
    }
    const libPath = path.join(workspacePath, 'lib');
    if (fs.existsSync(libPath)) {
      const samples: Array<[string, string]> = [
        ['_bloc.dart',            'BLoC pattern'],
        ['_state.dart',           'State pattern'],
        ['_repository_impl.dart', 'Repository implementation'],
        ['_model.dart',           'Model/entity pattern'],
      ];
      for (const [keyword, label] of samples) {
        const file = this._findFileByKeyword(libPath, keyword);
        if (file) {
          const snippet = this._readFileSafe(file).slice(0, 1200);
          sections.push(`--- ${label} example (${path.basename(file)}) ---\n${snippet}`);
        }
      }
    }
    return sections.join('\n\n') || 'Standard Flutter conventions';
  }

  private _scanExistingFeatures(workspacePath: string): string[] {
    const featuresPath = path.join(workspacePath, 'lib', 'features');
    if (!fs.existsSync(featuresPath)) return [];
    try {
      return fs.readdirSync(featuresPath, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name.replace(/_/g, ' '));
    } catch { return []; }
  }

  private _buildKeyFilesMap(workspacePath: string): Record<string, string> {
    const map: Record<string, string> = {};
    const checks: [string, string][] = [
      ['lib/main.dart',                    'App entry point'],
      ['lib/injection.config.dart',        'DI configuration (generated)'],
      ['lib/core/di/injection.dart',       'DI setup'],
      ['lib/core/network/dio_client.dart', 'HTTP client'],
      ['lib/core/router/app_router.dart',  'Navigation/routing'],
      ['lib/core/theme/app_theme.dart',    'App theme'],
      ['CLAUDE.md',                        'Project conventions for AI'],
    ];
    for (const [relPath, purpose] of checks) {
      if (fs.existsSync(path.join(workspacePath, relPath))) map[relPath] = purpose;
    }
    return map;
  }

  // ── PRD Text Extraction ─────────────────────────────────────

  private _extractAppName(content: string, filePath: string): string {
    const match = content.match(/(?:app|project|name)[:\s]+([A-Za-z][A-Za-z0-9\s]{1,30})/i);
    if (match) return match[1].trim();
    return path.basename(filePath, path.extname(filePath));
  }

  private _extractPurpose(content: string): string {
    const lines = content.split('\n').filter(l => l.trim().length > 20);
    return lines.slice(0, 3).join(' ').slice(0, 200) || 'Flutter app';
  }

  private _extractTechStackFromText(content: string): string[] {
    const stack: string[] = [];
    const lower = content.toLowerCase();
    if (lower.includes('flutter')) stack.push('Flutter', 'Dart');
    else if (lower.includes('dart')) stack.push('Dart');
    if (lower.includes('typescript')) stack.push('TypeScript');
    if (lower.includes('javascript')) stack.push('JavaScript');
    if (lower.includes('python')) stack.push('Python');
    if (lower.includes('bloc')) stack.push('BLoC');
    if (lower.includes('riverpod')) stack.push('Riverpod');
    if (lower.includes('firebase')) stack.push('Firebase');
    if (lower.includes('supabase')) stack.push('Supabase');
    if (lower.includes('get_it')) stack.push('get_it DI');
    if (lower.includes('freezed')) stack.push('freezed');
    return stack.length > 0 ? stack : ['Unknown'];
  }

  private _extractArchitectureFromText(content: string): string {
    const lower = content.toLowerCase();
    if (lower.includes('clean architecture')) return 'Clean Architecture';
    if (lower.includes('feature-first') || lower.includes('feature first')) return 'Feature-first architecture';
    if (lower.includes('mvvm')) return 'MVVM';
    if (lower.includes('mvc')) return 'MVC';
    return 'Standard architecture';
  }

  private _extractConventionsFromText(content: string): string {
    return content.slice(0, 1000) || 'Standard conventions';
  }

  // ── Shared Utilities ────────────────────────────────────────

  private _getWorkspacePath(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error('No workspace folder is open. Please open your project.');
    }
    return folders[0].uri.fsPath;
  }

  private _buildFolderTree(dirPath: string, depth: number, maxDepth: number): string {
    if (depth > maxDepth) return '';
    const indent = '  '.repeat(depth);
    let result = '';
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'generated' || entry.name === 'node_modules') continue;
        result += `${indent}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}\n`;
        if (entry.isDirectory()) {
          result += this._buildFolderTree(path.join(dirPath, entry.name), depth + 1, maxDepth);
        }
      }
    } catch { }
    return result;
  }

  private _findFileByKeyword(dirPath: string, keyword: string, depth = 0): string | null {
    if (depth > 5) return null;
    try {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile() && entry.name.includes(keyword)) return fullPath;
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const found = this._findFileByKeyword(fullPath, keyword, depth + 1);
          if (found) return found;
        }
      }
    } catch { }
    return null;
  }

  private _readFileSafe(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.length > MAX_FILE_SIZE
        ? content.slice(0, MAX_FILE_SIZE) + '\n... [truncated]'
        : content;
    } catch {
      return '[could not read file]';
    }
  }
}