import { AIGraphEditor, AIGraph } from "../graph/ai_graph_editor";
import { DialogStatus } from "../utils/dialog";
import { GraphSettingsDialog } from "./dialogs/graph_settings_dialog";

export class Editor {
  private title_bar: HTMLElement;
  private editor_canvas: HTMLCanvasElement;
  private ai_graph_editor: AIGraphEditor;
  private graph_settings_dialog: GraphSettingsDialog | null = null;

  public constructor() {
    this.title_bar = document.getElementById("title_bar_view")!!;

    this.editor_canvas = document.getElementById("editor_canvas")!! as HTMLCanvasElement;
    this.ai_graph_editor = new AIGraphEditor(this.editor_canvas);

    const open_graph_settings_btn = document.getElementById("open_graph_settings_btn")!! as HTMLButtonElement;
    open_graph_settings_btn.addEventListener("click", (_) => this.open_graph_settings());
  }

  // Wire-in once the Dialogs container exists. Called from App.
  public set_graph_settings_dialog(dialog: GraphSettingsDialog) {
    this.graph_settings_dialog = dialog;
  }

  private open_graph_settings() {
    const graph = this.ai_graph_editor.get_open_graph();
    if (graph === null) {
      console.warn("No graph open — cannot configure.");
      return;
    }
    if (this.graph_settings_dialog === null) {
      console.warn("Graph settings dialog not initialised yet.");
      return;
    }
    this.graph_settings_dialog.open_for(graph).then(({ status, result }) => {
      if (status === DialogStatus.COMPLETED) {
        graph.set_signature(result);
      }
    });
  }

  public close_graph() {
    if (this.ai_graph_editor.get_open_graph() !== null) {
      this.ai_graph_editor.close_graph();
      this.editor_canvas.style.display = "none";
      this.title_bar.textContent = "...";
    }
  }

  public open_graph(graph: AIGraph) {
    this.title_bar.textContent = graph.get_name();
    this.ai_graph_editor.open_graph(graph);
    this.editor_canvas.style.display = "block";
  }
}
