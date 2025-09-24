# @pumped-fn/core-next

## 0.5.66

### Patch Changes

- [`1d3e85b`](https://github.com/pumped-fn/pumped-fn/commit/1d3e85ba3ea2aff508634d30aff3647be40784aa) Thanks [@lagz0ne](https://github.com/lagz0ne)! - expose executor reference to extension on pod resolve, so extension can extract the config from that

## 0.5.65

### Patch Changes

- [`4d87548`](https://github.com/pumped-fn/pumped-fn/commit/4d87548a3eaad1ad0cf5b90e96a078434900e5d9) Thanks [@lagz0ne](https://github.com/lagz0ne)! - - feat: changed plugin to extension, unified the API for both scope and plugin
  - feat: made scope and pod to be MetaContainer. As such, executors and flows can read meta from scope, that'll be the way to configure
  - chore: cleanup tests, reduce amount of test bloats
  - chore: removed placeholder, prepare and adapt

## 0.5.64

### Patch Changes

- [`d73cdd3`](https://github.com/pumped-fn/pumped-fn/commit/d73cdd3ef852d10e387daf76a36e68868346dd7a) Thanks [@lagz0ne](https://github.com/lagz0ne)! - fix: corrected pod behavior along with presets

## 0.5.63

### Patch Changes

- [`f5bab28`](https://github.com/pumped-fn/pumped-fn/commit/f5bab28ba2b1e7fdb42f5f3eef55f39666c7f557) Thanks [@lagz0ne](https://github.com/lagz0ne)! - improved execute api of flow

## 0.5.62

### Patch Changes

- [`272106d`](https://github.com/pumped-fn/pumped-fn/commit/272106ded793db0ab7777ce7a17113c8aca1068a) Thanks [@lagz0ne](https://github.com/lagz0ne)! - added llm docs

- [`e282097`](https://github.com/pumped-fn/pumped-fn/commit/e2820973ae51ade8441f1d22252b4efcc5875791) Thanks [@lagz0ne](https://github.com/lagz0ne)! - updated llm docs

## 0.5.61

### Patch Changes

- [`59751a4`](https://github.com/pumped-fn/pumped-fn/commit/59751a420f87269d058d1eb8f1a2ee0dd97e7a93) Thanks [@lagz0ne](https://github.com/lagz0ne)! - improve scope plugin spi

## 0.5.60

### Patch Changes

- [`4c5c608`](https://github.com/pumped-fn/pumped-fn/commit/4c5c608591e8774820f8fcd49eee0b9f367d054a) Thanks [@lagz0ne](https://github.com/lagz0ne)! - Improve QOL of the flow API

  - Added isOk and isKo to narrow result type
  - flow now has `flow.define` to define config, `flow.execute` to execute flow, `flow.plugin` to create plugin for flow
  - Added flow.md instruction in llm to instruct AI to use flow features

## 0.5.59

### Patch Changes

- [`f407114`](https://github.com/pumped-fn/pumped-fn/commit/f407114d49b269748debbcd91def73efcb2e2711) Thanks [@lagz0ne](https://github.com/lagz0ne)! - simplify the flow api for core-next
