# Maestro

AI-powered developer workflow tool for VS Code — Jira for AI Agents.

## Installation

This extension is not published on the VS Code Marketplace. Download the
latest `.vsix` from the [Releases page](https://github.com/bhuppi295/maestro/releases),
then install it:

```bash
code --install-extension maestro-x.y.z.vsix
```

Or in VS Code: Extensions view → `...` menu → **Install from VSIX...**

## Development

```bash
npm install
cd webview-ui && npm install && cd ..
npm run build
```

Press `F5` in VS Code to launch the extension in a new Extension Development Host window.

## Packaging

```bash
npm run package
```

This produces a `.vsix` file you can install locally via `code --install-extension maestro-*.vsix`.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
