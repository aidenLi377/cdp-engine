# app.py (全自动扫描引擎版 - 强化抗压版 + Drawer 兼容)
from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import json
import re
import os
import glob

app = Flask(__name__)
CORS(app)


class ConfigEngine:
    def __init__(self):
        self.load_config()

    def load_config(self):
        import os, glob, re
        try:
            self.params_df = pd.read_csv("1.参数表.csv", encoding='gb18030')
        except:
            self.params_df = pd.read_csv("1.参数表.csv", encoding='utf-8')

        self.params_df.columns = [c.strip() for c in self.params_df.columns]

        for col in self.params_df.columns:
            if self.params_df[col].dtype == 'object':
                self.params_df[col] = self.params_df[col].apply(lambda x: str(x).strip() if pd.notna(x) else x)

        self.packages = {}
        logic_files = glob.glob("*_逻辑表.csv")

        def sort_key(filename):
            match = re.match(r'^(\d+)', filename)
            return int(match.group(1)) if match else 999

        logic_files.sort(key=sort_key)
        for f in logic_files:
            base_name = f.split('_逻辑表')[0]
            pkg_name = re.sub(r'^\d+\.', '', base_name)
            self.packages[pkg_name] = f

        self.label_map = {}
        for _, row in self.params_df.iterrows():
            if pd.notna(row['Label']):
                cn_name = str(row['Label']).strip()
                eng_key = str(row['Param_Key']).strip()
                self.label_map[cn_name] = eng_key
                if "关键词" in cn_name: self.label_map[cn_name.replace("关键词", "关键字")] = eng_key

        self.id_translator = {}
        self.dimensions = {}
        self._load_special_dimensions()

    def _load_special_dimensions(self):
        def safe_read(filename):
            if not os.path.exists(filename): return pd.DataFrame()
            try:
                try:
                    df = pd.read_csv(filename, encoding='utf-8')
                except:
                    df = pd.read_csv(filename, encoding='gb18030')
                return df.where(pd.notnull(df), "")
            except:
                return pd.DataFrame()

        self.bhv_translator = {}
        self.bhv_options = {}

        df_bhv = safe_read("行为维表.csv")
        for _, row in df_bhv.iterrows():
            pkg = str(row.get('适用的包', '')).strip()
            name = str(row.get('行为名称', '')).strip()
            val = f"{row.get('ID', '')}#|#{row.get('Value', '')}"
            if not name or not pkg: continue

            if pkg and name:
                channel_name = str(row.get('适用的渠道', 'ALL')).strip()
                if not channel_name or channel_name.lower() == 'nan':
                    channel_name = 'ALL'
                self.bhv_translator[(pkg, channel_name, name)] = val

            if pkg not in self.bhv_options: self.bhv_options[pkg] = []
            if name not in self.bhv_options[pkg]: self.bhv_options[pkg].append(name)

        self.dim_translator = {}
        self.attr_options = {}

        loaders = [
            ("渠道维表.csv", "渠道名称", lambda r: f"{r.get('parentId', '')}#|#{r.get('BizID', '')}"),
            ("类目维表.csv", 1, lambda r: f"{r.get('cateId', '')}#|#{r.get('cateId', '')}"),
            ("品牌维表.csv", 1, lambda r: str(r.iloc[1]).strip()),
            ("状态维表.csv", "状态名称", lambda r: f"{r.get('ID', '')}#|#{r.get('Value', '')}"),
            ("商品类型维表.csv", "类型名称", lambda r: str(r.get('ID', '')).strip()),
            ("账号维表.csv", "账号名称", lambda r: str(r.get('ID', '')).strip()),
            ("属性值维表.csv", "属性值名称", lambda r: str(r.get('ID', '')).strip()),
        ]

        for fname, name_col, id_func in loaders:
            df = safe_read(fname)
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

                    if not name: continue
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
                except:
                    continue
            self.dimensions[fname] = list(dict.fromkeys(self.dimensions[fname]))

    def get_package_meta(self, package_name):
        self.load_config()

        logic_filename = self.packages.get(package_name)
        if not logic_filename or not os.path.exists(logic_filename): return {}

        full_schema = []
        current_label_map = {}

        for _, config in self.params_df.iterrows():
            pkg_col = config.get('Crowd_Package', '')
            if pd.isna(pkg_col): continue
            if package_name not in [p.strip() for p in str(pkg_col).split(',')]: continue

            if pd.notna(config.get('Label')):
                cn_name = str(config.get('Label')).strip()
                eng_key = str(config.get('Param_Key')).strip()
                current_label_map[cn_name] = eng_key
                if "关键词" in cn_name:
                    current_label_map[cn_name.replace("关键词", "关键字")] = eng_key

            item = config.to_dict()
            for k, v in item.items():
                if pd.isna(v): item[k] = ""

            item['key'] = config['Param_Key']
            data_source = item.get('Data_Source')

            if data_source == '行为维表.csv':
                opts = self.bhv_options.get(package_name, [])
                item['options'] = opts.copy() if isinstance(opts, list) else []
            else:
                opts = self.attr_options.get((package_name, data_source),
                                             self.dimensions.get(data_source, []))
                item['options'] = opts.copy() if isinstance(opts, list) else []

            if package_name in ['AIPL状态', '商品行为'] and item['key'] in ['cate', 'leafCates']:
                if '全部' not in item['options']:
                    item['options'].insert(0, '全部')

            is_def_raw = str(item.get('Is_Default', '0')).strip().lower()
            is_def_clean = is_def_raw.replace('.0', '')
            item['isDefault'] = is_def_clean in ['1', 'true', 'yes', '是']
            full_schema.append(item)

        logic_matrix = {}
        try:
            try:
                temp_df = pd.read_csv(logic_filename, encoding='utf-8')
            except:
                temp_df = pd.read_csv(logic_filename, encoding='gb18030')

            trigger_cols = []
            for expected in ['渠道', '行为', '状态']:
                for col in temp_df.columns:
                    if col.strip() == expected:
                        first_val = str(temp_df[col].dropna().iloc[0]).strip() if not temp_df[
                            col].dropna().empty else ""
                        if first_val not in ['1', '1.0', 'True', 'TRUE']:
                            trigger_cols.append(col.strip())

            if not trigger_cols: trigger_cols = [temp_df.columns[0]]

            for _, row in temp_df.iterrows():
                key_parts = [str(row[c]).strip() for c in trigger_cols]
                composite_key = "|".join(key_parts)

                visible_fields = []
                for col_name, val in row.items():
                    if col_name.strip() not in trigger_cols:
                        if str(val).strip() in ['1', '1.0', 'True', 'TRUE', 'true']:
                            cn = col_name.strip()
                            real_key = current_label_map.get(cn, cn)
                            if real_key: visible_fields.append(real_key)
                logic_matrix[composite_key] = visible_fields
        except Exception as e:
            print(f"🚨 逻辑表读取异常: {e}")

        return {"schema": full_schema, "matrix": logic_matrix}

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
            if matched_rows.empty: continue

            config = matched_rows.iloc[0]
            template_str = config.get('Backend_Template')
            json_path = config.get('JSON_Path')

            if pd.isna(json_path) or str(json_path).strip() == "-": continue

            cleaned_val = raw_val
            vars_dict = {}
            state = "hasValue"

            if isinstance(raw_val, dict) and 'val' in raw_val:
                cleaned_val = raw_val['val']
                if isinstance(cleaned_val, dict): vars_dict.update(cleaned_val)
            if isinstance(raw_val, dict) and raw_val.get('min') in ['recent', 'range']:
                state = raw_val.get('min')
                if isinstance(raw_val.get('val'), dict):
                    temp_val = raw_val['val'].copy()
                    if 'days' in temp_val: temp_val['days'] = str(temp_val['days'])
                    vars_dict.update(temp_val)
            elif isinstance(raw_val, dict) and ('min' in raw_val or 'max' in raw_val):
                def safe_num(x):
                    if x is None or str(x).strip() == "": return ""
                    try:
                        return int(x)
                    except:
                        try:
                            return float(x)
                        except:
                            return ""

                min_v = safe_num(raw_val.get('min'))
                max_v = safe_num(raw_val.get('max'))
                if min_v != "": vars_dict['min'] = min_v
                if max_v != "": vars_dict['max'] = max_v

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
                    if isinstance(v, list): return [translate(x) for x in v]
                    if isinstance(v, str):
                        if key == 'bhv':
                            current_channel = user_data.get('channel', ['ALL'])
                            ch_name = current_channel[0] if isinstance(current_channel,
                                                                       list) and current_channel else current_channel
                            if not ch_name:
                                ch_name = 'ALL'
                            return self.bhv_translator.get((current_pkg, str(ch_name), v),
                                                           self.bhv_translator.get((current_pkg, 'ALL', v), v))

                        return self.dim_translator.get((current_pkg, v), self.id_translator.get(v, v))
                    return v

                final_val = translate(cleaned_val)

                if isinstance(final_val, dict):
                    temp = final_val.copy()
                    for k, v in temp.items():
                        if isinstance(v, str) and re.match(r'\d{4}-\d{2}-\d{2}', v):
                            temp[k] = v.replace('-', '')
                    final_val = temp

                if isinstance(final_val, (str, int, float, list)): vars_dict['val'] = final_val
                if not vars_dict and final_val: vars_dict['val'] = final_val

            if pd.isna(template_str) or str(template_str).strip() in ["", "-", "nan"]:
                if state == "isEmpty": continue
                val_to_write = vars_dict.get('val', cleaned_val)
                if key in ['channel', 'stdBrand', 'leafCates', 'bhv', 'title', 'types', 'keywords']:
                    if not isinstance(val_to_write, list): val_to_write = [val_to_write]
                self._merge_path(selection_lv3, str(json_path).strip(), val_to_write)
                continue

            try:
                strategies = json.loads(template_str)
                if isinstance(strategies, dict):
                    strategies = [strategies]
                elif not isinstance(strategies, list):
                    continue
            except:
                continue

            matched_template = None
            for strat in strategies:
                cond = strat.get('trigger') or strat.get('if')
                if cond == state: matched_template = strat.get('template'); break
                if cond in ['hasValue', 'HAS_VALUE'] and state != 'isEmpty': matched_template = strat.get(
                    'template'); break

            if not matched_template:
                for strat in strategies:
                    if strat.get('trigger') in ['default', 'DEFAULT']:
                        matched_template = strat.get('template');
                        break

            if matched_template:
                s = json.dumps(matched_template)
                for v_key, v_val in vars_dict.items():
                    val_str = json.dumps(v_val, ensure_ascii=False) if isinstance(v_val, (list, dict)) else str(v_val)
                    s = s.replace(f"\"${{{v_key}}}\"", val_str)
                    if v_key in ['start', 'end', 'days']:
                        s = s.replace(f": {val_str}", f": \"{val_str}\"")
                    s = s.replace(f"${{{v_key}}}", val_str)
                try:
                    self._merge_path(selection_lv3, str(json_path).strip(), json.loads(s))
                except Exception as e:
                    print(f"合并路径报错: {e}")

        base_tmpl = {}
        try:
            pkg_rows = self.params_df[self.params_df['Crowd_Package'].apply(
                lambda x: current_pkg in [p.strip() for p in str(x).split(',') if pd.notna(x)])]
            if not pkg_rows.empty:
                tmpl_str = pkg_rows.iloc[0]['Base_Template']
                if pd.notna(tmpl_str) and str(tmpl_str).strip() != "":
                    base_tmpl = json.loads(tmpl_str)
        except Exception as e:
            print(f"解析 Base_Template 失败: {e}")

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
            base_tmpl["selectionLv2Name"] = channel_val[0] if isinstance(channel_val, list) and channel_val else str(
                channel_val)

        final_payload = {
            "crowdName": "未命名",
            "list": [base_tmpl],
            "compute": "(0)"
        }
        return final_payload

    def _merge_path(self, doc, path, val):
        keys = path.split('.')
        curr = doc
        for k in keys[:-1]: curr = curr.setdefault(k, {})
        target = keys[-1]
        if target in curr and isinstance(curr[target], dict) and isinstance(val, dict):
            self._deep_update(curr[target], val)
        else:
            curr[target] = val

    def _deep_update(self, target, source):
        for k, v in source.items():
            if k in target and isinstance(target[k], dict) and isinstance(v, dict):
                self._deep_update(target[k], v)
            else:
                target[k] = v


