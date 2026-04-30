/*
This manager can:
- Load nodes types from a json file (exported from the robot).
- Export of the graph (this is the file run by the robot).
- Load a project file (previously exported from this editor).
- Export of a project file (this file is a more complete version of the
    exported graph (it's also have node positions and comments blocks)).
*/

import { GraphEditor, GraphNode } from "./graph_editor";
import { EventEmitter } from "../utils/event";

import * as litegraph from "litegraph.js";

// Stable type names matching evo_lib (Kolte's feat/subgraphes branch).
// One pair per AIGraph: re-registered each time a graph is opened so the
// entry/exit slots reflect that graph's signature.
export const ENTRY_NODE_TYPE = "graph:entry";
export const EXIT_NODE_TYPE = "graph:exit";

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

// User-edited per-graph signature. Stored alongside the litegraph raw data
// in the project file, used to render this graph as a subgraph node in others
// and to expose its public configuration.
export type ValueInputDef = {
  name: string;
  value_type: string; // "string" | "float" | "int" | "bool" | "u8" | ...
  default?: any;
  values?: any[]; // optional allowed-values list (renders as combo)
};

export type ValueOutputDef = {
  name: string;
  value_type: string;
};

export type FlowOutputDef = {
  name: string;
};

// Hierarchical free-form constants tree, mirrors the `values` block of
// actions.json5 — branches are objects, leaves are primitives.
export type ConstantsTree = { [key: string]: any };

export type GraphResolver = (name: string) => AIGraph | null;

export type GraphSignature = {
  value_inputs: ValueInputDef[];
  value_outputs: ValueOutputDef[];
  flow_outputs: FlowOutputDef[];
  constants: ConstantsTree;
};

