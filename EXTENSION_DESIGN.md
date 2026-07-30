# 秋招网申助手设计文档

## 文档说明

本文记录当前工作区中实际生效的产品设计、数据结构、填写规则、AI 行为、窗口交互、消息协议和兼容边界。实现发生变化时，应同步更新本文，避免仅依赖历史计划或构建产物判断功能。

当前产品是一个基于 Manifest V3、React、TypeScript 和 Vite 的浏览器扩展，目标是减少校招与实习网申中的重复录入。扩展将用户资料保存在浏览器本地，并提供三种互补的填写方式：

1. 确定性一键填充：根据字段标签和属性识别字段，再从已保存资料中取值。
2. AI 框选补填：用户选择页面区域，AI 结合已有资料为区域内的空白字段生成值映射。
3. 信息浮窗点选填写：用户先点击网页输入框，再点击浮窗中的资料字段；无法写入时自动复制。

## 产品入口

### 扩展弹窗

点击浏览器工具栏中的扩展图标后打开 Popup。当前提供：

- 打开信息浮窗
- 一键填充表单
- AI 框选补填
- 设置个人信息

Popup 同时显示：

- 姓名、邮箱、手机号
- 当前页面检测到的字段数量
- 教育经历数量
- 工作经历数量

Popup 向页面发送消息失败，且错误属于“接收端不存在”时，会主动注入 `content.js`，等待短暂时间后重试。

### 个人信息设置

设置页包含：

- 基本信息
- 教育经历
- 实习与项目
- 添加自定义信息
- 简历上传
- AI 设置
- 数据与同步

设置页负责信息编辑、简历解析、AI 服务配置、完整 JSON 备份与 WebDAV 同步。自定义信息页默认为空，用户可添加任意数量的“信息名称 + 信息内容”记录。

### 设置页操作栏

所有设置标签页使用统一的底部操作栏：

- 操作栏位于白色内容面板内部最底部。
- 操作栏与表单内容之间使用一条轻分隔线。
- `保存设置`始终位于操作栏最右侧。
- 基本信息、教育经历、实习与项目、添加自定义信息、简历上传保存完整用户信息。
- AI 设置保存独立的 LLM 配置，但按钮位置与其他标签页一致。
- `测试连接`属于即时验证操作，保留在 AI 表单对应配置项下方。
- 窄屏下保存按钮占满内容宽度，仍位于页面内容最底部。
- 设置页不提供“导入测试数据”入口。

### 信息浮窗

“打开信息浮窗”通过 `chrome.windows.create()` 创建独立扩展窗口：

- 窗口类型为 `popup`
- 默认宽度约 420px
- 高度根据当前浏览器窗口调整
- 尽量靠当前浏览器窗口右侧显示
- URL 中携带原浏览器窗口 ID

浮窗展示：

- 教育经历
- 实习经历
- 项目经历
- 自定义信息

自定义信息提供独立的“填入”和“复制”操作；填入失败时仍自动降级为复制。浮窗不展示个人敏感信息、技能、证书或简历文件。

### 置顶小窗

信息浮窗右上角提供“置顶小窗”按钮，使用 Document Picture-in-Picture API 尝试创建真正始终置顶的小窗。

规则：

- 必须由用户在信息浮窗中直接点击按钮触发。
- 浏览器不允许窗口加载完成后自动进入 Document PiP。
- 置顶小窗默认请求约 420 × 760 的尺寸，最终尺寸由浏览器决定。
- 网站或扩展无法指定 PiP 小窗的屏幕位置。
- 进入 PiP 后，React 根节点会移动到 PiP 文档。
- 当前样式表会复制到 PiP 文档。
- 关闭 PiP 后，React 根节点移回原信息浮窗。
- 如果 API 不可用或调用失败，显示：

```text
当前浏览器未开放文档画中画，无法使用置顶小窗
```

普通扩展窗口无法通过 `chrome.windows` 设置系统级始终置顶，因此 Document PiP 是当前唯一的真正置顶实现。

## 数据模型

### 用户资料

```ts
interface UserProfile {
  personal: PersonalInfo;
  education: EducationInfo[];
  experience: ExperienceInfo[];
  projects: ProjectInfo[];
  customInformation: CustomInformation[];
  skills: string[];
  certifications: CertificationInfo[];
  resume?: ResumeInfo;
}
```

### 个人信息

