# Task 3 实施报告：投递记录运行时消息与后台编排

## 本次完成内容

- 新增投递记录领域类型：
  - `ApplicationRecord`
  - `ApplicationSyncConfig`
  - `CreateApplicationRecordInput`
  - `UpdateApplicationRecordInput`
- 扩展运行时消息协议：
  - `GET_APPLICATION_RECORDS`
  - `SAVE_APPLICATION_RECORD`
  - `UPDATE_APPLICATION_RECORD`
  - `DELETE_APPLICATION_RECORD`
  - `GET_APPLICATION_SYNC_CONFIG`
  - `SAVE_APPLICATION_SYNC_CONFIG`
  - `SYNC_APPLICATIONS_NOW`
  - `CAPTURE_APPLICATION_FROM_PAGE`
- 在 background 中接入统一编排路径：
  - 保存/更新/删除记录
  - 读取与保存同步配置
  - 手动触发同步
  - 同步结果回写到本地记录
- 将 `CAPTURE_APPLICATION_FROM_PAGE` 先落成最小消息分发边界，当前仅返回明确的“尚未实现页面抓取”错误，不提前发明页面抓取实现。
- 增加应用记录服务与同步编排器最小骨架，支撑 Task 3 的消息层测试与后续 Task 4/5/6 接入。
- 将新增测试纳入 `npm test`。

## 关键实现决策

### 1. 页面抓取保持边界，不做提前实现

当前 `CAPTURE_APPLICATION_FROM_PAGE` 在 background 已有明确入口，但只返回：

- 已接入消息分发边界
- 尚未实现页面抓取

这样可以保证：

- Sidepanel / Popup 后续接线时有稳定消息名
- 不把 Task 4 的 DOM 抽取逻辑提前混入 Task 3
- 错误语义清晰，便于后续增量替换

### 2. 同步失败不阻塞本地保存

本地保存后再执行同步编排；若远端同步失败：

- 本地记录仍保留
- 飞书单条状态可回写为 `error`
- 返回值中保留 `sync.triggered` 与错误信息

### 3. 兼容现有备份同步

`StorageService.getBackupData()` 与 `replaceBusinessData()` 只在相关键存在时才处理投递记录数据，避免把“缺省字段”和“明确为空”混为一谈，修复了 WebDAV 远端下载测试中的冲突回归。

## 新增/修改文件

- `src/shared/types.ts`
- `src/shared/storage.ts`
- `src/background/index.ts`
- `src/services/application-tracking/recordService.ts`
- `src/services/application-tracking/syncCoordinator.ts`
- `src/services/application-tracking/application-tracking.test.ts`
- `package.json`

## 验证结果

已执行：

- `npm test`
- `npm run build`
- `npm run lint`

结果：

- 测试通过
- 构建通过
- lint 无 error；当前仅剩仓库既有的 `scripts/package-extension.js` 未使用函数 warning，与本次改动无关

## 后续衔接建议

- Task 4 直接替换 `CAPTURE_APPLICATION_FROM_PAGE` 的占位返回，接入 content script 页面草稿提取即可。
- Task 5/6 可直接复用本次落地的消息协议与同步配置读写接口。
