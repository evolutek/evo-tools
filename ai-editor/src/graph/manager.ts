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


/*
type NodeValueInputDefinition = {
    name: string,
    type: any,
    value: any
}


type NodeValueOutputDefinition = {
    name: string,
    type: any
}


class NodeDefinition {
    public name: string;
    public title: string;
    public flow_inputs: string[] = [];
    public flow_outputs: string[] = [];
    public value_inputs: NodeValueInputDefinition[] = [];
    public value_outputs: NodeValueOutputDefinition[] = [];

    constructor(name: string, title: string) {
        this.name = name;
        this.title = title;
    }
}
*/


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
        const value_inputs: any[] = node_config["value_inputs"] || [];
        const value_outputs: any[] = node_config["value_outputs"] || [];

        //this.widgets_start_y = LiteGraph.NODE_SLOT_HEIGHT * Math.max(flow_inputs.length, flow_outputs.length);

        for (const flow_input of flow_inputs) {
            this.addInput(flow_input, "flow");
            this.input_slots.push({type: SlotType.FLOW, name: flow_input});
        }

        for (const flow_output of flow_outputs) {
            this.addOutput(flow_output, "flow");
            this.output_slots.push({type: SlotType.FLOW, name: flow_output});
        }

        for (const value_input of value_inputs) {
            const type_config = value_input["type"];
            const slot_name = value_input["name"];
            const value = value_input["default"];
            this.addInput(slot_name, type_config["type"], value);
            this.addWidget("number", slot_name, value);
            this.input_slots.push({type: SlotType.VALUE, name: slot_name, value: value});
        }

        for (const value_output of value_outputs) {
            const slot_name = value_output["name"];
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

    public import_project(data: string): void {
        this.editor.import(data);
    }

    public export_graph(): string {
        let config: any = {};
        let nodes_config: any = {};

        let nodes = this.editor.get_nodes();
        for (const node of nodes) {
            const node_config = (node as Node).export();
            const node_name = get_node_name(node as Node);
            nodes_config[node_name] = node_config;
        }

        config["nodes"] = nodes_config;

        return JSON.stringify(config, null, 4);
    }

    public import_types(data: string) {
        const config = JSON.parse(data);

        if (config["version"] !== 1) {
            throw new Error("Bad node types config version");
        }

        const nodes = config["nodes"];
        for (const [name, node] of Object.entries(nodes)) {
            const parts = name.split('/');
            this.editor.register_node_type(name, parts[0], new_node_type_from_config(node));
        }
    }
}
