# Maestro

AI-powered developer workflow tool for VS Code — Jira for AI Agents.

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

---

**Note for maintainers:** before publishing, replace `YOUR_GITHUB_USERNAME` and
`YOUR_VSCODE_PUBLISHER_ID` in `package.json` with real values. The publisher id
is only needed if you plan to list this on the [VS Code Marketplace](https://marketplace.visualstudio.com/manage).
