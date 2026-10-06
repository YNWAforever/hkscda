# UI／performance evidence資格 · 2026-10-06

## 歷史same-environment before／after

[原始報告](ui-performance.md)、[runvalues](performance-runs.csv)及[medians](performance-comparison.csv)保持原檔。Before=f8d5e5d5840d1775efb7d7f4ae2768f6557096b5；after是當時未提交T01/T02；fixture SHA256=be308879dc4f4fedea961a021ddc15f7df293e31abf6afea274a7d5bb56b4140。Chrome148.0.7778.96、同Windows／390×844與1440×900／每route三coldruns。不是目前main4bb或Task13新source的before-after。

Mobilehomepage score97→93、LCP2404→2545ms、TBT43→60ms是實測退步，仍未解釋。Desktopdonate100→99及capturebyte不同，visualcause未建立；不得稱改善。Instructions兩viewport及mobile-donate前後bytes相同，只證明該fixture畫面相同，不是hostedjourney。所有route實際數值保留原表，不挑選改善項目掩蓋退步。

## Task13目前獨立qualitygates

2026-10-06 local loopback synthetic fixture 54329＋preview4173、provider secrets cleared：brand26routes×5viewports exit0；a11y26routes×1viewport exit0；performance4routes×2viewports×3cold=24samples，score95–100 exit0。Actualcommands/PIDs/stdoutSHA在 [evidence](release-evidence-20261006.json)。這是current-only，不是歷史before-after 改善證據。

R09 hosted兩地30cold/warm NOT_RUN；無DBregionmove／paidinfra／provider試驗。R11既有font100→1／PDF4.34MB不等於rareglyph/size問題關閉。Hostedlatency／30coldwarm須另批准受控驗收，不從localLighthouse分數推論。
