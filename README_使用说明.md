# CDP 圈人配置工具使用说明

## 1. 这是什么

这是一个用于生成 CDP 圈人 JSON 的前后端工具，适合把“业务参数选择”转换成可直接用于数据银行/圈人平台的底层配置。

项目提供三种使用方式：

- 可视化点选模式：适合单个人群包配置、调试、预览和复制 JSON。
- 批量矩阵模式：适合按模板批量上传 CSV，自动生成多个人群包，并按交集/并集/差集进行组合。
- 方案中心：适合沉淀可复用方案，管理草稿与已发布方案，并为工作台提供可加载的正式方案。

---

## 2. 项目整体运作流程

系统的整体流程可以概括为下面 6 步：

1. 启动后端服务。
   后端会先校验根目录下的参数表、逻辑表、维表、模板文件是否齐全、字段是否正确。

2. 后端加载配置数据到内存。
   主要包括：
   - `1.参数表.csv`：定义每个参数的名称、键名、控件类型、写入 JSON 的路径、模板规则等。
   - `*.逻辑表.csv`：定义在不同渠道/行为/状态组合下，哪些字段应该显示。
   - 各类维表 CSV：把前端展示值映射成后端实际需要的 ID 或编码。
   - `批量圈人模板/`：提供批量导入用的标准模板。

3. 启动前端页面。
   前端通过 `/api/packages` 获取所有可用“圈人包类型”，例如类目公域行为、商品行为、AIPL 状态、预测年龄等。

4. 用户在前端选择包类型并填写参数。
   前端会调用 `/api/meta/<包名>` 获取这个包的字段定义和显示逻辑，然后动态渲染表单。

5. 前端把用户输入提交给后端生成 JSON。
   后端会根据参数表中的 `JSON_Path` 和 `Backend_Template`，把用户输入转换成目标 JSON 结构，并结合基础模板输出结果。

6. 用户复制结果或批量生成结果。
   - 单包模式下，右侧实时展示 JSON 和摘要。
   - 批量模式下，系统按上传文件逐行生成结果，并进一步组合为最终矩阵结果。

---

## 3. 项目结构说明

### 根目录

- [app.py](E:\CDP_Project_codex\app.py)：Flask 启动入口。
- [test_api.py](E:\CDP_Project_codex\test_api.py)：后端接口与配置校验自测脚本。
- [requirements.txt](E:\CDP_Project_codex\requirements.txt)：Python 依赖。
- `1.参数表.csv`：全项目最核心的配置表。
- `*.逻辑表.csv`：每个圈人包对应的显示逻辑。
- `*维表.csv`：选项值与 ID 映射表。
- `批量圈人模板/`：批量上传模板目录。

### 后端

- [cdp_backend/app_factory.py](E:\CDP_Project_codex\cdp_backend\app_factory.py)：Flask 应用工厂、路由注册、日志、CORS。
- [cdp_backend/engine.py](E:\CDP_Project_codex\cdp_backend\engine.py)：核心引擎，负责加载配置、翻译参数、生成 JSON、批量生成。
- [cdp_backend/validator.py](E:\CDP_Project_codex\cdp_backend\validator.py)：启动前配置校验。
- [cdp_backend/csv_utils.py](E:\CDP_Project_codex\cdp_backend\csv_utils.py)：CSV 读取、编码兼容、逻辑表扫描等工具函数。
- [cdp_backend/constants.py](E:\CDP_Project_codex\cdp_backend\constants.py)：文件名和字段常量。
- [cdp_backend/solution_store.py](E:\CDP_Project_codex\cdp_backend\solution_store.py)：方案草稿、正式方案、本地 JSON 存储与发布流程。

### 前端

- [cdp-web/src/App.vue](E:\CDP_Project_codex\cdp-web\src\App.vue)：应用入口，负责模式切换和健康检查。
- [cdp-web/src/components/NormalMode.vue](E:\CDP_Project_codex\cdp-web\src\components\NormalMode.vue)：可视化点选模式。
- [cdp-web/src/components/BatchMode.vue](E:\CDP_Project_codex\cdp-web\src\components\BatchMode.vue)：批量矩阵模式。
- [cdp-web/src/components/SolutionCenter.vue](E:\CDP_Project_codex\cdp-web\src\components\SolutionCenter.vue)：方案中心，负责草稿编辑、发布和工作台预览。
- [cdp-web/src/components/DynamicForm.vue](E:\CDP_Project_codex\cdp-web\src\components\DynamicForm.vue)：动态表单渲染。
- [cdp-web/src/composables/useCdpShared.js](E:\CDP_Project_codex\cdp-web\src\composables\useCdpShared.js)：前端共享逻辑，包括字段显隐、联动、数量限制、日期限制等。
- [cdp-web/vite.config.ts](E:\CDP_Project_codex\cdp-web\vite.config.ts)：前端开发代理，`/api` 会转发到 `127.0.0.1:5000`。

