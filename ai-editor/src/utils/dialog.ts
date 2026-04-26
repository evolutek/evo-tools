export enum DialogStatus {
    CANCELED,
    COMPLETED
}


type DialogResult = {status: DialogStatus, result?: any};


export class Dialog {
    private container: DialogContainer;
    private element: HTMLElement;
    private pending_promise: Promise<DialogResult> | null = null;
    private pending_resolve_cb: ((value: DialogResult) => void) | null = null;

    public constructor(container: DialogContainer, element: HTMLElement) {
        this.container = container;
        this.element = element;
    }

    public open(): Promise<DialogResult> {
        if (this.pending_promise !== null) {
            return this.pending_promise;
        }
        this.element.style.display = "block";
        this.pending_promise = new Promise((resolve, reject) => {
            this.pending_resolve_cb = resolve;
        });
        this.container.on_open_dialog(this);
        return this.pending_promise;
    }

    private on_close() {
        this.element.style.display = "none";
        this.container.on_close_dialog();
        this.pending_promise = null;
        this.pending_resolve_cb = null;
    }

    public close(): void {
        if (this.pending_resolve_cb !== null) {
            this.pending_resolve_cb({status: DialogStatus.CANCELED});
        }
        this.on_close();
    }

    public complete(result: any = {}) {
        if (this.pending_resolve_cb !== null) {
            this.pending_resolve_cb({status: DialogStatus.COMPLETED, result: result});
        }
        this.on_close();
    }
}


export class DialogContainer {
    private dialog_container: HTMLElement;
    private current_dialog: Dialog | null = null;

    public constructor(element: HTMLElement) {
        this.dialog_container = element;
        this.dialog_container.addEventListener("click", (ev) => {
            if (ev.target === this.dialog_container) {
                this.close_dialog();
            }
        });
    }

    public on_open_dialog(dialog: Dialog) {
        this.dialog_container.style.display = "block";
        this.current_dialog = dialog;
    }

    public on_close_dialog() {
        this.dialog_container.style.display = "none";
        this.current_dialog = null;
    }

    public close_dialog() {
        if (this.current_dialog !== null) {
            this.current_dialog.close();
        }
    }

    public get_element() {
        return this.dialog_container;
    }
}