```ts
interface PersonalInfo {
  name: string;
  gender: string;
  birthDate: string;
  phone: string;
  email: string;
  wechat?: string;
  idCard?: string;
  politicalStatus?: string;
  ethnicity?: string;
  hometown?: string;
  currentAddress?: string;
  selfEvaluation?: string;
}
```

自我评价在设置页使用自动增高文本框：

- 初始宽度、边框、圆角、内边距与身份证号输入框一致。
- 初始高度约 39px，相当于单行输入框。
- 初始显示一行。
- 内容超过一行时，按照 `scrollHeight` 自动增高。
- 不显示内部纵向滚动条。
- 不允许手动拖动改变尺寸。

### 教育经历

```ts
interface EducationInfo {
  id: string;
  school: string;
  college?: string;
  educationType?: string;
  major: string;
  degree: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  ranking?: string;
}
```

教育经历不再包含“在校荣誉 / 主修课程”字段。

学历类型支持：

- 海外及港澳台
- 统招全日制
- 统招非全日制
- 自考
- 其他

旧资料缺少 `educationType` 时，读取阶段默认补为“统招全日制”。

### 实习经历

```ts
interface ExperienceInfo {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string;
  achievements?: string;
}
```

### 项目经历

```ts
interface ProjectInfo {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  achievements: string;
  technologies?: string;
}
```

### 自定义信息

```ts
interface CustomInformation {
  id: string;
  name: string;
  content: string;
}
```

旧数据缺少 `customInformation` 时，读取阶段归一化为空数组。

### 本地存储

资料保存在 `chrome.storage.local`：

| Key | 内容 |
|---|---|
| `userProfile` | 完整用户资料 |
| `llmConfig` | AI 服务商、API Key、地址、模型及参数 |
| `settings` | 通用设置预留对象 |
| `webdavConfig` | WebDAV 开关、服务器地址、用户名和密码，仅保存在本机 |
| `syncMetadata` | ETag、最后同步 hash、时间、状态与非敏感冲突摘要 |
| `fieldMatch_<domain>` | 某域名的 AI 字段分类结果 |

注意：

- 身份证号、API Key、简历 Base64 等均保存在浏览器本地。
- 当前未实现字段级加密。
- 卸载扩展或清除扩展数据会删除资料。

## JSON 备份协议

当前唯一协议为 `BackupDocumentV1`，根节点固定包含：

- `schemaVersion: 1`
- `exportedAt` ISO 8601 时间
- `source.extensionVersion`
- `data.userProfile`
- `data.llmConfig`
- `data.settings`

业务项显式允许 `null`，导入时表示删除对应本地键。导入上限为 20 MiB；后台会重新执行 JSON、版本和深层字段类型校验，全部通过后才整体替换业务数据。用户界面的预检结果不作为最终写入依据。

备份完整保留 `resume.fileData` 和 `llmConfig.apiKey`，为不加密的明文 JSON。它不包含 `fieldMatch_*`、`webdavConfig`、WebDAV 密码、ETag、hash、同步状态或错误。摘要只显示版本、时间和“是否包含”，不展示 API Key、身份证号、简历正文或 Base64。

同步 hash 只覆盖规范化后的 `document.data`，不包含导出时间、来源版本或 schema 元数据。

## WebDAV 双向同步

WebDAV 仅支持用户填写的 HTTPS 服务器地址和 Basic Auth。插件自动规范化末尾斜杠；连接测试和首次上传都会使用 `MKCOL` 创建或确认 `job-application-helper/`，并在其中保存 `job-application-helper.json`。目录已存在时服务端通常返回 405，按成功处理。读取旧版完整 JSON 文件 URL 时会自动迁移为其所在服务器目录。远端文件与手动导出使用同一份明文 V1 协议，凭据只存在本机。

请求规则：

- `GET` 读取远端正文和 ETag；404 表示尚未创建。
- 首次创建使用 `PUT` 与 `If-None-Match: *`。
- 更新使用本次 GET 返回的精确 ETag 和 `If-Match`。
- 412 进入冲突，不进行无条件重试。
- 已有远端不提供 ETag 时禁止安全覆盖，并提示更换支持 ETag 的服务。

同步以 `lastSyncedHash` 为基线：同内容只更新元数据；只有本地变化则条件上传；只有远端变化则校验后整体应用；双方变化或无基线且内容不同则进入冲突。冲突由用户选择整份本地或整份远端，不做字段级合并。选择本地前会重新 GET 并按最新 ETag 上传；选择远端前会重新 GET、重新校验。