---

## 4. 如何启动

### 4.0 一键启动

项目根目录已提供两个启动脚本：

- `start-dev.ps1`：PowerShell 一键启动脚本
- `start-dev.cmd`：可直接双击运行的包装脚本
- `stop-dev.ps1`：PowerShell 一键停止脚本
- `stop-dev.cmd`：可直接双击运行的停止包装脚本

推荐方式：

```powershell
.\start-dev.cmd
```

如不希望启动后自动打开前端页面，可执行：

```powershell
.\start-dev.cmd -NoBrowser
```

脚本会自动：

- 优先使用项目内的 `.venv\Scripts\python.exe`
- 检查 `5000` 和 `5173` 端口是否已被占用
- 分别启动后端和前端窗口
- 将输出写入根目录的 `backend.stdout.log` 和 `frontend.stdout.log`
- 默认自动打开前端页面 `http://127.0.0.1:5173`

如果启动窗口立即关闭，请先查看这两个日志文件。

停止服务可执行：

```powershell
.\stop-dev.cmd
```

停止脚本会优先根据 `.runtime/dev/*.pid` 和 `5000`、`5173` 端口关闭对应进程。

### 4.1 后端启动

在项目根目录执行：

```powershell
pip install -r requirements.txt
python app.py
```

默认启动地址：

- 后端接口：`http://127.0.0.1:5000`

可用健康检查：

- `GET http://127.0.0.1:5000/api/health`

### 4.2 前端启动

进入前端目录执行：

```powershell
cd cdp-web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

默认访问地址：

- 前端页面：`http://127.0.0.1:5173`

前端会自动把 `/api` 请求代理到后端。

---

## 5. 使用者操作说明

## 5.1 可视化点选模式

适合单个圈人包的配置和试算。

操作步骤：

1. 打开前端页面。
2. 左侧选择一个圈人包类型。
3. 中间按业务需要填写参数。
4. 如需多个条件组合，可继续添加多个节点，并选择节点之间的关系：
   - `n`：交集
   - `u`：并集
   - `d`：差集
5. 右侧会实时生成：
   - 人群包名称
   - 参数摘要
   - 最终 JSON
6. 点击“复制”即可把 JSON 复制到剪贴板。
7. 点击“去圈人”可直接打开数据银行页面继续使用。
8. 点击“去圈人”右侧下拉菜单中的“自动化圈人”时，可把当前 JSON 发送给已安装的 Chrome 扩展，由扩展在数据银行页面自动执行“打开参数粘贴、写入 JSON、确认”这 3 个固定动作。

这个模式下的特点：

- 支持节点复制、拖拽排序、收起展开、撤销重做。
- 表单字段会根据渠道、行为、包类型自动联动显示。
- 部分字段有数量上限和日期范围限制。
- 人群包名称会根据已选参数自动生成，也可以手工修改。

## 5.2 批量矩阵模式

适合一次生成多个人群包，或者按多个模板流水线做组合。

操作步骤：

1. 切换到“批量矩阵模式”。
2. 点击“获取标准模板”，下载对应 CSV 模板。
3. 按模板填写数据，每一行代表一个待生成的人群包。
4. 将 CSV 上传到某个模板卡片。
5. 系统会逐行调用后端生成结果。
6. 如果有多个模板卡片，可在卡片之间选择：
   - 交集
   - 并集
   - 差集
7. 右侧最终卡片会生成按行合并后的最终结果。
8. 点击任意结果项，可自动复制 JSON，并打开详情抽屉查看。

### 5.3 方案中心

适合把当前工作沉淀为可复用方案，并管理方案从草稿到正式发布的完整生命周期。

进入方式：

1. 页面顶部一级导航保留“可视化点选”和“矩阵装配车间”两个入口。
2. 进入“可视化点选”后，在右侧子导航中切换到“方案中心”。
3. 左侧可按“草稿”或“已发布”筛选已有方案。
4. 点击“新建草稿”可创建空白方案草稿。

草稿与正式方案生命周期：

