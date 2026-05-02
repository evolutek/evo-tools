import { Dialog, DialogStatus } from "../utils/dialog";
import { Editor } from "./editor";
import { Project } from "../utils/project";
import { AIGraph } from "../graph/ai_graph_editor";

// Custom MIME type to mark our explorer payload — distinct from `text/plain`
// so a stray drag from outside the app (text selection, file) doesn't get
// interpreted as a reorder.
const DRAG_MIME = "application/x-explorer-entry";

export class ExplorerEntry {
  public element: HTMLElement;
  public name: string;
  private explorer: Explorer;

  public constructor(explorer: Explorer, element: HTMLElement, name: string) {
    this.explorer = explorer;
    this.element = element;
    this.name = name;
  }

  public open() {
    const graph = this.explorer.project.get_graph_by_name(this.name);
    this.explorer.editor.open_graph(graph);
  }

  public delete() {
    this.explorer.project.delete_graph(this.name);
    this.element.remove();
  }
}

export class Explorer {
  private create_btn: HTMLElement;
  private entry_container_elem: HTMLElement;
  private entry_template: HTMLTemplateElement;
  private new_graph_dialog: Dialog;
  private entries: ExplorerEntry[] = [];
  public project: Project;
  public editor: Editor;

  public constructor(project: Project, editor: Editor, new_graph_dialog: Dialog) {
    this.project = project;
    this.editor = editor;
    this.new_graph_dialog = new_graph_dialog;
    this.create_btn = document.getElementById("explorer_create_btn")!!;
    this.entry_container_elem = document.getElementById("explorer_entry_container")!!;
    this.entry_template = document.getElementById("explorer_entry_template")!! as HTMLTemplateElement;

    this.create_btn.addEventListener("click", () => this.on_create_btn_clicked());

    this.project.graph_created_event.on((graph) => this.on_graph_created(graph));
    this.project.graph_deleted_event.on((graph) => this.on_graph_deleted(graph));
    this.project.graph_reordered_event.on(() => this.on_graph_reordered());
    this.project.project_imported_event.on(() => this.on_project_imported());
  }

  private on_create_btn_clicked() {
    this.new_graph_dialog.open().then(({ status, result }) => {
      if (status === DialogStatus.COMPLETED) {
        this.project.create_graph(result.name);
      }
    });
  }

  private add_entry_to_ui(name: string): ExplorerEntry {
    const entry_elem = document.importNode(this.entry_template.content, true).firstElementChild!! as HTMLElement;
    const entry = new ExplorerEntry(this, entry_elem, name);

    entry_elem.addEventListener("click", (_) => entry.open());

    const name_elem = entry_elem.getElementsByClassName("explorer_entry_name")[0];
    name_elem.textContent = name;

    const delete_btn = entry_elem.getElementsByClassName("explorer_entry_delete_btn")[0];
    delete_btn.addEventListener("click", (ev) => {
      entry.delete();
      ev.stopPropagation();
    });

    this.attach_dnd_handlers(entry);

    this.entry_container_elem.appendChild(entry_elem);
    this.entries.push(entry);
    return entry;
  }

  // Native HTML5 DnD on each entry. The dragged entry carries its name in a
  // custom MIME so we can ignore unrelated drags. The dragover handler
  // computes whether the cursor is in the upper or lower half of the target
  // to decide insertion position; visual feedback is handled in CSS via the
  // `drag-over-top` / `drag-over-bottom` classes.
  private attach_dnd_handlers(entry: ExplorerEntry) {
    const el = entry.element;
    el.setAttribute("draggable", "true");

    el.addEventListener("dragstart", (ev) => {
      if (!ev.dataTransfer) return;
      ev.dataTransfer.setData(DRAG_MIME, entry.name);
      ev.dataTransfer.effectAllowed = "move";
      el.classList.add("dragging");
    });

    el.addEventListener("dragend", (_) => {
      el.classList.remove("dragging");
      this.clear_drag_indicators();
    });

    el.addEventListener("dragover", (ev) => {
      if (!ev.dataTransfer || !ev.dataTransfer.types.includes(DRAG_MIME)) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      const before = this.is_above_midpoint(el, ev.clientY);
      el.classList.toggle("drag-over-top", before);
      el.classList.toggle("drag-over-bottom", !before);
    });

    el.addEventListener("dragleave", (_) => {
      el.classList.remove("drag-over-top", "drag-over-bottom");
    });

    el.addEventListener("drop", (ev) => {
      if (!ev.dataTransfer) return;
      const source = ev.dataTransfer.getData(DRAG_MIME);
      el.classList.remove("drag-over-top", "drag-over-bottom");
      if (!source || source === entry.name) return;
      ev.preventDefault();
      const position: "before" | "after" = this.is_above_midpoint(el, ev.clientY) ? "before" : "after";
      this.project.move_graph(source, entry.name, position);
    });
  }

  private is_above_midpoint(el: HTMLElement, client_y: number): boolean {
    const rect = el.getBoundingClientRect();
    return client_y < rect.top + rect.height / 2;
  }

  private clear_drag_indicators() {
    for (const entry of this.entries) {
      entry.element.classList.remove("drag-over-top", "drag-over-bottom");
    }
  }

  public on_graph_created(graph: AIGraph): void {
    this.add_entry_to_ui(graph.get_name());
    this.editor.open_graph(graph);
  }

  public on_graph_deleted(graph: AIGraph): void {
    const index = this.entries.findIndex((entry) => entry.name === graph.get_name());
    if (index !== -1) {
      const entry = this.entries[index];
      entry.element.remove();
      this.entries.splice(index, 1);
    }
  }

  // Reorder existing DOM nodes to match the project's new order. Avoids
  // tearing down + rebuilding entries, which would lose any per-entry
  // state and re-trigger animations.
  public on_graph_reordered(): void {
    const by_name = new Map(this.entries.map((e) => [e.name, e]));
    const new_entries: ExplorerEntry[] = [];
    for (const graph of this.project.get_graphes()) {
      const entry = by_name.get(graph.get_name());
      if (entry === undefined) continue;
      this.entry_container_elem.appendChild(entry.element);
      new_entries.push(entry);
    }
    this.entries = new_entries;
  }

  public on_project_imported(): void {
    this.entries.forEach((entry) => entry.element.remove());
    this.entries = [];
    for (const graph of this.project.get_graphes()) {
      this.add_entry_to_ui(graph.get_name());
    }
  }
}
