import { Dialog, DialogContainer } from '../../utils/dialog';


export class ConfirmDialog extends Dialog {
    public constructor(container: DialogContainer, element: HTMLElement) {
        super(container, element);
        const form_elem = document.getElementById("confirm_dialog") as HTMLFormElement;
        form_elem.addEventListener("submit", (ev) => {
            this.complete();
            ev.preventDefault();
        });
    }
}
