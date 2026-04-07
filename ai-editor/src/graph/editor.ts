import * as litegraph from "litegraph.js";


export abstract class BaseNode extends litegraph.LGraphNode {
    public static title: string;
    public static category: string;

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

    public export(): any {
        return this.graph.serialize();
    }

    public import(data: any) {
        this.graph.configure(data, false);
    }

    public get_nodes(): BaseNode[] {
        return (this.graph as any)._nodes;
    }
}