1. 草稿方案可以直接在方案中心新建，也可以在工作台中通过“存为方案草稿”生成。
2. 草稿支持继续编辑节点结构、默认名称，以及“工作台展示参数”。
3. 点击“发布正式方案”后，当前草稿会变成已发布方案。
4. 已发布方案在方案中心中默认只读；如需修改，应先点击“生成编辑草稿”，在草稿中调整后再重新发布。
5. 工作台只消费已发布方案。草稿不会出现在工作台的“已发布方案”列表中，而是继续保留在方案中心里等待编辑或发布。

工作台与方案中心的配合方式：

1. 在自由搭建工作台中，可把当前画布通过“存为方案草稿”保存进方案中心。
2. 工作台加载某个已发布方案后，会进入“方案使用”状态，只展示该方案开放到工作台的字段。
3. 此时工作台结构会锁定，不能继续增删节点；如需改结构，应回到方案中心编辑草稿。
4. 工作台中的“恢复方案默认值”会把当前已加载方案恢复到最近一次加载时的默认节点和默认字段值。
5. 退出“方案使用”后，工作台会回到自由搭建状态。

### 5.4 自动化圈人扩展

适合在本地联调时，把工作台生成的 JSON 直接送到数据银行页面，减少手工粘贴步骤。

安装方式：

1. 打开 Chrome 扩展页：`chrome://extensions/`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择目录 `chrome-extension/databank-automation`

使用前提：

- 前端页面运行在 `http://127.0.0.1:5173`
- Chrome 中已经打开并登录 `https://databank.tmall.com/*`
- 扩展已成功加载

使用方式：

1. 在工作台生成最终 JSON。
2. 点击“去圈人”按钮右侧下拉菜单中的“自动化圈人”。
3. 扩展会在后台新建或复用数据银行标签页，并自动执行固定的参数粘贴流程。
4. 成功时保持当前工作台页不跳走；失败时会切到目标页，方便直接查看卡住的位置。

批量模式补充说明：

- 上传文件名中带有包名时，后端会尝试自动识别包类型。
- 每个卡片的每一行结果会按相同行号进行横向组合。
- 可在最终区域粘贴多行自定义名称，按顺序覆盖默认人群包名。
- 单个批量结果支持回显到可编辑抽屉，再次修改后重新生成。

---

## 6. 关键配置文件说明

## 6.1 参数表 `1.参数表.csv`

这是整套系统的核心。每一行定义一个表单字段或一个后端写入规则，重点字段包括：

- `Crowd_Package`：该字段属于哪些圈人包。
- `Param_Key`：前后端统一使用的参数键名。
- `Label`：界面展示名称。
- `Widget_Type`：控件类型，例如单选、多选、日期、数值区间。
- `Data_Source`：选项来源于哪个维表。
- `JSON_Path`：该字段最终写入 JSON 的路径。
- `Backend_Template`：复杂字段的模板规则。
- `Base_Template`：该包的基础 JSON 模板。
- `Is_Default`：默认显示字段。

## 6.2 逻辑表 `*.逻辑表.csv`

逻辑表用于控制“什么情况下展示什么字段”。

例如：

- 某些字段只有在选择特定渠道后才显示。
- 某些字段只有在选择某个行为后才显示。
- 某些包按“渠道 + 行为”的二维组合控制表单显隐。

前端会先取到逻辑矩阵，再决定每个字段是否展示。

## 6.3 维表 `*维表.csv`

维表主要解决“展示值”和“实际值”不一致的问题。

例如：

- 页面展示“天猫”，后端实际可能要写成某个 `parentId#|#BizID`
- 页面展示某个行为名称，后端实际要写成 `ID#|#Value`
- 页面展示品牌、类目、属性值，后端可能要写成对应 ID

### 6.4 方案本地存储

方案中心的数据默认保存在项目根目录下的 `.runtime/solutions.json`。

- 这个文件由后端 `SolutionStore` 统一读写。
- 草稿方案和已发布方案都会存放在这个本地 JSON 文件中。
- 如果需要迁移或备份方案，优先备份这个文件。

---

## 7. 系统内部是怎么生成 JSON 的

后端生成 JSON 的核心逻辑在 [cdp_backend/engine.py](E:\CDP_Project_codex\cdp_backend\engine.py)。

生成过程如下：

1. 根据 `_package` 找到当前圈人包对应的参数配置。
2. 遍历前端提交的每个字段。
3. 根据参数表找到该字段：
   - 是否需要写入 JSON
   - 写入哪个 `JSON_Path`
   - 是否需要使用 `Backend_Template`