触发仅包括：

- 启用后保存个人资料
- 解析并保存简历
- 保存 AI 配置
- 导入 JSON
- “立即同步”和冲突处理；常驻界面不提供强制上传/下载按钮，只有检测到冲突时才显示“使用本地”或“使用远端”

保存 WebDAV 配置本身不上传；没有启动同步、设置页打开同步或周期同步。扩展内部请求通过单例 Promise 队列串行化，跨设备并发由 ETag 条件写入保护。同步失败只更新同步状态，不回滚已成功的本地保存。

## 字段检测规则

### 扫描范围

内容脚本扫描：

```css
input:not([type="hidden"]):not([type="submit"]):not([type="button"]),
textarea,
select
```

以下字段会跳过：

- 不可见元素
- disabled 元素
- 普通 readonly 元素

字节风格的只读 combobox 是例外，因为其值需要通过下拉选择，而不是直接输入。

### 字段信息来源

匹配器综合读取：

- `name`
- `id`
- `placeholder`
- `autocomplete`
- 对应 `<label>`
- 父级 label
- 相邻 label 或 span
- `data-form-field-id`
- `data-form-field-name`
- `data-form-field-i18n-name`
- 模块上下文文本

### 匹配方式

字段识别按以下优先级执行：

1. 输入类型直接识别，如 `email`、`tel`。
2. 精确特判，如 `education_type`、学历类型、教育起止时间、工作起止时间。
3. 中英文关键词匹配。
4. 字符串相似度匹配。
5. 未识别字段进入 AI 字段分类。

规则匹配置信度低于阈值的字段不会进入确定性字段列表。

### 支持的确定性字段类型

- 姓名
- 性别
- 出生日期
- 手机号
- 邮箱
- 微信号
- 身份证号
- 自我评价
- 学校
- 学院
- 学历类型
- 专业
- 学历
- GPA
- 教育开始时间
- 教育结束时间
- 公司
- 岗位
- 工作开始时间
- 工作结束时间
- 描述
- 技能
- 简历文件

当前个人资料中的政治面貌、民族、籍贯和现居地未配置为确定性 `FieldType`，更适合通过 AI 框选补填。

## 一键填充规则

### 基本流程

1. Popup 向当前标签页发送 `FILL_FORM`。
2. 内容脚本读取本地用户资料。
3. 根据资料条数补足教育和实习动态行。
4. 重新检测页面字段。
5. 对未识别字段调用 AI 分类。
6. 按字段类型和出现顺序取资料值。
7. 根据控件类型写入。
8. 不点击“完成”、提交或下一步按钮。

### 多条经历映射

同一字段类型按页面出现顺序映射资料数组：

```text
第 1 个 school  -> education[0].school
第 2 个 school  -> education[1].school
第 1 个 company -> experience[0].company
第 2 个 company -> experience[1].company
```

资料顺序直接影响填写结果。设置页中的排序功能用于调整这一顺序。

### 动态行补足

教育经历：

- 定位包含“教育经历”的表单模块。
- 统计已有教育条目。
- 如果条目少于资料数量，持续点击文本严格等于“添加”的按钮。
- 每次添加后等待页面渲染。

实习经历：

- 如果资料中存在实习经历，尝试取消“没有实习经历”状态。
- 按资料数量补足条目。

该逻辑针对包含 `applyFormModuleWrapper` 类名和中文模块标题的页面做了专用增强。

### 日期规则

对同一“起止时间”容器：

- 通过横向位置区分左侧开始时间和右侧结束时间。
- 通过模块上下文区分教育日期与实习日期。
- 自动纠正资料中倒置的开始和结束时间。
- 先填结束时间，再填开始时间。

先填结束时间用于减少页面因“开始时间晚于结束时间”而回滚字段的情况。

### 学院规则

优先使用资料中的 `college`。如果缺失，当前只对内置测试学校和专业做有限推断，不提供通用学院推理。

### 学历类型规则

`education_type`、学历类型、学习形式、培养方式会优先识别为 `educationType`，避免被通用 `education` 关键词误识别为学历或学校。

资料缺失时默认值为“统招全日制”。

## 控件写入策略

### 普通 input 和 textarea

写入时：

