import json
from pathlib import Path
import argparse
import subprocess
import shutil
import lxml.etree as etree
from typing import Any
import sys


EVO_LL_CORE_URL = "git@github.com:evolutek/evo-ll-core.git"

CMAKE_PROJECT_NATURE = "com.st.stm32cube.ide.cmake.CmakeConfigProjectNature"

TEMPLATE_DIRECTORY = Path(__file__).parents[1] / "template"

CMAKE_CCONFIGURATIONS_FILE = TEMPLATE_DIRECTORY / "cmake_cconfigurations.xml"
CMAKE_BUILD_COMMAND_FILE = TEMPLATE_DIRECTORY / "cmake_build_command.xml"

TEMPLATE_PROJECT_FILE = TEMPLATE_DIRECTORY / ".project"
TEMPLATE_CPROJECT_FILE = TEMPLATE_DIRECTORY / ".cproject"

TEMPLATE_CMAKE_PRESETS_FILE = TEMPLATE_DIRECTORY / "CMakePresets.json"

TEMPLATE_STM32_CUBEMX_CMAKE_DIR = TEMPLATE_DIRECTORY / "cmake"
TEMPLATE_CMAKELISTS_FILE = TEMPLATE_DIRECTORY / "CMakeLists.txt"

TEMPLATE_COMMON_FILES = [
    TEMPLATE_DIRECTORY / ".gitignore",
    TEMPLATE_DIRECTORY / "App",
]


def error(msg: str, *args, **kwargs) -> None:
    print(msg, *args, **kwargs, file=sys.stderr, flush=True)


def ask_yes_no(question: str) -> bool:
    while True:
        v = input(question)
        v = v.lower()
        if v == "y" or v == "yes":
            return True
        elif v == "n" or v == "no":
            return False
        print("Please answer with yes or no")


def clean_xml_tree(root) -> None:
    for element in root.iter():
        if element.text is not None and not element.text.strip() and element.text != "":
            element.text = None
        if element.tail is not None and not element.tail.strip():
            element.tail = None


def parse_xml_string(s: str) -> etree.Element:
    parser = etree.XMLParser(remove_blank_text=False)
    root = etree.fromstring(s, parser)
    clean_xml_tree(root)
    return root


def parse_xml_file(file_path: Path) -> etree.ElementTree:
    parser = etree.XMLParser(remove_blank_text=False)
    root = etree.parse(file_path, parser)
    clean_xml_tree(root)
    return root


def write_xml_file(file_path: Path, root, standalone=None) -> None:
    with open(file_path, "wb") as f:
        etree.indent(root, "\t")
        f.write(etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=standalone))


def parse_json_file(file_path: Path) -> Any:
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_json_string(s: str) -> Any:
    return json.loads(s)


def write_json_file(file_path: Path, data: Any) -> None:
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


class IOCEntry:
    pass


class IOCValueEntry(IOCEntry):
    __slots__ = ("key", "value")

    def __init__(self, key: str, value: str):
        self.key = key
        self.value = value


class IOCCommentEntry(IOCEntry):
    __slots__ = ("comment")

    def __init__(self, comment: str):
        self.comment = comment


class IOC:
    def __init__(self):
        self.entries: list[IOCEntry] = []
        self.values: dict[str, IOCValueEntry] = dict()

    def __getitem__(self, key: str) -> str:
        return self.values[key].value

    def __setitem__(self, key: str, value: str) -> None:
        self.values[key].value = value


def parse_ioc(ioc_file_path: Path) -> IOC:
    result = IOC()
    lines = ioc_file_path.read_text().splitlines()
    for line in lines:
        if line.strip() == "" or line.startswith("#"):
            result.entries.append(IOCCommentEntry(line))
        else:
            parts = line.split('=')
            key = parts[0].strip()
            value = parts[1]
            result.entries.append(IOCValueEntry(key, value))
            result.values[key] = result.entries[-1]
    return result


def write_ioc_file(file_path: Path, ioc: IOC) -> None:
    with open(file_path, "w", encoding="utf-8") as f:
        for entry in ioc.entries:
            if isinstance(entry, IOCValueEntry):
                f.write(f"{entry.key}={entry.value}\n")
            elif isinstance(entry, IOCCommentEntry):
                f.write(f"{entry.comment}\n")


def get_mcu_family(ioc: IOC) -> str:
    return ioc["Mcu.Family"]


def get_project_name(ioc: IOC) -> str:
    return ioc["ProjectManager.ProjectName"]


