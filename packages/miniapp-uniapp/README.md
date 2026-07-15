# packages/miniapp-uniapp

> 本包基于 uni-app，目标为多端（微信小程序、App）兼容的客户端实现。尽量复用 `@chisha/core` 的纯逻辑以减少平台差异。

维护说明：注意平台 API 差异（如请求、导航），将平台特有逻辑封装在适配层，不要泄露到 `core`。
