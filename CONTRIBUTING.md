# Contributing to Sedimind

Thank you for your interest in contributing! This document explains how to contribute code to the Sedimind plugin.

---

## Development environment

### Prerequisites

- Node.js >= 18.x
- npm >= 9.x
- Obsidian >= 1.5.0

### Set up the dev environment

```bash
# Clone the repository
git clone https://github.com/Xylocheir/Sedimind.git
cd Sedimind

# Install dependencies
npm install

# Dev mode (auto-recompile on change)
npm run dev
```

### Test the plugin

1. In Obsidian, create a test Vault.
2. Inside the Vault, create a `Sedimind` folder under `.obsidian/plugins/`.
3. Symlink the project directory into the plugin folder:

```bash
# macOS / Linux
ln -s /path/to/your/project/Sedimind /path/to/vault/.obsidian/plugins/Sedimind

# Windows (PowerShell)
New-Item -ItemType SymbolicLink -Path "C:\path\to\vault\.obsidian\plugins\Sedimind" -Target "C:\path\to\your\project\Sedimind"
```

4. Restart Obsidian → Settings → Community plugins → enable "Sedimind".

---

## Code conventions

### Naming

- **Files**: PascalCase (e.g. `ChatView.ts`)
- **Tool files**: PascalCase + `Tool` suffix (e.g. `CreateNoteTool.ts`)
- **TypeScript interfaces**: PascalCase (e.g. `LLMProvider`)
- **Variables**: camelCase
- **Functions**: camelCase, verb-led
- **CSS classes**: kebab-case, `sedimind-` prefix

### Comments

- **Public APIs**: JSDoc format with `@param` and `@returns`
- **Non-obvious algorithms**: one-line comment stating intent
- **HACK / TODO / FIXME**: note the reason and the expected fix version

### TypeScript config

- `noImplicitAny`: true
- `strictNullChecks`: true
- Avoid the `any` type unless strongly justified

### Error handling

- Every async call must have `.catch()` or `try/catch`
- `fetch()` responses must be checked with `response.ok` first
- File operations must be wrapped in `try/catch`

---

## Commit conventions

### Commit message format

```
type(scope): description
```

**Allowed `type` values**:
- `feat` - new feature
- `fix` - bug fix
- `refactor` - refactor (no behavior change)
- `docs` - documentation update
- `style` - formatting only
- `test` - test-related
- `chore` - build / tooling

**Examples**:
```
feat(chat): add message-area settings panel
fix(menu): fix first-open position of mention menu
refactor(llm): refactor Provider interface
docs(readme): update install instructions
```

### Pull Request conventions

1. **One PR, one thing**: never mix feature work, refactors, and formatting.
2. **Describe clearly**: purpose, implementation, how it was tested.
3. **Build passes**: ensure `npm run build` has no errors.
4. **Update docs**: update README / CHANGELOG when relevant.

---

## Feature development flow

### 1. Propose

Open a GitHub Issue describing the feature or bug:
- Background / motivation
- Expected behavior
- Actual behavior (for bugs)
- Reproduction steps

### 2. Discuss

Discuss the implementation approach with the maintainers and confirm technical details.

### 3. Implement

- Create a feature branch
- Implement the feature
- Add necessary comments
- Test the feature

### 4. Submit PR

- Push to the feature branch
- Open a Pull Request
- Wait for review

---

## Bug fix flow

### 1. Report

Open a GitHub Issue with:
- Obsidian version
- Plugin version
- Reproduction steps
- Expected behavior
- Actual behavior
- Screenshots (if any)

### 2. Locate

- Reproduce following the steps
- Inspect the relevant code
- Analyze the root cause

### 3. Fix & verify

- Implement the fix
- Verify the result
- Ensure no regressions

### 4. Submit PR

- Push the fix
- Describe the fix and verification method in the PR

---

## Documentation contributions

### Update docs

- `README.md`: project intro, install, usage (English, primary)
- `README_zh.md`: Chinese version
- `CHANGELOG.md`: version change log
- `UsageGuide.md`: detailed usage (internal)
- `rules.md`: dev rules (internal)
- `Features.md`: feature stats (internal)

### Doc conventions

- Use Markdown
- Clear, consistent hierarchy
- Keep formatting uniform

---

## Testing

### Manual testing

Every functional change requires manual testing:

1. **Basic**: core features work
2. **Boundary**: extreme inputs
3. **Regression**: no impact on other features
4. **Compatibility**: across Obsidian versions

### Test checklist

- [ ] Plugin installs and enables correctly
- [ ] Settings panel configures correctly
- [ ] Chat works (send / receive / streaming)
- [ ] Tool calls work (create / edit / search notes, etc.)
- [ ] Mention system works (@ menu, drag-to-reference)
- [ ] History panel works (load / delete)
- [ ] Settings panel works (open / close / scroll)
- [ ] AI assistant modal works (open / drag / preview / confirm)
- [ ] Selection toolbar works (popup / actions)
- [ ] Language switching works
- [ ] Model switching works

---

## Contact

Questions or suggestions are welcome via:

- GitHub Issues: https://github.com/Xylocheir/Sedimind/issues
- Discussions: https://github.com/Xylocheir/Sedimind/discussions

Thanks for contributing!
