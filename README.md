# @tscircuit/dependency-check

Script/GitHub Action to enforce dependency rules for internal packages in the TSCircuit ecosystem.

## Rules

This action enforces the following rules:

1. **For `internal_lib` package type (default):**

   - Internal packages should always be included as peer dependencies and/or devDependencies, not as regular dependencies.
   - Optionally, all peer dependencies must use "\*" as the version.

2. **For `bundled_lib` package type:**
   - No internal package should be in dependencies or peerDependencies.

A module is considered "internal" if:

- It has the prefix `@tscircuit/*`
- It has "circuit" anywhere in the package name
- It's in the provided list of additional internal modules

You can modify this repo's `INTERNAL_PACKAGE_LIST` in the `dependency-check.ts` file
to add internal packages to the list of internal packages.

## Usage

### Basic usage in your GitHub workflow:

```yaml
name: Dependency Check

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check-dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Check dependencies
        uses: tscircuit/dependency-check-action@v1
```

### With custom options:

```yaml
- name: Check dependencies
  uses: tscircuit/dependency-check-action@v1
  with:
    package_type: "bundled_lib"
    peer_deps_should_be_asterisk: "true"
    additional_internal_modules: "my-internal-lib,another-internal-lib"
```

## Options

| Option                         | Description                                                        | Default        |
| ------------------------------ | ------------------------------------------------------------------ | -------------- |
| `package_type`                 | Type of package, either `internal_lib` or `bundled_lib`            | `internal_lib` |
| `peer_deps_should_be_asterisk` | Force all peer dependencies to use an asterisk for the version     | `false`        |
| `additional_internal_modules`  | Comma-separated list of additional modules to consider as internal | `''`           |

## Publishing the package

1. Organize the files:

   ```
   src/
     index.ts  # Main script
   package.json
   tsconfig.json
   README.md
   ```

2. Build and publish:
   ```bash
   npm run build
   npm publish
   ```

## Implementation details

The action uses Bun to run the dependency check script (`@tscircuit/dependency-check`). Bun will automatically pull the latest version of the package, making it easy to update the rules across all repositories.

## Development

To add new features or parameters:

1. Update the TypeScript code in the `@tscircuit/dependency-check` package
2. Publish a new version
3. Repositories using the action will automatically use the latest version when they run GitHub workflows

This approach allows for easy updates and maintenance across your 200+ repositories.
