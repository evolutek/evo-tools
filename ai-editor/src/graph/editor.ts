import * as litegraph from "litegraph.js";


export class NodeArgument {
    public name: string = "";
    public value: any = null;
}

export class NodeOutput {
    public name: string = "";
    public node: BaseNode | null = null;
}

/*export class NodeInput {
    public name: string = "";
    public node: BaseNode | null = null;
}*/


export abstract class BaseNode extends litegraph.LGraphNode {
    public static title: string;
    public static category: string;
    //public type: string = "";

    /*public connect(output_index: number, target_node: BaseNode, input_index: number) {
        super.connect(output_index, target_node, input_index);
    }*/

    /*
    this.slider = this.addWidget("slider","Slider", 0.5, function(v){}, { min: 0, max: 1} );
	this.number = this.addWidget("number","Number", 0.5, function(v){}, { min: 0, max: 100} );
	this.combo = this.addWidget("combo","Combo", "red", function(v){}, { values:["red","green","blue"]} );
	this.text = this.addWidget("text","Text", "edit me", function(v){}, {} );
	this.text2 = this.addWidget("text","Text", "multiline", function(v){}, { multiline:true } );
	this.toggle = this.addWidget("toggle","Toggle", true, function(v){}, { on: "enabled", off:"disabled"} );
	this.button = this.addWidget("button","Button", null, function(v){}, {} );
	this.toggle2 = this.addWidget("toggle","Disabled", true, function(v){}, { on: "enabled", off:"disabled"} );
    this.horizontal = true;
    */

    public constructor(title: string) {
        super(title);
        this.serialize_widgets = true;
    }

    /*
    public get_outputs(): NodeOutput[] {
        let r: NodeOutput[] = [];

        let outputs = this.outputs;
        for (let output of outputs) {
            let out_links = output.links;
            if (out_links == null || out_links.length <= 0) continue;
            let link_id = out_links[0];
            let link = this.graph!.links[link_id];

            // output.name
            // link.origin_id
            // link.origin_slot
            // link.target_id
            // link.target_slot

            r.push({
                name: output.name,
                node: this.graph!!.getNodeById(link.target_id) as BaseNode
            })
        }

        return r;
    }
    */

    /*public get_inputs(): litegraph.INodeInputSlot[] {
        return this.inputs;
    }*/

    //abstract export_ai_json(): any;
}


export class GraphEditor {
    private canvas: litegraph.LGraphCanvas;
    private graph: litegraph.LGraph;

    public constructor(canvas: HTMLCanvasElement) {
        this.graph = new litegraph.LGraph();
        this.canvas = new litegraph.LGraphCanvas(canvas, this.graph);

        this.update_editor_hi_dpi_canvas();

        window.addEventListener("resize", () => {
            this.update_editor_hi_dpi_canvas();
        });

        litegraph.LiteGraph.clearRegisteredTypes();
    }

    private update_editor_hi_dpi_canvas() {
        const ratio = window.devicePixelRatio;

        const parent = this.canvas.canvas.parentNode! as HTMLElement;
        const rect = parent.getBoundingClientRect();
        const { width, height } = rect;

        /*
        if(ratio == 1) { return }
        this.canvas.canvas.width = width * ratio;
        this.canvas.canvas.height = height * ratio;
        this.canvas.canvas.style.width = width + "px";
        this.canvas.canvas.style.height = height + "px";
        this.canvas.canvas.getContext("2d")!.scale(ratio, ratio);
        */

        this.canvas.resize(width, height);
    }

    public register_node_type(type_path: string, category: string, node: typeof BaseNode) {
        litegraph.LiteGraph.registerNodeType(type_path, node as any);
        node.category = category;
    }

    public create_node(type_path: string, x: number, y: number): BaseNode {
        const node = litegraph.LiteGraph.createNode<BaseNode>(type_path);
        node.pos = [x, y];
        this.graph.add(node);
        return node;
    }

    public start() {
        this.graph.start();
    }

    public export(): string {
        return JSON.stringify(this.graph.serialize());
    }

    public import(data: string): void {
        this.graph.configure(JSON.parse(data), false);
    }

    public get_nodes(): BaseNode[] {
        return (this.graph as any)._nodes;
    }

    /*
    fetchFile: function( url, type, on_complete, on_error ) {
        var that = this;
        if(!url)
            return null;

        type = type || "text";
        if( url.constructor === String )
        {
            if (url.substr(0, 4) == "http" && LiteGraph.proxy) {
                url = LiteGraph.proxy + url.substr(url.indexOf(":") + 3);
            }
            return fetch(url)
            .then(function(response) {
                if(!response.ok)
                     throw new Error("File not found"); //it will be catch below
                if(type == "arraybuffer")
                    return response.arrayBuffer();
                else if(type == "text" || type == "string")
                    return response.text();
                else if(type == "json")
                    return response.json();
                else if(type == "blob")
                    return response.blob();
            })
            .then(function(data) {
                if(on_complete)
                    on_complete(data);
            })
            .catch(function(error) {
                console.error("error fetching file:",url);
                if(on_error)
                    on_error(error);
            });
        }
        else if( url.constructor === File || url.constructor === Blob)
        {
            var reader = new FileReader();
            reader.onload = function(e)
            {
                var v = e.target.result;
                if( type == "json" )
                    v = JSON.parse(v);
                if(on_complete)
                    on_complete(v);
            }
            if(type == "arraybuffer")
                return reader.readAsArrayBuffer(url);
            else if(type == "text" || type == "json")
                return reader.readAsText(url);
            else if(type == "blob")
                return reader.readAsBinaryString(url);
        }
        return null;
    }
    */
}
