import JSON5 from "json5";

import { Dialog, DialogContainer } from "../../utils/dialog";
import {
  AIGraph,
  GraphSignature,
  ValueInputDef,
  ValueOutputDef,
  FlowOutputDef,
} from "../../graph/ai_graph_editor";

// Same set as argtype_to_widget_type in ai_graph_editor.ts. Kept in sync
// manually — there is no shared registry yet.
const VALUE_TYPE_OPTIONS: string[] = [
  "string",
  "bool",
  "float",
  "f16",
  "f32",
  "f64",
  "int",
  "i8",
  "i16",
  "i32",
  "i64",
  "u8",
  "u16",
  "u32",
  "u64",
  "enum",
];

export class GraphSettingsDialog extends Dialog {
  private form_elem: HTMLFormElement;
  private graph_name_label: HTMLElement;
  private value_inputs_tbody: HTMLTableSectionElement;
  private value_outputs_tbody: HTMLTableSectionElement;
  private flow_outputs_tbody: HTMLTableSectionElement;
  private constants_textarea: HTMLTextAreaElement;
  private constants_error: HTMLElement;
  private cancel_btn: HTMLButtonElement;
  private current_graph: AIGraph | null = null;

  public constructor(container: DialogContainer, element: HTMLElement) {
    super(container, element);

    this.form_elem = document.getElementById("graph_settings_dialog") as HTMLFormElement;
    this.graph_name_label = document.getElementById("graph_settings_graph_name")!!;

    this.value_inputs_tbody = document.querySelector(
      "#graph_settings_value_inputs_table tbody",
    ) as HTMLTableSectionElement;
    this.value_outputs_tbody = document.querySelector(
      "#graph_settings_value_outputs_table tbody",
    ) as HTMLTableSectionElement;
    this.flow_outputs_tbody = document.querySelector(
      "#graph_settings_flow_outputs_table tbody",
    ) as HTMLTableSectionElement;

    this.constants_textarea = document.getElementById(
      "graph_settings_constants",
    ) as HTMLTextAreaElement;
    this.constants_error = document.getElementById("graph_settings_constants_error")!!;

    this.cancel_btn = document.getElementById("graph_settings_cancel_btn") as HTMLButtonElement;
    this.cancel_btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      this.close();
    });

    document
      .getElementById("graph_settings_value_inputs_add")!!
      .addEventListener("click", () => this.add_value_input_row());
    document
      .getElementById("graph_settings_value_outputs_add")!!
      .addEventListener("click", () => this.add_value_output_row());
    document
      .getElementById("graph_settings_flow_outputs_add")!!
      .addEventListener("click", () => this.add_flow_output_row());

    this.form_elem.addEventListener("submit", (ev) => {
      ev.preventDefault();
      this.on_submit();
    });
  }

  // Open the dialog pre-populated with the current signature of `graph`.
  // Returns when the user closes/cancels (Dialog.close) or saves
  // (Dialog.complete with the new signature).
  public open_for(graph: AIGraph) {
    this.current_graph = graph;
    this.graph_name_label.textContent = graph.get_name();
    this.populate_from(graph.get_signature());
    return this.open();
  }

  private populate_from(sig: GraphSignature) {
    this.value_inputs_tbody.replaceChildren();
    this.value_outputs_tbody.replaceChildren();
    this.flow_outputs_tbody.replaceChildren();
    this.constants_error.textContent = "";

    for (const v of sig.value_inputs) this.add_value_input_row(v);
    for (const v of sig.value_outputs) this.add_value_output_row(v);
    for (const f of sig.flow_outputs) this.add_flow_output_row(f);

    // Pretty-print constants as JSON5 so the user gets the same readable
    // shape they wrote (trailing commas, unquoted keys).
    this.constants_textarea.value =
      Object.keys(sig.constants).length === 0
        ? ""
        : JSON5.stringify(sig.constants, null, 4);
  }

  // ----- value inputs -----

  private add_value_input_row(def?: ValueInputDef) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="vi_name" placeholder="name" required /></td>
      <td><select class="vi_type">${this.type_options_html()}</select></td>
      <td><input type="text" class="vi_default" placeholder="(none)" /></td>
      <td><input type="text" class="vi_values" placeholder="a, b, c" /></td>
      <td><button type="button" class="graph_settings_remove_btn">X</button></td>
    `;
    if (def) {
      (tr.querySelector(".vi_name") as HTMLInputElement).value = def.name;
      (tr.querySelector(".vi_type") as HTMLSelectElement).value = def.value_type;
      if (def.default !== undefined) {
        (tr.querySelector(".vi_default") as HTMLInputElement).value = String(def.default);
      }
      if (def.values !== undefined && Array.isArray(def.values)) {
        (tr.querySelector(".vi_values") as HTMLInputElement).value = def.values.join(", ");
      }
    }
    tr.querySelector(".graph_settings_remove_btn")!!.addEventListener("click", () => tr.remove());
    this.value_inputs_tbody.appendChild(tr);
  }

  // ----- value outputs -----

  private add_value_output_row(def?: ValueOutputDef) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="vo_name" placeholder="name" required /></td>
      <td><select class="vo_type">${this.type_options_html()}</select></td>
      <td><button type="button" class="graph_settings_remove_btn">X</button></td>
    `;
    if (def) {
      (tr.querySelector(".vo_name") as HTMLInputElement).value = def.name;
      (tr.querySelector(".vo_type") as HTMLSelectElement).value = def.value_type;
    }
    tr.querySelector(".graph_settings_remove_btn")!!.addEventListener("click", () => tr.remove());
    this.value_outputs_tbody.appendChild(tr);
  }

  // ----- flow outputs -----

  private add_flow_output_row(def?: FlowOutputDef) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="fo_name" placeholder="name (e.g. ok / fail)" required /></td>
      <td><button type="button" class="graph_settings_remove_btn">X</button></td>
    `;
    if (def) {
      (tr.querySelector(".fo_name") as HTMLInputElement).value = def.name;
    }
    tr.querySelector(".graph_settings_remove_btn")!!.addEventListener("click", () => tr.remove());
    this.flow_outputs_tbody.appendChild(tr);
  }

  private type_options_html(): string {
    return VALUE_TYPE_OPTIONS.map((t) => `<option value="${t}">${t}</option>`).join("");
  }

  // ----- collect + validate -----

  private collect_signature(): GraphSignature | null {
    const value_inputs: ValueInputDef[] = [];
    for (const tr of this.value_inputs_tbody.querySelectorAll("tr")) {
      const name = (tr.querySelector(".vi_name") as HTMLInputElement).value.trim();
      if (!name) continue;
      const value_type = (tr.querySelector(".vi_type") as HTMLSelectElement).value;
      const default_raw = (tr.querySelector(".vi_default") as HTMLInputElement).value;
      const values_raw = (tr.querySelector(".vi_values") as HTMLInputElement).value.trim();
      const def: ValueInputDef = { name, value_type };
      if (default_raw !== "") {
        def.default = parse_scalar(default_raw, value_type);
      }
      if (values_raw !== "") {
        def.values = values_raw.split(",").map((s) => parse_scalar(s.trim(), value_type));
      }
      value_inputs.push(def);
    }

    const value_outputs: ValueOutputDef[] = [];
    for (const tr of this.value_outputs_tbody.querySelectorAll("tr")) {
      const name = (tr.querySelector(".vo_name") as HTMLInputElement).value.trim();
      if (!name) continue;
      const value_type = (tr.querySelector(".vo_type") as HTMLSelectElement).value;
      value_outputs.push({ name, value_type });
    }

    const flow_outputs: FlowOutputDef[] = [];
    for (const tr of this.flow_outputs_tbody.querySelectorAll("tr")) {
      const name = (tr.querySelector(".fo_name") as HTMLInputElement).value.trim();
      if (!name) continue;
      flow_outputs.push({ name });
    }

    let constants: any = {};
    const constants_raw = this.constants_textarea.value.trim();
    if (constants_raw !== "") {
      try {
        constants = JSON5.parse(constants_raw);
      } catch (err) {
        this.constants_error.textContent = `Invalid JSON5: ${(err as Error).message}`;
        return null;
      }
      if (typeof constants !== "object" || constants === null || Array.isArray(constants)) {
        this.constants_error.textContent = "Constants must be a JSON5 object at the top level.";
        return null;
      }
    }
    this.constants_error.textContent = "";

    if (!check_unique_names(value_inputs.map((v) => v.name), this.constants_error, "value input")) {
      return null;
    }
    const out_names = [
      ...flow_outputs.map((f) => f.name),
      ...value_outputs.map((v) => v.name),
    ];
    if (!check_unique_names(out_names, this.constants_error, "output")) return null;

    return { value_inputs, value_outputs, flow_outputs, constants };
  }

  private on_submit() {
    const sig = this.collect_signature();
    if (sig === null) return; // error message already set
    this.complete(sig);
  }
}

// Best-effort scalar coercion based on the declared value type. Anything we
// can't parse falls back to the raw string — the user keeps what they typed.
function parse_scalar(raw: string, value_type: string): any {
  if (value_type === "bool") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    return raw;
  }
  if (
    value_type === "float" || value_type.startsWith("f") ||
    value_type === "int" || value_type.startsWith("i") || value_type.startsWith("u")
  ) {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  return raw;
}

function check_unique_names(names: string[], err_elem: HTMLElement, kind: string): boolean {
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) {
      err_elem.textContent = `Duplicate ${kind} name: "${n}".`;
      return false;
    }
    seen.add(n);
  }
  return true;
}
