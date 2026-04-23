/*
This manager can:
- Load nodes types from a json file (exported from the robot).
- Export of the graph (this is the file run by the robot).
- Load a project file (previously exported from this editor).
- Export of a project file (this file is a more complete version of the
    exported graph (it's also have node positions and comments blocks)).
*/

import { GraphEditor, GraphNode } from "./graph_editor";

import * as litegraph from "litegraph.js";

enum SlotType {
  FLOW,
  VALUE,
}

type InputSlot = {
  name: string;
  type: SlotType;
  value?: any;
};

type OutputSlot = {
  name: string;
  type: SlotType;
};

function get_node_name(node: AIGraphNode): string {
  return "node-" + node.id!!;
}

function argtype_to_widget_type(argtype: string): {
  name: litegraph.widgetTypes;
  options: any;
} {
  switch (argtype) {
    case "string":
      return { name: "text", options: {} };
    case "float":
    case "f16":
    case "f32":
    case "f64":
      return { name: "number", options: {} };
    case "int":
    case "i8":
    case "i16":
    case "i32":
    case "i64":
      return { name: "number", options: { step: 1 } };
    case "u8":
    case "u16":
    case "u32":
    case "u64":
      return { name: "number", options: { min: 0, step: 1 } };
    case "bool":
      return { name: "toggle", options: {} };
    default:
      return { name: "text", options: {} };
  }
}

class AIGraphNode extends GraphNode {
  protected input_slots: InputSlot[] = [];
  protected output_slots: OutputSlot[] = [];

  public constructor(title: string, name: string, node_config: any = undefined) {
    super(title);

    this.type = name;

    const flow_inputs: any[] = node_config["flow_inputs"] || [];
    const flow_outputs: any[] = node_config["flow_outputs"] || [];
    const value_inputs: any[] = node_config["value_inputs"] || {};
    const value_outputs: any[] = node_config["value_outputs"] || {};

    //this.widgets_start_y = LiteGraph.NODE_SLOT_HEIGHT * Math.max(flow_inputs.length, flow_outputs.length);

    for (const flow_input of flow_inputs) {
      this.addInput(flow_input, "flow");
      this.input_slots.push({ type: SlotType.FLOW, name: flow_input });
    }

    for (const flow_output of flow_outputs) {
      this.addOutput(flow_output, "flow");
      this.output_slots.push({ type: SlotType.FLOW, name: flow_output });
    }

    for (const [slot_name, value_input] of Object.entries(value_inputs)) {
      const type = value_input["type"];
      const value = value_input["default"];
      const allowed_values: any[] | undefined = value_input["values"];
      this.addInput(slot_name, type, value);
      if (Array.isArray(allowed_values) && allowed_values.length > 0) {
        // Predefined set of values => dropdown instead of free input.
        const default_value = value !== undefined ? value : allowed_values[0];
        this.addWidget("combo", slot_name, default_value, function (v) {}, {
          values: allowed_values,
        });
      } else {
        const widget_type = argtype_to_widget_type(type);
        this.addWidget(widget_type.name, slot_name, value, function (v) {}, widget_type.options);
      }
      this.input_slots.push({
        type: SlotType.VALUE,
        name: slot_name,
        value: value,
      });
    }

    for (const [slot_name, value_output] of Object.entries(value_outputs)) {
      this.addOutput(slot_name, value_output["type"]["type"]);
      this.output_slots.push({ type: SlotType.VALUE, name: slot_name });
    }
  }

  public export(): any {
    let config: any = {};
    let inputs_config: any = {};
    let outputs_config: any = {};
    let flow_config: any = {};

    let widgets: litegraph.IWidget[] = (this as any).widgets;

    let j = 0;
    for (let i = 0; i < this.input_slots.length; i++) {
      if (this.input_slots[i].type === SlotType.VALUE) {
        inputs_config[this.input_slots[i].name] = widgets[j++].value;
      }
    }

    for (let i = 0; i < this.output_slots.length; i++) {
      let links: string[] = [];
      for (const link_id of this.outputs[i].links || []) {
        const link = this.graph!.links[link_id];
        if (link === undefined) {
          continue;
        }
        const target_node = this.graph!!.getNodeById(link.target_id) as AIGraphNode;
        const target_node_name = get_node_name(target_node);
        const target_slot_name = target_node.input_slots[link.target_slot].name;
        links.push(target_node_name + ":" + target_slot_name);
      }
      const output_slot = this.output_slots[i];
      if (output_slot.type === SlotType.FLOW) {
        flow_config[output_slot.name] = links;
      } else if (output_slot.type === SlotType.VALUE) {
        outputs_config[output_slot.name] = links;
      }
    }

    config["type"] = this.type;

    config["inputs"] = inputs_config;
    config["outputs"] = outputs_config;
    config["flow"] = flow_config;

    return config;
  }
}

class AISubGraphNode extends AIGraphNode {
  public constructor(graph: AIGraph) {
    super(graph.get_name(), graph.get_name(), {});
    this.input_slots = graph.get_inputs();
    this.output_slots = graph.get_outputs();
  }
}

export class AINodeType {
  public path: string[];
  public type: typeof GraphNode;

  public constructor(path: string[], type: typeof GraphNode) {
    this.path = path;
    this.type = type;
  }
}

