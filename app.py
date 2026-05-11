# app.py (全自动扫描引擎版 — 生产加固版 + 本地开发兼容)
import os
import sys
import re
import io
import json
import glob
import logging
from logging.handlers import RotatingFileHandler

from flask import Flask, jsonify, request, send_from_directory, abort
from flask_cors import CORS
import pandas as pd

# ========================================================================
# 环境检测 — 根据 FLASK_ENV 自动切换开发 / 生产模式
# 本地开发: 不设置环境变量 (默认 development) → debug=True, CORS 全开
# 服务器部署: FLASK_ENV=production → debug=False, CORS 限制, 启用日志文件
# ========================================================================
IS_PRODUCTION = os.environ.get('FLASK_ENV', 'development') == 'production'
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production')

# ------------------------------------------------------------------------
# CORS — 开发全开, 生产限制
# ------------------------------------------------------------------------
if IS_PRODUCTION:
    allowed_origins = os.environ.get('CORS_ORIGINS', '').split(',')
    allowed_origins = [o.strip() for o in allowed_origins if o.strip()]
    if not allowed_origins:
        allowed_origins = ['https://databank.tmall.com']
    CORS(app, origins=allowed_origins)
else:
    CORS(app)

# ------------------------------------------------------------------------
# 日志 — 生产写文件, 开发输出到终端
# ------------------------------------------------------------------------
if IS_PRODUCTION:
    log_dir = os.environ.get('LOG_DIR', '/var/log/cdp-project')
    os.makedirs(log_dir, exist_ok=True)
    handler = RotatingFileHandler(
        os.path.join(log_dir, 'app.log'),
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5
    )
    handler.setFormatter(logging.Formatter(
        '[%(asctime)s] %(levelname)s [%(name)s] %(message)s'
    ))
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)
else:
    # 本地开发保持 print 为辅, 同时输出到 stdout
    logging.basicConfig(
        stream=sys.stdout,
        level=logging.INFO,
        format='[%(asctime)s] %(levelname)s %(message)s',
        datefmt='%H:%M:%S'
    )

app.logger.info("启动模式: %s", "PRODUCTION" if IS_PRODUCTION else "DEVELOPMENT")


