# T06 / R11 收條字型驗收補充 · 2026-10-06

依原 T06 的指定實驗，使用現有授權字型及相同 Windows host，產生常見中文、罕字、120 字長名及中英混合的合成收條，比較完整嵌入與 subset。這是驗收實驗，不替換字型、不修改正式收條程式。

決策：保留既有 single-flight bytes cache 及 `subset:false`。四個 subset 樣本均有可見缺字，因此不接受以縮小檔案為由啟用 subset。現有完整字型亦未覆蓋 `靐` / `𠮷`，大小及罕字子項保持 open。字型未來方案須同時驗證實際渲染、文字抽取、長名換行及完整字元覆蓋；需 approved font / policy 才可發布。

完整命令、native exit、SHA、同環境數據、before/after 畫面及未測界線見 [執行證據](../../../evidence/audit-remediation-20260927/r11-font-acceptance-20261006.md)。R01 Task1 / Task8 與正式 migration 的批准問題繼續獨立處理；本實驗不解除其 gate。