// Create a new node type from a config object
function new_node_type_from_config(name: string, node_config: any): AINodeType {
  const title: string = node_config["title"] || name;

  const type = class extends AIGraphNode {
    public static title: string = title;
    public static type: string = name;

    public constructor() {
      super(name, title, node_config);
    }
  };

  return new AINodeType(name.split("/"), type);
}

// Create a new subgraph node type from an AIGraph
function new_node_type_from_graph(graph: AIGraph): AINodeType {
  const name: string = "subgraph/" + graph.get_name();
  const title: string = name;

  const type = class extends AISubGraphNode {
    public static title: string = title;
    public static type: string = name;

    public constructor() {
      super(graph);
    }
  };

  return new AINodeType(name.split("/"), type);
}

export class AINodeTypes {
  private node_types: AINodeType[] = [];
  private raw_data: any = null;

  public get_node_types(): AINodeType[] {
    return this.node_types;
  }

  public add_node_type(node_type: AINodeType) {
    this.node_types.push(node_type);
  }

  public remove_node_type(node_type: AINodeType) {
    this.node_types = this.node_types.filter((t) => t !== node_type);
  }

  public import(data: any) {
    if (data["version"] !== 1) {
      throw new Error("Bad node types config version");
    }

    this.raw_data = data;
    this.node_types = [];

    const nodes = data["nodes"];
    for (const [name, node] of Object.entries(nodes)) {
      this.node_types.push(new_node_type_from_config(name, node));
    }
  }

  public export(): any {
    if (this.raw_data === null) {
      throw new Error("No node types data available");
    }
    return this.raw_data;
  }
}

export class AIGraph {
  private name: string;
  private node_types: AINodeTypes;
  private self_node_type: AINodeType;
  private raw_data: any = {};
  private omnissiah_data: any = null;
  private nodes: AIGraphNode[] = [];
  private editor: AIGraphEditor | null = null;
  private inputs: InputSlot[] = [];
  private outputs: OutputSlot[] = [];

  public constructor(name: string, types: AINodeTypes) {
    this.name = name;
    this.node_types = types;
    this.self_node_type = new_node_type_from_graph(this);
  }

  public get_name(): string {
    return this.name;
  }

  public get_inputs(): InputSlot[] {
    return this.inputs;
  }

  public get_outputs(): OutputSlot[] {
    return this.outputs;
  }

  public get_self_node_type(): AINodeType {
    return this.self_node_type;
  }

  public is_open() {
    return this.editor !== null && this.editor.get_open_graph() === this;
  }

  public on_open(editor: AIGraphEditor) {
    this.editor = editor;
    this.editor.get_raw_editor().import(this.raw_data); // Load nodes
  }

  public on_close() {
    this.update_from_editor();
    this.editor = null;
  }

  private update_from_editor() {
    if (this.editor === null) {
      throw new Error("Graph editor not set");
    }
    if (this.editor.get_open_graph() !== this) {
      throw Error("Graph not currently opened in editor");
    }
    this.nodes = this.editor.get_raw_editor().get_nodes() as AIGraphNode[];
    this.raw_data = this.editor.get_raw_editor().export();
  }

  public set_editor(editor: AIGraphEditor) {
    this.editor = editor;
  }

  public set_node_types(types: AINodeTypes) {
    this.node_types = types;
    // Update graph on editor
    if (this.editor !== null && this.editor.get_open_graph() === this) {
      this.editor.open_graph(this);
    }
  }

  public get_node_types(): AINodeTypes {
    return this.node_types;
  }

  public import_project(data: any) {
    const open = this.is_open();
    if (open) {
      this.editor!!.close_graph();
    }

    this.name = data["name"];
    this.raw_data = data["raw"];
    this.omnissiah_data = data["omnissiah"];
    this.nodes = [];

    if (open) {
      this.editor!!.open_graph(this);
    }
  }

  public export_project(): any {
    if (this.is_open()) {
      this.update_from_editor();
    }

    return {
      name: this.name,
      raw: this.raw_data,
      omnissiah: this.export_omnissiah(),
    };
  }

  public export_omnissiah(): any {
    if (this.is_open()) {
      this.update_from_editor();
    }

    if (this.nodes.length === 0) {
      return this.omnissiah_data;
    }

    let config: any = {};

    for (const node of this.nodes) {
      const node_config = (node as AIGraphNode).export();
      const node_name = get_node_name(node as AIGraphNode);
      config[node_name] = node_config;
    }

    return config;
  }
}

export class AIGraphEditor {
  private editor: GraphEditor;
  private current_graph: AIGraph | null = null;

  public constructor(canvas: HTMLCanvasElement) {
    this.editor = new GraphEditor(canvas);
  }

  public get_raw_editor(): GraphEditor {
    return this.editor;
  }

  public open_graph(graph: AIGraph) {
    if (this.current_graph !== null) {
      this.current_graph.on_close();
      this.current_graph = null;
    }

    // Set correct node types
    this.editor.clear_registered_node_types();
    for (const node_type of graph.get_node_types().get_node_types()) {
      this.editor.register_node_type(node_type.path.join("/"), node_type.path[0], node_type.type);
    }

    graph.on_open(this);
    this.current_graph = graph;
  }

  public close_graph() {
    if (this.current_graph !== null) {
      this.current_graph.on_close();
      this.current_graph = null;
    }
    this.editor.clear_nodes();
  }

  public get_open_graph(): AIGraph | null {
    return this.current_graph;
  }
}
