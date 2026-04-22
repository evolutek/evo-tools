import { Dialog, DialogContainer } from "../utils/dialog";
import { ConfirmDialog } from "./dialogs/confirm_dialog";
import { NewGraphDialog } from "./dialogs/new_graph_dialog";


export class Dialogs {
    private dialog_template: HTMLTemplateElement;

    private container: DialogContainer;

    public confirm_dialog: Dialog;
    public new_graph_dialog: Dialog;

    public constructor() {
        this.dialog_template = document.getElementById("dialog_template")!! as HTMLTemplateElement;

        this.container = new DialogContainer(document.getElementById("dialog_container")!!);

        const dialog_contents = document.getElementById("dialog_contents")!! as HTMLTemplateElement;
        const imported_dialog_contents = document.importNode(dialog_contents.content, true)!!;

        this.confirm_dialog = new ConfirmDialog(this.container, this.create_dialog_element(imported_dialog_contents.getElementById("confirm_dialog")!!));
        this.new_graph_dialog = new NewGraphDialog(this.container, this.create_dialog_element(imported_dialog_contents.getElementById("new_graph_dialog")!!));
    }

    private create_dialog_element(content: HTMLElement): HTMLElement {
        const dialog_doc = document.importNode(this.dialog_template.content, true);
        const dialog_elem = dialog_doc.firstElementChild!! as HTMLElement;
        const dialog_content_elem = dialog_doc.getElementById("dialog_content")!!;
        dialog_content_elem.appendChild(content);
        dialog_elem.style.display = "none";
        this.container.get_element().appendChild(dialog_elem);
        return dialog_elem;
    }
}
