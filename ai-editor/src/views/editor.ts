import { AIGraphEditor, AIGraph } from "../graph/ai_graph_editor";

export class Editor {
  private title_bar: HTMLElement;
  private editor_canvas: HTMLCanvasElement;
  private ai_graph_editor: AIGraphEditor;

  public constructor() {
    this.title_bar = document.getElementById("title_bar_view")!!;

    this.editor_canvas = document.getElementById("editor_canvas")!! as HTMLCanvasElement;
    this.ai_graph_editor = new AIGraphEditor(this.editor_canvas);

    const open_graph_settings_btn = document.getElementById("open_graph_settings_btn")!! as HTMLButtonElement;
    open_graph_settings_btn.addEventListener("click", (_) => this.open_graph_settings());
  }

  // public start() {
  //     this.ai_graph_editor.get_editor().start();
  // }
  //
  private open_graph_settings() {
    //
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
