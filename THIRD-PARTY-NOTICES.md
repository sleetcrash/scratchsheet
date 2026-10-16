# Third-Party Notices

Scratch Sheet is released under the MIT License (see [LICENSE](LICENSE)). The Windows installer also contains the third-party software listed below. Each component keeps its own license, and every declared license is permissive.

## Where the license texts are

- **Packages:** each package ships with its own license file inside the installer, in `resources/app.asar` under `node_modules/<package>/`.
- **Electron, Chromium, and Node.js:** `LICENSE.electron.txt` and `LICENSES.chromium.html` in the install folder.

## Main components

| Component | Version | License | Used for |
|---|---|---|---|
| [Electron](https://github.com/electron/electron) | 44.5.1 | MIT | App runtime (includes Chromium and Node.js) |
| [Univer](https://github.com/dream-num/univer) (`@univerjs/*`) | 1.0.3 | Apache-2.0 | Spreadsheet engine and grid |
| [ExcelJS](https://github.com/exceljs/exceljs) | 4.4.0 | MIT | Saving sheets as .xlsx |
| [Material Symbols](https://github.com/google/material-design-icons) by Google | n/a | Apache-2.0 | Icons in `src/icons/` |

## Modifications

Scratch Sheet changes one Univer file: `lib/es/index.js` in `@univerjs/sheets-ui` 1.0.3 (Apache-2.0). The change stops the arrow keys from wrapping around the edges of the sheet. It lives in [`patches/@univerjs+sheets-ui+1.0.3.patch`](patches/@univerjs+sheets-ui+1.0.3.patch) and is applied by [patch-package](https://github.com/ds300/patch-package) (MIT) when dependencies are installed.

## License notes

- **jszip** is dual-licensed MIT or GPL-3.0-or-later. Scratch Sheet uses it under MIT.
- **buffers** 0.1.1 declares no license in its package.

## All packages in the installer

199 packages, grouped by license.

### MIT (128)

- @fast-csv/format 4.3.5
- @fast-csv/parse 4.3.6
- @flatten-js/interval-tree 1.1.3
- @floating-ui/core 1.8.0
- @floating-ui/dom 1.8.0
- @floating-ui/react-dom 2.1.9
- @floating-ui/utils 0.2.12
- @js-sdsl/ordered-map 4.4.2
- @radix-ui/primitive 1.1.7
- @radix-ui/react-arrow 1.1.15
- @radix-ui/react-collection 1.1.15
- @radix-ui/react-compose-refs 1.1.5
- @radix-ui/react-context 1.2.2
- @radix-ui/react-dialog 1.1.23
- @radix-ui/react-direction 1.1.4
- @radix-ui/react-dismissable-layer 1.1.19
- @radix-ui/react-dropdown-menu 2.1.24
- @radix-ui/react-focus-guards 1.1.6
- @radix-ui/react-focus-scope 1.1.16
- @radix-ui/react-hover-card 1.1.23
- @radix-ui/react-id 1.1.4
- @radix-ui/react-menu 2.1.24
- @radix-ui/react-popover 1.1.23
- @radix-ui/react-popper 1.3.7
- @radix-ui/react-portal 1.1.17
- @radix-ui/react-presence 1.1.10
- @radix-ui/react-primitive 2.1.10
- @radix-ui/react-roving-focus 1.1.19
- @radix-ui/react-separator 1.1.15
- @radix-ui/react-slot 1.3.3
- @radix-ui/react-use-callback-ref 1.1.4
- @radix-ui/react-use-controllable-state 1.2.6
- @radix-ui/react-use-effect-event 0.0.5
- @radix-ui/react-use-is-hydrated 0.1.3
- @radix-ui/react-use-layout-effect 1.1.4
- @radix-ui/react-use-rect 1.1.4
- @radix-ui/react-use-size 1.1.4
- @radix-ui/rect 1.1.3
- @types/node 24.19.0
- @univerjs/icons 1.43.1
- @wendellhu/redi 1.1.3
- ansi-regex 5.0.1
- ansi-styles 4.3.0
- archiver 5.3.2
- archiver-utils 2.1.0
- aria-hidden 1.2.6
- async 3.2.6
- async-lock 1.4.1
- balanced-match 4.0.4
- base64-js 1.5.1
- binary 0.3.0
- bl 4.1.0
- bluebird 3.7.2
- brace-expansion 5.0.12
- buffer 5.7.1
- buffer-crc32 0.2.13
- buffer-indexof-polyfill 1.0.2
- clsx 2.1.1
- cmdk 1.1.1
- collapse-white-space 2.1.0
- color-convert 2.0.1
- color-name 1.1.4
- compress-commons 4.1.2
- concat-map 0.0.1
- core-util-is 1.0.3
- crc32-stream 4.0.3
- dayjs 1.11.23
- decimal.js 10.6.0
- detect-node-es 1.1.0
- emoji-regex 8.0.0
- end-of-stream 1.4.5
- escalade 3.2.0
- exceljs 4.4.0
- fast-csv 4.3.6
- franc-min 6.2.0
- fs-constants 1.0.0
- get-nonce 1.0.1
- immediate 3.0.6
- is-fullwidth-code-point 3.0.0
- isarray 1.0.0
- lazystream 1.0.1
- lie 3.3.0
- lodash-es 4.18.1
- lodash.camelcase 4.3.0
- lodash.defaults 4.2.0
- lodash.difference 4.5.0
- lodash.escaperegexp 4.1.2
- lodash.flatten 4.4.0
- lodash.groupby 4.6.0
- lodash.isboolean 3.0.3
- lodash.isequal 4.5.0
- lodash.isfunction 3.0.9
- lodash.isnil 4.0.0
- lodash.isplainobject 4.0.6
- lodash.isundefined 3.0.1
- lodash.union 4.6.0
- lodash.uniq 4.5.0
- minimist 1.2.8
- mkdirp 0.5.6
- n-gram 2.0.2
- normalize-path 3.0.0
- path-is-absolute 1.0.1
- process-nextick-args 2.0.1
- rbush 4.0.1
- react-remove-scroll 2.7.2
- react-remove-scroll-bar 2.3.8
- react-style-singleton 2.2.3
- readable-stream 2.3.8
- require-directory 2.1.1
- safe-buffer 5.1.2
- setimmediate 1.0.5
- sonner 2.0.8
- string-width 4.2.3
- string_decoder 1.1.1
- strip-ansi 6.0.1
- tar-stream 2.2.0
- tmp 0.2.7
- trigram-utils 2.0.1
- undici-types 7.24.6
- unzipper 0.12.5
- use-callback-ref 1.3.3
- use-sidecar 1.1.3
- util-deprecate 1.0.2
- uuid 8.3.2
- wrap-ansi 7.0.0
- xmlchars 2.2.0
- yargs 17.7.3
- zip-stream 4.1.1

### Apache-2.0 (31)

- @grpc/grpc-js 1.14.5
- @grpc/proto-loader 0.8.1
- @univerjs/core 1.0.3
- @univerjs/design 1.0.3
- @univerjs/docs 1.0.3
- @univerjs/docs-ui 1.0.3
- @univerjs/drawing 1.0.3
- @univerjs/engine-formula 1.0.3
- @univerjs/engine-render 1.0.3
- @univerjs/network 1.0.3
- @univerjs/preset-sheets-conditional-formatting 1.0.3
- @univerjs/preset-sheets-core 1.0.3
- @univerjs/presets 1.0.3
- @univerjs/protocol 1.0.3
- @univerjs/rpc 1.0.3
- @univerjs/sheets 1.0.3
- @univerjs/sheets-conditional-formatting 1.0.3
- @univerjs/sheets-conditional-formatting-ui 1.0.3
- @univerjs/sheets-formula 1.0.3
- @univerjs/sheets-formula-ui 1.0.3
- @univerjs/sheets-numfmt 1.0.3
- @univerjs/sheets-numfmt-ui 1.0.3
- @univerjs/sheets-ui 1.0.3
- @univerjs/telemetry 1.0.3
- @univerjs/themes 1.0.3
- @univerjs/ui 1.0.3
- class-variance-authority 0.7.1
- crc-32 1.2.2
- fast-diff 1.3.0
- long 5.3.2
- readdir-glob 1.1.3

### ISC (20)

- cliui 8.0.1
- fs.realpath 1.0.0
- fstream 1.0.12
- get-caller-file 2.0.5
- glob 7.2.3
- graceful-fs 4.2.11
- inflight 1.0.6
- inherits 2.0.4
- kdbush 4.1.0
- listenercount 1.0.1
- once 1.4.0
- ot-json1 1.0.2
- ot-text-unicode 4.0.0
- quickselect 3.0.0
- rimraf 2.6.3
- saxes 5.0.1
- unicount 1.1.0
- wrappy 1.0.2
- y18n 5.0.8
- yargs-parser 21.1.1

### BSD-3-Clause (12)

- @protobufjs/aspromise 1.1.2
- @protobufjs/base64 1.1.2
- @protobufjs/codegen 2.0.5
- @protobufjs/eventemitter 1.1.1
- @protobufjs/fetch 1.1.1
- @protobufjs/float 1.0.2
- @protobufjs/path 1.1.2
- @protobufjs/pool 1.1.0
- @protobufjs/utf8 1.1.2
- duplexer2 0.1.4
- ieee754 1.2.1
- protobufjs 7.6.6

### MIT/X11 (2)

- chainsaw 0.1.0
- traverse 0.3.9

### (MIT AND Zlib) (1)

- pako 1.0.11

### (MIT OR GPL-3.0-or-later) (1)

- jszip 3.10.2

### 0BSD (1)

- tslib 2.8.1

### BlueOak-1.0.0 (1)

- minimatch 10.2.6

### No license declared (1)

- buffers 0.1.1

### Unlicense (1)

- big-integer 1.6.52
