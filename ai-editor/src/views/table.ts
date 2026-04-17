export class Table {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private table_coordinate_lbl: HTMLElement;
    private mouse_down: boolean = false;
    private robot_x: number = 0;
    private robot_y: number = 0;
    private look_x: number = 0;
    private look_y: number = 0;

    public constructor() {
        this.canvas = document.getElementById("table_canvas")!! as HTMLCanvasElement;
        this.table_coordinate_lbl = document.getElementById("table_coordinate_lbl")!!;

        this.canvas.addEventListener("mousemove", (ev) => this.on_mouse_move(ev));
        this.canvas.addEventListener("mousedown", (ev) => this.on_mouse_press(ev));
        this.canvas.addEventListener("mouseup", (ev) => this.on_mouse_release(ev));

        this.context = this.canvas.getContext("2d")!!;
    }

    private set_robot_position(x: number, y: number) {
        this.robot_x = x;
        this.robot_y = y;
    }

    private set_look_position(x: number, y: number) {
        this.look_x = x;
        this.look_y = y;
    }

    private mouse_to_table_coordinate(x: number, y: number): {x: number, y: number} {
        return {
            x: x,
            y: y
        }
    }

    public on_mouse_move(ev: MouseEvent) {
        //console.log("Move: ", ev);
        const c = this.mouse_to_table_coordinate(ev.x, ev.y);
        this.table_coordinate_lbl.textContent = `${c.x}, ${c.y}`;
        if (this.mouse_down) {
            this.set_robot_position(c.x, c.y);
        }
    }

    public on_mouse_press(ev: MouseEvent) {
        const c = this.mouse_to_table_coordinate(ev.x, ev.y);
        this.set_robot_position(c.x, c.y);
        this.mouse_down = true;
    }

    public on_mouse_release(ev: MouseEvent) {
        this.mouse_down = false;
    }

    private draw_robot() {
        this.context.lineWidth = 2;
        this.context.fillStyle = "#FF0000";
        this.context.fillRect(0, 0, 10, 30);
    }

    private draw_look_vector() {
        this.context.lineWidth = 2;
        this.context.fillStyle = "#0000FF";
        this.context.fillRect(0, 0, 10, 30);
    }

    public draw() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.draw_robot();
        this.draw_look_vector();
    }

    public start() {
        this.draw();
    }
}
