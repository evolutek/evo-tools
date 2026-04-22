import { Dialog, DialogStatus } from "../utils/dialog";
import { Editor } from "./editor";
import { Project } from "../project";

export class ExplorerEntry {
  private element: HTMLElement;
  private name: string;
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
  }

  private on_create_btn_clicked() {
    this.new_graph_dialog.open().then(({ status, result }) => {
      if (status === DialogStatus.COMPLETED) {
        this.create_new_graph(result.name);
      }
    });
  }

  private create_new_graph(name: string) {
    const entry_elem = document.importNode(this.entry_template.content, true).firstElementChild!! as HTMLElement;
    entry_elem.addEventListener("click", () => entry.open());

    const name_elem = entry_elem.getElementsByClassName("explorer_entry_name")[0];
    name_elem.textContent = name;

    const delete_btn = entry_elem.getElementsByClassName("explorer_entry_delete_btn")[0];
    delete_btn.addEventListener("click", () => entry.delete());

    this.entry_container_elem.appendChild(entry_elem);

    const entry = new ExplorerEntry(this, entry_elem, name);
    this.entries.push(entry);

    this.project.create_graph(name);
    entry.open();
  }
}
