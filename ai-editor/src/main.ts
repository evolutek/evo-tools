import { Map } from './map';
import { GraphEditor, BaseNode } from './graph/editor';
import { GraphEditorManager } from './graph/manager';

import * as litegraph from "litegraph.js";


const actions = {
    "goto": {
        name: "Go to",
        args: {
            x: {type: "number", name: "X", default: 0, min: 0, max: 2000, step: 10, precision: 0},
            y: {type: "number", name: "Y", default: 0, min: 0, max: 3000, step: 10, precision: 0}
        }
    },
    "forward": {
        name: "Forward",
        args: {
            distance: {type: "number", name: "Distance", default: 0, step: 10, precision: 0},
        }
    },
    "rotate": {
        name: "Rotate",
        args: {
            angle: {type: "nulber", name: "Angle", default: 0, step: 10, precision: 0},
        }
    },
    "head_to": {
        name: "Head Toward",
        args: {
            angle: {type: "number", name: "Angle", default: 0, step: 10, precision: 0},
        }
    }
}


/*
class NormalEntryNode extends BaseNode {
    public static title: string = "Normal Entry";

    public constructor() {
        super(NormalEntryNode.title);
        this.addOutput("", "execution");
    }

    export_ai_json() {
        throw new Error('Method not implemented.');
    }
}


class CriticalEntryNode extends BaseNode {
    public static title: string = "blablabla Critical Entry";

    public constructor() {
        super("Critical Entry"); //CriticalEntryNode.title);
        this.addOutput("", "execution");
        this.addWidget("number", "Delay", 85, undefined, {min: 0, max: 100, step: 10, precision: 0})
    }

    export_ai_json() {
        throw new Error('Method not implemented.');
    }
}


class RunConcurentlyNode extends BaseNode {
    public static title: string = "blablabla Run Concurently";

    public constructor() {
        super("Run Concurently"); //RunConcurentlyNode.title);
        this.addInput("", "execution", {color_on: "#E2E2E2", color_off: "#BBBBBB", shape: litegraph.LiteGraph.ARROW_SHAPE});
        this.addOutput("", "execution", {color_on: "#E2E2E2", color_off: "#BBBBBB"});
        this.addOutput("", "execution", {color_on: "#E2E2E2", color_off: "#BBBBBB"});
        let toggle = this.addWidget("toggle","Toggle", true, function(v){}, { on: "enabled", off:"disabled"} );
    }

    export_ai_json() {
        throw new Error('Method not implemented.');
    }
}


class WaitAnyNode extends BaseNode {
    public static title: string = "Wait Any";

    public constructor() {
        super(WaitAnyNode.title);
        this.addInput("", "execution");
        this.addInput("", "execution");
        this.addOutput("", "execution");
    }

    export_ai_json() {
        throw new Error('Method not implemented.');
    }
}


class WaitAllNode extends BaseNode {
    public static title: string = "Wait All";

    public constructor() {
        super(WaitAllNode.title);
        this.addInput("", "execution");
        this.addInput("", "execution");
        this.addOutput("", "execution");
    }

    export_ai_json() {
        throw new Error('Method not implemented.');
    }
}


function new_action_node(action_id: string, title: string, args: object) {
    class ActionNode extends BaseNode {
        public static title: string = title;

        public constructor() {
            super(ActionNode.title);
            //this.type = "action";

            this.widgets_start_y = litegraph.LiteGraph.NODE_SLOT_HEIGHT * 1;

            this.addInput("", "execution");
            this.addOutput("ok", "execution");
            this.addOutput("fail", "execution");
            for (const [name, options] of Object.entries(args)) {
                this.addWidget(options["type"], options["name"], options["default"], undefined, options);
            }
            this.properties = { action: action_id, args: {} };
            // this.addWidget("number", "X", 0, undefined, {min: 0, max: 2000, step: 1, precision: 0});
            // this.addWidget("number", "Y", 0, undefined, {min: 0, max: 3000, step: 1, precision: 0});
        }

        export_ai_json() {
            let outs = this.get_outputs();

            let widgets: [] = (this as any).widgets;

            let r_args: any = {};
            let i = 0;
            for (const [name, options] of Object.entries(args)) {
                let widget = widgets[i] as litegraph.IWidget;
                r_args[name] = widget.value;
                i++;
            }

            let r: any = {
                action: action_id,
                args: r_args
            };

            for (let out of outs) {
                r[out.name] = `node-${out.node?.id}`;
            }

            return r;
        }
    }

    return ActionNode;
}


function new_condition_node(condition_id: string, title: string) {
    class ConditionNode extends BaseNode {
        public static title: string = title;

        public constructor() {
            super(ConditionNode.title);
            //this.type = "condition";
            this.addInput("", "execution");
            this.addOutput("ok", "execution");
            this.addOutput("fail", "execution");
            this.addWidget("text", "Action", title);
        }

        export_ai_json() {
            let outs = this.get_outputs();

            console.log(this);

            let args: any = {};
            for (const [name, options] of Object.entries(args)) {
                let value = null;
                args[name] = value;
            }

            let r: any = {
                condition: condition_id,
                args: args
            };

            return r;
        }
    }

    return ConditionNode;
}
*/


