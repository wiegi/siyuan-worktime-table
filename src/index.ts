import { Plugin, Setting, fetchPost, showMessage } from "siyuan";
import type { Protyle } from "siyuan";

import { getModalController } from "./modal";
import { fromSiyuanKramdown, toSiyuanMarkdown } from "./siyuanMarkdown";
import {
  buildCsvTable,
  buildMarkdownTable,
  calculateRows,
  parseWorktimeTableFromMarkdown,
  type InputRow,
} from "./markdown";

const STORAGE_NAME = "settings.json";

type Settings = {
  use12HourClock: boolean;
  disableTotalRowTimeRange: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  use12HourClock: false,
  disableTotalRowTimeRange: false,
};

function api<T = any>(url: string, data: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    fetchPost(url, data, (res: any) => {
      if (res?.code === 0) resolve(res.data as T);
      else reject(new Error(res?.msg || `Request failed: ${url}`));
    });
  });
}

function sanitizeRowText(
  value: string,
  options?: { stripLeadingWhitespace?: boolean },
): string {
  const sanitized = String(value ?? "").replace(/<!--wt:offset-->/g, "");
  return options?.stripLeadingWhitespace
    ? sanitized.trimStart()
    : sanitized.trim();
}

function normalizeRows(rows: InputRow[]): InputRow[] {
  return rows.map((r) => ({
    task: sanitizeRowText(r.task ?? "", { stripLeadingWhitespace: true }),
    start: sanitizeRowText(r.start ?? ""),
    end: sanitizeRowText(r.end ?? ""),
    ...(r.kind === "subtotal"
      ? { kind: "subtotal" as const }
      : r.kind === "offset"
        ? { kind: "offset" as const }
        : {}),
  }));
}

function isFullyEmptyRow(row: InputRow): boolean {
  if (row.kind === "subtotal") return false;
  const noTask = (row.task ?? "").trim().length === 0;
  const noStart = (row.start ?? "").trim().length === 0;
  if (row.kind === "offset") return noTask && noStart;
  return noTask && noStart && (row.end ?? "").trim().length === 0;
}