1. 调用原生 `value` setter。
2. 重置 React `_valueTracker`。
3. 触发 `input`。
4. 触发 `change`。
5. 触发 `blur`。
6. 触发键盘相关事件。
7. 尝试调用元素上的 React `onChange`。

这样可以覆盖部分 React、Vue、Angular 和原生表单。

### 原生 select

按以下方式匹配选项：

1. option value 完全相等
2. option text 完全相等
3. option text 与目标值存在包含关系

### 字节自定义下拉

对 `.ud__select`：

1. 滚动到选择器。
2. 点击选择器。
3. 等待下拉动画。
4. 找到当前活动且未隐藏的 dropdown。
5. 在活动 dropdown 中查找目标文本。
6. 触发 mouse down、mouse up 和 click。
7. 尝试调用选项 React `onClick` 作为兜底。

该适配不代表所有第三方下拉组件都能工作。

### 写入验证

信息浮窗的单字段写入会在写入后验证：

- 普通输入框的 `value`
- 原生 select 的 value 或选中文本
- 自定义下拉的已选文本

一键填充当前不对每个字段逐项做同等级别的最终验证。

## AI 功能

### AI 服务配置

支持：

- DeepSeek
- Qwen
- GLM
- MiniMax
- MiMo
- Kimi
- OpenAI
- Claude
- 自定义 OpenAI 兼容服务

OpenAI 兼容接口调用：

```text
{baseUrl}/chat/completions
```

Claude 调用：

```text
{baseUrl}/messages
```

AI 设置页支持保存配置和测试连接。

### 简历解析

支持上传：

- PDF
- DOC
- DOCX
- Markdown
- TXT
- JSON

处理方式：

| 格式 | 文本提取 | 结构化 |
|---|---|---|
| JSON | Base64 解码 | 专用 JSON 映射 |
| PDF | pdfjs-dist | AI 或正则 |
| DOC/DOCX | Mammoth | AI 或正则 |
| Markdown | Markdown 转文本 | AI 或正则 |
| TXT | 文本解码 | AI 或正则 |

限制：

- 传统二进制 `.doc` 不保证可解析。
- 扫描 PDF 没有 OCR。
- PDF Worker 依赖外部 CDN。
- 无 AI 时的正则解析能力有限。

### 未识别字段分类

确定性规则无法识别的字段会发送给 AI，字段信息包括：

- name
- id
- placeholder
- label
- type

AI 只能从预定义字段类型中选择，无法判断时返回 `unknown`。

结果按域名缓存在：

```text
fieldMatch_<hostname>
```

当前缓存以字段索引为主，页面结构变化后可能复用陈旧映射。

### 开放题生成

内容脚本检测开放性问题，并在字段旁注入“AI 生成”按钮。

候选包括：

- textarea
- 较长文本输入
- 标签命中“为什么、请描述、自我介绍、职业规划、优势、挑战、未来计划”等语义

AI 根据用户资料、问题文本、页面上下文和字数限制生成回答。

### AI 框选补填

用户从 Popup 点击“AI 框选补填”后进入区域选择模式。

支持两种选择方式：

1. 鼠标悬停后单击自动识别的表单模块。
2. 按住鼠标左键拖出自定义矩形区域。

操作规则：

- 按 `Esc` 取消。
- 自动模块优先选择包含输入控件的最小表单模块。
- 拖框模式收集与矩形相交的字段。
- 只处理可见、启用且当前为空的字段。
- 排除 hidden、file、checkbox。

发送给 AI 的字段信息：

- index
- rowIndex
- name
- label
- 控件类型
- 可选值
- 局部上下文
- 域名
- 模块类型

AI 返回：

```json
{
  "字段索引": "填写值"
}
```

后台校验：

- 字段索引必须存在于请求中。
- 值必须是字符串。
- 空值忽略。
- 有候选选项时，返回值必须与候选选项完全一致。

### AI 补填终止

每次 AI 区域补填生成唯一 `requestId`：

1. 页面显示 AI 匹配进度和“终止”按钮。
2. 点击终止后发送 `CANCEL_AI_FILL`。
3. 后台找到对应 `AbortController`。
4. 调用 `abort()` 中断 fetch。
5. 页面阻止迟到结果继续写入。

终止只覆盖 AI 区域补填，不覆盖简历解析、开放题生成或字段分类。

## 信息浮窗点选填写

### 展示字段

教育经历：

- 学校
- 学院
- 学历类型
- 专业
- 学历
- 入学时间
- 毕业时间
- GPA / 成绩
- 排名