def get_main_c_path(ioc: IOC) -> Path:
    return Path(ioc["ProjectManager.MainLocation"]) / "main.c"


def patch_project_file(project_dir_path: Path, ioc: IOC) -> None:
    print(f"Patching .project file")

    # Load and parse XML file

    project_file_path = project_dir_path / ".project"
    if not project_file_path.exists():
        root = parse_xml_file(TEMPLATE_PROJECT_FILE)
    else:
        root = parse_xml_file(project_file_path)

    project_description = root.getroot()

    # Set project name if not set

    project_name = project_description.find("name")
    if project_name is None or not project_name.text:
        project_name.text = get_project_name(ioc)

    # Add CMake nature

    natures = project_description.find("natures")

    has_cmake_nature = False
    for nature in natures:
        if nature.tag == "nature" and nature.text == CMAKE_PROJECT_NATURE:
            has_cmake_nature = True
            break

    if not has_cmake_nature:
        cmake_nature = natures.makeelement("nature")
        cmake_nature.text = CMAKE_PROJECT_NATURE
        natures.append(cmake_nature)

    # Add CMake build command

    build_spec = project_description.find("buildSpec")

    has_cmake_build_command = False
    for build_command in build_spec:
        if build_command.find("name").text == "com.st.stm32cube.ide.cmake.CmakeConfigureProjectBuilder":
            has_cmake_build_command = True
            break

    if not has_cmake_build_command:
        build_spec.append(parse_xml_file(CMAKE_BUILD_COMMAND_FILE).getroot())

    # Write file back

    write_xml_file(project_file_path, root)


def patch_cproject_file(project_dir_path: str) -> None:
    print(f"Patching .cproject file")

    # Load and parse XML file
    project_file_path = project_dir_path / ".cproject"
    if not project_file_path.exists():
        root = parse_xml_file(TEMPLATE_CPROJECT_FILE)
    else:
        root = parse_xml_file(project_file_path)

    cproject = root.getroot()

    # Add CMake cconfigurations

    configuations_to_add = parse_xml_file(CMAKE_CCONFIGURATIONS_FILE)
    # for builder in configuations_to_add.iterfind("builder"):
    #     builder.set("buildPath", "${workspace_loc:/" + "" + "}")

    configurations = cproject.find(".//storageModule[@moduleId='org.eclipse.cdt.core.settings']")

    # Remove all configurations children

    configurations_attrib = list(configurations.attrib.items())
    configurations.clear()
    configurations.attrib.update(configurations_attrib)

    # Append child to configurations

    for configuration in configuations_to_add.getroot():
        configurations.append(configuration)

    # Write file back

    write_xml_file(project_file_path, root, standalone="no")


def patch_cmake_presets(project_dir_path: Path, ioc: IOC) -> None:
    print("Patching CMakePresets.json file")

    cmake_presets_file_path = project_dir_path / "CMakePresets.json"

    if not cmake_presets_file_path.exists():
        data = parse_json_file(TEMPLATE_CMAKE_PRESETS_FILE)
    else:
        data = parse_json_file(cmake_presets_file_path)

    if data["version"] != 3:
        raise RuntimeError(f"Unsupported CMakePresets.json file version {data["version"]}")

    for preset in data["configurePresets"]:
        if preset["name"] == "default":
            cache_variables = preset["cacheVariables"]
            if "LIBRARY_TARGET_PLATFORM" not in cache_variables:
                cache_variables["LIBRARY_TARGET_PLATFORM"] = get_mcu_family(ioc)

    write_json_file(cmake_presets_file_path, data)


def clone_evo_ll_core(project_dir_path: Path, branch: str = "dev") -> None:
    print("Cloning evo-ll-core")

    repo_dir_name = "evo-ll-core"
    if (project_dir_path / repo_dir_name).exists():
        return

    subprocess.run([
        shutil.which("git"),
        "clone",
        "--recurse-submodules",
        "--branch", branch,
        EVO_LL_CORE_URL,
        repo_dir_name
    ], cwd = project_dir_path)


def patch_main_c(project_dir_path: Path, ioc: IOC) -> None:
    print("Patching main.c file")

    main_c_file_path = project_dir_path / get_main_c_path(ioc)
    content = main_c_file_path.read_text("utf-8")
    input_lines = content.splitlines(keepends=False)
    output_lines = []

    def insert_line(i: int, line: str) -> None:
        if i < len(input_lines) and input_lines[i] != line:
            output_lines.append(line)

    for i, line in enumerate(input_lines):
        output_lines.append(line)
        if line.lstrip().startswith("/*"):
            if line.find("USER CODE BEGIN Includes") != -1:
                insert_line(i + 1, "#include \"core.h\"")
            elif line.find("USER CODE BEGIN WHILE") != -1:
                insert_line(i + 1, "  core_init();")
            elif line.find("USER CODE BEGIN 3") != -1:
                insert_line(i + 1, "    core_handle();")
    main_c_file_path.write_text("\n".join(output_lines), encoding = "utf-8")


