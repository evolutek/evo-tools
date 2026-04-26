import { Dialog, DialogContainer } from '../../utils/dialog';


export class NewGraphDialog extends Dialog {
    private name_input: HTMLInputElement;

    public constructor(container: DialogContainer, element: HTMLElement) {
        super(container, element);
        this.name_input = document.getElementById("new_graph_name_input")!! as HTMLInputElement;
        const form_elem = document.getElementById("new_graph_dialog") as HTMLFormElement;
        form_elem.addEventListener("submit", (ev) => {
            this.complete({name: this.name_input.value});
            ev.preventDefault();
        });
    }
}
