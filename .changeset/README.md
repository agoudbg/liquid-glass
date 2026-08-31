# Changesets

Add a changeset for every user-facing package change:

```bash
pnpm changeset
```

Select the affected package and the appropriate semver bump. The four public
packages are configured as a fixed group, so they are versioned and published
together.

The release workflow creates or updates a `Version Packages` pull request on
`main`. Merging that pull request runs the release gate, publishes the packages
to npm, and creates the GitHub release.

For the initial prerelease line, enter alpha mode once with:

```bash
pnpm changeset pre enter alpha
```

Then add a major changeset for the four packages. The first generated release
will be `1.0.0-alpha.0` and subsequent releases will increment the alpha number.