实习经历：

- 公司 / 机构
- 岗位
- 开始时间
- 结束时间
- 工作内容
- 成果

项目经历：

- 项目名称
- 角色
- 开始时间
- 结束时间
- 项目描述
- 成果
- 技术栈

空字段显示“未填写”并禁用点击。

### 自动写入流程

1. 用户点击网页中的目标输入框。
2. 内容脚本通过捕获阶段 `focusin` 保存最后聚焦的控件引用。
3. 用户点击信息浮窗中的字段。
4. 浮窗使用 URL 中记录的原浏览器窗口 ID，查询该窗口的活动标签页。
5. 浮窗向后台发送 `WRITE_FOCUSED_FIELD`。
6. 后台检查标签页和受限 URL。
7. 后台向目标标签页发送 `APPLY_FOCUSED_FIELD`。
8. 内容脚本调用 `fillFocusedControl()`。
9. 写入后验证控件值。
10. 浮窗显示写入结果。

最后聚焦控件只保存在内容脚本内存，不写入 storage。

### 可写控件

- 文本型 input
- textarea
- 原生 select
- 已适配的 `.ud__select` combobox

排除：

- hidden
- file
- button
- submit
- reset
- checkbox
- radio
- disabled
- 普通 readonly

### 复制兜底

以下情况自动复制字段值：

- 没有活动标签页
- 页面没有内容脚本
- 用户未先点击网页输入框
- 输入框被页面重新渲染替换
- 输入框不可写
- 页面拒绝目标值
- 浏览器限制页面

复制使用 `navigator.clipboard.writeText()`。

如果复制也失败，浮窗显示完整只读文本，用户可手动选择复制。

### 受限页面

后台明确拒绝写入：

- `chrome://`
- `edge://`
- `about://`
- 扩展页面
- Chrome Web Store
- Edge Add-ons

## 消息协议

### UI 到后台

| 消息 | 用途 |
|---|---|
| `GET_USER_PROFILE` | 读取用户资料 |
| `SAVE_USER_PROFILE` | 保存用户资料 |
| `PARSE_RESUME` | 解析并保存简历 |
| `GET_RESUME_DATA` | 读取简历文件信息 |
| `GET_LLM_CONFIG` | 读取 AI 配置 |
| `SAVE_LLM_CONFIG` | 保存 AI 配置 |
| `TEST_LLM_CONNECTION` | 测试 AI 服务 |
| `GENERATE_ANSWER` | 生成开放题回答 |
| `MATCH_FIELDS_LLM` | AI 字段分类 |
| `AI_FILL_SECTION` | AI 区域补填 |
| `CANCEL_AI_FILL` | 终止区域补填 |
| `WRITE_FOCUSED_FIELD` | 浮窗请求向网页焦点控件写值 |

### Popup 到内容脚本

| 消息 | 用途 |
|---|---|
| `DETECT_FIELDS` | 检测当前页面字段 |
| `FILL_FORM` | 一键填充 |
| `START_AI_REGION_FILL` | 启动 AI 区域选择 |

### 后台到内容脚本

| 消息 | 用途 |
|---|---|
| `APPLY_FOCUSED_FIELD` | 向最后聚焦控件写入值 |

### 通用响应