engine = ConfigEngine()


@app.route('/api/packages')
def get_packages():
    return jsonify(list(engine.packages.keys()))


@app.route('/api/meta/<package_name>')
def get_package_meta(package_name):
    return jsonify(engine.get_package_meta(package_name))


# 🔴 [重构修复] 补全被引用的 Drawer 依赖接口：获取包 Meta
@app.route('/api/package_meta', methods=['GET'])
def get_package_meta_alias():
    name = request.args.get('name')
    if not name:
        return jsonify({"error": "缺少name参数"}), 400
    return jsonify(engine.get_package_meta(name))


# 🔴 [重构修复] 补全被引用的 Drawer 依赖接口：根据散装参数反向生成 JSON
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
        return jsonify({"error": str(e)}), 500


@app.route('/api/generate', methods=['POST'])
def generate():
    return jsonify(engine.generate_json(request.json))


TEMPLATE_DIR = r'E:\CDP_Project\批量圈人模板'


@app.route('/api/list_templates')
def list_templates():
    if not os.path.exists(TEMPLATE_DIR): return jsonify([])
    files = [f for f in os.listdir(TEMPLATE_DIR) if f.endswith('.csv') or f.endswith('.xlsx')]
    return jsonify(files)


@app.route('/api/download_template/<path:filename>')
def download_template(filename):
    from flask import send_from_directory
    return send_from_directory(TEMPLATE_DIR, filename, as_attachment=True)