4. 如果字段值来自维表，就把中文展示值翻译成系统 ID。
5. 如果字段是数值区间、日期区间等复杂结构，就按模板渲染。
6. 把所有结果合并到 `selectionLv3` 等目标路径。
7. 最后再与该包的 `Base_Template` 合并，输出最终结构。

简化理解：

- 参数表决定“写到哪里”
- 维表决定“值写成什么”
- 逻辑表决定“字段是否显示”
- 基础模板决定“最终 JSON 长什么样”

---

## 8. 当前可用接口

后端对前端暴露的主要接口如下：

- `GET /api/health`
  - 查看服务状态、环境、已加载包数量、缓存情况

- `GET /api/packages`
  - 获取所有圈人包名称

- `GET /api/meta/<package_name>`
  - 获取指定包的表单 schema 和逻辑矩阵

- `GET /api/package_meta?name=<package_name>`
  - 上面接口的别名

- `POST /api/generate`
  - 根据前端参数直接生成 JSON

- `POST /api/generate_json`
  - 兼容旧调用方式，传 `pkgName + params`

- `GET /api/list_templates`
  - 获取批量模板文件列表

- `GET /api/download_template/<filename>`
  - 下载单个模板文件

- `POST /api/batch_generate`
  - 上传 CSV 后按行批量生成人群包 JSON

- `GET /api/solutions`
  - 获取方案列表，可按草稿或已发布状态筛选

- `POST /api/solutions/drafts`
  - 创建方案草稿

- `PUT /api/solutions/<solution_id>`
  - 更新草稿方案

- `POST /api/solutions/<solution_id>/publish`
  - 发布草稿方案

- `POST /api/solutions/<solution_id>/edit-draft`
  - 基于已发布方案生成编辑草稿

- `POST /api/solutions/<solution_id>/duplicate`
  - 复制当前方案为新草稿

- `DELETE /api/solutions/<solution_id>`
  - 删除方案

- `POST /api/databank/automate`
  - 接收 `jsonText`，调用本地数据银行自动化执行器

---

## 9. 常见问题

## 9.1 页面提示后端离线

检查：

- 是否已经执行 `python app.py`
- 后端是否监听在 `127.0.0.1:5000`
- 前端是否通过 Vite 启动，而不是直接打开 HTML

## 9.2 上传模板后没有结果

检查：

- CSV 表头是否与标准模板一致
- 上传文件名是否包含正确的包名
- 内容是否使用了模板不支持的字段值

## 9.3 某个字段不显示

先确认这是不是正常逻辑。字段显隐受逻辑表控制，很多字段只有在满足指定渠道、行为、状态后才会出现。

## 9.4 修改了 CSV 但页面没变化

因为后端会在启动时把配置加载进内存，所以修改参数表、逻辑表、维表后，通常需要重启后端服务。

## 9.5 为什么工作台里看不到刚保存的方案草稿

这是预期行为。工作台左侧列表只展示已发布方案，刚通过“存为方案草稿”保存的内容会先进入方案中心草稿区，待你在方案中心补充或确认内容后再发布。

## 9.6 “恢复方案默认值”会恢复什么

它会把当前工作台中已加载的正式方案恢复到该方案最近一次被加载时的默认状态，包括节点结构、开放字段以及这些字段的默认值。它不会把当前工作台内容回写到方案中心。

---

## 10. 我这次检查确认到的结论

当前项目是一个配置驱动型工具，代码本身并不硬编码业务规则，核心依赖都在 CSV 配置里：

- 新增或修改圈人包，主要是调整参数表、逻辑表、维表。
- 前端负责动态展示和联动。
- 后端负责翻译、模板渲染和结构输出。
- 批量模式本质上是在单包生成能力上再封装一层流水线组合。

本次新增内容还包括：

- 工作台顶部导航改成“一级模式 + 可视化子页”结构。
- “去圈人”补充了“自动化圈人”入口。
- 后端增加了数据银行自动化接口。
- 仓库新增了 `chrome-extension/databank-automation` 本地联调扩展。
- 新增了自动化接口单测、自动化执行器单测，以及多项前端交互测试。

建议至少执行下面这组检查：

```powershell
python -m unittest test_api.py test_databank_automation_api.py test_databank_automation_unit.py
node cdp-web/src/App.navigation.test.mjs
node cdp-web/src/components/BatchMode.layout.test.mjs
node cdp-web/src/components/NormalMode.leftPanel.test.mjs
node cdp-web/src/components/NormalMode.status.test.mjs
node cdp-web/src/components/NormalMode.toolbar.test.mjs
node cdp-web/src/components/SolutionCenter.listActions.test.mjs
```
