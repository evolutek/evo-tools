# Evolutek low level application initialiozer

This small project can convert an existing STM32 CubeMX/CubeIDE project to CMake based project that can use the evo-ll-core and evo-ll-library.

## How to use

```shell
uv run init-ll-app path/to/project
```

## Details

**What's this script does to an existing CubeMX's CMake project:**
- Edit CMakePresets.json to add the LIBRARY_TARGET_PLATFORM option
- Edit Core/Src/main.c to add call to core_init() and core_handle()
- Clone evo-ll-core repository
- Copy template App/app.c file
- Copy a default .gitignore
- Copy a root CMakeLists.txt that link and compile everythings correctly
- Edit .project file to add CMake nature and CMake build command
- Edit .cproject file to add build configurations

**Notes:**
- The template .project and .cproject file were obtained by creating a CMake
  type project inside STM32 CubeIDE.
- STM32 CubeMX can edit and override files inside the cmake/stm32cubemx
  directory when enabling/disabling MCU features.