def copy_file(src: Path, dst: Path, override: bool = False) -> None:
    if override or not dst.exists():
        print(f"Copy file {src} -> {dst}")
        shutil.copyfile(src, dst)
    else:
        print(f"File {dst} already exists")


def copy_directory(src: Path, dst: Path) -> None:
    print(f"Copy directory {src} -> {dst}")

    if not dst.exists():
        dst.mkdir()

    for root, dirs, files in src.walk(top_down=True, on_error=None, follow_symlinks=False):
        dst_path = dst / root.relative_to(src)

        for dir_name in dirs:
            dir_path = dst_path / dir_name
            if not dir_path.exists():
                dir_path.mkdir()

        for file_name in files:
            copy_file(root / file_name, dst_path / file_name)


def copy(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        copy_directory(src, dst / src.name)
    else:
        copy_file(src, dst / src.name)


def copy_cubemx_cmake_dir(project_dir_path: Path) -> None:
    copy(TEMPLATE_STM32_CUBEMX_CMAKE_DIR, project_dir_path)


def copy_cmakelists_file(project_dir_path: Path) -> None:
    cmake_lists_file_path = project_dir_path / "CMakeLists.txt"
    if not cmake_lists_file_path.exists():
        copy_file(TEMPLATE_CMAKELISTS_FILE, cmake_lists_file_path)
    else:
        cmake_lists_content = cmake_lists_file_path.read_text(encoding = "utf-8")
        if not any(["add_subdirectory(evo-ll-core)" in cmake_lists_content.splitlines()]):
            print("CMakeLists.txt exists but do not contains evo-ll-core subdirectory")
            if ask_yes_no("Do you want to override it with the template CMakeLists.txt ? (y/n): "):
                copy_file(TEMPLATE_CMAKELISTS_FILE, cmake_lists_file_path, override = True)


def copy_template(project_dir_path: Path) -> None:
    for path in TEMPLATE_COMMON_FILES:
        copy(path, project_dir_path)


def check_ioc(ioc: IOC, ioc_file_path: Path) -> None:
    # if ioc["ProjectManager.MainLocation"] != "Core/Src":
    #     error(f"IOC file has incorrect main location '{ioc['ProjectManager.MainLocation']}'.")
    #     error("Please convert a supported project (create an 'advanced' project architecture in CubeMX).")
    #     error("The 'ProjectManager.MainLocation' key in the .ioc file should be 'Core/Src'.")
    #     raise SystemExit(1)

    target_toolchain = ioc["ProjectManager.TargetToolchain"]
    if target_toolchain != "CMake":
        print(f"IOC file has incorrect target toolchain '{target_toolchain}', changing it to 'CMake'")
        ioc["ProjectManager.PreviousToolchain"] = target_toolchain
        ioc["ProjectManager.TargetToolchain"] = "CMake"
        ioc["ProjectManager.ToolChainLocation"] = ""

    write_ioc_file(ioc_file_path, ioc)


def main() -> int:
    parser = argparse.ArgumentParser(prog="evo-init-ll-app", description="Evolutek Low Level Application Initializer Tool")
    parser.add_argument("project_dir", help="The path to the project directory generated by STM32 CubeMX")
    args = parser.parse_args()

    try:
        project_dir_path = Path(args.project_dir)

        ioc_file_path = project_dir_path / (project_dir_path.name + ".ioc")
        if not ioc_file_path.exists():
            error("IOC file not found")
            return 1

        ioc = parse_ioc(ioc_file_path)

        check_ioc(ioc, ioc_file_path)
        copy_cmakelists_file(project_dir_path)
        copy_cubemx_cmake_dir(project_dir_path)
        patch_cmake_presets(project_dir_path, ioc)
        patch_project_file(project_dir_path, ioc)
        patch_cproject_file(project_dir_path)
        copy_template(project_dir_path)
        patch_main_c(project_dir_path, ioc)
        clone_evo_ll_core(project_dir_path)

    except SystemExit as e:
        return e.code

    except Exception as e:
        error(str(e))
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