function download(data: string, filename: string): void {
    var file = new Blob([data]);
    var url = URL.createObjectURL( file );
    var element = document.createElement("a");
    element.setAttribute('href', url);
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setTimeout(function(){ URL.revokeObjectURL( url ); }, 1000 * 60); // Wait one minute to revoke url
}


function upload(accepts: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        var element = document.createElement("input") as HTMLInputElement;
        element.type = "file";
        element.accept = accepts.join(",");
        element.style.display = 'none';
        document.body.appendChild(element);
        element.addEventListener("change", (event) => {
            const target = event.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                const file = target.files[0];
                const reader = new FileReader();
                reader.onload = (e) => {
                    const result = e.target?.result as string;
                    resolve(result);
                };
                reader.onerror = reject;
                reader.readAsText(file, 'UTF-8');
            } else {
                reject(new Error("No file selected"));
            }
        });
        element.click();
        document.body.removeChild(element);
    });
}


class App {
    private editor_manager: GraphEditorManager;
    private map: Map;
    private export_project_btn: HTMLButtonElement;
    private import_project_btn: HTMLButtonElement;
    private export_graph_btn: HTMLButtonElement;
    private import_types_btn: HTMLButtonElement;

    public constructor() {
        this.editor_manager = new GraphEditorManager(document.getElementById("editor_canvas")!! as HTMLCanvasElement);
        this.map = new Map(document.getElementById("table_canvas")!! as HTMLCanvasElement);
        this.export_project_btn = document.getElementById("export_project_btn")!! as HTMLButtonElement;
        this.import_project_btn = document.getElementById("import_project_btn")!! as HTMLButtonElement;
        this.export_graph_btn = document.getElementById("export_graph_btn")!! as HTMLButtonElement;
        this.import_types_btn = document.getElementById("import_types_btn")!! as HTMLButtonElement;
    }

    public main(): void {
        this.init();

        // const node1 = this.editor.create_node("flow/run_concurently", 200, 200);
        // const node2 = this.editor.create_node("flow/wait_any", 400, 200);
        // node1.connect(0, node2, 0);

        this.map.start();
        this.editor_manager.get_editor().start();
    }

    public init() {
        this.export_project_btn.addEventListener("click", () => {
            this.download_project();
        });

        this.import_project_btn.addEventListener("click", () => {
            this.import_project();
        });

        this.export_graph_btn.addEventListener("click", () => {
            this.download_graph();
        });

        this.import_types_btn.addEventListener("click", () => {
            this.import_types();
        });

        /*
        // Flow control
        this.editor_manager.get_editor().register_node_type("flow/run_concurently", "Flow", RunConcurentlyNode);
        this.editor_manager.get_editor().register_node_type("flow/wait_any", "Flow", WaitAnyNode);
        this.editor_manager.get_editor().register_node_type("flow/wait_all", "Flow", WaitAllNode);

        // Entries point
        this.editor_manager.get_editor().register_node_type("entries/normal", "Entries", NormalEntryNode);
        this.editor_manager.get_editor().register_node_type("entries/critical", "Entries", CriticalEntryNode);

        // Actions
        for (const [name, action] of Object.entries(actions)) {
            this.editor_manager.get_editor().register_node_type(`action/${name}`, "Action", new_action_node(name, action["name"], action["args"]));
            //this.editor.register_node_type(`condition/${name}`, "Condition", new_condition_node(action["name"]));
        }
        */

        this.editor_manager.import_types(JSON.stringify({
            version: 1,
            nodes: {
                "flow/entry": {
                    title: "Entry",
                    flow_outputs: ["flow"],
                },
                "action/goto": {
                    title: "Goto",
                    flow_inputs: ["flow"],
                    flow_outputs: ["ok", "fail"],
                    value_inputs: [
                        {name: "x", type: "float", default: 0},
                        {name: "y", type: "float", default: 0},
                    ],
                    value_outputs: [
                        {name: "status", type: "enum"},
                    ],
                }
            }
        }))
    }

    public async download_project() {
        var data = this.editor_manager.export_project();
        download(data, "project.json");
    }

    public async download_graph() {
        var data = this.editor_manager.export_graph();
        download(data, "strategies.json");
    }

    public async import_project() {
        const data = await upload(["application/json"]);
        this.editor_manager.import_project(data);
    }

    public async import_types() {
        const data = await upload(["application/json"]);
        this.editor_manager.import_types(data);
    }

    public async import_graph() {
        const data = await upload(["application/json"]);
        // TODO
    }
}


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new App().main();
    });
} else {
    new App().main();
}
