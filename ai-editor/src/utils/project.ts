import { AIGraph, AINodeTypes } from "../graph/ai_graph_editor";
import { EventEmitter } from "./event";

export class Project {
  private graphes: Map<string, AIGraph> = new Map<string, AIGraph>();
  private node_types: AINodeTypes = new AINodeTypes();

  public graph_created_event = new EventEmitter<[AIGraph]>();
  public graph_deleted_event = new EventEmitter<[AIGraph]>();
  public project_imported_event = new EventEmitter<[]>();

  public get_graph_by_name(name: string): AIGraph {
    if (this.graphes.has(name)) {
      return this.graphes.get(name)!!;
    } else {
      throw new Error(`Graph '${name}' not found`);
    }
  }

  public create_graph(name: string): AIGraph {
    const graph = new AIGraph(name, this.node_types);
    this.graphes.set(name, graph);
    this.graph_created_event.emit(graph);
    this.node_types.add_node_type(graph.get_self_node_type());
    return graph;
  }

  public delete_graph(name: string) {
    if (this.graphes.has(name)) {
      const graph = this.graphes.get(name)!!;
      this.graphes.delete(name);
      this.node_types.remove_node_type(graph.get_self_node_type());
      this.graph_deleted_event.emit(graph);
    }
  }

  public get_graphes(): AIGraph[] {
    return Array.from(this.graphes.values());
  }

  public export_project(): any {
    let config: any = {};
    let graphes: any = {};

    for (const [name, graph] of this.graphes) {
      graphes[name] = graph.export_project();
    }

    config["version"] = 1;
    config["graphes"] = graphes;
    config["types"] = this.node_types.export();

    return config;
  }

  public export_omnissiah(): any {
    let config: any = {};
    let graphes: any = {};

    for (const [name, graph] of this.graphes) {
      graphes[name] = graph.export_omnissiah();
    }

    config["version"] = 1;
    config["graphes"] = graphes;

    return config;
  }

  public import_node_types(data: any) {
    this.node_types.import(data);
    // Update node types of all graphes
    for (const graph of this.graphes.values()) {
      graph.set_node_types(this.node_types);
    }
  }

  public import_project(data: any) {
    if (data["version"] !== 1) {
      throw new Error("Bad project config version");
    }

    this.import_node_types(data["types"]);

    this.graphes.clear();
    for (const [name, graph_data] of Object.entries(data["graphes"])) {
      const graph = new AIGraph(name, this.node_types);
      graph.import_project(graph_data);
      this.graphes.set(name, graph);
      this.node_types.add_node_type(graph.get_self_node_type());
    }

    this.project_imported_event.emit();
  }
}
