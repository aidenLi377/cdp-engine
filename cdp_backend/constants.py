from __future__ import annotations

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIRNAME = ".runtime"
SOLUTIONS_FILENAME = "solutions.json"
FOLDERS_FILENAME = "folders.json"
TASKS_FILENAME = "tasks.json"
PARAMS_FILE = "1.参数表.csv"
TEMPLATE_DIRNAME = "批量圈人模板"

LOGIC_FILE_SUFFIX = "_逻辑表.csv"
LOGIC_TRIGGER_CANDIDATES = ["渠道", "行为", "状态"]

BEHAVIOR_DIM_FILE = "行为维表.csv"
CHANNEL_DIM_FILE = "渠道维表.csv"
CATEGORY_DIM_FILE = "类目维表.csv"
BRAND_DIM_FILE = "品牌维表.csv"
STATUS_DIM_FILE = "状态维表.csv"
GOODS_TYPE_DIM_FILE = "商品类型维表.csv"
ACCOUNT_DIM_FILE = "账号维表.csv"
ATTRIBUTE_DIM_FILE = "属性值维表.csv"

REQUIRED_PARAM_COLUMNS = [
    "Crowd_Package",
    "Base_Template",
    "Param_Key",
    "Label",
    "JSON_Path",
    "Widget_Type",
    "Data_Source",
    "Backend_Template",
    "Is_Default",
]

REQUIRED_DIMENSION_COLUMNS = {
    BEHAVIOR_DIM_FILE: ["适用的包", "行为名称", "ID", "Value", "适用的渠道"],
    CHANNEL_DIM_FILE: ["适用的包", "渠道名称", "parentId", "BizID"],
    CATEGORY_DIM_FILE: ["适用的包", "类目名称", "cateId"],
    BRAND_DIM_FILE: ["适用的包", "品牌名称", "Value"],
    STATUS_DIM_FILE: ["适用的包", "状态名称", "ID", "Value"],
    GOODS_TYPE_DIM_FILE: ["适用的包", "类型名称", "ID"],
    ACCOUNT_DIM_FILE: ["适用的包", "账号名称", "ID"],
    ATTRIBUTE_DIM_FILE: ["适用的包", "属性值名称", "ID"],
}

DB_PATH = os.environ.get(
    "CDP_DB_PATH",
    os.path.join(BASE_DIR, RUNTIME_DIRNAME, "cdp.db"),
)

DIMENSION_FILES = list(REQUIRED_DIMENSION_COLUMNS.keys())

DIMENSION_NAME_COLUMNS = {
    CHANNEL_DIM_FILE: "渠道名称",
    CATEGORY_DIM_FILE: "类目名称",
    BRAND_DIM_FILE: "品牌名称",
    STATUS_DIM_FILE: "状态名称",
    GOODS_TYPE_DIM_FILE: "类型名称",
    ACCOUNT_DIM_FILE: "账号名称",
    ATTRIBUTE_DIM_FILE: "属性值名称",
}


