export class Map {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;

    public constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.context = canvas.getContext("2d")!!;

        this.canvas.addEventListener("mousemove", (ev) => {
            console.log(`Move: ${ev.x} ${ev.y}`);
        })
    }

    public on_mouse_move() {
        
    }

    public on_mouse_click() {

    }

    public draw() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.lineWidth = 2;
        this.context.fillStyle = "#FF0000";
        this.context.fillRect(0, 0, 10, 30);
    }

    public start() {
        this.draw();
    }
}
