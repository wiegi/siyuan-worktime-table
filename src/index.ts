import { Plugin } from "siyuan";

export default class WorktimeTablePlugin extends Plugin {
  onload(): void {
    // TODO: slash command (protyleSlash), block menu (click-blockicon), dialog, settings.
    console.info("[siyuan-worktime-table] loaded");
  }

  onunload(): void {}
}
