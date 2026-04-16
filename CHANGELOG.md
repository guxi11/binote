# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-04-16

### Breaking

- Renamed package from `roammem` to `backnote`
- Renamed data directory `.roam/` → `.backnote/`
- Renamed slash command prefix `/roammem:*` → `/backnote:*`
- Renamed `/roammem:roam` → `/backnote:mode`

### Migration

```bash
npm uninstall -g roammem
npm install -g backnote
mv .roam .backnote   # in each project that used roammem
```

## [0.1.5] - 2026-04-09

### Features

- Improve performance

## [0.1.4] - 2026-04-09

### Features

- Add version command for CLI tool

### Documentation

- Add changelog and use changenotes to manage it

[0.2.0]: https://github.com/Guxi11/backnote/compare/v0.1.5...v0.2.0
[0.1.5]: https://github.com/Guxi11/backnote/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/Guxi11/backnote/releases/tag/v0.1.4
