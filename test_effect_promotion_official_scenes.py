"""Keep Xdata's effect-promotion scene codes aligned with official metadata.

The reference is the official behavior/scene response supplied on 2026-10-09.
Display ordering is intentionally not part of this mapping regression test.
"""

import csv
import unittest
from pathlib import Path

from cdp_backend.engine import ConfigEngine


OFFICIAL_SCENES = {
    "曝光": {
        "376": ("货品运营", "19111"),
        "371": ("关键词推广(原淘内广告/直通车)", "15403"),
        "372": ("精准人群推广(整合原消费者运营)", "15405"),
        "144": ("获客易", "15386"),
        "427": ("其他场景推广-多目标直投", "19110"),
        "154": ("其他场景推广-活动加速", "15392"),
        "361": ("其他场景推广-全店智投(原全店推)", "15394"),
        "-100": ("其他场景推广-其他(对应原服务商场景)", "15396"),
        "158": ("货品运营-测款快", "15348"),
        "105": ("货品运营-上新快", "15363"),
        "114": ("货品运营-货品加速", "15369"),
        "78": ("消费者运营-拉新快", "15374"),
        "133": ("消费者运营-会员快", "15378"),
        "370": ("消费者运营-人群击穿", "15382"),
        "189": ("消费者运营-追投快", "15388"),
        "407": ("消费者运营-粉丝快", "15390"),
        "-999": ("原万相台-电商场景", "15401"),
    },
    "点击": {
        "376": ("货品运营", "19113"),
        "371": ("关键词推广(原淘内广告/直通车)", "15402"),
        "372": ("精准人群推广(整合原消费者运营)", "15404"),
        "144": ("获客易", "15385"),
        "427": ("其他场景推广-多目标直投", "19112"),
        "154": ("其他场景推广-活动加速", "15391"),
        "361": ("其他场景推广-全店智投(原全店推)", "15393"),
        "-100": ("其他场景推广-其他(对应原服务商场景)", "15395"),
        "158": ("货品运营-测款快", "15347"),
        "105": ("货品运营-上新快", "15362"),
        "114": ("货品运营-货品加速", "15368"),
        "78": ("消费者运营-拉新快", "15373"),
        "133": ("消费者运营-会员快", "15377"),
        "370": ("消费者运营-人群击穿", "15381"),
        "189": ("消费者运营-追投快", "15387"),
        "407": ("消费者运营-粉丝快", "15389"),
        "-999": ("原万相台-电商场景", "15400"),
    },
    "观看": {
        "108": ("超级直播", "15397"),
        "183": ("超级短视频", "15398"),
        "341": ("短直联动", "15399"),
    },
}


class EffectPromotionOfficialScenesTest(unittest.TestCase):
    def test_scene_codes_match_official_metadata(self):
        path = Path(__file__).with_name("场景维表.csv")
        with path.open(encoding="utf-8-sig", newline="") as source:
            rows = [
                row for row in csv.DictReader(source)
                if row["适用的包"] == "效果推广"
            ]

        self.assertEqual(len(rows), 37)
        for behavior, expected in OFFICIAL_SCENES.items():
            actual = {
                row["Value"]: (row["场景名称"], row["ID"])
                for row in rows if row["适用的行为"] == behavior
            }
            with self.subTest(behavior=behavior):
                self.assertEqual(actual, expected)

    def test_generated_click_scene_codes_match_official_metadata(self):
        engine = ConfigEngine(validate_on_load=False)
        for value, (name, scene_id) in OFFICIAL_SCENES["点击"].items():
            with self.subTest(scene=name):
                self.assertEqual(
                    engine.scene_translator[("效果推广", "点击", name)],
                    f"{scene_id}#|#{value}",
                )

    def test_generated_json_uses_official_click_scene_code(self):
        engine = ConfigEngine(validate_on_load=False)
        generated = engine.generate_json({
            "_package": "效果推广",
            "account": "dior迪奥官方旗舰店",
            "bhv": "点击",
            "onebp_scene": ["精准人群推广(整合原消费者运营)"],
            "dayFrequency": {"min": "", "max": ""},
            "time": {"val": {"days": 30}, "min": "recent"},
        })
        self.assertEqual(
            generated["list"][0]["selectionLv3"]["onebp_scene"],
            ["15404#|#372"],
        )


if __name__ == "__main__":
    unittest.main()