```ts
interface MessageResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

浮窗写入失败原因：

- `NO_ACTIVE_TAB`
- `NO_CONTENT_SCRIPT`
- `NO_FOCUSED_FIELD`
- `FIELD_DETACHED`
- `FIELD_NOT_WRITABLE`
- `VALUE_REJECTED`
- `RESTRICTED_PAGE`

## 隐私与安全规则

### 本地数据

用户资料和 AI 配置保存在浏览器扩展本地存储。

敏感数据包括：

- 身份证号
- 手机号
- 邮箱
- 简历原文件 Base64
- 简历解析文本
- AI API Key

### AI 数据外发

不同功能发送的数据范围不同：

| 功能 | 外发内容 |
|---|---|
| 简历解析 | 简历完整文本 |
| 开放题生成 | 个人资料摘要、问题和上下文 |
| 字段分类 | 字段标识信息 |
| AI 区域补填 | 当前完整用户资料和区域字段 |

当前 AI 区域补填将完整 `UserProfile` 序列化到 Prompt。如果 `resume` 存在，可能包含简历 Base64 和完整解析文本。这是当前实现的隐私与上下文长度风险，后续应改为只发送与选中模块相关的必要字段。

### 提交规则

扩展只填写字段，不主动点击：

- 完成
- 保存
- 提交
- 下一步

最终提交始终由用户确认。

## 浏览器和页面兼容

### Manifest

当前使用：

- Manifest V3
- 最低 Chromium 116
- `storage`
- `scripting`
- `activeTab`
- `sidePanel`
- `clipboardWrite`
- HTTPS host permissions

Manifest 中保留原生 Side Panel 声明，但当前实际入口使用独立信息浮窗，以兼容未开放 `chrome.sidePanel.open()` 的 Edge 环境。

### 已知页面限制

- 不遍历跨域 iframe。
- 不处理 Shadow DOM 内部表单。
- 不处理 canvas 表单。
- 不保证兼容富文本编辑器。
- 自定义下拉主要适配字节 `.ud__select`。
- 动态经历添加主要适配字节模块结构。
- 特殊虚拟列表或不可见元素可能被误判。
- HTTP 自定义 AI 地址不在当前 HTTPS host permission 范围。

### 自动写入不成功的常见原因

- 用户没有先点击网页目标输入框。
- React 重渲染替换了输入节点。
- 目标在跨域 iframe 中。
- 目标是未适配的富文本或自定义组件。
- 页面校验拒绝值。
- 当前页面属于浏览器限制页。

出现这些情况时，信息浮窗优先降级为复制。

## 构建结构

### 技术栈

- React 19
- TypeScript
- Vite
- Manifest V3
- pdfjs-dist
- Mammoth
- Marked

### Vite 入口

- `src/popup/index.html`
- `src/options/index.html`
- `src/sidepanel/index.html`
- `src/content/index.ts`
- `src/background/index.ts`

### 固定产物

- `dist/content.js`
- `dist/background.js`
- `dist/manifest.json`
- `dist/icons/*`

Popup、Options 和 Sidepanel 的 JS/CSS 使用带 hash 的资源名。

### 构建命令

```bash
npm run build
```

实际执行：

```text
tsc -b
vite build
node scripts/post-build.js
```

### 代码检查

```bash
npm run lint
```

## 验证基线

每次修改核心填写逻辑后，至少验证：

1. `npm run build` 通过。
2. `dist/src/popup/index.html` 存在。
3. `dist/src/options/index.html` 存在。
4. `dist/src/sidepanel/index.html` 存在。
5. `dist/content.js` 不包含外部 `import`。
6. Popup 能检测字段。
7. 一键填充不自动提交。
8. AI 框选可取消和终止。
9. 浮窗能定位原浏览器窗口。
10. 普通 input、textarea 和 React 输入框可点选写入。
11. 写入失败时复制兜底生效。
12. 置顶小窗只能由浮窗中的直接点击触发。
13. 关闭 PiP 后资料面板可移回原浮窗。

## 当前已知问题

### 状态反馈准确性

一键填充的“成功”当前更接近“流程已执行”，不代表每个字段都通过页面验证。浮窗单字段写入的验证更严格。

### AI 字段缓存

AI 字段分类按域名和字段索引缓存。相同域名的表单结构变化后，可能复用过期映射。

### AI 上下文范围

AI 区域补填发送完整资料，存在敏感信息外发和上下文过大的风险。

### PDF 解析

PDF Worker 使用 CDN，可能受 CSP、网络或离线环境影响。

### DOC 兼容

传统二进制 `.doc` 不保证能被 Mammoth 正确解析。

### 未使用代码

内容脚本中保留了早期页面内浮动按钮和模块按钮的函数定义，但当前没有调用入口。实际操作入口位于 Popup。

## 设计原则

1. 用户资料以本地保存为默认。
2. 确定性规则优先，AI 处理规则无法覆盖的字段。
3. AI 只返回字段和值，本地代码负责页面交互。
4. AI 生成值必须经过字段索引和候选项校验。
5. 已填字段默认不由 AI 区域补填覆盖。
6. 不自动提交网申表单。
7. 复杂页面写入失败时降级为复制。
8. 页面 DOM 引用只保存在内容脚本内存中。
9. 资料数组顺序与页面重复字段顺序一一对应。
10. 针对具体网站的适配应与通用规则分离。
11. 浏览器不支持的能力必须提供明确提示和可用降级路径。
12. 每次代码修改后重新构建 `dist`，用户加载的是构建目录而不是源码目录。
