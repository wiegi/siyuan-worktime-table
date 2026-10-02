import { describe, expect, it } from "vitest";
import { fromSiyuanKramdown } from "./siyuanMarkdown";
import { parseWorktimeTableFromMarkdown } from "./markdown";

const R = `{: style="text-align: right;"}`;
const kramdown = [
  `|Task|${R}Start|${R}End|${R}Duration|${R}Duration (dec.)|`,
  `| -------| ------------------------------------: | ------------------------------------: | ---------------------------------------: | ----------------------------------------------: |`,
  `|A|${R}08:00|${R}10:00|${R}02:00|${R}2.00|`,
  `|[!--wt:offset--](!--wt:offset--)Break|${R}|${R}|${R}-00:30|${R}0.00|`,
  `|**Day**|${R}**08:00**|${R}**09:30**|${R}**01:30**|${R}**1.50**|`,
  `|**Total**|${R}**08:00**|${R}**09:30**|${R}**01:30**|${R}**1.50**|`,
  `{: id="20261002132900-4bnaeeh" updated="20261002132900"}`,
].join("\n");

describe("fromSiyuanKramdown", () => {
  it("lets the shared parser read SiYuan table markdown", () => {
    const parsed = parseWorktimeTableFromMarkdown(fromSiyuanKramdown(kramdown));
    expect(parsed).toEqual({
      ok: true,
      rows: [
        { task: "A", start: "08:00", end: "10:00" },
        { kind: "offset", task: "Break", start: "-0.50", end: "" },
        { kind: "subtotal", task: "Day", start: "", end: "" },
      ],
    });
  });
});