# ========================================================================
# ConfigEngine — 核心翻译引擎 (新增元数据缓存)
# ========================================================================
class ConfigEngine:
    def __init__(self):
        self._meta_cache = {}      # 缓存 get_package_meta 的结果
        self._logic_cache = {}     # 缓存逻辑表解析结果
        self.load_config()

    # ---- 安全读取 CSV (兼容 UTF-8 / GB18030) ----
    @staticmethod
    def _safe_read(filename):
        file_path = os.path.join(BASE_DIR, filename)
        if not os.path.exists(file_path):
            return pd.DataFrame()
        try:
            try:
                df = pd.read_csv(file_path, encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(file_path, encoding='gb18030')
        except Exception:
            return pd.DataFrame()
        # 统一去除列名首尾空白
        df.columns = [str(c).strip() for c in df.columns]
        return df.where(pd.notnull(df), "")

    # ---- 启动时一次性加载所有配置 ----
    def load_config(self):
        # 1. 参数表
        try:
            self.params_df = pd.read_csv(os.path.join(BASE_DIR, "1.参数表.csv"), encoding='gb18030')
        except UnicodeDecodeError:
            self.params_df = pd.read_csv(os.path.join(BASE_DIR, "1.参数表.csv"), encoding='utf-8')

        self.params_df.columns = [str(c).strip() for c in self.params_df.columns]
        for col in self.params_df.columns:
            if self.params_df[col].dtype == 'object':
                self.params_df[col] = self.params_df[col].apply(
                    lambda x: str(x).strip() if pd.notna(x) else x
                )

        # 2. 扫描所有逻辑表 (*_逻辑表.csv)
        logic_files = glob.glob(os.path.join(BASE_DIR, "*_逻辑表.csv"))
        def sort_key(filename):
            base_name = os.path.basename(filename)
            match = re.match(r'^(\d+)', base_name)
            return int(match.group(1)) if match else 999

        logic_files.sort(key=sort_key)
        self.packages = {}
        for f in logic_files:
            base_name = os.path.basename(f).split('_逻辑表')[0]
            pkg_name = re.sub(r'^\d+\.', '', base_name)
            self.packages[pkg_name] = f

        # 3. 标签映射
        self.label_map = {}
        for _, row in self.params_df.iterrows():
            if pd.notna(row.get('Label')):
                cn_name = str(row['Label']).strip()
                eng_key = str(row['Param_Key']).strip()
                self.label_map[cn_name] = eng_key
                if "关键词" in cn_name:
                    self.label_map[cn_name.replace("关键词", "关键字")] = eng_key

        # 4. 加载维表 (行为、渠道、类目、品牌等)
        self.id_translator = {}
        self.dimensions = {}
        self._load_dimension_tables()

        app.logger.info("ConfigEngine 初始化完成 — %d 个人群包, %d 个维表",
                        len(self.packages), len(self.dimensions))

    def _load_dimension_tables(self):
        self.bhv_translator = {}
        self.bhv_options = {}

        df_bhv = self._safe_read("行为维表.csv")
        for _, row in df_bhv.iterrows():
            pkg = str(row.get('适用的包', '')).strip()
            name = str(row.get('行为名称', '')).strip()
            val = f"{row.get('ID', '')}#|#{row.get('Value', '')}"
            if not name or not pkg:
                continue
            channel_name = str(row.get('适用的渠道', 'ALL')).strip()
            if not channel_name or channel_name.lower() == 'nan':
                channel_name = 'ALL'
            self.bhv_translator[(pkg, channel_name, name)] = val

            if pkg not in self.bhv_options:
                self.bhv_options[pkg] = []
            if name not in self.bhv_options[pkg]:
                self.bhv_options[pkg].append(name)

        self.dim_translator = {}
        self.attr_options = {}

        loaders = [
            ("渠道维表.csv",    "渠道名称",   lambda r: f"{r.get('parentId', '')}#|#{r.get('BizID', '')}"),
            ("类目维表.csv",    1,            lambda r: f"{r.get('cateId', '')}#|#{r.get('cateId', '')}"),
            ("品牌维表.csv",    1,            lambda r: str(r.iloc[1]).strip()),
            ("状态维表.csv",    "状态名称",   lambda r: f"{r.get('ID', '')}#|#{r.get('Value', '')}"),
            ("商品类型维表.csv", "类型名称",  lambda r: str(r.get('ID', '')).strip()),
            ("账号维表.csv",    "账号名称",   lambda r: str(r.get('ID', '')).strip()),
            ("属性值维表.csv",  "属性值名称", lambda r: str(r.get('ID', '')).strip()),
        ]

        for fname, name_col, id_func in loaders:
            df = self._safe_read(fname)
            self.dimensions[fname] = []
            has_pkg = '适用的包' in df.columns

            for _, row in df.iterrows():
                try:
                    if isinstance(name_col, int):
                        if name_col < len(row):
                            name = str(row.iloc[name_col]).strip()
                        else:
                            continue
                    else:
                        name = str(row.get(name_col, '')).strip()

                    if not name:
                        continue
                    val = id_func(row)
                    pkg_val = str(row.get('适用的包', '')).strip() if has_pkg else ""

                    if fname == "品牌维表.csv":
                        self.id_translator[name] = name
                        self.dimensions[fname].append(name)
                    elif val and val != "#|#":
                        self.id_translator[name] = val
                        if has_pkg and pkg_val:
                            self.dim_translator[(pkg_val, name)] = val
                            if (pkg_val, fname) not in self.attr_options:
                                self.attr_options[(pkg_val, fname)] = []
                            if name not in self.attr_options[(pkg_val, fname)]:
                                self.attr_options[(pkg_val, fname)].append(name)
                        self.dimensions[fname].append(name)
                except Exception:
                    continue
            self.dimensions[fname] = list(dict.fromkeys(self.dimensions[fname]))

    # ---- 包元数据 (带缓存) ----
    def get_package_meta(self, package_name):
        """返回 schema + 逻辑矩阵。结果按包名缓存, 首次加载后走内存。"""
        if package_name in self._meta_cache:
            return self._meta_cache[package_name]

        logic_filename = self.packages.get(package_name)
        if not logic_filename or not os.path.exists(logic_filename):
            return {}

        full_schema = []
        current_label_map = {}

        for _, config in self.params_df.iterrows():
            pkg_col = config.get('Crowd_Package', '')
            if pd.isna(pkg_col):
                continue
            if package_name not in [p.strip() for p in str(pkg_col).split(',')]:
                continue

            if pd.notna(config.get('Label')):
                cn_name = str(config.get('Label')).strip()
                eng_key = str(config.get('Param_Key')).strip()
                current_label_map[cn_name] = eng_key
                if "关键词" in cn_name:
                    current_label_map[cn_name.replace("关键词", "关键字")] = eng_key

            item = config.to_dict()
            for k, v in item.items():
                if pd.isna(v):
                    item[k] = ""

            item['key'] = config['Param_Key']
            data_source = item.get('Data_Source')

            if data_source == '行为维表.csv':
                opts = self.bhv_options.get(package_name, [])
                item['options'] = opts.copy() if isinstance(opts, list) else []
            else:
                opts = self.attr_options.get(
                    (package_name, data_source),
                    self.dimensions.get(data_source, [])
                )
                item['options'] = opts.copy() if isinstance(opts, list) else []

            if package_name in ['AIPL状态', '商品行为'] and item['key'] in ['cate', 'leafCates']:
                if '全部' not in item['options']:
                    item['options'].insert(0, '全部')

            is_def_raw = str(item.get('Is_Default', '0')).strip().lower()
            is_def_clean = is_def_raw.replace('.0', '')
            item['isDefault'] = is_def_clean in ['1', 'true', 'yes', '是']
            full_schema.append(item)

        # 逻辑矩阵 — 首次读取并缓存
        logic_matrix = self._load_logic_matrix(logic_filename, current_label_map)

        result = {"schema": full_schema, "matrix": logic_matrix}
        self._meta_cache[package_name] = result
        app.logger.info("加载包元数据: %s (%d 字段, %d 矩阵项)", package_name,
                        len(full_schema), len(logic_matrix))
        return result

    def _load_logic_matrix(self, logic_filename, current_label_map):
        """读取逻辑表并解析为 matrix dict。"""
        if logic_filename in self._logic_cache:
            return self._logic_cache[logic_filename]

        logic_matrix = {}
        try:
            try:
                temp_df = pd.read_csv(logic_filename, encoding='utf-8')
            except UnicodeDecodeError:
                temp_df = pd.read_csv(logic_filename, encoding='gb18030')

            trigger_cols = []
            for expected in ['渠道', '行为', '状态']:
                for col in temp_df.columns:
                    if col.strip() == expected:
                        first_val = (str(temp_df[col].dropna().iloc[0]).strip()
                                     if not temp_df[col].dropna().empty else "")
                        if first_val not in ['1', '1.0', 'True', 'TRUE']:
                            trigger_cols.append(col.strip())

            if not trigger_cols:
                trigger_cols = [temp_df.columns[0]]

            for _, row in temp_df.iterrows():
                key_parts = [str(row[c]).strip() for c in trigger_cols]
                composite_key = "|".join(key_parts)
                visible_fields = []
                for col_name, val in row.items():
                    if col_name.strip() not in trigger_cols:
                        if str(val).strip() in ['1', '1.0', 'True', 'TRUE', 'true']:
                            cn = col_name.strip()
                            real_key = current_label_map.get(cn, cn)
                            if real_key:
                                visible_fields.append(real_key)
                logic_matrix[composite_key] = visible_fields

            self._logic_cache[logic_filename] = logic_matrix

        except Exception as e:
            app.logger.error("逻辑表读取异常 [%s]: %s", os.path.basename(logic_filename), e)

        return logic_matrix

    # ---- JSON 生成核心 ----
    def generate_json(self, user_data):
        current_pkg = user_data.pop('_package', '类目公域行为')
        selection_lv3 = {}

        for key, raw_val in user_data.items():
            if current_pkg == 'AIPL状态' and key == 'cate':
                if (isinstance(raw_val, list) and '全部' in raw_val) or raw_val == '全部':
                    self._merge_path(selection_lv3, "selectionLv3.cate", "ALL")
                    continue

            matched_rows = self.params_df[
                (self.params_df['Param_Key'] == key) &
                (self.params_df['Crowd_Package'].apply(
                    lambda x: current_pkg in [p.strip() for p in str(x).split(',') if pd.notna(x)]))
            ]
            if matched_rows.empty:
                continue

            config = matched_rows.iloc[0]
            template_str = config.get('Backend_Template')
            json_path = config.get('JSON_Path')

            if pd.isna(json_path) or str(json_path).strip() == "-":
                continue

            cleaned_val = raw_val
            vars_dict = {}
            state = "hasValue"

            if isinstance(raw_val, dict) and 'val' in raw_val:
                cleaned_val = raw_val['val']
                if isinstance(cleaned_val, dict):
                    vars_dict.update(cleaned_val)
            if isinstance(raw_val, dict) and raw_val.get('min') in ['recent', 'range']:
                state = raw_val.get('min')
                if isinstance(raw_val.get('val'), dict):
                    temp_val = raw_val['val'].copy()
                    if 'days' in temp_val:
                        temp_val['days'] = str(temp_val['days'])
                    vars_dict.update(temp_val)
            elif isinstance(raw_val, dict) and ('min' in raw_val or 'max' in raw_val):
                def safe_num(x):
                    if x is None or str(x).strip() == "":
                        return ""
                    try:
                        return int(x)
                    except (ValueError, TypeError):
                        try:
                            return float(x)
                        except (ValueError, TypeError):
                            return ""

                min_v = safe_num(raw_val.get('min'))
                max_v = safe_num(raw_val.get('max'))
                if min_v != "":
                    vars_dict['min'] = min_v
                if max_v != "":
                    vars_dict['max'] = max_v

                if min_v == "" and max_v == "":
                    state = "isEmpty"
                elif min_v != "" and max_v == "":
                    state = "min_only"
                elif min_v == "" and max_v != "":
                    state = "max_only"
                else:
                    state = "range"
            elif cleaned_val == "" or cleaned_val is None or cleaned_val == []:
                state = "isEmpty"

            if state != "isEmpty":
                def translate(v):
                    if isinstance(v, list):
                        return [translate(x) for x in v]
                    if isinstance(v, str):
                        if key == 'bhv':
                            current_channel = user_data.get('channel', ['ALL'])
                            ch_name = (current_channel[0]
                                       if isinstance(current_channel, list) and current_channel
                                       else current_channel)
                            if not ch_name:
                                ch_name = 'ALL'
                            return self.bhv_translator.get(
                                (current_pkg, str(ch_name), v),
                                self.bhv_translator.get((current_pkg, 'ALL', v), v)
                            )
                        return self.dim_translator.get(
                            (current_pkg, v), self.id_translator.get(v, v)
                        )
                    return v

                final_val = translate(cleaned_val)

                if isinstance(final_val, dict):
                    temp = final_val.copy()
                    for vk, vv in temp.items():
                        if isinstance(vv, str) and re.match(r'\d{4}-\d{2}-\d{2}', vv):
                            temp[vk] = vv.replace('-', '')
                    final_val = temp

                if isinstance(final_val, (str, int, float, list)):
                    vars_dict['val'] = final_val
                if not vars_dict and final_val:
                    vars_dict['val'] = final_val

            if pd.isna(template_str) or str(template_str).strip() in ["", "-", "nan"]:
                if state == "isEmpty":
                    continue
                val_to_write = vars_dict.get('val', cleaned_val)
                if key in ['channel', 'stdBrand', 'leafCates', 'bhv', 'title', 'types', 'keywords']:
                    if not isinstance(val_to_write, list):
                        val_to_write = [val_to_write]
                self._merge_path(selection_lv3, str(json_path).strip(), val_to_write)
                continue

            try:
                strategies = json.loads(template_str)
                if isinstance(strategies, dict):
                    strategies = [strategies]
                elif not isinstance(strategies, list):
                    continue
            except (json.JSONDecodeError, TypeError):
                continue

            matched_template = None
            for strat in strategies:
                cond = strat.get('trigger') or strat.get('if')
                if cond == state:
                    matched_template = strat.get('template')
                    break
                if cond in ['hasValue', 'HAS_VALUE'] and state != 'isEmpty':
                    matched_template = strat.get('template')
                    break

            if not matched_template:
                for strat in strategies:
                    if strat.get('trigger') in ['default', 'DEFAULT']:
                        matched_template = strat.get('template')
                        break

            if matched_template:
                s = json.dumps(matched_template)
                for v_key, v_val in vars_dict.items():
                    val_str = (json.dumps(v_val, ensure_ascii=False)
                               if isinstance(v_val, (list, dict))
                               else str(v_val))
                    s = s.replace(f'"${{{v_key}}}"', val_str)
                    if v_key in ['start', 'end', 'days']:
                        s = s.replace(f": {val_str}", f': "{val_str}"')
                    s = s.replace(f"${{{v_key}}}", val_str)
                try:
                    self._merge_path(selection_lv3, str(json_path).strip(), json.loads(s))
                except Exception as e:
                    app.logger.error("合并路径报错 [pkg=%s key=%s]: %s", current_pkg, key, e)

        # Base Template 合并
        base_tmpl = {}
        try:
            pkg_rows = self.params_df[self.params_df['Crowd_Package'].apply(
                lambda x: current_pkg in [p.strip() for p in str(x).split(',') if pd.notna(x)]
            )]
            if not pkg_rows.empty:
                tmpl_str = pkg_rows.iloc[0]['Base_Template']
                if pd.notna(tmpl_str) and str(tmpl_str).strip() != "":
                    base_tmpl = json.loads(tmpl_str)
        except Exception as e:
            app.logger.error("解析 Base_Template 失败 [%s]: %s", current_pkg, e)

        for k, v in selection_lv3.items():
            if k in base_tmpl and isinstance(base_tmpl[k], dict) and isinstance(v, dict):
                self._deep_update(base_tmpl[k], v)
            else:
                base_tmpl[k] = v

        if "selectionLv3" not in base_tmpl:
            base_tmpl["selectionLv3"] = {}

        base_tmpl["fromPoolId"] = 0
        if 'channel' in user_data:
            channel_val = user_data['channel']
            base_tmpl["selectionLv2Name"] = (
                channel_val[0] if isinstance(channel_val, list) and channel_val
                else str(channel_val)
            )

        return {
            "crowdName": "未命名",
            "list": [base_tmpl],
            "compute": "(0)"
        }

    # ---- JSON 路径合并工具 ----
    @staticmethod
    def _merge_path(doc, path, val):
        keys = path.split('.')
        curr = doc
        for k in keys[:-1]:
            curr = curr.setdefault(k, {})
        target = keys[-1]
        if target in curr and isinstance(curr[target], dict) and isinstance(val, dict):
            ConfigEngine._deep_update(curr[target], val)
        else:
            curr[target] = val

    @staticmethod
    def _deep_update(target, source):
        for k, v in source.items():
            if k in target and isinstance(target[k], dict) and isinstance(v, dict):
                ConfigEngine._deep_update(target[k], v)
            else:
                target[k] = v


# ========================================================================
# 初始化引擎 (模块级别单例)
# ========================================================================
engine = ConfigEngine()


# ========================================================================
# API 路由
# ========================================================================

@app.route('/api/packages')
def get_packages():
    return jsonify(list(engine.packages.keys()))


@app.route('/api/health')
def health_check():
    """健康检查端点 — 用于监控、负载均衡探测、自动重启脚本"""
    return jsonify({
        "status": "ok",
        "mode": "production" if IS_PRODUCTION else "development",
        "packages": len(engine.packages),
        "cached_meta": len(engine._meta_cache),
        "cached_logic": len(engine._logic_cache)
    })


@app.route('/api/meta/<package_name>')
def get_package_meta(package_name):
    return jsonify(engine.get_package_meta(package_name))


@app.route('/api/package_meta', methods=['GET'])
def get_package_meta_alias():
    name = request.args.get('name')
    if not name:
        return jsonify({"error": "缺少name参数"}), 400
    return jsonify(engine.get_package_meta(name))


@app.route('/api/generate_json', methods=['POST'])
def generate_json_alias():
    data = request.json
    pkg_name = data.get('pkgName')
    params = data.get('params', {})
    params['_package'] = pkg_name
    try:
        result = engine.generate_json(params)
        return jsonify(result)
    except Exception as e:
        app.logger.error("generate_json 失败 [%s]: %s", pkg_name, e)
        return jsonify({"error": str(e)}), 500


@app.route('/api/generate', methods=['POST'])
def generate():
    try:
        return jsonify(engine.generate_json(request.json))
    except Exception as e:
        app.logger.error("generate 失败: %s", e)
        return jsonify({"error": str(e)}), 500


# ---- 模板管理 ----
TEMPLATE_DIR = os.path.join(BASE_DIR, '批量圈人模板')


@app.route('/api/list_templates')
def list_templates():
    if not os.path.exists(TEMPLATE_DIR):
        return jsonify([])
    files = [f for f in os.listdir(TEMPLATE_DIR) if f.endswith(('.csv', '.xlsx'))]
    return jsonify(files)


@app.route('/api/download_template/<filename>')
def download_template(filename):
    if '/' in filename or '\\' in filename:
        abort(404)
    if not filename.endswith(('.csv', '.xlsx')):
        abort(404)
    return send_from_directory(TEMPLATE_DIR, filename, as_attachment=True)


# ---- 批量生成 ----
@app.route('/api/batch_generate', methods=['POST'])
def batch_generate():
    if 'file' not in request.files:
        return jsonify({"error": "未收到文件"}), 400

    file = request.files['file']
    detected_pkg = '类目公域行为'
    if '_' in file.filename:
        parts = file.filename.split('_')
        if len(parts) >= 2:
            detected_pkg = parts[1]

    try:
        content = file.read().decode('utf-8-sig')
    except (UnicodeDecodeError, LookupError):
        file.seek(0)
        content = file.read().decode('gbk')

    df_upload = pd.read_csv(io.StringIO(content))
    df_upload.columns = [str(c).strip() for c in df_upload.columns]

    pkg_params = engine.params_df[engine.params_df['Crowd_Package'].str.contains(detected_pkg, na=False)]
    label_to_key = {str(r['Label']).strip(): str(r['Param_Key']).strip() for _, r in pkg_params.iterrows()}
    key_to_widget = {str(r['Param_Key']).strip(): str(r['Widget_Type']).strip() for _, r in pkg_params.iterrows()}

    final_results = []
    errors = []
    first_col = df_upload.columns[0]

    for idx, row in df_upload.iterrows():
        crowd_name = str(row[first_col]).strip() if pd.notna(row[first_col]) else f"未命名包_{idx}"
        payload = {'_package': detected_pkg}

        for cn_label, val in row.items():
            if cn_label == first_col or pd.isna(val):
                continue
            eng_key = label_to_key.get(cn_label)
            if not eng_key:
                continue

            val_str = str(val).strip()
            w_type = key_to_widget.get(eng_key)

            if w_type in ['复选组', '搜索多选', '列表输入', '下拉多选']:
                payload[eng_key] = [s.strip() for s in re.split(r'[,，]', val_str) if s.strip()]
            elif w_type == '数值_切换' and val_str != '不限':
                if '≥' in val_str or '>=' in val_str:
                    payload[eng_key] = {'min': re.sub(r'[^0-9.]', '', val_str), 'max': None}
                elif '-' in val_str:
                    pts = val_str.split('-')
                    payload[eng_key] = {'min': pts[0].strip(), 'max': pts[1].strip()}
            elif w_type == '日期_切换':
                if '天' in val_str:
                    payload[eng_key] = {'min': 'recent', 'val': {'days': int(re.sub(r'[^0-9]', '', val_str))}}
                elif '-' in val_str:
                    pts = val_str.split('-')
                    if len(pts) == 2:
                        payload[eng_key] = {
                            'min': 'range',
                            'val': {'start': pts[0].replace('-', ''), 'end': pts[1].replace('-', '')}
                        }
            else:
                payload[eng_key] = val_str

        try:
            node_json = engine.generate_json(payload)
            if node_json and node_json.get('list'):
                node_json['list'][0]['fromPoolId'] = 0
                final_results.append({
                    "crowdName": crowd_name,
                    "pkgName": detected_pkg,
                    "localParams": payload,
                    "list": node_json['list'],
                    "compute": "(0)"
                })
        except Exception as e:
            app.logger.error("批量生成第 %d 行失败 [%s]: %s", idx, crowd_name, e)
            errors.append({
                "row": int(idx),
                "crowdName": crowd_name,
                "error": str(e)
            })

    app.logger.info("批量生成完成: %s → %d 成功, %d 失败", file.filename, len(final_results), len(errors))
    return jsonify({"results": final_results, "detected_pkg": detected_pkg, "errors": errors})


# ---- 统一错误处理 ----
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "接口不存在"}), 404


@app.errorhandler(500)
def internal_error(e):
    app.logger.error("500 异常: %s", e, exc_info=True)
    return jsonify({"error": "服务器内部错误"}), 500


# ========================================================================
# 入口 — Gunicorn 使用 app 对象, 本地开发使用 python app.py
# ========================================================================
if __name__ == '__main__':
    # 本地开发: flask run 自带热重载与 debug 工具
    app.run(
        debug=not IS_PRODUCTION,
        host='127.0.0.1',
        port=5000
    )