function empty_signature(): GraphSignature {
  return {
    value_inputs: [],
    value_outputs: [],
    flow_outputs: [],
    constants: {},
  };
}

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
      this.addOutput(slot_name, value_output["type"]);
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
    // Build a node_config from the graph's user-edited signature so the
    // subgraph node gets real litegraph slots + widgets — same path as a
    // regular node imported from node_types.
    super(graph.get_name(), graph.get_name(), graph.build_node_config());
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
  private signature: GraphSignature = empty_signature();
  private graph_resolver: GraphResolver | null = null;

  public signature_changed_event = new EventEmitter<[AIGraph]>();

  public constructor(name: string, types: AINodeTypes) {
    this.name = name;
    this.node_types = types;
    this.self_node_type = new_node_type_from_graph(this);
  }

  public get_name(): string {
    return this.name;
  }

  // Legacy accessors kept for compatibility — mirror the signature into the
  // InputSlot/OutputSlot shape used elsewhere. Flow input is implicit ("in").
  public get_inputs(): InputSlot[] {
    const inputs: InputSlot[] = [{ name: "in", type: SlotType.FLOW }];
    for (const v of this.signature.value_inputs) {
      inputs.push({ name: v.name, type: SlotType.VALUE, value: v.default });
    }
    return inputs;
  }

  public get_outputs(): OutputSlot[] {
    const outputs: OutputSlot[] = [];
    for (const f of this.signature.flow_outputs) {
      outputs.push({ name: f.name, type: SlotType.FLOW });
    }
    for (const v of this.signature.value_outputs) {
      outputs.push({ name: v.name, type: SlotType.VALUE });
    }
    return outputs;
  }

  public get_signature(): GraphSignature {
    return this.signature;
  }

  public set_signature(signature: GraphSignature): void {
    this.signature = signature;
    this.apply_signature_to_entry_exit();
    this.signature_changed_event.emit(this);
  }

  private apply_signature_to_entry_exit() {
    if (this.editor === null || this.editor.get_open_graph() !== this) return;
    const raw = this.editor.get_raw_editor();
    const nodes = raw.get_nodes() as AIGraphNode[];
    for (const node of nodes) {
      if (node.type === ENTRY_NODE_TYPE) sync_entry_slots(node as any, this.signature);
      else if (node.type === EXIT_NODE_TYPE) sync_exit_slots(node as any, this.signature);
    }
  }

  // Translate the signature into the same shape as a regular entry of
  // node_types.json5, so AISubGraphNode can hand it to AIGraphNode and get
  // matching slots and widgets for free.
  public build_node_config(): any {
    const value_inputs: any = {};
    for (const v of this.signature.value_inputs) {
      const entry: any = { type: v.value_type };
      if (v.default !== undefined) entry.default = v.default;
      if (v.values !== undefined && Array.isArray(v.values) && v.values.length > 0) {
        entry.values = v.values;
      }
      value_inputs[v.name] = entry;
    }
    const value_outputs: any = {};
    for (const v of this.signature.value_outputs) {
      value_outputs[v.name] = { type: v.value_type };
    }
    return {
      flow_inputs: ["in"],
      flow_outputs: this.signature.flow_outputs.map((f) => f.name),
      value_inputs,
      value_outputs,
    };
  }

  public get_self_node_type(): AINodeType {
    return this.self_node_type;
  }

  // Inside the subgraph: the entry node exposes signature.value_inputs as
  // value_outputs so other nodes can wire them. Symmetric of build_node_config.
  public build_entry_config(): any {
    const value_outputs: any = {};
    for (const v of this.signature.value_inputs) {
      value_outputs[v.name] = { type: v.value_type };
    }
    return {
      title: "Entry",
      flow_inputs: [],
      flow_outputs: ["next"],
      value_inputs: {},
      value_outputs,
    };
  }

  // Inside the subgraph: the exit node receives the flow_outputs and
  // value_outputs declared in the signature, to feed them back to the caller.
  public build_exit_config(): any {
    const value_inputs: any = {};
    for (const v of this.signature.value_outputs) {
      value_inputs[v.name] = { type: v.value_type };
    }
    return {
      title: "Exit",
      flow_inputs: this.signature.flow_outputs.map((f) => f.name),
      flow_outputs: [],
      value_inputs,
      value_outputs: {},
    };
  }

  public get_entry_node_type(): AINodeType {
    return new_node_type_from_config(ENTRY_NODE_TYPE, this.build_entry_config());
  }

  public get_exit_node_type(): AINodeType {
    return new_node_type_from_config(EXIT_NODE_TYPE, this.build_exit_config());
  }

  public is_open() {
    return this.editor !== null && this.editor.get_open_graph() === this;
  }

  public set_graph_resolver(resolver: GraphResolver): void {
    this.graph_resolver = resolver;
  }

  public on_open(editor: AIGraphEditor) {
    this.editor = editor;
    this.editor.get_raw_editor().import(this.raw_data); // Load nodes
    this.ensure_entry_exit_nodes();
    this.refresh_subgraph_nodes();
  }

  private ensure_entry_exit_nodes() {
    if (this.editor === null) return;
    const raw = this.editor.get_raw_editor();
    const nodes = raw.get_nodes() as AIGraphNode[];
    const has_entry = nodes.some((n) => n.type === ENTRY_NODE_TYPE);
    const has_exit = nodes.some((n) => n.type === EXIT_NODE_TYPE);
    const needs_exit =
      this.signature.flow_outputs.length > 0 || this.signature.value_outputs.length > 0;

    if (!has_entry) raw.create_node(ENTRY_NODE_TYPE, 100, 100);
    if (needs_exit && !has_exit) raw.create_node(EXIT_NODE_TYPE, 600, 100);
  }

  private refresh_subgraph_nodes() {
    if (this.editor === null || this.graph_resolver === null) return;
    const raw = this.editor.get_raw_editor();
    const nodes = raw.get_nodes() as AIGraphNode[];
    const prefix = "subgraph/";
    for (const node of nodes) {
      const t = node.type;
      if (typeof t !== "string" || !t.startsWith(prefix)) continue;
      const target_name = t.substring(prefix.length);
      const target = this.graph_resolver(target_name);
      if (target === null) continue;
      sync_subgraph_node_slots(node as any, target.get_signature());
    }
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

    // Backwards compat: project files that predate the signature simply
    // start with an empty one — preserves prior behaviour where graphs
    // had no exposed I/O.
    this.signature = {
      value_inputs: data["value_inputs"] || [],
      value_outputs: data["value_outputs"] || [],
      flow_outputs: data["flow_outputs"] || [],
      constants: data["constants"] || {},
    };

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
      value_inputs: this.signature.value_inputs,
      value_outputs: this.signature.value_outputs,
      flow_outputs: this.signature.flow_outputs,
      constants: this.signature.constants,
    };
  }

  public export_omnissiah(): any {
    if (this.is_open()) {
      this.update_from_editor();
    }

    const value_inputs: any = {};
    for (const v of this.signature.value_inputs) {
      const entry: any = { type: v.value_type };
      if (v.default !== undefined) entry.default = v.default;
      value_inputs[v.name] = entry;
    }

    const value_outputs: any = {};
    for (const v of this.signature.value_outputs) {
      value_outputs[v.name] = { type: v.value_type };
    }

    const flow_outputs: string[] = this.signature.flow_outputs.map((f) => f.name);

    const nodes: any = {};
    if (this.nodes.length > 0) {
      for (const node of this.nodes) {
        const node_config = (node as AIGraphNode).export();
        const node_name = get_node_name(node as AIGraphNode);
        nodes[node_name] = node_config;
      }
    } else if (this.omnissiah_data !== null) {
      Object.assign(nodes, this.omnissiah_data);
    }

    return { value_inputs, value_outputs, flow_outputs, nodes };
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

    this.editor.clear_registered_node_types();
    for (const node_type of graph.get_node_types().get_node_types()) {
      this.editor.register_node_type(node_type.path.join("/"), node_type.path[0], node_type.type);
    }

    // Register graph-specific entry/exit last so they override any same-named
    // type from node_types — slots reflect *this* graph's signature.
    const entry_type = graph.get_entry_node_type();
    this.editor.register_node_type(entry_type.path.join("/"), entry_type.path[0], entry_type.type);
    const exit_type = graph.get_exit_node_type();
    this.editor.register_node_type(exit_type.path.join("/"), exit_type.path[0], exit_type.type);

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

function sync_entry_slots(node: any, sig: GraphSignature) {
  const expected = new Map<string, string>();
  for (const v of sig.value_inputs) expected.set(v.name, v.value_type);
  const outputs = node.outputs || [];
  for (let i = outputs.length - 1; i >= 0; i--) {
    const slot = outputs[i];
    const exp = expected.get(slot.name);
    if (exp === undefined || exp !== slot.type) {
      node.removeOutput(i);
    } else {
      expected.delete(slot.name);
    }
  }
  for (const [name, type] of expected) node.addOutput(name, type);
}

function sync_subgraph_node_slots(node: any, sig: GraphSignature) {
  const expected_inputs = new Map<string, string>();
  for (const v of sig.value_inputs) expected_inputs.set(v.name, v.value_type);
  const inputs = node.inputs || [];
  for (let i = inputs.length - 1; i >= 0; i--) {
    const slot = inputs[i];
    if (slot.type === "flow") continue;
    const exp = expected_inputs.get(slot.name);
    if (exp === undefined || exp !== slot.type) node.removeInput(i);
    else expected_inputs.delete(slot.name);
  }
  for (const [name, type] of expected_inputs) node.addInput(name, type);

  const expected_flows = new Set<string>();
  for (const f of sig.flow_outputs) expected_flows.add(f.name);
  const expected_values = new Map<string, string>();
  for (const v of sig.value_outputs) expected_values.set(v.name, v.value_type);
  const outputs = node.outputs || [];
  for (let i = outputs.length - 1; i >= 0; i--) {
    const slot = outputs[i];
    if (slot.type === "flow") {
      if (!expected_flows.has(slot.name)) node.removeOutput(i);
      else expected_flows.delete(slot.name);
    } else {
      const exp = expected_values.get(slot.name);
      if (exp === undefined || exp !== slot.type) node.removeOutput(i);
      else expected_values.delete(slot.name);
    }
  }
  for (const name of expected_flows) node.addOutput(name, "flow");
  for (const [name, type] of expected_values) node.addOutput(name, type);
}

function sync_exit_slots(node: any, sig: GraphSignature) {
  const expected_flows = new Set<string>();
  for (const f of sig.flow_outputs) expected_flows.add(f.name);
  const expected_values = new Map<string, string>();
  for (const v of sig.value_outputs) expected_values.set(v.name, v.value_type);
  const inputs = node.inputs || [];
  for (let i = inputs.length - 1; i >= 0; i--) {
    const slot = inputs[i];
    if (slot.type === "flow") {
      if (!expected_flows.has(slot.name)) node.removeInput(i);
      else expected_flows.delete(slot.name);
    } else {
      const exp = expected_values.get(slot.name);
      if (exp === undefined || exp !== slot.type) node.removeInput(i);
      else expected_values.delete(slot.name);
    }
  }
  for (const name of expected_flows) node.addInput(name, "flow");
  for (const [name, type] of expected_values) node.addInput(name, type);
}
