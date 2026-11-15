---
name: add-python-dependencies
description: 'Add or update Python dependencies for esobold packaging and release pipelines. Use when adding, removing, or changing a package across requirements, conda env files, PyInstaller commands, and GitHub workflows. Keywords: dependency, dependancy, pip install, pyinstaller --collect-all, tree_sitter_language_pack, tomllib.'
argument-hint: '<pip-package> [pyinstaller-module]'
---

# Add Python Dependencies

Use this skill when you need to add, remove, or rename a Python dependency and keep all build/release paths consistent.

## Scope Guardrails

- Exclude `esoExtras/opticlaw/**` from this workflow.
- Include hidden paths in searches so `.github/workflows/**` is scanned.

## Canonical Search Terms

- Use `tree_sitter_language_pack` as the anchor term to find all dependency surfaces.
- Use both the pip package name and import/module name when validating a new dependency.

```bash
rg -n --hidden --glob '!.git/**' --glob '!esoExtras/opticlaw/**' "tree_sitter_language_pack"
```

```bash
rg -n --hidden --glob '!.git/**' --glob '!esoExtras/opticlaw/**' "<pip-package>|<pyinstaller-module>"
```

## Files To Update

Update these files whenever a dependency is added:

1. `requirements.txt`
2. `kcpp_src/packaging/environments/environment.yaml`
3. `kcpp_src/packaging/environments/environment-nocuda.yaml`
4. `koboldcpp.sh`
5. `make_pyinstaller.bat`
6. `make_pyinstaller_cuda.bat`
7. `make_pyinstaller_cuda_oldpc.bat`
8. `make_pyinstaller.sh`
9. `.github/workflows/kcpp-build-release-macos.yaml`
10. `.github/workflows/kcpp-build-release-win.yaml`
11. `.github/workflows/kcpp-build-release-win-oldpc.yaml`
12. `.github/workflows/test-unofficial-arm64.yaml`
13. `esoExtras/readme.md`

## What To Change In Each Surface

1. Dependency manifests:
   - Add `<pip-package>` to `requirements.txt`.
   - Add `<pip-package>` to the `pip:` section in both environment YAML files.

2. PyInstaller command lists:
   - Add `--collect-all <pyinstaller-module>` in each listed shell/batch script.
   - Keep placement consistent with neighboring dependency flags.

3. GitHub workflows:
   - Add `<pip-package>` to workflow `pip install ...` lines.
   - Add `--collect-all <pyinstaller-module>` where workflow PyInstaller command lines maintain explicit collect lists.

4. Dependency maintenance note:
   - Update the dependency list in `esoExtras/readme.md`.

## Name Mapping Rules

- `pip install` and requirements typically use package names (often hyphenated).
- PyInstaller `--collect-all` uses import/module names (often underscored).
- Validate both forms when package and import names differ.

Examples:

- `python-ulid` -> `ulid`
- `pyyaml` -> `yaml`
- `json-repair` -> `json_repair`
- `partial-json-parser` -> `partial_json_parser`
- `tree-sitter-language-pack` -> `tree_sitter_language_pack`

## Validation Checklist

Run coverage checks after edits:

```bash
rg -l --hidden --glob '!.git/**' --glob '!esoExtras/opticlaw/**' "tree_sitter_language_pack"
```

```bash
for f in $(rg -l --hidden --glob '!.git/**' --glob '!esoExtras/opticlaw/**' "tree_sitter_language_pack"); do
  rg -q "<pip-package>|<pyinstaller-module>" "$f" || echo "MISSING: $f"
done
```

If the loop prints nothing, dependency propagation is complete for this workflow.

## Common Pitfalls

- Missing hidden files by forgetting `--hidden` (this skips `.github/workflows/**`).
- Updating only pip manifests but not PyInstaller `--collect-all` lists.
- Using only the pip package name when PyInstaller needs a different module name.