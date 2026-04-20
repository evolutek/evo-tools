/*
This manager can:
- Load nodes types from a json file (exported from the robot).
- Export of the graph (this is the file run by the robot).
- Load a project file (previously exported from this editor).
- Export of a project file (this file is a more complete version of the
    exported graph (it's also have node positions and comments blocks)).
*/

import { GraphEditor, BaseNode } from './editor';

import * as litegraph from "litegraph.js";


enum SlotType {
    FLOW,
    VALUE
}

type InputSlot = {
    name: string;
    type: SlotType;
    value?: any;
}

type OutputSlot = {
    name: string;
    type: SlotType;
}


function get_node_name(node: Node): string {
    return "node-" + node.id!!;
}


function argtype_to_widget_type(argtype: string): {name: litegraph.widgetTypes, options: any} {
    switch (argtype) {
        case "string":
            return {name: "text", options: {}};
        case "float":
        case "f16":
        case "f32":
        case "f64":
            return {name: "number", options: {}};
        case "int":
        case "i8":
        case "i16":
        case "i32":
        case "i64":
            return {name: "number", options: {step: 1}};
        case "u8":
        case "u16":
        case "u32":
        case "u64":
            return {name: "number", options: {min: 0, step: 1}};
        case "bool":
            return {name: "toggle", options: {}};
        default:
            return {name: "text", options: {}};
    }
}


class Node extends BaseNode {
    private input_slots: InputSlot[] = [];
    private output_slots: OutputSlot[] = [];

    protected constructor(node_config: any) {
        const name: string = node_config["name"];
        const title: string = node_config["title"] || name;

        super(title);

        this.type = name;

        const flow_inputs: any[] = node_config["flow_inputs"] || [];
        const flow_outputs: any[] = node_config["flow_outputs"] || [];
        const value_inputs: any[] = node_config["value_inputs"] || {};
        const value_outputs: any[] = node_config["value_outputs"] || {};

        //this.widgets_start_y = LiteGraph.NODE_SLOT_HEIGHT * Math.max(flow_inputs.length, flow_outputs.length);

        for (const flow_input of flow_inputs) {
            this.addInput(flow_input, "flow");
            this.input_slots.push({type: SlotType.FLOW, name: flow_input});
        }

        for (const flow_output of flow_outputs) {
            this.addOutput(flow_output, "flow");
            this.output_slots.push({type: SlotType.FLOW, name: flow_output});
        }

        for (const [slot_name, value_input] of Object.entries(value_inputs)) {
            const type = value_input["type"];
            const value = value_input["default"];
            const allowed_values: any[] | undefined = value_input["values"];
            this.addInput(slot_name, type, value);
            if (Array.isArray(allowed_values) && allowed_values.length > 0) {
                // Predefined set of values => dropdown instead of free input.
                const default_value = value !== undefined ? value : allowed_values[0];
                this.addWidget("combo", slot_name, default_value, function(v){}, {values: allowed_values});
            } else {
                const widget_type = argtype_to_widget_type(type);
                this.addWidget(widget_type.name, slot_name, value, function(v){}, widget_type.options);
            }
            this.input_slots.push({type: SlotType.VALUE, name: slot_name, value: value});
        }

        for (const [slot_name, value_output] of Object.entries(value_outputs)) {
            this.addOutput(slot_name, value_output["type"]["type"]);
            this.output_slots.push({type: SlotType.VALUE, name: slot_name});
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
            for (const link_id of (this.outputs[i].links || [])) {
                const link = this.graph!.links[link_id];
                const target_node = this.graph!!.getNodeById(link.target_id) as Node;
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


function new_node_type_from_config(node_config: any): typeof BaseNode {
    const name: string = node_config["name"];
    const title: string = node_config["title"] || name;

    return class extends Node {
        public static title: string = title;
        public static type: string = name;

        public constructor() {
            super(node_config);
        }
    }
}


export class GraphEditorManager {
    private editor: GraphEditor;

    public constructor(canvas: HTMLCanvasElement) {
        this.editor = new GraphEditor(canvas);
    }

    public get_editor(): GraphEditor {
        return this.editor;
    }

    public export_project(): string {
        return this.editor.export();
    }

    public import_project(data: any) {
        this.editor.import(data);
    }

    public export_graph(): any {
        let config: any = {};

        let nodes = this.editor.get_nodes();
        for (const node of nodes) {
            const node_config = (node as Node).export();
            const node_name = get_node_name(node as Node);
            config[node_name] = node_config;
        }

        return config;
    }

    public import_types(data: any) {
        if (data["version"] !== 1) {
            throw new Error("Bad node types config version");
        }

        this.editor.clear_registered_node_types();

        const nodes = data["nodes"];
        for (const [name, node] of Object.entries(nodes)) {
            const parts = name.split('/');
            this.editor.register_node_type(name, parts[0], new_node_type_from_config(node));
        }
    }
}
