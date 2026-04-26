import { Dialog, DialogStatus } from "../utils/dialog";
import { Editor } from "./editor";
import { Project } from "../utils/project";
import { AIGraph } from "../graph/ai_graph_editor";

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

    this.entry_container_elem.appendChild(entry_elem);
    this.entries.push(entry);
    return entry;
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

  public on_project_imported(): void {
    this.entries.forEach((entry) => entry.element.remove());
    this.entries = [];
    for (const graph of this.project.get_graphes()) {
      this.add_entry_to_ui(graph.get_name());
    }
  }
}
