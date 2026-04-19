import { Table } from './views/table';
import { GraphEditorManager } from './graph/manager';

import JSON5 from 'json5'


const CONFIG_MIME_TYPES = [
    "application/json",
    "application/json5"
];


const CONFIG_FILE_EXT_TO_MIME_TYPE: Map<string, string> = new Map([
    [".json", "application/json"],
    [".json5", "application/json5"],
]);


// Combinaison of config mime types and file extentions used as argument of upload(...)
const CONFIG_FILE_TYPES = [...CONFIG_MIME_TYPES, ...CONFIG_FILE_EXT_TO_MIME_TYPE.keys()];


// localStorage keys for session persistence.
const STORAGE_KEY_TYPES_CONTENT = "ai-editor.types.content";
const STORAGE_KEY_TYPES_MIME = "ai-editor.types.mime";


function parse_config(data: string, filename?: string, mimetype?: string): any {
    let type = "application/json5";
    if (mimetype && CONFIG_MIME_TYPES.includes(mimetype)) {
        type = mimetype;
    } else if (filename) {
        const parts = filename.split('.');
        const ext = parts[parts.length - 1].toLowerCase();
        type = CONFIG_FILE_EXT_TO_MIME_TYPE.get(ext) || type;
    }
    if (type === "application/json") {
        return JSON.parse(data);
    } else if (type == "application/json5") {
        return JSON5.parse(data);
    } else {
        throw new Error(`Unsupported config mime type: ${type}`);
    }
}


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


type UploadedFile = {
    content: string,
    filename: string,
    type: string
};


function upload(accepts: string[]): Promise<UploadedFile> {
    return new Promise((resolve, reject) => {
        const element = document.createElement("input") as HTMLInputElement;
        element.type = "file";
        element.accept = accepts.join(",");
        element.style.display = 'none';

        const cleanup = () => {
            if (element.parentNode) element.parentNode.removeChild(element);
        };

        element.addEventListener("change", (event) => {
            const target = event.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                const file = target.files[0];
                const reader = new FileReader();
                reader.onload = (e) => {
                    cleanup();
                    resolve({
                        content: (e.target?.result as string),
                        filename: file.name,
                        type: file.type
                    });
                };
                reader.onerror = (err) => {
                    cleanup();
                    reject(err);
                };
                reader.readAsText(file, 'UTF-8');
            } else {
                cleanup();
                reject(new Error("No file selected"));
            }
        });
        element.addEventListener("cancel", () => {
            cleanup();
            reject(new Error("File upload cancelled"));
        });

        document.body.appendChild(element);
        element.click();
    });
}


class EditorTab {

}


class App {
    private editor_manager: GraphEditorManager;
    private table: Table;
    private tabs: EditorTab[] = [];

    // HTML elements
    private export_project_btn: HTMLButtonElement;
    private import_project_btn: HTMLButtonElement;
    private export_graph_btn: HTMLButtonElement;
    private import_types_btn: HTMLButtonElement;
    private editor_tabs: HTMLDivElement;

    public constructor() {
        this.editor_manager = new GraphEditorManager(document.getElementById("editor_canvas")!! as HTMLCanvasElement);
        this.table = new Table();
        this.export_project_btn = document.getElementById("export_project_btn")!! as HTMLButtonElement;
        this.import_project_btn = document.getElementById("import_project_btn")!! as HTMLButtonElement;
        this.export_graph_btn = document.getElementById("export_graph_btn")!! as HTMLButtonElement;
        this.import_types_btn = document.getElementById("import_types_btn")!! as HTMLButtonElement;
        this.editor_tabs = document.getElementById("editor_tabs")!! as HTMLDivElement;
    }

    public async main() {
        await this.init();
        this.table.start();
        this.editor_manager.get_editor().start();
    }

    public async init() {
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

        // Load node types: cached from a previous session if present, else the default bundled file.
        // If the cached payload is corrupt, fall back silently so a bad cache never bricks the app.
        let loaded_from_cache = false;
        try {
            const cached_content = localStorage.getItem(STORAGE_KEY_TYPES_CONTENT);
            if (cached_content) {
                const cached_mime = localStorage.getItem(STORAGE_KEY_TYPES_MIME) || "application/json5";
                this.editor_manager.import_types(parse_config(cached_content, undefined, cached_mime));
                loaded_from_cache = true;
            }
        } catch (err) {
            console.warn("Cached types failed to load, falling back to default:", err);
            localStorage.removeItem(STORAGE_KEY_TYPES_CONTENT);
            localStorage.removeItem(STORAGE_KEY_TYPES_MIME);
        }
        if (!loaded_from_cache) {
            let r = await fetch("assets/types.json5");
            this.editor_manager.import_types(parse_config(await r.text(), undefined, "application/json5"));
        }
    }

    public async download_project() {
        var data = this.editor_manager.export_project();
        download(JSON5.stringify(data, null, 4), "project.json5");
    }

    public async download_graph() {
        var data = this.editor_manager.export_graph();
        var config = {
            "version": 1,
            "graphes": {
                "main": data
            }
        }
        download(JSON5.stringify(config, null, 4), "graphes.json5");
    }

    public async import_project() {
        const file = await upload(CONFIG_FILE_TYPES);
        const data = parse_config(file.content, file.filename, file.type);
        this.editor_manager.import_project(data);
    }

    public async import_types() {
        const file = await upload(CONFIG_FILE_TYPES);
        const data = parse_config(file.content, file.filename, file.type);
        this.editor_manager.import_types(data);
        // Persist raw content so the next session reloads these types without a re-import.
        try {
            localStorage.setItem(STORAGE_KEY_TYPES_CONTENT, file.content);
            localStorage.setItem(STORAGE_KEY_TYPES_MIME, file.type || "application/json5");
        } catch (err) {
            console.warn("Could not persist imported types:", err);
        }
    }

    public async import_graph() {
        const file = await upload(CONFIG_FILE_TYPES);
        const data = parse_config(file.content, file.filename, file.type);
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