@app.route('/api/batch_generate', methods=['POST'])
def batch_generate():
    import io
    if 'file' not in request.files: return jsonify({"error": "未收到文件"}), 400
    file = request.files['file']

    detected_pkg = '类目公域行为'
    if '_' in file.filename:
        parts = file.filename.split('_')
        if len(parts) >= 2: detected_pkg = parts[1]

    try:
        content = file.read().decode('utf-8-sig')
    except:
        file.seek(0)
        content = file.read().decode('gbk')

    df_upload = pd.read_csv(io.StringIO(content))
    df_upload.columns = [str(c).strip() for c in df_upload.columns]

    engine.load_config()
    pkg_params = engine.params_df[engine.params_df['Crowd_Package'].str.contains(detected_pkg, na=False)]
    label_to_key = {str(r['Label']).strip(): str(r['Param_Key']).strip() for _, r in pkg_params.iterrows()}
    key_to_widget = {str(r['Param_Key']).strip(): str(r['Widget_Type']).strip() for _, r in pkg_params.iterrows()}

    final_results = []
    first_col = df_upload.columns[0]

    for idx, row in df_upload.iterrows():
        crowd_name = str(row[first_col]).strip() if pd.notna(row[first_col]) else f"未命名包_{idx}"
        payload = {'_package': detected_pkg}

        for cn_label, val in row.items():
            if cn_label == first_col or pd.isna(val): continue
            eng_key = label_to_key.get(cn_label)
            if not eng_key: continue

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
                        payload[eng_key] = {'min': 'range',
                                            'val': {'start': pts[0].replace('-', ''), 'end': pts[1].replace('-', '')}}
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
            print(f"Row error: {e}")

    return jsonify({"results": final_results, "detected_pkg": detected_pkg})


if __name__ == '__main__':
    app.run(debug=True, port=5000)