# Evolutek AI Editor

## How to run

```shell
# First time only:
git submodule update --init --recursive
npm install

# Every time you want to run:
npm run serve
```

Then a webpage at the address `http://localhost:8080/` should open in your web browser.

## Technical details

The graph library used is LiteGraph.js, because it's not rely on any backend like (Vite, React, Next, Svelte, Angular, ...).
But this library is missing an important feature, it's not possible have multiple input connections for the same socket/slot on a node.
So to address this issue, a fork has been created at https://github.com/kolte200/litegraph.js and this repository is used as a submodule and dependency of this project.

An alternative solution is to use https://github.com/ayushk7/CodeWire it's un Unreal Engine like graph editor and the code is a lot more maintainable.

## TODOs

- Allow loading of graph configuration and not project configurations.
- Prevent connections of not compatible value types.
- Prevent connections of a flow output to a value input and vice-versa.
- Add tabs for subgraphes
