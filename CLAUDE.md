# UNITED — Claude Instructions

## Git Workflow

**Never commit directly to `master`.** All changes go through a branch + pull request.

### Branch + PR Protocol

1. **Create a branch** from `master` before making any changes:
   ```
   git checkout -b type/short-description
   ```
2. **Make commits** on the branch using conventional commit messages (see below)
3. **Push the branch** and create a PR:
   ```
   git push -u origin type/short-description
   gh pr create --title "..." --body "..."
   ```
4. **Merge via PR** — squash merge for single-feature branches, merge commit for multi-commit branches that tell a story

### Branch Naming

Format: `type/short-description` (lowercase, hyphens)

| Type | Use |
|------|-----|
| `feat/` | New functionality |
| `fix/` | Bug fixes |
| `docs/` | Documentation changes |
| `refactor/` | Code restructuring without behavior change |
| `chore/` | Build, CI, dependency updates |
| `test/` | Adding or fixing tests |

Examples: `feat/auth-system`, `fix/jwt-expiry`, `docs/identity-architecture`

### Commit Messages

Format: `type(scope): description`

```
feat(server/auth): implement challenge-response verification
fix(client/ipc): handle disconnect during key exchange
docs(planning): align research docs with identity architecture
test(integration): add auth end-to-end test
```

- Use imperative mood ("add", not "added")
- Keep the first line under 72 characters
- Add a body for non-obvious changes

### Rules

- No force-pushes to `master`
- `master` must always be buildable
- Delete branches after merge