function sanitizeFilenamePart(value: string): string {
  const s = (value ?? "").trim();
  if (s.length === 0) return "untitled";
  return s
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob(["﻿", content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error.";
}

export default class WorktimeTablePlugin extends Plugin {
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private busy = false;

  async onload(): Promise<void> {
    const stored = await this.loadData(STORAGE_NAME);
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };

    this.protyleSlash = [
      {
        filter: ["worktime", "worktime table", "arbeitszeit"],
        html: `<div class="b3-list-item__first"><span class="b3-list-item__text">Worktime Table: Create table</span></div>`,
        id: "worktime-table-create",
        callback: (protyle: Protyle, nodeElement: HTMLElement) => {
          void this.createTable(protyle, nodeElement);
        },
      },
    ];

    this.eventBus.on("click-blockicon", ({ detail }) => {
      const el = detail.blockElements?.[0];
      if (detail.blockElements?.length !== 1 || !el) return;
      if (el.getAttribute("data-type") !== "NodeTable") return;
      const id = el.getAttribute("data-node-id");
      if (!id) return;
      detail.menu.addItem({
        id: "worktime-table-edit",
        icon: "iconEdit",
        label: "Worktime Table: Edit table",
        click: () => void this.editTable(id),
      });
      detail.menu.addItem({
        id: "worktime-table-csv",
        icon: "iconDownload",
        label: "Worktime Table: Export as CSV",
        click: () => void this.exportCsv(id),
      });
    });

    this.setupSettings();
  }

  onunload(): void {
    getModalController().close();
  }

  private setupSettings(): void {
    const mkCheckbox = (get: () => boolean, set: (v: boolean) => void) => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "b3-switch fn__flex-center";
      input.checked = get();
      input.addEventListener("change", () => set(input.checked));
      return input;
    };

    this.setting = new Setting({
      confirmCallback: () => {
        void this.saveData(STORAGE_NAME, this.settings);
      },
    });
    this.setting.addItem({
      title: "Use 12-hour clock (AM/PM)",
      description:
        "Start/End times are displayed as h:mm AM/PM. Input accepts both 24h and 12h formats.",
      createActionElement: () =>
        mkCheckbox(
          () => this.settings.use12HourClock,
          (v) => (this.settings.use12HourClock = v),
        ),
    });
    this.setting.addItem({
      title: "Disable Start/End in Total row",
      description:
        "Hide Start and End in Total rows and only show duration totals.",
      createActionElement: () =>
        mkCheckbox(
          () => this.settings.disableTotalRowTimeRange,
          (v) => (this.settings.disableTotalRowTimeRange = v),
        ),
    });
  }

  private tableOptions() {
    return {
      use12HourClock: this.settings.use12HourClock,
      showTotalRowTimeRange: !this.settings.disableTotalRowTimeRange,
    };
  }

  private async openDialog(initialRows: InputRow[]): Promise<string | null> {
    const result = await getModalController().open({
      initialRows,
      use12HourClock: this.settings.use12HourClock,
    });
    if (!result) return null;
    const rows = normalizeRows(result.rows).filter((r) => !isFullyEmptyRow(r));
    return toSiyuanMarkdown(
      buildMarkdownTable(calculateRows(rows), this.tableOptions()),
    );
  }

  private async createTable(
    _protyle: Protyle,
    nodeElement: HTMLElement,
  ): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const id = nodeElement.getAttribute("data-node-id");
      if (!id) throw new Error("No active block found.");
      const text = (nodeElement.textContent ?? "")
        .replace(/[​\s]/g, "")
        .trim();

      const md = await this.openDialog([{ task: "", start: "", end: "" }]);
      if (!md) return;

      if (text.length === 0 || text.startsWith("/")) {
        await api("/api/block/updateBlock", {
          dataType: "markdown",
          data: md,
          id,
        });
      } else {
        await api("/api/block/insertBlock", {
          dataType: "markdown",
          data: md,
          previousID: id,
        });
      }
      showMessage("Worktime table inserted.", 3000, "info");
    } catch (e) {
      showMessage(errMsg(e), 6000, "error");
    } finally {
      this.busy = false;
    }
  }

  private async readTable(id: string) {
    const { kramdown } = await api<{ kramdown: string }>(
      "/api/block/getBlockKramdown",
      { id, mode: "md" },
    );
    return parseWorktimeTableFromMarkdown(fromSiyuanKramdown(kramdown), 500);
  }

  private async editTable(id: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const parsed = await this.readTable(id);
      if (!parsed.ok) {
        showMessage(parsed.message, 6000, "error");
        return;
      }
      const md = await this.openDialog(parsed.rows);
      if (!md) return;
      await api("/api/block/updateBlock", {
        dataType: "markdown",
        data: md,
        id,
      });
      showMessage("Worktime table updated.", 3000, "info");
    } catch (e) {
      showMessage(errMsg(e), 6000, "error");
    } finally {
      this.busy = false;
    }
  }

  private async exportCsv(id: string): Promise<void> {
    try {
      const parsed = await this.readTable(id);
      if (!parsed.ok) {
        showMessage(parsed.message, 6000, "error");
        return;
      }
      const csv = buildCsvTable(
        calculateRows(normalizeRows(parsed.rows)),
        this.tableOptions(),
      );
      let name = "";
      try {
        const info = await api<{ rootTitle?: string }>(
          "/api/block/getBlockInfo",
          { id },
        );
        name = info.rootTitle ?? "";
      } catch {}
      const filename = name
        ? `worktime-table_${sanitizeFilenamePart(name)}.csv`
        : "worktime-table.csv";
      downloadTextFile(filename, csv);
      showMessage(`Exported CSV: ${filename}`, 3000, "info");
    } catch (e) {
      showMessage(errMsg(e), 6000, "error");
    }
  }
}
